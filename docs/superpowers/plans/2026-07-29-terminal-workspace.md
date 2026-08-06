# Terminal Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a FanBox-inspired Terminal workspace as a first-class MagicBox sidebar page with multi-tab system terminals, live filesystem browsing, and embedded file preview.

**Architecture:** Add `/app/terminal` as a built-in sidebar app, then implement a lifecycle-managed main-process `TerminalService` exposed through typed IpcApi routes/events. The renderer page composes xterm.js, the existing `useDirectoryTree` watcher, and existing `FilePreview` into a resizable workspace.

**Tech Stack:** Electron main lifecycle services, IpcApi, React/TanStack Router, Tailwind, `@cherrystudio/ui`, lucide-react, `node-pty`, xterm.js, existing `DirectoryTreeManager`, existing `FilePreview`, Vitest.

## Global Constraints

- Sidebar location is the main application sidebar, not the `/app/code` tool list.
- FanBox is a behavior reference, not an implementation source.
- User-facing strings must use i18n keys, with `zh-cn` and `en-us` updated.
- New UI must use Tailwind and `@cherrystudio/ui`, follow `DESIGN.md`, and use lucide icons for commands.
- Main-process filesystem paths must use `application.getPath(...)` when app/system base paths are needed.
- Main long-lived process resources must be lifecycle services, registered in `src/main/core/application/serviceRegistry.ts`.
- Non-DB imperative commands use IpcApi, not DataApi.
- Use existing `DirectoryTreeManager` / `useDirectoryTree` for live workspace trees.
- Use existing `FilePreview` for embedded previews.
- Runtime dependencies to add: `node-pty`, `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-unicode11`, `@xterm/addon-webgl`.
- Required completion checks: focused Vitest suites, `pnpm lint`, `pnpm test`, `pnpm format`.
- Commits must use `git commit -S --signoff`.

---

## File Structure

Create:

- `src/renderer/routes/app/terminal.tsx` — TanStack route for `/app/terminal`.
- `src/renderer/pages/terminal/TerminalPage.tsx` — page composition and state root.
- `src/renderer/pages/terminal/components/TerminalWorkspaceLayout.tsx` — resizable layout shell.
- `src/renderer/pages/terminal/components/TerminalTabs.tsx` — terminal tab strip.
- `src/renderer/pages/terminal/components/TerminalPane.tsx` — xterm host.
- `src/renderer/pages/terminal/components/WorkspaceFileTree.tsx` — file tree projection and selection UI.
- `src/renderer/pages/terminal/components/WorkspacePreviewPane.tsx` — embedded preview and file actions.
- `src/renderer/pages/terminal/hooks/useTerminalSessions.ts` — renderer session state + IPC bindings.
- `src/renderer/pages/terminal/lib/terminalPathLinks.ts` — terminal path parsing.
- `src/renderer/pages/terminal/lib/terminalPathQuoting.ts` — shell path quoting for drag/drop.
- `src/renderer/pages/terminal/lib/workspaceTree.ts` — project `TreeDirRoot` to UI nodes.
- `src/shared/ipc/schemas/terminal.ts` — typed Terminal request/event schemas.
- `src/main/ipc/handlers/terminal.ts` — Terminal IPC handler adapters.
- `src/main/services/terminal/TerminalService.ts` — PTY lifecycle runtime.
- `src/main/services/terminal/index.ts` — barrel for the lifecycle service.
- Tests next to touched modules under `__tests__/`.

Modify:

- `package.json` and `pnpm-lock.yaml` — add terminal dependencies.
- `src/renderer/utils/sidebar.ts` — add `terminal` app definition.
- `src/renderer/components/app/sidebarIcons.tsx` — add Terminal icon.
- `src/renderer/i18n/label.ts` — add sidebar label key mapping.
- `src/renderer/utils/routeTitle.ts` — add route title.
- `src/shared/data/preference/preferenceTypes.ts` — add `terminal` to `SIDEBAR_FAVORITES`.
- `src/shared/data/preference/preferenceSchemas.ts` — add Terminal to new-profile default sidebar favorites.
- `src/shared/data/preference/__tests__/preferenceSchemas.test.ts` — update default expectation.
- `src/renderer/utils/__tests__/sidebar.test.ts` — update canonical app order tests.
- `src/renderer/components/app/__tests__/Sidebar.test.tsx` — verify the Terminal entry renders when present in favorites.
- `src/renderer/components/app/__tests__/Sidebar.language.test.tsx` — verify the Terminal label follows i18n changes.
- `src/renderer/i18n/locales/en-us.json` and `src/renderer/i18n/locales/zh-cn.json` — add copy.
- `src/shared/ipc/schemas/ipcSchemas.ts` — register Terminal schemas/events.
- `src/main/ipc/handlers/ipcHandlers.ts` — register Terminal handlers.
- `src/main/core/application/serviceRegistry.ts` — register `TerminalService`.
- `src/renderer/routeTree.gen.ts` — update by running `pnpm build:check` and applying the generated TanStack route tree change when the check reports route drift.

