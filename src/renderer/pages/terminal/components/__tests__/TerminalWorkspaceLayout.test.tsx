import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type React from 'react'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const cache = vi.hoisted(() => ({
  mode: 'right',
  setMode: vi.fn(),
  setBottomSizes: vi.fn(),
  setRightSizes: vi.fn(),
  lastSplitMode: 'right',
  setLastSplitMode: vi.fn(),
  terminalVisible: true,
  setTerminalVisible: vi.fn()
}))

vi.mock('@data/hooks/useCache', () => ({
  usePersistCache: (key: string) => {
    if (key === 'terminal.layout.mode') return [cache.mode, cache.setMode]
    if (key === 'terminal.layout.last_split_mode') return [cache.lastSplitMode, cache.setLastSplitMode]
    if (key === 'terminal.layout.right_sizes') return [[60, 40], cache.setRightSizes]
    if (key === 'terminal.workspace.terminal_visible') return [cache.terminalVisible, cache.setTerminalVisible]
    return [[60, 40], cache.setBottomSizes]
  }
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

vi.mock('@cherrystudio/ui', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} type="button">
      {children}
    </button>
  ),
  NormalTooltip: ({ children }: { children: React.ReactNode }) => children,
  ResizableHandle: () => <div data-testid="resize-handle" />,
  ResizablePanel: ({
    children,
    className,
    defaultSize,
    id,
    minSize
  }: {
    children: React.ReactNode
    className?: string
    defaultSize?: number | string
    id?: string
    minSize?: number | string
  }) => (
    <div
      className={className}
      data-default-size={String(defaultSize ?? '')}
      data-min-size={String(minSize ?? '')}
      data-testid={id}>
      {children}
    </div>
  ),
  ResizablePanelGroup: ({ children, direction }: { children: React.ReactNode; direction?: string }) => (
    <div data-direction={direction} data-testid="resizable-panel-group">
      {children}
    </div>
  )
}))

import { TerminalWorkspaceLayout } from '../TerminalWorkspaceLayout'

function renderLayout(mode: 'right' | 'bottom' | 'terminal-maximized' | 'files-maximized' | 'preview-maximized') {
  cache.mode = mode
  cache.lastSplitMode = mode === 'bottom' ? 'bottom' : 'right'
  cache.terminalVisible = true
  return render(
    <TerminalWorkspaceLayout
      fileManager={(actions) => (
        <div>
          <div data-testid="file-manager-directory-actions">{actions}</div>
          <div>files</div>
        </div>
      )}
      terminal={(actions, onHeaderDoubleClick) => (
        <div data-testid="terminal-header" onDoubleClick={onHeaderDoubleClick}>
          <span>terminal</span>
          {actions}
        </div>
      )}
    />
  )
}

