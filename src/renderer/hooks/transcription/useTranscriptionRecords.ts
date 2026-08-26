import { useDataChange, useInfiniteFlatItems, useInfiniteQuery } from '@data/hooks/useDataApi'
import type { TranscriptionRecordQueryParams } from '@shared/data/api/schemas/transcription'
import { useCallback, useMemo } from 'react'

interface UseTranscriptionRecordsOptions extends Omit<TranscriptionRecordQueryParams, 'cursor' | 'limit'> {
  pageSize?: number
}

export function useTranscriptionRecords({ pageSize = 20, search, status }: UseTranscriptionRecordsOptions = {}) {
  const queryKey = useMemo(() => ({ ...(search ? { search } : {}), ...(status ? { status } : {}) }), [search, status])
  const { pages, error, isLoading, isRefreshing, hasNext, loadNext, refresh, reset } = useInfiniteQuery(
    '/transcription/records',
    {
      query: queryKey,
      limit: pageSize,
      swrOptions: { keepPreviousData: false }
    }
  )
  const reload = useCallback(async () => {
    reset()
    await refresh()
  }, [refresh, reset])

  useDataChange('/transcription/records', () => {
    void reload()
  })

  return {
    items: useInfiniteFlatItems(pages),
    total: pages[0]?.total ?? 0,
    hasMore: hasNext,
    isLoading,
    isLoadingMore: isRefreshing && pages.length > 0,
    error,
    loadMore: loadNext,
    refresh: reload
  }
}
