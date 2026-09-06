# Final Review Fix Report

## Changes

- Loaded downloaded Whisper q8 ONNX weights with `dtype: 'q8'`, reloaded the local pipeline when the hardware profile changes, and raced local model load/inference against cancellation while preserving safe delayed disposal.
- Switched transcription service ownership to the shared Whisper runtime so model removal/unload and service use the same pipeline instance.
- Replaced transcript text and segments on retranscription, while organization updates now touch only organization fields.
- Added managed draft recording discard/adoption and releaseable playback URL leases for both history and previews.
- Added migration for legacy default sidebar favorites to insert Transcription after Translate without overriding deliberate custom orders.
- Added transcription-specific online model preference and a speech-to-text filtered model selector.
- Added history load-more UI and translated backend fallback labels.
- Added a durable one-time marker for the transcription sidebar migration so later user customization is not reverted.
- Claimed managed recordings at transcription-job start; renderer discard no longer deletes in-flight jobs, and main explicitly adopts on success or deletes on failure/cancel.
- Moved the transcription sidebar migration marker from renderer cache to the main-owned `app_state` table, with preference and marker writes in one DB transaction.
- Persisted newly created transcription records and results in one DB transaction, so result-write failure rolls back the ready record before claimed audio cleanup.
- Moved sidebar favorite reconciliation into `PreferenceService.onInit()` and removed the renderer-triggered IPC route.
- Changed failed/canceled managed recording jobs to release the claim back to draft ownership; if the renderer discarded the draft while the job was claimed, the release deletes it.
- Moved managed audio deletion behind main-owned record deletion so a failed DB delete does not orphan a surviving row without audio.
- Reset the persisted transcript editor by record id to prevent unsaved draft text leaking between records with identical transcript text.
- Ran local Whisper inference inside the existing inference worker and added `terminateOnAbort` so cancellation terminates the worker instead of only rejecting the caller.
- Pinned Whisper downloads to HuggingFace commit `36050c46d777d46dc4b5f43f6d90574fc38f8732` and added optional SHA256 verification support for catalog entries. Artifact hashes were not added because current local network access to HuggingFace returned empty/failed responses, so they could not be verified safely.
- Removed the custom endpoint option from the transcription page until a product-owned credential/configuration UI exists; online transcription now uses the existing provider model selector.
- Split Whisper download revisions by source: HuggingFace remains pinned to commit `36050c46d777d46dc4b5f43f6d90574fc38f8732`, while ModelScope uses `master`, the revision that returned a valid `config.json` response from ModelScope during verification.
- Removed the custom endpoint backend from shared types, IPC schemas, renderer preferences, i18n labels, and main-process implementation so local audio is no longer sent to arbitrary user-entered URLs.
- Narrowed the transcription DataApi record endpoints to read-only record access; record create/update/delete now stay behind `TranscriptionService`.
- Added staged managed-audio deletion so failed record deletion rolls the audio file back instead of leaving a database row pointing to a missing file.
- Added `TranscriptionHistoryService.updateRecordWithResult()` so retranscription metadata and result replacement commit atomically.
- Registered `LocalWhisperRuntime` as an injectable lifecycle service and resolved it through `application.get('LocalWhisperRuntime')`.
- Moved renderer transcription hooks/pages under `src/renderer/features/transcription/` and exported the page through a feature barrel.
- Removed the schema-only local model IPC test.
- Removed full-result `PUT /transcription/records/:id/result` from DataApi schema, handler, and renderer hook; renderer transcript editing now uses only the text-edit `PATCH` route.

## Verification

