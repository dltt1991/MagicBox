import * as fs from 'node:fs/promises'
import path from 'node:path'

import { application } from '@application'
import {
  dispatchHandle,
  getMetadataByPath,
  readByPath,
  safeOpen,
  showInFolder as showPathInFolder,
  writeIfUnchangedByPath
} from '@main/services/file'
import { PathStaleVersionError } from '@main/utils/file'
import type { FileHandle } from '@shared/data/types/file'
import { fileErrorCodes } from '@shared/ipc/errors/file'
import { IpcError } from '@shared/ipc/errors/IpcError'
import type { fileRequestSchemas } from '@shared/ipc/schemas/file'
import type { IpcHandlersFor } from '@shared/ipc/types'
import { type AbsoluteFilePath, AbsoluteFilePathSchema, type CreateInternalEntryIpcParams } from '@shared/types/file'
import { shell } from 'electron'

const MAX_AVAILABLE_NAME_ATTEMPTS = 10_000

function toPathInfo(inputPath: string, stats: Awaited<ReturnType<typeof fs.stat>>) {
  return {
    path: AbsoluteFilePathSchema.parse(inputPath),
    name: path.basename(inputPath),
    kind: stats.isDirectory() ? ('directory' as const) : stats.isFile() ? ('file' as const) : ('other' as const),
    size: Number(stats.size),
    createdAt: Number(stats.birthtimeMs),
    modifiedAt: Number(stats.mtimeMs)
  }
}

async function statPath(inputPath: string) {
  return toPathInfo(inputPath, await fs.stat(inputPath))
}

function buildChildPath(parentPath: string, name: string): string {
  return path.join(parentPath, name)
}

function buildRenamedPath(inputPath: string, newName: string): string {
  return path.join(path.dirname(inputPath), newName)
}

function buildCopyName(name: string): string {
  const extension = path.extname(name)
  const stem = extension ? name.slice(0, -extension.length) : name
  return extension ? `${stem} copy${extension}` : `${stem} copy`
}

function appendNameSuffix(name: string, suffix: number): string {
  const extension = path.extname(name)
  const stem = extension ? name.slice(0, -extension.length) : name
  return extension ? `${stem} ${suffix}${extension}` : `${stem} ${suffix}`
}

