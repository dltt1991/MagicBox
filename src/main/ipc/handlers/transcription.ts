import { application } from '@application'
import { IpcError, IpcErrorCode } from '@shared/ipc/errors/IpcError'
import type { transcriptionRequestSchemas } from '@shared/ipc/schemas/transcription'
import type { IpcContext, IpcHandlersFor, WindowId } from '@shared/ipc/types'

function requireSenderWindow(ctx: IpcContext): WindowId {
  if (!ctx.senderId)
    throw new IpcError(IpcErrorCode.FORBIDDEN_SENDER, 'Transcription requests require a managed window')
  return ctx.senderId
}

export const transcriptionHandlers: IpcHandlersFor<typeof transcriptionRequestSchemas> = {
  'transcription.recording.create': async ({ extension }) =>
    application.get('TranscriptionService').reserveRecordingTarget(extension),
  'transcription.recording.write': async ({ recordingId, wavBytes }, ctx) => {
    requireSenderWindow(ctx)
    return application.get('TranscriptionService').writeRecording(recordingId, wavBytes)
  },
  'transcription.recording.delete': async ({ recordId, deleteAudio }, ctx) => {
    requireSenderWindow(ctx)
    application.get('TranscriptionService').deleteRecording(recordId, deleteAudio)
  },
  'transcription.audio_url.resolve': async ({ recordId }) =>
    application.get('TranscriptionService').resolveAudioUrl(recordId),
  'transcription.transcribe': async (input, ctx) =>
    application.get('TranscriptionService').transcribe(input, requireSenderWindow(ctx)),
  'transcription.cancel': async ({ jobId }, ctx) => {
    requireSenderWindow(ctx)
    application.get('TranscriptionService').cancel(jobId)
  },
  'transcription.organize': async (input, ctx) =>
    application.get('TranscriptionService').organize(input, requireSenderWindow(ctx))
}