- `pnpm format`: PASS.
- `pnpm typecheck:node`: PASS.
- `pnpm typecheck:web`: PASS.
- `pnpm typecheck:node && pnpm typecheck:web`: PASS.
- `pnpm test:main src/main/services/transcription/__tests__/LocalWhisperRuntime.test.ts src/main/services/transcription/__tests__/TranscriptionService.test.ts`: PASS, 2 files / 17 tests.
- `pnpm test:main src/main/services/transcription/__tests__/TranscriptionService.test.ts src/main/services/transcription/__tests__/TranscriptionAudioStore.test.ts`: PASS, 2 files / 24 tests.
- `pnpm test:main src/main/ipc/handlers/__tests__/transcription.test.ts src/main/data/services/__tests__/TranscriptionHistoryService.test.ts src/main/services/transcription/__tests__/TranscriptionService.test.ts src/main/services/transcription/__tests__/TranscriptionAudioStore.test.ts`: PASS, 4 files / 41 tests.
- `pnpm test:main src/main/services/transcription/__tests__/LocalWhisperRuntime.test.ts src/main/services/transcription/__tests__/TranscriptionService.test.ts src/main/data/services/__tests__/TranscriptionHistoryService.test.ts src/main/ipc/handlers/__tests__/transcription.test.ts src/main/services/transcription/__tests__/TranscriptionAudioStore.test.ts src/main/services/transcription/__tests__/TranscriptionOrganizer.test.ts src/main/services/transcription/__tests__/TranscriptionWorkflow.integration.test.ts src/main/services/localModel/__tests__/LocalWhisperDownloadService.test.ts`: PASS, 8 files / 51 tests.
- `pnpm test:main src/main/ai/inference/__tests__/InferenceServiceBase.test.ts src/main/ai/inference/__tests__/modelSource.test.ts src/main/services/localModel/__tests__/LocalWhisperDownloadService.test.ts src/main/services/transcription/__tests__/LocalWhisperRuntime.test.ts src/main/services/transcription/__tests__/TranscriptionService.test.ts src/main/services/transcription/__tests__/TranscriptionAudioStore.test.ts src/main/ipc/handlers/__tests__/transcription.test.ts src/main/data/services/__tests__/TranscriptionHistoryService.test.ts src/main/services/transcription/__tests__/TranscriptionOrganizer.test.ts src/main/services/transcription/__tests__/TranscriptionWorkflow.integration.test.ts`: PASS, 10 files / 83 tests.
- `pnpm test:main src/main/data/api/handlers/__tests__/transcription.test.ts src/main/data/services/__tests__/TranscriptionHistoryService.test.ts src/main/services/transcription/__tests__/TranscriptionService.test.ts src/main/services/transcription/__tests__/TranscriptionAudioStore.test.ts src/main/services/localModel/__tests__/LocalWhisperDownloadService.test.ts src/main/services/transcription/__tests__/LocalWhisperRuntime.test.ts src/main/services/transcription/__tests__/TranscriptionWorkflow.integration.test.ts src/main/ai/inference/__tests__/InferenceServiceBase.test.ts src/main/ai/inference/__tests__/modelSource.test.ts`: PASS, 9 files / 77 tests.
- `pnpm test:main src/main/data/api/handlers/__tests__/transcription.test.ts src/main/data/services/__tests__/TranscriptionHistoryService.test.ts src/main/services/transcription/__tests__/TranscriptionService.test.ts src/main/services/transcription/__tests__/TranscriptionAudioStore.test.ts`: PASS, 4 files / 36 tests after removing full-result DataApi PUT.
- `pnpm exec vitest run --project shared src/shared/data/api/schemas/__tests__/transcription.test.ts`: PASS, 1 file / 4 tests.
- `pnpm exec vitest run src/renderer/features/transcription/pages/__tests__/TranscriptionPage.test.tsx src/renderer/features/transcription/pages/components/__tests__/TranscriptEditor.test.tsx src/renderer/features/transcription/pages/components/__tests__/TranscriptionHistorySidebar.test.tsx src/renderer/features/transcription/pages/hooks/__tests__/useAudioPlaybackUrl.test.ts src/renderer/features/transcription/pages/hooks/__tests__/useTranscriptionDraft.test.ts src/renderer/features/transcription/hooks/__tests__/useTranscriptionRecords.test.ts src/renderer/utils/__tests__/sidebar.test.ts`: blocked before collection by the existing Vitest `@vitest/web-worker` loader failure.
- `git diff --check`: PASS.
- `pnpm lint`: blocked before linting by the existing Oxlint `options.typeAware` root-config error.
- `pnpm test:lint`: blocked before linting by the existing Oxlint `options.typeAware` root-config error.
- `pnpm docs:check`: FAIL on 73 pre-existing broken markdown links across README/docs; the new `app-state-overview.md` row did not add a markdown link.

## Remaining Environment Blockers

- Commands report Node `25.8.0`, outside the pinned `>=24.11.1 <24.16.0` range.
- `pnpm lint` / `pnpm test:lint` remain blocked before linting by the repo Oxlint `options.typeAware` root-config error recorded in task reports.
- Manual Electron verification remains blocked by `pnpm debug` exiting with `Error: Electron uninstall`.
