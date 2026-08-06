import { TreeDir, TreeDirRoot, TreeFile } from '@shared/utils/file'
import { describe, expect, it } from 'vitest'

import { projectWorkspaceTree } from '../workspaceTree'

describe('projectWorkspaceTree', () => {
  it('projects directories before files while preserving absolute paths', () => {
    const root = new TreeDirRoot('/workspace')
    const src = new TreeDir({ path: '/workspace/src' })
    const docs = new TreeDir({ path: '/workspace/docs' })
    const packageJson = new TreeFile({ path: '/workspace/package.json' })
    const readme = new TreeFile({ path: '/workspace/README.md' })

    src.attachChild(new TreeFile({ path: '/workspace/src/index.ts' }))
    root.attachChild(packageJson)
    root.attachChild(src)
    root.attachChild(readme)
    root.attachChild(docs)

    expect(projectWorkspaceTree(root)).toEqual([
      {
        id: '/workspace/docs',
        kind: 'directory',
        mtime: 0,
        name: 'docs',
        path: '/workspace/docs',
        size: 0
      },
      {
        children: [
          {
            id: '/workspace/src/index.ts',
            kind: 'file',
            mtime: 0,
            name: 'index.ts',
            path: '/workspace/src/index.ts',
            size: 0
          }
        ],
        id: '/workspace/src',
        kind: 'directory',
        mtime: 0,
        name: 'src',
        path: '/workspace/src',
        size: 0
      },
      {
        id: '/workspace/package.json',
        kind: 'file',
        mtime: 0,
        name: 'package.json',
        path: '/workspace/package.json',
        size: 0
      },
      {
        id: '/workspace/README.md',
        kind: 'file',
        mtime: 0,
        name: 'README.md',
        path: '/workspace/README.md',
        size: 0
      }
    ])
  })
})
