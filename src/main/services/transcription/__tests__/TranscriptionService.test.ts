import { application } from '@application'
import { BaseService } from '@main/core/lifecycle'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createRecordMock,
  createRecordWithResultMock,
  deleteAudioMock,
  discardClaimedRecordingMock,
  discardRecordingMock,
  getRecordMock,
  claimRecordingMock,
  releaseAudioUrlMock,
  resolveTemporaryRecordingUrlMock,
  reserveRecordingTargetMock,
  resolveAudioUrlMock,
  resolveTemporaryAudioUrlMock,
  saveResultMock,
  adoptRecordingMock,
  updateRecordMock,
  writeRecordingMock
} = vi.hoisted(() => ({
  createRecordMock: vi.fn(),
  createRecordWithResultMock: vi.fn(),
  deleteAudioMock: vi.fn(),
  discardClaimedRecordingMock: vi.fn(),
  discardRecordingMock: vi.fn(),
  getRecordMock: vi.fn(),
  claimRecordingMock: vi.fn(),
  releaseAudioUrlMock: vi.fn(),
  resolveTemporaryRecordingUrlMock: vi.fn(),
  reserveRecordingTargetMock: vi.fn(),
  resolveAudioUrlMock: vi.fn(),
  resolveTemporaryAudioUrlMock: vi.fn(),
  saveResultMock: vi.fn(),
  adoptRecordingMock: vi.fn(),
  updateRecordMock: vi.fn(),
  writeRecordingMock: vi.fn()
}))

vi.mock('@data/services/TranscriptionHistoryService', () => ({
  transcriptionHistoryService: {
    createRecord: createRecordMock,
    createRecordWithResult: createRecordWithResultMock,
    getRecord: getRecordMock,
    saveResult: saveResultMock,
    updateRecord: updateRecordMock
  }
}))

vi.mock('../TranscriptionAudioStore', () => ({
  transcriptionAudioStore: {
    reserveRecordingTarget: reserveRecordingTargetMock,
    resolveAudioUrl: resolveAudioUrlMock,
    releaseAudioUrl: releaseAudioUrlMock,
    claimRecording: claimRecordingMock,
    discardRecording: discardRecordingMock,
    discardClaimedRecording: discardClaimedRecordingMock,
    adoptRecording: adoptRecordingMock,
    resolveTemporaryRecordingUrl: resolveTemporaryRecordingUrlMock,
    resolveTemporaryAudioUrl: resolveTemporaryAudioUrlMock,
    writeRecording: writeRecordingMock,
    deleteAudio: deleteAudioMock
  }
}))

import { TranscriptionService } from '../TranscriptionService'

