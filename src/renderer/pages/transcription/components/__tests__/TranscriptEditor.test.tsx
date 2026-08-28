import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TranscriptEditor } from '../TranscriptEditor'

describe('TranscriptEditor', () => {
  it('seeks the audio player when a timestamped segment is selected', async () => {
    const user = userEvent.setup()
    const audio = document.createElement('audio')
    render(
      <TranscriptEditor
        audioRef={{ current: audio }}
        segments={[{ startMs: 12_500, endMs: 14_000, text: 'Important point' }]}
        text="Important point"
        onSave={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: '00:12 Important point' }))
    expect(audio.currentTime).toBe(12.5)
  })
})