---

### Task 1: Sidebar Entry And Route

**Files:**
- Create: `src/renderer/routes/app/terminal.tsx`
- Create: `src/renderer/pages/terminal/TerminalPage.tsx`
- Test: `src/renderer/pages/terminal/__tests__/TerminalPage.test.tsx`
- Modify: `src/renderer/utils/sidebar.ts`
- Modify: `src/renderer/components/app/sidebarIcons.tsx`
- Modify: `src/renderer/i18n/label.ts`
- Modify: `src/renderer/utils/routeTitle.ts`
- Modify: `src/shared/data/preference/preferenceTypes.ts`
- Modify: `src/shared/data/preference/preferenceSchemas.ts`
- Modify: `src/shared/data/preference/__tests__/preferenceSchemas.test.ts`
- Modify: `src/renderer/utils/__tests__/sidebar.test.ts`
- Modify: `src/renderer/i18n/locales/en-us.json`
- Modify: `src/renderer/i18n/locales/zh-cn.json`

**Interfaces:**
- Produces: route path `/app/terminal`.
- Produces: sidebar app id `terminal`.
- Produces: i18n keys `title.terminal` and `terminal.title`.

- [ ] **Step 1: Write failing sidebar and title tests**

Add assertions like:

```ts
expect(getSidebarMenuPath('terminal', 'mock-provider')).toBe('/app/terminal')
expect(resolveSidebarActiveItem('/app/terminal')).toBe('terminal')
expect(SIDEBAR_FAVORITE_ORDER).toContain('terminal')
expect(getRouteTitleKey('/app/terminal')).toBe('title.terminal')
```

Update `preferenceSchemas.test.ts` so the expected default includes:

```ts
{ id: 'terminal', type: 'app' }
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
pnpm vitest run src/renderer/utils/__tests__/sidebar.test.ts src/shared/data/preference/__tests__/preferenceSchemas.test.ts
```

Expected: failures mention unknown `terminal` id or missing title mapping.

- [ ] **Step 3: Implement sidebar registration**

Add `terminal` to `SIDEBAR_APP_DEFINITIONS`:

```ts
{
  id: 'terminal',
  routePrefix: '/app/terminal'
}
```

Add `terminal` to `SIDEBAR_FAVORITES`, `SIDEBAR_ICON_COMPONENTS`, `sidebarIconKeyMap`, and route title keys. Add new default preference item where product wants it displayed for new profiles.

- [ ] **Step 4: Add placeholder route and page**

Create:

```tsx
import TerminalPage from '@renderer/pages/terminal/TerminalPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/terminal')({
  component: TerminalPage
})
```

Create a minimal page:

```tsx
import { EmptyState } from '@cherrystudio/ui'
import { useTranslation } from 'react-i18next'

export default function TerminalPage() {
  const { t } = useTranslation()
  return (
    <main className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <EmptyState title={t('terminal.title')} />
    </main>
  )
}
```

- [ ] **Step 5: Add i18n copy**

Add:

```json
"terminal": {
  "title": "Terminal"
},
"title": {
  "terminal": "Terminal"
}
```

and zh-CN:

```json
"terminal": {
  "title": "终端"
},
"title": {
  "terminal": "终端"
}
```

