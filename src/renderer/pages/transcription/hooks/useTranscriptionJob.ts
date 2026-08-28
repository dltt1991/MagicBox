import { ipcApi, useIpcOn } from '@renderer/ipc'
import type { TranscriptionLanguage, TranscriptionSourceType } from '@shared/data/types/transcription'
import type { TranscriptionBackendConfig } from '@shared/ipc/schemas/transcription'
import { useCallback, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'

type TranscriptionInput = {
  audioPath: string
  backend: TranscriptionBackendConfig
  language: TranscriptionLanguage
  recordId?: string
  sourceType: TranscriptionSourceType
}

type Progress = { stage: string; percent?: number } | null

export function useTranscriptionJob() {
  const jobIdRef = useRef<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState<Progress>(null)
  const [error, setError] = useState<Error | null>(null)

  useIpcOn('transcription.progress', (event) => {
    if (event.jobId === jobIdRef.current) setProgress({ stage: event.stage, percent: event.percent })
  })

  const run = useCallback(
    async <T>(route: 'transcription.transcribe' | 'transcription.organize', input: Record<string, unknown>) => {
      const jobId = uuidv4()
      jobIdRef.current = jobId
      setError(null)
      setIsRunning(true)
      setProgress({ stage: 'preparing' })
      try {
        return (await ipcApi.request(route, { ...input, jobId } as never)) as T
      } catch (cause) {
        const nextError = cause instanceof Error ? cause : new Error(String(cause))
        setError(nextError)
        throw nextError
      } finally {
        if (jobIdRef.current === jobId) {
          jobIdRef.current = null
          setIsRunning(false)
        }
      }
    },
    []
  )

  const start = useCallback(
    (input: TranscriptionInput) =>
      run<{ record: { id: string }; result: { id: string } }>('transcription.transcribe', input),
    [run]
  )

  const organize = useCallback(
    (input: { modelId?: string; prompt: string; recordId: string; templateId: string | null }) =>
      run<{ result: { id: string } }>('transcription.organize', input),
    [run]
  )

  const cancel = useCallback(async () => {
    if (jobIdRef.current) await ipcApi.request('transcription.cancel', { jobId: jobIdRef.current })
  }, [])

  return { cancel, error, isRunning, organize, progress, start }
}
