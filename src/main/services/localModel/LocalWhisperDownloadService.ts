import fs from 'node:fs'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web'

import { application } from '@application'
import { loggerService } from '@logger'
import { LOCAL_MODELS, type RemoteModelFile } from '@main/ai/inference/localModelCatalog'
import { modelSourceOrder, resolveModelFileUrl } from '@main/ai/inference/modelSource'
import { regionService } from '@main/services/RegionService'
import { whisperInferenceRuntime } from '@main/services/transcription'
import type { LocalModelKind } from '@shared/data/presets/localModel'
import { net } from 'electron'

import { LocalModelDownloadService, type LocalModelFilesState } from './LocalModelDownloadService'
import { onnxRuntimeBinaryService } from './OnnxRuntimeBinaryService'

const logger = loggerService.withContext('LocalWhisperDownloadService')

class LocalWhisperDownloadService extends LocalModelDownloadService {
  protected readonly kind: LocalModelKind = 'whisper'

  protected modelFilesState(): LocalModelFilesState {
    const files = LOCAL_MODELS.whisper.files
    const present = files.filter((file) => fs.existsSync(this.modelPath(file.fileName)))
    if (present.length === 0) return 'absent'
    if (!onnxRuntimeBinaryService.isReady()) return 'incomplete'
    return present.length === files.length && present.every((file) => this.isComplete(file)) ? 'ready' : 'incomplete'
  }

  protected async performDownload(signal: AbortSignal): Promise<void> {
    const files = LOCAL_MODELS.whisper.files
    const runtimeWeight = 20
    const totalWeight = runtimeWeight + files.reduce((sum, file) => sum + file.weight, 0)
    let completedWeight = 0

    await onnxRuntimeBinaryService.ensure(signal, (fraction) => {
      this.broadcast({ status: 'downloading', percent: Math.round((100 * runtimeWeight * fraction) / totalWeight) })
    })
    completedWeight += runtimeWeight
    await fs.promises.mkdir(this.modelDir(), { recursive: true })
    for (const file of files) {
      await this.downloadFile(file, signal, (fraction) => {
        this.broadcast({
          status: 'downloading',
          percent: Math.round((100 * (completedWeight + file.weight * fraction)) / totalWeight)
        })
      })
      completedWeight += file.weight
    }
    this.broadcast({ status: 'ready', percent: 100 })
  }

  async remove(): Promise<{ removed: boolean }> {
    await whisperInferenceRuntime.unload()
    await fs.promises.rm(this.modelDir(), { recursive: true, force: true })
    return { removed: true }
  }

  private modelDir(): string {
    return application.getPath('feature.transcription.whisper')
  }

  private modelPath(fileName: string): string {
    const [directory, file] = fileName.split('/')
    return file
      ? path.join(application.getPath('feature.transcription.whisper', directory), file)
      : application.getPath('feature.transcription.whisper', directory)
  }

  private isComplete(file: RemoteModelFile): boolean {
    return fs.statSync(this.modelPath(file.fileName)).size >= file.minBytes
  }

  private async downloadFile(
    file: RemoteModelFile,
    signal: AbortSignal,
    onProgress: (fraction: number) => void
  ): Promise<void> {
    const inChina = await regionService.isInChina().catch(() => false)
    const urls = modelSourceOrder(inChina).map((id) => resolveModelFileUrl(id, file.repo, file.remoteFile))
    let lastError: unknown
    for (const url of urls) {
      try {
        await this.fetchToFile(url, this.modelPath(file.fileName), file.minBytes, signal, onProgress)
        return
      } catch (error) {
        if (signal.aborted) throw error
        lastError = error
        logger.warn(`mirror failed for ${file.fileName}, trying next`, { url, error: String(error) })
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`failed to download ${file.fileName}`)
  }

  private async fetchToFile(
    url: string,
    dest: string,
    minBytes: number,
    signal: AbortSignal,
    onProgress: (fraction: number) => void
  ): Promise<void> {
    await fs.promises.mkdir(path.dirname(dest), { recursive: true })
    const response = await net.fetch(url, { signal })
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status} for ${url}`)

    const total = Number(response.headers.get('content-length')) || 0
    const tmp = `${dest}.tmp`
    let received = 0
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length
        if (total > 0) onProgress(received / total)
        callback(null, chunk)
      }
    })

    try {
      const webStream = response.body as unknown as NodeWebReadableStream<Uint8Array>
      await pipeline(Readable.fromWeb(webStream), counter, fs.createWriteStream(tmp), { signal })
    } catch (error) {
      await fs.promises.rm(tmp, { force: true })
      throw error
    }
    if (received < minBytes) {
      await fs.promises.rm(tmp, { force: true })
      throw new Error(`download from ${url} too small (${received} bytes)`)
    }
    await fs.promises.rename(tmp, dest)
    onProgress(1)
  }
}

export const localWhisperDownloadService = new LocalWhisperDownloadService()
