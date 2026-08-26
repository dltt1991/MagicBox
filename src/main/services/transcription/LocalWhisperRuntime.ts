import { existsSync } from 'node:fs'
import path from 'node:path'

import { application } from '@application'
import { resolveLocalInferenceProfile } from '@main/ai/inference/inferenceAcceleration'
import { onnxRuntimeBinaryService } from '@main/services/localModel'
import type { TranscriptionLanguage, TranscriptionSegment } from '@shared/data/types/transcription'

import { LOCAL_WHISPER_SAMPLE_RATE, preprocessAudio } from './audioPreprocess'
import { mapSegments } from './segmentMapper'

type LocalPipeline = (
  audio: Float32Array,
  options: { return_timestamps: boolean; language?: string }
) => Promise<{ text: string; chunks?: Array<{ timestamp: [number, number]; text: string }> }>
type LoadPipeline = (modelPath: string, options: Record<string, unknown>) => Promise<LocalPipeline>

export interface LocalWhisperRuntimeDependencies {
  loadPipeline?: LoadPipeline
}

export class LocalWhisperRuntime {
  private pipeline: Promise<LocalPipeline> | null = null

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
    const pipeline = await this.getPipeline(modelPath, profile.transformersDevice, profile.sessionOptions)
    const output = await pipeline(samples, { return_timestamps: true, ...(language === 'auto' ? {} : { language }) })
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
    if (!pipeline) return
    const loaded = await pipeline
    await (loaded as LocalPipeline & { dispose?: () => Promise<void> | void }).dispose?.()
  }

  private getPipeline(modelPath: string, device: string, sessionOptions: unknown): Promise<LocalPipeline> {
    if (!this.pipeline) {
      this.pipeline = (this.dependencies.loadPipeline ?? loadPipeline)(modelPath, {
        device,
        session_options: sessionOptions
      })
      this.pipeline.catch(() => {
        this.pipeline = null
      })
    }
    return this.pipeline
  }
}

async function loadPipeline(modelPath: string, options: Record<string, unknown>): Promise<LocalPipeline> {
  process.env.CHERRY_ONNXRUNTIME_BINDING_PATH = onnxRuntimeBinaryService.bindingPath()
  const { pipeline } = await import('@huggingface/transformers')
  return (await pipeline('automatic-speech-recognition', modelPath, options as never)) as LocalPipeline
}

export const whisperInferenceRuntime = new LocalWhisperRuntime()
