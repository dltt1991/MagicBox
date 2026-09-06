# Transcription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sidebar transcription workspace below Translate that records or imports audio, transcribes through local Whisper or online services, stores searchable history without audio blobs, supports playback, timestamp segment seeking, built-in organization templates, and custom prompts.

**Architecture:** Durable history and prompt templates use SQLite-backed DataApi. Recording target creation, audio playback URL resolution, local Whisper inference, online transcription calls, cancellation, and organization are command-style capabilities exposed through IpcApi and owned by a main-process `TranscriptionService`. The renderer never receives API secrets, model paths, or raw absolute filesystem URLs unless an existing safe facade already permits that path.

**Tech Stack:** Electron main/renderer, TanStack Router, React, `@cherrystudio/ui`, Tailwind CSS, Drizzle SQLite, DataApi, IpcApi, existing local-model download services, `onnxruntime-node`, existing `ai` package `experimental_transcribe`, existing `AiService.generateText`.

## Global Constraints

- [ ] Before editing each directory, read its local `README.md` and any parent README that applies.
- [ ] Use i18n keys for every user-visible renderer string; edit `src/renderer/i18n/locales/en-us.json`, run `pnpm i18n:sync`, then translate generated locale values.
- [ ] Use `application.getPath()` for all main-process filesystem locations. Add path keys in `src/main/core/paths/pathRegistry.ts`; do not call `app.getPath()`, `os.homedir()`, or build user-data paths ad hoc.
- [ ] Use `loggerService.withContext(...)`; do not add `console.log`.
- [ ] Add SQLite schema changes through Drizzle schema files and generated append-only migrations. Do not rewrite existing migrations.
- [ ] Keep `TranscriptionService` as the owner of request cancellation and long-lived local runtime state. Keep `TranscriptionHistoryService` as a DataApi singleton.
- [ ] Persist paths and metadata only. Never store audio bytes in SQLite.
- [ ] Redact custom endpoint API keys and request bodies from logs and errors.
- [ ] Commit after each completed task with `git commit -S --signoff`.

## Task 1: Shared Contracts And Sidebar Entry

Purpose: create the typed vocabulary that later tasks use, and wire the app shell entry without a working page backend yet.

- [ ] Add transcription entity schemas and DTOs in `src/shared/data/types/transcription.ts` and `src/shared/data/api/schemas/transcription.ts`.
  - Entities: `TranscriptionRecord`, `TranscriptionResult`, `TranscriptionPromptTemplate`.
  - Segment schema: `{ startMs: z.number().int().nonnegative(), endMs: z.number().int().nonnegative(), text: z.string().min(1) }`.
  - Enums: source type `recording | file`, backend `local_whisper | provider_model | custom_endpoint`, status `ready | transcribing | failed | canceled`.
  - DTOs: list records query, create/update/delete record, create/update/delete prompt template, update transcript text, save organization result.
- [ ] Compose `TranscriptionSchemas` into `src/shared/data/api/schemas/apiSchemas.ts`.
- [ ] Add IpcApi contracts in `src/shared/ipc/schemas/transcription.ts`.
  - Requests: `transcription.recording.create`, `transcription.audio_url.resolve`, `transcription.transcribe`, `transcription.cancel`, `transcription.organize`.
  - Event: `transcription.progress` with `{ jobId, stage, percent?, messageKey?, recordId? }`.
- [ ] Register the IpcApi schema in `src/shared/ipc/schemas/ipcSchemas.ts`.
- [ ] Add sidebar id `transcription`.
  - `src/shared/data/preference/preferenceTypes.ts`: insert after `translate` in `SIDEBAR_FAVORITES`.
  - `src/shared/data/preference/preferenceSchemas.ts`: insert `{ id: 'transcription', type: 'app' }` after Translate in the default `ui.sidebar.favorites`.
  - `src/renderer/utils/sidebar.ts`: add `routePrefix: '/app/transcription'` after Translate.
  - `src/renderer/components/layout/tabIcons.ts`: use lucide `Mic`.
  - `src/renderer/utils/routeTitle.ts` and `src/renderer/i18n/label.ts`: add label mappings.
  - `src/renderer/routes/app/transcription.tsx`: create the route pointing to `TranscriptionPage`.
  - `src/renderer/pages/transcription/TranscriptionPage.tsx`: add a minimal shell that renders translated headings and disabled controls.
