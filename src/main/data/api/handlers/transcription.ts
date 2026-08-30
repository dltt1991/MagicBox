import { transcriptionHistoryService } from '@data/services/TranscriptionHistoryService'
import {
  CreateTranscriptionPromptTemplateSchema,
  TranscriptionRecordQuerySchema,
  type TranscriptionSchemas,
  UpdateTranscriptionPromptTemplateSchema,
  UpdateTranscriptionTextSchema
} from '@shared/data/api/schemas/transcription'
import type { HandlersFor } from '@shared/data/api/types'
import type { TranscriptionRecord, TranscriptionRecordView } from '@shared/data/types/transcription'
import * as z from 'zod'

const IdParamsSchema = z.strictObject({ id: z.string().min(1) })

export const transcriptionHandlers: HandlersFor<TranscriptionSchemas> = {
  '/transcription/records': {
    GET: async ({ query }) => {
      const page = transcriptionHistoryService.listRecords(TranscriptionRecordQuerySchema.parse(query ?? {}))
      return { ...page, items: page.items.map(toRecordView) }
    }
  },
  '/transcription/records/:id': {
    GET: async ({ params }) => {
      const { record, result } = transcriptionHistoryService.getRecord(IdParamsSchema.parse(params).id)
      return { record: toRecordView(record), result }
    }
  },
  '/transcription/records/:id/result': {
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

function toRecordView(record: TranscriptionRecord): TranscriptionRecordView {
  return { ...record, audioPath: record.audioManaged ? null : record.audioPath }
}
