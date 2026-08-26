import type * as NodeFs from 'node:fs'
import { Writable } from 'node:stream'

import { net } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createWriteStream, existsSync, mkdir, rename, rm, statSync, ensureOnnxRuntime, onnxRuntimeIsReady, unload } =
  vi.hoisted(() => ({
    createWriteStream: vi.fn(),
    existsSync: vi.fn(),
    mkdir: vi.fn(),
    rename: vi.fn(),
    rm: vi.fn(),
    statSync: vi.fn(),
    ensureOnnxRuntime: vi.fn(),
    onnxRuntimeIsReady: vi.fn(),
    unload: vi.fn()
  }))

vi.mock('@application', async () => {
  const { mockApplicationFactory } = await import('@test-mocks/main/application')
  return mockApplicationFactory()
})

vi.mock('@main/core/platform', () => ({ isDarwinX64: false }))
vi.mock('@main/services/RegionService', () => ({ regionService: { isInChina: vi.fn().mockResolvedValue(false) } }))
vi.mock('@main/services/localModel/OnnxRuntimeBinaryService', () => ({
  onnxRuntimeBinaryService: { ensure: ensureOnnxRuntime, isReady: onnxRuntimeIsReady }
}))
vi.mock('@main/services/transcription/WhisperInferenceRuntime', () => ({ whisperInferenceRuntime: { unload } }))
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof NodeFs>('node:fs')
  const patched = {
    ...actual,
    createWriteStream,
    existsSync,
    statSync,
    promises: { ...actual.promises, mkdir, rename, rm }
  }
  return { ...patched, default: patched }
})

const { localWhisperDownloadService } = await import('../LocalWhisperDownloadService')
const { LOCAL_MODELS } = await import('@main/ai/inference/localModelCatalog')
const { application } = await import('@application')

const MODEL_DIR = '/mock/feature.transcription.whisper'
const ENCODER_PATH = `${MODEL_DIR}/onnx/encoder_model_quantized.onnx`
const DECODER_PATH = `${MODEL_DIR}/onnx/decoder_model_merged_quantized.onnx`

function markReadyFiles(): void {
  const sizes = new Map(LOCAL_MODELS.whisper.files.map((file) => [`${MODEL_DIR}/${file.fileName}`, file.minBytes]))
  existsSync.mockImplementation((file: string) => sizes.has(file))
  statSync.mockImplementation((file: string) => ({ size: sizes.get(file) }))
}

function response(byteLength = 1_000_001) {
  return {
    ok: true,
    headers: { get: (name: string) => (name === 'content-length' ? String(byteLength) : null) },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(byteLength))
        controller.close()
      }
    })
  }
}

describe('LocalWhisperDownloadService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    existsSync.mockReturnValue(false)
    onnxRuntimeIsReady.mockReturnValue(true)
    ensureOnnxRuntime.mockImplementation(async (_signal: AbortSignal, onProgress?: (fraction: number) => void) => {
      onProgress?.(1)
    })
    mkdir.mockResolvedValue(undefined)
    rename.mockResolvedValue(undefined)
    rm.mockResolvedValue(undefined)
    unload.mockResolvedValue(undefined)
    createWriteStream.mockImplementation(() => new Writable({ write: (_chunk, _encoding, callback) => callback() }))
  })

  it('reports ready only when every Whisper file and the shared runtime are present', () => {
    expect(localWhisperDownloadService.getStatus()).toBe('not_downloaded')

    existsSync.mockReturnValue(true)
    statSync.mockReturnValue({ size: 1 })
    expect(localWhisperDownloadService.getStatusInfo()).toEqual({ status: 'error', errorCode: 'incomplete_cache' })

    markReadyFiles()
    expect(localWhisperDownloadService.getStatus()).toBe('ready')
    expect(existsSync).toHaveBeenCalledWith(ENCODER_PATH)
    expect(existsSync).toHaveBeenCalledWith(DECODER_PATH)
  })

  it('downloads ONNX weights into the loader-required onnx subdirectory', async () => {
    vi.mocked(net.fetch).mockImplementation((async () => response()) as never)

    await expect(localWhisperDownloadService.download()).resolves.toBe('ready')

    expect(ensureOnnxRuntime).toHaveBeenCalledTimes(1)
    expect(net.fetch).toHaveBeenCalledTimes(LOCAL_MODELS.whisper.files.length)
    expect(rename).toHaveBeenCalledTimes(LOCAL_MODELS.whisper.files.length)
    expect(mkdir).toHaveBeenCalledWith(`${MODEL_DIR}/onnx`, { recursive: true })
    expect(rename).toHaveBeenCalledWith(`${ENCODER_PATH}.tmp`, ENCODER_PATH)
    expect(rename).toHaveBeenCalledWith(`${DECODER_PATH}.tmp`, DECODER_PATH)
    expect(application.get('IpcApiService').broadcast).toHaveBeenCalledWith(
      'local_model.download_progress',
      expect.objectContaining({ model: 'whisper', status: 'ready', percent: 100 })
    )
  })

  it('cancels an in-flight Whisper download without leaving an error state', async () => {
    vi.mocked(net.fetch).mockImplementation(
      ((_url: string, { signal }: { signal: AbortSignal }) =>
        new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)))) as never
    )

    const pending = localWhisperDownloadService.download()
    await vi.waitFor(() => expect(net.fetch).toHaveBeenCalled())
    localWhisperDownloadService.cancel()

    await expect(pending).resolves.toBe('cancelled')
    expect(application.get('IpcApiService').broadcast).toHaveBeenCalledWith(
      'local_model.download_progress',
      expect.objectContaining({ model: 'whisper', status: 'not_downloaded' })
    )
  })

  it('unloads Whisper runtime before deleting the model directory', async () => {
    await expect(localWhisperDownloadService.remove()).resolves.toEqual({ removed: true })

    expect(unload).toHaveBeenCalledOnce()
    expect(unload.mock.invocationCallOrder[0]).toBeLessThan(rm.mock.invocationCallOrder[0])
    expect(rm).toHaveBeenCalledWith(MODEL_DIR, { recursive: true, force: true })
  })
})
