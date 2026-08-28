import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TranscriptionToolbar } from '../components/TranscriptionToolbar'
import TranscriptionPage, { buildBackendConfig, deleteHistoryRecord } from '../TranscriptionPage'

describe('TranscriptionPage', () => {
  it('switches between recording and file input modes', async () => {
    const user = userEvent.setup()
    render(<TranscriptionPage />)

    expect(screen.getByRole('button', { name: 'Start recording' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Import audio' }))

    expect(screen.getByRole('button', { name: 'Choose audio file' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Start recording' })).not.toBeInTheDocument()
  })

  it('does not create a provider request without a configured default model', () => {
    expect(
      buildBackendConfig('provider_model', {
        customEndpointBaseUrl: '',
        customEndpointRequestFormat: 'openai_multipart',
        defaultModelId: null
      })
    ).toBeNull()
  })

  it('disables the provider option without a configured default model', async () => {
    const user = userEvent.setup()
    render(
      <TranscriptionToolbar
        backend="local_whisper"
        language="auto"
        localModelStatus="not_downloaded"
        providerAvailable={false}
        sourceMode="recording"
        onBackendChange={vi.fn()}
        onLanguageChange={vi.fn()}
        onSourceModeChange={vi.fn()}
      />
    )

    await user.click(screen.getByRole('combobox', { name: 'Backend' }))

    expect(screen.getByRole('option', { name: 'Provider model' })).toHaveAttribute('data-disabled')
  })

  it('always clears the media mapping before deleting history', async () => {
    const request = vi.fn().mockResolvedValue(undefined)
    const deleteRecord = vi.fn().mockResolvedValue(undefined)

    await deleteHistoryRecord({ id: 'record-1' } as never, false, request, deleteRecord)

    expect(request).toHaveBeenCalledWith('transcription.recording.delete', { recordId: 'record-1', deleteAudio: false })
    expect(deleteRecord).toHaveBeenCalledWith('record-1')
    expect(request.mock.invocationCallOrder[0]).toBeLessThan(deleteRecord.mock.invocationCallOrder[0])
  })
})
