import { ipcApi } from '@renderer/ipc'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useTranscriptionDraft } from '../useTranscriptionDraft'

vi.mock('@renderer/ipc', () => ({ ipcApi: { request: vi.fn().mockResolvedValue(undefined) } }))

describe('useTranscriptionDraft', () => {
  beforeEach(() => vi.mocked(ipcApi.request).mockClear())

  it('discards managed recordings when replacing a draft and leaving the page', async () => {
    const { result, unmount } = renderHook(() => useTranscriptionDraft())

    await act(async () => {
      await result.current.replace({ name: 'first.wav', recordingId: 'recording-1', sourceType: 'recording' })
      await result.current.replace({ name: 'second.wav', recordingId: 'recording-2', sourceType: 'recording' })
    })

    expect(ipcApi.request).toHaveBeenCalledWith('transcription.recording.discard', { recordingId: 'recording-1' })
    unmount()
    await waitFor(() =>
      expect(ipcApi.request).toHaveBeenCalledWith('transcription.recording.discard', { recordingId: 'recording-2' })
    )
  })

  it('transfers ownership without deleting a successfully persisted recording', async () => {
    const { result, unmount } = renderHook(() => useTranscriptionDraft())
    await act(async () => {
      await result.current.replace({ name: 'saved.wav', recordingId: 'recording-1', sourceType: 'recording' })
      result.current.adopt()
    })

    unmount()
    expect(ipcApi.request).not.toHaveBeenCalledWith('transcription.recording.discard', expect.anything())
  })

  it('renames the draft without discarding managed recording audio', async () => {
    const { result } = renderHook(() => useTranscriptionDraft())

    await act(async () => {
      await result.current.replace({ name: 'first.wav', recordingId: 'recording-1', sourceType: 'recording' })
      result.current.rename('Weekly meeting')
    })

    expect(result.current.source?.name).toBe('Weekly meeting')
    expect(ipcApi.request).not.toHaveBeenCalledWith('transcription.recording.discard', expect.anything())
  })
})
