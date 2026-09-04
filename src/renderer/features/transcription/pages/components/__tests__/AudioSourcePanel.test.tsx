import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AudioSourcePanel } from '../AudioSourcePanel'

describe('AudioSourcePanel', () => {
  it('maps raw errors to a localized generic message', () => {
    render(
      <AudioSourcePanel
        audioRef={{ current: null }}
        audioUrl={null}
        error={new Error('provider secret exploded')}
        isMissing={false}
        mode="recording"
        recordingStatus="idle"
        sourceName={null}
        onChooseFile={vi.fn()}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onStart={vi.fn()}
        onStop={vi.fn()}
      />
    )

    expect(screen.getByText('Something went wrong.')).toBeInTheDocument()
    expect(screen.queryByText('provider secret exploded')).not.toBeInTheDocument()
  })

  it('blocks file selection while viewing a history record', () => {
    render(
      <AudioSourcePanel
        audioRef={{ current: null }}
        audioUrl={null}
        error={null}
        inputDisabled
        isMissing={false}
        mode="file"
        recordingStatus="idle"
        sourceName="history.mp3"
        onChooseFile={vi.fn()}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onStart={vi.fn()}
        onStop={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'Choose audio file' })).toBeDisabled()
  })

  it('blocks recording while viewing a history record', () => {
    render(
      <AudioSourcePanel
        audioRef={{ current: null }}
        audioUrl={null}
        error={null}
        inputDisabled
        isMissing={false}
        mode="recording"
        recordingStatus="idle"
        sourceName="history.wav"
        onChooseFile={vi.fn()}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onStart={vi.fn()}
        onStop={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'Start recording' })).toBeDisabled()
  })
})
