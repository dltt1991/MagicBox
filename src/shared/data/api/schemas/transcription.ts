import * as z from 'zod'

import {
  TranscriptionBackendSchema,
  type TranscriptionPromptTemplate,
  type TranscriptionRecordView,
  type TranscriptionResult,
  TranscriptionSegmentSchema,
  TranscriptionSourceTypeSchema,
  TranscriptionStatusSchema
} from '../../types/transcription'
import type { CursorPaginationParams, CursorPaginationResponse } from '../types'

export const CreateTranscriptionRecordSchema = z.strictObject({
  title: z.string().min(1),
  sourceType: TranscriptionSourceTypeSchema,
  audioPath: z.string().min(1),
  audioManaged: z.boolean(),
  durationMs: z.number().int().nonnegative().nullable().optional(),
  language: z.string().min(1).nullable().optional(),
  backend: TranscriptionBackendSchema.nullable().optional(),
  providerId: z.string().min(1).nullable().optional(),
  modelId: z.string().min(1).nullable().optional(),
  status: TranscriptionStatusSchema.optional()
})
export type CreateTranscriptionRecordDto = z.infer<typeof CreateTranscriptionRecordSchema>

export const UpdateTranscriptionRecordSchema = z
  .strictObject({
    title: z.string().min(1),
    durationMs: z.number().int().nonnegative().nullable(),
    language: z.string().min(1).nullable(),
    backend: TranscriptionBackendSchema.nullable(),
    providerId: z.string().min(1).nullable(),
    modelId: z.string().min(1).nullable(),
    status: TranscriptionStatusSchema,
    errorSummary: z.string().min(1).nullable()
  })
  .partial()
export type UpdateTranscriptionRecordDto = z.infer<typeof UpdateTranscriptionRecordSchema>

export const SaveTranscriptionResultSchema = z.strictObject({
  transcriptText: z.string(),
  segments: z.array(TranscriptionSegmentSchema),
  organizationTemplateId: z.string().min(1).nullable().optional(),
  organizationPromptSnapshot: z.string().min(1).nullable().optional(),
  organizationOutput: z.string().nullable().optional()
})
export type SaveTranscriptionResultDto = z.infer<typeof SaveTranscriptionResultSchema>

export const UpdateTranscriptionTextSchema = z.strictObject({
  transcriptText: z.string(),
  segments: z.array(TranscriptionSegmentSchema)
})
export type UpdateTranscriptionTextDto = z.infer<typeof UpdateTranscriptionTextSchema>

export const CreateTranscriptionPromptTemplateSchema = z.strictObject({
  name: z.string().min(1),
  prompt: z.string().min(1),
  isDefault: z.boolean().optional()
})
export type CreateTranscriptionPromptTemplateDto = z.infer<typeof CreateTranscriptionPromptTemplateSchema>

export const UpdateTranscriptionPromptTemplateSchema = z
  .strictObject({
    name: z.string().min(1),
    prompt: z.string().min(1),
    isDefault: z.boolean(),
    orderKey: z.string().min(1)
  })
  .partial()
export type UpdateTranscriptionPromptTemplateDto = z.infer<typeof UpdateTranscriptionPromptTemplateSchema>

export const TranscriptionRecordQuerySchema = z.strictObject({
  cursor: z.string().optional(),
  limit: z.int().positive().max(100).default(20),
  search: z.string().min(1).max(200).optional(),
  status: TranscriptionStatusSchema.optional()
})
export type TranscriptionRecordQuery = z.infer<typeof TranscriptionRecordQuerySchema>
export type TranscriptionRecordQueryParams = z.input<typeof TranscriptionRecordQuerySchema> & CursorPaginationParams

export interface TranscriptionRecordListResponse extends CursorPaginationResponse<TranscriptionRecordView> {
  items: TranscriptionRecordView[]
  total: number
}

export type TranscriptionSchemas = {
  '/transcription/records': {
    GET: {
      query?: TranscriptionRecordQueryParams
      response: TranscriptionRecordListResponse
    }
  }
  '/transcription/records/:id': {
    GET: {
      params: { id: string }
      response: { record: TranscriptionRecordView; result: TranscriptionResult | null }
    }
  }
  '/transcription/records/:id/result': {
    PUT: {
      params: { id: string }
      body: SaveTranscriptionResultDto
      response: TranscriptionResult
    }
    PATCH: {
      params: { id: string }
      body: UpdateTranscriptionTextDto
      response: TranscriptionResult
    }
  }
  '/transcription/prompt-templates': {
    GET: {
      response: TranscriptionPromptTemplate[]
    }
    POST: {
      body: CreateTranscriptionPromptTemplateDto
      response: TranscriptionPromptTemplate
    }
  }
  '/transcription/prompt-templates/:id': {
    PATCH: {
      params: { id: string }
      body: UpdateTranscriptionPromptTemplateDto
      response: TranscriptionPromptTemplate
    }
    DELETE: {
      params: { id: string }
      response: void
    }
  }
}
