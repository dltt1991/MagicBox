import {
  CleanupPolicySchema,
  ContentHashSchema,
  DanglingStateSchema,
  FileEntryIdSchema,
  FileEntrySchema,
  FileHandleSchema,
  SafeNameSchema
} from '@shared/data/types/file'
import {
  AbsoluteFilePathSchema,
  Base64StringSchema,
  FileVersionSchema,
  PhysicalFileMetadataSchema,
  SafeExtSchema,
  UrlStringSchema
} from '@shared/types/file'
import * as z from 'zod'

import { defineRoute } from '../define'
import { uint8ArraySchema } from './common'

/** Maximum entry ids accepted by one file batch IPC call. */
export const FILE_IPC_MAX_BATCH_IDS = 500
/** Maximum items accepted by one internal-entry batch-create IPC call. */
export const FILE_IPC_MAX_BATCH_CREATE_ITEMS = 100
/** Maximum bytes returned by one range-read IPC call. */
export const FILE_IPC_MAX_READ_CHUNK_BYTES = 4 * 1024 * 1024

const fileEntryIdsInputSchema = z.strictObject({
  ids: z.array(FileEntryIdSchema).max(FILE_IPC_MAX_BATCH_IDS)
})

const batchGetMetadataInputSchema = z.strictObject({
  items: z.array(z.strictObject({ key: z.string().min(1), handle: FileHandleSchema })).max(FILE_IPC_MAX_BATCH_IDS)
})

const batchMutationResultSchema = z.strictObject({
  succeeded: z.array(FileEntryIdSchema),
  failed: z.array(z.strictObject({ id: FileEntryIdSchema, error: z.string() }))
})

const batchCreateResultSchema = z.strictObject({
  succeeded: z.array(z.strictObject({ id: FileEntryIdSchema, sourceRef: z.string() })),
  failed: z.array(z.strictObject({ sourceRef: z.string(), error: z.string() }))
})

const binaryReadOptionsSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('full'), encoding: z.literal('binary') }),
  z.strictObject({
    mode: z.literal('range'),
    offset: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    length: z.number().int().positive().max(FILE_IPC_MAX_READ_CHUNK_BYTES)
  })
])

const binaryReadInputSchema = z.strictObject({ handle: FileHandleSchema, options: binaryReadOptionsSchema })

const binaryReadResultSchema = z.strictObject({
  content: uint8ArraySchema,
  mime: z.string().min(1),
  version: FileVersionSchema
})

const writeIfUnchangedInputSchema = z.strictObject({
  handle: FileHandleSchema,
  data: uint8ArraySchema,
  expectedVersion: FileVersionSchema,
  expectedContentHash: ContentHashSchema.optional()
})

const pathSegmentSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((value) => !value.includes('\0'), 'must not contain null bytes')
  .refine((value) => !/[/\\]/.test(value), 'must not contain path separators')

const pathInputSchema = z.strictObject({
  path: AbsoluteFilePathSchema
})

const pathCreateInputSchema = z.strictObject({
  parentPath: AbsoluteFilePathSchema,
  name: pathSegmentSchema
})

const pathRenameInputSchema = z.strictObject({
  path: AbsoluteFilePathSchema,
  newName: pathSegmentSchema
})

const pathPasteInputSchema = z.strictObject({
  sourcePath: AbsoluteFilePathSchema,
  targetDirectory: AbsoluteFilePathSchema,
  operation: z.enum(['copy', 'move']),
  conflict: z.enum(['prompt', 'rename', 'replace', 'cancel']),
  newName: pathSegmentSchema.optional()
})

const pathInfoSchema = z.strictObject({
  path: AbsoluteFilePathSchema,
  name: z.string(),
  kind: z.enum(['file', 'directory', 'other']),
  size: z.number().nonnegative(),
  createdAt: z.number().nonnegative(),
  modifiedAt: z.number().nonnegative()
})

const pathPasteResultSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('completed'),
    path: AbsoluteFilePathSchema
  }),
  z.strictObject({
    status: z.literal('conflict'),
    existingPath: AbsoluteFilePathSchema,
    suggestedName: pathSegmentSchema
  }),
  z.strictObject({
    status: z.literal('canceled')
  })
])

