import { randomUUID } from 'node:crypto'

import { application } from '@application'
import { transcriptionHistoryService } from '@data/services/TranscriptionHistoryService'
import type { UniqueModelId } from '@shared/data/types/model'
import type { TranscriptionSegment } from '@shared/data/types/transcription'
import type { UIMessageChunk } from 'ai'

export class TranscriptionOrganizer {
  async organize(input: {
    recordId: string
    transcriptText: string
    segments: TranscriptionSegment[]
    language: string
    durationMs: number
    templateId: string | null
    prompt: string
    modelId?: string
    signal: AbortSignal
  }): Promise<{ result: string }> {
    const prompt = renderPrompt(input.prompt, input)
    const modelId = input.modelId ?? application.get('PreferenceService').get('chat.default_model_id')
    if (!modelId) throw new Error('No chat model is selected for transcription organization')
    const generated = await generateOrganizationText(modelId, prompt, input.signal)
    transcriptionHistoryService.updateOrganizationResult(input.recordId, {
      organizationTemplateId: input.templateId,
      organizationPromptSnapshot: prompt,
      organizationOutput: generated.text
    })
    return { result: generated.text }
  }
}

async function generateOrganizationText(
  modelId: string,
  prompt: string,
  signal: AbortSignal
): Promise<{ text: string }> {
  try {
    const stream = await application.get('AiService').streamText({
      chatId: `transcription-organization-${randomUUID()}`,
      trigger: 'submit-message',
      uniqueModelId: modelId as UniqueModelId,
      messages: [{ id: 'organization-user', role: 'user', parts: [{ type: 'text', text: prompt }] }],
      contextOwner: 'caller',
      requestOptions: { signal }
    })
    return { text: await readTextStream(stream) }
  } catch (error) {
    throw new Error(describeOrganizationError(error), { cause: error })
  }
}

async function readTextStream(stream: ReadableStream<UIMessageChunk>): Promise<string> {
  const reader = stream.getReader()
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value.type === 'text-delta') text += value.delta
      if (value.type === 'error') throw new Error(value.errorText)
    }
  } finally {
    reader.releaseLock()
  }
  return text.trim()
}

function describeOrganizationError(error: unknown): string {
  const statusCode = getErrorField(error, 'statusCode')
  if (statusCode === 401) return 'transcription.error.organization_auth_failed'
  if (statusCode === 403) return 'transcription.error.organization_permission_failed'
  const providerMessage = extractProviderMessage(getErrorField(error, 'responseBody'))
  const message = providerMessage || getErrorMessage(error) || 'model request failed'
  const prefix = typeof statusCode === 'number' ? `API request failed (${statusCode})` : 'API request failed'
  return `transcription.error.organization_failed|${prefix}: ${redactSensitiveText(message)}`
}

function extractProviderMessage(responseBody: unknown): string | null {
  if (typeof responseBody !== 'string' || responseBody.length === 0) return null
  try {
    const parsed = JSON.parse(responseBody) as unknown
    const error = getErrorField(parsed, 'error')
    return (
      asString(getErrorField(error, 'message')) ??
      asString(getErrorField(error, 'detail')) ??
      asString(getErrorField(parsed, 'message')) ??
      asString(getErrorField(parsed, 'detail'))
    )
  } catch {
    return responseBody.slice(0, 300)
  }
}

function getErrorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : asString(getErrorField(error, 'message'))
}

function getErrorField(value: unknown, key: string): unknown {
  return value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, '[redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~-]+\b/gi, 'Bearer [redacted]')
}

export function renderPrompt(
  template: string,
  input: Pick<
    Parameters<TranscriptionOrganizer['organize']>[0],
    'transcriptText' | 'segments' | 'language' | 'durationMs'
  >
): string {
  return template
    .replaceAll('{{transcript}}', input.transcriptText)
    .replaceAll('{{segments}}', JSON.stringify(input.segments))
    .replaceAll('{{language}}', input.language)
    .replaceAll('{{duration}}', String(input.durationMs))
}
