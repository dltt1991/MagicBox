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

## Verification

- `pnpm format`: PASS.
- `pnpm typecheck:node`: PASS.
- `pnpm typecheck:web`: PASS.
- `pnpm test:main src/main/services/transcription/__tests__/LocalWhisperRuntime.test.ts src/main/services/transcription/__tests__/TranscriptionService.test.ts`: PASS, 2 files / 17 tests.
- `pnpm test:main src/main/services/transcription/__tests__/TranscriptionService.test.ts src/main/services/transcription/__tests__/TranscriptionAudioStore.test.ts`: PASS, 2 files / 24 tests.
- `pnpm test:main src/main/ipc/handlers/__tests__/transcription.test.ts src/main/data/services/__tests__/TranscriptionHistoryService.test.ts src/main/services/transcription/__tests__/TranscriptionService.test.ts src/main/services/transcription/__tests__/TranscriptionAudioStore.test.ts`: PASS, 4 files / 41 tests.
- `pnpm test:main src/main/services/transcription/__tests__/LocalWhisperRuntime.test.ts src/main/services/transcription/__tests__/TranscriptionService.test.ts src/main/data/services/__tests__/TranscriptionHistoryService.test.ts src/main/ipc/handlers/__tests__/transcription.test.ts src/main/services/transcription/__tests__/TranscriptionAudioStore.test.ts src/main/services/transcription/__tests__/TranscriptionOrganizer.test.ts src/main/services/transcription/__tests__/TranscriptionWorkflow.integration.test.ts src/main/services/localModel/__tests__/LocalWhisperDownloadService.test.ts`: PASS, 8 files / 51 tests.
- `pnpm test:main src/main/services/transcription/__tests__/LocalWhisperRuntime.test.ts src/main/services/transcription/__tests__/TranscriptionService.test.ts src/main/data/services/__tests__/TranscriptionHistoryService.test.ts src/main/ipc/handlers/__tests__/transcription.test.ts src/main/services/transcription/__tests__/TranscriptionAudioStore.test.ts src/main/services/transcription/__tests__/TranscriptionOrganizer.test.ts src/main/services/transcription/__tests__/TranscriptionWorkflow.integration.test.ts src/main/services/localModel/__tests__/LocalWhisperDownloadService.test.ts`: PASS, 8 files / 53 tests.
- `pnpm exec vitest run --project shared src/shared/data/api/schemas/__tests__/transcription.test.ts`: PASS, 1 file / 4 tests.
- `pnpm exec vitest run src/shared/ipc/schemas/__tests__/transcription.test.ts src/renderer/pages/transcription/__tests__/TranscriptionPage.test.tsx src/renderer/pages/transcription/components/__tests__/TranscriptionHistorySidebar.test.tsx src/renderer/pages/transcription/hooks/__tests__/useAudioPlaybackUrl.test.ts src/renderer/pages/transcription/hooks/__tests__/useTranscriptionDraft.test.ts src/renderer/utils/__tests__/sidebar.test.ts src/renderer/hooks/__tests__/useSidebarFavorites.test.ts`: blocked before collection by the existing Vitest `@vitest/web-worker` loader failure.
- `git diff --check`: PASS.
- `pnpm docs:check`: FAIL on 73 pre-existing broken markdown links across README/docs; the new `app-state-overview.md` row did not add a markdown link.

## Remaining Environment Blockers

- Commands report Node `25.8.0`, outside the pinned `>=24.11.1 <24.16.0` range.
- `pnpm lint` / `pnpm test:lint` remain blocked before linting by the repo Oxlint `options.typeAware` root-config error recorded in task reports.
- Manual Electron verification remains blocked by `pnpm debug` exiting with `Error: Electron uninstall`.
