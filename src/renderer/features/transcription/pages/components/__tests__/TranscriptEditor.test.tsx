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

  it('does not save an unpersisted transcript draft', () => {
    render(<TranscriptEditor audioRef={{ current: null }} disabled segments={[]} text="Draft" onSave={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('resets an edited draft when the owning record changes with the same text', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <TranscriptEditor
        audioRef={{ current: null }}
        resetKey="record-1"
        segments={[]}
        text="Same text"
        onSave={vi.fn()}
      />
    )
    await user.clear(screen.getByRole('textbox', { name: 'Transcript' }))
    await user.type(screen.getByRole('textbox', { name: 'Transcript' }), 'Unsaved edit')

    rerender(
      <TranscriptEditor
        audioRef={{ current: null }}
        resetKey="record-2"
        segments={[]}
        text="Same text"
        onSave={vi.fn()}
      />
    )

    expect(screen.getByRole('textbox', { name: 'Transcript' })).toHaveValue('Same text')
  })
})
