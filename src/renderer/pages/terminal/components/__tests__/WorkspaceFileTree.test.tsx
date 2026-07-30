import '@testing-library/jest-dom/vitest'

import materialIconThemeIcons from '@iconify-json/material-icon-theme/icons.json'
import { TreeDir, TreeDirRoot, TreeFile } from '@shared/utils/file'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type React from 'react'
import { useEffect, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useDirectoryTree: vi.fn(),
  mount: vi.fn(),
  unmount: vi.fn()
}))

vi.mock('@cherrystudio/ui', () => ({
  ContextMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ContextMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ContextMenuItem: ({
    children,
    disabled,
    onSelect
  }: {
    children: React.ReactNode
    disabled?: boolean
    onSelect?: () => void
  }) => (
    <button disabled={disabled} onClick={onSelect} type="button">
      {children}
    </button>
  ),
  ContextMenuItemContent: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  ContextMenuSeparator: () => <hr />,
  ContextMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <div onKeyDown={(event) => event.stopPropagation()}>{children}</div>
  ),
  EmptyState: ({ title }: { title?: string }) => <div data-testid="empty-state">{title}</div>
}))

vi.mock('@iconify/react', () => ({
  Icon: ({ className, icon }: { className?: string; icon: string }) => <span className={className} data-icon={icon} />
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
  const includeHidden = Boolean((options as { includeHidden?: boolean } | undefined)?.includeHidden)
  return { root: createRoot(includeHidden, rootPath), version: 0, isLoading: false, error: null }
}

vi.mocked(mocks.useDirectoryTree).mockImplementation(useMockDirectoryTree)

function createActions() {
  return {
    canPaste: true,
    onOpenItem: vi.fn(),
    onRenameItem: vi.fn(),
    onCopyItems: vi.fn(),
    onCopyPaths: vi.fn(),
    onCutItems: vi.fn(),
    onTrashItems: vi.fn(),
    onShowProperties: vi.fn(),
    onNewFile: vi.fn(),
    onNewFolder: vi.fn(),
    onPaste: vi.fn(),
    onOpenTerminalHere: vi.fn()
  }
}

function createRoot(includeHidden = false, rootPath = '/workspace') {
  const root = new TreeDirRoot(rootPath)
  root.attachChild(new TreeDir({ path: `${rootPath}/src`, stats: { birthtime: 10, mtime: 10, size: 64 } }))
  root.attachChild(new TreeFile({ path: `${rootPath}/README.md`, stats: { birthtime: 30, mtime: 30, size: 10 } }))
  root.attachChild(new TreeFile({ path: `${rootPath}/app.log`, stats: { birthtime: 20, mtime: 20, size: 99 } }))
  if (includeHidden) {
    root.attachChild(new TreeDir({ path: `${rootPath}/.config`, stats: { birthtime: 40, mtime: 40, size: 64 } }))
    root.attachChild(new TreeFile({ path: `${rootPath}/.env`, stats: { birthtime: 50, mtime: 50, size: 12 } }))
  }
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

  it('dims hidden workspace files and folders', () => {
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

    expect(screen.getByRole('button', { name: '.config' })).toHaveAttribute('data-hidden', 'true')
    expect(screen.getByRole('button', { name: '.config' })).toHaveClass('opacity-60')
    expect(screen.getByRole('button', { name: '.env' })).toHaveAttribute('data-hidden', 'true')
    expect(screen.getByRole('button', { name: '.env' })).toHaveClass('opacity-60')
    expect(screen.getByRole('button', { name: 'src' })).not.toHaveAttribute('data-hidden')
  })

  it('uses material icons for folders and file types', () => {
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

    expect(materialIconThemeIcons.icons['folder-base']).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'src' }).querySelector('[data-icon="material-icon-theme:folder-base"]')
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'README.md' }).querySelector('[data-icon="material-icon-theme:readme"]')
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: '.env' }).querySelector('[data-icon="material-icon-theme:tune"]')
    ).toBeTruthy()
  })

  it('runs item context menu actions with the selected workspace item', () => {
    const actions = createActions()
    render(
      <WorkspaceFileTree
        contextMenuActions={actions}
        includeHidden={false}
        onSelectPath={vi.fn()}
        rootPath="/workspace"
        selectedPath={null}
        sortDirection="asc"
        sortKey="name"
        viewMode="list"
      />
    )

    fireEvent.contextMenu(screen.getByRole('button', { name: 'src' }))
    screen.getByRole('button', { name: 'terminal.workspace.context.open_folder' }).click()
    screen.getByRole('button', { name: 'terminal.workspace.context.rename' }).click()
    screen.getByRole('button', { name: 'terminal.workspace.context.copy' }).click()
    screen.getByRole('button', { name: 'terminal.workspace.context.copy_path' }).click()
    screen.getByRole('button', { name: 'terminal.workspace.context.cut' }).click()
    screen.getByRole('button', { name: 'terminal.workspace.context.properties' }).click()
    screen.getByRole('button', { name: 'terminal.workspace.context.trash' }).click()

    expect(actions.onOpenItem).toHaveBeenCalledWith(expect.objectContaining({ path: '/workspace/src' }))
    expect(actions.onRenameItem).toHaveBeenCalledWith(expect.objectContaining({ path: '/workspace/src' }))
    expect(actions.onCopyItems).toHaveBeenCalledWith([expect.objectContaining({ path: '/workspace/src' })])
    expect(actions.onCopyPaths).toHaveBeenCalledWith(['/workspace/src'])
    expect(actions.onCutItems).toHaveBeenCalledWith([expect.objectContaining({ path: '/workspace/src' })])
    expect(actions.onShowProperties).toHaveBeenCalledWith('/workspace/src')
    expect(actions.onTrashItems).toHaveBeenCalledWith([expect.objectContaining({ path: '/workspace/src' })])
  })

  it('runs blank-area context menu actions for the current workspace root', () => {
    const actions = { ...createActions(), canPaste: false }
    render(
      <WorkspaceFileTree
        contextMenuActions={actions}
        includeHidden={false}
        onSelectPath={vi.fn()}
        rootPath="/workspace"
        selectedPath={null}
        sortDirection="asc"
        sortKey="name"
        viewMode="list"
      />
    )

    screen.getByRole('button', { name: 'terminal.workspace.context.new_folder' }).click()
    screen.getByRole('button', { name: 'terminal.workspace.context.new_file' }).click()
    screen.getByRole('button', { name: 'terminal.workspace.context.open_terminal_here' }).click()
    screen.getAllByRole('button', { name: 'terminal.workspace.context.copy_path' }).at(-1)?.click()
    screen.getByRole('button', { name: 'terminal.workspace.context.folder_properties' }).click()

    expect(screen.getAllByRole('button', { name: 'terminal.workspace.context.paste' }).at(-1)).toBeDisabled()
    expect(actions.onNewFolder).toHaveBeenCalledOnce()
    expect(actions.onNewFile).toHaveBeenCalledOnce()
    expect(actions.onOpenTerminalHere).toHaveBeenCalledOnce()
    expect(actions.onCopyPaths).toHaveBeenCalledWith(['/workspace'])
    expect(actions.onShowProperties).toHaveBeenCalledWith('/workspace')
    expect(actions.onPaste).not.toHaveBeenCalled()
  })

  it('runs Finder and Explorer-style shortcuts for the selected workspace item', () => {
    const actions = createActions()
    render(
      <WorkspaceFileTree
        contextMenuActions={actions}
        includeHidden={false}
        onSelectPath={vi.fn()}
        rootPath="/workspace"
        selectedPath="/workspace/README.md"
        sortDirection="asc"
        sortKey="name"
        viewMode="list"
      />
    )
    const tree = screen.getByTestId('workspace-file-tree-content')

    fireEvent.keyDown(tree, { key: 'Enter' })
    fireEvent.keyDown(tree, { key: 'o', metaKey: true })
    fireEvent.keyDown(tree, { key: 'F2' })
    fireEvent.keyDown(tree, { key: 'c', metaKey: true })
    fireEvent.keyDown(tree, { key: 'x', ctrlKey: true })
    fireEvent.keyDown(tree, { key: 'Backspace', metaKey: true })
    fireEvent.keyDown(tree, { key: 'Delete' })
    fireEvent.keyDown(tree, { key: 'i', metaKey: true })
    fireEvent.keyDown(tree, { key: 'Enter', altKey: true })

    expect(actions.onOpenItem).toHaveBeenCalledTimes(2)
    expect(actions.onOpenItem).toHaveBeenCalledWith(expect.objectContaining({ path: '/workspace/README.md' }))
    expect(actions.onRenameItem).toHaveBeenCalledWith(expect.objectContaining({ path: '/workspace/README.md' }))
    expect(actions.onCopyItems).toHaveBeenCalledWith([expect.objectContaining({ path: '/workspace/README.md' })])
    expect(actions.onCutItems).toHaveBeenCalledWith([expect.objectContaining({ path: '/workspace/README.md' })])
    expect(actions.onTrashItems).toHaveBeenCalledTimes(2)
    expect(actions.onTrashItems).toHaveBeenCalledWith([expect.objectContaining({ path: '/workspace/README.md' })])
    expect(actions.onShowProperties).toHaveBeenCalledTimes(2)
    expect(actions.onShowProperties).toHaveBeenCalledWith('/workspace/README.md')
  })

  it('runs selected-item shortcuts from the focused workspace row', () => {
    const actions = createActions()
    render(
      <WorkspaceFileTree
        contextMenuActions={actions}
        includeHidden={false}
        onSelectPath={vi.fn()}
        rootPath="/workspace"
        selectedPath="/workspace/README.md"
        sortDirection="asc"
        sortKey="name"
        viewMode="list"
      />
    )
    const row = screen.getByRole('button', { name: 'README.md' })

    fireEvent.keyDown(row, { key: 'Enter' })
    fireEvent.keyDown(row, { key: 'o', metaKey: true })
    fireEvent.keyDown(row, { key: 'c', metaKey: true })
    fireEvent.keyDown(row, { key: 'x', ctrlKey: true })
    fireEvent.keyDown(row, { key: 'v', metaKey: true })
    fireEvent.keyDown(row, { key: 'i', metaKey: true })
    fireEvent.keyDown(row, { key: 'Enter', altKey: true })

    expect(actions.onOpenItem).toHaveBeenCalledTimes(2)
    expect(actions.onCopyItems).toHaveBeenCalledWith([expect.objectContaining({ path: '/workspace/README.md' })])
    expect(actions.onCutItems).toHaveBeenCalledWith([expect.objectContaining({ path: '/workspace/README.md' })])
    expect(actions.onPaste).toHaveBeenCalledOnce()
    expect(actions.onShowProperties).toHaveBeenCalledTimes(2)
    expect(actions.onShowProperties).toHaveBeenCalledWith('/workspace/README.md')
  })

  it('runs workspace shortcuts from document keydown after the file manager is activated', () => {
    const actions = createActions()
    render(
      <WorkspaceFileTree
        contextMenuActions={actions}
        includeHidden={false}
        onSelectPath={vi.fn()}
        rootPath="/workspace"
        selectedPath="/workspace/README.md"
        sortDirection="asc"
        sortKey="name"
        viewMode="list"
      />
    )

    fireEvent.mouseDown(screen.getByTestId('workspace-file-tree-content'))
    fireEvent.keyDown(document.body, { key: 'c', metaKey: true })
    fireEvent.keyDown(document.body, { key: 'x', metaKey: true })
    fireEvent.keyDown(document.body, { key: 'v', metaKey: true })

    expect(actions.onCopyItems).toHaveBeenCalledWith([expect.objectContaining({ path: '/workspace/README.md' })])
    expect(actions.onCutItems).toHaveBeenCalledWith([expect.objectContaining({ path: '/workspace/README.md' })])
    expect(actions.onPaste).toHaveBeenCalledOnce()
  })

  it('runs item shortcuts for the just-clicked workspace item before rerender', () => {
    const actions = createActions()
    render(
      <WorkspaceFileTree
        contextMenuActions={actions}
        includeHidden={false}
        onSelectPath={vi.fn()}
        rootPath="/workspace"
        selectedPath={null}
        sortDirection="asc"
        sortKey="name"
        viewMode="list"
      />
    )

    const readme = screen.getByRole('button', { name: 'README.md' })
    fireEvent.mouseDown(readme)
    fireEvent.click(readme)
    fireEvent.keyDown(document.body, { key: 'c', metaKey: true })
    fireEvent.keyDown(document.body, { key: 'Enter' })

    expect(actions.onCopyItems).toHaveBeenCalledWith([expect.objectContaining({ path: '/workspace/README.md' })])
    expect(actions.onOpenItem).toHaveBeenCalledWith(expect.objectContaining({ path: '/workspace/README.md' }))
  })

  it('does not run document-level workspace shortcuts after focus moves outside the file manager', () => {
    const actions = createActions()
    render(
      <>
        <WorkspaceFileTree
          contextMenuActions={actions}
          includeHidden={false}
          onSelectPath={vi.fn()}
          rootPath="/workspace"
          selectedPath="/workspace/README.md"
          sortDirection="asc"
          sortKey="name"
          viewMode="list"
        />
        <button type="button">outside</button>
      </>
    )

    fireEvent.mouseDown(screen.getByTestId('workspace-file-tree-content'))
    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }))
    fireEvent.keyDown(document.body, { key: 'c', metaKey: true })

    expect(actions.onCopyItems).not.toHaveBeenCalled()
  })

  it('runs blank-area shortcuts for the current workspace root', () => {
    const actions = createActions()
    render(
      <WorkspaceFileTree
        contextMenuActions={actions}
        includeHidden={false}
        onSelectPath={vi.fn()}
        rootPath="/workspace"
        selectedPath={null}
        sortDirection="asc"
        sortKey="name"
        viewMode="list"
      />
    )
    const tree = screen.getByTestId('workspace-file-tree-content')

    fireEvent.keyDown(tree, { key: 'n', metaKey: true, shiftKey: true })
    fireEvent.keyDown(tree, { key: 'n', ctrlKey: true })
    fireEvent.keyDown(tree, { key: 'v', metaKey: true })
    fireEvent.keyDown(tree, { key: 't', ctrlKey: true, shiftKey: true })
    fireEvent.keyDown(tree, { key: 'i', metaKey: true })
    fireEvent.keyDown(tree, { key: 'Enter', altKey: true })

    expect(actions.onNewFolder).toHaveBeenCalledOnce()
    expect(actions.onNewFile).toHaveBeenCalledOnce()
    expect(actions.onPaste).toHaveBeenCalledOnce()
    expect(actions.onOpenTerminalHere).toHaveBeenCalledOnce()
    expect(actions.onShowProperties).toHaveBeenCalledTimes(2)
    expect(actions.onShowProperties).toHaveBeenCalledWith('/workspace')
  })

  it('runs paste shortcuts even when the rendered menu paste state is stale', () => {
    const actions = { ...createActions(), canPaste: false }
    render(
      <WorkspaceFileTree
        contextMenuActions={actions}
        includeHidden={false}
        onSelectPath={vi.fn()}
        rootPath="/workspace"
        selectedPath={null}
        sortDirection="asc"
        sortKey="name"
        viewMode="list"
      />
    )

    fireEvent.keyDown(screen.getByTestId('workspace-file-tree-content'), { key: 'v', ctrlKey: true })

    expect(actions.onPaste).toHaveBeenCalledOnce()
  })

  it('runs paste shortcuts after shortcut copy enables paste state', () => {
    const onPaste = vi.fn()

    function StatefulTree() {
      const [canPaste, setCanPaste] = useState(false)
      const actions = {
        ...createActions(),
        canPaste,
        onCopyItems: vi.fn(() => setCanPaste(true)),
        onPaste
      }

      return (
        <WorkspaceFileTree
          contextMenuActions={actions}
          includeHidden={false}
          onSelectPath={vi.fn()}
          rootPath="/workspace"
          selectedPath="/workspace/README.md"
          sortDirection="asc"
          sortKey="name"
          viewMode="list"
        />
      )
    }

    render(<StatefulTree />)
    const tree = screen.getByTestId('workspace-file-tree-content')

    fireEvent.keyDown(tree, { key: 'c', metaKey: true })
    fireEvent.keyDown(tree, { key: 'v', metaKey: true })

    expect(onPaste).toHaveBeenCalledOnce()
  })

  it('moves the highlighted workspace item with arrow keys', () => {
    const onHighlightPath = vi.fn()
    const onSelectPath = vi.fn()
    const { rerender } = render(
      <WorkspaceFileTree
        includeHidden={false}
        onHighlightPath={onHighlightPath}
        onSelectPath={onSelectPath}
        rootPath="/workspace"
        selectedPath={null}
        sortDirection="asc"
        sortKey="name"
        viewMode="list"
      />
    )
    const tree = screen.getByTestId('workspace-file-tree-content')

    fireEvent.keyDown(tree, { key: 'ArrowDown' })

    expect(onHighlightPath).toHaveBeenLastCalledWith('/workspace/src')
    expect(onSelectPath).not.toHaveBeenCalled()

    rerender(
      <WorkspaceFileTree
        includeHidden={false}
        onHighlightPath={onHighlightPath}
        onSelectPath={onSelectPath}
        rootPath="/workspace"
        selectedPath="/workspace/src"
        sortDirection="asc"
        sortKey="name"
        viewMode="list"
      />
    )

    fireEvent.keyDown(tree, { key: 'ArrowRight' })
    expect(onHighlightPath).toHaveBeenLastCalledWith('/workspace/app.log')

    rerender(
      <WorkspaceFileTree
        includeHidden={false}
        onHighlightPath={onHighlightPath}
        onSelectPath={onSelectPath}
        rootPath="/workspace"
        selectedPath="/workspace/app.log"
        sortDirection="asc"
        sortKey="name"
        viewMode="list"
      />
    )

    fireEvent.keyDown(tree, { key: 'ArrowLeft' })
    expect(onHighlightPath).toHaveBeenLastCalledWith('/workspace/src')
  })

  it('keeps keyboard focus on the workspace tree after opening a directory', () => {
    const { rerender } = render(
      <WorkspaceFileTree
        contextMenuActions={createActions()}
        includeHidden={false}
        onHighlightPath={vi.fn()}
        onSelectPath={vi.fn()}
        rootPath="/workspace"
        selectedPath="/workspace/src"
        sortDirection="asc"
        sortKey="name"
        viewMode="list"
      />
    )
    const tree = screen.getByTestId('workspace-file-tree-content')

    tree.focus()
    expect(tree).toHaveFocus()

    rerender(
      <WorkspaceFileTree
        contextMenuActions={createActions()}
        includeHidden={false}
        onHighlightPath={vi.fn()}
        onSelectPath={vi.fn()}
        rootPath="/workspace/src"
        selectedPath={null}
        sortDirection="asc"
        sortKey="name"
        viewMode="list"
      />
    )

    expect(screen.getByTestId('workspace-file-tree-content')).toHaveFocus()
  })

  it('restores keyboard focus to the workspace tree after a dialog closes', () => {
    const actions = createActions()
    const onHighlightPath = vi.fn()
    const { rerender } = render(
      <>
        <WorkspaceFileTree
          contextMenuActions={actions}
          includeHidden={false}
          onHighlightPath={onHighlightPath}
          onSelectPath={vi.fn()}
          rootPath="/workspace"
          restoreFocusKey={0}
          selectedPath={null}
          sortDirection="asc"
          sortKey="name"
          viewMode="list"
        />
        <button type="button">outside</button>
      </>
    )

    fireEvent.mouseDown(screen.getByRole('button', { name: 'outside' }))
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    expect(onHighlightPath).not.toHaveBeenCalled()

    rerender(
      <>
        <WorkspaceFileTree
          contextMenuActions={actions}
          includeHidden={false}
          onHighlightPath={onHighlightPath}
          onSelectPath={vi.fn()}
          rootPath="/workspace"
          restoreFocusKey={1}
          selectedPath={null}
          sortDirection="asc"
          sortKey="name"
          viewMode="list"
        />
        <button type="button">outside</button>
      </>
    )

    expect(screen.getByTestId('workspace-file-tree-content')).toHaveFocus()
    fireEvent.keyDown(document.body, { key: 'ArrowDown' })
    expect(onHighlightPath).toHaveBeenCalledWith('/workspace/src')
  })

  it('restores keyboard focus to the workspace tree when the focused row is removed by directory navigation', () => {
    const { rerender } = render(
      <WorkspaceFileTree
        contextMenuActions={createActions()}
        includeHidden={false}
        onHighlightPath={vi.fn()}
        onSelectPath={vi.fn()}
        rootPath="/workspace"
        selectedPath="/workspace/src"
        sortDirection="asc"
        sortKey="name"
        viewMode="list"
      />
    )
    const focusedRow = screen.getByRole('button', { name: 'src' })

    focusedRow.focus()
    expect(focusedRow).toHaveFocus()

    rerender(
      <WorkspaceFileTree
        contextMenuActions={createActions()}
        includeHidden={false}
        onHighlightPath={vi.fn()}
        onSelectPath={vi.fn()}
        rootPath="/workspace/src"
        selectedPath={null}
        sortDirection="asc"
        sortKey="name"
        viewMode="list"
      />
    )

    expect(screen.getByTestId('workspace-file-tree-content')).toHaveFocus()
  })

  it('opens parent and child history directories with platform navigation shortcuts', () => {
    const actions = createActions()
    const onOpenChildHistoryPath = vi.fn()
    const onOpenParentPath = vi.fn()
    render(
      <WorkspaceFileTree
        contextMenuActions={actions}
        includeHidden={false}
        onOpenChildHistoryPath={onOpenChildHistoryPath}
        onOpenParentPath={onOpenParentPath}
        onSelectPath={vi.fn()}
        rootPath="/workspace/projects"
        selectedPath="/workspace/src"
        sortDirection="asc"
        sortKey="name"
        viewMode="list"
      />
    )
    const tree = screen.getByTestId('workspace-file-tree-content')

    fireEvent.keyDown(tree, { key: 'ArrowUp', metaKey: true })
    fireEvent.keyDown(tree, { key: 'ArrowUp', altKey: true })
    fireEvent.keyDown(tree, { key: 'ArrowDown', metaKey: true })
    fireEvent.keyDown(tree, { key: 'ArrowDown', altKey: true })

    expect(onOpenParentPath).toHaveBeenCalledTimes(2)
    expect(onOpenParentPath).toHaveBeenCalledWith('/workspace')
    expect(onOpenChildHistoryPath).toHaveBeenCalledTimes(2)
    expect(actions.onOpenItem).not.toHaveBeenCalled()
  })

  it('selects multiple workspace items with a mouse marquee', () => {
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
    const tree = screen.getByTestId('workspace-file-tree-content')
    vi.spyOn(tree, 'getBoundingClientRect').mockReturnValue({
      bottom: 220,
      height: 220,
      left: 0,
      right: 300,
      top: 0,
      width: 300,
      x: 0,
      y: 0,
      toJSON: () => ({})
    })

    const rows = screen.getAllByTestId('workspace-item')
    vi.spyOn(rows[0], 'getBoundingClientRect').mockReturnValue({
      bottom: 40,
      height: 32,
      left: 8,
      right: 292,
      top: 8,
      width: 284,
      x: 8,
      y: 8,
      toJSON: () => ({})
    })
    vi.spyOn(rows[1], 'getBoundingClientRect').mockReturnValue({
      bottom: 80,
      height: 32,
      left: 8,
      right: 292,
      top: 48,
      width: 284,
      x: 8,
      y: 48,
      toJSON: () => ({})
    })
    vi.spyOn(rows[2], 'getBoundingClientRect').mockReturnValue({
      bottom: 120,
      height: 32,
      left: 8,
      right: 292,
      top: 88,
      width: 284,
      x: 8,
      y: 88,
      toJSON: () => ({})
    })

    fireEvent.mouseDown(tree, { button: 0, clientX: 4, clientY: 4 })
    fireEvent.mouseMove(document, { clientX: 280, clientY: 82 })

    expect(rows[0]).toHaveAttribute('data-selected', 'true')
    expect(rows[1]).toHaveAttribute('data-selected', 'true')
    expect(rows[2]).not.toHaveAttribute('data-selected', 'true')

    fireEvent.mouseUp(document)
  })

  it('toggles multiple workspace items with ctrl or command clicks', () => {
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
    const src = screen.getByRole('button', { name: 'src' })
    const appLog = screen.getByRole('button', { name: 'app.log' })

    fireEvent.click(src, { ctrlKey: true })
    fireEvent.click(appLog, { metaKey: true })

    expect(src).toHaveAttribute('data-selected', 'true')
    expect(appLog).toHaveAttribute('data-selected', 'true')
    expect(onSelectPath).not.toHaveBeenCalled()

    fireEvent.click(src, { ctrlKey: true })

    expect(src).not.toHaveAttribute('data-selected', 'true')
    expect(appLog).toHaveAttribute('data-selected', 'true')
  })

  it('selects a contiguous workspace range with shift click', () => {
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
    const rows = screen.getAllByTestId('workspace-item')

    fireEvent.click(rows[0])
    fireEvent.click(rows[2], { shiftKey: true })

    expect(rows[0]).toHaveAttribute('data-selected', 'true')
    expect(rows[1]).toHaveAttribute('data-selected', 'true')
    expect(rows[2]).toHaveAttribute('data-selected', 'true')
  })

  it('runs context menu actions for all selected workspace items', () => {
    const actions = createActions()
    render(
      <WorkspaceFileTree
        contextMenuActions={actions}
        includeHidden={false}
        onSelectPath={vi.fn()}
        rootPath="/workspace"
        selectedPath={null}
        sortDirection="asc"
        sortKey="name"
        viewMode="list"
      />
    )
    const src = screen.getByRole('button', { name: 'src' })
    const appLog = screen.getByRole('button', { name: 'app.log' })

    fireEvent.click(src, { ctrlKey: true })
    fireEvent.click(appLog, { ctrlKey: true })
    fireEvent.contextMenu(src)
    screen.getByRole('button', { name: 'terminal.workspace.context.copy' }).click()
    screen.getByRole('button', { name: 'terminal.workspace.context.copy_path' }).click()
    screen.getByRole('button', { name: 'terminal.workspace.context.cut' }).click()
    screen.getByRole('button', { name: 'terminal.workspace.context.trash' }).click()

    expect(actions.onCopyItems).toHaveBeenCalledWith([
      expect.objectContaining({ path: '/workspace/src' }),
      expect.objectContaining({ path: '/workspace/app.log' })
    ])
    expect(actions.onCopyPaths).toHaveBeenCalledWith(['/workspace/src', '/workspace/app.log'])
    expect(actions.onCutItems).toHaveBeenCalledWith([
      expect.objectContaining({ path: '/workspace/src' }),
      expect.objectContaining({ path: '/workspace/app.log' })
    ])
    expect(actions.onTrashItems).toHaveBeenCalledWith([
      expect.objectContaining({ path: '/workspace/src' }),
      expect.objectContaining({ path: '/workspace/app.log' })
    ])
  })

  it('shows only batch file actions in the context menu for multiple selected items', () => {
    const actions = createActions()
    render(
      <WorkspaceFileTree
        contextMenuActions={actions}
        includeHidden={false}
        onSelectPath={vi.fn()}
        rootPath="/workspace"
        selectedPath={null}
        sortDirection="asc"
        sortKey="name"
        viewMode="list"
      />
    )
    const src = screen.getByRole('button', { name: 'src' })
    const appLog = screen.getByRole('button', { name: 'app.log' })

    fireEvent.click(src, { ctrlKey: true })
    fireEvent.click(appLog, { ctrlKey: true })
    fireEvent.contextMenu(src)

    expect(screen.queryByRole('button', { name: 'terminal.workspace.context.open_folder' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'terminal.workspace.context.rename' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'terminal.workspace.context.properties' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'terminal.workspace.context.copy' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'terminal.workspace.context.copy_path' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'terminal.workspace.context.cut' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'terminal.workspace.context.paste' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'terminal.workspace.context.trash' })).toBeInTheDocument()
  })

  it('keeps all selected workspace items as the context-menu target after right click', () => {
    const actions = createActions()
    render(
      <WorkspaceFileTree
        contextMenuActions={actions}
        includeHidden={false}
        onSelectPath={vi.fn()}
        rootPath="/workspace"
        selectedPath={null}
        sortDirection="asc"
        sortKey="name"
        viewMode="list"
      />
    )
    const src = screen.getByRole('button', { name: 'src' })
    const appLog = screen.getByRole('button', { name: 'app.log' })

    fireEvent.click(src, { ctrlKey: true })
    fireEvent.click(appLog, { ctrlKey: true })
    fireEvent.contextMenu(src)
    screen.getAllByRole('button', { name: 'terminal.workspace.context.copy_path' })[0]?.click()

    expect(actions.onCopyPaths).toHaveBeenCalledWith(['/workspace/src', '/workspace/app.log'])
  })

  it('keeps workspace shortcuts active after selecting an item from the context menu', () => {
    const actions = createActions()
    render(
      <WorkspaceFileTree
        contextMenuActions={actions}
        includeHidden={false}
        onSelectPath={vi.fn()}
        rootPath="/workspace"
        selectedPath={null}
        sortDirection="asc"
        sortKey="name"
        viewMode="list"
      />
    )

    const readme = screen.getByRole('button', { name: 'README.md' })
    fireEvent.contextMenu(readme)
    screen.getByRole('button', { name: 'terminal.workspace.context.copy' }).click()
    fireEvent.keyDown(document.body, { key: 'v', metaKey: true })

    expect(actions.onCopyItems).toHaveBeenCalledWith([expect.objectContaining({ path: '/workspace/README.md' })])
    expect(actions.onPaste).toHaveBeenCalledOnce()
  })

  it('keeps marquee-selected workspace items as the context-menu target after mouse up', () => {
    const actions = createActions()
    render(
      <WorkspaceFileTree
        contextMenuActions={actions}
        includeHidden={false}
        onSelectPath={vi.fn()}
        rootPath="/workspace"
        selectedPath={null}
        sortDirection="asc"
        sortKey="name"
        viewMode="list"
      />
    )
    const tree = screen.getByTestId('workspace-file-tree-content')
    vi.spyOn(tree, 'getBoundingClientRect').mockReturnValue({
      bottom: 220,
      height: 220,
      left: 0,
      right: 300,
      top: 0,
      width: 300,
      x: 0,
      y: 0,
      toJSON: () => ({})
    })

    const rows = screen.getAllByTestId('workspace-item')
    vi.spyOn(rows[0], 'getBoundingClientRect').mockReturnValue({
      bottom: 40,
      height: 32,
      left: 8,
      right: 292,
      top: 8,
      width: 284,
      x: 8,
      y: 8,
      toJSON: () => ({})
    })
    vi.spyOn(rows[1], 'getBoundingClientRect').mockReturnValue({
      bottom: 80,
      height: 32,
      left: 8,
      right: 292,
      top: 48,
      width: 284,
      x: 8,
      y: 48,
      toJSON: () => ({})
    })
    vi.spyOn(rows[2], 'getBoundingClientRect').mockReturnValue({
      bottom: 120,
      height: 32,
      left: 8,
      right: 292,
      top: 88,
      width: 284,
      x: 8,
      y: 88,
      toJSON: () => ({})
    })

    fireEvent.mouseDown(tree, { button: 0, clientX: 4, clientY: 4 })
    fireEvent.mouseMove(document, { clientX: 280, clientY: 82 })
    fireEvent.mouseUp(document)
    fireEvent.contextMenu(rows[0])
    screen.getAllByRole('button', { name: 'terminal.workspace.context.copy_path' })[0]?.click()

    expect(actions.onCopyPaths).toHaveBeenCalledWith(['/workspace/src', '/workspace/app.log'])
  })

  it('selects every visible workspace item with command or control a', () => {
    const actions = createActions()
    render(
      <WorkspaceFileTree
        contextMenuActions={actions}
        includeHidden={false}
        onSelectPath={vi.fn()}
        rootPath="/workspace"
        selectedPath={null}
        sortDirection="asc"
        sortKey="name"
        viewMode="list"
      />
    )
    const tree = screen.getByTestId('workspace-file-tree-content')

    fireEvent.keyDown(tree, { key: 'a', metaKey: true })
    fireEvent.keyDown(tree, { key: 'c', metaKey: true })
    fireEvent.keyDown(tree, { key: 'a', ctrlKey: true })
    fireEvent.keyDown(tree, { key: 'c', ctrlKey: true })

    expect(actions.onCopyItems).toHaveBeenNthCalledWith(1, [
      expect.objectContaining({ path: '/workspace/src' }),
      expect.objectContaining({ path: '/workspace/app.log' }),
      expect.objectContaining({ path: '/workspace/README.md' })
    ])
    expect(actions.onCopyItems).toHaveBeenNthCalledWith(2, [
      expect.objectContaining({ path: '/workspace/src' }),
      expect.objectContaining({ path: '/workspace/app.log' }),
      expect.objectContaining({ path: '/workspace/README.md' })
    ])
  })

  it('runs keyboard shortcuts for all selected workspace items', () => {
    const actions = createActions()
    render(
      <WorkspaceFileTree
        contextMenuActions={actions}
        includeHidden={false}
        onSelectPath={vi.fn()}
        rootPath="/workspace"
        selectedPath={null}
        sortDirection="asc"
        sortKey="name"
        viewMode="list"
      />
    )
    const tree = screen.getByTestId('workspace-file-tree-content')

    fireEvent.click(screen.getByRole('button', { name: 'src' }), { ctrlKey: true })
    fireEvent.click(screen.getByRole('button', { name: 'app.log' }), { ctrlKey: true })
    fireEvent.keyDown(tree, { key: 'c', ctrlKey: true, shiftKey: true })
    fireEvent.keyDown(tree, { key: 'c', metaKey: true })
    fireEvent.keyDown(tree, { key: 'x', ctrlKey: true })
    fireEvent.keyDown(tree, { key: 'Delete' })

    expect(actions.onCopyPaths).toHaveBeenCalledWith(['/workspace/src', '/workspace/app.log'])
    expect(actions.onCopyItems).toHaveBeenCalledWith([
      expect.objectContaining({ path: '/workspace/src' }),
      expect.objectContaining({ path: '/workspace/app.log' })
    ])
    expect(actions.onCutItems).toHaveBeenCalledWith([
      expect.objectContaining({ path: '/workspace/src' }),
      expect.objectContaining({ path: '/workspace/app.log' })
    ])
    expect(actions.onTrashItems).toHaveBeenCalledWith([
      expect.objectContaining({ path: '/workspace/src' }),
      expect.objectContaining({ path: '/workspace/app.log' })
    ])
  })
})