async function pathExists(inputPath: string): Promise<boolean> {
  try {
    await fs.stat(inputPath)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function buildAvailableChildPath(parentPath: string, name: string): Promise<string> {
  let candidateName = name
  let candidatePath = buildChildPath(parentPath, candidateName)
  let suffix = 2

  while (await pathExists(candidatePath)) {
    if (suffix > MAX_AVAILABLE_NAME_ATTEMPTS) {
      throw new Error(`Unable to find an available name for ${name}`)
    }

    candidateName = appendNameSuffix(name, suffix)
    candidatePath = buildChildPath(parentPath, candidateName)
    suffix += 1
  }

  return candidatePath
}

async function buildNextAvailableChildPath(parentPath: string, name: string): Promise<string> {
  let suffix = 2
  let candidateName = appendNameSuffix(name, suffix)
  let candidatePath = buildChildPath(parentPath, candidateName)

  while (await pathExists(candidatePath)) {
    suffix += 1
    if (suffix > MAX_AVAILABLE_NAME_ATTEMPTS) {
      throw new Error(`Unable to find an available name for ${name}`)
    }

    candidateName = appendNameSuffix(name, suffix)
    candidatePath = buildChildPath(parentPath, candidateName)
  }

  return candidatePath
}

async function pastePath(input: {
  sourcePath: string
  targetDirectory: string
  operation: 'copy' | 'move'
  conflict: 'prompt' | 'rename' | 'replace' | 'cancel'
  newName?: string
}): Promise<
  | { status: 'completed'; path: AbsoluteFilePath }
  | { status: 'conflict'; existingPath: AbsoluteFilePath; suggestedName: string }
  | { status: 'canceled' }
> {
  if (input.conflict === 'cancel') return { status: 'canceled' }

  const sourceName = path.basename(input.sourcePath)
  const targetName = input.conflict === 'rename' ? (input.newName ?? buildCopyName(sourceName)) : sourceName
  const targetPath = buildChildPath(input.targetDirectory, targetName)
  const exists = await pathExists(targetPath)
  const isSamePath = input.sourcePath === targetPath

  if (exists && input.conflict === 'prompt') {
    const suggestedPath = await buildAvailableChildPath(input.targetDirectory, buildCopyName(sourceName))

    return {
      status: 'conflict',
      existingPath: AbsoluteFilePathSchema.parse(targetPath),
      suggestedName: path.basename(suggestedPath)
    }
  }

  if (exists && input.conflict === 'rename') {
    const suggestedPath = await buildNextAvailableChildPath(input.targetDirectory, targetName)

    return {
      status: 'conflict',
      existingPath: AbsoluteFilePathSchema.parse(targetPath),
      suggestedName: path.basename(suggestedPath)
    }
  }

  if (isSamePath) return { status: 'completed', path: AbsoluteFilePathSchema.parse(targetPath) }

  if (exists && input.conflict === 'replace') {
    await fs.rm(targetPath, { recursive: true, force: true })
  }

  if (input.operation === 'copy') {
    await fs.cp(input.sourcePath, targetPath, { force: false, recursive: true, errorOnExist: true })
  } else {
    await fs.rename(input.sourcePath, targetPath)
  }

  return { status: 'completed', path: AbsoluteFilePathSchema.parse(targetPath) }
}

/**
 * Thin adapters for FileManager-backed file routes. Pure SQL file-entry reads stay
 * on DataApi; these handlers cover live FS metadata and user-triggered mutations.
 */
export const fileHandlers: IpcHandlersFor<typeof fileRequestSchemas> = {
  'file.read': async ({ handle, options }) => {
    const fileManager = application.get('FileManager')
    return dispatchHandle(
      handle as FileHandle,
      (entryId) => fileManager.read(entryId, options),
      (path) => readByPath(path, options)
    )
  },
  'file.write_if_unchanged': async ({ path, data, expectedVersion }) => {
    try {
      return await writeIfUnchangedByPath(path, data, expectedVersion)
    } catch (error) {
      if (error instanceof PathStaleVersionError) {
        throw new IpcError(fileErrorCodes.STALE_VERSION, error.message, {
          expected: error.expected,
          current: error.current
        })
      }
      throw error
    }
  },
  'file.batch_get_metadata': async ({ items }) => {
    const fileManager = application.get('FileManager')
    const pairs = await Promise.all(
      items.map(async ({ key, handle }) => {
        try {
          const metadata = await dispatchHandle(
            handle as FileHandle,
            (entryId) => fileManager.getMetadata(entryId),
            getMetadataByPath
          )
          return [key, metadata] as const
        } catch {
          return [key, null] as const
        }
      })
    )
    return Object.fromEntries(pairs)
  },
  'file.batch_get_physical_paths': async ({ ids }) => {
    const fileManager = application.get('FileManager')
    const pairs = await Promise.all(
      ids.map(async (id) => {
        try {
          return [id, fileManager.getPhysicalPath(id)] as const
        } catch {
          return [id, null] as const
        }
      })
    )
    return Object.fromEntries(pairs)
  },
  'file.batch_get_dangling_states': async ({ ids }) => application.get('FileManager').batchGetDanglingStates({ ids }),
  'file.batch_create_internal_entries': async ({ items }) =>
    application.get('FileManager').batchCreateInternalEntries(items as CreateInternalEntryIpcParams[]),
  'file.batch_trash': async ({ ids }) => application.get('FileManager').batchTrash(ids),
  'file.batch_restore': async ({ ids }) => application.get('FileManager').batchRestore(ids),
  'file.batch_permanent_delete': async ({ ids }) => application.get('FileManager').batchPermanentDelete(ids),
  'file.empty_trash': async () => application.get('FileManager').emptyTrash(),
  'file.rename': async ({ id, newName }) => application.get('FileManager').rename(id, newName),
  'file.open': async (handle) => {
    const fileManager = application.get('FileManager')
    return dispatchHandle(handle as FileHandle, (entryId) => fileManager.open(entryId), safeOpen)
  },
  'file.show_in_folder': async (handle) => {
    const fileManager = application.get('FileManager')
    return dispatchHandle(handle as FileHandle, (entryId) => fileManager.showInFolder(entryId), showPathInFolder)
  },
  'file.path_stat': async ({ path }) => statPath(path),
  'file.path_create_directory': async ({ parentPath, name }) => {
    const targetPath = await buildAvailableChildPath(parentPath, name)
    await fs.mkdir(targetPath)
    return statPath(targetPath)
  },
  'file.path_create_file': async ({ parentPath, name }) => {
    const targetPath = await buildAvailableChildPath(parentPath, name)
    const handle = await fs.open(targetPath, 'wx')
    await handle.close()
    return statPath(targetPath)
  },
  'file.path_rename': async ({ path, newName }) => {
    const targetPath = buildRenamedPath(path, newName)
    await fs.rename(path, targetPath)
    return statPath(targetPath)
  },
  'file.path_trash': async ({ path }) => {
    await shell.trashItem(path)
  },
  'file.path_paste': async (input) => {
    return pastePath(input)
  }
}
