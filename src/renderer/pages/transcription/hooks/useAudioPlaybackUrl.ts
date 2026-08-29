import { ipcApi } from '@renderer/ipc'
import { useEffect, useRef, useState } from 'react'

type PlaybackState = { url: string | null; missing: boolean }
type LeasedPlaybackState = PlaybackState & { playbackId: string | null }

export function useAudioPlaybackUrl(
  recordId: string | null,
  previewSource: { audioPath?: string; recordingId?: string } | null = null
) {
  const [state, setState] = useState<PlaybackState>({ url: null, missing: false })
  const playbackIdRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const releasePlayback = () => {
      const playbackId = playbackIdRef.current
      if (playbackId) {
        playbackIdRef.current = null
        void ipcApi.request('transcription.audio_url.release', { playbackId }).catch(() => undefined)
      }
    }

    if (!recordId && !previewSource) {
      releasePlayback()
      setState({ url: null, missing: false })
      return
    }
    releasePlayback()
    const request: Promise<LeasedPlaybackState> = recordId
      ? ipcApi.request('transcription.audio_url.resolve', { recordId })
      : ipcApi.request('transcription.audio_url.preview', previewSource!)
    void request.then(
      (result) => {
        const playbackId = result.playbackId
        if (cancelled) {
          if (playbackId) {
            void ipcApi.request('transcription.audio_url.release', { playbackId }).catch(() => undefined)
          }
          return
        }
        if (!cancelled) {
          releasePlayback()
          playbackIdRef.current = playbackId
          setState({ missing: result.missing, url: result.url })
        }
      },
      () => {
        if (!cancelled) setState({ url: null, missing: true })
      }
    )
    return () => {
      cancelled = true
      releasePlayback()
    }
  }, [previewSource, recordId])

  return state
}
