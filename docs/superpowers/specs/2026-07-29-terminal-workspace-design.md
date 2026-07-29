# Terminal Workspace Design

## Context

MagicBox needs a new primary sidebar entry, alongside Chat and Work, that opens a FanBox-like local workspace. The workspace combines a real system terminal, a filesystem browser, and an embedded file preview in one adjustable page.

FanBox is useful as a behavior reference, but its implementation is a compact Electron app built around `public/app.js`, `electron/main.js`, raw IPC channels, `node-pty`, and xterm.js. MagicBox already has stronger primitives for routing, sidebar favorites, file preview, directory trees, lifecycle services, and IpcApi, so the feature should adapt FanBox behavior rather than copy its structure.

## Goals

- Add a first-class `/app/terminal` route and a "Terminal" sidebar app next to existing primary entries.
- Open a page with filesystem navigation, file preview, and a real system terminal.
- Support multi-tab terminal sessions.
- Support right-docked, bottom-docked, terminal-maximized, and preview-maximized layouts.
- Let users select a workspace directory and browse it as a live tree.
- Keep file tree changes in sync with the filesystem.
- Let file selection update the preview.
- Let terminal output paths open/select the matching file where possible.
- Let dragging a file or folder into the terminal insert its shell-safe path.
- Persist workspace UI layout state across app restarts.

## Non-Goals

- Do not embed FanBox code directly.
- Do not replace the existing Files page. That page manages the app's file library; this feature browses arbitrary system workspaces.
- Do not add shell command mediation, AI command approval, or sandboxing in this iteration.
- Do not turn terminal sessions into persisted DB entities.
- Do not implement a full IDE editor; preview remains read-only unless an existing preview plugin already provides its own controls.

## Entry And Navigation

Add `terminal` as a built-in sidebar app:

- `src/renderer/utils/sidebar.ts`: add the app definition with `routePrefix: '/app/terminal'`.
- `src/renderer/components/app/sidebarIcons.tsx`: map it to lucide `Terminal`.
- `src/renderer/i18n/label.ts` and `src/renderer/utils/routeTitle.ts`: add title mappings.
- `src/renderer/routes/app/terminal.tsx`: create the route.
- `src/renderer/pages/terminal/TerminalPage.tsx`: host the page.

The route should participate in the existing tab model like other primary app pages.

Sidebar favorites are user-configurable. Updating the default preference only affects new profiles, so the implementation should make the new app discoverable without making it required. The preferred behavior is:

- New profiles include Terminal in the default sidebar favorites.
- Existing profiles can pin Terminal from Launchpad after the app is added to the canonical app list.
- If product requires it visible for all existing users, add a narrow one-time migration/normalizer that appends Terminal only when the user has not customized sidebar favorites since v2 migration. Do not silently override deliberate user sidebar ordering.

## Main Process Terminal Runtime

Add a lifecycle-managed `TerminalService` in the main process.

Responsibilities:

- Spawn a login shell with `node-pty`.
- Track sessions by generated ID.
- Maintain session metadata: ID, cwd, shell, pid, title/status, createdAt, updatedAt, exit state.
- Forward PTY data to renderer windows through IpcApi events.
- Accept input, resize, kill, and list requests.
- Clean up all sessions on service stop.

Session defaults:

- Shell: `process.env.SHELL` on macOS/Linux, PowerShell or default command shell on Windows.
- macOS/Linux args: login shell style where appropriate, matching FanBox's `['-l']` behavior.
- Environment: inherit process env, set `TERM=xterm-256color`, ensure UTF-8 locale fallback, and include MagicBox terminal marker variables if useful for debugging.
- CWD: selected workspace directory, falling back to `application.getPath('sys.home')`.

IPC routes:

- `terminal.session.create`
- `terminal.session.list`
- `terminal.session.input`
- `terminal.session.resize`
- `terminal.session.kill`

Events:

- `terminal.session.data`
- `terminal.session.exit`
- `terminal.session.updated`

All route schemas live in `src/shared/ipc/schemas/terminal.ts`; handlers live in `src/main/ipc/handlers/terminal.ts`; both are registered in the existing IpcApi aggregators.

## Filesystem Workspace

Reuse the existing directory-tree primitive:

- `window.api.tree.create`
- `window.api.tree.dispose`
- `window.api.tree.rename`
- `window.api.tree.onMutation`
- `useDirectoryTree`

This primitive already performs ripgrep-backed initial scans and chokidar-backed updates, which matches the live file tree requirement.

The terminal page should use a full workspace tree with these options:

- Include regular files and directories.
- Respect `.gitignore` by default.
- Hide dotfiles by default, with a UI toggle.
- Use bounded initial depth if needed for performance, and lazy-load/search deeper nodes by reusing existing list/search helpers where available.

Use existing file IPC/preload APIs for common operations:

- Open system dialog to choose a folder.
- Open path in the system default app.
- Show path in folder.
- Read metadata and previewable content through `FilePreview`.

