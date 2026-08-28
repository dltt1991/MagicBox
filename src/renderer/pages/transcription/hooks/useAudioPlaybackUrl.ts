import { ipcApi } from '@renderer/ipc'
import { useEffect, useRef, useState } from 'react'

type PlaybackState = { url: string | null; missing: boolean }
type PreviewPlaybackState = PlaybackState & { previewId: string | null }

export function useAudioPlaybackUrl(recordId: string | null, previewAudioPath: string | null = null) {
  const [state, setState] = useState<PlaybackState>({ url: null, missing: false })
  const previewIdRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const releasePreview = () => {
      const previewId = previewIdRef.current
      if (previewId) {
        previewIdRef.current = null
        void ipcApi.request('transcription.audio_url.release', { previewId }).catch(() => undefined)
      }
    }

    if (!recordId && !previewAudioPath) {
      releasePreview()
      setState({ url: null, missing: false })
      return
    }
    if (recordId) releasePreview()
    const request: Promise<PlaybackState | PreviewPlaybackState> = recordId
      ? ipcApi.request('transcription.audio_url.resolve', { recordId })
      : ipcApi.request('transcription.audio_url.preview', { audioPath: previewAudioPath! })
    void request.then(
      (result) => {
        const previewId = getPreviewId(result)
        if (cancelled) {
          if (previewId) {
            void ipcApi.request('transcription.audio_url.release', { previewId }).catch(() => undefined)
          }
          return
        }
        if (!cancelled) {
          if ('previewId' in result) {
            releasePreview()
            previewIdRef.current = previewId
          }
          setState({ missing: result.missing, url: result.url })
        }
      },
      () => {
        if (!cancelled) setState({ url: null, missing: true })
      }
    )
    return () => {
      cancelled = true
      if (!recordId) releasePreview()
    }
  }, [previewAudioPath, recordId])

  return state
}

function getPreviewId(result: PlaybackState | PreviewPlaybackState): string | null {
  return 'previewId' in result && typeof result.previewId === 'string' ? result.previewId : null
}
