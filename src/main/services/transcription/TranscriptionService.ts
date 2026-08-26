import { transcriptionHistoryService } from '@data/services/TranscriptionHistoryService'
import { BaseService, DependsOn, Injectable, Phase, ServicePhase } from '@main/core/lifecycle'

import { transcriptionAudioStore } from './TranscriptionAudioStore'

@Injectable('TranscriptionService')
@ServicePhase(Phase.WhenReady)
@DependsOn(['MediaProtocolService'])
export class TranscriptionService extends BaseService {
  reserveRecordingTarget(extension: string) {
    return transcriptionAudioStore.reserveRecordingTarget(extension)
  }

  resolveAudioUrl(recordId: string) {
    const { record } = transcriptionHistoryService.getRecord(recordId)
    return transcriptionAudioStore.resolveAudioUrl(record)
  }
}
