import { TreeDir, type TreeDirRoot, type TreeNode } from '@shared/utils/file'

export type WorkspaceViewMode = 'list' | 'icons'
export type WorkspaceIconSize = 'small' | 'medium' | 'large'
export type WorkspaceSortKey = 'name' | 'mtime' | 'size'
export type WorkspaceSortDirection = 'asc' | 'desc'

export interface WorkspaceTreeItem {
  id: string
  name: string
  path: string
  kind: 'directory' | 'file'
  mtime: number
  size: number
  children?: WorkspaceTreeItem[]
}

function compareWorkspaceNodes(
  left: TreeNode,
  right: TreeNode,
  sortKey: WorkspaceSortKey,
  sortDirection: WorkspaceSortDirection
): number {
  const leftIsDirectory = left instanceof TreeDir
  const rightIsDirectory = right instanceof TreeDir
  if (leftIsDirectory !== rightIsDirectory) return leftIsDirectory ? -1 : 1

  const direction = sortDirection === 'asc' ? 1 : -1
  if (sortKey === 'mtime') {
    const result = (left.stats?.mtime ?? 0) - (right.stats?.mtime ?? 0)
    if (result !== 0) return result * direction
  }
  if (sortKey === 'size') {
    const result = (left.stats?.size ?? 0) - (right.stats?.size ?? 0)
    if (result !== 0) return result * direction
  }

  return left.basename.localeCompare(right.basename) * direction
}

function projectWorkspaceNode(
  node: TreeNode,
  sortKey: WorkspaceSortKey,
  sortDirection: WorkspaceSortDirection
): WorkspaceTreeItem {
  const isDirectory = node instanceof TreeDir
  const children = isDirectory
    ? Object.values(node.children)
        .sort((left, right) => compareWorkspaceNodes(left, right, sortKey, sortDirection))
        .map((child) => projectWorkspaceNode(child, sortKey, sortDirection))
    : undefined

  return {
    id: node.path,
    name: node.basename,
    path: node.path,
    kind: isDirectory ? 'directory' : 'file',
    mtime: node.stats?.mtime ?? 0,
    size: node.stats?.size ?? 0,
    ...(children?.length ? { children } : {})
  }
}

export function projectWorkspaceTree(
  root: TreeDirRoot,
  sortKey: WorkspaceSortKey = 'name',
  sortDirection: WorkspaceSortDirection = 'asc'
): WorkspaceTreeItem[] {
  return Object.values(root.children)
    .sort((left, right) => compareWorkspaceNodes(left, right, sortKey, sortDirection))
    .map((node) => projectWorkspaceNode(node, sortKey, sortDirection))
}
