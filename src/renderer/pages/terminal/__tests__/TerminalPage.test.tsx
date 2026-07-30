import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  closeSession: vi.fn(),
  resizeSession: vi.fn(),
  sendInput: vi.fn(),
  setActiveSessionId: vi.fn(),
  commandHandlers: {} as Record<string, () => void | Promise<void>>,
  ipcRequest: vi.fn(),
  safeOpen: vi.fn(),
  toastError: vi.fn(),
  isDirectory: vi.fn(),
  resolvePath: vi.fn(),
  clipboardWriteText: vi.fn(),
  alert: vi.fn(),
  confirm: vi.fn(),
  prompt: vi.fn(),
  persistValues: {
    'terminal.workspace.root': null as string | null,
    'terminal.workspace.include_hidden': false,
    'terminal.workspace.view_mode': 'list' as 'list' | 'icons',
    'terminal.workspace.sort_key': 'name' as 'name' | 'mtime' | 'size',
    'terminal.workspace.sort_direction': 'asc' as 'asc' | 'desc',
    'terminal.workspace.preview_open': true,
    'terminal.workspace.preview_sizes': [55, 45] as [number, number],
    'terminal.workspace.terminal_visible': true,
    'terminal.workspace.keep_directory': false,
    'terminal.layout.mode': 'right' as 'right' | 'bottom' | 'terminal-maximized' | 'files-maximized',
    'terminal.font_size': 18
  },
  sessions: [] as Array<{
    id: string
    cwd: string
    buffer: []
  }>,
  activeSession: null as {
    id: string
    cwd: string
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
    activeSessionId: mocks.activeSession?.id ?? null,
    activeSession: mocks.activeSession,
    createSession: mocks.createSession,
    closeSession: mocks.closeSession,
    resizeSession: mocks.resizeSession,
    sendInput: mocks.sendInput,
    setActiveSessionId: mocks.setActiveSessionId
  })
}))

vi.mock('@renderer/hooks/command', () => ({
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
    onHeaderDoubleClick
  }: {
    actions?: React.ReactNode
    onCreate: () => void
    onHeaderDoubleClick?: () => void
  }) => (
    <div data-testid="terminal-tabs" onDoubleClick={onHeaderDoubleClick}>
      <button onClick={onCreate} type="button">
        create terminal session
      </button>
      {actions}
    </div>
  )
}))

vi.mock('../components/TerminalPane', () => ({
  TerminalPane: ({
    cwd,
    fontSize,
    onFontSizeChange,
    onPathActivated
  }: {
    cwd?: string | null
    fontSize?: number
    onFontSizeChange?: (fontSize: number) => void
    onPathActivated?: (path: string) => void
  }) => (
    <div data-cwd={cwd ?? ''} data-font-size={fontSize ?? ''} data-testid="terminal-pane">
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
      data-view-mode={viewMode}>
      <button onClick={() => onSelectPath('/workspace/run.sh', 'file')} type="button">
        select file
      </button>
      <button onClick={() => onSelectPath('/workspace/src', 'directory')} type="button">
        select directory
      </button>
      <button onClick={() => onOpenParentPath?.('/workspace')} type="button">
        navigate parent
      </button>
      <button onClick={onOpenChildHistoryPath} type="button">
        navigate child history
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
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} type="button">
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
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  NormalTooltip: ({ children }: { children: React.ReactNode }) => children,
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
  mocks.persistValues['terminal.layout.mode'] = 'right'
  mocks.persistValues['terminal.font_size'] = 18
  mocks.sessions = []
  mocks.activeSession = null
  mocks.commandHandlers = {}
  mocks.ipcRequest.mockReset()
  mocks.safeOpen.mockResolvedValue(undefined)
  mocks.isDirectory.mockResolvedValue(false)
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
  window.api.file.isDirectory = mocks.isDirectory
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
    expect(mocks.createSession).toHaveBeenCalledOnce()
    await waitFor(() =>
      expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-root-path', '/Users/alice')
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

  it('keeps the terminal font size in persisted page state', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.font_size'] = 28

    render(<TerminalPage />)

    expect(screen.getByTestId('terminal-pane')).toHaveAttribute('data-font-size', '28')

    await user.click(screen.getByRole('button', { name: 'change terminal font' }))

    expect(mocks.persistValues['terminal.font_size']).toBe(30)
    expect(screen.getByTestId('terminal-pane')).toHaveAttribute('data-font-size', '30')
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
      expect(screen.getByTestId('mock-workspace-file-tree')).toHaveAttribute('data-root-path', '/Users/alice')
    )
  })

  it('creates a terminal session in the current workspace when the terminal pane is shown', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace/project'

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'show terminal' }))

    expect(mocks.createSession).toHaveBeenLastCalledWith({ cwd: '/workspace/project' })
  })

  it('creates new terminal tabs in the current workspace', async () => {
    const user = userEvent.setup()
    mocks.persistValues['terminal.workspace.root'] = '/workspace/project'

    render(<TerminalPage />)

    await user.click(screen.getByRole('button', { name: 'create terminal session' }))

    expect(mocks.createSession).toHaveBeenLastCalledWith({ cwd: '/workspace/project' })
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