Merge into existing objects, do not duplicate top-level keys.

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm vitest run src/renderer/utils/__tests__/sidebar.test.ts src/shared/data/preference/__tests__/preferenceSchemas.test.ts src/renderer/pages/terminal/__tests__/TerminalPage.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/routes/app/terminal.tsx src/renderer/pages/terminal src/renderer/utils/sidebar.ts src/renderer/components/app/sidebarIcons.tsx src/renderer/i18n/label.ts src/renderer/utils/routeTitle.ts src/shared/data/preference/preferenceTypes.ts src/shared/data/preference/preferenceSchemas.ts src/shared/data/preference/__tests__/preferenceSchemas.test.ts src/renderer/utils/__tests__/sidebar.test.ts src/renderer/i18n/locales/en-us.json src/renderer/i18n/locales/zh-cn.json
git commit -S --signoff -m "feat(terminal): add sidebar entry"
```

---

### Task 2: Terminal IPC And Main PTY Runtime

**Files:**
- Create: `src/shared/ipc/schemas/terminal.ts`
- Create: `src/main/ipc/handlers/terminal.ts`
- Create: `src/main/ipc/handlers/__tests__/terminal.test.ts`
- Create: `src/main/services/terminal/TerminalService.ts`
- Create: `src/main/services/terminal/index.ts`
- Create: `src/main/services/terminal/__tests__/TerminalService.test.ts`
- Modify: `src/shared/ipc/schemas/ipcSchemas.ts`
- Modify: `src/main/ipc/handlers/ipcHandlers.ts`
- Modify: `src/main/core/application/serviceRegistry.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `TerminalService.createSession(input): Promise<TerminalSessionMetadata>`.
- Produces: `TerminalService.writeInput(id: string, data: string): void`.
- Produces: `TerminalService.resizeSession(id: string, size: { cols: number; rows: number }): void`.
- Produces: `TerminalService.killSession(id: string): void`.
- Produces: request routes `terminal.session.create`, `terminal.session.list`, `terminal.session.input`, `terminal.session.resize`, `terminal.session.kill`.
- Produces: event payloads `terminal.session.data`, `terminal.session.exit`, `terminal.session.updated`.

- [ ] **Step 1: Add dependencies**

Run:

```bash
pnpm add node-pty @xterm/xterm @xterm/addon-fit @xterm/addon-unicode11 @xterm/addon-webgl
```

Expected: `package.json` and `pnpm-lock.yaml` update.

- [ ] **Step 2: Write failing schema tests**

Add tests that parse valid inputs and reject invalid dimensions:

```ts
expect(() =>
  terminalRequestSchemas['terminal.session.resize'].input.parse({ id: 's1', cols: 0, rows: 24 })
).toThrow()
expect(terminalRequestSchemas['terminal.session.input'].input.parse({ id: 's1', data: 'ls\n' })).toEqual({
  id: 's1',
  data: 'ls\n'
})
```

- [ ] **Step 3: Implement `terminal.ts` schemas**

Define metadata and routes with Zod:

```ts
const sessionIdSchema = z.string().min(1)
const sizeSchema = z.strictObject({ cols: z.int().min(1).max(1000), rows: z.int().min(1).max(1000) })

export const TerminalSessionMetadataSchema = z.strictObject({
  id: sessionIdSchema,
  cwd: z.string().min(1),
  shell: z.string().min(1),
  pid: z.number().int().nullable(),
  status: z.enum(['running', 'exited']),
  createdAt: z.number(),
  updatedAt: z.number()
})
```

Use `defineRoute` for each request. Export `TerminalEventSchemas` as a type map with data, exit, and updated payloads.

- [ ] **Step 4: Write failing `TerminalService` tests**

Mock `node-pty` spawn:

```ts
const write = vi.fn()
const resize = vi.fn()
const kill = vi.fn()
const onData = vi.fn()
const onExit = vi.fn()

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({ pid: 123, write, resize, kill, onData, onExit }))
}))
```

Assert create calls spawn with cwd, input calls `write`, resize calls `resize`, kill calls `kill`, and stop kills live sessions.

- [ ] **Step 5: Implement `TerminalService`**

Create `@Injectable('TerminalService')` and `@ServicePhase(Phase.WhenReady)` service. Use `randomUUID`, `node-pty`, `application.getPath('sys.home')`, and `loggerService.withContext('TerminalService')`.

On data/exit callbacks, broadcast events through `application.get('IpcApiService').broadcast(eventName, payload)`.

- [ ] **Step 6: Write handlers and aggregator registrations**

Handlers should be thin:

