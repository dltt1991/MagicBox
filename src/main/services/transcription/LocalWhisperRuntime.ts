import { existsSync, statSync } from 'node:fs'
import path from 'node:path'

import { application } from '@application'
import { InferenceServiceBase } from '@main/ai/inference/InferenceServiceBase'
import { LOCAL_MODELS } from '@main/ai/inference/localModelCatalog'
import { DependsOn, Injectable, Phase, ServicePhase } from '@main/core/lifecycle'
import type { TranscriptionLanguage, TranscriptionSegment } from '@shared/data/types/transcription'
import { Converter } from 'opencc-js'

import { LOCAL_WHISPER_SAMPLE_RATE, preprocessAudio } from './audioPreprocess'
import { mapSegments } from './segmentMapper'

const toSimplifiedChinese = Converter({ from: 'tw', to: 'cn' })

export interface LocalWhisperRuntimeDependencies {
  transcribeSamples?: (
    modelPath: string,
    samples: Float32Array,
    language: TranscriptionLanguage,
    signal?: AbortSignal
  ) => Promise<{ text: string; chunks?: Array<{ timestamp: [number, number]; text: string }> }>
}

@Injectable('LocalWhisperRuntime')
@ServicePhase(Phase.WhenReady)
@DependsOn(['ProxyService'])
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
    const invalidFiles = findInvalidWhisperModelFiles(modelPath)
    if (invalidFiles.length === LOCAL_MODELS.whisper.files.length) {
      throw new Error('Local Whisper model is not downloaded')
    }
    if (invalidFiles.length > 0) {
      throw new Error(`Local Whisper model is incomplete. Missing or invalid files: ${invalidFiles.join(', ')}`)
    }
    signal?.throwIfAborted()
    const samples = await preprocessAudio(audioPath, signal)
    signal?.throwIfAborted()
    const output = await this.transcribeSamples(modelPath, samples, language, signal)
    signal?.throwIfAborted()
    const resolvedLanguage = resolveLocalWhisperLanguage(language)
    const text = normalizeTranscriptText(output.text.trim(), resolvedLanguage)
    const segments = mapSegments(
      output.chunks?.map(({ timestamp, text }) => ({ start: timestamp[0], end: timestamp[1], text }))
    ).map((segment) => ({
      ...segment,
      text: normalizeTranscriptText(segment.text, resolvedLanguage)
    }))
    return {
      text,
      segments,
      language: resolvedLanguage,
      durationMs: Math.round((samples.length / LOCAL_WHISPER_SAMPLE_RATE) * 1000),
      backend: 'local_whisper',
      runtime: 'cpu'
    }
  }

  async unload(): Promise<void> {
    await this.terminate()
  }

  protected override hardwareAccelerationEnabled(): boolean {
    return false
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

function normalizeTranscriptText(text: string, language: TranscriptionLanguage): string {
  return language.startsWith('zh') ? toSimplifiedChinese(text) : text
}

function resolveLocalWhisperLanguage(language: TranscriptionLanguage): TranscriptionLanguage {
  return language === 'auto' ? 'zh' : language
}

function findInvalidWhisperModelFiles(modelPath: string): string[] {
  return LOCAL_MODELS.whisper.files
    .filter((file) => {
      const filePath = path.join(modelPath, file.fileName)
      if (!existsSync(filePath)) return true
      try {
        return statSync(filePath).size < file.minBytes
      } catch {
        return true
      }
    })
    .map((file) => file.fileName)
}
