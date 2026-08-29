import { existsSync } from 'node:fs'
import path from 'node:path'

import { application } from '@application'
import { resolveLocalInferenceProfile } from '@main/ai/inference/inferenceAcceleration'
import { onnxRuntimeBinaryService } from '@main/services/localModel'
import type { TranscriptionLanguage, TranscriptionSegment } from '@shared/data/types/transcription'

import { LOCAL_WHISPER_SAMPLE_RATE, preprocessAudio } from './audioPreprocess'
import { mapSegments } from './segmentMapper'

type LocalPipeline = ((
  audio: Float32Array,
  options: { return_timestamps: boolean; language?: string }
) => Promise<{ text: string; chunks?: Array<{ timestamp: [number, number]; text: string }> }>) & {
  dispose?: () => Promise<void> | void
}
type LoadPipeline = (modelPath: string, options: Record<string, unknown>) => Promise<LocalPipeline>

export interface LocalWhisperRuntimeDependencies {
  loadPipeline?: LoadPipeline
}

export class LocalWhisperRuntime {
  private readonly activeInferences = new Set<Promise<unknown>>()
  private pipeline: { key: string; value: Promise<LocalPipeline> } | null = null
  private unloadPromise: Promise<void> = Promise.resolve()

  constructor(private readonly dependencies: LocalWhisperRuntimeDependencies = {}) {}

  async transcribe(
    audioPath: string,
    language: TranscriptionLanguage,
    signal?: AbortSignal
  ): Promise<{
    text: string
    segments: TranscriptionSegment[]
    language?: string
    durationMs: number
    backend: 'local_whisper'
    runtime: 'accelerated' | 'cpu'
  }> {
    const modelPath = application.getPath('feature.transcription.whisper')
    if (!existsSync(path.join(modelPath, 'onnx', 'encoder_model_quantized.onnx'))) {
      throw new Error('Local Whisper model is not downloaded')
    }
    signal?.throwIfAborted()
    const samples = await preprocessAudio(audioPath, signal)
    signal?.throwIfAborted()
    const hardwareEnabled = application
      .get('PreferenceService')
      .get('feature.local_model.hardware_acceleration.enabled')
    const profile = resolveLocalInferenceProfile(hardwareEnabled)
    const pipeline = await raceAbort(
      this.getPipeline(modelPath, profile.transformersDevice, profile.sessionOptions),
      signal
    )
    signal?.throwIfAborted()
    const inference = pipeline(samples, {
      return_timestamps: true,
      ...(language === 'auto' ? {} : { language })
    })
    this.activeInferences.add(inference)
    const output = await raceAbort(
      inference.finally(() => this.activeInferences.delete(inference)),
      signal
    )
    signal?.throwIfAborted()
    return {
      text: output.text.trim(),
      segments: mapSegments(
        output.chunks?.map(({ timestamp, text }) => ({ start: timestamp[0], end: timestamp[1], text }))
      ),
      ...(language === 'auto' ? {} : { language }),
      durationMs: Math.round((samples.length / LOCAL_WHISPER_SAMPLE_RATE) * 1000),
      backend: 'local_whisper',
      runtime: profile.id === 'cpu' ? 'cpu' : 'accelerated'
    }
  }

  async unload(): Promise<void> {
    const pipeline = this.pipeline
    this.pipeline = null
    if (!pipeline) return await this.unloadPromise
    const dispose = async () => {
      const loaded = await pipeline.value.catch(() => null)
      await Promise.allSettled(this.activeInferences)
      await loaded?.dispose?.()
    }
    this.unloadPromise = this.unloadPromise.then(dispose, dispose)
    await this.unloadPromise
  }

  private async getPipeline(modelPath: string, device: string, sessionOptions: unknown): Promise<LocalPipeline> {
    const key = JSON.stringify([modelPath, device, sessionOptions])
    if (this.pipeline?.key !== key) await this.unload()
    await this.unloadPromise
    if (!this.pipeline) {
      const pipeline = {
        key,
        value: (this.dependencies.loadPipeline ?? loadPipeline)(modelPath, {
          dtype: 'q8',
          device,
          session_options: sessionOptions
        })
      }
      this.pipeline = pipeline
      pipeline.value.catch(() => {
        if (this.pipeline === pipeline) this.pipeline = null
      })
    }
    return this.pipeline.value
  }
}

async function loadPipeline(modelPath: string, options: Record<string, unknown>): Promise<LocalPipeline> {
  process.env.CHERRY_ONNXRUNTIME_BINDING_PATH = onnxRuntimeBinaryService.bindingPath()
  const { pipeline } = await import('@huggingface/transformers')
  return (await pipeline('automatic-speech-recognition', modelPath, options as never)) as LocalPipeline
}

function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(signal.reason)
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
  ])
}

export const whisperInferenceRuntime = new LocalWhisperRuntime()
