import { useMutation } from '@data/hooks/useDataApi'
import type { SaveTranscriptionResultDto, UpdateTranscriptionTextDto } from '@shared/data/api/schemas/transcription'
import { useCallback } from 'react'

export function useSaveTranscriptionResult(recordId: string) {
  const {
    trigger: save,
    isLoading: isSaving,
    error
  } = useMutation('PUT', '/transcription/records/:id/result', {
    refresh: ['/transcription/records', '/transcription/records/:id']
  })
  const { trigger: updateText, isLoading: isUpdatingText } = useMutation('PATCH', '/transcription/records/:id/result', {
    refresh: ['/transcription/records/:id']
  })

  return {
    saveResult: useCallback(
      (body: SaveTranscriptionResultDto) => save({ params: { id: recordId }, body }),
      [recordId, save]
    ),
    updateText: useCallback(
      (body: UpdateTranscriptionTextDto) => updateText({ params: { id: recordId }, body }),
      [recordId, updateText]
    ),
    isSaving: isSaving || isUpdatingText,
    error
  }
}