```ts
export const terminalHandlers: IpcHandlersFor<typeof terminalRequestSchemas> = {
  'terminal.session.create': (input) => application.get('TerminalService').createSession(input),
  'terminal.session.list': () => application.get('TerminalService').listSessions(),
  'terminal.session.input': ({ id, data }) => application.get('TerminalService').writeInput(id, data),
  'terminal.session.resize': ({ id, cols, rows }) => application.get('TerminalService').resizeSession(id, { cols, rows }),
  'terminal.session.kill': ({ id }) => application.get('TerminalService').killSession(id)
}
```

Register schemas, event types, handlers, and service registry entry.

- [ ] **Step 7: Run focused tests**

Run:

```bash
pnpm vitest run src/main/services/terminal/__tests__/TerminalService.test.ts src/main/ipc/handlers/__tests__/terminal.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml src/shared/ipc/schemas/terminal.ts src/shared/ipc/schemas/ipcSchemas.ts src/main/ipc/handlers/terminal.ts src/main/ipc/handlers/ipcHandlers.ts src/main/ipc/handlers/__tests__/terminal.test.ts src/main/services/terminal src/main/core/application/serviceRegistry.ts
git commit -S --signoff -m "feat(terminal): add pty runtime"
```

---

### Task 3: Terminal Renderer Sessions And Xterm Host

**Files:**
- Create: `src/renderer/pages/terminal/hooks/useTerminalSessions.ts`
- Create: `src/renderer/pages/terminal/components/TerminalPane.tsx`
- Create: `src/renderer/pages/terminal/components/TerminalTabs.tsx`
- Create: `src/renderer/pages/terminal/hooks/__tests__/useTerminalSessions.test.tsx`
- Create: `src/renderer/pages/terminal/components/__tests__/TerminalTabs.test.tsx`
- Modify: `src/renderer/pages/terminal/TerminalPage.tsx`

**Interfaces:**
- Consumes: Terminal IPC routes/events from Task 2.
- Produces: `useTerminalSessions({ cwd })` returning `{ sessions, activeSessionId, activeSession, createSession, closeSession, setActiveSessionId, sendInput, resizeSession }`.
- Produces: `TerminalPane` props `{ sessionId: string | null; onInput(data: string): void; onResize(size: { cols: number; rows: number }): void }`.

- [ ] **Step 1: Write failing hook tests**

Mock `ipcApi.request` and `ipcApi.on`. Assert the hook creates a session with the cwd, stores session metadata, appends data chunks to the matching session buffer, and removes/marks sessions on exit.

- [ ] **Step 2: Implement `useTerminalSessions`**

Use `ipcApi.request('terminal.session.create', { cwd, cols, rows })`, `useIpcOn('terminal.session.data', ...)`, `useIpcOn('terminal.session.exit', ...)`, and stable callbacks for input/resize/kill.

Keep renderer session buffers bounded, for example last 200 chunks per session, because the PTY process is not persisted.

- [ ] **Step 3: Write failing tab tests**

Assert:

```tsx
render(<TerminalTabs sessions={[session]} activeSessionId="s1" ... />)
expect(screen.getByRole('tab', { name: /terminal/i })).toBeInTheDocument()
```

Test create, switch, and close callbacks.

- [ ] **Step 4: Implement `TerminalTabs`**

Use `@cherrystudio/ui` buttons or tabs if available. Use lucide `Plus`, `X`, and `Terminal`. Keep the tab row fixed height and accessible.

- [ ] **Step 5: Implement `TerminalPane`**

Instantiate xterm in an effect. Load `FitAddon`, `Unicode11Addon`, and WebGL with fallback. Wire:

```ts
terminal.onData(onInput)
fitAddon.fit()
onResize({ cols: terminal.cols, rows: terminal.rows })
```

Use `ResizeObserver` on the container to refit and resize. Dispose all xterm resources on unmount.

- [ ] **Step 6: Compose into placeholder page**

Render tabs and terminal pane in `TerminalPage`, defaulting cwd to `application.getPath('sys.home')` only through main IPC from Task 2 or to no session until workspace selection is added in Task 4.

- [ ] **Step 7: Run focused tests**

Run:

