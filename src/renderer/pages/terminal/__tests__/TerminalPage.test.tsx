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
  persistValues: {
    'terminal.workspace.root': null as string | null,
    'terminal.workspace.include_hidden': false
  }
}))

vi.mock('@data/hooks/useCache', async () => {
  const React = await import('react')

  return {
    usePersistCache: (key: 'terminal.workspace.root' | 'terminal.workspace.include_hidden') => {
      const [value, setValue] = React.useState(mocks.persistValues[key])
      return [value, setValue]
    }
  }
})

vi.mock('../hooks/useTerminalSessions', () => ({
  useTerminalSessions: () => ({
    sessions: [],
    activeSessionId: null,
    activeSession: null,
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
  TerminalWorkspaceLayout: ({
    fileTree,
    preview,
    terminal
  }: {
    fileTree: React.ReactNode
    preview: React.ReactNode
    terminal: React.ReactNode
  }) => (
    <div>
      {fileTree}
      {terminal}
      {preview}
    </div>
  )
}))

vi.mock('../components/WorkspaceFileTree', () => ({
  WorkspaceFileTree: ({ onSelectPath }: { onSelectPath: (path: string, kind: 'directory' | 'file') => void }) => (
    <div>
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
    onOpenSystem
  }: {
    filePath: string | null
    onOpenSystem: (filePath: string) => void
  }) => (
    <div data-file-path={filePath ?? ''} data-testid="mock-workspace-preview-pane">
      <button disabled={!filePath} onClick={() => filePath && onOpenSystem(filePath)} type="button">
        open system
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

import TerminalPage from '../TerminalPage'

beforeEach(() => {
  mocks.persistValues['terminal.workspace.root'] = null
  mocks.persistValues['terminal.workspace.include_hidden'] = false
  mocks.safeOpen.mockResolvedValue(undefined)
  mocks.isDirectory.mockResolvedValue(false)
  window.api.file.isDirectory = mocks.isDirectory
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
    expect(screen.getByTestId('workspace-preview-pane')).toBeInTheDocument()
    expect(mocks.createSession).toHaveBeenCalledOnce()
  })

  it('passes the persisted workspace root as the terminal link cwd', () => {
    mocks.persistValues['terminal.workspace.root'] = '/workspace'

    render(<TerminalPage />)

    expect(screen.getByTestId('terminal-pane')).toHaveAttribute('data-cwd', '/workspace')
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
})
