import '@testing-library/jest-dom/vitest'

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type React from 'react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  ensureSession: vi.fn(),
  closeSession: vi.fn(),
  resizeSession: vi.fn(),
  sendInput: vi.fn(),
  setActiveSessionId: vi.fn(),
  commandHandlers: {} as Record<string, () => void | Promise<void>>,
  ipcRequest: vi.fn(),
  safeOpen: vi.fn(),
  toastError: vi.fn(),
  isDirectory: vi.fn(),
  listDirectoryEntries: vi.fn(),
  cancelDirectorySearch: vi.fn(),
  resolvePath: vi.fn(),
  clipboardWriteText: vi.fn(),
  alert: vi.fn(),
  confirm: vi.fn(),
  prompt: vi.fn(),
  persistValues: {
    'terminal.workspace.root': null as string | null,
    'terminal.workspace.include_hidden': false,
    'terminal.workspace.view_mode': 'list' as 'list' | 'icons' | 'tree',
    'terminal.workspace.sort_key': 'name' as 'name' | 'mtime' | 'size',
    'terminal.workspace.sort_direction': 'asc' as 'asc' | 'desc',
    'terminal.workspace.preview_open': true,
    'terminal.workspace.preview_sizes': [55, 45] as [number, number],
    'terminal.workspace.terminal_visible': true,
    'terminal.workspace.keep_directory': false,
    'terminal.workspace.favorite_directories': [] as string[],
    'terminal.workspace.icon_size': 'medium' as 'small' | 'medium' | 'large',
    'terminal.quick_commands': [] as Array<{ id: string; command: string; iconDataUrl?: string; label?: string }>,
    'terminal.layout.mode': 'right' as 'right' | 'bottom' | 'terminal-maximized' | 'files-maximized',
    'terminal.font_size': 18,
    'terminal.theme': 'default-dark' as
      | 'default-dark'
      | 'light'
      | 'solarized-dark'
      | 'dracula'
      | 'monokai'
      | 'one-dark-pro'
      | 'gruvbox-dark'
      | 'nord'
  },
  sessions: [] as Array<{
    id: string
    cwd: string
    processName?: string
    buffer: []
  }>,
  activeSession: null as {
    id: string
    cwd: string
    processName?: string
    buffer: []
  } | null
}))

vi.mock('@data/hooks/useCache', async () => {
  const React = await import('react')

  return {
    usePersistCache: (key: keyof typeof mocks.persistValues) => {
      const [value, setValue] = React.useState(mocks.persistValues[key])
      return [
        value,
        (nextValue: (typeof mocks.persistValues)[typeof key]) => {
          ;(mocks.persistValues as Record<string, unknown>)[key] = nextValue
          setValue(nextValue)
        }
      ]
    }
  }
})

vi.mock('../hooks/useTerminalSessions', () => ({
  useTerminalSessions: () => ({
    sessions: mocks.sessions,
    sessionsReady: true,
    activeSessionId: mocks.activeSession?.id ?? null,
    activeSession: mocks.activeSession,
    createSession: mocks.createSession,
    ensureSession: mocks.ensureSession,
    closeSession: mocks.closeSession,
    resizeSession: mocks.resizeSession,
    sendInput: mocks.sendInput,
    setActiveSessionId: mocks.setActiveSessionId
  })
}))

vi.mock('@renderer/hooks/command', () => ({
  useCommandContextKey: vi.fn(),
  useCommandHandler: (command: string, handler: () => void | Promise<void>, options?: { enabled?: boolean }) => {
    if (options?.enabled === false) {
      delete mocks.commandHandlers[command]
      return
    }
    mocks.commandHandlers[command] = handler
  }
}))

vi.mock('../components/TerminalTabs', () => ({
  TerminalTabs: ({
    actions,
    onCreate,
    onClose,
    onDeleteQuickCommand,
    onEditQuickCommand,
    onHeaderDoubleClick,
    onOpenQuickCommandDialog,
    onRunQuickCommand,
    onThemeChange,
    quickCommands,
    selectedThemeKey,
    sessions
  }: {
    actions?: React.ReactNode
    onCreate: () => void
    onClose: (id: string) => void
    onDeleteQuickCommand?: (id: string) => void
    onEditQuickCommand?: (command: { id: string; command: string; iconDataUrl?: string; label?: string }) => void
    onHeaderDoubleClick?: () => void
    onOpenQuickCommandDialog?: () => void
    onRunQuickCommand?: (command: { id: string; command: string; iconDataUrl?: string; label?: string }) => void
    onThemeChange?: (
      theme:
        | 'default-dark'
        | 'light'
        | 'solarized-dark'
        | 'dracula'
        | 'monokai'
        | 'one-dark-pro'
        | 'gruvbox-dark'
        | 'nord'
    ) => void
    quickCommands?: Array<{ id: string; command: string; iconDataUrl?: string; label?: string }>
    selectedThemeKey?: string
    sessions: Array<{ id: string }>
  }) => (
    <div
      data-selected-theme-key={selectedThemeKey ?? ''}
      data-testid="terminal-tabs"
      onDoubleClick={onHeaderDoubleClick}>
      <button onClick={onCreate} type="button">
        create terminal session
      </button>
      <button onClick={() => onThemeChange?.('dracula')} type="button">
        select dracula terminal theme
      </button>
      <button onClick={onOpenQuickCommandDialog} type="button">
        open quick command dialog
      </button>
      {quickCommands?.map((quickCommand) => (
        <div key={quickCommand.id}>
          <button onClick={() => onRunQuickCommand?.(quickCommand)} type="button">
            run quick command {quickCommand.id}
          </button>
          <button onClick={() => onEditQuickCommand?.(quickCommand)} type="button">
            edit quick command {quickCommand.id}
          </button>
          <button onClick={() => onDeleteQuickCommand?.(quickCommand.id)} type="button">
            delete quick command {quickCommand.id}
          </button>
        </div>
      ))}
      {sessions.map((session) => (
        <button key={session.id} onClick={() => onClose(session.id)} type="button">
          close {session.id}
        </button>
      ))}
      {actions}
    </div>
  )
}))

vi.mock('../components/TerminalPane', () => ({
  TerminalPane: ({
    cwd,
    focusRequestKey,
    fontSize,
    onFontSizeChange,
    onPathActivated,
    theme
  }: {
    cwd?: string | null
    focusRequestKey?: number
    fontSize?: number
    onFontSizeChange?: (fontSize: number) => void
    onPathActivated?: (path: string) => void
    theme?: { background?: string }
  }) => (
    <div
      data-cwd={cwd ?? ''}
      data-font-size={fontSize ?? ''}
      data-focus-request-key={focusRequestKey ?? 0}
      data-terminal-background={theme?.background ?? ''}
      data-testid="terminal-pane">
      <button onClick={() => onFontSizeChange?.(30)} type="button">
        change terminal font
      </button>
      <button onClick={() => onPathActivated?.('/workspace/from-terminal.txt')} type="button">
        activate terminal file
      </button>
      <button onClick={() => onPathActivated?.('/workspace/from-terminal-dir')} type="button">
        activate terminal directory
      </button>
    </div>
  )
}))

vi.mock('../components/TerminalWorkspaceLayout', () => ({
  TerminalWorkspaceLayout: ({
    fileManager,
    onShowTerminal,
    terminal
  }: {
    fileManager: React.ReactNode | ((actions: React.ReactNode) => React.ReactNode)
    onShowTerminal?: () => void
    terminal: React.ReactNode | ((actions: React.ReactNode, onHeaderDoubleClick: () => void) => React.ReactNode)
  }) => (
    <div>
      {typeof fileManager === 'function' ? fileManager(<div data-testid="mock-layout-actions" />) : fileManager}
      <button onClick={onShowTerminal} type="button">
        show terminal
      </button>
      {typeof terminal === 'function'
        ? terminal(<div data-testid="mock-terminal-layout-actions" />, vi.fn())
        : terminal}
    </div>
  )
}))

