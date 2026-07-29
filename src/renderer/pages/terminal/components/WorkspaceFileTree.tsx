import { EmptyState } from '@cherrystudio/ui'
import { FileTree, type FileTreeNode } from '@renderer/components/FileTree'
import { useDirectoryTree } from '@renderer/hooks/useDirectoryTree'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { projectWorkspaceTree, type WorkspaceTreeItem } from '../lib/workspaceTree'

const TERMINAL_PATH_DRAG_MIME_TYPE = 'application/x-cherry-terminal-path'

export interface WorkspaceFileTreeProps {
  rootPath: string | null
  selectedPath: string | null
  includeHidden: boolean
  onSelectPath: (path: string, kind: WorkspaceTreeItem['kind']) => void
}

function toFileTreeNodes(items: WorkspaceTreeItem[]): FileTreeNode[] {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    path: item.path,
    kind: item.kind === 'directory' ? 'folder' : 'file',
    ...(item.children ? { children: toFileTreeNodes(item.children) } : {})
  }))
}

function findWorkspaceTreeItem(items: WorkspaceTreeItem[], path: string): WorkspaceTreeItem | null {
  for (const item of items) {
    if (item.path === path) return item
    const child = item.children ? findWorkspaceTreeItem(item.children, path) : null
    if (child) return child
  }
  return null
}

export function WorkspaceFileTree({ rootPath, selectedPath, includeHidden, onSelectPath }: WorkspaceFileTreeProps) {
  return (
    <WorkspaceFileTreeContent
      key={`${rootPath ?? 'empty'}:${includeHidden}`}
      includeHidden={includeHidden}
      onSelectPath={onSelectPath}
      rootPath={rootPath}
      selectedPath={selectedPath}
    />
  )
}

function WorkspaceFileTreeContent({ rootPath, selectedPath, includeHidden, onSelectPath }: WorkspaceFileTreeProps) {
  const { t } = useTranslation()
  const { error, isLoading, root, version } = useDirectoryTree(rootPath ?? undefined, {
    includeHidden,
    respectGitignore: true,
    withStats: true
  })
  const items = useMemo(
    () => (root ? projectWorkspaceTree(root) : []),
    // useDirectoryTree preserves root identity while applying mutations, so version must invalidate this projection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [root, version]
  )
  const nodes = useMemo(() => toFileTreeNodes(items), [items])

  if (!rootPath) {
    return <EmptyState className="h-full" title={t('terminal.workspace.tree.empty')} />
  }

  if (isLoading) {
    return <EmptyState className="h-full" title={t('terminal.workspace.tree.loading')} />
  }

  if (error) {
    return <EmptyState className="h-full" title={t('terminal.workspace.tree.error')} />
  }

  return (
    <FileTree
      emptyState={<EmptyState className="h-full" title={t('terminal.workspace.tree.no_files')} />}
      nodes={nodes}
      onDragStart={(node, event) => {
        event.dataTransfer.setData(TERMINAL_PATH_DRAG_MIME_TYPE, JSON.stringify({ path: node.path }))
      }}
      onSelectedChange={(path) => {
        if (!path) return
        const item = findWorkspaceTreeItem(items, path)
        if (item) onSelectPath(path, item.kind)
      }}
      selectedId={selectedPath}
    />
  )
}
