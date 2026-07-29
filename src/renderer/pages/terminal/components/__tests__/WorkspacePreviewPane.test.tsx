import '@testing-library/jest-dom/vitest'

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps, PropsWithChildren, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ filePreview: vi.fn() }))

vi.mock('@cherrystudio/ui', () => ({
  Button: ({ children, ...props }: ComponentProps<'button'>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  EmptyState: ({ title }: { title?: string }) => <div data-testid="empty-state">{title}</div>,
  NormalTooltip: ({ children }: PropsWithChildren) => <>{children}</>
}))

vi.mock('@renderer/components/FilePreview', () => ({
  FilePreview: ({ filePath, header }: { filePath: string; header?: ReactNode }) => {
    mocks.filePreview(filePath)
    return (
      <div data-testid="file-preview" data-path={filePath}>
        {header}
      </div>
    )
  }
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

import { WorkspacePreviewPane } from '../WorkspacePreviewPane'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('WorkspacePreviewPane', () => {
  it('normalizes valid file paths before rendering FilePreview', () => {
    render(
      <WorkspacePreviewPane
        filePath="/workspace/notes/../README.md"
        onCopyPath={vi.fn()}
        onOpenInNewTab={vi.fn()}
        onOpenSystem={vi.fn()}
        onShowInFolder={vi.fn()}
      />
    )

    expect(screen.getByTestId('file-preview')).toHaveAttribute('data-path', '/workspace/README.md')
    expect(screen.getByText('README.md')).toBeInTheDocument()
  })

  it('shows an empty state when no file is selected', () => {
    render(
      <WorkspacePreviewPane
        filePath={null}
        onCopyPath={vi.fn()}
        onOpenInNewTab={vi.fn()}
        onOpenSystem={vi.fn()}
        onShowInFolder={vi.fn()}
      />
    )

    expect(screen.getByTestId('empty-state')).toHaveTextContent('terminal.workspace.preview.empty')
    expect(screen.queryByTestId('file-preview')).not.toBeInTheDocument()
  })

  it('passes the normalized path to preview actions', () => {
    const onCopyPath = vi.fn()
    const onOpenInNewTab = vi.fn()
    const onOpenSystem = vi.fn()
    const onShowInFolder = vi.fn()

    render(
      <WorkspacePreviewPane
        filePath="/workspace/notes/../README.md"
        onCopyPath={onCopyPath}
        onOpenInNewTab={onOpenInNewTab}
        onOpenSystem={onOpenSystem}
        onShowInFolder={onShowInFolder}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'terminal.workspace.preview.open_in_new_tab' }))
    fireEvent.click(screen.getByRole('button', { name: 'terminal.workspace.preview.open_system' }))
    fireEvent.click(screen.getByRole('button', { name: 'terminal.workspace.preview.show_in_folder' }))
    fireEvent.click(screen.getByRole('button', { name: 'terminal.workspace.preview.copy_path' }))

    for (const callback of [onOpenInNewTab, onOpenSystem, onShowInFolder, onCopyPath]) {
      expect(callback).toHaveBeenCalledWith('/workspace/README.md')
    }
  })
})
