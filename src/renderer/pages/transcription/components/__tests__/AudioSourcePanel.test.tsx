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
})