vi.mock('../components/WorkspaceFileTree', () => ({
  WorkspaceFileTree: ({
    contextMenuActions,
    onOpenChildHistoryPath,
    onOpenParentPath,
    onSelectPath,
    onExpandedTreePathsChange,
    onToggleFavoriteDirectory,
    expandedTreePaths,
    favoriteDirectoryPaths,
    iconSize,
    restoreFocusKey,
    rootPath,
    sortDirection,
    sortKey,
    viewMode
  }: {
    contextMenuActions?: {
      canPaste: boolean
      onOpenItem: (item: { kind: 'directory' | 'file'; name: string; path: string }) => void
      onRenameItem: (item: { kind: 'directory' | 'file'; name: string; path: string }) => void
      onCopyItems: (items: Array<{ kind: 'directory' | 'file'; name: string; path: string }>) => void
      onCopyPaths: (paths: string[]) => void
      onCutItems: (items: Array<{ kind: 'directory' | 'file'; name: string; path: string }>) => void
      onTrashItems: (items: Array<{ kind: 'directory' | 'file'; name: string; path: string }>) => void
      onShowProperties: (path: string) => void
      onNewFile: () => void
      onNewFolder: () => void
      onPaste: () => void
      onOpenTerminalHere: () => void
    }
    onOpenChildHistoryPath?: () => void
    onOpenParentPath?: (path: string) => void
    onSelectPath: (path: string, kind: 'directory' | 'file') => void
    onExpandedTreePathsChange?: (paths: string[]) => void
    onToggleFavoriteDirectory?: (path: string) => void
    expandedTreePaths?: string[]
    favoriteDirectoryPaths?: string[]
    iconSize?: string
    restoreFocusKey?: number
    rootPath: string | null
    sortDirection: string
    sortKey: string
    viewMode: string
  }) => (
    <div
      data-root-path={rootPath ?? ''}
      data-restore-focus-key={restoreFocusKey ?? 0}
      data-sort-direction={sortDirection}
      data-sort-key={sortKey}
      data-testid="mock-workspace-file-tree"
      data-expanded-tree-paths={expandedTreePaths?.join('\n') ?? ''}
      data-favorites={favoriteDirectoryPaths?.join('\n') ?? ''}
      data-icon-size={iconSize ?? ''}
      data-view-mode={viewMode}>
      <button onClick={() => onSelectPath('/workspace/run.sh', 'file')} type="button">
        select file
      </button>
      <button onClick={() => onSelectPath('/workspace/src', 'directory')} type="button">
        select directory
      </button>
      <button onClick={() => onExpandedTreePathsChange?.(['/workspace/src'])} type="button">
        expand src
      </button>
      <button onClick={() => onOpenParentPath?.('/workspace')} type="button">
        navigate parent
      </button>
      <button onClick={onOpenChildHistoryPath} type="button">
        navigate child history
      </button>
      <button onClick={() => onToggleFavoriteDirectory?.('/workspace/src')} type="button">
        favorite src
      </button>
      {contextMenuActions && (
        <>
          <button
            onClick={() =>
              contextMenuActions.onCopyItems([{ kind: 'file', name: 'run.sh', path: '/workspace/run.sh' }])
            }
            type="button">
            context copy file
          </button>
          <button
            onClick={() => {
              contextMenuActions.onCopyItems([{ kind: 'file', name: 'run.sh', path: '/workspace/run.sh' }])
              contextMenuActions.onPaste()
            }}
            type="button">
            context copy then paste immediately
          </button>
          <button
            onClick={() => {
              contextMenuActions.onCopyItems([{ kind: 'file', name: 'run.sh', path: '/workspace/run.sh' }])
              onSelectPath('/workspace/src', 'directory')
              contextMenuActions.onPaste()
            }}
            type="button">
            context copy navigate then paste immediately
          </button>
          <button onClick={() => contextMenuActions.onCopyPaths(['/workspace/run.sh'])} type="button">
            context copy file path
          </button>
          <button
            onClick={() => contextMenuActions.onCutItems([{ kind: 'file', name: 'run.sh', path: '/workspace/run.sh' }])}
            type="button">
            context cut file
          </button>
          <button
            onClick={() => contextMenuActions.onRenameItem({ kind: 'file', name: 'run.sh', path: '/workspace/run.sh' })}
            type="button">
            context rename file
          </button>
          <button
            onClick={() =>
              contextMenuActions.onTrashItems([{ kind: 'file', name: 'run.sh', path: '/workspace/run.sh' }])
            }
            type="button">
            context trash file
          </button>
          <button
            onClick={() =>
              contextMenuActions.onCopyItems([
                { kind: 'file', name: 'run.sh', path: '/workspace/run.sh' },
                { kind: 'file', name: 'app.log', path: '/workspace/app.log' }
              ])
            }
            type="button">
            context copy multiple files
          </button>
          <button
            onClick={() => contextMenuActions.onCopyPaths(['/workspace/run.sh', '/workspace/app.log'])}
            type="button">
            context copy multiple paths
          </button>
          <button onClick={contextMenuActions.onNewFile} type="button">
            context new file
          </button>
          <button onClick={contextMenuActions.onNewFolder} type="button">
            context new folder
          </button>
          <button disabled={!contextMenuActions.canPaste} onClick={contextMenuActions.onPaste} type="button">
            context paste
          </button>
          <button onClick={contextMenuActions.onOpenTerminalHere} type="button">
            context open terminal here
          </button>
          <button onClick={() => contextMenuActions.onShowProperties(rootPath ?? '')} type="button">
            context root properties
          </button>
          <button onClick={() => contextMenuActions.onCopyPaths([rootPath ?? ''])} type="button">
            context copy root path
          </button>
        </>
      )}
    </div>
  )
}))

vi.mock('../components/WorkspacePreviewPane', () => ({
  WorkspacePreviewPane: ({
    filePath,
    onClose,
    onOpenSystem
  }: {
    filePath: string | null
    onClose: () => void
    onOpenSystem: (filePath: string) => void
  }) => (
    <div data-file-path={filePath ?? ''} data-testid="mock-workspace-preview-pane">
      <button disabled={!filePath} onClick={() => filePath && onOpenSystem(filePath)} type="button">
        open system
      </button>
      <button onClick={onClose} type="button">
        close preview
      </button>
    </div>
  )
}))

vi.mock('@renderer/components/FilePreview', () => ({
  useOpenFilePreviewTab: () => vi.fn()
}))

vi.mock('@renderer/ipc', () => ({
  ipcApi: { request: mocks.ipcRequest }
}))

vi.mock('@renderer/utils/file/safeOpen', () => ({
  safeOpen: mocks.safeOpen
}))

vi.mock('@renderer/services/toast', () => ({
  toast: { error: mocks.toastError }
}))

