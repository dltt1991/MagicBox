import { DataApiErrorFactory } from '@shared/data/api/errors'
import {
  CreateTranscriptionPromptTemplateSchema,
  CreateTranscriptionRecordSchema,
  SaveTranscriptionResultSchema,
  TranscriptionRecordQuerySchema,
  type TranscriptionSchemas,
  UpdateTranscriptionPromptTemplateSchema,
  UpdateTranscriptionRecordSchema,
  UpdateTranscriptionTextSchema} from '@shared/data/api/schemas/transcription'
import type { HandlersFor } from '@shared/data/api/types'
import * as z from 'zod'

const IdParamsSchema = z.strictObject({ id: z.string().min(1) })

function notImplemented(operation: string): never {
  throw DataApiErrorFactory.invalidOperation(operation, 'transcription persistence is not implemented yet')
}

export const transcriptionHandlers: HandlersFor<TranscriptionSchemas> = {
  '/transcription/records': {
    GET: async ({ query }) => {
      TranscriptionRecordQuerySchema.parse(query ?? {})
      return notImplemented('list transcription records')
    },
    POST: async ({ body }) => {
      CreateTranscriptionRecordSchema.parse(body)
      return notImplemented('create transcription record')
    },
    DELETE: async () => notImplemented('delete transcription records')
  },
  '/transcription/records/:id': {
    GET: async ({ params }) => {
      IdParamsSchema.parse(params)
      return notImplemented('get transcription record')
    },
    PATCH: async ({ params, body }) => {
      IdParamsSchema.parse(params)
      UpdateTranscriptionRecordSchema.parse(body)
      return notImplemented('update transcription record')
    },
    DELETE: async ({ params }) => {
      IdParamsSchema.parse(params)
      return notImplemented('delete transcription record')
    }
  },
  '/transcription/records/:id/result': {
    PUT: async ({ params, body }) => {
      IdParamsSchema.parse(params)
      SaveTranscriptionResultSchema.parse(body)
      return notImplemented('save transcription result')
    },
    PATCH: async ({ params, body }) => {
      IdParamsSchema.parse(params)
      UpdateTranscriptionTextSchema.parse(body)
      return notImplemented('update transcription text')
    }
  },
  '/transcription/prompt-templates': {
    GET: async () => notImplemented('list transcription prompt templates'),
    POST: async ({ body }) => {
      CreateTranscriptionPromptTemplateSchema.parse(body)
      return notImplemented('create transcription prompt template')
    }
  },
  '/transcription/prompt-templates/:id': {
    PATCH: async ({ params, body }) => {
      IdParamsSchema.parse(params)
      UpdateTranscriptionPromptTemplateSchema.parse(body)
      return notImplemented('update transcription prompt template')
    },
    DELETE: async ({ params }) => {
      IdParamsSchema.parse(params)
      return notImplemented('delete transcription prompt template')
    }
  }
}