// TODO(file-ipc): Unify these schemas with the branded transport types in
// `src/shared/types/file/ipc.ts`. `AbsoluteFilePath`, `Base64String`, and `UrlString` are
// TS-only aliases while their runtime schemas live elsewhere, so a successful
// Zod parse still cannot prove `CreateInternalEntryIpcParams` without an `as`
// cast in the handler. Keeping the type and schema definitions separate risks
// future drift; refactor them to share one source of truth before migrating the
// remaining File IPC surface.
export const createInternalEntryInputSchema = z.discriminatedUnion('source', [
  z.strictObject({ source: z.literal('path'), path: AbsoluteFilePathSchema, cleanupPolicy: CleanupPolicySchema }),
  z.strictObject({ source: z.literal('url'), url: UrlStringSchema, cleanupPolicy: CleanupPolicySchema }),
  z.strictObject({
    source: z.literal('base64'),
    data: Base64StringSchema,
    name: SafeNameSchema.optional(),
    cleanupPolicy: CleanupPolicySchema
  }),
  z.strictObject({
    source: z.literal('bytes'),
    data: uint8ArraySchema,
    name: SafeNameSchema,
    ext: SafeExtSchema.nullable(),
    cleanupPolicy: CleanupPolicySchema
  })
])

export type CreateInternalEntryInput = z.infer<typeof createInternalEntryInputSchema>

const batchCreateInternalEntriesInputSchema = z.strictObject({
  items: z.array(createInternalEntryInputSchema).min(1).max(FILE_IPC_MAX_BATCH_CREATE_ITEMS)
})

/**
 * File IPC schemas — filesystem-backed FileManager operations.
 *
 * SQL-only FileEntry reads stay on DataApi (`/files/entries`). These routes cover
 * live FS metadata and mutations / system actions that must run in main.
 */
export const fileRequestSchemas = {
  'file.read': defineRoute({ input: binaryReadInputSchema, output: binaryReadResultSchema }),
  'file.write_if_unchanged': defineRoute({ input: writeIfUnchangedInputSchema, output: FileVersionSchema }),
  'file.batch_get_metadata': defineRoute({
    input: batchGetMetadataInputSchema,
    output: z.record(z.string(), PhysicalFileMetadataSchema.nullable())
  }),
  'file.get_metadata': defineRoute({ input: FileHandleSchema, output: PhysicalFileMetadataSchema.nullable() }),
  'file.batch_get_physical_paths': defineRoute({
    input: fileEntryIdsInputSchema,
    output: z.record(z.string(), AbsoluteFilePathSchema.nullable())
  }),
  'file.batch_get_dangling_states': defineRoute({
    input: fileEntryIdsInputSchema,
    output: z.record(z.string(), DanglingStateSchema)
  }),
  'file.batch_create_internal_entries': defineRoute({
    input: batchCreateInternalEntriesInputSchema,
    output: batchCreateResultSchema
  }),
  'file.batch_trash': defineRoute({ input: fileEntryIdsInputSchema, output: batchMutationResultSchema }),
  'file.batch_restore': defineRoute({ input: fileEntryIdsInputSchema, output: batchMutationResultSchema }),
  'file.batch_permanent_delete': defineRoute({ input: fileEntryIdsInputSchema, output: batchMutationResultSchema }),
  'file.empty_trash': defineRoute({ input: z.void(), output: batchMutationResultSchema }),
  'file.rename': defineRoute({
    input: z.strictObject({ id: FileEntryIdSchema, newName: SafeNameSchema }),
    output: FileEntrySchema
  }),
  'file.open': defineRoute({ input: FileHandleSchema, output: z.void() }),
  'file.show_in_folder': defineRoute({ input: FileHandleSchema, output: z.void() }),
  'file.path_stat': defineRoute({ input: pathInputSchema, output: pathInfoSchema }),
  'file.path_create_directory': defineRoute({ input: pathCreateInputSchema, output: pathInfoSchema }),
  'file.path_create_file': defineRoute({ input: pathCreateInputSchema, output: pathInfoSchema }),
  'file.path_rename': defineRoute({ input: pathRenameInputSchema, output: pathInfoSchema }),
  'file.path_trash': defineRoute({ input: pathInputSchema, output: z.void() }),
  'file.path_paste': defineRoute({ input: pathPasteInputSchema, output: pathPasteResultSchema })
}
