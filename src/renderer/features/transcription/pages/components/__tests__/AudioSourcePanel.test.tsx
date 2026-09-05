import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
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

    expect(screen.getByText('操作失败，请重试。')).toBeInTheDocument()
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

    expect(screen.getByRole('button', { name: '选择音频文件' })).toBeDisabled()
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

    expect(screen.getByRole('button', { name: '开始录音' })).toBeDisabled()
  })

  it('edits the draft task name before transcription', async () => {
    const user = userEvent.setup()
    const onSourceNameChange = vi.fn()
    render(<AudioSourcePanelHarness onSourceNameChange={onSourceNameChange} />)

    await user.clear(screen.getByRole('textbox', { name: '任务名称' }))
    await user.type(screen.getByRole('textbox', { name: '任务名称' }), 'Weekly meeting')

    expect(onSourceNameChange).toHaveBeenLastCalledWith('Weekly meeting')
  })
})

function AudioSourcePanelHarness({ onSourceNameChange }: { onSourceNameChange: (name: string) => void }) {
  const [sourceName, setSourceName] = useState('meeting.mp3')

  return (
    <AudioSourcePanel
      audioRef={{ current: null }}
      audioUrl={null}
      error={null}
      isMissing={false}
      mode="file"
      recordingStatus="idle"
      sourceName={sourceName}
      onChooseFile={vi.fn()}
      onPause={vi.fn()}
      onResume={vi.fn()}
      onSourceNameChange={(name) => {
        setSourceName(name)
        onSourceNameChange(name)
      }}
      onStart={vi.fn()}
      onStop={vi.fn()}
    />
  )
}
