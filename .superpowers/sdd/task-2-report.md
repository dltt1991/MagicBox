# Task 2: DataApi Persistence And Migrations

## Status

DONE_WITH_CONCERNS

## Implementation

- Added Drizzle schemas for `transcription_record`, `transcription_result`, and `transcription_prompt_template` in `src/main/data/db/schemas/transcription.ts`.
- Generated append-only migration `0017_thin_sue_storm.sql` with record creation/status indexes, template order index, and the result's unique cascading foreign key.
- Added `TranscriptionHistoryService` with record CRUD, transactional latest-result overwrite, prompt-template CRUD, and built-in template seeding.
- Seeded the four required built-in templates exactly as specified. Listing inserts only missing built-in IDs, so existing and custom rows remain durable.
- Replaced the Task 1 fail-closed DataApi handlers with strict schema parsing and service delegation. IpcApi transcription handlers were not changed.
- Added the four requested renderer hooks for record lists/details, templates, and result saves. Record collection updates reset cursor pages before revalidating; detail updates are narrowed to their record ID.
- No audio bytes are stored in SQLite. The record schema persists only `audioPath`, `audioManaged`, and audio metadata.

## Tests

- `pnpm test:main src/main/data/services/__tests__/TranscriptionHistoryService.test.ts` passed: 3 tests.
- `pnpm test:main src/main/data/api/handlers/__tests__/transcription.test.ts` passed: 2 tests.
- `pnpm typecheck` passed for node, web, and AI core projects.
- `pnpm db:migrations:check` passed.
- `pnpm exec vitest run src/renderer/hooks/transcription/__tests__/useTranscriptionRecords.test.ts` could not collect tests because this nested worktree resolves `@vitest/web-worker` through a missing path under the parent worktree's `node_modules`.
- `pnpm lint` could not start because the current `.oxlintrc.json` puts `options.typeAware` in a location the installed oxlint rejects. The command failed before linting, typechecking, i18n, or formatting.

## Self-Review

Reviewed the final local diff against the repository DataApi, migration, service ownership, renderer hook, and naming guidance. No remaining implementation findings were identified.

The review corrected two issues before final verification:

- detail-route data-change subscriptions now include the active record ID;
- collection refresh resets cursor pagination before revalidation.

## Contract Changes

None. Task 1 shared DataApi and IpcApi contracts remain unchanged. The service adds an internal `updateResultText()` method solely to implement the pre-existing result `PATCH` endpoint without placing merge logic in the handler.

## Concerns

- Renderer test execution is blocked by the known nested-worktree `@vitest/web-worker` path issue.
- Full lint execution is blocked by the existing oxlint configuration parse error.
- The environment uses Node `25.8.0`, while this repository pins `>=24.11.1 <24.16.0`; all successful checks emitted the corresponding engine warning.

## Critical Review Fix

### Root Cause

`saveResult()` used the complete `SaveTranscriptionResultDto` for both inserts and existing-result updates. A re-organization request can contain the transcript snapshot used for generation, so that stale snapshot replaced text and segments previously changed through the explicit edit path.

### Fix

- New result rows still insert transcript text, serialized segments, and organization fields.
- Existing result rows now update only `organizationTemplateId`, `organizationPromptSnapshot`, and `organizationOutput`; Drizzle's timestamp hook updates `updatedAt`.
- `updateResultText()` remains the only service method that changes transcript text or segments.

### Regression Test And Verification

- Added a regression test that creates a result, explicitly edits its transcript and segments, then saves a stale transcript with a new organization result. It asserts that the edited transcript and segments remain while organization fields update.
- The test failed before the service change because the stale values replaced the edited values.
- `pnpm test:main src/main/data/services/__tests__/TranscriptionHistoryService.test.ts` passed: 3 tests.
- `pnpm test:main src/main/data/api/handlers/__tests__/transcription.test.ts` passed: 2 tests.
- `pnpm typecheck` passed.
- `git diff --check` passed.
