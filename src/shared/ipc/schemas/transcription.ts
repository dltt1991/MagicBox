import {
  TranscriptionLanguageSchema,
  TranscriptionRecordViewSchema,
  TranscriptionResultSchema,
  TranscriptionSourceTypeSchema
} from '@shared/data/types/transcription'
import * as z from 'zod'

import { defineRoute } from '../define'
import { uint8ArraySchema } from './common'

export const TranscriptionBackendConfigSchema = z.discriminatedUnion('backend', [
  z.strictObject({ backend: z.literal('local_whisper') }),
  z.strictObject({
    backend: z.literal('provider_model'),
    providerId: z.string().min(1),
    modelId: z.string().min(1)
  })
])
export type TranscriptionBackendConfig = z.infer<typeof TranscriptionBackendConfigSchema>

export const transcriptionRequestSchemas = {
  'transcription.recording.create': defineRoute({
    input: z.strictObject({
      extension: z
        .string()
        .regex(/^\.[a-z0-9]+$/i)
        .default('.wav')
    }),
    output: z.strictObject({
      recordingId: z.string().min(1),
      suggestedName: z.string().min(1)
    })
  }),
  'transcription.recording.write': defineRoute({
    input: z.strictObject({
      recordingId: z.string().min(1),
      wavBytes: uint8ArraySchema.refine((bytes) => bytes.byteLength <= 256 * 1024 * 1024, 'Recording is too large')
    }),
    output: z.strictObject({ recordingId: z.string().min(1) })
  }),
  'transcription.recording.discard': defineRoute({
    input: z.strictObject({ recordingId: z.string().min(1) }),
    output: z.void()
  }),
  'transcription.recording.delete': defineRoute({
    input: z.strictObject({ recordId: z.string().min(1), deleteAudio: z.boolean().default(false) }),
    output: z.void()
  }),
  'transcription.audio_url.resolve': defineRoute({
    input: z.strictObject({ recordId: z.string().min(1) }),
    output: z.strictObject({ url: z.string().nullable(), missing: z.boolean(), playbackId: z.string().nullable() })
  }),
  'transcription.audio_url.preview': defineRoute({
    input: z
      .strictObject({ audioPath: z.string().min(1).optional(), recordingId: z.string().min(1).optional() })
      .refine((input) => Boolean(input.audioPath) !== Boolean(input.recordingId), 'Provide audioPath or recordingId'),
    output: z.strictObject({
      url: z.string().nullable(),
      missing: z.boolean(),
      playbackId: z.string().min(1).nullable()
    })
  }),
  'transcription.audio_url.release': defineRoute({
    input: z.strictObject({ playbackId: z.string().min(1) }),
    output: z.void()
  }),
  'transcription.transcribe': defineRoute({
    input: z
      .strictObject({
        jobId: z.string().min(1),
        recordId: z.string().min(1).optional(),
        audioPath: z.string().min(1).optional(),
        recordingId: z.string().min(1).optional(),
        title: z.string().min(1).optional(),
        sourceType: TranscriptionSourceTypeSchema,
        language: TranscriptionLanguageSchema,
        backend: TranscriptionBackendConfigSchema
      })
      .refine(
        (input) => [input.audioPath, input.recordingId, input.recordId].filter(Boolean).length === 1,
        'Provide exactly one audioPath, recordingId, or recordId'
      ),
    output: z.strictObject({ record: TranscriptionRecordViewSchema, result: TranscriptionResultSchema })
  }),
  'transcription.cancel': defineRoute({
    input: z.strictObject({ jobId: z.string().min(1) }),
    output: z.void()
  }),
  'transcription.organize': defineRoute({
    input: z.strictObject({
      jobId: z.string().min(1),
      recordId: z.string().min(1),
      templateId: z.string().min(1).nullable(),
      prompt: z.string().min(1),
      modelId: z.string().min(1).optional()
    }),
    output: z.strictObject({ result: TranscriptionResultSchema })
  })
}

export type TranscriptionEventSchemas = {
  'transcription.progress': {
    jobId: string
    stage: 'preparing' | 'loading_model' | 'transcribing' | 'organizing' | 'completed' | 'failed' | 'canceled'
    percent?: number
    messageKey?: string
    recordId?: string
  }
}