- [ ] Tests first:
  - `src/shared/data/api/schemas/__tests__/transcription.test.ts`: strict DTO validation and segment time validation.
  - `src/renderer/utils/__tests__/sidebar.test.ts`: Transcription follows Translate in the default app order.
  - `src/renderer/utils/__tests__/routeTitle.test.ts`: `/app/transcription` resolves to the new title key.
  - `src/renderer/components/layout/__tests__/tabIcons.test.ts`: route maps to the mic icon.
- [ ] Verify:
  - `pnpm exec vitest run src/shared/data/api/schemas/__tests__/transcription.test.ts src/renderer/utils/__tests__/sidebar.test.ts src/renderer/utils/__tests__/routeTitle.test.ts src/renderer/components/layout/__tests__/tabIcons.test.ts`
  - `pnpm lint`
- [ ] Commit: `feat(transcription): add shared contracts and sidebar entry`

## Task 2: DataApi Persistence And Migrations

Purpose: persist records, latest result, and prompt templates without audio blobs.

- [ ] Add Drizzle tables in `src/main/data/db/schemas/transcription.ts`.
  - `transcription_record`: id, title, sourceType, audioPath, audioManaged, durationMs, language, backend, providerId, modelId, status, errorSummary, timestamps.
  - `transcription_result`: id, recordId unique FK cascade, transcriptText, segmentsJson, organizationTemplateId, organizationPromptSnapshot, organizationOutput, timestamps.
  - `transcription_prompt_template`: id, name, prompt, builtIn, isDefault, orderKey, timestamps.
  - Indexes: record createdAt, record status+createdAt, template orderKey.
- [ ] Export the schema from the DB schema aggregator if one exists in `src/main/data/db/schemas/`.
- [ ] Generate an append-only migration with `pnpm db:migrations:generate`.
- [ ] Add `src/main/data/services/TranscriptionHistoryService.ts`.
  - `listRecords(query)`, `getRecord(id)`, `createRecord(input)`, `updateRecord(id, input)`, `deleteRecord(id)`.
  - `saveResult(recordId, resultInput)` overwrites the one latest result in one synchronous write transaction.
  - `listPromptTemplates()`, `createPromptTemplate(input)`, `updatePromptTemplate(id, input)`, `deletePromptTemplate(id)`.
  - Seed built-in templates from service code when listing if DB rows do not exist; custom rows remain durable.
- [ ] Add DataApi handler `src/main/data/api/handlers/transcription.ts` and spread it into `src/main/data/api/handlers/apiHandlers.ts`.
- [ ] Add renderer hooks in `src/renderer/hooks/transcription/`.
  - `useTranscriptionRecords.ts`
  - `useTranscriptionRecord.ts`
  - `useTranscriptionPromptTemplates.ts`
  - `useSaveTranscriptionResult.ts`
- [ ] Tests first:
  - `src/main/data/services/__tests__/TranscriptionHistoryService.test.ts`: create/list/get/update/delete, no audio blob fields, result overwrite, built-in templates plus custom templates.
  - `src/main/data/api/handlers/__tests__/transcription.test.ts`: handler parses strict inputs and delegates.
  - `src/renderer/hooks/transcription/__tests__/useTranscriptionRecords.test.ts`: hook uses correct endpoint and refresh behavior.
- [ ] Verify:
  - `pnpm test:main src/main/data/services/__tests__/TranscriptionHistoryService.test.ts`
  - `pnpm test:main src/main/data/api/handlers/__tests__/transcription.test.ts`
  - `pnpm exec vitest run src/renderer/hooks/transcription/__tests__/useTranscriptionRecords.test.ts`
  - `pnpm db:migrations:check`
  - `pnpm lint`
- [ ] Commit: `feat(transcription): persist history and prompts`

## Task 3: Managed Audio Paths And Safe Playback URLs

Purpose: let recordings play from history while keeping filesystem access centralized and safe.

- [ ] Add path keys in `src/main/core/paths/pathRegistry.ts`.
  - `feature.transcription.recordings`: `{userData}/Data/Transcription/Recordings`
  - `feature.transcription.temp`: app temp transcription workspace
  - `feature.transcription.whisper`: `{userData}/Runtime/models/whisper`
- [ ] Add path registry tests in `src/main/core/paths/__tests__/pathRegistry.test.ts`.
- [ ] Extend `src/main/services/mediaProtocol/types.ts`, `registerSchemes.ts`, and `MediaProtocolService.ts` for audio playback if Electron range requests require `stream`.
  - Add `MediaKind.Audio`.
  - Add a file-backed owned entry path for audio playback instead of loading long audio into memory.
  - Support HTTP range responses for `<audio>` seeking.
  - Preserve existing image in-memory behavior and lifetime contract.
