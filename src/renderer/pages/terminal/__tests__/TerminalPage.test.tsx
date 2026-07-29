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
  ipcRequest: vi.fn(),
  safeOpen: vi.fn(),
  toastError: vi.fn(),
  isDirectory: vi.fn(),
  resolvePath: vi.fn(),
  persistValues: {
    'terminal.workspace.root': null as string | null,
    'terminal.workspace.include_hidden': false,
    'terminal.workspace.view_mode': 'list' as 'list' | 'icons',
    'terminal.workspace.sort_key': 'name' as 'name' | 'mtime' | 'size',
    'terminal.workspace.sort_direction': 'asc' as 'asc' | 'desc',
    'terminal.workspace.preview_open': true,
    'terminal.workspace.preview_sizes': [55, 45] as [number, number]
  },
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
    sessions: [],
    activeSessionId: mocks.activeSession?.id ?? null,
    activeSession: mocks.activeSession,
    createSession: mocks.createSession,
    closeSession: mocks.closeSession,
    resizeSession: mocks.resizeSession,
    sendInput: mocks.sendInput,
    setActiveSessionId: mocks.setActiveSessionId
  })
}))

vi.mock('../components/TerminalTabs', () => ({
  TerminalTabs: () => <div data-testid="terminal-tabs" />
}))

vi.mock('../components/TerminalPane', () => ({
  TerminalPane: ({ cwd, onPathActivated }: { cwd?: string | null; onPathActivated?: (path: string) => void }) => (
    <div data-cwd={cwd ?? ''} data-testid="terminal-pane">
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
  TerminalWorkspaceLayout: ({ fileManager, terminal }: { fileManager: React.ReactNode; terminal: React.ReactNode }) => (
    <div>
      {fileManager}
      {terminal}
    </div>
  )
}))

vi.mock('../components/WorkspaceFileTree', () => ({
  WorkspaceFileTree: ({
    onSelectPath,
    rootPath,
    sortDirection,
    sortKey,
    viewMode
  }: {
    onSelectPath: (path: string, kind: 'directory' | 'file') => void
    rootPath: string | null
    sortDirection: string
    sortKey: string
    viewMode: string
  }) => (
    <div
      data-root-path={rootPath ?? ''}
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
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  NormalTooltip: ({ children }: { children: React.ReactNode }) => children,
  ResizableHandle: () => <div data-testid="resize-handle" />,
  ResizablePanel: ({ children, id }: { children: React.ReactNode; id?: string }) => (
    <div data-testid={id}>{children}</div>
  ),
  ResizablePanelGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
  mocks.activeSession = null
  mocks.safeOpen.mockResolvedValue(undefined)
  mocks.isDirectory.mockResolvedValue(false)
  mocks.resolvePath.mockResolvedValue('/Users/alice')
  window.api.file.isDirectory = mocks.isDirectory
  window.api.resolvePath = mocks.resolvePath
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('TerminalPage', () => {
  it('renders the terminal workspace composition and starts an initial session', () => {
    render(<TerminalPage />)

    expect(screen.getByTestId('terminal-tabs')).toBeInTheDocument()
    expect(screen.getByTestId('terminal-pane')).toBeInTheDocument()
    expect(screen.getByTestId('workspace-file-tree')).toBeInTheDocument()
    expect(mocks.createSession).toHaveBeenCalledOnce()
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

  it('uses the active terminal session cwd for terminal path links', () => {
    mocks.persistValues['terminal.workspace.root'] = '/workspace'
    mocks.activeSession = { id: 'session-1', cwd: '/home/me', buffer: [] }

    render(<TerminalPage />)

    expect(screen.getByTestId('terminal-pane')).toHaveAttribute('data-cwd', '/home/me')
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
})
