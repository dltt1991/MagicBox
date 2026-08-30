import { MockUseDataApiUtils, mockUseInfiniteQuery, mockUseQuery } from '@test-mocks/renderer/useDataApi'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useTranscriptionRecord } from '../useTranscriptionRecord'
import { useTranscriptionRecords } from '../useTranscriptionRecords'

describe('useTranscriptionRecords', () => {
  function buildInfiniteState(overrides: Record<string, unknown> = {}) {
    return {
      pages: [{ items: [], total: 0 }],
      isLoading: false,
      isRefreshing: false,
      error: undefined,
      hasNext: false,
      loadNext: vi.fn(),
      refresh: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn(),
      ...overrides
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    MockUseDataApiUtils.resetMocks()
    mockUseInfiniteQuery.mockReturnValue(buildInfiniteState() as never)
  })

  it('uses the records endpoint and refreshes when its membership changes', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    const reset = vi.fn()
    mockUseInfiniteQuery.mockReturnValue(buildInfiniteState({ refresh, reset }) as never)

    renderHook(() => useTranscriptionRecords({ status: 'ready', pageSize: 10 }))

    expect(mockUseInfiniteQuery).toHaveBeenCalledWith('/transcription/records', {
      query: { status: 'ready' },
      limit: 10,
      swrOptions: { keepPreviousData: false }
    })
    await act(async () => {
      MockUseDataApiUtils.emitDataChange([{ endpoint: '/transcription/records', kind: 'membership' }])
      await Promise.resolve()
    })
    expect(reset).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('handles refresh failures from data-change callbacks', async () => {
    const refresh = vi.fn().mockRejectedValue(new Error('refresh failed'))
    mockUseInfiniteQuery.mockReturnValue(buildInfiniteState({ refresh }) as never)

    renderHook(() => useTranscriptionRecords())

    await expect(async () => {
      await act(async () => {
        MockUseDataApiUtils.emitDataChange([{ endpoint: '/transcription/records', kind: 'membership' }])
        await Promise.resolve()
        await Promise.resolve()
      })
    }).not.toThrow()
  })

  it('handles selected-record refresh failures from data-change callbacks', async () => {
    const refetch = vi.fn().mockRejectedValue(new Error('refresh failed'))
    mockUseQuery.mockReturnValue({
      data: { record: undefined, result: null },
      isLoading: false,
      isRefreshing: false,
      error: undefined,
      refetch,
      mutate: vi.fn()
    } as never)

    renderHook(() => useTranscriptionRecord('record-1'))

    await expect(async () => {
      await act(async () => {
        MockUseDataApiUtils.emitDataChange([{ endpoint: '/transcription/records/:id' }] as const)
        await Promise.resolve()
        await Promise.resolve()
      })
    }).not.toThrow()
  })
})