vi.mock('@cherrystudio/ui', () => ({
  Button: ({ children, variant, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => (
    <button {...props} data-variant={variant} type="button">
      {children}
    </button>
  ),
  Dialog: ({
    children,
    open
  }: {
    children: React.ReactNode
    open?: boolean
    onOpenChange?: (open: boolean) => void
  }) => (open ? <div data-testid="mock-dialog">{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  EmptyState: ({ title }: { title?: string }) => <div data-testid="empty-state">{title}</div>,
  Input: vi.fn((props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />),
  NormalTooltip: ({ children }: { children: React.ReactNode }) => children,
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => <>{children}</>,
  ResizableHandle: () => <div data-testid="resize-handle" />,
  ResizablePanel: ({ children, id }: { children: React.ReactNode; id?: string }) => (
    <div data-testid={id}>{children}</div>
  ),
  ResizablePanelGroup: ({ children, direction }: { children: React.ReactNode; direction?: string }) => (
    <div data-direction={direction} data-testid="mock-resizable-panel-group">
      {children}
    </div>
  ),
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} type="button">
      {children}
    </button>
  ),
  SelectValue: () => <span />,
  Switch: ({ checked }: { checked: boolean }) => <input checked={checked} readOnly type="checkbox" />
}))

vi.mock('@iconify/react', () => ({
  Icon: ({ className, icon }: { className?: string; icon: string }) => <span className={className} data-icon={icon} />
}))

import TerminalPage from '../TerminalPage'

beforeEach(() => {
  mocks.persistValues['terminal.workspace.root'] = null
  mocks.persistValues['terminal.workspace.include_hidden'] = false
  mocks.persistValues['terminal.workspace.view_mode'] = 'list'
  mocks.persistValues['terminal.workspace.sort_key'] = 'name'
  mocks.persistValues['terminal.workspace.sort_direction'] = 'asc'
  mocks.persistValues['terminal.workspace.preview_open'] = true
  mocks.persistValues['terminal.workspace.preview_sizes'] = [55, 45]
  mocks.persistValues['terminal.workspace.terminal_visible'] = true
  mocks.persistValues['terminal.workspace.keep_directory'] = false
  mocks.persistValues['terminal.workspace.favorite_directories'] = []
  mocks.persistValues['terminal.workspace.icon_size'] = 'medium'
  mocks.persistValues['terminal.quick_commands'] = []
  mocks.persistValues['terminal.layout.mode'] = 'right'
  mocks.persistValues['terminal.font_size'] = 18
  mocks.persistValues['terminal.theme'] = 'default-dark'
  mocks.sessions = []
  mocks.activeSession = null
  mocks.commandHandlers = {}
  mocks.createSession.mockReset()
  mocks.createSession.mockResolvedValue({ id: 'created-session', cwd: '/workspace', buffer: [] })
  mocks.ensureSession.mockReset()
  mocks.ipcRequest.mockReset()
  mocks.ipcRequest.mockImplementation(async (route: string, input?: { path?: string }) => {
    if (route === 'file.path_stat') {
      const targetPath = input?.path ?? ''
      return {
        path: targetPath,
        name: targetPath.split('/').pop() ?? targetPath,
        kind: (await mocks.isDirectory(targetPath)) ? 'directory' : 'file',
        size: 0,
        createdAt: 1,
        modifiedAt: 2
      }
    }
    return undefined
  })
  mocks.safeOpen.mockResolvedValue(undefined)
  mocks.isDirectory.mockResolvedValue(false)
  mocks.listDirectoryEntries.mockReset()
  mocks.cancelDirectorySearch.mockReset()
  mocks.cancelDirectorySearch.mockResolvedValue(undefined)
  mocks.listDirectoryEntries.mockResolvedValue([
    { path: '/workspace/docs', isDirectory: true },
    { path: '/workspace/docs/guide.md', isDirectory: false },
    { path: '/workspace/src/index.ts', isDirectory: false },
    { path: '/workspace/package.json', isDirectory: false }
  ])
  mocks.resolvePath.mockResolvedValue('/Users/alice')
  mocks.clipboardWriteText.mockReset()
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: mocks.clipboardWriteText }
  })
  mocks.alert.mockReset()
  mocks.confirm.mockReset()
  mocks.confirm.mockReturnValue(true)
  mocks.prompt.mockReset()
  window.api.file.listDirectoryEntries = mocks.listDirectoryEntries
  window.api.file.cancelDirectorySearch = mocks.cancelDirectorySearch
  window.api.resolvePath = mocks.resolvePath
  window.alert = mocks.alert
  window.confirm = mocks.confirm
  window.prompt = mocks.prompt
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('TerminalPage', () => {
  it('renders the terminal workspace composition and starts an initial session', async () => {
    render(<TerminalPage />)

    expect(screen.getByTestId('terminal-tabs')).toBeInTheDocument()
    expect(screen.getByTestId('terminal-pane')).toBeInTheDocument()
    expect(screen.getByTestId('workspace-file-tree')).toBeInTheDocument()
    expect(screen.getByTestId('terminal-workspace-path-actions')).toContainElement(
      screen.getByTestId('mock-layout-actions')
    )
    expect(mocks.ensureSession).toHaveBeenCalledOnce()
    expect(mocks.createSession).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-root-path', '/Users/alice')
    )
  })

  it('starts only one initial session under StrictMode remount checks', async () => {
    render(
      <StrictMode>
        <TerminalPage />
      </StrictMode>
    )

    await waitFor(() => expect(mocks.ensureSession).toHaveBeenCalledTimes(1))
  })

  it('does not create another terminal session when returning to an existing session', async () => {
    const activeSession = { id: 'session-1', cwd: '/workspace', buffer: [] as [] }
    mocks.sessions = [activeSession]
    mocks.activeSession = activeSession

    render(<TerminalPage />)

    expect(mocks.ensureSession).not.toHaveBeenCalled()
    expect(mocks.createSession).not.toHaveBeenCalled()
    expect(screen.getByTestId('terminal-pane')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-root-path', '/workspace')
    )
  })

  it('defaults the workspace root to the current user home directory', async () => {
    render(<TerminalPage />)

    await waitFor(() =>
      expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-root-path', '/Users/alice')
    )
    expect(mocks.resolvePath).toHaveBeenCalledWith('~')
  })

  it('passes the persisted workspace root as the terminal link cwd', () => {
    mocks.persistValues['terminal.workspace.root'] = '/workspace'

    render(<TerminalPage />)

    expect(screen.getByTestId('terminal-pane')).toHaveAttribute('data-cwd', '/workspace')
  })

  it('passes persisted file view and sorting options to the workspace file manager', () => {
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.persistValues['terminal.workspace.view_mode'] = 'icons'
    mocks.persistValues['terminal.workspace.sort_key'] = 'mtime'
    mocks.persistValues['terminal.workspace.sort_direction'] = 'desc'

    render(<TerminalPage />)

    expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-view-mode', 'icons')
    expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-sort-key', 'mtime')
    expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-sort-direction', 'desc')
  })

  it('switches the workspace file manager to tree view', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: '文件树视图' }))

    expect(mocks.persistValues['terminal.workspace.view_mode']).toBe('tree')
    expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-view-mode', 'tree')
  })

  it('places workspace navigation buttons before the list view button', () => {
    mocks.persistValues['terminal.workspace.root'] = '/workspace/projects'

    render(<TerminalPage />)

    const parentButton = screen.getByRole('button', { name: '返回上级目录' })
    const historyButton = screen.getByRole('button', { name: '返回历史目录' })
    const listButton = screen.getByRole('button', { name: '列表显示' })

    expect(historyButton.compareDocumentPosition(parentButton)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(parentButton.compareDocumentPosition(listButton)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(historyButton.compareDocumentPosition(listButton)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('navigates to the workspace parent and back from the toolbar', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace/projects'

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: '返回上级目录' }))
    await waitFor(() =>
      expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-root-path', '/workspace')
    )

    await user.click(screen.getByRole('button', { name: '返回历史目录' }))
    await waitFor(() =>
      expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-root-path', '/workspace/projects')
    )
  })

  it('navigates parent and child history from the toolbar in tree view', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace/projects'
    mocks.persistValues['terminal.workspace.view_mode'] = 'tree'

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: '返回上级目录' }))
    await waitFor(() =>
      expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-root-path', '/workspace')
    )
    expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-view-mode', 'tree')

    await user.click(screen.getByRole('button', { name: '返回历史目录' }))
    await waitFor(() =>
      expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-root-path', '/workspace/projects')
    )
    expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-view-mode', 'tree')
  })

  it('keeps expanded tree directories when opening a file preview', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.persistValues['terminal.workspace.view_mode'] = 'tree'
    mocks.persistValues['terminal.workspace.preview_open'] = false

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'expand src' }))
    await user.click(screen.getByRole('button', { name: 'select file' }))

    expect(screen.getByTestId('workspace-preview-pane')).toBeInTheDocument()
    expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-expanded-tree-paths', '/workspace/src')
  })

  it('changes the workspace root from the path breadcrumb', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace/project'

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: '/workspace' }))

    expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-root-path', '/workspace')
  })

  it('edits the workspace root when the path bar is double-clicked', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace/project'

    render(<TerminalPage />)

    await user.dblClick(screen.getByTestId('terminal-workspace-path-bar'))
    await user.clear(screen.getByDisplayValue('/workspace/project'))
    await user.keyboard('/tmp/new-root{Enter}')

    expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-root-path', '/tmp/new-root')
  })

  it('selects the full workspace path when path editing starts from a double click', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace/project'

    render(<TerminalPage />)

    await user.dblClick(screen.getByTestId('terminal-workspace-path-bar'))

    const input = screen.getByRole('textbox', { name: '输入工作区路径' }) as HTMLInputElement
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe('/workspace/project'.length)
  })

  it('uses the active terminal session cwd for terminal path links', () => {
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.activeSession = { id: 'session-1', cwd: '/home/me', buffer: [] }

    render(<TerminalPage />)

    expect(screen.getByTestId('terminal-pane')).toHaveAttribute('data-cwd', '/home/me')
  })

  it('follows the active terminal session cwd in the file manager when directory keeping is off', () => {
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.activeSession = { id: 'session-1', cwd: '/workspace/app', buffer: [] }

    render(<TerminalPage />)

    expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-root-path', '/workspace/app')
  })

  it('uses the initial active terminal cwd before the default home workspace resolves', async () => {
    mocks.activeSession = { id: 'session-1', cwd: '/workspace/中文目录', buffer: [] }

    render(<TerminalPage />)

    expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-root-path', '/workspace/中文目录')
    await waitFor(() => expect(mocks.resolvePath).toHaveBeenCalledWith('~'))
    expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-root-path', '/workspace/中文目录')
  })

  it('decodes URI-encoded terminal cwd values before following them in the file manager', () => {
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.activeSession = { id: 'session-1', cwd: '/workspace/%E4%B8%AD%E6%96%87%E7%9B%AE%E5%BD%95', buffer: [] }

    render(<TerminalPage />)

    expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-root-path', '/workspace/中文目录')
  })

  it('keeps a user-selected folder when directory keeping is off until the terminal cwd changes', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.activeSession = { id: 'session-1', cwd: '/workspace/app', buffer: [] }

    render(<TerminalPage />)

    expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-root-path', '/workspace/app')

    await user.click(screen.getByRole('button', { name: 'select directory' }))

    expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-root-path', '/workspace/src')
  })

  it('keeps a chosen workspace when directory keeping is off until the terminal cwd changes', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.activeSession = { id: 'session-1', cwd: '/workspace/app', buffer: [] }
    window.api.file.selectFolder = vi.fn().mockResolvedValue('/picked/workspace')

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: '选择工作区' }))

    expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-root-path', '/picked/workspace')
  })

  it('keeps the file manager directory when directory keeping is on', () => {
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.persistValues['terminal.workspace.keep_directory'] = true
    mocks.activeSession = { id: 'session-1', cwd: '/workspace/app', buffer: [] }

    render(<TerminalPage />)

    expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-root-path', '/workspace')
  })

  it('toggles directory keeping from the file manager toolbar', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: '目录保持' }))

    expect(mocks.persistValues['terminal.workspace.keep_directory']).toBe(true)
  })

  it('toggles hidden file display from an icon toolbar button', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: '显示隐藏文件' }))

    expect(mocks.persistValues['terminal.workspace.include_hidden']).toBe(true)
  })

  it('opens and removes favorite workspace directories from the favorites menu', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.persistValues['terminal.workspace.favorite_directories'] = ['/workspace/src']

    render(<TerminalPage />)

    const favoriteButton = screen.getByRole('button', { name: '收藏' })
    expect(favoriteButton).toHaveAttribute('data-variant', 'ghost')
    expect(favoriteButton.querySelector('.fill-current')).not.toBeNull()

    await user.click(favoriteButton)
    await user.click(screen.getByRole('button', { name: '/workspace/src' }))

    expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-root-path', '/workspace/src')

    await user.click(screen.getByRole('button', { name: '取消收藏 /workspace/src' }))

    expect(mocks.persistValues['terminal.workspace.favorite_directories']).toEqual([])
    expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-favorites', '')
  })

  it('shows an outline favorite button icon when no workspace directories are favorited', async () => {
    render(<TerminalPage />)

    const favoriteButton = screen.getByRole('button', { name: '收藏' })
    expect(favoriteButton).toHaveAttribute('data-variant', 'ghost')
    expect(favoriteButton.querySelector('.fill-current')).toBeNull()
    await waitFor(() =>
      expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-root-path', '/Users/alice')
    )
  })

  it('opens workspace search from the file manager toolbar', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: '搜索文件' }))

    expect(screen.getByRole('heading', { name: '搜索文件' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '搜索文件或文件夹' })).toBeInTheDocument()
    expect(mocks.listDirectoryEntries).not.toHaveBeenCalled()
  })

  it('searches workspace entries with the query instead of recursively loading the whole workspace', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: '搜索文件' }))
    await user.type(screen.getByRole('textbox', { name: '搜索文件或文件夹' }), 'guide')

    await waitFor(() =>
      expect(mocks.listDirectoryEntries).toHaveBeenCalledWith(
        '/workspace',
        expect.objectContaining({
          includeDirectories: true,
          includeFiles: true,
          includeHidden: false,
          maxEntries: 100,
          maxDepth: 0,
          searchPattern: 'guide',
          recursive: true
        })
      )
    )
  })

  it('starts workspace search requests shortly after typing', async () => {
    vi.useFakeTimers()
    try {
      mocks.persistValues['terminal.workspace.root'] = '/workspace'

      render(<TerminalPage />)

      fireEvent.click(screen.getByRole('button', { name: '搜索文件' }))
      const input = screen.getByRole('textbox', { name: '搜索文件或文件夹' })
      fireEvent.change(input, { target: { value: 'guide' } })
      await act(async () => {})

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60)
      })

      expect(mocks.listDirectoryEntries).toHaveBeenCalledWith(
        '/workspace',
        expect.objectContaining({ searchPattern: 'guide' })
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('coalesces short workspace search input before requesting the filesystem', async () => {
    vi.useFakeTimers()
    try {
      mocks.persistValues['terminal.workspace.root'] = '/workspace'

      render(<TerminalPage />)

      fireEvent.click(screen.getByRole('button', { name: '搜索文件' }))
      const input = screen.getByRole('textbox', { name: '搜索文件或文件夹' })
      fireEvent.change(input, { target: { value: 'a' } })
      fireEvent.change(input, { target: { value: 'ab' } })
      await act(async () => {})

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })

      expect(mocks.listDirectoryEntries).not.toHaveBeenCalled()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(80)
      })

      expect(mocks.listDirectoryEntries).toHaveBeenCalledTimes(1)
      expect(mocks.listDirectoryEntries).toHaveBeenCalledWith(
        '/workspace',
        expect.objectContaining({ searchPattern: 'ab' })
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('switches workspace search between current directory and global home with buttons and Tab', async () => {
    mocks.persistValues['terminal.workspace.root'] = '/workspace/src'

    render(<TerminalPage />)

    await waitFor(() => expect(mocks.resolvePath).toHaveBeenCalledWith('~'))
    fireEvent.click(screen.getByRole('button', { name: '搜索文件' }))

    const input = screen.getByRole('textbox', { name: '搜索文件或文件夹' })
    fireEvent.change(input, { target: { value: 'guide' } })

    await waitFor(() =>
      expect(mocks.listDirectoryEntries).toHaveBeenLastCalledWith(
        '/workspace/src',
        expect.objectContaining({ searchPattern: 'guide' })
      )
    )

    fireEvent.click(screen.getByRole('button', { name: '全局' }))

    await waitFor(() =>
      expect(mocks.listDirectoryEntries).toHaveBeenLastCalledWith(
        '/Users/alice',
        expect.objectContaining({ searchPattern: 'guide' })
      )
    )

    fireEvent.keyDown(input, { key: 'Tab' })

    await waitFor(() =>
      expect(mocks.listDirectoryEntries).toHaveBeenLastCalledWith(
        '/workspace/src',
        expect.objectContaining({ searchPattern: 'guide' })
      )
    )
    expect(input).toHaveFocus()
  })

  it('stops showing the workspace search loading state when the search request stalls', async () => {
    vi.useFakeTimers()
    try {
      mocks.persistValues['terminal.workspace.root'] = '/workspace'
      mocks.listDirectoryEntries.mockReturnValue(new Promise(() => {}))

      render(<TerminalPage />)

      act(() => {
        void mocks.commandHandlers['file_manager.search']?.()
      })
      fireEvent.change(screen.getByRole('textbox', { name: '搜索文件或文件夹' }), { target: { value: 'guide' } })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(120)
      })

      expect(screen.getByText('正在搜索工作区文件')).toBeInTheDocument()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000)
      })

      expect(screen.getByText('无法搜索工作区文件')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not keep showing stale workspace search results while a later query is still loading', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.listDirectoryEntries.mockResolvedValueOnce([{ path: '/workspace/docs/guide.md', isDirectory: false }])

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: '搜索文件' }))
    await user.type(screen.getByRole('textbox', { name: '搜索文件或文件夹' }), 'guide')

    await waitFor(() => expect(screen.getByRole('button', { name: /guide\.md/ })).toBeInTheDocument())

    mocks.listDirectoryEntries.mockReturnValueOnce(new Promise(() => {}))
    fireEvent.change(screen.getByRole('textbox', { name: '搜索文件或文件夹' }), { target: { value: 'guides' } })

    await waitFor(() => expect(mocks.listDirectoryEntries).toHaveBeenLastCalledWith('/workspace', expect.any(Object)))

    expect(screen.queryByRole('button', { name: /guide\.md/ })).not.toBeInTheDocument()
    expect(screen.getByText('正在搜索工作区文件')).toBeInTheDocument()
  })

  it('refreshes workspace search results after the fourth typed character', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.listDirectoryEntries
      .mockResolvedValueOnce([{ path: '/workspace/docs/abc.md', isDirectory: false }])
      .mockResolvedValueOnce([{ path: '/workspace/docs/abcd.md', isDirectory: false }])

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: '搜索文件' }))
    const input = screen.getByRole('textbox', { name: '搜索文件或文件夹' })
    fireEvent.change(input, { target: { value: 'abc' } })

    await waitFor(() => expect(screen.getByRole('button', { name: /abc\.md/ })).toBeInTheDocument())

    fireEvent.change(input, { target: { value: 'abcd' } })

    await waitFor(() => expect(screen.getByRole('button', { name: /abcd\.md/ })).toBeInTheDocument())

    expect(screen.queryByRole('button', { name: /abc\.md/ })).not.toBeInTheDocument()
  })

  it('filters cached workspace search results while a narrower query is loading', async () => {
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.listDirectoryEntries
      .mockResolvedValueOnce([
        { path: '/workspace/docs/guide.md', isDirectory: false },
        { path: '/workspace/docs/gist.md', isDirectory: false }
      ])
      .mockReturnValueOnce(new Promise(() => {}))

    render(<TerminalPage />)

    fireEvent.click(screen.getByRole('button', { name: '搜索文件' }))
    const input = screen.getByRole('textbox', { name: '搜索文件或文件夹' })
    fireEvent.change(input, { target: { value: 'gui' } })

    await waitFor(() => expect(screen.getByRole('button', { name: /guide\.md/ })).toBeInTheDocument())

    fireEvent.change(input, { target: { value: 'guid' } })

    expect(screen.getByRole('button', { name: /guide\.md/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /gist\.md/ })).not.toBeInTheDocument()
    expect(screen.getByText('正在搜索工作区文件')).toBeInTheDocument()
  })

  it('cancels the previous workspace search request when a newer request starts', async () => {
    vi.useFakeTimers()
    try {
      mocks.persistValues['terminal.workspace.root'] = '/workspace'
      mocks.listDirectoryEntries.mockReturnValue(new Promise(() => {}))

      render(<TerminalPage />)

      fireEvent.click(screen.getByRole('button', { name: '搜索文件' }))
      const input = screen.getByRole('textbox', { name: '搜索文件或文件夹' })
      fireEvent.change(input, { target: { value: 'guide' } })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(40)
      })

      expect(mocks.listDirectoryEntries).toHaveBeenCalledTimes(1)
      const firstRequestId = mocks.listDirectoryEntries.mock.calls[0]?.[1]?.searchRequestId
      expect(firstRequestId).toEqual(expect.any(String))

      fireEvent.change(input, { target: { value: 'guides' } })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(40)
      })

      expect(mocks.cancelDirectorySearch).toHaveBeenCalledWith(firstRequestId)
      expect(mocks.listDirectoryEntries).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps workspace search usable when the preload does not expose directory search cancellation', async () => {
    vi.useFakeTimers()
    const originalCancelDirectorySearch = window.api.file.cancelDirectorySearch
    try {
      mocks.persistValues['terminal.workspace.root'] = '/workspace'
      mocks.listDirectoryEntries.mockReturnValue(new Promise(() => {}))
      window.api.file.cancelDirectorySearch = undefined as unknown as typeof window.api.file.cancelDirectorySearch

      render(<TerminalPage />)

      fireEvent.click(screen.getByRole('button', { name: '搜索文件' }))
      const input = screen.getByRole('textbox', { name: '搜索文件或文件夹' })
      fireEvent.change(input, { target: { value: 'guide' } })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(40)
      })

      fireEvent.change(input, { target: { value: 'guides' } })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(40)
      })

      expect(mocks.listDirectoryEntries).toHaveBeenCalledTimes(2)
    } finally {
      window.api.file.cancelDirectorySearch = originalCancelDirectorySearch
      vi.useRealTimers()
    }
  })

  it('opens workspace search from the terminal page command handler', () => {
    mocks.persistValues['terminal.workspace.root'] = '/workspace'

    render(<TerminalPage />)

    act(() => {
      void mocks.commandHandlers['file_manager.search']?.()
    })

    expect(screen.getByRole('heading', { name: '搜索文件' })).toBeInTheDocument()
  })

  it('filters workspace search results with wildcards without previewing the highlighted file', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.persistValues['terminal.workspace.preview_open'] = false

    render(<TerminalPage />)

    act(() => {
      void mocks.commandHandlers['file_manager.search']?.()
    })

    await user.type(screen.getByRole('textbox', { name: '搜索文件或文件夹' }), '*.md')

    await waitFor(() => expect(screen.getByRole('button', { name: /guide\.md/ })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /index\.ts/ })).not.toBeInTheDocument()
    expect(screen.queryByTestId('mock-workspace-preview-pane')).not.toBeInTheDocument()
  })

  it('keeps fuzzy workspace search results returned by the file search API', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.listDirectoryEntries.mockResolvedValue([
      { path: '/workspace/src/FooBarController.ts', isDirectory: false },
      { path: '/workspace/docs/fallback.txt', isDirectory: false }
    ])

    render(<TerminalPage />)

    act(() => {
      void mocks.commandHandlers['file_manager.search']?.()
    })

    await user.type(screen.getByRole('textbox', { name: '搜索文件或文件夹' }), 'fbc')

    await waitFor(() => expect(screen.getByRole('button', { name: /FooBarController\.ts/ })).toBeInTheDocument())
  })

  it('renders fuzzy search results that do not contain the typed text contiguously', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.listDirectoryEntries.mockResolvedValue([
      { path: '/workspace/guotao-project/readme.md', isDirectory: false },
      { path: '/workspace/gateway-tools', isDirectory: true }
    ])

    render(<TerminalPage />)

    act(() => {
      void mocks.commandHandlers['file_manager.search']?.()
    })

    await user.type(screen.getByRole('textbox', { name: '搜索文件或文件夹' }), 'gt')

    await waitFor(() => expect(screen.getByRole('button', { name: /guotao-project/ })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /gateway-tools/ })).toBeInTheDocument()
  })

  it('uses a non-wildcard candidate query for workspace wildcard searches', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'

    render(<TerminalPage />)

    act(() => {
      void mocks.commandHandlers['file_manager.search']?.()
    })

    await user.type(screen.getByRole('textbox', { name: '搜索文件或文件夹' }), '*.md')

    await waitFor(() =>
      expect(mocks.listDirectoryEntries).toHaveBeenLastCalledWith(
        '/workspace',
        expect.objectContaining({ searchPattern: '.md' })
      )
    )
  })

  it('orders workspace search results by filename relevance before path-only matches', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.listDirectoryEntries.mockResolvedValue([
      { path: '/workspace/archive/guide-notes/random.txt', isDirectory: false },
      { path: '/workspace/docs/guide.md', isDirectory: false },
      { path: '/workspace/guide', isDirectory: true },
      { path: '/workspace/docs/my-guide.md', isDirectory: false }
    ])

    render(<TerminalPage />)

    act(() => {
      void mocks.commandHandlers['file_manager.search']?.()
    })

    await user.type(screen.getByRole('textbox', { name: '搜索文件或文件夹' }), 'guide')
    await waitFor(() => expect(screen.getByRole('button', { name: /^guide\s+guide$/ })).toBeInTheDocument())

    const resultNames = screen
      .getAllByRole('button')
      .filter((button) => button.hasAttribute('aria-selected'))
      .map((button) => button.textContent)

    expect(resultNames).toEqual([
      'guideguide',
      'guide.mddocs/guide.md',
      'my-guide.mddocs/my-guide.md',
      'random.txtarchive/guide-notes/random.txt'
    ])
  })

  it('keeps exact workspace search matches before partial matches', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.listDirectoryEntries.mockResolvedValue([
      { path: '/workspace/docs/my-guide.md', isDirectory: false },
      { path: '/workspace/docs/guidebook.md', isDirectory: false },
      { path: '/workspace/docs/guide.md', isDirectory: false },
      { path: '/workspace/guide', isDirectory: true }
    ])

    render(<TerminalPage />)

    act(() => {
      void mocks.commandHandlers['file_manager.search']?.()
    })

    await user.type(screen.getByRole('textbox', { name: '搜索文件或文件夹' }), 'guide')
    await waitFor(() => expect(screen.getByRole('button', { name: /^guide\s+guide$/ })).toBeInTheDocument())

    const resultNames = screen
      .getAllByRole('button')
      .filter((button) => button.hasAttribute('aria-selected'))
      .map((button) => button.textContent)

    expect(resultNames.slice(0, 2)).toEqual(['guideguide', 'guide.mddocs/guide.md'])
  })

  it('does not select a workspace search result while the user is typing', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'

    render(<TerminalPage />)

    act(() => {
      void mocks.commandHandlers['file_manager.search']?.()
    })

    await user.type(screen.getByRole('textbox', { name: '搜索文件或文件夹' }), '.')
    await waitFor(() => expect(screen.getByRole('button', { name: /guide\.md/ })).toBeInTheDocument())

    expect(
      screen.getAllByRole('button').filter((button) => button.getAttribute('aria-selected') === 'true')
    ).toHaveLength(0)
    await user.keyboard('{Enter}')
    expect(screen.queryByRole('heading', { name: '搜索文件' })).toBeInTheDocument()
  })

  it('uses arrow keys to switch workspace search selection without previewing files', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.persistValues['terminal.workspace.preview_open'] = false

    render(<TerminalPage />)

    act(() => {
      void mocks.commandHandlers['file_manager.search']?.()
    })

    const input = screen.getByRole('textbox', { name: '搜索文件或文件夹' })
    await user.type(input, '.')
    await waitFor(() => expect(screen.getByRole('button', { name: /guide\.md/ })).toBeInTheDocument())

    await user.keyboard('{ArrowDown}')

    expect(
      screen.getAllByRole('button').filter((button) => button.getAttribute('aria-selected') === 'true')
    ).toHaveLength(1)
    expect(screen.queryByTestId('mock-workspace-preview-pane')).not.toBeInTheDocument()
  })

  it('does not preview a searched file when hovering over the search result', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.persistValues['terminal.workspace.preview_open'] = false

    render(<TerminalPage />)

    act(() => {
      void mocks.commandHandlers['file_manager.search']?.()
    })

    await user.type(screen.getByRole('textbox', { name: '搜索文件或文件夹' }), '*.md')
    const result = await screen.findByRole('button', { name: /guide\.md/ })

    await user.hover(result)

    expect(result).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByTestId('mock-workspace-preview-pane')).not.toBeInTheDocument()
  })

  it('opens a searched file in its parent directory and keeps it selected for preview', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.persistValues['terminal.workspace.preview_open'] = false

    render(<TerminalPage />)

    act(() => {
      void mocks.commandHandlers['file_manager.search']?.()
    })

    await user.type(screen.getByRole('textbox', { name: '搜索文件或文件夹' }), '*.md')
    await waitFor(() => expect(screen.getByRole('button', { name: /guide\.md/ })).toBeInTheDocument())
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Enter}')

    expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-root-path', '/workspace/docs')
    expect(screen.getByTestId('mock-workspace-preview-pane')).toHaveAttribute(
      'data-file-path',
      '/workspace/docs/guide.md'
    )
    expect(screen.queryByRole('heading', { name: '搜索文件' })).not.toBeInTheDocument()
  })

  it('opens a searched directory in the file manager', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'

    render(<TerminalPage />)

    act(() => {
      void mocks.commandHandlers['file_manager.search']?.()
    })

    await user.type(screen.getByRole('textbox', { name: '搜索文件或文件夹' }), 'docs')
    await waitFor(() => expect(screen.getByRole('button', { name: /^docs\s+docs$/ })).toBeInTheDocument())
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Enter}')

    expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-root-path', '/workspace/docs')
    expect(screen.queryByRole('heading', { name: '搜索文件' })).not.toBeInTheDocument()
  })

  it('adds favorite directories from the file tree', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'favorite src' }))

    expect(mocks.persistValues['terminal.workspace.favorite_directories']).toEqual(['/workspace/src'])
    expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-favorites', '/workspace/src')
  })

  it('persists the workspace icon thumbnail size in icon view', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.persistValues['terminal.workspace.view_mode'] = 'icons'

    render(<TerminalPage />)

    expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-icon-size', 'medium')

    await user.click(screen.getByRole('button', { name: '大图标' }))

    expect(mocks.persistValues['terminal.workspace.icon_size']).toBe('large')
    expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-icon-size', 'large')
  })

  it('keeps the terminal font size in persisted page state', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.font_size'] = 28

    render(<TerminalPage />)

    expect(screen.getByTestId('terminal-pane')).toHaveAttribute('data-font-size', '28')

    await user.click(screen.getByRole('button', { name: 'change terminal font' }))

    expect(mocks.persistValues['terminal.font_size']).toBe(30)
    expect(screen.getByTestId('terminal-pane')).toHaveAttribute('data-font-size', '30')
  })

  it('persists the selected terminal display theme and applies it to the terminal pane', async () => {
    const user = userEvent.setup()

    render(<TerminalPage />)

    expect(screen.getByTestId('terminal-tabs')).toHaveAttribute('data-selected-theme-key', 'default-dark')
    expect(screen.getByTestId('terminal-pane')).toHaveAttribute('data-terminal-background', '#000000')

    await user.click(screen.getByRole('button', { name: 'select dracula terminal theme' }))

    expect(mocks.persistValues['terminal.theme']).toBe('dracula')
    expect(screen.getByTestId('terminal-tabs')).toHaveAttribute('data-selected-theme-key', 'dracula')
    expect(screen.getByTestId('terminal-pane')).toHaveAttribute('data-terminal-background', '#282a36')
  })

  it('opens workspace files through the shared safe-open helper', async () => {
    const user = userEvent.setup()

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'select file' }))
    await user.click(screen.getByRole('button', { name: 'open system' }))

    expect(mocks.safeOpen).toHaveBeenCalledWith({ kind: 'path', path: '/workspace/run.sh' })
  })

  it('keeps the active file preview when a directory row is selected', async () => {
    const user = userEvent.setup()

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'select file' }))
    expect(screen.getByTestId('mock-workspace-preview-pane')).toHaveAttribute('data-file-path', '/workspace/run.sh')

    await user.click(screen.getByRole('button', { name: 'select directory' }))
    expect(screen.getByTestId('mock-workspace-preview-pane')).toHaveAttribute('data-file-path', '/workspace/run.sh')
  })

  it('closes the embedded preview pane without clearing the file selection', async () => {
    const user = userEvent.setup()

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'select file' }))
    expect(screen.getByTestId('mock-workspace-preview-pane')).toHaveAttribute('data-file-path', '/workspace/run.sh')

    await user.click(screen.getByRole('button', { name: 'close preview' }))
    expect(screen.queryByTestId('mock-workspace-preview-pane')).not.toBeInTheDocument()
  })

  it('places the file preview to the right of the file tree in bottom split mode', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.persistValues['terminal.layout.mode'] = 'bottom'

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'select file' }))

    expect(screen.getByTestId('mock-resizable-panel-group')).toHaveAttribute('data-direction', 'horizontal')
  })

  it('shows an error toast when external workspace file opening fails', async () => {
    const user = userEvent.setup()
    mocks.safeOpen.mockRejectedValueOnce(new Error('open failed'))

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'select file' }))
    await user.click(screen.getByRole('button', { name: 'open system' }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith('无法打开此文件'))
  })

  it('previews file paths activated from terminal output', async () => {
    const user = userEvent.setup()

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'activate terminal file' }))

    await waitFor(() =>
      expect(screen.getByTestId('mock-workspace-preview-pane')).toHaveAttribute(
        'data-file-path',
        '/workspace/from-terminal.txt'
      )
    )
  })

  it('selects directory paths activated from terminal output without replacing the active preview', async () => {
    const user = userEvent.setup()
    mocks.isDirectory.mockImplementation((path: string) => Promise.resolve(path.endsWith('-dir')))

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'select file' }))
    await user.click(screen.getByRole('button', { name: 'activate terminal directory' }))

    await waitFor(() =>
      expect(screen.getByTestId('mock-workspace-preview-pane')).toHaveAttribute('data-file-path', '/workspace/run.sh')
    )
  })

  it('sets an activated directory outside the current workspace as the workspace root', async () => {
    const user = userEvent.setup()
    mocks.isDirectory.mockResolvedValue(true)

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'activate terminal directory' }))

    await waitFor(() =>
      expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute(
        'data-root-path',
        '/workspace/from-terminal-dir'
      )
    )
  })

  it('returns to the child history directory after navigating to the parent directory', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace/projects'

    render(<TerminalPage />)

    await waitFor(() =>
      expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-root-path', '/workspace/projects')
    )

    await user.click(screen.getByRole('button', { name: 'navigate parent' }))
    await waitFor(() =>
      expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-root-path', '/workspace')
    )

    await user.click(screen.getByRole('button', { name: 'navigate child history' }))
    await waitFor(() =>
      expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-root-path', '/workspace/projects')
    )
  })

  it('keeps the terminal visible while the initial session is being created', async () => {
    render(<TerminalPage />)

    expect(mocks.persistValues['terminal.workspace.terminal_visible']).toBe(true)
    await waitFor(() =>
      expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-root-path', '/Users/alice')
    )
  })

  it('does not start a new session while the terminal pane is hidden', async () => {
    mocks.persistValues['terminal.workspace.terminal_visible'] = false

    render(<TerminalPage />)

    expect(mocks.ensureSession).not.toHaveBeenCalled()
    expect(mocks.createSession).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-root-path', '/Users/alice')
    )
  })

  it('hides the terminal pane after the last terminal session is closed', async () => {
    const activeSession = { id: 'session-1', cwd: '/workspace', buffer: [] as [] }
    mocks.sessions = [activeSession]
    mocks.activeSession = activeSession
    const { rerender } = render(<TerminalPage />)

    mocks.sessions = []
    mocks.activeSession = null
    rerender(<TerminalPage />)

    expect(mocks.persistValues['terminal.workspace.terminal_visible']).toBe(false)
    await waitFor(() =>
      expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-root-path', '/workspace')
    )
  })

  it('ensures a new terminal session when showing the pane after every session was closed', async () => {
    const user = userEvent.setup()
    const activeSession = { id: 'session-1', cwd: '/workspace', buffer: [] as [] }
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.sessions = [activeSession]
    mocks.activeSession = activeSession
    const { rerender } = render(<TerminalPage />)

    mocks.sessions = []
    mocks.activeSession = null
    rerender(<TerminalPage />)
    mocks.ensureSession.mockClear()

    await user.click(screen.getByRole('button', { name: 'show terminal' }))

    expect(mocks.ensureSession).toHaveBeenCalledWith({ cwd: '/workspace' })
    expect(mocks.createSession).not.toHaveBeenCalled()
  })

  it('creates a terminal session in the current workspace when the terminal pane is shown', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace/project'

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'show terminal' }))

    expect(mocks.ensureSession).toHaveBeenLastCalledWith({ cwd: '/workspace/project' })
  })

  it('creates new terminal tabs in the current workspace', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace/project'

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'create terminal session' }))

    expect(mocks.createSession).toHaveBeenLastCalledWith({ cwd: '/workspace/project' })
  })

  it('creates a custom quick command from the terminal bar dialog', async () => {
    const user = userEvent.setup()

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'open quick command dialog' }))
    expect(screen.getByText('指令内容')).toBeInTheDocument()
    expect(screen.getByText('显示方式')).toBeInTheDocument()
    await user.type(screen.getByLabelText('指令'), 'pnpm dev')
    await user.click(screen.getByRole('button', { name: '确认' }))

    expect(mocks.persistValues['terminal.quick_commands']).toEqual([
      expect.objectContaining({ command: 'pnpm dev', label: 'pnpm' })
    ])
  })

  it('runs a quick command in the active idle terminal session', async () => {
    const user = userEvent.setup()
    const activeSession = { id: 'session-1', cwd: '/workspace', buffer: [] as [] }
    mocks.sessions = [activeSession]
    mocks.activeSession = activeSession
    mocks.persistValues['terminal.quick_commands'] = [{ id: 'cmd-1', command: 'pnpm dev', label: 'Dev' }]

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'run quick command cmd-1' }))

    expect(mocks.sendInput).toHaveBeenCalledWith('session-1', 'pnpm dev\n')
    expect(mocks.createSession).not.toHaveBeenCalled()
  })

  it('requests focus back to the terminal pane after running a quick command', async () => {
    const user = userEvent.setup()
    const activeSession = { id: 'session-1', cwd: '/workspace', buffer: [] as [] }
    mocks.sessions = [activeSession]
    mocks.activeSession = activeSession
    mocks.persistValues['terminal.quick_commands'] = [{ id: 'cmd-1', command: 'pnpm dev', label: 'Dev' }]

    render(<TerminalPage />)

    expect(screen.getByTestId('terminal-pane')).toHaveAttribute('data-focus-request-key', '0')

    await user.click(screen.getByRole('button', { name: 'run quick command cmd-1' }))

    expect(screen.getByTestId('terminal-pane')).toHaveAttribute('data-focus-request-key', '1')
  })

  it('ignores duplicate quick command triggers while the first run is still in flight', async () => {
    const user = userEvent.setup()
    const activeSession = { id: 'session-1', cwd: '/workspace', buffer: [] as [] }
    mocks.sessions = [activeSession]
    mocks.activeSession = activeSession
    mocks.persistValues['terminal.quick_commands'] = [{ id: 'cmd-1', command: 'pnpm dev', label: 'Dev' }]
    let resolveSendInput: (() => void) | undefined
    mocks.sendInput.mockReturnValueOnce(new Promise<void>((resolve) => (resolveSendInput = resolve)))

    render(<TerminalPage />)

    const quickCommandButton = screen.getByRole('button', { name: 'run quick command cmd-1' })
    await user.click(quickCommandButton)
    await user.click(quickCommandButton)
    await act(async () => {
      resolveSendInput?.()
    })

    expect(mocks.sendInput).toHaveBeenCalledTimes(1)
    expect(mocks.sendInput).toHaveBeenCalledWith('session-1', 'pnpm dev\n')
    expect(mocks.createSession).not.toHaveBeenCalled()
  })

  it('runs a quick command in a new terminal session when the active terminal has a process', async () => {
    const user = userEvent.setup()
    const activeSession = { id: 'session-1', cwd: '/workspace', processName: 'pnpm', buffer: [] as [] }
    mocks.sessions = [activeSession]
    mocks.activeSession = activeSession
    mocks.persistValues['terminal.quick_commands'] = [{ id: 'cmd-1', command: 'npm test', label: 'Test' }]
    mocks.createSession.mockResolvedValueOnce({ id: 'session-2', cwd: '/workspace', buffer: [] })

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'run quick command cmd-1' }))

    expect(mocks.createSession).toHaveBeenCalledWith({ cwd: '/workspace' })
    expect(mocks.sendInput).toHaveBeenCalledWith('session-2', 'npm test\n')
  })

  it('deletes a custom quick command from its terminal bar menu action', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.quick_commands'] = [{ id: 'cmd-1', command: 'pnpm dev', label: 'Dev' }]

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'delete quick command cmd-1' }))

    expect(mocks.persistValues['terminal.quick_commands']).toEqual([])
  })

  it('asks for confirmation before closing a terminal session with a running process', async () => {
    const user = userEvent.setup()
    const activeSession = { id: 'session-1', cwd: '/workspace', processName: 'pnpm', buffer: [] as [] }
    mocks.sessions = [activeSession]
    mocks.activeSession = activeSession
    mocks.confirm.mockReturnValue(true)

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'close session-1' }))

    expect(mocks.confirm).toHaveBeenCalledWith('终端中正在运行 pnpm，确认关闭该终端页？')
    expect(mocks.closeSession).toHaveBeenCalledWith('session-1')
  })

  it('keeps a terminal session open when running-process close confirmation is cancelled', async () => {
    const user = userEvent.setup()
    const activeSession = { id: 'session-1', cwd: '/workspace', processName: 'pnpm', buffer: [] as [] }
    mocks.sessions = [activeSession]
    mocks.activeSession = activeSession
    mocks.confirm.mockReturnValue(false)

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'close session-1' }))

    expect(mocks.confirm).toHaveBeenCalledWith('终端中正在运行 pnpm，确认关闭该终端页？')
    expect(mocks.closeSession).not.toHaveBeenCalled()
  })

  it('switches terminal tabs with terminal shortcut commands', async () => {
    const sessions = [
      { id: 'session-1', cwd: '/workspace/one', buffer: [] as [] },
      { id: 'session-2', cwd: '/workspace/two', buffer: [] as [] },
      { id: 'session-3', cwd: '/workspace/three', buffer: [] as [] }
    ]
    mocks.sessions = sessions
    mocks.activeSession = sessions[1]

    render(<TerminalPage />)

    await waitFor(() => expect(mocks.commandHandlers['terminal.switch_next']).toBeDefined())
    await mocks.commandHandlers['terminal.switch_next']()
    expect(mocks.setActiveSessionId).toHaveBeenCalledWith('session-3')

    await mocks.commandHandlers['terminal.switch_previous']()
    expect(mocks.setActiveSessionId).toHaveBeenCalledWith('session-1')
  })

  it('manages terminal tabs with terminal shortcut commands', async () => {
    const sessions = [
      { id: 'session-1', cwd: '/workspace/one', buffer: [] as [] },
      { id: 'session-2', cwd: '/workspace/two', buffer: [] as [] },
      { id: 'session-3', cwd: '/workspace/three', buffer: [] as [] }
    ]
    mocks.sessions = sessions
    mocks.activeSession = sessions[1]

    render(<TerminalPage />)

    await waitFor(() => expect(mocks.commandHandlers['terminal.new']).toBeDefined())
    await mocks.commandHandlers['terminal.new']()
    expect(mocks.createSession).toHaveBeenCalledWith({ cwd: '/workspace/two' })

    await mocks.commandHandlers['terminal.close_current']()
    expect(mocks.closeSession).toHaveBeenCalledWith('session-2')

    await mocks.commandHandlers['terminal.close_others']()
    expect(mocks.closeSession).toHaveBeenCalledWith('session-1')
    expect(mocks.closeSession).toHaveBeenCalledWith('session-3')

    mocks.closeSession.mockClear()
    await mocks.commandHandlers['terminal.close_all']()
    expect(mocks.closeSession).toHaveBeenCalledWith('session-1')
    expect(mocks.closeSession).toHaveBeenCalledWith('session-2')
    expect(mocks.closeSession).toHaveBeenCalledWith('session-3')
  })

  it('renames workspace files from the context menu prompt', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.ipcRequest.mockResolvedValue({ path: '/workspace/start.sh' })

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'context rename file' }))
    const input = await screen.findByRole('textbox')
    await user.clear(input)
    await user.type(input, 'start.sh{Enter}')

    expect(mocks.ipcRequest).toHaveBeenCalledWith('file.path_rename', {
      path: '/workspace/run.sh',
      newName: 'start.sh'
    })
  })

  it('moves workspace files to trash only after confirmation', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.confirm.mockReturnValue(true)
    mocks.ipcRequest.mockResolvedValue(undefined)

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'context trash file' }))

    expect(mocks.confirm).toHaveBeenCalled()
    expect(mocks.ipcRequest).toHaveBeenCalledWith('file.path_trash', { path: '/workspace/run.sh' })
  })

  it('copies workspace item and root paths from the context menu', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: mocks.clipboardWriteText }
    })
    mocks.persistValues['terminal.workspace.root'] = '/workspace'

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'context copy file path' }))
    await user.click(screen.getByRole('button', { name: 'context copy root path' }))

    expect(mocks.clipboardWriteText).toHaveBeenNthCalledWith(1, '/workspace/run.sh')
    expect(mocks.clipboardWriteText).toHaveBeenNthCalledWith(2, '/workspace')
  })

  it('copies multiple workspace paths as newline-separated text', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: mocks.clipboardWriteText }
    })
    mocks.persistValues['terminal.workspace.root'] = '/workspace'

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'context copy multiple paths' }))

    expect(mocks.clipboardWriteText).toHaveBeenCalledWith('/workspace/run.sh\n/workspace/app.log')
  })

  it('cancels workspace trash when confirmation is rejected', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.confirm.mockReturnValue(false)

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'context trash file' }))

    expect(mocks.ipcRequest).not.toHaveBeenCalledWith('file.path_trash', expect.anything())
  })

  it('creates files and folders from the blank area context menu', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.ipcRequest.mockResolvedValue({})

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'context new file' }))
    const fileNameInput = await screen.findByRole('textbox')
    await user.clear(fileNameInput)
    await user.type(fileNameInput, 'notes.md{Enter}')
    await user.click(screen.getByRole('button', { name: 'context new folder' }))
    const folderNameInput = await screen.findByRole('textbox')
    await user.clear(folderNameInput)
    await user.type(folderNameInput, 'Drafts{Enter}')

    expect(mocks.ipcRequest).toHaveBeenCalledWith('file.path_create_file', {
      parentPath: '/workspace',
      name: 'notes.md'
    })
    expect(mocks.ipcRequest).toHaveBeenCalledWith('file.path_create_directory', {
      parentPath: '/workspace',
      name: 'Drafts'
    })
  })

  it('requests workspace focus restoration after the name dialog closes', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'

    render(<TerminalPage />)

    expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-restore-focus-key', '0')
    await user.click(screen.getByRole('button', { name: 'context new file' }))
    await user.click(screen.getByRole('button', { name: '取消' }))

    expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-restore-focus-key', '1')
  })

  it('opens a terminal tab in the current directory from the blank area context menu', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'context open terminal here' }))

    expect(mocks.createSession).toHaveBeenLastCalledWith({ cwd: '/workspace' })
  })

  it('opens only one terminal tab from the file manager shortcut when the terminal pane is hidden', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.persistValues['terminal.workspace.terminal_visible'] = false

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'context open terminal here' }))

    expect(mocks.createSession).toHaveBeenCalledTimes(1)
    expect(mocks.createSession).toHaveBeenLastCalledWith({ cwd: '/workspace' })
    expect(mocks.ensureSession).not.toHaveBeenCalled()
  })

  it('pastes copied workspace files and resolves conflicts by renamed target', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.ipcRequest
      .mockResolvedValueOnce({
        status: 'conflict',
        existingPath: '/workspace/run.sh',
        suggestedName: 'run copy.sh'
      })
      .mockResolvedValueOnce({ status: 'completed', path: '/workspace/run copy 2.sh' })

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'context copy file' }))
    await user.click(screen.getByRole('button', { name: 'context paste' }))
    expect(await screen.findByText('粘贴冲突')).toBeInTheDocument()
    expect(screen.getByText('目标目录存在同名文件')).toBeInTheDocument()
    const input = await screen.findByRole('textbox')
    expect(input).toHaveValue('run copy.sh')
    await user.clear(input)
    await user.type(input, 'run copy 2.sh')
    await user.click(screen.getByRole('button', { name: '改名' }))

    expect(mocks.ipcRequest).toHaveBeenNthCalledWith(1, 'file.path_paste', {
      sourcePath: '/workspace/run.sh',
      targetDirectory: '/workspace',
      operation: 'copy',
      conflict: 'prompt'
    })
    expect(mocks.ipcRequest).toHaveBeenNthCalledWith(2, 'file.path_paste', {
      sourcePath: '/workspace/run.sh',
      targetDirectory: '/workspace',
      operation: 'copy',
      conflict: 'rename',
      newName: 'run copy 2.sh'
    })
  })

  it('requests workspace focus restoration after the paste conflict dialog closes', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.ipcRequest.mockResolvedValueOnce({
      status: 'conflict',
      existingPath: '/workspace/run.sh',
      suggestedName: 'run copy.sh'
    })

    render(<TerminalPage />)

    expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-restore-focus-key', '0')
    await user.click(screen.getByRole('button', { name: 'context copy file' }))
    await user.click(screen.getByRole('button', { name: 'context paste' }))
    expect(await screen.findByText('粘贴冲突')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '取消' }))

    expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-restore-focus-key', '1')
  })

  it('pastes from the latest shortcut clipboard before the menu state rerenders', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.ipcRequest.mockResolvedValueOnce({ status: 'completed', path: '/workspace/run copy.sh' })

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'context copy then paste immediately' }))

    expect(mocks.ipcRequest).toHaveBeenCalledWith('file.path_paste', {
      sourcePath: '/workspace/run.sh',
      targetDirectory: '/workspace',
      operation: 'copy',
      conflict: 'prompt'
    })
  })

  it('pastes into the latest workspace directory after shortcut copy and navigation', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.ipcRequest.mockResolvedValueOnce({ status: 'completed', path: '/workspace/src/run copy.sh' })

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'context copy navigate then paste immediately' }))

    expect(mocks.ipcRequest).toHaveBeenCalledWith('file.path_paste', {
      sourcePath: '/workspace/run.sh',
      targetDirectory: '/workspace/src',
      operation: 'copy',
      conflict: 'prompt'
    })
  })

  it('pastes multiple copied workspace files into the current directory', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.ipcRequest
      .mockResolvedValueOnce({ status: 'completed', path: '/workspace/run.sh' })
      .mockResolvedValueOnce({ status: 'completed', path: '/workspace/app.log' })

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'context copy multiple files' }))
    await user.click(screen.getByRole('button', { name: 'context paste' }))

    expect(mocks.ipcRequest).toHaveBeenNthCalledWith(1, 'file.path_paste', {
      sourcePath: '/workspace/run.sh',
      targetDirectory: '/workspace',
      operation: 'copy',
      conflict: 'prompt'
    })
    expect(mocks.ipcRequest).toHaveBeenNthCalledWith(2, 'file.path_paste', {
      sourcePath: '/workspace/app.log',
      targetDirectory: '/workspace',
      operation: 'copy',
      conflict: 'prompt'
    })
  })

  it('keeps prompting when the renamed paste target also conflicts', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.ipcRequest
      .mockResolvedValueOnce({
        status: 'conflict',
        existingPath: '/workspace/run.sh',
        suggestedName: 'run copy.sh'
      })
      .mockResolvedValueOnce({
        status: 'conflict',
        existingPath: '/workspace/run copy.sh',
        suggestedName: 'run copy 2.sh'
      })
      .mockResolvedValueOnce({ status: 'completed', path: '/workspace/run copy 2.sh' })

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'context copy file' }))
    await user.click(screen.getByRole('button', { name: 'context paste' }))
    const firstInput = await screen.findByRole('textbox')
    expect(firstInput).toHaveValue('run copy.sh')
    await user.clear(firstInput)
    await user.type(firstInput, 'run copy.sh')
    await user.click(screen.getByRole('button', { name: '改名' }))
    const secondInput = await screen.findByRole('textbox')
    expect(secondInput).toHaveValue('run copy 2.sh')
    await user.clear(secondInput)
    await user.type(secondInput, 'run copy 2.sh')
    await user.click(screen.getByRole('button', { name: '改名' }))

    expect(mocks.ipcRequest).toHaveBeenNthCalledWith(2, 'file.path_paste', {
      sourcePath: '/workspace/run.sh',
      targetDirectory: '/workspace',
      operation: 'copy',
      conflict: 'rename',
      newName: 'run copy.sh'
    })
    expect(mocks.ipcRequest).toHaveBeenNthCalledWith(3, 'file.path_paste', {
      sourcePath: '/workspace/run.sh',
      targetDirectory: '/workspace',
      operation: 'copy',
      conflict: 'rename',
      newName: 'run copy 2.sh'
    })
  })

  it('pastes cut workspace files and resolves conflicts by replacement', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.ipcRequest
      .mockResolvedValueOnce({
        status: 'conflict',
        existingPath: '/workspace/run.sh',
        suggestedName: 'run copy.sh'
      })
      .mockResolvedValueOnce({ status: 'completed', path: '/workspace/run.sh' })

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'context cut file' }))
    await user.click(screen.getByRole('button', { name: 'context paste' }))
    expect(await screen.findByRole('textbox')).toHaveValue('run copy.sh')
    await user.click(screen.getByRole('button', { name: '替换' }))

    expect(mocks.ipcRequest).toHaveBeenNthCalledWith(2, 'file.path_paste', {
      sourcePath: '/workspace/run.sh',
      targetDirectory: '/workspace',
      operation: 'move',
      conflict: 'replace'
    })
  })

  it('shows workspace path properties from the context menu', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.ipcRequest.mockResolvedValue({
      path: '/workspace',
      name: 'workspace',
      kind: 'directory',
      size: 100,
      createdAt: 1,
      modifiedAt: 2
    })

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'context root properties' }))

    expect(mocks.ipcRequest).toHaveBeenCalledWith('file.path_stat', { path: '/workspace' })
    expect(mocks.alert).toHaveBeenCalledWith(expect.stringContaining('/workspace'))
  })
})
