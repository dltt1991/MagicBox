import { application } from '@application'
import { BaseService } from '@main/core/lifecycle'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createRecordMock,
  deleteAudioMock,
  getRecordMock,
  getRecordingPathMock,
  releaseTemporaryAudioUrlMock,
  resolveTemporaryRecordingUrlMock,
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
  getRecordingPathMock: vi.fn(),
  releaseTemporaryAudioUrlMock: vi.fn(),
  resolveTemporaryRecordingUrlMock: vi.fn(),
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
    releaseTemporaryAudioUrl: releaseTemporaryAudioUrlMock,
    resolveTemporaryRecordingUrl: resolveTemporaryRecordingUrlMock,
    resolveTemporaryAudioUrl: resolveTemporaryAudioUrlMock,
    getRecordingPath: getRecordingPathMock,
    writeRecording: writeRecordingMock,
    deleteAudio: deleteAudioMock
  }
}))

import { TranscriptionService } from '../TranscriptionService'

describe('TranscriptionService', () => {
  beforeEach(() => {
    BaseService.resetInstances()
    getRecordMock.mockReset()
    getRecordingPathMock.mockReset()
    reserveRecordingTargetMock.mockReset()
    resolveAudioUrlMock.mockReset()
    releaseTemporaryAudioUrlMock.mockReset()
    resolveTemporaryAudioUrlMock.mockReset()
    resolveTemporaryRecordingUrlMock.mockReset()
    writeRecordingMock.mockReset()
    createRecordMock.mockReset()
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
      previewId: 'import-1'
    })

    expect(new TranscriptionService().resolveTemporaryAudioUrl('/imported/audio.m4a')).toEqual({
      url: 'cherry-media://audio/import-1',
      missing: false,
      previewId: 'import-1'
    })
    expect(resolveTemporaryAudioUrlMock).toHaveBeenCalledWith('/imported/audio.m4a')
  })

  it('owns temporary playback URL release', () => {
    new TranscriptionService().releaseTemporaryAudioUrl('transcription-preview-1')

    expect(releaseTemporaryAudioUrlMock).toHaveBeenCalledWith('transcription-preview-1')
  })

  it('resolves a selected recording through a temporary playback URL', () => {
    resolveTemporaryRecordingUrlMock.mockReturnValue({
      url: 'cherry-media://audio/recording-1',
      missing: false,
      previewId: 'preview-1'
    })

    expect(new TranscriptionService().resolveTemporaryRecordingUrl('recording-1')).toEqual({
      url: 'cherry-media://audio/recording-1',
      missing: false,
      previewId: 'preview-1'
    })
    expect(resolveTemporaryRecordingUrlMock).toHaveBeenCalledWith('recording-1')
  })

  it('deletes only the selected managed recording on request', () => {
    const record = { id: 'record-1', audioManaged: true, audioPath: '/managed/record-1.wav' }
    getRecordMock.mockReturnValue({ record, result: null })

    new TranscriptionService().deleteRecording('record-1', true)

    expect(deleteAudioMock).toHaveBeenCalledWith(record, { deleteAudio: true })
  })

  it('persists an imported transcription, restores its organization, and resolves playback', async () => {
    const audioFixturePath = '/fixtures/customer-call.m4a'
    const segments = [
      { startMs: 0, endMs: 600, text: 'Welcome to the call.' },
      { startMs: 600, endMs: 1500, text: 'We agreed on next steps.' }
    ]
    const local = {
      transcribe: vi.fn().mockResolvedValue({
        text: 'Welcome to the call. We agreed on next steps.',
        segments,
        language: 'en',
        durationMs: 1500,
        backend: 'local_whisper'
      })
    }
    const record = {
      id: '018f0f37-8a1c-7f50-8000-000000000001',
      audioPath: audioFixturePath,
      durationMs: 1500,
      language: 'en',
      status: 'ready'
    }
    const result = {
      id: '018f0f37-8a1c-7f50-8000-000000000002',
      recordId: record.id,
      transcriptText: 'Welcome to the call. We agreed on next steps.',
      segments,
      organizationTemplateId: null,
      organizationPromptSnapshot: null,
      organizationOutput: null
    }
    const organizedResult = {
      ...result,
      organizationTemplateId: 'builtin-meeting-minutes',
      organizationPromptSnapshot: 'Summarize {{transcript}}',
      organizationOutput: 'Next steps: send the proposal.'
    }
    let latestResult = result
    const organizer = {
      organize: vi.fn().mockImplementation(async () => {
        latestResult = organizedResult
        return { result: organizedResult.organizationOutput }
      })
    }
    createRecordMock.mockReturnValue(record)
    saveResultMock.mockReturnValue(result)
    getRecordMock.mockImplementation(() => ({ record, result: latestResult }))
    resolveAudioUrlMock.mockReturnValue({ url: `cherry-media://audio/${record.id}`, missing: false })

    const service = new TranscriptionService({
      local,
      provider: { transcribe: vi.fn() },
      custom: { transcribe: vi.fn() },
      organizer
    })

    await expect(
      service.transcribe(
        {
          jobId: 'job-1',
          audioPath: audioFixturePath,
          sourceType: 'file',
          language: 'auto',
          backend: { backend: 'local_whisper' }
        },
        'window-1'
      )
    ).resolves.toEqual({ record, result })

    expect(local.transcribe).toHaveBeenCalledWith(audioFixturePath, 'auto', expect.any(AbortSignal))
    expect(saveResultMock).toHaveBeenCalledWith(record.id, {
      transcriptText: result.transcriptText,
      segments,
      organizationTemplateId: null,
      organizationPromptSnapshot: null,
      organizationOutput: null
    })
    expect(service.resolveAudioUrl(record.id)).toEqual({ url: `cherry-media://audio/${record.id}`, missing: false })

    await expect(
      service.organize(
        {
          jobId: 'job-2',
          recordId: record.id,
          templateId: 'builtin-meeting-minutes',
          prompt: 'Summarize {{transcript}}'
        },
        'window-1'
      )
    ).resolves.toEqual({ result: organizedResult })
    expect(organizer.organize).toHaveBeenCalledWith(
      expect.objectContaining({
        recordId: record.id,
        transcriptText: result.transcriptText,
        segments,
        language: 'en',
        durationMs: 1500,
        templateId: 'builtin-meeting-minutes'
      })
    )
    expect(application.get('IpcApiService').send).toHaveBeenCalledWith(
      'window-1',
      'transcription.progress',
      expect.objectContaining({ jobId: 'job-1', stage: 'preparing' })
    )
    expect(getRecordMock).toHaveBeenLastCalledWith(record.id)
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
    getRecordingPathMock.mockReturnValue('/managed/recording.wav')
    createRecordMock.mockReturnValue(record)
    saveResultMock.mockReturnValue(result)

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
    expect(createRecordMock).toHaveBeenCalledWith(expect.objectContaining({ audioPath: '/managed/recording.wav' }))
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