Add new IpcApi file routes only when an operation cannot safely use the existing tree or file bridge. Keep those routes under a terminal/workspace-specific schema only if they are not generally reusable by the file module.

## Renderer Architecture

Create a new page domain under `src/renderer/pages/terminal/`.

Suggested component split:

- `TerminalPage.tsx`: route page and state composition.
- `TerminalWorkspaceLayout.tsx`: resizable pane layout and mode controls.
- `TerminalTabs.tsx`: terminal tab list and session actions.
- `TerminalPane.tsx`: xterm host for the active session.
- `WorkspaceFileTree.tsx`: projected directory tree.
- `WorkspacePreviewPane.tsx`: embedded `FilePreview` host.
- `terminalPathLinks.ts`: terminal-output path detection/link helpers.
- `terminalPathQuoting.ts`: shell-safe path insertion.

Use existing project patterns:

- Tailwind plus `@cherrystudio/ui`.
- Lucide icons for commands.
- Existing neutral visual design tokens from `DESIGN.md`.
- No page-local brand palette.
- No hardcoded user-facing copy; add `zh-cn` and `en-us` i18n keys.

Use `react-resizable-panels` for adjustable panes if it is already a dependency; otherwise add it with the terminal dependencies. Persist layout state with the app's cache/preference hooks. Since pane sizes and mode are UI affordances, `usePersistCache` is preferred unless product wants them synced as user settings.

## Terminal Renderer

Use xterm.js:

- `@xterm/xterm`
- `@xterm/addon-fit`
- `@xterm/addon-unicode11`
- `@xterm/addon-webgl`

Behavior:

- Create a terminal instance per active session tab.
- Fit on mount, pane resize, dock mode changes, and window resize.
- Send user input to `terminal.session.input`.
- Send dimensions to `terminal.session.resize`.
- Buffer incoming data until the terminal instance is ready.
- Dispose terminal instances cleanly on unmount/session close.
- Fall back gracefully if WebGL renderer cannot initialize.

Path interactions:

- Detect absolute local paths in terminal output.
- Resolve relative paths against the session cwd when reliable.
- Clicking a detected path selects it in the file tree and opens preview when it is a file.
- Directories become the active tree focus.
- Dragging from the file tree into the terminal inserts a quoted path at the cursor.

## Preview Behavior

Use `FilePreview` as the embedded preview host.

Rules:

- Validate selected absolute paths with `normalizeFilePreviewPath`.
- Files open in the embedded preview by default.
- Unsupported files show the existing unsupported preview state.
- Provide actions to open in a new preview tab, open in system app, show in folder, and copy path.
- Markdown and HTML should preview through existing plugins.

## State Model

Renderer state:

- Active workspace directory.
- Active file path.
- Expanded tree nodes.
- Selected tree node.
- Terminal sessions and active session ID.
- Layout mode: `right`, `bottom`, `terminal-maximized`, `preview-maximized`.
- Pane sizes.
- Dotfile visibility.

Main state:

- Live PTY sessions only.
- No DB persistence for terminal buffers.

Persistence:

- Persist workspace directory, layout mode, pane sizes, and dotfile visibility.
- Do not persist terminal process state after app restart.

## Error Handling

- If PTY spawn fails, show an inline terminal error state and log through `loggerService`.
- If the workspace directory is missing or inaccessible, show an actionable empty/error state and allow choosing another folder.
- If directory tree creation fails, log and surface a toast plus page-level error.
- If preview path validation fails, keep the page open and show an unsupported/error preview state.
- If WebGL terminal rendering fails, retry with the default xterm renderer.

## Dependencies

Add runtime dependencies:

- `node-pty`
- `@xterm/xterm`
- `@xterm/addon-fit`
- `@xterm/addon-unicode11`
- `@xterm/addon-webgl`

Recheck whether `react-resizable-panels` is already available in `package.json`; the lockfile contains it but the package manifest must be the source of truth.

## Testing

Focused tests before broad checks:

- Sidebar app registry recognizes `terminal` and maps it to `/app/terminal`.
- Route title and sidebar i18n labels resolve.
- `TerminalService` creates, resizes, writes to, kills, and cleans up mocked PTY sessions.
- Terminal IPC schemas reject invalid session IDs, dimensions, and cwd values.
- Terminal IPC handlers delegate to `TerminalService`.
- Terminal page renders layout controls and switches dock modes.
- Terminal tabs create/switch/close sessions.
- File tree selection opens preview with normalized absolute paths.
- Drag-to-terminal quotes inserted paths correctly.
- Path-link helper extracts common macOS/Linux/Windows paths without linking unsafe junk.

Repository checks before completion:

- Focused Vitest suites for touched modules.
- `pnpm lint`
- `pnpm test`
- `pnpm format`

## Open Questions Resolved

- Sidebar location: main application sidebar, not the `/app/code` tool list.
- Scope: full usable first version with multi-tab terminal, path linkage, file follow, preview linkage, copy, and drag-to-terminal.
- FanBox role: behavior reference, not implementation source.

