import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { application } from '@application'
import { MediaKind } from '@main/services/mediaProtocol'
import type { TranscriptionRecord } from '@shared/data/types/transcription'
import { v7 as uuidv7 } from 'uuid'

const AUDIO_MIME_TYPES: Record<string, string> = {
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.mp4': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm'
}

export class TranscriptionAudioStore {
  private readonly claimedRecordingPaths = new Map<string, string>()
  private readonly recordingPaths = new Map<string, string>()
  private readonly reservedRecordingPaths = new Map<string, string>()

  reserveRecordingTarget(extension = '.wav'): { recordingId: string; suggestedName: string } {
    const recordingId = uuidv7()
    const suggestedName = `${recordingId}${extension}`
    const recordingsDir = application.getPath('feature.transcription.recordings')
    mkdirSync(recordingsDir, { recursive: true })
    const filePath = path.join(recordingsDir, suggestedName)
    this.reservedRecordingPaths.set(recordingId, filePath)
    return { recordingId, suggestedName }
  }

  writeRecording(recordingId: string, wavBytes: Uint8Array): { recordingId: string } {
    const filePath = this.reservedRecordingPaths.get(recordingId)
    if (!filePath || !isPcmWav(wavBytes)) throw new Error('Recording data must be PCM WAV bytes for a reserved target')
    writeFileSync(filePath, wavBytes)
    this.reservedRecordingPaths.delete(recordingId)
    this.recordingPaths.set(recordingId, filePath)
    return { recordingId }
  }

  getRecordingPath(recordingId: string): string {
    const filePath = this.recordingPaths.get(recordingId)
    if (!filePath) throw new Error('Recording file is not available')
    return filePath
  }

  claimRecording(recordingId: string): string {
    const filePath = this.getRecordingPath(recordingId)
    this.recordingPaths.delete(recordingId)
    this.claimedRecordingPaths.set(recordingId, filePath)
    return filePath
  }

  resolveAudioUrl(record: TranscriptionRecord): { url: string | null; missing: boolean; playbackId: string | null } {
    if (!existsSync(record.audioPath)) return { url: null, missing: true, playbackId: null }

    return this.storeAudioUrl(record.audioPath)
  }

  resolveTemporaryAudioUrl(audioPath: string): { url: string | null; missing: boolean; playbackId: string | null } {
    if (!existsSync(audioPath) || !getAudioMimeType(audioPath)) return { url: null, missing: true, playbackId: null }
    return this.storeAudioUrl(audioPath)
  }

  resolveTemporaryRecordingUrl(recordingId: string): {
    url: string | null
    missing: boolean
    playbackId: string | null
  } {
    return this.resolveTemporaryAudioUrl(this.getRecordingPath(recordingId))
  }

  releaseAudioUrl(playbackId: string): void {
    if (playbackId.startsWith('transcription-playback-')) {
      application.get('MediaProtocolService').remove(MediaKind.Audio, playbackId)
    }
  }

  discardRecording(recordingId: string): void {
    const filePath = this.recordingPaths.get(recordingId) ?? this.reservedRecordingPaths.get(recordingId)
    this.recordingPaths.delete(recordingId)
    this.reservedRecordingPaths.delete(recordingId)
    if (filePath) rmSync(filePath, { force: true })
  }

  adoptRecording(recordingId: string): void {
    this.claimedRecordingPaths.delete(recordingId)
  }

  discardClaimedRecording(recordingId: string): void {
    const filePath = this.claimedRecordingPaths.get(recordingId)
    this.claimedRecordingPaths.delete(recordingId)
    if (filePath) rmSync(filePath, { force: true })
  }

  deleteAudio(record: TranscriptionRecord, options: { deleteAudio?: boolean } = {}): void {
    if (options.deleteAudio && record.audioManaged && this.isManagedRecordingPath(record.audioPath)) {
      rmSync(record.audioPath, { force: true })
    }
  }

  private isManagedRecordingPath(filePath: string): boolean {
    const relativePath = path.relative(application.getPath('feature.transcription.recordings'), filePath)
    return relativePath !== '' && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath)
  }

  private storeAudioUrl(audioPath: string): { url: string; missing: false; playbackId: string } {
    const playbackId = `transcription-playback-${uuidv7()}`
    application
      .get('MediaProtocolService')
      .storeFile(MediaKind.Audio, playbackId, audioPath, getAudioMimeType(audioPath) ?? 'application/octet-stream')
    return { url: `cherry-media://audio/${playbackId}`, missing: false, playbackId }
  }
}

function getAudioMimeType(filePath: string): string | null {
  return AUDIO_MIME_TYPES[path.extname(filePath).toLowerCase()] ?? null
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
