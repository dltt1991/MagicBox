import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
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
  private readonly reservedRecordingPaths = new Map<string, string>()

  reserveRecordingTarget(extension = '.wav'): { recordingId: string; filePath: string; suggestedName: string } {
    const recordingId = uuidv7()
    const suggestedName = `${recordingId}${extension}`
    const recordingsDir = application.getPath('feature.transcription.recordings')
    mkdirSync(recordingsDir, { recursive: true })
    const filePath = path.join(recordingsDir, suggestedName)
    this.reservedRecordingPaths.set(recordingId, filePath)
    return { recordingId, filePath, suggestedName }
  }

  writeRecording(recordingId: string, wavBytes: Uint8Array): { filePath: string } {
    const filePath = this.reservedRecordingPaths.get(recordingId)
    if (!filePath || !isPcmWav(wavBytes)) throw new Error('Recording data must be PCM WAV bytes for a reserved target')
    writeFileSync(filePath, wavBytes)
    this.reservedRecordingPaths.delete(recordingId)
    return { filePath }
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

function isPcmWav(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 44 || readTag(bytes, 0) !== 'RIFF' || readTag(bytes, 8) !== 'WAVE') return false
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 12
  let hasPcmFormat = false
  let hasData = false
  while (offset + 8 <= bytes.byteLength) {
    const size = view.getUint32(offset + 4, true)
    const bodyOffset = offset + 8
    if (bodyOffset + size > bytes.byteLength) return false
    if (readTag(bytes, offset) === 'fmt ' && size >= 16) {
      hasPcmFormat = view.getUint16(bodyOffset, true) === 1
    }
    if (readTag(bytes, offset) === 'data') hasData = true
    offset = bodyOffset + size + (size % 2)
  }
  return hasPcmFormat && hasData
}

function readTag(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4))
}

export const transcriptionAudioStore = new TranscriptionAudioStore()
