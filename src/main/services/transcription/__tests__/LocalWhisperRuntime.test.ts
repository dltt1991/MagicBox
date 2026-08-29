import { application } from '@application'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { existsSyncMock, loadPipelineMock, preprocessMock, resolveLocalInferenceProfileMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  loadPipelineMock: vi.fn(),
  preprocessMock: vi.fn(),
  resolveLocalInferenceProfileMock: vi.fn()
}))

vi.mock('node:fs', async () => ({ ...(await vi.importActual('node:fs')), existsSync: existsSyncMock }))
vi.mock('@main/ai/inference/inferenceAcceleration', () => ({
  resolveLocalInferenceProfile: resolveLocalInferenceProfileMock
}))
vi.mock('../audioPreprocess', () => ({ LOCAL_WHISPER_SAMPLE_RATE: 16_000, preprocessAudio: preprocessMock }))

import { LocalWhisperRuntime } from '../LocalWhisperRuntime'

describe('LocalWhisperRuntime', () => {
  beforeEach(() => {
    existsSyncMock.mockReset()
    loadPipelineMock.mockReset()
    preprocessMock.mockReset()
    resolveLocalInferenceProfileMock.mockReturnValue({
      id: 'cpu',
      transformersDevice: 'cpu',
      sessionOptions: { executionProviders: ['cpu'] }
    })
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
    expect(loadPipelineMock).toHaveBeenCalledWith(
      '/models/whisper',
      expect.objectContaining({ device: 'cpu', dtype: 'q8' })
    )
    expect(result.runtime).toBe('cpu')
  })

  it('reloads the pipeline when the resolved hardware profile changes', async () => {
    existsSyncMock.mockReturnValue(true)
    preprocessMock.mockResolvedValue(new Float32Array([0, 0]))
    const dispose = vi.fn()
    loadPipelineMock
      .mockResolvedValueOnce(Object.assign(vi.fn().mockResolvedValue({ text: 'cpu', chunks: [] }), { dispose }))
      .mockResolvedValueOnce(vi.fn().mockResolvedValue({ text: 'accelerated', chunks: [] }))
    resolveLocalInferenceProfileMock
      .mockReturnValueOnce({
        id: 'cpu',
        transformersDevice: 'cpu',
        sessionOptions: { executionProviders: ['cpu'] }
      })
      .mockReturnValueOnce({
        id: 'coreml',
        transformersDevice: 'coreml',
        sessionOptions: { executionProviders: ['coreml', 'cpu'] }
      })
    const runtime = new LocalWhisperRuntime({ loadPipeline: loadPipelineMock })

    await runtime.transcribe('/audio.wav', 'auto')
    await runtime.transcribe('/audio.wav', 'auto')

    expect(dispose).toHaveBeenCalledOnce()
    expect(loadPipelineMock).toHaveBeenNthCalledWith(
      2,
      '/models/whisper',
      expect.objectContaining({ device: 'coreml', dtype: 'q8' })
    )
  })

  it('waits for active inference before disposing a canceled pipeline', async () => {
    existsSyncMock.mockReturnValue(true)
    preprocessMock.mockResolvedValue(new Float32Array([0, 0]))
    let finishInference: (value: { text: string; chunks: never[] }) => void = () => undefined
    const dispose = vi.fn()
    const pipeline = Object.assign(
      vi.fn(
        () =>
          new Promise<{ text: string; chunks: never[] }>((resolve) => {
            finishInference = resolve
          })
      ),
      { dispose }
    )
    loadPipelineMock.mockResolvedValue(pipeline)
    const runtime = new LocalWhisperRuntime({ loadPipeline: loadPipelineMock })
    const transcription = runtime.transcribe('/audio.wav', 'auto')
    await vi.waitFor(() => expect(pipeline).toHaveBeenCalledOnce())

    const unloading = runtime.unload()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(dispose).not.toHaveBeenCalled()
    finishInference({ text: 'finished', chunks: [] })

    await transcription
    await unloading
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('rejects immediately when canceled during inference', async () => {
    existsSyncMock.mockReturnValue(true)
    preprocessMock.mockResolvedValue(new Float32Array([0, 0]))
    let finishInference: (value: { text: string; chunks: never[] }) => void = () => undefined
    const pipeline = vi.fn(
      () =>
        new Promise<{ text: string; chunks: never[] }>((resolve) => {
          finishInference = resolve
        })
    )
    loadPipelineMock.mockResolvedValue(pipeline)
    const controller = new AbortController()
    const runtime = new LocalWhisperRuntime({ loadPipeline: loadPipelineMock })
    const transcription = runtime.transcribe('/audio.wav', 'auto', controller.signal)
    await vi.waitFor(() => expect(pipeline).toHaveBeenCalledOnce())

    controller.abort()

    await expect(transcription).rejects.toThrow()
    finishInference({ text: 'late result', chunks: [] })
    await runtime.unload()
  })

  it('does not start inference when canceled while the pipeline is loading', async () => {
    existsSyncMock.mockReturnValue(true)
    preprocessMock.mockResolvedValue(new Float32Array([0, 0]))
    let finishLoading: (pipeline: ReturnType<typeof vi.fn>) => void = () => undefined
    const dispose = vi.fn()
    const pipeline = Object.assign(vi.fn(), { dispose })
    loadPipelineMock.mockReturnValue(
      new Promise((resolve) => {
        finishLoading = resolve
      })
    )
    const controller = new AbortController()
    const runtime = new LocalWhisperRuntime({ loadPipeline: loadPipelineMock })
    const transcription = runtime.transcribe('/audio.wav', 'auto', controller.signal)
    await vi.waitFor(() => expect(loadPipelineMock).toHaveBeenCalledOnce())

    controller.abort()
    const rejection = expect(transcription).rejects.toThrow()
    const unloading = runtime.unload()
    finishLoading(pipeline)

    await rejection
    await unloading
    expect(pipeline).not.toHaveBeenCalled()
    expect(dispose).toHaveBeenCalledOnce()
  })
})
