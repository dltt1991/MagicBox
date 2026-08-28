import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useAudioRecorder } from '../useAudioRecorder'

describe('useAudioRecorder', () => {
  it('locks the recorder while microphone permission is pending', async () => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(() => new Promise(() => {})) } })
    const { result } = renderHook(() => useAudioRecorder())

    await act(async () => {
      void result.current.start()
      await Promise.resolve()
    })

    expect(result.current.status).toBe('starting')
  })

  it('stops the microphone stream if permission resolves after unmount', async () => {
    let resolveStream: (stream: MediaStream) => void = () => undefined
    const stop = vi.fn()
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn(
          () =>
            new Promise<MediaStream>((resolve) => {
              resolveStream = resolve
            })
        )
      }
    })
    const { result, unmount } = renderHook(() => useAudioRecorder())

    await act(async () => {
      void result.current.start()
      await Promise.resolve()
    })
    unmount()
    await act(async () => {
      resolveStream(stream)
      await Promise.resolve()
    })

    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('surfaces microphone start failures as hook state', async () => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new Error('Denied')) } })
    const { result } = renderHook(() => useAudioRecorder())

    await act(async () => result.current.start())

    expect(result.current.error).toMatchObject({ message: 'transcription.error.microphone_unavailable' })
  })
})
