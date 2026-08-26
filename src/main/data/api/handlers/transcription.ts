import { transcriptionHistoryService } from '@data/services/TranscriptionHistoryService'
import {
  CreateTranscriptionPromptTemplateSchema,
  CreateTranscriptionRecordSchema,
  SaveTranscriptionResultSchema,
  TranscriptionRecordQuerySchema,
  type TranscriptionSchemas,
  UpdateTranscriptionPromptTemplateSchema,
  UpdateTranscriptionRecordSchema,
  UpdateTranscriptionTextSchema
} from '@shared/data/api/schemas/transcription'
import type { HandlersFor } from '@shared/data/api/types'
import * as z from 'zod'

const IdParamsSchema = z.strictObject({ id: z.string().min(1) })

export const transcriptionHandlers: HandlersFor<TranscriptionSchemas> = {
  '/transcription/records': {
    GET: async ({ query }) => {
      return transcriptionHistoryService.listRecords(TranscriptionRecordQuerySchema.parse(query ?? {}))
    },
    POST: async ({ body }) => {
      return transcriptionHistoryService.createRecord(CreateTranscriptionRecordSchema.parse(body))
    }
  },
  '/transcription/records/:id': {
    GET: async ({ params }) => {
      return transcriptionHistoryService.getRecord(IdParamsSchema.parse(params).id)
    },
    PATCH: async ({ params, body }) => {
      return transcriptionHistoryService.updateRecord(
        IdParamsSchema.parse(params).id,
        UpdateTranscriptionRecordSchema.parse(body)
      )
    },
    DELETE: async ({ params }) => {
      transcriptionHistoryService.deleteRecord(IdParamsSchema.parse(params).id)
      return undefined
    }
  },
  '/transcription/records/:id/result': {
    PUT: async ({ params, body }) => {
      return transcriptionHistoryService.saveResult(
        IdParamsSchema.parse(params).id,
        SaveTranscriptionResultSchema.parse(body)
      )
    },
    PATCH: async ({ params, body }) => {
      return transcriptionHistoryService.updateResultText(
        IdParamsSchema.parse(params).id,
        UpdateTranscriptionTextSchema.parse(body)
      )
    }
  },
  '/transcription/prompt-templates': {
    GET: async () => transcriptionHistoryService.listPromptTemplates(),
    POST: async ({ body }) => {
      return transcriptionHistoryService.createPromptTemplate(CreateTranscriptionPromptTemplateSchema.parse(body))
    }
  },
  '/transcription/prompt-templates/:id': {
    PATCH: async ({ params, body }) => {
      return transcriptionHistoryService.updatePromptTemplate(
        IdParamsSchema.parse(params).id,
        UpdateTranscriptionPromptTemplateSchema.parse(body)
      )
    },
    DELETE: async ({ params }) => {
      transcriptionHistoryService.deletePromptTemplate(IdParamsSchema.parse(params).id)
      return undefined
    }
  }
}
