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
    cwd: '/workspace',
    shell: '/bin/zsh',
    pid: 123,
    status: 'running',
    createdAt: 1,
    updatedAt: 1
  },
  {
    id: 'session-2',
    cwd: '/workspace',
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
    expect(screen.getAllByRole('button', { name: /terminal.session/i })).toHaveLength(2)
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
    await user.click(screen.getByRole('button', { name: 'terminal.session 2' }))
    await user.click(screen.getByRole('button', { name: 'terminal.close_session 1' }))

    expect(onCreate).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith('session-2')
    expect(onClose).toHaveBeenCalledWith('session-1')
  })
})
