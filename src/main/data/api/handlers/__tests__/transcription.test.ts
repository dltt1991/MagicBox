import { transcriptionHistoryService } from '@data/services/TranscriptionHistoryService'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { transcriptionHandlers } from '../transcription'

vi.mock('@data/services/TranscriptionHistoryService', () => ({
  transcriptionHistoryService: {
    listRecords: vi.fn(),
    getRecord: vi.fn(),
    updateResultText: vi.fn(),
    listPromptTemplates: vi.fn(),
    createPromptTemplate: vi.fn(),
    updatePromptTemplate: vi.fn(),
    deletePromptTemplate: vi.fn()
  }
}))

describe('transcription handlers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not expose full-result writes over DataApi', () => {
    expect('PUT' in transcriptionHandlers['/transcription/records/:id/result']).toBe(false)
  })

  it('delegates list and transcript text edits to the persistence service', async () => {
    const query = { limit: 10, status: 'ready' as const }
    const result = { id: '019606a0-0000-7000-8000-000000000002' }
    vi.mocked(transcriptionHistoryService.listRecords).mockReturnValue({ items: [], total: 0 } as never)
    vi.mocked(transcriptionHistoryService.updateResultText).mockReturnValue(result as never)

    await transcriptionHandlers['/transcription/records'].GET({ query } as never)
    await transcriptionHandlers['/transcription/records/:id/result'].PATCH({
      params: { id: '019606a0-0000-7000-8000-000000000001' },
      body: { transcriptText: 'Text', segments: [] }
    } as never)

    expect(transcriptionHistoryService.listRecords).toHaveBeenCalledWith(query)
    expect(transcriptionHistoryService.updateResultText).toHaveBeenCalledWith('019606a0-0000-7000-8000-000000000001', {
      transcriptText: 'Text',
      segments: []
    })
  })

  it('redacts app-managed audio paths from renderer-facing records', async () => {
    const managed = {
      id: '019606a0-0000-7000-8000-000000000001',
      title: 'Managed',
      sourceType: 'recording' as const,
      audioPath: '/managed/recording.wav',
      audioManaged: true,
      durationMs: null,
      language: null,
      backend: null,
      providerId: null,
      modelId: null,
      status: 'ready' as const,
      errorSummary: null,
      createdAt: '2026-08-26T00:00:00.000Z',
      updatedAt: '2026-08-26T00:00:00.000Z'
    }
    vi.mocked(transcriptionHistoryService.listRecords).mockReturnValue({ items: [managed], total: 1 } as never)
    vi.mocked(transcriptionHistoryService.getRecord).mockReturnValue({ record: managed, result: null } as never)

    await expect(
      transcriptionHandlers['/transcription/records'].GET({ query: { limit: 20 } } as never)
    ).resolves.toMatchObject({
      items: [{ audioPath: null, audioManaged: true }]
    })
    await expect(
      transcriptionHandlers['/transcription/records/:id'].GET({ params: { id: managed.id } } as never)
    ).resolves.toMatchObject({ record: { audioPath: null, audioManaged: true }, result: null })
  })
})
