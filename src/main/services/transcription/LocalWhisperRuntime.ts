import { existsSync } from 'node:fs'
import path from 'node:path'

import { application } from '@application'
import { InferenceServiceBase } from '@main/ai/inference/InferenceServiceBase'
import type { TranscriptionLanguage, TranscriptionSegment } from '@shared/data/types/transcription'

import { LOCAL_WHISPER_SAMPLE_RATE, preprocessAudio } from './audioPreprocess'
import { mapSegments } from './segmentMapper'

export interface LocalWhisperRuntimeDependencies {
  transcribeSamples?: (
    modelPath: string,
    samples: Float32Array,
    language: TranscriptionLanguage,
    signal?: AbortSignal
  ) => Promise<{ text: string; chunks?: Array<{ timestamp: [number, number]; text: string }> }>
}

export class LocalWhisperRuntime extends InferenceServiceBase {
  constructor(private readonly dependencies: LocalWhisperRuntimeDependencies = {}) {
    super('whisper')
  }

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
    const output = await this.transcribeSamples(modelPath, samples, language, signal)
    signal?.throwIfAborted()
    return {
      text: output.text.trim(),
      segments: mapSegments(
        output.chunks?.map(({ timestamp, text }) => ({ start: timestamp[0], end: timestamp[1], text }))
      ),
      ...(language === 'auto' ? {} : { language }),
      durationMs: Math.round((samples.length / LOCAL_WHISPER_SAMPLE_RATE) * 1000),
      backend: 'local_whisper',
      runtime: application.get('PreferenceService').get('feature.local_model.hardware_acceleration.enabled')
        ? 'accelerated'
        : 'cpu'
    }
  }

  async unload(): Promise<void> {
    await this.terminate()
  }

  private async transcribeSamples(
    modelPath: string,
    samples: Float32Array,
    language: TranscriptionLanguage,
    signal?: AbortSignal
  ): Promise<{ text: string; chunks?: Array<{ timestamp: [number, number]; text: string }> }> {
    if (this.dependencies.transcribeSamples) {
      return await this.dependencies.transcribeSamples(modelPath, samples, language, signal)
    }
    const result = await this.send(
      {
        type: 'whisper.transcribe',
        modelDir: modelPath,
        audio: samples,
        ...(language === 'auto' ? {} : { language })
      },
      { signal, terminateOnAbort: true }
    )
    return { text: result.text ?? '', chunks: result.chunks ?? [] }
  }
}

export const whisperInferenceRuntime = new LocalWhisperRuntime()
