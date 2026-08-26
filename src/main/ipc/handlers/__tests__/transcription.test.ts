import { beforeEach, describe, expect, it, vi } from 'vitest'

const { reserveRecordingTargetMock, resolveAudioUrlMock, getRecordMock } = vi.hoisted(() => ({
  reserveRecordingTargetMock: vi.fn(),
  resolveAudioUrlMock: vi.fn(),
  getRecordMock: vi.fn()
}))

vi.mock('@main/services/transcription/TranscriptionAudioStore', () => ({
  transcriptionAudioStore: {
    reserveRecordingTarget: reserveRecordingTargetMock,
    resolveAudioUrl: resolveAudioUrlMock
  }
}))

vi.mock('@data/services/TranscriptionHistoryService', () => ({
  transcriptionHistoryService: { getRecord: getRecordMock }
}))

import { transcriptionHandlers } from '../transcription'

describe('transcription handlers', () => {
  beforeEach(() => {
    reserveRecordingTargetMock.mockReset()
    resolveAudioUrlMock.mockReset()
    getRecordMock.mockReset()
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
  })

  it('resolves a record playback URL from the persisted audio path', async () => {
    const record = { id: 'record-1', audioPath: '/managed/record-1.webm' }
    getRecordMock.mockReturnValue({ record, result: null })
    resolveAudioUrlMock.mockReturnValue({ url: 'cherry-media://audio/record-1', missing: false })

    await expect(
      transcriptionHandlers['transcription.audio_url.resolve']({ recordId: 'record-1' }, {} as never)
    ).resolves.toEqual({
      url: 'cherry-media://audio/record-1',
      missing: false
    })
    expect(getRecordMock).toHaveBeenCalledWith('record-1')
    expect(resolveAudioUrlMock).toHaveBeenCalledWith(record)
  })
})
