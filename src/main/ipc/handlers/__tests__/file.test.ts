import type * as FileDispatchModule from '@main/services/file/internal/dispatch'
import type { AbsoluteFilePath } from '@shared/types/file'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  appGetMock,
  copyMock,
  mkdirMock,
  getMetadataByPathMock,
  openMock,
  readByPathMock,
  renamePathMock,
  rmMock,
  safeOpenMock,
  statMock,
  showPathInFolderMock,
  trashItemMock,
  writeFileMock,
  writeIfUnchangedByPathMock
} = vi.hoisted(() => ({
  appGetMock: vi.fn(),
  copyMock: vi.fn(),
  mkdirMock: vi.fn(),
  getMetadataByPathMock: vi.fn(),
  openMock: vi.fn(),
  readByPathMock: vi.fn(),
  renamePathMock: vi.fn(),
  rmMock: vi.fn(),
  safeOpenMock: vi.fn(),
  statMock: vi.fn(),
  showPathInFolderMock: vi.fn(),
  trashItemMock: vi.fn(),
  writeFileMock: vi.fn(),
  writeIfUnchangedByPathMock: vi.fn()
}))
vi.mock('@application', () => ({ application: { get: appGetMock } }))
vi.mock('electron', () => ({ shell: { trashItem: trashItemMock } }))
vi.mock('node:fs/promises', () => ({
  cp: copyMock,
  mkdir: mkdirMock,
  open: openMock,
  rename: renamePathMock,
  rm: rmMock,
  stat: statMock,
  writeFile: writeFileMock
}))
vi.mock('@main/services/file', async () => {
  // dispatchHandle is exercised for real so these tests cover handle routing.
  const { dispatchHandle } = await vi.importActual<typeof FileDispatchModule>('@main/services/file/internal/dispatch')
  return {
    dispatchHandle,
    getMetadataByPath: getMetadataByPathMock,
    readByPath: readByPathMock,
    safeOpen: safeOpenMock,
    showInFolder: showPathInFolderMock,
    writeIfUnchangedByPath: writeIfUnchangedByPathMock
  }
})

import { PathStaleVersionError } from '@main/utils/file'
import { fileErrorCodes } from '@shared/ipc/errors/file'

import { fileHandlers } from '../file'

const ids = ['019606a0-0000-7000-8000-000000000001', '019606a0-0000-7000-8000-000000000002']

const metadata = {
  kind: 'file' as const,
  type: 'other' as const,
  size: 12,
  createdAt: 1,
  modifiedAt: 2,
  mime: 'text/plain'
}

const batchResult = { succeeded: [ids[0]], failed: [{ id: ids[1], error: 'failed' }] }
const version = { mtime: 1, size: 4 }

const fileManager = {
  read: vi.fn(),
  getMetadata: vi.fn(),
  getPhysicalPath: vi.fn(),
  batchGetDanglingStates: vi.fn(),
  batchTrash: vi.fn(),
  batchRestore: vi.fn(),
  batchPermanentDelete: vi.fn(),
  emptyTrash: vi.fn(),
  rename: vi.fn(),
  open: vi.fn(),
  showInFolder: vi.fn(),
  batchCreateInternalEntries: vi.fn()
}

beforeEach(() => {
  vi.clearAllMocks()
  openMock.mockResolvedValue({ close: vi.fn() })
  appGetMock.mockImplementation((name: string) => {
    if (name === 'FileManager') return fileManager
    throw new Error(`Unexpected application.get(${name})`)
  })
})

const ctx = { senderId: null }
const missingPathError = () => Object.assign(new Error('missing'), { code: 'ENOENT' })

