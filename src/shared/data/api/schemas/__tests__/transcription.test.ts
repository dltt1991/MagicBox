import { describe, expect, it } from 'vitest'

import { TranscriptionBackendConfigSchema } from '../../../../ipc/schemas/transcription'
import { TranscriptionSegmentSchema } from '../../../types/transcription'
import { CreateTranscriptionRecordSchema, TranscriptionRecordQuerySchema } from '../transcription'

describe('transcription schemas', () => {
  it('rejects create-record fields outside the public DTO', () => {
    expect(
      CreateTranscriptionRecordSchema.safeParse({
        title: 'Interview',
        sourceType: 'file',
        audioPath: '/tmp/interview.wav',
        audioManaged: false,
        status: 'ready',
        id: '019b0830-2e52-7000-8000-000000000001'
      }).success
    ).toBe(false)
  })

  it('rejects a segment that ends before it starts', () => {
    expect(TranscriptionSegmentSchema.safeParse({ startMs: 2_000, endMs: 1_000, text: 'Hello' }).success).toBe(false)
  })

  it('rejects unknown list-query fields while preserving the documented limit default', () => {
    expect(TranscriptionRecordQuerySchema.parse({})).toEqual({ limit: 20 })
    expect(TranscriptionRecordQuerySchema.safeParse({ limit: 20, extra: true }).success).toBe(false)
  })

  it('rejects custom endpoint API keys from renderer-to-main requests', () => {
    expect(
      TranscriptionBackendConfigSchema.safeParse({
        backend: 'custom_endpoint',
        baseUrl: 'https://transcription.example.com',
        apiKey: 'secret',
        requestFormat: 'openai_multipart'
      }).success
    ).toBe(false)
  })
})
