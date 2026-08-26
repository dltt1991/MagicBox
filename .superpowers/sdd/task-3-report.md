# Task 3: Managed Audio Paths And Safe Playback URLs

## Status

DONE_WITH_CONCERNS

## Implementation

- Registered `feature.transcription.recordings`, `feature.transcription.temp`, and `feature.transcription.whisper` under the required managed user-data and application-temp roots. All are auto-ensured directories.
- Added `TranscriptionAudioStore` to reserve UUIDv7 recording targets under the managed recordings directory, resolve records only to `cherry-media://audio/<record-id>`, and return `{ url: null, missing: true }` when a referenced file is absent.
- Kept imported files as read-only references. Audio cleanup removes a managed file only when `deleteAudio: true` is supplied, and additionally refuses a managed path outside the recordings root.
- Extended `MediaProtocolService` with `MediaKind.Audio` and a file-backed audio entry. It uses `createReadStream` and responds to a single HTTP byte range with `206`, `Content-Range`, `Content-Length`, and `Accept-Ranges`; audio bytes are never loaded into memory for playback.
- Enabled the custom scheme's `stream` privilege and updated its local service documentation without changing the existing in-memory image behavior or lifetime contract.
- Implemented only `transcription.recording.create` and `transcription.audio_url.resolve`. The resolver obtains the persisted record through `TranscriptionHistoryService`; a missing record retains that service's not-found behavior. Transcription, model, and organization handlers remain untouched.

## Tests

- The requested command passed: `pnpm test:main src/main/core/paths/__tests__/pathRegistry.test.ts src/main/services/transcription/__tests__/TranscriptionAudioStore.test.ts src/main/services/mediaProtocol/__tests__/MediaProtocolService.audio.test.ts src/main/ipc/handlers/__tests__/transcription.test.ts` — 4 files, 61 tests.
- Extended regression verification passed: the same command plus `src/main/services/mediaProtocol/__tests__/MediaProtocolService.test.ts` — 5 files, 65 tests.
- `pnpm typecheck:node` passed.
- `git diff --check` passed.

## Self-Review

Reviewed the final diff against the task requirements, paths and main-process architecture, IpcApi handler guidance, media protocol contract, and naming rules. No remaining implementation findings were identified. There is no GitHub PR for this branch, so CI status was unavailable for review.

The review corrected two issues before final verification:

- recording target IDs now use UUIDv7 to satisfy the persisted transcription record contract;
- cleanup now verifies that a managed path is inside the registered recordings root before deleting it.

## Concerns

- `pnpm lint` could not start because oxlint rejects the existing `.oxlintrc.json`: `options.typeAware` is only supported in the root config, but it is declared in `/Users/guotao/Work/code/MagicBox/.oxlintrc.json`. The command stopped before ESLint, typecheck, i18n, or formatting.
- The environment runs Node `25.8.0`; the repository pins `>=24.11.1 <24.16.0`. Successful checks emitted the corresponding engine warning.
