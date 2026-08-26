import { existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'

import { application } from '@application'
import { MediaKind } from '@main/services/mediaProtocol'
import type { TranscriptionRecord } from '@shared/data/types/transcription'
import { v7 as uuidv7 } from 'uuid'

const AUDIO_MIME_TYPES: Record<string, string> = {
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.mp4': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm'
}

export class TranscriptionAudioStore {
  reserveRecordingTarget(extension: string): { recordingId: string; filePath: string; suggestedName: string } {
    const recordingId = uuidv7()
    const suggestedName = `${recordingId}${extension}`
    const recordingsDir = application.getPath('feature.transcription.recordings')
    mkdirSync(recordingsDir, { recursive: true })
    return { recordingId, filePath: path.join(recordingsDir, suggestedName), suggestedName }
  }

  resolveAudioUrl(record: TranscriptionRecord): { url: string | null; missing: boolean } {
    if (!existsSync(record.audioPath)) return { url: null, missing: true }

    application
      .get('MediaProtocolService')
      .storeFile(MediaKind.Audio, record.id, record.audioPath, getAudioMimeType(record.audioPath))
    return { url: `cherry-media://audio/${record.id}`, missing: false }
  }

  deleteAudio(record: TranscriptionRecord, options: { deleteAudio?: boolean } = {}): void {
    application.get('MediaProtocolService').remove(MediaKind.Audio, record.id)
    if (options.deleteAudio && record.audioManaged && this.isManagedRecordingPath(record.audioPath)) {
      rmSync(record.audioPath, { force: true })
    }
  }

  private isManagedRecordingPath(filePath: string): boolean {
    const relativePath = path.relative(application.getPath('feature.transcription.recordings'), filePath)
    return relativePath !== '' && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath)
  }
}

function getAudioMimeType(filePath: string): string {
  return AUDIO_MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}

export const transcriptionAudioStore = new TranscriptionAudioStore()
