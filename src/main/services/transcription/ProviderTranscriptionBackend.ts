import { readFile } from 'node:fs/promises'

import { extensionRegistry } from '@cherrystudio/ai-core/provider'
import { resolveProviderAiSdkConfig } from '@main/ai/provider/config'
import { modelService } from '@main/data/services/ModelService'
import { providerService } from '@main/data/services/ProviderService'
import type { TranscriptionLanguage, TranscriptionSegment } from '@shared/data/types/transcription'
import { experimental_transcribe } from 'ai'

import { mapSegments } from './segmentMapper'

export interface ProviderTranscriptionBackendDependencies {
  readFile?: typeof readFile
  resolve?: (providerId: string, modelId: string) => Promise<{ model: unknown }>
  transcribe?: typeof experimental_transcribe
}

export class ProviderTranscriptionBackend {
  constructor(private readonly dependencies: ProviderTranscriptionBackendDependencies = {}) {}

  async transcribe(input: {
    audioPath: string
    language: TranscriptionLanguage
    providerId: string
    modelId: string
    signal: AbortSignal
  }): Promise<{
    text: string
    segments: TranscriptionSegment[]
    language?: string
    durationMs: number | null
    backend: 'provider_model'
    providerId: string
    modelId: string
  }> {
    const audio = await (this.dependencies.readFile ?? readFile)(input.audioPath)
    input.signal.throwIfAborted()
    const { model } = await (this.dependencies.resolve ?? resolveProviderModel)(input.providerId, input.modelId)
    const response = await (this.dependencies.transcribe ?? experimental_transcribe)({
      model: model as never,
      audio: Uint8Array.from(audio),
      abortSignal: input.signal,
      providerOptions: input.language === 'auto' ? undefined : { transcription: { language: input.language } }
    })
    return {
      text: response.text.trim(),
      segments: mapSegments(response.segments),
      ...(response.language ? { language: response.language } : {}),
      durationMs: response.durationInSeconds === undefined ? null : Math.round(response.durationInSeconds * 1000),
      backend: 'provider_model',
      providerId: input.providerId,
      modelId: input.modelId
    }
  }
}

async function resolveProviderModel(providerId: string, modelId: string): Promise<{ model: unknown }> {
  const provider = providerService.getByProviderId(providerId)
  const model = modelService.getByKey(providerId, modelId)
  const { config } = await resolveProviderAiSdkConfig(provider, model)
  const runtimeProvider = await extensionRegistry.createProvider(config.providerId, config.providerSettings)
  if (!runtimeProvider.transcriptionModel) throw new Error('Configured provider does not support transcription')
  if (!model.apiModelId) throw new Error('Configured transcription model has no API model id')
  return { model: runtimeProvider.transcriptionModel(model.apiModelId) }
}
