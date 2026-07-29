import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  closeSession: vi.fn(),
  resizeSession: vi.fn(),
  sendInput: vi.fn(),
  setActiveSessionId: vi.fn()
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

import TerminalPage from '../TerminalPage'

afterEach(cleanup)

describe('TerminalPage', () => {
  it('renders the terminal host and starts an initial session', () => {
    render(<TerminalPage />)

    expect(screen.getByTestId('terminal-tabs')).toBeInTheDocument()
    expect(screen.getByTestId('terminal-pane')).toBeInTheDocument()
    expect(mocks.createSession).toHaveBeenCalledOnce()
  })
})
