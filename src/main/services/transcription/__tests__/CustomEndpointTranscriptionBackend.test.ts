import { describe, expect, it, vi } from 'vitest'

import { CustomEndpointTranscriptionBackend } from '../CustomEndpointTranscriptionBackend'

describe('CustomEndpointTranscriptionBackend', () => {
  it('redacts endpoint credentials and request bodies when the request fails', async () => {
    const backend = new CustomEndpointTranscriptionBackend({
      fetch: vi.fn().mockResolvedValue(new Response('secret-api-key request-body', { status: 500 })),
      readFile: vi.fn().mockResolvedValue(Buffer.from('audio'))
    })

    await expect(
      backend.transcribe({
        audioPath: '/audio.wav',
        language: 'auto',
        config: {
          baseUrl: 'https://example.com/v1/audio/transcriptions',
          apiKey: 'secret-api-key',
          model: 'whisper-1',
          requestFormat: 'json_base64'
        },
        signal: new AbortController().signal
      })
    ).rejects.toThrow('HTTP 500')
    await expect(
      backend.transcribe({
        audioPath: '/audio.wav',
        language: 'auto',
        config: {
          baseUrl: 'https://example.com/v1/audio/transcriptions',
          apiKey: 'secret-api-key',
          model: 'whisper-1',
          requestFormat: 'json_base64'
        },
        signal: new AbortController().signal
      })
    ).rejects.not.toThrow(/secret-api-key|request-body/)
  })

  it('maps OpenAI-compatible response segments', async () => {
    const backend = new CustomEndpointTranscriptionBackend({
      fetch: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            text: 'hello',
            language: 'en',
            duration: 1,
            segments: [{ start: 0, end: 1, text: 'hello' }]
          })
        )
      ),
      readFile: vi.fn().mockResolvedValue(Buffer.from('audio'))
    })
    await expect(
      backend.transcribe({
        audioPath: '/audio.wav',
        language: 'auto',
        config: { baseUrl: 'https://example.com', apiKey: 'key', requestFormat: 'openai_multipart' },
        signal: new AbortController().signal
      })
    ).resolves.toMatchObject({ segments: [{ startMs: 0, endMs: 1000, text: 'hello' }] })
  })
})
