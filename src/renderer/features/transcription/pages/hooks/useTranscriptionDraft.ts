import { ipcApi } from '@renderer/ipc'
import { useCallback, useEffect, useRef, useState } from 'react'

export type TranscriptionDraftSource =
  | { audioPath: string; name: string; sourceType: 'file' }
  | { name: string; recordingId: string; sourceType: 'recording' }

export function useTranscriptionDraft() {
  const [source, setSource] = useState<TranscriptionDraftSource | null>(null)
  const sourceRef = useRef<TranscriptionDraftSource | null>(null)

  const discard = useCallback(async (draft: TranscriptionDraftSource | null) => {
    if (draft?.sourceType === 'recording') {
      await ipcApi.request('transcription.recording.discard', { recordingId: draft.recordingId })
    }
  }, [])

  const replace = useCallback(
    async (next: TranscriptionDraftSource | null) => {
      const current = sourceRef.current
      sourceRef.current = next
      setSource(next)
      if (current !== next) await discard(current)
    },
    [discard]
  )

  const adopt = useCallback(() => {
    sourceRef.current = null
    setSource(null)
  }, [])

  useEffect(
    () => () => {
      void discard(sourceRef.current).catch(() => undefined)
    },
    [discard]
  )

  return { adopt, replace, source }
}
