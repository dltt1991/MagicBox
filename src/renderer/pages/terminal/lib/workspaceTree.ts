import { TreeDir, type TreeDirRoot, type TreeNode } from '@shared/utils/file'

export interface WorkspaceTreeItem {
  id: string
  name: string
  path: string
  kind: 'directory' | 'file'
  children?: WorkspaceTreeItem[]
}

function projectWorkspaceNode(node: TreeNode): WorkspaceTreeItem {
  const isDirectory = node instanceof TreeDir
  const children = isDirectory
    ? Object.values(node.children)
        .sort((left, right) => {
          const leftIsDirectory = left instanceof TreeDir
          const rightIsDirectory = right instanceof TreeDir
          if (leftIsDirectory !== rightIsDirectory) return leftIsDirectory ? -1 : 1
          return left.basename.localeCompare(right.basename)
        })
        .map(projectWorkspaceNode)
    : undefined

  return {
    id: node.path,
    name: node.basename,
    path: node.path,
    kind: isDirectory ? 'directory' : 'file',
    ...(children?.length ? { children } : {})
  }
}

export function projectWorkspaceTree(root: TreeDirRoot): WorkspaceTreeItem[] {
  return Object.values(root.children)
    .sort((left, right) => {
      const leftIsDirectory = left instanceof TreeDir
      const rightIsDirectory = right instanceof TreeDir
      if (leftIsDirectory !== rightIsDirectory) return leftIsDirectory ? -1 : 1
      return left.basename.localeCompare(right.basename)
    })
    .map(projectWorkspaceNode)
}
