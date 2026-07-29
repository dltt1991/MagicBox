# Task 1 Report: Sidebar Entry And Route

## Implementation

- Registered the `terminal` sidebar app at `/app/terminal`.
- Added terminal to the sidebar favorite type, canonical order, icon registry, label maps, and new-profile default favorites.
- Added the generated TanStack route-tree entry for `/app/terminal`.
- Added the placeholder `TerminalPage` using the shared `EmptyState` component and `terminal.title` translation.
- Added English and Simplified Chinese translations for `terminal.title` and `title.terminal`.
- Added focused sidebar, route-title, preference-default, and page rendering tests.
- Updated the exhaustive launchpad icon background map and its translation test fixture for the new sidebar app.

## TDD Evidence

1. Added failing sidebar/title and preference assertions first.
2. Confirmed the focused baseline command failed because `terminal` was not registered and the default preference lacked the terminal item.
3. Implemented the minimum route, sidebar, preference, i18n, and page changes.
4. Confirmed the focused suite passed.

## Verification

- Focused feature and launchpad tests: 4 files, 55 tests passed.
- `pnpm lint`: passed with 0 errors; repository emitted 41 pre-existing warnings.
- `pnpm format`: passed; no fixes required.
- `pnpm i18n:check`: passed as part of `pnpm lint`.
- `pnpm test`: 1,582 files passed, 19,315 tests passed, 65 skipped. The command exited non-zero because of unrelated existing/environment failures:
  - Electron could not load because its package was not installed correctly, affecting PKCE OAuth, CacheService, and PreferenceService tests.
  - Three existing EditDialogs tests failed.
  - One existing ReadableContentService integration test timed out.
- `pnpm build:check` was started but stopped after the already-recorded full-suite result to avoid repeating the same long failing suite; it did not complete.

## Commit

Created with the requested signed-off command:

`feat(terminal): add sidebar entry`

## Review Fix

- Added `{ "id": "terminal", "type": "app" }` to the `ui.sidebar.favorites` new-profile default in `v2-refactor-temp/tools/data-classify/data/target-key-definitions.json`.
- Ran `cd v2-refactor-temp/tools/data-classify && npm run generate` successfully. The generator rewrote unrelated generated files with timestamp/formatting churn; those generated-only changes were restored before commit. `preferenceSchemas.ts` already contains the matching terminal default.
- Focused tests: `pnpm vitest run src/shared/data/preference/__tests__/preferenceSchemas.test.ts src/renderer/utils/__tests__/sidebar.test.ts` — 2 files passed, 37 tests passed.
- Test environment warning: Node `v25.8.0` is outside the repository's declared `>=24.11.1 <24.16.0` range.