- [ ] Add `TranscriptionAudioStore` helpers under `src/main/services/transcription/`.
  - `reserveRecordingTarget()` returns `{ recordingId, filePath, suggestedName }` under `feature.transcription.recordings`.
  - `resolveAudioUrl(record)` returns a safe `cherry-media://audio/<id>` URL when the file exists.
  - Imported files are read-only references and are never deleted by cleanup.
  - Deleting an app-managed recording supports an explicit `deleteAudio: true` flag.
- [ ] Add handlers for `transcription.recording.create` and `transcription.audio_url.resolve` in `src/main/ipc/handlers/transcription.ts`; register in `ipcHandlers.ts`.
- [ ] Tests first:
  - `src/main/core/paths/__tests__/pathRegistry.test.ts`: new keys exist and auto-ensure as directories.
  - `src/main/services/transcription/__tests__/TranscriptionAudioStore.test.ts`: managed vs imported path policy, missing external file returns no playback URL.
  - `src/main/services/mediaProtocol/__tests__/MediaProtocolService.audio.test.ts`: range request returns partial content and does not expose paths.
  - `src/main/ipc/handlers/__tests__/transcription.test.ts`: recording and audio URL handlers delegate.
- [ ] Verify:
  - `pnpm test:main src/main/core/paths/__tests__/pathRegistry.test.ts src/main/services/transcription/__tests__/TranscriptionAudioStore.test.ts src/main/services/mediaProtocol/__tests__/MediaProtocolService.audio.test.ts src/main/ipc/handlers/__tests__/transcription.test.ts`
  - `pnpm lint`
- [ ] Commit: `feat(transcription): add managed audio playback`

## Task 4: Local Whisper Download Support

Purpose: add Whisper to the existing local-model lifecycle before inference uses it.

- [ ] Extend shared local model vocabulary.
  - `src/shared/data/presets/localModel.ts`: add `whisper` to `LOCAL_MODEL_KINDS`.
  - `src/shared/ipc/schemas/localModel.ts`: existing parameterized routes now accept `whisper`.
- [ ] Extend model catalog in `src/main/ai/inference/localModelCatalog.ts`.
  - Add `LOCAL_MODELS.whisper` with ONNX Whisper repo metadata, ready-file list, min byte sizes, and relative progress weights.
  - Use a small first version model such as `onnx-community/whisper-small` or another ONNX Whisper repo verified by the implementation spike against the current `@huggingface/transformers` and `onnxruntime-node` pins.
- [ ] Add `src/main/services/localModel/LocalWhisperDownloadService.ts`.
  - Subclass `LocalModelDownloadService`.
  - Reuse `onnxRuntimeBinaryService.ensure`.
  - Download through existing mirror helpers and temp-file rename pattern.
  - Probe ready state from `feature.transcription.whisper`.
  - Remove weights and call the Whisper runtime unload method before deletion.
- [ ] Update `src/main/services/localModel/index.ts` and `src/main/ipc/handlers/localModel.ts`.
  - `serviceFor('whisper')` dispatches to `localWhisperDownloadService`.
  - `siblingFor` becomes `otherReadyLocalModels(model)` so shared onnxruntime removal checks embedding, OCR, and Whisper.
- [ ] Add a settings/download surface entry where local model cards already live; label it as Whisper for Transcription and reuse existing local model progress UI.
- [ ] Tests first:
  - `src/shared/ipc/schemas/__tests__/localModel.test.ts`: `whisper` route input is accepted.
  - `src/main/ipc/handlers/__tests__/localModel.test.ts`: dispatches whisper to the new service and preserves shared runtime removal only when no other local model is ready.
  - `src/main/services/localModel/__tests__/LocalWhisperDownloadService.test.ts`: ready probe, incomplete cache, download progress, cancel, remove.
- [ ] Verify:
  - `pnpm test:main src/main/ipc/handlers/__tests__/localModel.test.ts src/main/services/localModel/__tests__/LocalWhisperDownloadService.test.ts`
  - `pnpm exec vitest run src/shared/ipc/schemas/__tests__/localModel.test.ts`
  - `pnpm lint`
- [ ] Commit: `feat(transcription): add local whisper model download`

## Task 5: Transcription Service And Backend Adapters

Purpose: implement the main-process transcription command surface with cancellation and unified output.

