import { application } from '@application'
import { transcriptionHistoryService } from '@data/services/TranscriptionHistoryService'
import type { TranscriptionSegment } from '@shared/data/types/transcription'

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
    const generated = await application.get('AiService').generateText({
      uniqueModelId: modelId as `${string}::${string}`,
      prompt,
      requestOptions: { signal: input.signal }
    })
    transcriptionHistoryService.saveResult(input.recordId, {
      transcriptText: input.transcriptText,
      segments: input.segments,
      organizationTemplateId: input.templateId,
      organizationPromptSnapshot: prompt,
      organizationOutput: generated.text
    })
    return { result: generated.text }
  }
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
