import { application } from '@application'
import type { TranscriptionBackendConfig } from '@shared/ipc/schemas/transcription'

type CustomEndpointConfig = Extract<TranscriptionBackendConfig, { backend: 'custom_endpoint' }> & { apiKey: string }

export function resolveCustomEndpointConfig(
  input: Extract<TranscriptionBackendConfig, { backend: 'custom_endpoint' }>
): CustomEndpointConfig {
  const preferences = application.get('PreferenceService')
  const baseUrl = preferences.get('feature.transcription.custom_endpoint.base_url')
  if (!baseUrl) return { ...input, apiKey: preferences.get('feature.transcription.custom_endpoint.api_key') }
  return {
    ...input,
    baseUrl,
    model: preferences.get('feature.transcription.custom_endpoint.model') || input.model,
    requestFormat: preferences.get('feature.transcription.custom_endpoint.request_format'),
    apiKey: preferences.get('feature.transcription.custom_endpoint.api_key')
  }
}
