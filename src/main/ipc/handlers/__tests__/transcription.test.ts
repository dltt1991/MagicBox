import { IpcErrorCode } from '@shared/ipc/errors/IpcError'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  cancelMock,
  deleteRecordingMock,
  discardRecordingMock,
  getMock,
  organizeMock,
  releaseAudioUrlMock,
  reserveRecordingTargetMock,
  resolveAudioUrlMock,
  resolveTemporaryRecordingUrlMock,
  resolveTemporaryAudioUrlMock,
  transcribeMock,
  writeRecordingMock
} = vi.hoisted(() => ({
  cancelMock: vi.fn(),
  deleteRecordingMock: vi.fn(),
  discardRecordingMock: vi.fn(),
  getMock: vi.fn(),
  organizeMock: vi.fn(),
  releaseAudioUrlMock: vi.fn(),
  reserveRecordingTargetMock: vi.fn(),
  resolveAudioUrlMock: vi.fn(),
  resolveTemporaryRecordingUrlMock: vi.fn(),
  resolveTemporaryAudioUrlMock: vi.fn(),
  transcribeMock: vi.fn(),
  writeRecordingMock: vi.fn()
}))

vi.mock('@application', () => ({
  application: { get: getMock }
}))

import { transcriptionHandlers } from '../transcription'

