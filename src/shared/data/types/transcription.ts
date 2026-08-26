import * as z from 'zod'

export const TranscriptionSourceTypeSchema = z.enum(['recording', 'file'])
export type TranscriptionSourceType = z.infer<typeof TranscriptionSourceTypeSchema>

export const TranscriptionBackendSchema = z.enum(['local_whisper', 'provider_model', 'custom_endpoint'])
export type TranscriptionBackend = z.infer<typeof TranscriptionBackendSchema>

export const TranscriptionStatusSchema = z.enum(['ready', 'transcribing', 'failed', 'canceled'])
export type TranscriptionStatus = z.infer<typeof TranscriptionStatusSchema>

export const TranscriptionLanguageSchema = z.union([z.literal('auto'), z.string().regex(/^[a-z]{2,3}(-[a-z]{2,4})?$/)])
export type TranscriptionLanguage = z.infer<typeof TranscriptionLanguageSchema>

export const TranscriptionSegmentSchema = z
  .strictObject({
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
    text: z.string().min(1)
  })
  .refine((s) => s.endMs >= s.startMs, {
    message: 'endMs must be greater than or equal to startMs',
    path: ['endMs']
  })
export type TranscriptionSegment = z.infer<typeof TranscriptionSegmentSchema>

export const TranscriptionRecordSchema = z.strictObject({
  id: z.uuidv7(),
  title: z.string().min(1),
  sourceType: TranscriptionSourceTypeSchema,
  audioPath: z.string().min(1),
  audioManaged: z.boolean(),
  durationMs: z.number().int().nonnegative().nullable(),
  language: z.string().min(1).nullable(),
  backend: TranscriptionBackendSchema.nullable(),
  providerId: z.string().min(1).nullable(),
  modelId: z.string().min(1).nullable(),
  status: TranscriptionStatusSchema,
  errorSummary: z.string().min(1).nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
})
export type TranscriptionRecord = z.infer<typeof TranscriptionRecordSchema>

export const TranscriptionResultSchema = z.strictObject({
  id: z.uuidv7(),
  recordId: z.uuidv7(),
  transcriptText: z.string(),
  segments: z.array(TranscriptionSegmentSchema),
  organizationTemplateId: z.string().min(1).nullable(),
  organizationPromptSnapshot: z.string().min(1).nullable(),
  organizationOutput: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
})
export type TranscriptionResult = z.infer<typeof TranscriptionResultSchema>

export const TranscriptionPromptTemplateSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  prompt: z.string().min(1),
  builtIn: z.boolean(),
  isDefault: z.boolean(),
  orderKey: z.string().min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
})
export type TranscriptionPromptTemplate = z.infer<typeof TranscriptionPromptTemplateSchema>
