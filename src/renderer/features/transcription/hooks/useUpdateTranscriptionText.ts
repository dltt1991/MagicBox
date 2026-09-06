import { useMutation } from '@data/hooks/useDataApi'
import type { UpdateTranscriptionTextDto } from '@shared/data/api/schemas/transcription'
import { useCallback } from 'react'

export function useUpdateTranscriptionText(recordId: string) {
  const {
    trigger: updateText,
    isLoading,
    error
  } = useMutation('PATCH', '/transcription/records/:id/result', {
    refresh: ['/transcription/records/:id']
  })

  return {
    updateText: useCallback(
      (body: UpdateTranscriptionTextDto) => updateText({ params: { id: recordId }, body }),
      [recordId, updateText]
    ),
    isSaving: isLoading,
    error
  }
}
