import { describe, expect, it } from 'vitest'

import { transcriptionRequestSchemas } from '../transcription'

describe('transcription IPC schemas', () => {
  it('defaults managed recordings to WAV for local Whisper preprocessing', () => {
    expect(transcriptionRequestSchemas['transcription.recording.create'].input.parse({})).toEqual({ extension: '.wav' })
  })

  it('accepts only a non-empty path for temporary imported audio playback', () => {
    expect(
      transcriptionRequestSchemas['transcription.audio_url.preview'].input.parse({ audioPath: '/input.m4a' })
    ).toEqual({
      audioPath: '/input.m4a'
    })
    expect(
      transcriptionRequestSchemas['transcription.audio_url.preview'].input.safeParse({ audioPath: '' }).success
    ).toBe(false)
  })
})
