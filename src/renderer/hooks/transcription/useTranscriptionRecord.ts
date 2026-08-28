import { useDataChange, useQuery } from '@data/hooks/useDataApi'
import { useCallback } from 'react'

export function useTranscriptionRecord(id: string | null) {
  const { data, isLoading, error, refetch } = useQuery('/transcription/records/:id', {
    params: { id: id ?? '__transcription_unselected__' },
    enabled: Boolean(id)
  })
  const refresh = useCallback(() => refetch(), [refetch])

  useDataChange(
    '/transcription/records/:id',
    () => {
      void refresh().catch(() => undefined)
    },
    {
      routeParams: { id: id ?? '__transcription_unselected__' }
    }
  )

  return { record: data?.record, result: data?.result ?? null, isLoading, error, refresh }
}