```bash
pnpm vitest run src/renderer/pages/terminal/hooks/__tests__/useTerminalSessions.test.tsx src/renderer/pages/terminal/components/__tests__/TerminalTabs.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/pages/terminal
git commit -S --signoff -m "feat(terminal): render xterm sessions"
```

---

### Task 4: Workspace File Tree And Embedded Preview

**Files:**
- Create: `src/renderer/pages/terminal/components/WorkspaceFileTree.tsx`
- Create: `src/renderer/pages/terminal/components/WorkspacePreviewPane.tsx`
- Create: `src/renderer/pages/terminal/lib/workspaceTree.ts`
- Create: `src/renderer/pages/terminal/lib/__tests__/workspaceTree.test.ts`
- Create: `src/renderer/pages/terminal/components/__tests__/WorkspacePreviewPane.test.tsx`
- Modify: `src/renderer/pages/terminal/TerminalPage.tsx`

**Interfaces:**
- Consumes: existing `useDirectoryTree(rootPath, options)`.
- Consumes: existing `FilePreview`.
- Produces: `WorkspaceFileTree` props `{ rootPath, selectedPath, includeHidden, onSelectPath }`.
- Produces: `WorkspacePreviewPane` props `{ filePath, onOpenInNewTab, onShowInFolder, onOpenSystem, onCopyPath }`.

- [ ] **Step 1: Write projection tests**

Given a `TreeDirRoot` with folders and files, assert `projectWorkspaceTree(root)` returns folders first, files second, and absolute paths preserved.

- [ ] **Step 2: Implement `workspaceTree.ts`**

Implement small pure helpers:

```ts
export interface WorkspaceTreeItem {
  id: string
  name: string
  path: string
  kind: 'directory' | 'file'
  children?: WorkspaceTreeItem[]
}
```

Sort children folders-first then by `name.localeCompare`.

- [ ] **Step 3: Write preview pane tests**

Mock `FilePreview` and assert `normalizeFilePreviewPath`-valid paths render it, while null paths render an empty state.

- [ ] **Step 4: Implement `WorkspacePreviewPane`**

Use `FilePreview` with a header containing file name and icon actions:

- open in new tab
- open system
- show in folder
- copy path

Use `ipcApi.request('file.open', createFilePathHandle(filePath))` or the existing preload `window.api.file.openPath/showInFolder` where already used safely.

- [ ] **Step 5: Implement `WorkspaceFileTree`**

Use `useDirectoryTree(rootPath, { includeHidden, respectGitignore: true, withStats: true })`. Render tree rows with stable height, folder/file icons, expand/collapse buttons, selection state, and loading/error states.

- [ ] **Step 6: Add workspace picker**

Use existing `window.api.file.selectFolder()` to choose root. Persist selected root via `usePersistCache` under a key such as `terminal.workspace.root`.

- [ ] **Step 7: Compose page**

Render file tree and preview alongside the terminal. File clicks update `activeFilePath`; directory clicks expand/select.

- [ ] **Step 8: Run focused tests**

Run:

```bash
pnpm vitest run src/renderer/pages/terminal/lib/__tests__/workspaceTree.test.ts src/renderer/pages/terminal/components/__tests__/WorkspacePreviewPane.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/pages/terminal
git commit -S --signoff -m "feat(terminal): add workspace file preview"
```

---

### Task 5: Resizable FanBox-Style Layout And Path Interactions

**Files:**
- Create: `src/renderer/pages/terminal/components/TerminalWorkspaceLayout.tsx`
- Create: `src/renderer/pages/terminal/lib/terminalPathLinks.ts`
- Create: `src/renderer/pages/terminal/lib/terminalPathQuoting.ts`
- Create: `src/renderer/pages/terminal/lib/__tests__/terminalPathLinks.test.ts`
- Create: `src/renderer/pages/terminal/lib/__tests__/terminalPathQuoting.test.ts`
- Modify: `src/renderer/pages/terminal/TerminalPage.tsx`
- Modify: `src/renderer/pages/terminal/components/TerminalPane.tsx`
- Modify: `src/renderer/i18n/locales/en-us.json`
- Modify: `src/renderer/i18n/locales/zh-cn.json`

**Interfaces:**
- Produces: layout mode union `'right' | 'bottom' | 'terminal-maximized' | 'preview-maximized'`.
- Produces: `quotePathForShell(path: string): string`.
- Produces: `extractTerminalPathCandidates(text: string, cwd: string): string[]`.

