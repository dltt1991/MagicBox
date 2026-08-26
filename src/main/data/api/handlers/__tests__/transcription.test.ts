import { transcriptionHistoryService } from '@data/services/TranscriptionHistoryService'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { transcriptionHandlers } from '../transcription'

vi.mock('@data/services/TranscriptionHistoryService', () => ({
  transcriptionHistoryService: {
    listRecords: vi.fn(),
    createRecord: vi.fn(),
    getRecord: vi.fn(),
    updateRecord: vi.fn(),
    deleteRecord: vi.fn(),
    saveResult: vi.fn(),
    updateResultText: vi.fn(),
    listPromptTemplates: vi.fn(),
    createPromptTemplate: vi.fn(),
    updatePromptTemplate: vi.fn(),
    deletePromptTemplate: vi.fn()
  }
}))

describe('transcription handlers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('parses strict record inputs and delegates the parsed DTO', async () => {
    const body = { title: 'Call', sourceType: 'file' as const, audioPath: '/tmp/call.wav', audioManaged: false }
    const created = { id: '019606a0-0000-7000-8000-000000000001', ...body }
    vi.mocked(transcriptionHistoryService.createRecord).mockReturnValue(created as never)

    await expect(transcriptionHandlers['/transcription/records'].POST({ body } as never)).resolves.toBe(created)
    expect(transcriptionHistoryService.createRecord).toHaveBeenCalledWith(body)
    await expect(
      transcriptionHandlers['/transcription/records'].POST({ body: { ...body, ignored: true } } as never)
    ).rejects.toThrow()
  })

  it('delegates list and result writes to the persistence service', async () => {
    const query = { limit: 10, status: 'ready' as const }
    const result = { id: '019606a0-0000-7000-8000-000000000002' }
    vi.mocked(transcriptionHistoryService.listRecords).mockReturnValue({ items: [], total: 0 } as never)
    vi.mocked(transcriptionHistoryService.saveResult).mockReturnValue(result as never)

    await transcriptionHandlers['/transcription/records'].GET({ query } as never)
    await transcriptionHandlers['/transcription/records/:id/result'].PUT({
      params: { id: '019606a0-0000-7000-8000-000000000001' },
      body: { transcriptText: 'Text', segments: [] }
    } as never)

    expect(transcriptionHistoryService.listRecords).toHaveBeenCalledWith(query)
    expect(transcriptionHistoryService.saveResult).toHaveBeenCalledWith('019606a0-0000-7000-8000-000000000001', {
      transcriptText: 'Text',
      segments: []
    })
  })
})
