import { ipcApi } from '@renderer/ipc'
import { useEffect, useState } from 'react'

export function useAudioPlaybackUrl(recordId: string | null) {
  const [state, setState] = useState<{ url: string | null; missing: boolean }>({ url: null, missing: false })

  useEffect(() => {
    let cancelled = false
    if (!recordId) {
      setState({ url: null, missing: false })
      return
    }
    void ipcApi.request('transcription.audio_url.resolve', { recordId }).then((result) => {
      if (!cancelled) setState(result)
    })
    return () => {
      cancelled = true
    }
  }, [recordId])

  return state
}
