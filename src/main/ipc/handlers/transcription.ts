import { transcriptionHistoryService } from '@data/services/TranscriptionHistoryService'
import { transcriptionAudioStore } from '@main/services/transcription/TranscriptionAudioStore'
import { IpcError } from '@shared/ipc/errors/IpcError'
import { transcriptionErrorCodes } from '@shared/ipc/errors/transcription'
import type { transcriptionRequestSchemas } from '@shared/ipc/schemas/transcription'
import type { IpcHandlersFor } from '@shared/ipc/types'

function notImplemented(): never {
  throw new IpcError(transcriptionErrorCodes.TRANSCRIPTION_NOT_IMPLEMENTED, 'Transcription is not implemented yet')
}

export const transcriptionHandlers: IpcHandlersFor<typeof transcriptionRequestSchemas> = {
  'transcription.recording.create': async ({ extension }) => transcriptionAudioStore.reserveRecordingTarget(extension),
  'transcription.audio_url.resolve': async ({ recordId }) => {
    const { record } = transcriptionHistoryService.getRecord(recordId)
    return transcriptionAudioStore.resolveAudioUrl(record)
  },
  'transcription.transcribe': async () => notImplemented(),
  'transcription.cancel': async () => notImplemented(),
  'transcription.organize': async () => notImplemented()
}
