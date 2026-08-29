import { application } from '@application'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { updateOrganizationResultMock } = vi.hoisted(() => ({ updateOrganizationResultMock: vi.fn() }))
vi.mock('@data/services/TranscriptionHistoryService', () => ({
  transcriptionHistoryService: { updateOrganizationResult: updateOrganizationResultMock }
}))

import { TranscriptionOrganizer } from '../TranscriptionOrganizer'

describe('TranscriptionOrganizer', () => {
  beforeEach(() => {
    updateOrganizationResultMock.mockReset()
    vi.mocked(application.get).mockImplementation(((name: string) =>
      name === 'AiService'
        ? { generateText: vi.fn().mockResolvedValue({ text: 'organized' }) }
        : { get: vi.fn(() => 'provider::model') }) as never)
  })

  it('renders prompt variables and saves the rendered snapshot', async () => {
    const result = await new TranscriptionOrganizer().organize({
      recordId: '018f0f37-8a1c-7f50-8000-000000000001',
      transcriptText: 'hello',
      segments: [{ startMs: 0, endMs: 1000, text: 'hello' }],
      language: 'en',
      durationMs: 1000,
      templateId: 'custom',
      prompt: '{{transcript}} {{segments}} {{language}} {{duration}}',
      modelId: 'provider::model',
      signal: new AbortController().signal
    })

    expect(result).toEqual({ result: 'organized' })
    expect(updateOrganizationResultMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        organizationPromptSnapshot: expect.stringContaining('hello'),
        organizationOutput: 'organized'
      })
    )
  })
})
