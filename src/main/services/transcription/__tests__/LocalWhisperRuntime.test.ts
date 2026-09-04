import { application } from '@application'
import { BaseService } from '@main/core/lifecycle'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { existsSyncMock, preprocessMock, statSyncMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  preprocessMock: vi.fn(),
  statSyncMock: vi.fn()
}))

vi.mock('node:fs', async () => ({
  ...(await vi.importActual('node:fs')),
  existsSync: existsSyncMock,
  statSync: statSyncMock
}))
vi.mock('../audioPreprocess', () => ({ LOCAL_WHISPER_SAMPLE_RATE: 16_000, preprocessAudio: preprocessMock }))

import { LocalWhisperRuntime } from '../LocalWhisperRuntime'

describe('LocalWhisperRuntime', () => {
  beforeEach(() => {
    BaseService.resetInstances()
    existsSyncMock.mockReset()
    preprocessMock.mockReset()
    statSyncMock.mockReset()
    statSyncMock.mockReturnValue({ size: Number.MAX_SAFE_INTEGER })
    vi.mocked(application.getPath).mockReturnValue('/models/whisper')
    vi.mocked(application.get).mockReturnValue({ get: vi.fn(() => false) } as never)
  })

  it('requires downloaded Whisper weights before loading', async () => {
    existsSyncMock.mockReturnValue(false)

    await expect(
      new LocalWhisperRuntime({ transcribeSamples: vi.fn() }).transcribe('/audio.wav', 'auto')
    ).rejects.toThrow('not downloaded')
  })

  it('rejects incomplete Whisper models before preprocessing audio', async () => {
    existsSyncMock.mockImplementation((filePath: string) => !filePath.endsWith('generation_config.json'))
    preprocessMock.mockRejectedValue(new Error('preprocess should not run'))

    await expect(
      new LocalWhisperRuntime({ transcribeSamples: vi.fn() }).transcribe('/audio.wav', 'auto')
    ).rejects.toThrow('Local Whisper model is incomplete')

    expect(preprocessMock).not.toHaveBeenCalled()
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

  it('converts Chinese local Whisper output to simplified Chinese', async () => {
    existsSyncMock.mockReturnValue(true)
    preprocessMock.mockResolvedValue(new Float32Array(16_000))
    const transcribeSamples = vi.fn().mockResolvedValue({
      text: ' 後臺裏麵 ',
      chunks: [{ timestamp: [0, 1], text: '後臺裏麵' }]
    })

    const result = await new LocalWhisperRuntime({ transcribeSamples }).transcribe('/audio.wav', 'zh')

    expect(result).toMatchObject({
      language: 'zh',
      segments: [{ endMs: 1000, startMs: 0, text: '后台里面' }],
      text: '后台里面'
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