- [ ] Add `src/main/services/transcription/TranscriptionService.ts`.
  - `@Injectable('TranscriptionService')`, `@ServicePhase(Phase.WhenReady)`, extends `BaseService`.
  - Own a map of active `AbortController`s by `jobId`.
  - Broadcast progress through `application.get('IpcApiService').send(senderId, 'transcription.progress', ...)`.
  - Persist successful results via `transcriptionHistoryService`; do not persist canceled jobs as successful rows.
- [ ] Register `TranscriptionService` in `src/main/core/application/serviceRegistry.ts`.
- [ ] Add local backend files under `src/main/services/transcription/`.
  - `LocalWhisperRuntime.ts`: loads ONNX Whisper from `feature.transcription.whisper`, reads `feature.local_model.hardware_acceleration.enabled`, reports `accelerated | cpu`.
  - `audioPreprocess.ts`: converts source audio into the format the local runtime needs using an existing binary/tool if available in the repo; otherwise use Electron/Node-supported decode path selected during implementation.
  - `segmentMapper.ts`: normalizes local and online segments into `{ startMs, endMs, text }`.
- [ ] Add online backend files under `src/main/services/transcription/`.
  - `ProviderTranscriptionBackend.ts`: resolves configured provider/model and calls `experimental_transcribe`.
  - `CustomEndpointTranscriptionBackend.ts`: posts multipart/form-data or JSON according to the stored endpoint format; redacts key and request body on errors.
- [ ] Add custom endpoint preference or table storage.
  - Use Preference if there is exactly one global custom endpoint config.
  - Use DataApi table only if the UI allows multiple named endpoint configs in this first implementation.
- [ ] Add organization helper `TranscriptionOrganizer.ts`.
  - Render variables `{{transcript}}`, `{{segments}}`, `{{language}}`, `{{duration}}`.
  - Call `application.get('AiService').generateText` with selected chat model or current default chat model.
  - Save prompt snapshot and organization output through the history service.
- [ ] Wire IpcApi handlers in `src/main/ipc/handlers/transcription.ts`.
  - `transcription.transcribe`
  - `transcription.cancel`
  - `transcription.organize`
- [ ] Tests first:
  - `src/main/services/transcription/__tests__/TranscriptionService.test.ts`: backend selection, progress send, persistence on success, no success persistence on cancel.
  - `src/main/services/transcription/__tests__/LocalWhisperRuntime.test.ts`: ready-required error, CPU fallback status, acceleration preference read.
  - `src/main/services/transcription/__tests__/ProviderTranscriptionBackend.test.ts`: calls `experimental_transcribe` with audio bytes and maps segments.
  - `src/main/services/transcription/__tests__/CustomEndpointTranscriptionBackend.test.ts`: redacts key/body and maps OpenAI-compatible JSON.
  - `src/main/services/transcription/__tests__/TranscriptionOrganizer.test.ts`: variable rendering, custom prompt support, prompt snapshot persistence.
  - `src/main/ipc/handlers/__tests__/transcription.test.ts`: transcribe/cancel/organize delegate with sender checks.
- [ ] Verify:
  - `pnpm test:main src/main/services/transcription/__tests__/TranscriptionService.test.ts src/main/services/transcription/__tests__/LocalWhisperRuntime.test.ts src/main/services/transcription/__tests__/ProviderTranscriptionBackend.test.ts src/main/services/transcription/__tests__/CustomEndpointTranscriptionBackend.test.ts src/main/services/transcription/__tests__/TranscriptionOrganizer.test.ts src/main/ipc/handlers/__tests__/transcription.test.ts`
  - `pnpm lint`
- [ ] Commit: `feat(transcription): implement transcription service`

## Task 6: Renderer Workspace

Purpose: build the working page with recording/import, playback, transcript editing, organization, and page-local history.

- [ ] Read `DESIGN.md` and follow the app's existing page density and component conventions.
- [ ] Build `src/renderer/pages/transcription/TranscriptionPage.tsx` as a usable workspace.
  - Top toolbar: source mode, backend mode, language select, model status.
  - Audio panel: record controls, import picker/drop zone, playback element, missing-audio state.
  - Transcript panel: editable full transcript, timestamped segment list, copy/export actions.
  - Organization panel: template selector, custom prompt editor, organize/retry/copy/export actions.
  - Right page-local history sidebar: list records, open record, delete record with optional app-recording cleanup.
- [ ] Add focused components under `src/renderer/pages/transcription/components/`.
  - `TranscriptionToolbar.tsx`
  - `AudioSourcePanel.tsx`
  - `TranscriptEditor.tsx`
  - `OrganizationPanel.tsx`
  - `TranscriptionHistorySidebar.tsx`
  - `CustomPromptDialog.tsx`
