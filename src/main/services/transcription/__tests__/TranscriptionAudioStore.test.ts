import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { TranscriptionRecord } from '@shared/data/types/transcription'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getMock, getPathMock, removeMock, storeFileMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  getPathMock: vi.fn(),
  removeMock: vi.fn(),
  storeFileMock: vi.fn()
}))

vi.mock('@application', () => ({
  application: { get: getMock, getPath: getPathMock }
}))

import { MediaKind } from '@main/services/mediaProtocol'

import { TranscriptionAudioStore } from '../TranscriptionAudioStore'

const record: TranscriptionRecord = {
  id: '018f47e4-5b8c-7abc-8def-0123456789ab',
  title: 'Recording',
  sourceType: 'recording',
  audioPath: '',
  audioManaged: true,
  durationMs: null,
  language: null,
  backend: null,
  providerId: null,
  modelId: null,
  status: 'ready',
  errorSummary: null,
  createdAt: '2026-08-26T00:00:00.000Z',
  updatedAt: '2026-08-26T00:00:00.000Z'
}

describe('TranscriptionAudioStore', () => {
  let recordingsRoot: string

  beforeEach(() => {
    recordingsRoot = mkdtempSync(path.join(tmpdir(), 'cherry-transcription-audio-'))
    getPathMock.mockReset().mockReturnValue(recordingsRoot)
    getMock.mockReset().mockReturnValue({ storeFile: storeFileMock, remove: removeMock })
    removeMock.mockReset()
    storeFileMock.mockReset()
  })

  afterEach(() => rmSync(recordingsRoot, { recursive: true, force: true }))

  it('reserves WAV recordings inside the managed recordings directory by default', () => {
    const target = new TranscriptionAudioStore().reserveRecordingTarget()

    expect(target.suggestedName).toBe(`${target.recordingId}.wav`)
    expect(target.recordingId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    expect(existsSync(recordingsRoot)).toBe(true)
  })

  it('writes PCM WAV bytes only to the matching reserved recording target', () => {
    const store = new TranscriptionAudioStore()
    const target = store.reserveRecordingTarget()
    const wav = new Uint8Array(44)
    wav.set([0x52, 0x49, 0x46, 0x46], 0)
    wav.set([0x57, 0x41, 0x56, 0x45], 8)
    wav.set([0x66, 0x6d, 0x74, 0x20], 12)
    wav.set([16, 0, 0, 0], 16)
    wav.set([1, 0, 1, 0], 20)
    wav.set([0x80, 0x3e, 0, 0], 24)
    wav.set([0, 0x7d, 0, 0], 28)
    wav.set([2, 0, 16, 0], 32)
    wav.set([0x64, 0x61, 0x74, 0x61], 36)

    expect(store.writeRecording(target.recordingId, wav)).toEqual({ recordingId: target.recordingId })
    const filePath = store.getRecordingPath(target.recordingId)
    expect(filePath).toBe(path.join(recordingsRoot, target.suggestedName))
    expect(readFileSync(filePath)).toEqual(Buffer.from(wav))
    expect(() => store.writeRecording(target.recordingId, wav)).toThrow()

    const invalidTarget = store.reserveRecordingTarget()
    expect(() => store.writeRecording(invalidTarget.recordingId, new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]))).toThrow()
    expect(() => store.getRecordingPath(invalidTarget.recordingId)).toThrow()
  })

  it('resolves a saved recording through a temporary media URL without exposing its path', () => {
    const store = new TranscriptionAudioStore()
    const target = store.reserveRecordingTarget()
    const wav = new Uint8Array(44)
    wav.set([0x52, 0x49, 0x46, 0x46], 0)
    wav.set([0x57, 0x41, 0x56, 0x45], 8)
    wav.set([0x66, 0x6d, 0x74, 0x20], 12)
    wav.set([16, 0, 0, 0], 16)
    wav.set([1, 0, 1, 0], 20)
    wav.set([0x80, 0x3e, 0, 0], 24)
    wav.set([0, 0x7d, 0, 0], 28)
    wav.set([2, 0, 16, 0], 32)
    wav.set([0x64, 0x61, 0x74, 0x61], 36)
    store.writeRecording(target.recordingId, wav)

    const result = store.resolveTemporaryRecordingUrl(target.recordingId)

    expect(result).toEqual({
      url: expect.stringMatching(/^cherry-media:\/\/audio\//),
      missing: false,
      previewId: expect.stringMatching(/^transcription-preview-/)
    })
    expect(result.url).not.toContain(recordingsRoot)
    expect(storeFileMock).toHaveBeenCalledWith(
      MediaKind.Audio,
      expect.any(String),
      path.join(recordingsRoot, target.suggestedName),
      'audio/wav'
    )
  })

  it('returns no playback URL when a referenced file is missing', () => {
    const result = new TranscriptionAudioStore().resolveAudioUrl({
      ...record,
      audioManaged: false,
      audioPath: '/missing/input.m4a'
    })

    expect(result).toEqual({ url: null, missing: true })
    expect(storeFileMock).not.toHaveBeenCalled()
  })

  it('resolves an existing audio file through the media protocol without exposing its path', () => {
    const audioPath = path.join(recordingsRoot, 'recording.webm')
    writeFileSync(audioPath, 'audio')

    const result = new TranscriptionAudioStore().resolveAudioUrl({ ...record, audioPath })

    expect(result).toEqual({ url: `cherry-media://audio/${record.id}`, missing: false })
    expect(storeFileMock).toHaveBeenCalledWith(MediaKind.Audio, record.id, audioPath, 'audio/webm')
    expect(result.url).not.toContain(audioPath)
  })

  it('resolves a selected import through a temporary media URL without persisting it', () => {
    const audioPath = path.join(recordingsRoot, 'imported.m4a')
    writeFileSync(audioPath, 'audio')

    const result = new TranscriptionAudioStore().resolveTemporaryAudioUrl(audioPath)

    expect(result).toEqual({
      url: expect.stringMatching(/^cherry-media:\/\/audio\//),
      missing: false,
      previewId: expect.stringMatching(/^transcription-preview-/)
    })
    expect(result.url).not.toContain(audioPath)
    expect(storeFileMock).toHaveBeenCalledWith(MediaKind.Audio, expect.any(String), audioPath, 'audio/mp4')
  })

  it('releases temporary playback media mappings', () => {
    new TranscriptionAudioStore().releaseTemporaryAudioUrl('transcription-preview-1')

    expect(removeMock).toHaveBeenCalledWith(MediaKind.Audio, 'transcription-preview-1')
  })

  it('does not resolve non-audio files through the temporary playback route', () => {
    const filePath = path.join(recordingsRoot, 'imported.txt')
    writeFileSync(filePath, 'not audio')

    expect(new TranscriptionAudioStore().resolveTemporaryAudioUrl(filePath)).toEqual({
      url: null,
      missing: true,
      previewId: null
    })
    expect(storeFileMock).not.toHaveBeenCalled()
  })

  it('deletes managed audio only when explicitly requested and never deletes imports', () => {
    const managedPath = path.join(recordingsRoot, 'managed.webm')
    const importedPath = path.join(recordingsRoot, 'imported.m4a')
    writeFileSync(managedPath, 'managed')
    writeFileSync(importedPath, 'imported')
    const store = new TranscriptionAudioStore()

    store.deleteAudio({ ...record, audioPath: managedPath })
    store.deleteAudio({ ...record, audioPath: importedPath, audioManaged: false }, { deleteAudio: true })
    expect(existsSync(managedPath)).toBe(true)
    expect(existsSync(importedPath)).toBe(true)

    store.deleteAudio({ ...record, audioPath: managedPath }, { deleteAudio: true })
    expect(existsSync(managedPath)).toBe(false)
  })

  it('does not delete a managed record whose path escapes the recordings directory', () => {
    const outsidePath = path.join(path.dirname(recordingsRoot), 'outside.webm')
    writeFileSync(outsidePath, 'outside')

    new TranscriptionAudioStore().deleteAudio({ ...record, audioPath: outsidePath }, { deleteAudio: true })

    expect(existsSync(outsidePath)).toBe(true)
    rmSync(outsidePath, { force: true })
  })
})
