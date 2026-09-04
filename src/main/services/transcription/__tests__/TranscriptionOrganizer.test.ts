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
        ? { streamText: vi.fn().mockResolvedValue(textStream(['organized'])) }
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

  it('organizes through streaming models and saves accumulated text', async () => {
    const streamText = vi.fn().mockResolvedValue(textStream(['organized ', 'from stream']))
    vi.mocked(application.get).mockImplementation(((name: string) =>
      name === 'AiService' ? { streamText } : { get: vi.fn(() => 'provider::model') }) as never)

    const result = await new TranscriptionOrganizer().organize({
      recordId: '018f0f37-8a1c-7f50-8000-000000000001',
      transcriptText: 'hello',
      segments: [],
      language: 'en',
      durationMs: 1000,
      templateId: 'custom',
      prompt: '{{transcript}}',
      modelId: 'provider::model',
      signal: new AbortController().signal
    })

    expect(result).toEqual({ result: 'organized from stream' })
    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        uniqueModelId: 'provider::model',
        contextOwner: 'caller',
        messages: [expect.objectContaining({ parts: [{ type: 'text', text: 'hello' }] })]
      })
    )
    expect(updateOrganizationResultMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ organizationOutput: 'organized from stream' })
    )
  })

  it('surfaces safe API call details when organization generation fails', async () => {
    vi.mocked(application.get).mockImplementation(((name: string) =>
      name === 'AiService'
        ? {
            streamText: vi.fn().mockRejectedValue({
              name: 'AI_APICallError',
              statusCode: 400,
              responseBody: JSON.stringify({ error: { message: 'Incorrect API key provided: sk-secret' } })
            })
          }
        : { get: vi.fn(() => 'provider::model') }) as never)

    await expect(
      new TranscriptionOrganizer().organize({
        recordId: '018f0f37-8a1c-7f50-8000-000000000001',
        transcriptText: 'hello',
        segments: [],
        language: 'en',
        durationMs: 1000,
        templateId: 'custom',
        prompt: '{{transcript}}',
        modelId: 'provider::model',
        signal: new AbortController().signal
      })
    ).rejects.toThrow(
      'transcription.error.organization_failed|API request failed (400): Incorrect API key provided: [redacted]'
    )

    expect(updateOrganizationResultMock).not.toHaveBeenCalled()
  })

  it('turns authentication failures into an actionable organization error', async () => {
    vi.mocked(application.get).mockImplementation(((name: string) =>
      name === 'AiService'
        ? {
            streamText: vi.fn().mockRejectedValue({
              name: 'AI_APICallError',
              statusCode: 401
            })
          }
        : { get: vi.fn(() => 'provider::model') }) as never)

    await expect(
      new TranscriptionOrganizer().organize({
        recordId: '018f0f37-8a1c-7f50-8000-000000000001',
        transcriptText: 'hello',
        segments: [],
        language: 'en',
        durationMs: 1000,
        templateId: 'custom',
        prompt: '{{transcript}}',
        modelId: 'provider::model',
        signal: new AbortController().signal
      })
    ).rejects.toThrow('transcription.error.organization_auth_failed')
  })

  it('surfaces stream chunk failures with safe details', async () => {
    vi.mocked(application.get).mockImplementation(((name: string) =>
      name === 'AiService'
        ? {
            streamText: vi.fn().mockResolvedValue(errorStream('Stream must be set to true'))
          }
        : { get: vi.fn(() => 'provider::model') }) as never)

    await expect(
      new TranscriptionOrganizer().organize({
        recordId: '018f0f37-8a1c-7f50-8000-000000000001',
        transcriptText: 'hello',
        segments: [],
        language: 'en',
        durationMs: 1000,
        templateId: 'custom',
        prompt: '{{transcript}}',
        modelId: 'provider::model',
        signal: new AbortController().signal
      })
    ).rejects.toThrow('transcription.error.organization_failed|API request failed: Stream must be set to true')
  })
})

function textStream(parts: string[]): ReadableStream<{ type: 'text-delta'; id: string; delta: string }> {
  return new ReadableStream({
    start(controller) {
      for (const delta of parts) controller.enqueue({ type: 'text-delta', id: 'text', delta })
      controller.close()
    }
  })
}

function errorStream(errorText: string): ReadableStream<{ type: 'error'; errorText: string }> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({ type: 'error', errorText })
      controller.close()
    }
  })
}
