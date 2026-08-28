import { ipcApi } from '@renderer/ipc'
import { useEffect, useState } from 'react'

export function useAudioPlaybackUrl(recordId: string | null, previewAudioPath: string | null = null) {
  const [state, setState] = useState<{ url: string | null; missing: boolean }>({ url: null, missing: false })

  useEffect(() => {
    let cancelled = false
    if (!recordId && !previewAudioPath) {
      setState({ url: null, missing: false })
      return
    }
    const request = recordId
      ? ipcApi.request('transcription.audio_url.resolve', { recordId })
      : ipcApi.request('transcription.audio_url.preview', { audioPath: previewAudioPath! })
    void request.then(
      (result) => {
        if (!cancelled) setState(result)
      },
      () => {
        if (!cancelled) setState({ url: null, missing: true })
      }
    )
    return () => {
      cancelled = true
    }
  }, [previewAudioPath, recordId])

  return state
}
