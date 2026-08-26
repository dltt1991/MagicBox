import { application } from '@application'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { existsSyncMock, loadPipelineMock, preprocessMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  loadPipelineMock: vi.fn(),
  preprocessMock: vi.fn()
}))

vi.mock('node:fs', async () => ({ ...(await vi.importActual('node:fs')), existsSync: existsSyncMock }))
vi.mock('../audioPreprocess', () => ({ LOCAL_WHISPER_SAMPLE_RATE: 16_000, preprocessAudio: preprocessMock }))

import { LocalWhisperRuntime } from '../LocalWhisperRuntime'

describe('LocalWhisperRuntime', () => {
  beforeEach(() => {
    existsSyncMock.mockReset()
    loadPipelineMock.mockReset()
    preprocessMock.mockReset()
    vi.mocked(application.getPath).mockReturnValue('/models/whisper')
    vi.mocked(application.get).mockReturnValue({ get: vi.fn(() => false) } as never)
  })

  it('requires downloaded Whisper weights before loading', async () => {
    existsSyncMock.mockReturnValue(false)

    await expect(
      new LocalWhisperRuntime({ loadPipeline: loadPipelineMock }).transcribe('/audio.wav', 'auto')
    ).rejects.toThrow('not downloaded')
  })

  it('uses CPU when acceleration is disabled', async () => {
    existsSyncMock.mockReturnValue(true)
    preprocessMock.mockResolvedValue(new Float32Array([0, 0]))
    loadPipelineMock.mockResolvedValue(vi.fn().mockResolvedValue({ text: 'hello', chunks: [] }))

    const result = await new LocalWhisperRuntime({ loadPipeline: loadPipelineMock }).transcribe('/audio.wav', 'en')

    expect(application.get('PreferenceService').get).toHaveBeenCalledWith(
      'feature.local_model.hardware_acceleration.enabled'
    )
    expect(loadPipelineMock).toHaveBeenCalledWith('/models/whisper', expect.objectContaining({ device: 'cpu' }))
    expect(result.runtime).toBe('cpu')
  })
})
