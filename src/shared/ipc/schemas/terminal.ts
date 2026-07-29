import * as z from 'zod'

import { defineRoute } from '../define'

const sessionIdSchema = z.string().min(1).max(128)
const cwdSchema = z.string().min(1).max(4096)
const inputDataSchema = z.string().max(16_384)
const sizeSchema = z.strictObject({
  cols: z.int().min(1).max(1000),
  rows: z.int().min(1).max(1000)
})

export const TerminalSessionMetadataSchema = z.strictObject({
  id: sessionIdSchema,
  cwd: z.string().min(1),
  shell: z.string().min(1),
  pid: z.number().int().nullable(),
  status: z.enum(['running', 'exited']),
  createdAt: z.number(),
  updatedAt: z.number()
})

export type TerminalSessionMetadata = z.infer<typeof TerminalSessionMetadataSchema>

export const terminalRequestSchemas = {
  'terminal.session.create': defineRoute({
    input: z.strictObject({
      cwd: cwdSchema.optional(),
      ...sizeSchema.shape
    }),
    output: TerminalSessionMetadataSchema
  }),
  'terminal.session.list': defineRoute({
    input: z.void(),
    output: z.array(TerminalSessionMetadataSchema)
  }),
  'terminal.session.input': defineRoute({
    input: z.strictObject({ id: sessionIdSchema, data: inputDataSchema }),
    output: z.void()
  }),
  'terminal.session.resize': defineRoute({
    input: z.strictObject({ id: sessionIdSchema, ...sizeSchema.shape }),
    output: z.void()
  }),
  'terminal.session.kill': defineRoute({
    input: z.strictObject({ id: sessionIdSchema }),
    output: z.void()
  })
}

export type TerminalEventSchemas = {
  'terminal.session.data': { id: string; data: string }
  'terminal.session.exit': { id: string; exitCode: number; signal?: number }
  'terminal.session.updated': TerminalSessionMetadata
}
