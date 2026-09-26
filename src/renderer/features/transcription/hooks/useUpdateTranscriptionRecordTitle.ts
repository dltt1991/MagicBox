import { useCallback } from 'react'

import { useMutation } from '@data/hooks/useDataApi'

export function useUpdateTranscriptionRecordTitle() {
  const {
    trigger: updateTitle,
    isLoading,
    error
  } = useMutation('PATCH', '/transcription/records/:id', {
    refresh: ['/transcription/records', '/transcription/records/:id']
  })

  return {
    updateTitle: useCallback(
      (recordId: string, title: string) => updateTitle({ params: { id: recordId }, body: { title } }),
      [updateTitle]
    ),
    isSaving: isLoading,
    error
  }
}