describe('fileHandlers', () => {
  it('reads binary content by path through the generic FileHandle route', async () => {
    const result = { content: new Uint8Array([3, 4]), mime: 'text/markdown', version }
    readByPathMock.mockResolvedValueOnce(result)

    await expect(
      fileHandlers['file.read'](
        { handle: { kind: 'path', path: '/tmp/report.md' as AbsoluteFilePath }, options: { encoding: 'binary' } },
        ctx
      )
    ).resolves.toBe(result)

    expect(readByPathMock).toHaveBeenCalledWith('/tmp/report.md', { encoding: 'binary' })
  })

  it('reads binary content from a managed entry through the generic FileHandle route', async () => {
    const result = { content: new Uint8Array([3, 4]), mime: 'text/markdown', version }
    fileManager.read.mockResolvedValueOnce(result)

    await expect(
      fileHandlers['file.read']({ handle: { kind: 'entry', entryId: ids[0] }, options: { encoding: 'binary' } }, ctx)
    ).resolves.toBe(result)

    expect(fileManager.read).toHaveBeenCalledWith(ids[0], { encoding: 'binary' })
  })

  it('writes a path only when its version is unchanged', async () => {
    const data = new Uint8Array([5, 6])
    const expectedVersion = { mtime: 1, size: 4 }
    const nextVersion = { mtime: 2, size: 2 }
    writeIfUnchangedByPathMock.mockResolvedValueOnce(nextVersion)

    await expect(
      fileHandlers['file.write_if_unchanged'](
        {
          path: '/tmp/report.md' as AbsoluteFilePath,
          data,
          expectedVersion
        },
        ctx
      )
    ).resolves.toBe(nextVersion)

    expect(writeIfUnchangedByPathMock).toHaveBeenCalledWith('/tmp/report.md', data, expectedVersion)
  })

  it('maps path version conflicts to FILE_STALE_VERSION', async () => {
    const data = new Uint8Array([5, 6])
    const expected = { mtime: 1, size: 4 }
    const current = { mtime: 2, size: 8 }
    writeIfUnchangedByPathMock.mockRejectedValueOnce(
      new PathStaleVersionError('/tmp/report.md' as AbsoluteFilePath, expected, current)
    )
    await expect(
      fileHandlers['file.write_if_unchanged'](
        { path: '/tmp/report.md' as AbsoluteFilePath, data, expectedVersion: expected },
        ctx
      )
    ).rejects.toMatchObject({
      code: fileErrorCodes.STALE_VERSION,
      data: { expected, current }
    })
  })

  it('batch_get_metadata dispatches FileHandle items inside the IPC adapter', async () => {
    const items = [
      { key: ids[0], handle: { kind: 'entry' as const, entryId: ids[0] } },
      { key: '/tmp/a.txt', handle: { kind: 'path' as const, path: '/tmp/a.txt' as AbsoluteFilePath } },
      { key: ids[1], handle: { kind: 'entry' as const, entryId: ids[1] } }
    ]
    fileManager.getMetadata.mockResolvedValueOnce(metadata).mockRejectedValueOnce(new Error('ENOENT'))
    getMetadataByPathMock.mockResolvedValueOnce({ ...metadata, size: 34 })

    await expect(fileHandlers['file.batch_get_metadata']({ items }, ctx)).resolves.toEqual({
      [ids[0]]: metadata,
      '/tmp/a.txt': { ...metadata, size: 34 },
      [ids[1]]: null
    })
    expect(fileManager.getMetadata).toHaveBeenCalledWith(ids[0])
    expect(fileManager.getMetadata).toHaveBeenCalledWith(ids[1])
    expect(getMetadataByPathMock).toHaveBeenCalledWith('/tmp/a.txt')
  })

  it('batch_get_physical_paths returns null for per-entry path failures', async () => {
    fileManager.getPhysicalPath.mockReturnValueOnce('/tmp/a.png').mockImplementationOnce(() => {
      throw new Error('ENOENT')
    })

    await expect(fileHandlers['file.batch_get_physical_paths']({ ids }, ctx)).resolves.toEqual({
      [ids[0]]: '/tmp/a.png',
      [ids[1]]: null
    })
    expect(fileManager.getPhysicalPath).toHaveBeenCalledWith(ids[0])
    expect(fileManager.getPhysicalPath).toHaveBeenCalledWith(ids[1])
  })

  it('delegates batch entry operations to FileManager', async () => {
    fileManager.batchGetDanglingStates.mockResolvedValue({ [ids[0]]: 'present' })
    fileManager.batchTrash.mockResolvedValue(batchResult)
    fileManager.batchRestore.mockResolvedValue(batchResult)
    fileManager.batchPermanentDelete.mockResolvedValue(batchResult)
    fileManager.emptyTrash.mockResolvedValue(batchResult)

    await expect(fileHandlers['file.batch_get_dangling_states']({ ids }, ctx)).resolves.toEqual({
      [ids[0]]: 'present'
    })
    await expect(fileHandlers['file.batch_trash']({ ids }, ctx)).resolves.toBe(batchResult)
    await expect(fileHandlers['file.batch_restore']({ ids }, ctx)).resolves.toBe(batchResult)
    await expect(fileHandlers['file.batch_permanent_delete']({ ids }, ctx)).resolves.toBe(batchResult)
    await expect(fileHandlers['file.empty_trash'](undefined, ctx)).resolves.toBe(batchResult)

    expect(fileManager.batchGetDanglingStates).toHaveBeenCalledWith({ ids })
    expect(fileManager.batchTrash).toHaveBeenCalledWith(ids)
    expect(fileManager.batchRestore).toHaveBeenCalledWith(ids)
    expect(fileManager.batchPermanentDelete).toHaveBeenCalledWith(ids)
    expect(fileManager.emptyTrash).toHaveBeenCalled()
  })

  it('delegates single-entry commands to FileManager', async () => {
    const renamed = { id: ids[0], origin: 'internal', name: 'renamed', ext: 'txt', size: 1, createdAt: 1, updatedAt: 2 }
    fileManager.rename.mockResolvedValue(renamed)

    await expect(fileHandlers['file.rename']({ id: ids[0], newName: 'renamed' }, ctx)).resolves.toBe(renamed)
    await fileHandlers['file.open']({ kind: 'entry', entryId: ids[0] }, ctx)
    await fileHandlers['file.show_in_folder']({ kind: 'entry', entryId: ids[0] }, ctx)

    expect(fileManager.rename).toHaveBeenCalledWith(ids[0], 'renamed')
    expect(fileManager.open).toHaveBeenCalledWith(ids[0])
    expect(fileManager.showInFolder).toHaveBeenCalledWith(ids[0])
  })

  it('dispatches path system commands without FileManager entry lookup', async () => {
    await fileHandlers['file.open']({ kind: 'path', path: '/tmp/report.md' as AbsoluteFilePath }, ctx)
    await fileHandlers['file.show_in_folder']({ kind: 'path', path: '/tmp/report.md' as AbsoluteFilePath }, ctx)

    expect(safeOpenMock).toHaveBeenCalledWith('/tmp/report.md')
    expect(showPathInFolderMock).toHaveBeenCalledWith('/tmp/report.md')
    expect(fileManager.open).not.toHaveBeenCalled()
    expect(fileManager.showInFolder).not.toHaveBeenCalled()
  })

  it('delegates internal-entry batch create items to FileManager', async () => {
    const result = { succeeded: [{ id: ids[0], sourceRef: '/tmp/a.txt' }], failed: [] }
    const items = [
      { source: 'path' as const, path: '/tmp/a.txt' as AbsoluteFilePath },
      { source: 'path' as const, path: '/tmp/b.txt' as AbsoluteFilePath }
    ]
    fileManager.batchCreateInternalEntries.mockResolvedValue(result)

    await expect(fileHandlers['file.batch_create_internal_entries']({ items }, ctx)).resolves.toBe(result)
    expect(fileManager.batchCreateInternalEntries).toHaveBeenCalledWith(items)
  })

  it('stats physical paths for workspace properties', async () => {
    statMock.mockResolvedValueOnce({
      birthtimeMs: 11,
      isDirectory: () => true,
      isFile: () => false,
      mtimeMs: 22,
      size: 4096
    })

    await expect(fileHandlers['file.path_stat']({ path: '/workspace/src' as AbsoluteFilePath }, ctx)).resolves.toEqual({
      path: '/workspace/src',
      name: 'src',
      kind: 'directory',
      size: 4096,
      createdAt: 11,
      modifiedAt: 22
    })
  })

  it('creates workspace folders and files under the requested parent', async () => {
    statMock
      .mockRejectedValueOnce(missingPathError())
      .mockResolvedValueOnce({
        birthtimeMs: 1,
        isDirectory: () => true,
        isFile: () => false,
        mtimeMs: 2,
        size: 64
      })
      .mockRejectedValueOnce(missingPathError())
      .mockResolvedValueOnce({
        birthtimeMs: 3,
        isDirectory: () => false,
        isFile: () => true,
        mtimeMs: 4,
        size: 0
      })

    await expect(
      fileHandlers['file.path_create_directory'](
        { parentPath: '/workspace' as AbsoluteFilePath, name: 'New Folder' },
        ctx
      )
    ).resolves.toMatchObject({ path: '/workspace/New Folder', kind: 'directory' })
    await expect(
      fileHandlers['file.path_create_file']({ parentPath: '/workspace' as AbsoluteFilePath, name: 'notes.md' }, ctx)
    ).resolves.toMatchObject({ path: '/workspace/notes.md', kind: 'file' })

    expect(mkdirMock).toHaveBeenCalledWith('/workspace/New Folder')
    expect(openMock).toHaveBeenCalledWith('/workspace/notes.md', 'wx')
  })

  it('creates workspace folders and files with an available name when the requested name exists', async () => {
    statMock
      .mockResolvedValueOnce({
        birthtimeMs: 1,
        isDirectory: () => false,
        isFile: () => true,
        mtimeMs: 2,
        size: 10
      })
      .mockRejectedValueOnce(missingPathError())
      .mockResolvedValueOnce({
        birthtimeMs: 3,
        isDirectory: () => false,
        isFile: () => true,
        mtimeMs: 4,
        size: 11
      })
      .mockResolvedValueOnce({
        birthtimeMs: 5,
        isDirectory: () => true,
        isFile: () => false,
        mtimeMs: 6,
        size: 64
      })
      .mockRejectedValueOnce(missingPathError())
      .mockResolvedValueOnce({
        birthtimeMs: 7,
        isDirectory: () => true,
        isFile: () => false,
        mtimeMs: 8,
        size: 64
      })

    await expect(
      fileHandlers['file.path_create_file']({ parentPath: '/workspace' as AbsoluteFilePath, name: 'notes.md' }, ctx)
    ).resolves.toMatchObject({ path: '/workspace/notes 2.md', kind: 'file' })
    await expect(
      fileHandlers['file.path_create_directory']({ parentPath: '/workspace' as AbsoluteFilePath, name: 'Drafts' }, ctx)
    ).resolves.toMatchObject({ path: '/workspace/Drafts 2', kind: 'directory' })

    expect(openMock).toHaveBeenCalledWith('/workspace/notes 2.md', 'wx')
    expect(mkdirMock).toHaveBeenCalledWith('/workspace/Drafts 2')
  })

  it('renames and trashes physical workspace items', async () => {
    statMock.mockResolvedValueOnce({
      birthtimeMs: 5,
      isDirectory: () => false,
      isFile: () => true,
      mtimeMs: 6,
      size: 10
    })

    await expect(
      fileHandlers['file.path_rename']({ path: '/workspace/old.md' as AbsoluteFilePath, newName: 'new.md' }, ctx)
    ).resolves.toMatchObject({ path: '/workspace/new.md', name: 'new.md' })
    await fileHandlers['file.path_trash']({ path: '/workspace/new.md' as AbsoluteFilePath }, ctx)

    expect(renamePathMock).toHaveBeenCalledWith('/workspace/old.md', '/workspace/new.md')
    expect(trashItemMock).toHaveBeenCalledWith('/workspace/new.md')
  })

  it('returns a paste conflict before copying or moving over an existing target', async () => {
    statMock
      .mockResolvedValueOnce({
        birthtimeMs: 1,
        isDirectory: () => false,
        isFile: () => true,
        mtimeMs: 2,
        size: 10
      })
      .mockRejectedValueOnce(missingPathError())

    await expect(
      fileHandlers['file.path_paste'](
        {
          sourcePath: '/workspace/a.md' as AbsoluteFilePath,
          targetDirectory: '/workspace/dest' as AbsoluteFilePath,
          operation: 'copy',
          conflict: 'prompt'
        },
        ctx
      )
    ).resolves.toEqual({
      status: 'conflict',
      existingPath: '/workspace/dest/a.md',
      suggestedName: 'a copy.md'
    })
    expect(copyMock).not.toHaveBeenCalled()
    expect(renamePathMock).not.toHaveBeenCalled()
  })

  it('suggests the next available paste name when the first copy name already exists', async () => {
    statMock
      .mockResolvedValueOnce({
        birthtimeMs: 1,
        isDirectory: () => false,
        isFile: () => true,
        mtimeMs: 2,
        size: 10
      })
      .mockResolvedValueOnce({
        birthtimeMs: 3,
        isDirectory: () => false,
        isFile: () => true,
        mtimeMs: 4,
        size: 10
      })
      .mockRejectedValueOnce(missingPathError())

    await expect(
      fileHandlers['file.path_paste'](
        {
          sourcePath: '/workspace/a.md' as AbsoluteFilePath,
          targetDirectory: '/workspace/dest' as AbsoluteFilePath,
          operation: 'copy',
          conflict: 'prompt'
        },
        ctx
      )
    ).resolves.toEqual({
      status: 'conflict',
      existingPath: '/workspace/dest/a.md',
      suggestedName: 'a copy 2.md'
    })
  })

  it('returns a new paste conflict when the requested renamed target also exists', async () => {
    statMock
      .mockResolvedValueOnce({
        birthtimeMs: 1,
        isDirectory: () => false,
        isFile: () => true,
        mtimeMs: 2,
        size: 10
      })
      .mockRejectedValueOnce(missingPathError())

    await expect(
      fileHandlers['file.path_paste'](
        {
          sourcePath: '/workspace/a.md' as AbsoluteFilePath,
          targetDirectory: '/workspace/dest' as AbsoluteFilePath,
          operation: 'copy',
          conflict: 'rename',
          newName: 'a copy.md'
        },
        ctx
      )
    ).resolves.toEqual({
      status: 'conflict',
      existingPath: '/workspace/dest/a copy.md',
      suggestedName: 'a copy 2.md'
    })
    expect(copyMock).not.toHaveBeenCalled()
  })

  it('pastes workspace items with rename and replace conflict policies', async () => {
    statMock
      .mockRejectedValueOnce(missingPathError())
      .mockResolvedValueOnce({
        birthtimeMs: 3,
        isDirectory: () => true,
        isFile: () => false,
        mtimeMs: 4,
        size: 64
      })
      .mockResolvedValueOnce({
        birthtimeMs: 5,
        isDirectory: () => true,
        isFile: () => false,
        mtimeMs: 6,
        size: 64
      })

    await expect(
      fileHandlers['file.path_paste'](
        {
          sourcePath: '/workspace/a.md' as AbsoluteFilePath,
          targetDirectory: '/workspace/dest' as AbsoluteFilePath,
          operation: 'copy',
          conflict: 'rename',
          newName: 'a copy.md'
        },
        ctx
      )
    ).resolves.toEqual({ status: 'completed', path: '/workspace/dest/a copy.md' })
    await expect(
      fileHandlers['file.path_paste'](
        {
          sourcePath: '/workspace/src' as AbsoluteFilePath,
          targetDirectory: '/workspace/dest' as AbsoluteFilePath,
          operation: 'move',
          conflict: 'replace'
        },
        ctx
      )
    ).resolves.toEqual({ status: 'completed', path: '/workspace/dest/src' })

    expect(copyMock).toHaveBeenCalledWith('/workspace/a.md', '/workspace/dest/a copy.md', {
      force: false,
      recursive: true,
      errorOnExist: true
    })
    expect(rmMock).toHaveBeenCalledWith('/workspace/dest/src', { recursive: true, force: true })
    expect(renamePathMock).toHaveBeenCalledWith('/workspace/src', '/workspace/dest/src')
  })

  it('does not delete the source when replacing the same physical path', async () => {
    statMock.mockResolvedValueOnce({
      birthtimeMs: 1,
      isDirectory: () => false,
      isFile: () => true,
      mtimeMs: 2,
      size: 10
    })

    await expect(
      fileHandlers['file.path_paste'](
        {
          sourcePath: '/workspace/a.md' as AbsoluteFilePath,
          targetDirectory: '/workspace' as AbsoluteFilePath,
          operation: 'move',
          conflict: 'replace'
        },
        ctx
      )
    ).resolves.toEqual({ status: 'completed', path: '/workspace/a.md' })

    expect(rmMock).not.toHaveBeenCalled()
    expect(copyMock).not.toHaveBeenCalled()
    expect(renamePathMock).not.toHaveBeenCalled()
  })
})
