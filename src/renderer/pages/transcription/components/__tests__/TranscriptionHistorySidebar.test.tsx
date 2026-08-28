import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TranscriptionHistorySidebar } from '../TranscriptionHistorySidebar'

describe('TranscriptionHistorySidebar', () => {
  it('keeps a missing external record selectable while disabling playback', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <TranscriptionHistorySidebar
        selectedId={null}
        records={[
          {
            id: 'record-1',
            title: 'Interview',
            sourceType: 'file',
            audioManaged: false,
            audioPath: '/missing/interview.m4a',
            durationMs: 60_000,
            language: 'en',
            backend: 'provider_model',
            providerId: 'provider',
            modelId: 'model',
            status: 'ready',
            errorSummary: null,
            createdAt: '2026-08-27T00:00:00.000Z',
            updatedAt: '2026-08-27T00:00:00.000Z'
          }
        ]}
        missingRecordIds={new Set(['record-1'])}
        onDelete={vi.fn()}
        onSelect={onSelect}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Interview' }))
    expect(onSelect).toHaveBeenCalledWith('record-1')
    expect(screen.getByRole('button', { name: 'Play Interview' })).toBeDisabled()
    expect(screen.getByText('Audio unavailable')).toBeInTheDocument()
  })
})
