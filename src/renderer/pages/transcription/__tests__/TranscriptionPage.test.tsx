import { MODEL_CAPABILITY } from '@shared/data/types/model'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TranscriptionToolbar } from '../components/TranscriptionToolbar'
import TranscriptionPage, {
  buildBackendConfig,
  deleteHistoryRecord,
  getDraftSourceType,
  runHandled
} from '../TranscriptionPage'

describe('TranscriptionPage', () => {
  it('switches between recording and file input modes', async () => {
    const user = userEvent.setup()
    render(<TranscriptionPage />)

    expect(screen.getByRole('button', { name: 'Start recording' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Import audio' }))

    expect(screen.getByRole('button', { name: 'Choose audio file' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Start recording' })).not.toBeInTheDocument()
  })

  it('creates provider requests only from a dedicated transcription model', () => {
    const transcriptionModel = {
      id: 'provider::whisper-1',
      providerId: 'provider',
      capabilities: [MODEL_CAPABILITY.AUDIO_TRANSCRIPT]
    }

    expect(
      buildBackendConfig('provider_model', {
        customEndpointBaseUrl: '',
        customEndpointRequestFormat: 'openai_multipart',
        transcriptionModel: transcriptionModel as never
      })
    ).toEqual({ backend: 'provider_model', providerId: 'provider', modelId: 'whisper-1' })

    expect(
      buildBackendConfig('provider_model', {
        customEndpointBaseUrl: '',
        customEndpointRequestFormat: 'openai_multipart',
        transcriptionModel: { ...transcriptionModel, capabilities: [] } as never
      })
    ).toBeNull()
  })

  it('keeps online transcription selectable before a model is configured', async () => {
    const user = userEvent.setup()
    render(
      <TranscriptionToolbar
        backend="local_whisper"
        language="auto"
        localModelStatus="not_downloaded"
        sourceMode="recording"
        onBackendChange={vi.fn()}
        onLanguageChange={vi.fn()}
        onSourceModeChange={vi.fn()}
      />
    )

    await user.click(screen.getByRole('combobox', { name: 'Backend' }))

    expect(screen.getByRole('option', { name: 'Provider model' })).not.toHaveAttribute('data-disabled')
  })

  it('disables source switching while recording', () => {
    render(
      <TranscriptionToolbar
        backend="local_whisper"
        language="auto"
        localModelStatus="ready"
        recordingActive
        sourceMode="recording"
        onBackendChange={vi.fn()}
        onLanguageChange={vi.fn()}
        onSourceModeChange={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'Recording' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Import audio' })).toBeDisabled()
  })

  it('always clears the media mapping before deleting history', async () => {
    const request = vi.fn().mockResolvedValue(undefined)
    const deleteRecord = vi.fn().mockResolvedValue(undefined)

    await deleteHistoryRecord({ id: 'record-1' } as never, false, request, deleteRecord)

    expect(request).toHaveBeenCalledWith('transcription.recording.delete', { recordId: 'record-1', deleteAudio: false })
    expect(deleteRecord).toHaveBeenCalledWith('record-1')
    expect(request.mock.invocationCallOrder[0]).toBeLessThan(deleteRecord.mock.invocationCallOrder[0])
  })

  it('handles rejected job promises at the page boundary', async () => {
    await expect(runHandled(Promise.reject(new Error('backend failed')))).resolves.toBeUndefined()
  })

  it('keeps the original draft source type when the toolbar mode changes', () => {
    expect(getDraftSourceType({ sourceType: 'recording' }, 'file')).toBe('recording')
    expect(getDraftSourceType(null, 'file')).toBe('file')
  })
})
