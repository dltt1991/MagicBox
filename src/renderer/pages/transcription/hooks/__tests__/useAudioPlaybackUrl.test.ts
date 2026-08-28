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
  it('releases temporary preview media mappings on replacement and unmount', async () => {
    vi.mocked(ipcApi.request).mockImplementation(async (route, input) => {
      if (route === 'transcription.audio_url.preview') {
        const { audioPath } = input as { audioPath: string }
        return {
          missing: false,
          previewId: audioPath === '/first.wav' ? 'preview-1' : 'preview-2',
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
      expect(ipcApi.request).toHaveBeenCalledWith('transcription.audio_url.release', { previewId: 'preview-1' })
    )

    unmount()

    expect(ipcApi.request).toHaveBeenCalledWith('transcription.audio_url.release', { previewId: 'preview-2' })
  })
})
