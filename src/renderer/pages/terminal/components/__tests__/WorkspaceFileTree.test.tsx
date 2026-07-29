import '@testing-library/jest-dom/vitest'

import type { FileTreeProps } from '@renderer/components/FileTree'
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

vi.mock('@renderer/components/FileTree', () => ({
  FileTree: ({ nodes, onDragStart, onSelectedChange, selectedId }: FileTreeProps) => (
    <div data-selected-id={selectedId ?? ''} data-testid="file-tree">
      {nodes.map((node) => (
        <button
          draggable={Boolean(onDragStart)}
          key={node.id}
          onClick={() => onSelectedChange?.(node.id)}
          onDragStart={(event) => onDragStart?.(node, event)}
          type="button">
          {node.name}
        </button>
      ))}
    </div>
  )
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
  root.attachChild(new TreeDir({ path: '/workspace/src' }))
  root.attachChild(new TreeFile({ path: '/workspace/README.md' }))
  return root
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('WorkspaceFileTree', () => {
  it('recreates the directory tree when hidden-file visibility changes', () => {
    const { rerender } = render(
      <WorkspaceFileTree includeHidden={false} onSelectPath={vi.fn()} rootPath="/workspace" selectedPath={null} />
    )

    rerender(
      <WorkspaceFileTree includeHidden={true} onSelectPath={vi.fn()} rootPath="/workspace" selectedPath={null} />
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

  it('selects directory rows without opening a preview', () => {
    const onSelectPath = vi.fn()
    render(
      <WorkspaceFileTree includeHidden={false} onSelectPath={onSelectPath} rootPath="/workspace" selectedPath={null} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'src' }))

    expect(onSelectPath).toHaveBeenCalledWith('/workspace/src', 'directory')
  })

  it('sets a terminal path drag payload for workspace rows', () => {
    render(<WorkspaceFileTree includeHidden={false} onSelectPath={vi.fn()} rootPath="/workspace" selectedPath={null} />)
    const setData = vi.fn()

    fireEvent.dragStart(screen.getByRole('button', { name: 'src' }), {
      dataTransfer: { setData }
    })

    expect(setData).toHaveBeenCalledWith('application/x-cherry-terminal-path', '{"path":"/workspace/src"}')
  })
})
