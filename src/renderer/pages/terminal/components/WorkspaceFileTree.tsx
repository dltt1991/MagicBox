import { EmptyState } from '@cherrystudio/ui'
import { cn } from '@cherrystudio/ui/lib/utils'
import { useDirectoryTree } from '@renderer/hooks/useDirectoryTree'
import { File, Folder } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import {
  projectWorkspaceTree,
  type WorkspaceSortDirection,
  type WorkspaceSortKey,
  type WorkspaceTreeItem,
  type WorkspaceViewMode
} from '../lib/workspaceTree'

const TERMINAL_PATH_DRAG_MIME_TYPE = 'application/x-cherry-terminal-path'
const LIST_COLUMN_CLASS = 'grid-cols-[minmax(10rem,1fr)_8.5rem_5.5rem]'

export interface WorkspaceFileTreeProps {
  rootPath: string | null
  selectedPath: string | null
  includeHidden: boolean
  viewMode: WorkspaceViewMode
  sortKey: WorkspaceSortKey
  sortDirection: WorkspaceSortDirection
  onSelectPath: (path: string, kind: WorkspaceTreeItem['kind']) => void
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = size / 1024
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`
}

function formatTime(mtime: number): string {
  if (!mtime) return '-'
  return new Date(mtime).toLocaleString()
}

function WorkspaceItemIcon({ kind }: { kind: WorkspaceTreeItem['kind'] }) {
  return kind === 'directory' ? (
    <Folder className="size-4 shrink-0 text-amber-500" />
  ) : (
    <File className="size-4 shrink-0 text-muted-foreground" />
  )
}

export function WorkspaceFileTree({
  rootPath,
  selectedPath,
  includeHidden,
  viewMode,
  sortKey,
  sortDirection,
  onSelectPath
}: WorkspaceFileTreeProps) {
  return (
    <WorkspaceFileTreeContent
      key={`${rootPath ?? 'empty'}:${includeHidden}`}
      includeHidden={includeHidden}
      onSelectPath={onSelectPath}
      rootPath={rootPath}
      sortDirection={sortDirection}
      sortKey={sortKey}
      selectedPath={selectedPath}
      viewMode={viewMode}
    />
  )
}

function WorkspaceFileTreeContent({
  rootPath,
  selectedPath,
  includeHidden,
  viewMode,
  sortKey,
  sortDirection,
  onSelectPath
}: WorkspaceFileTreeProps) {
  const { t } = useTranslation()
  const { error, isLoading, root, version } = useDirectoryTree(rootPath ?? undefined, {
    includeHidden,
    maxDepth: 1,
    respectGitignore: true,
    withStats: true
  })
  const items = useMemo(
    () => (root ? projectWorkspaceTree(root, sortKey, sortDirection) : []),
    // useDirectoryTree preserves root identity while applying mutations, so version must invalidate this projection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [root, version, sortKey, sortDirection]
  )

  if (!rootPath) {
    return <EmptyState className="h-full" title={t('terminal.workspace.tree.empty')} />
  }

  if (isLoading) {
    return <EmptyState className="h-full" title={t('terminal.workspace.tree.loading')} />
  }

  if (error) {
    return <EmptyState className="h-full" title={t('terminal.workspace.tree.error')} />
  }

  if (items.length === 0) {
    return <EmptyState className="h-full" title={t('terminal.workspace.tree.no_files')} />
  }

  const renderItem = (item: WorkspaceTreeItem, className?: string) => (
    <button
      aria-label={item.name}
      className={cn(
        'min-w-0 rounded-md text-left text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
        viewMode === 'list' && 'w-full',
        selectedPath === item.path && 'bg-accent text-accent-foreground',
        className
      )}
      data-list-columns={viewMode === 'list' ? 'workspace-file-list' : undefined}
      data-kind={item.kind}
      data-testid="workspace-item"
      draggable
      key={item.id}
      onClick={() => onSelectPath(item.path, item.kind)}
      onDragStart={(event) => {
        event.dataTransfer.setData(TERMINAL_PATH_DRAG_MIME_TYPE, JSON.stringify({ path: item.path }))
      }}
      title={item.path}
      type="button">
      {viewMode === 'icons' ? (
        <span className="flex min-h-24 flex-col items-center justify-center gap-2 p-3">
          <WorkspaceItemIcon kind={item.kind} />
          <span className="line-clamp-2 w-full break-words text-center text-xs">{item.name}</span>
        </span>
      ) : (
        <span className={cn('grid min-h-8 items-center gap-2 px-2', LIST_COLUMN_CLASS)}>
          <span className="flex min-w-0 items-center gap-2">
            <WorkspaceItemIcon kind={item.kind} />
            <span className="truncate">{item.name}</span>
          </span>
          <span className="truncate text-muted-foreground text-xs">{formatTime(item.mtime)}</span>
          <span className="truncate text-right text-muted-foreground text-xs">
            {item.kind === 'directory' ? '-' : formatSize(item.size)}
          </span>
        </span>
      )}
    </button>
  )

  return (
    <div className="h-full min-h-0 overflow-auto p-2" data-view-mode={viewMode}>
      {viewMode === 'list' && (
        <div
          className={cn(
            'sticky top-0 z-10 grid h-7 items-center gap-2 bg-background px-2 text-muted-foreground text-xs',
            LIST_COLUMN_CLASS
          )}
          data-list-columns="workspace-file-list"
          data-testid="workspace-list-header">
          <span>{t('terminal.workspace.sort.name')}</span>
          <span>{t('terminal.workspace.sort.mtime')}</span>
          <span className="text-right">{t('terminal.workspace.sort.size')}</span>
        </div>
      )}
      <div
        className={viewMode === 'icons' ? 'grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2' : 'space-y-1'}>
        {items.map((item) => renderItem(item))}
      </div>
    </div>
  )
}
