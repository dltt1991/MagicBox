import { useDataChange, useQuery } from '@data/hooks/useDataApi'
import { useCallback } from 'react'

export function useTranscriptionRecord(id: string) {
  const { data, isLoading, error, refetch } = useQuery('/transcription/records/:id', { params: { id } })
  const refresh = useCallback(() => refetch(), [refetch])

  useDataChange('/transcription/records/:id', () => void refresh(), { routeParams: { id } })

  return { record: data?.record, result: data?.result ?? null, isLoading, error, refresh }
}
