import { useMutation, useQuery } from '@data/hooks/useDataApi'
import type {
  CreateTranscriptionPromptTemplateDto,
  UpdateTranscriptionPromptTemplateDto
} from '@shared/data/api/schemas/transcription'
import { useCallback } from 'react'

export function useTranscriptionPromptTemplates() {
  const { data, isLoading, error, refetch } = useQuery('/transcription/prompt-templates')
  const { trigger: create } = useMutation('POST', '/transcription/prompt-templates', {
    refresh: ['/transcription/prompt-templates']
  })
  const { trigger: update } = useMutation('PATCH', '/transcription/prompt-templates/:id', {
    refresh: ['/transcription/prompt-templates']
  })
  const { trigger: remove } = useMutation('DELETE', '/transcription/prompt-templates/:id', {
    refresh: ['/transcription/prompt-templates']
  })

  return {
    templates: data ?? [],
    isLoading,
    error,
    refresh: refetch,
    createTemplate: useCallback((body: CreateTranscriptionPromptTemplateDto) => create({ body }), [create]),
    updateTemplate: useCallback(
      (id: string, body: UpdateTranscriptionPromptTemplateDto) => update({ params: { id }, body }),
      [update]
    ),
    deleteTemplate: useCallback((id: string) => remove({ params: { id } }), [remove])
  }
}