describe('TranscriptionService', () => {
  beforeEach(() => {
    BaseService.resetInstances()
    getRecordMock.mockReset()
    claimRecordingMock.mockReset()
    reserveRecordingTargetMock.mockReset()
    resolveAudioUrlMock.mockReset()
    releaseAudioUrlMock.mockReset()
    discardClaimedRecordingMock.mockReset()
    discardRecordingMock.mockReset()
    adoptRecordingMock.mockReset()
    resolveTemporaryAudioUrlMock.mockReset()
    resolveTemporaryRecordingUrlMock.mockReset()
    writeRecordingMock.mockReset()
    createRecordMock.mockReset()
    createRecordWithResultMock.mockReset()
    deleteAudioMock.mockReset()
    saveResultMock.mockReset()
    updateRecordMock.mockReset()
  })

  it('owns recording target reservation', () => {
    const target = { recordingId: 'record-1', suggestedName: 'record-1.wav' }
    reserveRecordingTargetMock.mockReturnValue(target)

    expect(new TranscriptionService().reserveRecordingTarget('.wav')).toBe(target)
    expect(reserveRecordingTargetMock).toHaveBeenCalledWith('.wav')
  })

  it('owns writing PCM WAV bytes to a reserved recording target', () => {
    const bytes = new Uint8Array([1, 2, 3])
    writeRecordingMock.mockReturnValue({ recordingId: 'record-1' })

    expect(new TranscriptionService().writeRecording('record-1', bytes)).toEqual({ recordingId: 'record-1' })
    expect(writeRecordingMock).toHaveBeenCalledWith('record-1', bytes)
  })

  it('loads the persisted record before resolving its playback URL', () => {
    const record = { id: 'record-1', audioPath: '/managed/record-1.webm' }
    getRecordMock.mockReturnValue({ record, result: null })
    resolveAudioUrlMock.mockReturnValue({ url: 'cherry-media://audio/record-1', missing: false })

    expect(new TranscriptionService().resolveAudioUrl('record-1')).toEqual({
      url: 'cherry-media://audio/record-1',
      missing: false
    })
    expect(getRecordMock).toHaveBeenCalledWith('record-1')
    expect(resolveAudioUrlMock).toHaveBeenCalledWith(record)
  })

  it('resolves a selected import through a temporary playback URL', () => {
    resolveTemporaryAudioUrlMock.mockReturnValue({
      url: 'cherry-media://audio/import-1',
      missing: false,
      playbackId: 'transcription-playback-1'
    })

    expect(new TranscriptionService().resolveTemporaryAudioUrl('/imported/audio.m4a')).toEqual({
      url: 'cherry-media://audio/import-1',
      missing: false,
      playbackId: 'transcription-playback-1'
    })
    expect(resolveTemporaryAudioUrlMock).toHaveBeenCalledWith('/imported/audio.m4a')
  })

  it('owns temporary playback URL release', () => {
    new TranscriptionService().releaseAudioUrl('transcription-playback-1')

    expect(releaseAudioUrlMock).toHaveBeenCalledWith('transcription-playback-1')
  })

  it('resolves a selected recording through a temporary playback URL', () => {
    resolveTemporaryRecordingUrlMock.mockReturnValue({
      url: 'cherry-media://audio/recording-1',
      missing: false,
      playbackId: 'transcription-playback-1'
    })

    expect(new TranscriptionService().resolveTemporaryRecordingUrl('recording-1')).toEqual({
      url: 'cherry-media://audio/recording-1',
      missing: false,
      playbackId: 'transcription-playback-1'
    })
    expect(resolveTemporaryRecordingUrlMock).toHaveBeenCalledWith('recording-1')
  })

  it('deletes only the selected managed recording on request', () => {
    const record = { id: 'record-1', audioManaged: true, audioPath: '/managed/record-1.wav' }
    getRecordMock.mockReturnValue({ record, result: null })

    new TranscriptionService().deleteRecording('record-1', true)

    expect(deleteAudioMock).toHaveBeenCalledWith(record, { deleteAudio: true })
  })

  it('selects the requested backend, sends progress, and persists its successful result', async () => {
    const local = {
      transcribe: vi.fn().mockResolvedValue({
        text: 'hello',
        segments: [{ startMs: 0, endMs: 500, text: 'hello' }],
        language: 'en',
        durationMs: 500,
        backend: 'local_whisper'
      })
    }
    const record = { id: '018f0f37-8a1c-7f50-8000-000000000001', status: 'ready' }
    const result = { id: '018f0f37-8a1c-7f50-8000-000000000002', recordId: record.id }
    createRecordWithResultMock.mockReturnValue({ record, result })

    const service = new TranscriptionService({
      local,
      provider: { transcribe: vi.fn() },
      custom: { transcribe: vi.fn() }
    })
    await expect(
      service.transcribe(
        {
          jobId: 'job-1',
          audioPath: '/audio.wav',
          sourceType: 'file',
          language: 'auto',
          backend: { backend: 'local_whisper' }
        },
        'window-1'
      )
    ).resolves.toEqual({ record, result })

    expect(local.transcribe).toHaveBeenCalledWith('/audio.wav', 'auto', expect.any(AbortSignal))
    expect(application.get('IpcApiService').send).toHaveBeenCalledWith(
      'window-1',
      'transcription.progress',
      expect.objectContaining({ jobId: 'job-1', stage: 'preparing' })
    )
    expect(createRecordWithResultMock).toHaveBeenCalledWith(
      expect.objectContaining({ audioPath: '/audio.wav' }),
      expect.objectContaining({ transcriptText: 'hello' })
    )
  })

  it('resolves app-managed recordings before transcription without renderer paths', async () => {
    const local = {
      transcribe: vi.fn().mockResolvedValue({
        text: 'hello',
        segments: [{ startMs: 0, endMs: 500, text: 'hello' }],
        durationMs: 500,
        backend: 'local_whisper'
      })
    }
    const record = { id: '018f0f37-8a1c-7f50-8000-000000000003', status: 'ready' }
    const result = { id: '018f0f37-8a1c-7f50-8000-000000000004', recordId: record.id }
    claimRecordingMock.mockReturnValue('/managed/recording.wav')
    createRecordWithResultMock.mockReturnValue({ record, result })

    const service = new TranscriptionService({
      local,
      provider: { transcribe: vi.fn() },
      custom: { transcribe: vi.fn() }
    })

    await service.transcribe(
      {
        jobId: 'job-1',
        recordingId: 'recording-1',
        sourceType: 'recording',
        language: 'auto',
        backend: { backend: 'local_whisper' }
      },
      'window-1'
    )

    expect(local.transcribe).toHaveBeenCalledWith('/managed/recording.wav', 'auto', expect.any(AbortSignal))
    expect(createRecordWithResultMock).toHaveBeenCalledWith(
      expect.objectContaining({ audioPath: '/managed/recording.wav' }),
      expect.objectContaining({ transcriptText: 'hello' })
    )
    expect(adoptRecordingMock).toHaveBeenCalledWith('recording-1')
    expect(discardClaimedRecordingMock).not.toHaveBeenCalled()
  })

  it('cleans up a claimed recording when transcription fails before persistence', async () => {
    const local = {
      transcribe: vi.fn().mockRejectedValue(new Error('decode failed'))
    }
    claimRecordingMock.mockReturnValue('/managed/recording.wav')
    const service = new TranscriptionService({
      local,
      provider: { transcribe: vi.fn() },
      custom: { transcribe: vi.fn() }
    })

    await expect(
      service.transcribe(
        {
          jobId: 'job-1',
          recordingId: 'recording-1',
          sourceType: 'recording',
          language: 'auto',
          backend: { backend: 'local_whisper' }
        },
        'window-1'
      )
    ).rejects.toThrow('decode failed')

    expect(claimRecordingMock).toHaveBeenCalledWith('recording-1')
    expect(discardClaimedRecordingMock).toHaveBeenCalledWith('recording-1')
    expect(adoptRecordingMock).not.toHaveBeenCalled()
  })

  it('resolves persisted records before re-transcription without renderer paths', async () => {
    const local = {
      transcribe: vi.fn().mockResolvedValue({
        text: 'hello again',
        segments: [{ startMs: 0, endMs: 500, text: 'hello again' }],
        durationMs: 500,
        backend: 'local_whisper'
      })
    }
    const record = { id: '018f0f37-8a1c-7f50-8000-000000000005', audioPath: '/managed/recording.wav', status: 'ready' }
    const result = { id: '018f0f37-8a1c-7f50-8000-000000000006', recordId: record.id }
    getRecordMock.mockReturnValue({ record, result: null })
    updateRecordMock.mockReturnValue(record)
    saveResultMock.mockReturnValue(result)

    const service = new TranscriptionService({
      local,
      provider: { transcribe: vi.fn() },
      custom: { transcribe: vi.fn() }
    })

    await service.transcribe(
      {
        jobId: 'job-1',
        recordId: record.id,
        sourceType: 'recording',
        language: 'auto',
        backend: { backend: 'local_whisper' }
      },
      'window-1'
    )

    expect(local.transcribe).toHaveBeenCalledWith('/managed/recording.wav', 'auto', expect.any(AbortSignal))
    expect(updateRecordMock).toHaveBeenCalledWith(record.id, expect.objectContaining({ status: 'ready' }))
  })

  it('unloads local inference and does not save a stale completion after cancellation', async () => {
    let finishInference: (value: {
      text: string
      segments: never[]
      durationMs: number
      backend: 'local_whisper'
    }) => void = () => undefined
    const local = {
      transcribe: vi.fn(
        () =>
          new Promise<{
            text: string
            segments: never[]
            durationMs: number
            backend: 'local_whisper'
          }>((resolve) => {
            finishInference = resolve
          })
      ),
      unload: vi.fn().mockResolvedValue(undefined)
    }
    const service = new TranscriptionService({
      local: local as never,
      provider: { transcribe: vi.fn() },
      custom: { transcribe: vi.fn() }
    })
    const pending = service.transcribe(
      {
        jobId: 'job-2',
        audioPath: '/audio.wav',
        sourceType: 'file',
        language: 'auto',
        backend: { backend: 'local_whisper' }
      },
      'window-1'
    )
    await service.cancel('job-2')
    finishInference({ text: 'stale', segments: [], durationMs: 100, backend: 'local_whisper' })

    await expect(pending).rejects.toBeDefined()
    expect(local.unload).toHaveBeenCalledOnce()
    expect(saveResultMock).not.toHaveBeenCalled()
    expect(createRecordWithResultMock).not.toHaveBeenCalled()
  })
})
