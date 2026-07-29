import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  closeSession: vi.fn(),
  resizeSession: vi.fn(),
  sendInput: vi.fn(),
  setActiveSessionId: vi.fn(),
  ipcRequest: vi.fn(),
  safeOpen: vi.fn()
}))

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
  TerminalPane: () => <div data-testid="terminal-pane" />
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

import TerminalPage from '../TerminalPage'

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
})
