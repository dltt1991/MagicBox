import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { TranscriptionLanguage, TranscriptionSegment } from '@shared/data/types/transcription'

import { mapSegments } from './segmentMapper'

type RequestFormat = 'openai_multipart' | 'json_base64'

export interface CustomEndpointTranscriptionBackendDependencies {
  fetch?: typeof globalThis.fetch
  readFile?: typeof readFile
}

export class CustomEndpointTranscriptionBackend {
  constructor(private readonly dependencies: CustomEndpointTranscriptionBackendDependencies = {}) {}

  async transcribe(input: {
    audioPath: string
    language: TranscriptionLanguage
    config: { baseUrl: string; apiKey: string; model?: string; requestFormat: RequestFormat }
    signal: AbortSignal
  }): Promise<{
    text: string
    segments: TranscriptionSegment[]
    language?: string
    durationMs: number | null
    backend: 'custom_endpoint'
    modelId?: string
  }> {
    const audio = await (this.dependencies.readFile ?? readFile)(input.audioPath)
    input.signal.throwIfAborted()
    const response = await (this.dependencies.fetch ?? globalThis.fetch)(input.config.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.config.apiKey}`,
        ...(input.config.requestFormat === 'json_base64' ? { 'Content-Type': 'application/json' } : {})
      },
      body:
        input.config.requestFormat === 'json_base64'
          ? JSON.stringify({
              audio: audio.toString('base64'),
              model: input.config.model,
              language: languageValue(input.language)
            })
          : multipartBody(audio, input.audioPath, input.config.model, input.language),
      signal: input.signal
    })
    if (!response.ok) throw new Error(`Custom transcription endpoint failed with HTTP ${response.status}`)
    const payload = (await response.json()) as {
      text?: string
      language?: string
      duration?: number
      segments?: Array<{ start?: number; end?: number; text?: string }>
    }
    return {
      text: payload.text?.trim() ?? '',
      segments: mapSegments(payload.segments),
      ...(payload.language ? { language: payload.language } : {}),
      durationMs: typeof payload.duration === 'number' ? Math.round(payload.duration * 1000) : null,
      backend: 'custom_endpoint',
      ...(input.config.model ? { modelId: input.config.model } : {})
    }
  }
}

function multipartBody(
  audio: Buffer,
  audioPath: string,
  model: string | undefined,
  language: TranscriptionLanguage
): FormData {
  const body = new FormData()
  body.set('file', new Blob([Uint8Array.from(audio)]), path.basename(audioPath))
  if (model) body.set('model', model)
  const value = languageValue(language)
  if (value) body.set('language', value)
  body.set('response_format', 'verbose_json')
  return body
}

function languageValue(language: TranscriptionLanguage): string | undefined {
  return language === 'auto' ? undefined : language
}
