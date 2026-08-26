import { IpcError } from '@shared/ipc/errors/IpcError'
import type { transcriptionRequestSchemas } from '@shared/ipc/schemas/transcription'
import type { IpcHandlersFor } from '@shared/ipc/types'

function notImplemented(): never {
  throw new IpcError('TRANSCRIPTION_NOT_IMPLEMENTED', 'Transcription is not implemented yet')
}

export const transcriptionHandlers: IpcHandlersFor<typeof transcriptionRequestSchemas> = {
  'transcription.recording.create': async () => notImplemented(),
  'transcription.audio_url.resolve': async () => notImplemented(),
  'transcription.transcribe': async () => notImplemented(),
  'transcription.cancel': async () => notImplemented(),
  'transcription.organize': async () => notImplemented()
}
