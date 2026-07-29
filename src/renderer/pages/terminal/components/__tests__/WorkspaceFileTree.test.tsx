import '@testing-library/jest-dom/vitest'

import { TreeDir, TreeDirRoot, TreeFile } from '@shared/utils/file'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useDirectoryTree: vi.fn(),
  mount: vi.fn(),
  unmount: vi.fn()
}))

vi.mock('@cherrystudio/ui', () => ({
  EmptyState: ({ title }: { title?: string }) => <div data-testid="empty-state">{title}</div>
}))

vi.mock('@renderer/hooks/useDirectoryTree', () => ({
  useDirectoryTree: mocks.useDirectoryTree
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

import { WorkspaceFileTree } from '../WorkspaceFileTree'

function useMockDirectoryTree(rootPath: string | undefined, options: unknown) {
  mocks.mount(rootPath, options)
  useEffect(() => () => mocks.unmount(rootPath), [rootPath])
  return { root: createRoot(), version: 0, isLoading: false, error: null }
}

vi.mocked(mocks.useDirectoryTree).mockImplementation(useMockDirectoryTree)

function createRoot() {
  const root = new TreeDirRoot('/workspace')
  root.attachChild(new TreeDir({ path: '/workspace/src', stats: { birthtime: 10, mtime: 10, size: 64 } }))
  root.attachChild(new TreeFile({ path: '/workspace/README.md', stats: { birthtime: 30, mtime: 30, size: 10 } }))
  root.attachChild(new TreeFile({ path: '/workspace/app.log', stats: { birthtime: 20, mtime: 20, size: 99 } }))
  return root
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('WorkspaceFileTree', () => {
  it('recreates the directory tree when hidden-file visibility changes', () => {
    const { rerender } = render(
      <WorkspaceFileTree
        includeHidden={false}
        onSelectPath={vi.fn()}
        rootPath="/workspace"
        selectedPath={null}
        sortDirection="asc"
        sortKey="name"
        viewMode="list"
      />
    )

    rerender(
      <WorkspaceFileTree
        includeHidden={true}
        onSelectPath={vi.fn()}
        rootPath="/workspace"
        selectedPath={null}
        sortDirection="asc"
        sortKey="name"
        viewMode="list"
      />
    )

    expect(mocks.useDirectoryTree).toHaveBeenNthCalledWith(
      1,
      '/workspace',
      expect.objectContaining({ includeHidden: false })
    )
    expect(mocks.useDirectoryTree).toHaveBeenNthCalledWith(
      2,
      '/workspace',
      expect.objectContaining({ includeHidden: true })
    )
    expect(mocks.unmount).toHaveBeenCalledWith('/workspace')
    expect(mocks.mount).toHaveBeenCalledTimes(2)
  })

  it('keeps gitignore filtering when hidden files are visible', () => {
    render(
      <WorkspaceFileTree
        includeHidden={true}
        onSelectPath={vi.fn()}
        rootPath="/workspace"
        selectedPath={null}
        sortDirection="asc"
        sortKey="name"
        viewMode="list"
      />
    )

    expect(mocks.useDirectoryTree).toHaveBeenCalledWith(
      '/workspace',
      expect.objectContaining({ includeHidden: true, respectGitignore: true })
    )
  })

  it('selects directory rows without opening a preview', () => {
    const onSelectPath = vi.fn()
    render(
      <WorkspaceFileTree
        includeHidden={false}
        onSelectPath={onSelectPath}
        rootPath="/workspace"
        selectedPath={null}
        sortDirection="asc"
        sortKey="name"
        viewMode="list"
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'src' }))

    expect(onSelectPath).toHaveBeenCalledWith('/workspace/src', 'directory')
  })

  it('sets a terminal path drag payload for workspace rows', () => {
    render(
      <WorkspaceFileTree
        includeHidden={false}
        onSelectPath={vi.fn()}
        rootPath="/workspace"
        selectedPath={null}
        sortDirection="asc"
        sortKey="name"
        viewMode="list"
      />
    )
    const setData = vi.fn()

    fireEvent.dragStart(screen.getByRole('button', { name: 'src' }), {
      dataTransfer: { setData }
    })

    expect(setData).toHaveBeenCalledWith('application/x-cherry-terminal-path', '{"path":"/workspace/src"}')
  })

  it('renders icon mode and sorts files by size while keeping directories first', () => {
    render(
      <WorkspaceFileTree
        includeHidden={false}
        onSelectPath={vi.fn()}
        rootPath="/workspace"
        selectedPath={null}
        sortDirection="desc"
        sortKey="size"
        viewMode="icons"
      />
    )

    expect(screen.getByText('src').closest('[data-view-mode]')).toHaveAttribute('data-view-mode', 'icons')
    expect(screen.getAllByTestId('workspace-item').map((item) => item.textContent)).toEqual([
      'src',
      'app.log',
      'README.md'
    ])
  })

  it('uses one full-width column grid for list headers and rows', () => {
    render(
      <WorkspaceFileTree
        includeHidden={false}
        onSelectPath={vi.fn()}
        rootPath="/workspace"
        selectedPath={null}
        sortDirection="asc"
        sortKey="name"
        viewMode="list"
      />
    )

    const header = screen.getByTestId('workspace-list-header')
    const row = screen.getByRole('button', { name: 'src' })

    expect(header).toHaveAttribute('data-list-columns', 'workspace-file-list')
    expect(row).toHaveAttribute('data-list-columns', 'workspace-file-list')
    expect(row).toHaveClass('w-full')
  })
})
