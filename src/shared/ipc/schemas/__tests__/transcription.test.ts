import { describe, expect, it } from 'vitest'

import { transcriptionRequestSchemas } from '../transcription'

describe('transcription IPC schemas', () => {
  it('defaults managed recordings to WAV for local Whisper preprocessing', () => {
    expect(transcriptionRequestSchemas['transcription.recording.create'].input.parse({})).toEqual({ extension: '.wav' })
  })
})
