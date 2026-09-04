import { ipcApi } from '@renderer/ipc'
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useAudioPlaybackUrl } from '../useAudioPlaybackUrl'

vi.mock('@renderer/ipc', () => ({
  ipcApi: {
    request: vi.fn()
  }
}))

describe('useAudioPlaybackUrl', () => {
  it('releases preview and history playback mappings on replacement and unmount', async () => {
    vi.mocked(ipcApi.request).mockImplementation(async (route, input) => {
      if (route === 'transcription.audio_url.preview') {
        const { audioPath } = input as { audioPath: string }
        return {
          missing: false,
          playbackId: audioPath === '/first.wav' ? 'playback-1' : 'playback-2',
          url: audioPath === '/first.wav' ? 'cherry-media://audio/preview-1' : 'cherry-media://audio/preview-2'
        }
      }
      return { missing: false }
    })

    const { rerender, unmount } = renderHook(({ previewSource }) => useAudioPlaybackUrl(null, previewSource), {
      initialProps: { previewSource: { audioPath: '/first.wav' } }
    })

    await waitFor(() =>
      expect(ipcApi.request).toHaveBeenCalledWith('transcription.audio_url.preview', { audioPath: '/first.wav' })
    )

    await act(async () => rerender({ previewSource: { audioPath: '/second.wav' } }))
    await waitFor(() =>
      expect(ipcApi.request).toHaveBeenCalledWith('transcription.audio_url.release', { playbackId: 'playback-1' })
    )

    unmount()

    expect(ipcApi.request).toHaveBeenCalledWith('transcription.audio_url.release', { playbackId: 'playback-2' })

    vi.mocked(ipcApi.request).mockImplementation(async (route) =>
      route === 'transcription.audio_url.resolve'
        ? { missing: false, playbackId: 'history-lease', url: 'cherry-media://audio/history-lease' }
        : undefined
    )
    const history = renderHook(() => useAudioPlaybackUrl('record-1'))
    await waitFor(() =>
      expect(ipcApi.request).toHaveBeenCalledWith('transcription.audio_url.resolve', { recordId: 'record-1' })
    )
    history.unmount()
    expect(ipcApi.request).toHaveBeenCalledWith('transcription.audio_url.release', {
      playbackId: 'history-lease'
    })
  })
})
