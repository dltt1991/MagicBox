import '@testing-library/jest-dom/vitest'

import type { TerminalSessionMetadata } from '@shared/ipc/schemas/terminal'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { index?: number }) => (options?.index ? `${key} ${options.index}` : key)
  })
}))

import { TerminalTabs } from '../TerminalTabs'

const sessions: TerminalSessionMetadata[] = [
  {
    id: 'session-1',
    cwd: '/workspace/project',
    shell: '/bin/zsh',
    pid: 123,
    status: 'running',
    createdAt: 1,
    updatedAt: 1
  },
  {
    id: 'session-2',
    cwd: '/Users/alice',
    shell: '/bin/zsh',
    pid: 456,
    status: 'running',
    createdAt: 2,
    updatedAt: 2
  }
]

afterEach(cleanup)

describe('TerminalTabs', () => {
  it('renders accessible terminal session controls', () => {
    render(
      <TerminalTabs
        activeSessionId="session-1"
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onSelect={vi.fn()}
        sessions={sessions}
      />
    )

    expect(screen.getByRole('toolbar', { name: 'terminal.title' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'project' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'alice' })).toBeInTheDocument()
  })

  it('creates, selects, and closes terminal sessions', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    const onSelect = vi.fn()
    const onClose = vi.fn()
    render(
      <TerminalTabs
        activeSessionId="session-1"
        onClose={onClose}
        onCreate={onCreate}
        onSelect={onSelect}
        sessions={sessions}
      />
    )

    await user.click(screen.getByRole('button', { name: 'terminal.new_session' }))
    await user.click(screen.getByRole('button', { name: 'alice' }))
    await user.click(screen.getByRole('button', { name: 'terminal.close_session 1' }))

    expect(onCreate).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith('session-2')
    expect(onClose).toHaveBeenCalledWith('session-1')
  })

  it('keeps the new terminal and layout actions together on the terminal bar', () => {
    render(
      <TerminalTabs
        actions={<button type="button">maximize terminal</button>}
        activeSessionId="session-1"
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onSelect={vi.fn()}
        sessions={sessions}
      />
    )

    expect(screen.getByTestId('terminal-tabs-actions')).toContainElement(
      screen.getByRole('button', { name: 'terminal.new_session' })
    )
    expect(screen.getByTestId('terminal-tabs-actions')).toContainElement(
      screen.getByRole('button', { name: 'maximize terminal' })
    )
  })

  it('notifies when the terminal bar is double-clicked', async () => {
    const user = userEvent.setup()
    const onHeaderDoubleClick = vi.fn()
    render(
      <TerminalTabs
        activeSessionId="session-1"
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onHeaderDoubleClick={onHeaderDoubleClick}
        onSelect={vi.fn()}
        sessions={sessions}
      />
    )

    await user.dblClick(screen.getByTestId('terminal-tabs-bar'))

    expect(onHeaderDoubleClick).toHaveBeenCalledOnce()
  })

  it('falls back to numbered labels when the cwd has no display basename', () => {
    render(
      <TerminalTabs
        activeSessionId="session-root"
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onSelect={vi.fn()}
        sessions={[{ ...sessions[0], id: 'session-root', cwd: '/' }]}
      />
    )

    expect(screen.getByRole('button', { name: 'terminal.session 1' })).toBeInTheDocument()
  })

  it('uses the running process name as the session label', () => {
    render(
      <TerminalTabs
        activeSessionId="session-1"
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onSelect={vi.fn()}
        sessions={[{ ...sessions[0], processName: 'pnpm' }]}
      />
    )

    expect(screen.getByRole('button', { name: 'pnpm' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'project' })).not.toBeInTheDocument()
  })

  it('falls back to the cwd basename when the process name is cleared', () => {
    render(
      <TerminalTabs
        activeSessionId="session-1"
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onSelect={vi.fn()}
        sessions={[{ ...sessions[0], cwd: '/workspace/project' }]}
      />
    )

    expect(screen.getByRole('button', { name: 'project' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'pnpm' })).not.toBeInTheDocument()
  })
})
