import { BaseService } from '@main/core/lifecycle'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getRecordMock, reserveRecordingTargetMock, resolveAudioUrlMock } = vi.hoisted(() => ({
  getRecordMock: vi.fn(),
  reserveRecordingTargetMock: vi.fn(),
  resolveAudioUrlMock: vi.fn()
}))

vi.mock('@data/services/TranscriptionHistoryService', () => ({
  transcriptionHistoryService: { getRecord: getRecordMock }
}))

vi.mock('../TranscriptionAudioStore', () => ({
  transcriptionAudioStore: {
    reserveRecordingTarget: reserveRecordingTargetMock,
    resolveAudioUrl: resolveAudioUrlMock
  }
}))

import { TranscriptionService } from '../TranscriptionService'

describe('TranscriptionService', () => {
  beforeEach(() => {
    BaseService.resetInstances()
    getRecordMock.mockReset()
    reserveRecordingTargetMock.mockReset()
    resolveAudioUrlMock.mockReset()
  })

  it('owns recording target reservation', () => {
    const target = { recordingId: 'record-1', filePath: '/managed/record-1.webm', suggestedName: 'record-1.webm' }
    reserveRecordingTargetMock.mockReturnValue(target)

    expect(new TranscriptionService().reserveRecordingTarget('.webm')).toBe(target)
    expect(reserveRecordingTargetMock).toHaveBeenCalledWith('.webm')
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
})
