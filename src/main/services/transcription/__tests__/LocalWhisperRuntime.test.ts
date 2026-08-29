import { application } from '@application'
import { BaseService } from '@main/core/lifecycle'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { existsSyncMock, preprocessMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  preprocessMock: vi.fn()
}))

vi.mock('node:fs', async () => ({ ...(await vi.importActual('node:fs')), existsSync: existsSyncMock }))
vi.mock('../audioPreprocess', () => ({ LOCAL_WHISPER_SAMPLE_RATE: 16_000, preprocessAudio: preprocessMock }))

import { LocalWhisperRuntime } from '../LocalWhisperRuntime'

describe('LocalWhisperRuntime', () => {
  beforeEach(() => {
    BaseService.resetInstances()
    existsSyncMock.mockReset()
    preprocessMock.mockReset()
    vi.mocked(application.getPath).mockReturnValue('/models/whisper')
    vi.mocked(application.get).mockReturnValue({ get: vi.fn(() => false) } as never)
  })

  it('requires downloaded Whisper weights before loading', async () => {
    existsSyncMock.mockReturnValue(false)

    await expect(
      new LocalWhisperRuntime({ transcribeSamples: vi.fn() }).transcribe('/audio.wav', 'auto')
    ).rejects.toThrow('not downloaded')
  })

  it('preprocesses audio and maps worker chunks into transcript segments', async () => {
    existsSyncMock.mockReturnValue(true)
    preprocessMock.mockResolvedValue(new Float32Array(16_000))
    const transcribeSamples = vi.fn().mockResolvedValue({
      text: ' hello ',
      chunks: [{ timestamp: [0, 1], text: 'hello' }]
    })

    const result = await new LocalWhisperRuntime({ transcribeSamples }).transcribe('/audio.wav', 'en')

    expect(preprocessMock).toHaveBeenCalledWith('/audio.wav', undefined)
    expect(transcribeSamples).toHaveBeenCalledWith('/models/whisper', expect.any(Float32Array), 'en', undefined)
    expect(result).toMatchObject({
      backend: 'local_whisper',
      durationMs: 1000,
      language: 'en',
      runtime: 'cpu',
      segments: [{ endMs: 1000, startMs: 0, text: 'hello' }],
      text: 'hello'
    })
  })

  it('passes abort signals to preprocessing and worker transcription', async () => {
    existsSyncMock.mockReturnValue(true)
    preprocessMock.mockResolvedValue(new Float32Array([0, 0]))
    const controller = new AbortController()
    const transcribeSamples = vi.fn().mockResolvedValue({ text: 'hello', chunks: [] })

    await new LocalWhisperRuntime({ transcribeSamples }).transcribe('/audio.wav', 'auto', controller.signal)

    expect(preprocessMock).toHaveBeenCalledWith('/audio.wav', controller.signal)
    expect(transcribeSamples).toHaveBeenCalledWith(
      '/models/whisper',
      expect.any(Float32Array),
      'auto',
      controller.signal
    )
  })
})