describe('transcription handlers', () => {
  beforeEach(() => {
    getMock.mockReset().mockReturnValue({
      cancel: cancelMock,
      deleteRecording: deleteRecordingMock,
      discardRecording: discardRecordingMock,
      organize: organizeMock,
      releaseAudioUrl: releaseAudioUrlMock,
      reserveRecordingTarget: reserveRecordingTargetMock,
      resolveAudioUrl: resolveAudioUrlMock,
      resolveTemporaryRecordingUrl: resolveTemporaryRecordingUrlMock,
      resolveTemporaryAudioUrl: resolveTemporaryAudioUrlMock,
      transcribe: transcribeMock,
      writeRecording: writeRecordingMock
    })
    reserveRecordingTargetMock.mockReset()
    resolveAudioUrlMock.mockReset()
    resolveTemporaryRecordingUrlMock.mockReset()
    resolveTemporaryAudioUrlMock.mockReset()
    cancelMock.mockReset()
    deleteRecordingMock.mockReset()
    discardRecordingMock.mockReset()
    organizeMock.mockReset()
    releaseAudioUrlMock.mockReset()
    transcribeMock.mockReset()
    writeRecordingMock.mockReset()
  })

  it('creates a recording target for the WAV recording format', async () => {
    reserveRecordingTargetMock.mockReturnValue({
      recordingId: 'record-1',
      suggestedName: 'record-1.wav'
    })

    await expect(
      transcriptionHandlers['transcription.recording.create']({ extension: '.wav' }, {} as never)
    ).resolves.toEqual({
      recordingId: 'record-1',
      suggestedName: 'record-1.wav'
    })
    expect(getMock).toHaveBeenCalledWith('TranscriptionService')
    expect(reserveRecordingTargetMock).toHaveBeenCalledWith('.wav')
  })

  it('resolves a record playback URL through the transcription service', async () => {
    resolveAudioUrlMock.mockReturnValue({
      url: 'cherry-media://audio/playback-1',
      missing: false,
      playbackId: 'playback-1'
    })

    await expect(
      transcriptionHandlers['transcription.audio_url.resolve']({ recordId: 'record-1' }, {} as never)
    ).resolves.toEqual({
      url: 'cherry-media://audio/playback-1',
      missing: false,
      playbackId: 'playback-1'
    })
    expect(getMock).toHaveBeenCalledWith('TranscriptionService')
    expect(resolveAudioUrlMock).toHaveBeenCalledWith('record-1')
  })

  it('resolves a selected import through the transcription service', async () => {
    resolveTemporaryAudioUrlMock.mockReturnValue({
      url: 'cherry-media://audio/import-1',
      missing: false,
      playbackId: 'import-1'
    })

    await expect(
      transcriptionHandlers['transcription.audio_url.preview'](
        { audioPath: '/imported/audio.m4a' },
        { senderId: 'window-1' }
      )
    ).resolves.toEqual({ url: 'cherry-media://audio/import-1', missing: false, playbackId: 'import-1' })
    expect(resolveTemporaryAudioUrlMock).toHaveBeenCalledWith('/imported/audio.m4a')
  })

  it('resolves a selected recording through the transcription service', async () => {
    resolveTemporaryRecordingUrlMock.mockReturnValue({
      url: 'cherry-media://audio/recording-1',
      missing: false,
      playbackId: 'playback-1'
    })

    await expect(
      transcriptionHandlers['transcription.audio_url.preview']({ recordingId: 'recording-1' }, { senderId: 'window-1' })
    ).resolves.toEqual({ url: 'cherry-media://audio/recording-1', missing: false, playbackId: 'playback-1' })
    expect(resolveTemporaryRecordingUrlMock).toHaveBeenCalledWith('recording-1')
  })

  it('releases selected import playback URLs through the transcription service', async () => {
    await transcriptionHandlers['transcription.audio_url.release'](
      { playbackId: 'transcription-playback-1' },
      { senderId: 'window-1' }
    )
    expect(releaseAudioUrlMock).toHaveBeenCalledWith('transcription-playback-1')
  })

  it('writes PCM WAV bytes only through the transcription service', async () => {
    const wavBytes = new Uint8Array([1, 2, 3])
    writeRecordingMock.mockReturnValue({ recordingId: 'record-1' })

    await expect(
      transcriptionHandlers['transcription.recording.write'](
        { recordingId: 'record-1', wavBytes },
        { senderId: 'window-1' }
      )
    ).resolves.toEqual({ recordingId: 'record-1' })
    expect(writeRecordingMock).toHaveBeenCalledWith('record-1', wavBytes)
  })

  it('deletes a managed recording through the transcription service', async () => {
    await transcriptionHandlers['transcription.recording.delete'](
      { recordId: 'record-1', deleteAudio: true },
      { senderId: 'window-1' }
    )
    expect(deleteRecordingMock).toHaveBeenCalledWith('record-1', true)
  })

  it('discards an unsaved managed recording through the transcription service', async () => {
    await transcriptionHandlers['transcription.recording.discard'](
      { recordingId: 'recording-1' },
      { senderId: 'window-1' }
    )
    expect(discardRecordingMock).toHaveBeenCalledWith('recording-1')
  })

  it('delegates transcription commands with the managed sender id', async () => {
    transcribeMock.mockResolvedValue({
      record: { id: 'record-1', audioManaged: true, audioPath: '/managed/record-1.wav' },
      result: { id: 'result-1' }
    })
    await expect(
      transcriptionHandlers['transcription.transcribe'](
        {
          jobId: 'job-1',
          audioPath: '/audio.wav',
          sourceType: 'file',
          language: 'auto',
          backend: { backend: 'local_whisper' }
        },
        { senderId: 'window-1' }
      )
    ).resolves.toMatchObject({ record: { id: 'record-1', audioPath: null, audioManaged: true } })
    await transcriptionHandlers['transcription.cancel']({ jobId: 'job-1' }, { senderId: 'window-1' })
    await transcriptionHandlers['transcription.organize'](
      {
        jobId: 'job-2',
        recordId: 'record-1',
        templateId: null,
        prompt: 'summarize'
      },
      { senderId: 'window-1' }
    )

    expect(transcribeMock).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-1' }), 'window-1')
    expect(cancelMock).toHaveBeenCalledWith('job-1')
    expect(organizeMock).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-2' }), 'window-1')
  })

  it('accepts persisted record ids for re-transcription without renderer audio paths', async () => {
    transcribeMock.mockResolvedValue({
      record: { id: 'record-1', audioManaged: true, audioPath: '/managed/record-1.wav' },
      result: { id: 'result-1' }
    })

    await expect(
      transcriptionHandlers['transcription.transcribe'](
        {
          jobId: 'job-1',
          recordId: 'record-1',
          sourceType: 'recording',
          language: 'auto',
          backend: { backend: 'local_whisper' }
        },
        { senderId: 'window-1' }
      )
    ).resolves.toMatchObject({ record: { audioPath: null } })
    expect(transcribeMock).toHaveBeenCalledWith(
      {
        jobId: 'job-1',
        recordId: 'record-1',
        sourceType: 'recording',
        language: 'auto',
        backend: { backend: 'local_whisper' }
      },
      'window-1'
    )
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