describe('TerminalWorkspaceLayout', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows the file manager beside the terminal in right mode', () => {
    renderLayout('right')

    expect(screen.getByTestId('terminal-workspace-layout')).toHaveAttribute('data-layout-mode', 'right')
    expect(screen.getByTestId('terminal-workspace-file-manager')).toBeInTheDocument()
    expect(screen.getByTestId('terminal-workspace-terminal')).toBeInTheDocument()
    expect(screen.getByTestId('primary')).toHaveAttribute('data-default-size', '60%')
    expect(screen.getByTestId('secondary')).toHaveAttribute('data-min-size', '30%')
    expect(screen.getByTestId('terminal-header')).toContainElement(
      screen.getByRole('button', { name: 'terminal.workspace.layout.terminal_maximize' })
    )
    expect(screen.getByTestId('file-manager-directory-actions')).toContainElement(
      screen.getByRole('button', { name: 'terminal.workspace.layout.right' })
    )
    expect(screen.getByTestId('file-manager-directory-actions')).toContainElement(
      screen.getByRole('button', { name: 'terminal.workspace.layout.bottom' })
    )
    expect(screen.queryByRole('button', { name: 'terminal.workspace.layout.files_maximize' })).not.toBeInTheDocument()
    expect(screen.getByTestId('file-manager-directory-actions')).toContainElement(
      screen.getByRole('button', { name: 'terminal.workspace.layout.hide_terminal' })
    )
  })

  it('stacks the file manager and terminal in bottom mode', () => {
    renderLayout('bottom')

    expect(screen.getByTestId('terminal-workspace-layout')).toHaveAttribute('data-layout-mode', 'bottom')
    expect(screen.getByTestId('terminal-workspace-file-manager')).toBeInTheDocument()
    expect(screen.getByTestId('terminal-workspace-terminal')).toBeInTheDocument()
  })

  it('hides the file manager in terminal maximized mode and shows restore', () => {
    renderLayout('terminal-maximized')

    expect(screen.getByTestId('terminal-workspace-terminal')).toBeInTheDocument()
    expect(screen.getByTestId('primary')).toHaveClass('hidden')
    expect(screen.getByTestId('secondary')).toHaveClass('absolute', 'inset-0', 'z-20')
    expect(screen.getByTestId('terminal-workspace-file-manager')).toBeInTheDocument()
    expect(screen.getByTestId('terminal-header')).toContainElement(
      screen.getByRole('button', { name: 'terminal.workspace.layout.restore' })
    )
  })

  it('hides the terminal in files maximized mode without showing a file maximize restore action', () => {
    renderLayout('files-maximized')

    expect(screen.queryByTestId('terminal-workspace-terminal')).not.toBeInTheDocument()
    expect(screen.getByTestId('terminal-workspace-file-manager')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'terminal.workspace.layout.restore' })).not.toBeInTheDocument()
  })

  it('restores a maximized terminal to the last bottom split layout', () => {
    cache.mode = 'terminal-maximized'
    cache.lastSplitMode = 'bottom'

    render(
      <TerminalWorkspaceLayout
        fileManager={(actions) => (
          <div>
            <div data-testid="file-manager-directory-actions">{actions}</div>
            <div>files</div>
          </div>
        )}
        terminal={(actions) => <div>{actions}</div>}
      />
    )

    screen.getByRole('button', { name: 'terminal.workspace.layout.restore' }).click()

    expect(cache.setMode).toHaveBeenCalledWith('bottom')
  })

  it('remembers bottom split before maximizing the terminal', () => {
    renderLayout('bottom')

    screen.getByRole('button', { name: 'terminal.workspace.layout.terminal_maximize' }).click()

    expect(cache.setLastSplitMode).toHaveBeenCalledWith('bottom')
    expect(cache.setMode).toHaveBeenCalledWith('terminal-maximized')
  })

  it('toggles terminal maximized state from a terminal header double click', async () => {
    const user = userEvent.setup()
    renderLayout('bottom')

    await user.dblClick(screen.getByTestId('terminal-header'))

    expect(cache.setLastSplitMode).toHaveBeenCalledWith('bottom')
    expect(cache.setMode).toHaveBeenCalledWith('terminal-maximized')
  })

  it('maps the legacy preview maximized cache value to files maximized mode', () => {
    renderLayout('preview-maximized')

    expect(screen.getByTestId('terminal-workspace-layout')).toHaveAttribute('data-layout-mode', 'files-maximized')
    expect(screen.getByTestId('terminal-workspace-file-manager')).toBeInTheDocument()
  })

  it('persists hidden terminal pane state and keeps the file manager visible', () => {
    cache.mode = 'right'
    cache.terminalVisible = false

    render(
      <TerminalWorkspaceLayout
        fileManager={(actions) => (
          <div>
            <div data-testid="file-manager-directory-actions">{actions}</div>
            <div>files</div>
          </div>
        )}
        terminal={(actions) => <div>{actions}</div>}
      />
    )

    expect(screen.getByTestId('terminal-workspace-layout')).toHaveAttribute('data-terminal-visible', 'false')
    expect(screen.getByTestId('terminal-workspace-file-manager')).toBeInTheDocument()
    expect(screen.getByTestId('terminal-workspace-file-manager')).toHaveClass('flex-1')
    expect(screen.queryByTestId('terminal-workspace-terminal')).not.toBeInTheDocument()
    expect(screen.getByTestId('file-manager-directory-actions')).toContainElement(
      screen.getByRole('button', { name: 'terminal.workspace.layout.show_terminal' })
    )
  })

  it('notifies when a hidden terminal pane is shown again', () => {
    const onShowTerminal = vi.fn()
    cache.mode = 'right'
    cache.terminalVisible = false

    render(
      <TerminalWorkspaceLayout
        fileManager={(actions) => (
          <div>
            <div data-testid="file-manager-directory-actions">{actions}</div>
            <div>files</div>
          </div>
        )}
        onShowTerminal={onShowTerminal}
        terminal={(actions) => <div>{actions}</div>}
      />
    )

    screen.getByRole('button', { name: 'terminal.workspace.layout.show_terminal' }).click()

    expect(cache.setTerminalVisible).toHaveBeenCalledWith(true)
    expect(onShowTerminal).toHaveBeenCalledOnce()
  })

  it('keeps the terminal content mounted while toggling terminal maximize in right split mode', async () => {
    const user = userEvent.setup()
    const terminalMounts = vi.fn()
    cache.mode = 'right'
    cache.lastSplitMode = 'right'
    cache.terminalVisible = true

    function StatefulTerminal() {
      useEffect(() => {
        terminalMounts()
      }, [])

      return <div data-testid="stateful-terminal">terminal</div>
    }

    const { rerender } = render(
      <TerminalWorkspaceLayout
        fileManager={(actions) => (
          <div>
            <div data-testid="file-manager-directory-actions">{actions}</div>
            <div>files</div>
          </div>
        )}
        terminal={(actions) => (
          <div>
            <StatefulTerminal />
            {actions}
          </div>
        )}
      />
    )

    await user.click(screen.getByRole('button', { name: 'terminal.workspace.layout.terminal_maximize' }))
    cache.mode = 'terminal-maximized'
    rerender(
      <TerminalWorkspaceLayout
        fileManager={(actions) => (
          <div>
            <div data-testid="file-manager-directory-actions">{actions}</div>
            <div>files</div>
          </div>
        )}
        terminal={(actions) => (
          <div>
            <StatefulTerminal />
            {actions}
          </div>
        )}
      />
    )

    await user.click(screen.getByRole('button', { name: 'terminal.workspace.layout.restore' }))
    cache.mode = 'right'
    rerender(
      <TerminalWorkspaceLayout
        fileManager={(actions) => (
          <div>
            <div data-testid="file-manager-directory-actions">{actions}</div>
            <div>files</div>
          </div>
        )}
        terminal={(actions) => (
          <div>
            <StatefulTerminal />
            {actions}
          </div>
        )}
      />
    )

    expect(terminalMounts).toHaveBeenCalledOnce()
    expect(screen.getByTestId('stateful-terminal')).toBeInTheDocument()
  })
})
