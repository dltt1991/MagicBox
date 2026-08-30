import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { application } from '@application'
import { transcriptionHistoryService } from '@data/services/TranscriptionHistoryService'
import { BaseService } from '@main/core/lifecycle'
import { MediaKind } from '@main/services/mediaProtocol'
import { setupTestDatabase } from '@test-helpers/db'
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest'

import { TranscriptionService } from '../TranscriptionService'

const defaultGet = (application.get as unknown as Mock).getMockImplementation()

describe('Transcription workflow integration', () => {
  setupTestDatabase()

  let tempDir: string
  const aiService = {
    generateText: vi.fn()
  }
  const mediaProtocolService = {
    remove: vi.fn(),
    storeFile: vi.fn()
  }

  beforeEach(() => {
    BaseService.resetInstances()
    tempDir = path.join(tmpdir(), `cherry-transcription-workflow-${randomUUID()}`)
    mkdirSync(tempDir, { recursive: true })
    aiService.generateText.mockReset().mockResolvedValue({ text: 'Next steps: send the proposal.' })
    mediaProtocolService.remove.mockReset()
    mediaProtocolService.storeFile.mockReset()
    ;(application.get as unknown as Mock).mockImplementation((name: string) => {
      if (name === 'AiService') return aiService
      if (name === 'MediaProtocolService') return mediaProtocolService
      return defaultGet?.(name)
    })
  })

  afterEach(() => {
    ;(application.get as unknown as Mock).mockImplementation(defaultGet!)
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('persists, organizes, reloads, and resolves playback for an imported transcription', async () => {
    const audioPath = path.join(tempDir, 'customer-call.m4a')
    writeFileSync(audioPath, 'audio')
    const segments = [
      { startMs: 0, endMs: 600, text: 'Welcome to the call.' },
      { startMs: 600, endMs: 1500, text: 'We agreed on next steps.' }
    ]
    const local = {
      transcribe: vi.fn().mockResolvedValue({
        text: 'Welcome to the call. We agreed on next steps.',
        segments,
        language: 'en',
        durationMs: 1500,
        backend: 'local_whisper'
      })
    }
    const service = new TranscriptionService({
      local,
      provider: { transcribe: vi.fn() }
    })

    const transcribed = await service.transcribe(
      {
        jobId: 'job-transcribe',
        audioPath,
        sourceType: 'file',
        language: 'auto',
        backend: { backend: 'local_whisper' }
      },
      'window-1'
    )

    await service.organize(
      {
        jobId: 'job-organize',
        recordId: transcribed.record.id,
        templateId: 'builtin-meeting-minutes',
        prompt: 'Summary: {{transcript}} / {{segments}}',
        modelId: 'openai::gpt-4o-mini'
      },
      'window-1'
    )
    const reloaded = transcriptionHistoryService.getRecord(transcribed.record.id)
    const playback = service.resolveAudioUrl(transcribed.record.id)

    expect(local.transcribe).toHaveBeenCalledWith(audioPath, 'auto', expect.any(AbortSignal))
    expect(aiService.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        uniqueModelId: 'openai::gpt-4o-mini',
        prompt: expect.stringContaining('Welcome to the call. We agreed on next steps.')
      })
    )
    expect(reloaded).toMatchObject({
      record: {
        id: transcribed.record.id,
        audioPath,
        audioManaged: false,
        durationMs: 1500,
        language: 'en'
      },
      result: {
        transcriptText: 'Welcome to the call. We agreed on next steps.',
        segments,
        organizationTemplateId: 'builtin-meeting-minutes',
        organizationOutput: 'Next steps: send the proposal.'
      }
    })
    expect(playback).toEqual({
      url: expect.stringMatching(/^cherry-media:\/\/audio\/transcription-playback-/),
      missing: false,
      playbackId: expect.stringMatching(/^transcription-playback-/)
    })
    expect(mediaProtocolService.storeFile).toHaveBeenCalledWith(
      MediaKind.Audio,
      playback.playbackId,
      audioPath,
      'audio/mp4'
    )
    service.releaseAudioUrl(playback.playbackId!)
    expect(mediaProtocolService.remove).toHaveBeenCalledWith(MediaKind.Audio, playback.playbackId)
  })
})
