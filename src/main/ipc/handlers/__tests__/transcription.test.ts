import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getMock, reserveRecordingTargetMock, resolveAudioUrlMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  reserveRecordingTargetMock: vi.fn(),
  resolveAudioUrlMock: vi.fn()
}))

vi.mock('@application', () => ({
  application: { get: getMock }
}))

import { transcriptionHandlers } from '../transcription'

describe('transcription handlers', () => {
  beforeEach(() => {
    getMock.mockReset().mockReturnValue({
      reserveRecordingTarget: reserveRecordingTargetMock,
      resolveAudioUrl: resolveAudioUrlMock
    })
    reserveRecordingTargetMock.mockReset()
    resolveAudioUrlMock.mockReset()
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
})
