import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { TranscriptionRecord } from '@shared/data/types/transcription'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getMock, getPathMock, storeFileMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  getPathMock: vi.fn(),
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
    getMock.mockReset().mockReturnValue({ storeFile: storeFileMock, remove: vi.fn() })
    storeFileMock.mockReset()
  })

  afterEach(() => rmSync(recordingsRoot, { recursive: true, force: true }))

  it('reserves each recording inside the managed recordings directory', () => {
    const target = new TranscriptionAudioStore().reserveRecordingTarget('.webm')

    expect(target.filePath).toBe(path.join(recordingsRoot, `${target.recordingId}.webm`))
    expect(target.suggestedName).toBe(`${target.recordingId}.webm`)
    expect(target.recordingId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    expect(existsSync(path.dirname(target.filePath))).toBe(true)
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
