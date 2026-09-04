import { ipcApi, useIpcOn } from '@renderer/ipc'
import type { TranscriptionLanguage, TranscriptionSourceType } from '@shared/data/types/transcription'
import type { TranscriptionBackendConfig } from '@shared/ipc/schemas/transcription'
import { useCallback, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'

type TranscriptionInput = {
  audioPath?: string
  backend: TranscriptionBackendConfig
  language: TranscriptionLanguage
  recordId?: string
  recordingId?: string
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
      } catch (error) {
        const nextError = normalizeTranscriptionError(error)
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

  const reset = useCallback(() => {
    if (jobIdRef.current) return
    setError(null)
    setProgress(null)
  }, [])

  return { cancel, error, isRunning, organize, progress, reset, start }
}

export function normalizeTranscriptionError(error: unknown): Error {
  if (error instanceof Error && error.message.startsWith('transcription.error.')) return error

  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('Local Whisper model is not downloaded')) {
    return new Error('transcription.error.local_model_not_downloaded')
  }
  if (message.includes('Local Whisper model is incomplete')) {
    return new Error('transcription.error.local_model_incomplete')
  }
  if (message.startsWith('transcription.error.organization_failed|')) return new Error(message)
  return new Error('transcription.error.operation_failed')
}
