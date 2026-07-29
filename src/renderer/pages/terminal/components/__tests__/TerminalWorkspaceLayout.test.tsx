import '@testing-library/jest-dom/vitest'

import { render, screen } from '@testing-library/react'
import type React from 'react'
import { describe, expect, it, vi } from 'vitest'

const cache = vi.hoisted(() => ({
  mode: 'right',
  setMode: vi.fn(),
  setBottomSizes: vi.fn(),
  setRightSizes: vi.fn()
}))

vi.mock('@data/hooks/useCache', () => ({
  usePersistCache: (key: string) => {
    if (key === 'terminal.layout.mode') return [cache.mode, cache.setMode]
    if (key === 'terminal.layout.right_sizes') return [[60, 40], cache.setRightSizes]
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
    defaultSize,
    id,
    minSize
  }: {
    children: React.ReactNode
    defaultSize?: number | string
    id?: string
    minSize?: number | string
  }) => (
    <div data-default-size={String(defaultSize ?? '')} data-min-size={String(minSize ?? '')} data-testid={id}>
      {children}
    </div>
  ),
  ResizablePanelGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}))

import { TerminalWorkspaceLayout } from '../TerminalWorkspaceLayout'

function renderLayout(mode: 'right' | 'bottom' | 'terminal-maximized' | 'files-maximized' | 'preview-maximized') {
  cache.mode = mode
  return render(<TerminalWorkspaceLayout fileManager={<div>files</div>} terminal={<div>terminal</div>} />)
}

describe('TerminalWorkspaceLayout', () => {
  it('shows the file manager beside the terminal in right mode', () => {
    renderLayout('right')

    expect(screen.getByTestId('terminal-workspace-layout')).toHaveAttribute('data-layout-mode', 'right')
    expect(screen.getByTestId('terminal-workspace-file-manager')).toBeInTheDocument()
    expect(screen.getByTestId('terminal-workspace-terminal')).toBeInTheDocument()
    expect(screen.getByTestId('primary')).toHaveAttribute('data-default-size', '60%')
    expect(screen.getByTestId('secondary')).toHaveAttribute('data-min-size', '30%')
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
    expect(screen.queryByTestId('terminal-workspace-file-manager')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'terminal.workspace.layout.restore' })).toBeInTheDocument()
  })

  it('hides the terminal in files maximized mode and shows restore', () => {
    renderLayout('files-maximized')

    expect(screen.queryByTestId('terminal-workspace-terminal')).not.toBeInTheDocument()
    expect(screen.getByTestId('terminal-workspace-file-manager')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'terminal.workspace.layout.restore' })).toBeInTheDocument()
  })

  it('maps the legacy preview maximized cache value to files maximized mode', () => {
    renderLayout('preview-maximized')

    expect(screen.getByTestId('terminal-workspace-layout')).toHaveAttribute('data-layout-mode', 'files-maximized')
    expect(screen.getByTestId('terminal-workspace-file-manager')).toBeInTheDocument()
  })
})
