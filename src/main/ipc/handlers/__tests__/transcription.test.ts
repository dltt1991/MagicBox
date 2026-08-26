import { IpcErrorCode } from '@shared/ipc/errors/IpcError'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { cancelMock, getMock, organizeMock, reserveRecordingTargetMock, resolveAudioUrlMock, transcribeMock } =
  vi.hoisted(() => ({
    cancelMock: vi.fn(),
    getMock: vi.fn(),
    organizeMock: vi.fn(),
    reserveRecordingTargetMock: vi.fn(),
    resolveAudioUrlMock: vi.fn(),
    transcribeMock: vi.fn()
  }))

vi.mock('@application', () => ({
  application: { get: getMock }
}))

import { transcriptionHandlers } from '../transcription'

describe('transcription handlers', () => {
  beforeEach(() => {
    getMock.mockReset().mockReturnValue({
      cancel: cancelMock,
      organize: organizeMock,
      reserveRecordingTarget: reserveRecordingTargetMock,
      resolveAudioUrl: resolveAudioUrlMock,
      transcribe: transcribeMock
    })
    reserveRecordingTargetMock.mockReset()
    resolveAudioUrlMock.mockReset()
    cancelMock.mockReset()
    organizeMock.mockReset()
    transcribeMock.mockReset()
  })

  it('creates a recording target for the requested extension', async () => {
    reserveRecordingTargetMock.mockReturnValue({
      recordingId: 'record-1',
      filePath: '/managed/record-1.webm',
      suggestedName: 'record-1.webm'
    })

    await expect(
      transcriptionHandlers['transcription.recording.create']({ extension: '.webm' }, {} as never)
    ).resolves.toEqual({
      recordingId: 'record-1',
      filePath: '/managed/record-1.webm',
      suggestedName: 'record-1.webm'
    })
    expect(getMock).toHaveBeenCalledWith('TranscriptionService')
    expect(reserveRecordingTargetMock).toHaveBeenCalledWith('.webm')
  })

  it('resolves a record playback URL through the transcription service', async () => {
    resolveAudioUrlMock.mockReturnValue({ url: 'cherry-media://audio/record-1', missing: false })

    await expect(
      transcriptionHandlers['transcription.audio_url.resolve']({ recordId: 'record-1' }, {} as never)
    ).resolves.toEqual({
      url: 'cherry-media://audio/record-1',
      missing: false
    })
    expect(getMock).toHaveBeenCalledWith('TranscriptionService')
    expect(resolveAudioUrlMock).toHaveBeenCalledWith('record-1')
  })

  it('delegates transcription commands with the managed sender id', async () => {
    transcribeMock.mockResolvedValue({ record: { id: 'record-1' }, result: { id: 'result-1' } })
    await transcriptionHandlers['transcription.transcribe'](
      {
        jobId: 'job-1',
        audioPath: '/audio.wav',
        sourceType: 'file',
        language: 'auto',
        backend: { backend: 'local_whisper' }
      },
      { senderId: 'window-1' }
    )
    await transcriptionHandlers['transcription.cancel']({ jobId: 'job-1' }, { senderId: 'window-1' })
    await transcriptionHandlers['transcription.organize'](
      { jobId: 'job-2', recordId: 'record-1', templateId: null, prompt: 'summarize' },
      { senderId: 'window-1' }
    )

    expect(transcribeMock).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-1' }), 'window-1')
    expect(cancelMock).toHaveBeenCalledWith('job-1')
    expect(organizeMock).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-2' }), 'window-1')
  })

  it('rejects transcription commands without a managed sender', async () => {
    await expect(
      transcriptionHandlers['transcription.transcribe'](
        {
          jobId: 'job-1',
          audioPath: '/audio.wav',
          sourceType: 'file',
          language: 'auto',
          backend: { backend: 'local_whisper' }
        },
        { senderId: null }
      )
    ).rejects.toMatchObject({ code: IpcErrorCode.FORBIDDEN_SENDER })
  })
})
