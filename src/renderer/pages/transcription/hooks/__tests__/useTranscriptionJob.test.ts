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
})
