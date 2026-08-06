import '@testing-library/jest-dom/vitest'

import type { TerminalSessionMetadata } from '@shared/ipc/schemas/terminal'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { index?: number }) => (options?.index ? `${key} ${options.index}` : key)
  })
}))

import { TERMINAL_THEMES } from '../../lib/terminalThemes'
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
        quickCommands={[{ id: 'cmd-1', command: 'pnpm dev', label: 'Dev' }]}
        sessions={sessions}
      />
    )

    const actionButtons = screen
      .getAllByRole('button')
      .map((button) => button.textContent || button.getAttribute('aria-label'))
    expect(actionButtons.indexOf('Dev')).toBeLessThan(actionButtons.indexOf('terminal.new_session'))
    expect(screen.getByTestId('terminal-tabs-actions')).toContainElement(
      screen.getByRole('button', { name: 'maximize terminal' })
    )
  })

  it('shows terminal themes next to the new terminal action and changes the selected theme', async () => {
    const user = userEvent.setup()
    const onThemeChange = vi.fn()

    render(
      <TerminalTabs
        activeSessionId="session-1"
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onSelect={vi.fn()}
        onThemeChange={onThemeChange}
        selectedThemeKey="default-dark"
        sessions={sessions}
        themes={TERMINAL_THEMES}
      />
    )

    const actions = screen.getByTestId('terminal-tabs-actions')
    expect(actions).toContainElement(screen.getByRole('button', { name: 'terminal.theme.select' }))

    await user.click(screen.getByRole('button', { name: 'terminal.theme.select' }))
    await user.click(screen.getByRole('button', { name: 'terminal.theme.dracula' }))

    expect(onThemeChange).toHaveBeenCalledWith('dracula')
  })

  it('offers eight common programmer terminal themes', async () => {
    const user = userEvent.setup()

    render(
      <TerminalTabs
        activeSessionId="session-1"
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onSelect={vi.fn()}
        onThemeChange={vi.fn()}
        selectedThemeKey="default-dark"
        sessions={sessions}
        themes={TERMINAL_THEMES}
      />
    )

    await user.click(screen.getByRole('button', { name: 'terminal.theme.select' }))

    expect(TERMINAL_THEMES).toHaveLength(8)
    expect(screen.getByRole('button', { name: 'terminal.theme.one_dark_pro' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'terminal.theme.gruvbox_dark' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'terminal.theme.nord' })).toBeInTheDocument()
  })

  it('opens quick command customization from the terminal bar context menu', async () => {
    const user = userEvent.setup()
    const onOpenQuickCommandDialog = vi.fn()

    render(
      <TerminalTabs
        activeSessionId="session-1"
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onOpenQuickCommandDialog={onOpenQuickCommandDialog}
        onSelect={vi.fn()}
        sessions={sessions}
      />
    )

    fireEvent.contextMenu(screen.getByTestId('terminal-tabs-bar'))
    await user.click(screen.getByText('terminal.quick_command.customize'))

    expect(onOpenQuickCommandDialog).toHaveBeenCalledOnce()
  })

  it('runs, edits, and deletes custom quick commands from the terminal bar', async () => {
    const user = userEvent.setup()
    const quickCommand = { id: 'cmd-1', command: 'pnpm dev', label: 'Dev' }
    const onRunQuickCommand = vi.fn()
    const onEditQuickCommand = vi.fn()
    const onDeleteQuickCommand = vi.fn()

    render(
      <TerminalTabs
        activeSessionId="session-1"
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onDeleteQuickCommand={onDeleteQuickCommand}
        onEditQuickCommand={onEditQuickCommand}
        onRunQuickCommand={onRunQuickCommand}
        onSelect={vi.fn()}
        quickCommands={[quickCommand]}
        sessions={sessions}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Dev' }))
    expect(onRunQuickCommand).toHaveBeenCalledWith(quickCommand)

    fireEvent.contextMenu(screen.getByRole('button', { name: 'Dev' }))
    await user.click(screen.getByText('terminal.quick_command.edit'))
    expect(onEditQuickCommand).toHaveBeenCalledWith(quickCommand)

    fireEvent.contextMenu(screen.getByRole('button', { name: 'Dev' }))
    await user.click(screen.getByText('terminal.quick_command.delete'))
    expect(onDeleteQuickCommand).toHaveBeenCalledWith('cmd-1')
  })

  it('does not keep quick command focus where enter can run it again', async () => {
    const user = userEvent.setup()
    const quickCommand = { id: 'cmd-1', command: 'pnpm dev', label: 'Dev' }
    const onRunQuickCommand = vi.fn()

    render(
      <TerminalTabs
        activeSessionId="session-1"
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onRunQuickCommand={onRunQuickCommand}
        onSelect={vi.fn()}
        quickCommands={[quickCommand]}
        sessions={sessions}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Dev' }))
    await user.keyboard('{Enter}')

    expect(onRunQuickCommand).toHaveBeenCalledOnce()
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