- [ ] Add hooks under `src/renderer/pages/transcription/hooks/`.
  - `useAudioRecorder.ts`: uses browser `MediaRecorder`, requests a reserved target through IpcApi, writes or hands the recorded Blob to main through the chosen existing safe file mechanism.
  - `useTranscriptionJob.ts`: starts/cancels jobs and subscribes to `transcription.progress`.
  - `useAudioPlaybackUrl.ts`: resolves safe audio URL for selected history.
  - `useSegmentSeek.ts`: seeks `<audio>` to segment `startMs`.
- [ ] Add locale keys for all labels, statuses, buttons, errors, and template names.
- [ ] Tests first:
  - `src/renderer/pages/transcription/__tests__/TranscriptionPage.test.tsx`: page renders working controls and switches recording/file modes.
  - `src/renderer/pages/transcription/hooks/__tests__/useTranscriptionJob.test.ts`: progress subscription and cancel.
  - `src/renderer/pages/transcription/components/__tests__/TranscriptEditor.test.tsx`: clicking a segment seeks audio.
  - `src/renderer/pages/transcription/components/__tests__/TranscriptionHistorySidebar.test.tsx`: missing external audio disables playback while preserving transcript.
  - `src/renderer/pages/transcription/components/__tests__/OrganizationPanel.test.tsx`: built-in template and custom prompt flow.
- [ ] Verify:
  - `pnpm exec vitest run src/renderer/pages/transcription/__tests__/TranscriptionPage.test.tsx src/renderer/pages/transcription/hooks/__tests__/useTranscriptionJob.test.ts src/renderer/pages/transcription/components/__tests__/TranscriptEditor.test.tsx src/renderer/pages/transcription/components/__tests__/TranscriptionHistorySidebar.test.tsx src/renderer/pages/transcription/components/__tests__/OrganizationPanel.test.tsx`
  - `pnpm lint`
- [ ] Commit: `feat(transcription): add transcription workspace`

## Task 7: End-To-End Verification And Polish

Purpose: prove the full workflow behaves as requested and clean up only issues introduced by this feature.

- [ ] Add an integration-style test with mocked transcription and organization backends.
  - Use a recorded/imported audio fixture reference.
  - Return two timestamped segments.
  - Save a transcript and organization output.
  - Reload the record and verify playback URL resolution plus latest result restore.
- [ ] Add or update a renderer interaction test for the sidebar default order: Translate immediately followed by Transcription.
- [ ] Run focused tests for every changed area:
  - `pnpm test:main src/main/services/transcription/__tests__/TranscriptionService.test.ts src/main/data/services/__tests__/TranscriptionHistoryService.test.ts`
  - `pnpm test:main src/main/ipc/handlers/__tests__/transcription.test.ts`
  - `pnpm exec vitest run src/shared/data/api/schemas/__tests__/transcription.test.ts src/renderer/pages/transcription/__tests__/TranscriptionPage.test.tsx`
- [ ] Run broad gates:
  - `pnpm db:migrations:check`
  - `pnpm lint`
  - `pnpm test:lint`
- [ ] Manual verification:
  - Record audio, stop, transcribe locally, play back, click a segment to seek.
  - Import an external audio file, transcribe online, organize with a built-in template, reopen from history.
  - Create a custom prompt and organize the same transcript.
  - Delete a history record for an app-managed recording and verify the optional file deletion path.
  - Move/delete an imported external file and verify transcript remains with playback disabled.
- [ ] Commit: `test(transcription): cover full transcription workflow`

## Implementation Notes

- Local Whisper should start with one supported downloadable model. Add more model sizes only after the first model is working through the same local-model card path.
- `MediaProtocolService` currently serves in-memory images and documents that audio/video streaming was intentionally deferred. Implement audio range support in the smallest compatible shape and preserve image behavior.
- The renderer should treat imported audio paths as opaque after selection. Store and resolve them through main.
- Organization prompt snapshots are part of history explainability; update template rows freely, but save the exact prompt used for each organization result.
- If `pnpm docs:check` is run during this plan, it may still report pre-existing broken docs links unrelated to transcription. Do not fix unrelated docs in this feature branch.

## Handoff

Use one of these execution modes:

1. **Subagent-Driven Execution**: best for parallelizing DataApi, local-model, service, and renderer tasks. Each subagent receives one task section and commits only its scoped changes.
2. **Inline Execution**: best when one engineer wants tight control over sequencing, especially if local Whisper runtime details require iteration.
