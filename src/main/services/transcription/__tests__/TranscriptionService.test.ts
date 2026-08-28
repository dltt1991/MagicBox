import { application } from '@application'
import { BaseService } from '@main/core/lifecycle'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createRecordMock,
  deleteAudioMock,
  getRecordMock,
  reserveRecordingTargetMock,
  resolveAudioUrlMock,
  resolveTemporaryAudioUrlMock,
  saveResultMock,
  updateRecordMock,
  writeRecordingMock
} = vi.hoisted(() => ({
  createRecordMock: vi.fn(),
  deleteAudioMock: vi.fn(),
  getRecordMock: vi.fn(),
  reserveRecordingTargetMock: vi.fn(),
  resolveAudioUrlMock: vi.fn(),
  resolveTemporaryAudioUrlMock: vi.fn(),
  saveResultMock: vi.fn(),
  updateRecordMock: vi.fn(),
  writeRecordingMock: vi.fn()
}))

vi.mock('@data/services/TranscriptionHistoryService', () => ({
  transcriptionHistoryService: {
    createRecord: createRecordMock,
    getRecord: getRecordMock,
    saveResult: saveResultMock,
    updateRecord: updateRecordMock
  }
}))

vi.mock('../TranscriptionAudioStore', () => ({
  transcriptionAudioStore: {
    reserveRecordingTarget: reserveRecordingTargetMock,
    resolveAudioUrl: resolveAudioUrlMock,
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
    reserveRecordingTargetMock.mockReset()
    resolveAudioUrlMock.mockReset()
    resolveTemporaryAudioUrlMock.mockReset()
    writeRecordingMock.mockReset()
    createRecordMock.mockReset()
    deleteAudioMock.mockReset()
    saveResultMock.mockReset()
    updateRecordMock.mockReset()
  })

  it('owns recording target reservation', () => {
    const target = { recordingId: 'record-1', filePath: '/managed/record-1.wav', suggestedName: 'record-1.wav' }
    reserveRecordingTargetMock.mockReturnValue(target)

    expect(new TranscriptionService().reserveRecordingTarget('.wav')).toBe(target)
    expect(reserveRecordingTargetMock).toHaveBeenCalledWith('.wav')
  })

  it('owns writing PCM WAV bytes to a reserved recording target', () => {
    const bytes = new Uint8Array([1, 2, 3])
    writeRecordingMock.mockReturnValue({ filePath: '/managed/record-1.wav' })

    expect(new TranscriptionService().writeRecording('record-1', bytes)).toEqual({ filePath: '/managed/record-1.wav' })
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
    resolveTemporaryAudioUrlMock.mockReturnValue({ url: 'cherry-media://audio/import-1', missing: false })

    expect(new TranscriptionService().resolveTemporaryAudioUrl('/imported/audio.m4a')).toEqual({
      url: 'cherry-media://audio/import-1',
      missing: false
    })
    expect(resolveTemporaryAudioUrlMock).toHaveBeenCalledWith('/imported/audio.m4a')
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
    createRecordMock.mockReturnValue(record)
    saveResultMock.mockReturnValue(result)

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
    expect(saveResultMock).toHaveBeenCalledWith(record.id, expect.objectContaining({ transcriptText: 'hello' }))
  })

  it('does not save a successful result after its job is canceled', async () => {
    const local = {
      transcribe: vi.fn(
        (_audioPath: string, _language: string, signal?: AbortSignal) =>
          new Promise<never>((_resolve, reject) => signal!.addEventListener('abort', () => reject(signal!.reason)))
      )
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
    service.cancel('job-2')

    await expect(pending).rejects.toBeDefined()
    expect(saveResultMock).not.toHaveBeenCalled()
    expect(createRecordMock).not.toHaveBeenCalled()
  })
})
