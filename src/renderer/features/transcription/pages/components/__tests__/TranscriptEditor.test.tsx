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

    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
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
    await user.clear(screen.getByRole('textbox', { name: '转写文本' }))
    await user.type(screen.getByRole('textbox', { name: '转写文本' }), 'Unsaved edit')

    rerender(
      <TranscriptEditor
        audioRef={{ current: null }}
        resetKey="record-2"
        segments={[]}
        text="Same text"
        onSave={vi.fn()}
      />
    )

    expect(screen.getByRole('textbox', { name: '转写文本' })).toHaveValue('Same text')
  })

  it('keeps long transcript text scrolling inside the editor pane', () => {
    render(
      <TranscriptEditor
        audioRef={{ current: null }}
        segments={[{ startMs: 0, endMs: 1000, text: 'Segment text' }]}
        text="Long transcript text"
        onSave={vi.fn()}
      />
    )

    // Layout contract: shared Textarea.Input auto-sizes by default; the transcript editor must override it
    // so the segment list stays in its own grid row instead of visually overlapping long transcript text.
    expect(screen.getByRole('textbox', { name: '转写文本' })).toHaveClass(
      'field-sizing-fixed',
      'h-full',
      'min-h-0',
      'overflow-y-auto'
    )
  })

  it('places the transcript text and segment list side by side', () => {
    render(
      <TranscriptEditor
        audioRef={{ current: null }}
        segments={[{ startMs: 0, endMs: 1000, text: 'Segment text' }]}
        text="Long transcript text"
        onSave={vi.fn()}
      />
    )

    expect(screen.getByTestId('transcript-workspace')).toHaveClass('md:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]')
  })

  it('opens a larger transcript view', async () => {
    const user = userEvent.setup()
    render(
      <TranscriptEditor
        audioRef={{ current: null }}
        segments={[{ startMs: 0, endMs: 1000, text: 'Segment text' }]}
        text="Long transcript text"
        onSave={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: '最大化' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getAllByRole('textbox', { name: '转写文本' })).toHaveLength(2)
  })
})
