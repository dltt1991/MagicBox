import { describe, expect, it, vi } from 'vitest'

import { ProviderTranscriptionBackend } from '../ProviderTranscriptionBackend'

describe('ProviderTranscriptionBackend', () => {
  it('transcribes audio bytes through the configured provider model and normalizes segments', async () => {
    const transcribe = vi.fn().mockResolvedValue({
      text: 'hello',
      segments: [{ startSecond: 0, endSecond: 1.2, text: 'hello' }],
      language: 'en',
      durationInSeconds: 1.2
    })
    const backend = new ProviderTranscriptionBackend({
      readFile: vi.fn().mockResolvedValue(Buffer.from('audio')),
      resolve: vi.fn().mockResolvedValue({ model: { id: 'model' }, providerOptionsKey: 'openai' }),
      transcribe
    })

    const result = await backend.transcribe({
      audioPath: '/audio.wav',
      language: 'en',
      providerId: 'provider',
      modelId: 'model',
      signal: new AbortController().signal
    })

    expect(transcribe).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: expect.any(Uint8Array),
        providerOptions: { openai: { language: 'en' } }
      })
    )
    expect(result).toMatchObject({ backend: 'provider_model', language: 'en', durationMs: 1200 })
    expect(result.segments).toEqual([{ startMs: 0, endMs: 1200, text: 'hello' }])
  })
})
