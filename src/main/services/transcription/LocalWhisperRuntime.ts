import { existsSync, statSync } from 'node:fs'
import path from 'node:path'

import { Converter } from 'opencc-js'

import { application } from '@application'
import {
  bundleDtype,
  bundleForCapability,
  InferenceServiceBase,
  type WhisperInferenceContract,
  whisperInferenceProcess
} from '@main/ai/localModel'
import { Injectable, Phase, ServicePhase } from '@main/core/lifecycle'
import type { TranscriptionLanguage, TranscriptionSegment } from '@shared/data/types/transcription'

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
export class LocalWhisperRuntime extends InferenceServiceBase<WhisperInferenceContract> {
  constructor(private readonly dependencies: LocalWhisperRuntimeDependencies = {}) {
    super(whisperInferenceProcess, 'whisper')
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
    const bundle = bundleForCapability('whisper')
    const invalidFiles = findInvalidWhisperModelFiles(modelPath)
    if (invalidFiles.length === bundle.files.length) {
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
      runtime: output.runtime ?? 'cpu'
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
  ): Promise<{
    text: string
    chunks?: Array<{ timestamp: [number, number]; text: string }>
    runtime?: 'accelerated' | 'cpu'
  }> {
    if (this.dependencies.transcribeSamples) {
      return await this.dependencies.transcribeSamples(modelPath, samples, language, signal)
    }
    const bundle = bundleForCapability('whisper')
    return this.run(
      'transcribe',
      {
        modelDir: modelPath,
        dtype: bundleDtype(bundle),
        audio: samples,
        ...(language === 'auto' ? {} : { language })
      },
      { signal }
    )
  }
}

function normalizeTranscriptText(text: string, language: TranscriptionLanguage): string {
  return language.startsWith('zh') ? toSimplifiedChinese(text) : text
}

function resolveLocalWhisperLanguage(language: TranscriptionLanguage): TranscriptionLanguage {
  return language === 'auto' ? 'zh' : language
}

function findInvalidWhisperModelFiles(modelPath: string): string[] {
  return bundleForCapability('whisper')
    .files.filter((file) => {
      const filePath = path.join(modelPath, file.relPath)
      if (!existsSync(filePath)) return true
      try {
        return statSync(filePath).size < file.minBytes
      } catch {
        return true
      }
    })
    .map((file) => file.relPath)
}
