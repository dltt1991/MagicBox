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
        hasMore={false}
        isLoadingMore={false}
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
        onRename={vi.fn()}
        onLoadMore={vi.fn()}
        onSelect={onSelect}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Interview' }))
    expect(onSelect).toHaveBeenCalledWith('record-1')
    expect(screen.getByRole('button', { name: '播放 Interview' })).toBeDisabled()
    expect(screen.getByText('音频不可用')).toBeInTheDocument()
  })

  it('loads more history and translates backend fallback labels', async () => {
    const user = userEvent.setup()
    const onLoadMore = vi.fn()
    render(
      <TranscriptionHistorySidebar
        hasMore
        isLoadingMore={false}
        missingRecordIds={new Set()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
        onLoadMore={onLoadMore}
        onSelect={vi.fn()}
        records={[
          {
            id: 'record-1',
            title: 'Local recording',
            sourceType: 'recording',
            audioManaged: true,
            audioPath: null,
            durationMs: 1000,
            language: 'en',
            backend: 'local_whisper',
            providerId: null,
            modelId: null,
            status: 'ready',
            errorSummary: null,
            createdAt: '2026-08-27T00:00:00.000Z',
            updatedAt: '2026-08-27T00:00:00.000Z'
          }
        ]}
        selectedId={null}
      />
    )

    expect(screen.getByText('本地 Whisper')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '更多' }))
    expect(onLoadMore).toHaveBeenCalledOnce()
  })

  it('renames a history task inline', async () => {
    const user = userEvent.setup()
    const onRename = vi.fn()
    render(
      <TranscriptionHistorySidebar
        hasMore={false}
        isLoadingMore={false}
        missingRecordIds={new Set()}
        onDelete={vi.fn()}
        onRename={onRename}
        onLoadMore={vi.fn()}
        onSelect={vi.fn()}
        records={[
          {
            id: 'record-1',
            title: 'Interview',
            sourceType: 'file',
            audioManaged: false,
            audioPath: '/tmp/interview.m4a',
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
        selectedId={null}
      />
    )

    await user.click(screen.getByRole('button', { name: '重命名 Interview' }))
    await user.clear(screen.getByRole('textbox', { name: '任务名称' }))
    await user.type(screen.getByRole('textbox', { name: '任务名称' }), 'Renamed interview')
    await user.keyboard('{Enter}')

    expect(onRename).toHaveBeenCalledWith('record-1', 'Renamed interview')
  })
})