- [ ] **Step 1: Write path helper tests**

Cover:

```ts
expect(quotePathForShell("/Users/me/My App")).toBe("'/Users/me/My App'")
expect(extractTerminalPathCandidates("open /Users/me/a.txt", "/Users/me")).toContain("/Users/me/a.txt")
expect(extractTerminalPathCandidates("see src/index.ts:12", "/repo")).toContain("/repo/src/index.ts")
```

- [ ] **Step 2: Implement path helpers**

Use conservative parsing:

- absolute POSIX paths starting with `/`
- absolute Windows paths like `C:\Users\a.txt`
- relative paths with `/` or `.` resolved against cwd
- strip trailing `:line`, punctuation, and quotes

Do not link shell metacharacter-only tokens.

- [ ] **Step 3: Write layout tests**

Render `TerminalWorkspaceLayout` in each mode and assert the visible pane arrangement and mode buttons.

- [ ] **Step 4: Implement layout**

Use `react-resizable-panels` if it is present in `package.json`; if only in lockfile, add it explicitly. Provide icon buttons for right dock, bottom dock, terminal maximize, preview maximize, and restore. Persist layout mode and pane sizes with `usePersistCache` keys:

- `terminal.layout.mode`
- `terminal.layout.right_sizes`
- `terminal.layout.bottom_sizes`

- [ ] **Step 5: Wire drag-to-terminal**

Make file tree rows draggable with payload `{ path }`. In `TerminalPane`, handle drop and call `onInput(quotePathForShell(path))`.

- [ ] **Step 6: Wire terminal path clicks**

Use xterm link provider or a controlled output overlay if link provider is simpler after inspecting xterm APIs. On link activation, call `onPathActivated(path)` in `TerminalPage`; if path is a file, set preview path; if directory, set/select workspace root focus.

- [ ] **Step 7: Run focused tests**

Run:

```bash
pnpm vitest run src/renderer/pages/terminal/lib/__tests__/terminalPathLinks.test.ts src/renderer/pages/terminal/lib/__tests__/terminalPathQuoting.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml src/renderer/pages/terminal src/renderer/i18n/locales/en-us.json src/renderer/i18n/locales/zh-cn.json
git commit -S --signoff -m "feat(terminal): add adjustable workspace layout"
```

---

### Task 6: Integration Polish And Repository Verification

**Files:**
- Modify: `src/renderer/routeTree.gen.ts` if route generation reports drift.
- Modify: files touched by Tasks 1-5 only to fix failures reported by the commands in this task.
- Test: adjust the focused test files from Tasks 1-5 only when a test assertion no longer matches the accepted behavior.

**Interfaces:**
- Consumes: complete `/app/terminal` feature.
- Produces: verified terminal workspace ready for user testing.

- [ ] **Step 1: Run route generation or type check gate**

Run the repo's existing check first:

```bash
pnpm build:check
```

If it reports route tree drift, run the repo's route generation workflow used by Electron Vite/TanStack Router, then re-run `pnpm build:check`.

- [ ] **Step 2: Run focused suites**

Run:

```bash
pnpm vitest run src/renderer/pages/terminal src/main/services/terminal src/main/ipc/handlers/__tests__/terminal.test.ts src/renderer/utils/__tests__/sidebar.test.ts
```

Expected: PASS.

- [ ] **Step 3: Manual smoke test in dev**

Run:

```bash
pnpm dev
```

Manual checks:

- Sidebar shows Terminal.
- Clicking Terminal opens `/app/terminal`.
- Choosing a folder populates the file tree.
- Opening a terminal starts the system shell in that folder.
- Typing `pwd` prints the selected workspace.
- Resizing panes refits terminal.
- Switching right/bottom/max modes keeps content usable.
- Clicking a file previews it.
- Dragging a file into terminal inserts a quoted path.
- Closing terminal tabs kills their PTY sessions.

- [ ] **Step 4: Run required repo checks**

Run:

```bash
pnpm lint
pnpm test
pnpm format
```

Expected: all commands exit 0.

- [ ] **Step 5: Final commit**

If verification caused formatting or generated-file updates:

```bash
git add .
git commit -S --signoff -m "chore(terminal): finalize workspace checks"
```

Skip the commit if there are no changes.
