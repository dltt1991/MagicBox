import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ipc = vi.hoisted(() => ({ request: vi.fn(), progressHandler: undefined as ((payload: any) => void) | undefined }))

vi.mock('@renderer/ipc', () => ({
  ipcApi: { request: ipc.request },
  useIpcOn: (_event: string, handler: (payload: unknown) => void) => {
    ipc.progressHandler = handler
  }
}))

import { useTranscriptionJob } from '../useTranscriptionJob'

describe('useTranscriptionJob', () => {
  beforeEach(() => {
    ipc.request.mockReset()
    ipc.progressHandler = undefined
  })

  it('shows matching progress and cancels the active job', async () => {
    ipc.request.mockImplementation((route: string) =>
      route === 'transcription.transcribe' ? new Promise(() => {}) : Promise.resolve(undefined)
    )
    const { result } = renderHook(() => useTranscriptionJob())

    await act(async () => {
      void result.current.start({
        audioPath: '/audio.wav',
        sourceType: 'recording',
        language: 'auto',
        backend: { backend: 'local_whisper' }
      })
      await Promise.resolve()
    })
    const jobId = ipc.request.mock.calls[0]?.[1].jobId

    act(() => ipc.progressHandler?.({ jobId, stage: 'transcribing', percent: 45 }))
    expect(result.current.progress).toEqual({ stage: 'transcribing', percent: 45 })

    await act(async () => result.current.cancel())
    expect(ipc.request).toHaveBeenLastCalledWith('transcription.cancel', { jobId })
  })

  it('clears idle job progress and errors for a new task', async () => {
    ipc.request.mockRejectedValue(new Error('backend failed'))
    const { result } = renderHook(() => useTranscriptionJob())

    await act(async () => {
      await expect(
        result.current.start({
          audioPath: '/audio.wav',
          sourceType: 'file',
          language: 'auto',
          backend: { backend: 'local_whisper' }
        })
      ).rejects.toThrow('transcription.error.operation_failed')
    })

    expect(result.current.error).toMatchObject({ message: 'transcription.error.operation_failed' })
    expect(result.current.progress).toEqual({ stage: 'preparing' })

    act(() => result.current.reset())

    expect(result.current.error).toBeNull()
    expect(result.current.progress).toBeNull()
  })

  it('preserves local model setup failures as actionable transcription errors', async () => {
    ipc.request.mockRejectedValue(
      new Error('Local Whisper model is incomplete. Missing or invalid files: generation_config.json')
    )
    const { result } = renderHook(() => useTranscriptionJob())

    await act(async () => {
      await expect(
        result.current.start({
          audioPath: '/audio.wav',
          sourceType: 'file',
          language: 'auto',
          backend: { backend: 'local_whisper' }
        })
      ).rejects.toThrow('transcription.error.local_model_incomplete')
    })

    expect(result.current.error).toMatchObject({ message: 'transcription.error.local_model_incomplete' })
  })

  it('keeps organization API call details visible', async () => {
    ipc.request.mockRejectedValue(
      new Error(
        'transcription.error.organization_failed|API request failed (401): Incorrect API key provided: [redacted]'
      )
    )
    const { result } = renderHook(() => useTranscriptionJob())

    await act(async () => {
      await expect(
        result.current.organize({
          recordId: 'record-1',
          templateId: 'builtin-general-summary',
          prompt: '{{transcript}}'
        })
      ).rejects.toThrow(
        'transcription.error.organization_failed|API request failed (401): Incorrect API key provided: [redacted]'
      )
    })

    expect(result.current.error).toMatchObject({
      message:
        'transcription.error.organization_failed|API request failed (401): Incorrect API key provided: [redacted]'
    })
  })
})
