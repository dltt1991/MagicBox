import { MODEL_CAPABILITY } from '@shared/data/types/model'
import { MockUsePreferenceUtils } from '@test-mocks/renderer/usePreference'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  localModel: {
    cancel: vi.fn(),
    download: vi.fn(),
    percent: 0,
    status: 'ready'
  }
}))

vi.mock('@renderer/hooks/useLocalModel', () => ({
  useLocalModel: () => mocks.localModel
}))

vi.mock('@renderer/components/DefaultModelSelector', () => ({
  DefaultModelSelector: ({ onSelect }: { onSelect: (model: unknown) => void }) => (
    <button
      type="button"
      onClick={() =>
        onSelect({
          id: 'openai::gpt-4.1',
          providerId: 'openai',
          capabilities: []
        })
      }>
      Mock Model
    </button>
  )
}))

import { OrganizationPanel } from '../components/OrganizationPanel'
import { TranscriptionToolbar } from '../components/TranscriptionToolbar'
import TranscriptionPage, {
  buildBackendConfig,
  deleteHistoryRecord,
  getDraftSourceType,
  getOrganizationExportFilename,
  getTranscriptExportFilename,
  runHandled
} from '../TranscriptionPage'

describe('TranscriptionPage', () => {
  beforeEach(() => {
    MockUsePreferenceUtils.resetMocks()
    mocks.localModel.cancel.mockReset()
    mocks.localModel.download.mockReset()
    mocks.localModel.percent = 0
    mocks.localModel.status = 'ready'
  })

  it('switches between recording and file input modes', async () => {
    const user = userEvent.setup()
    render(<TranscriptionPage />)

    expect(screen.getByRole('button', { name: '开始录音' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: '导入音频' }))

    expect(screen.getByRole('button', { name: '选择音频文件' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '开始录音' })).not.toBeInTheDocument()
  })

  it('uses the selected legacy file path as the transcription source', async () => {
    const user = userEvent.setup()
    window.api.file.open = vi.fn().mockResolvedValue({
      fileName: 'meeting.mp3',
      filePath: '/tmp/meeting.mp3',
      size: 1024
    })

    render(<TranscriptionPage />)

    await user.click(screen.getByRole('button', { name: '导入音频' }))
    await user.click(screen.getByRole('button', { name: '选择音频文件' }))

    expect(await screen.findByDisplayValue('meeting.mp3')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: '转写' })).toBeEnabled())
  })

  it('creates provider requests only from a dedicated transcription model', () => {
    const transcriptionModel = {
      id: 'provider::whisper-1',
      providerId: 'provider',
      capabilities: [MODEL_CAPABILITY.AUDIO_TRANSCRIPT]
    }

    expect(
      buildBackendConfig('provider_model', {
        transcriptionModel: transcriptionModel as never
      })
    ).toEqual({ backend: 'provider_model', providerId: 'provider', modelId: 'whisper-1' })

    expect(
      buildBackendConfig('provider_model', {
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

    await user.click(screen.getByRole('button', { name: '转写后端' }))

    expect(screen.getByRole('button', { name: '在线模型' })).not.toHaveAttribute('data-disabled')
  })

  it('starts a new transcription task from the toolbar', async () => {
    const user = userEvent.setup()
    const onNewTask = vi.fn()
    render(
      <TranscriptionToolbar
        backend="local_whisper"
        language="auto"
        localModelStatus="ready"
        sourceMode="recording"
        onBackendChange={vi.fn()}
        onLanguageChange={vi.fn()}
        onNewTask={onNewTask}
        onSourceModeChange={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: '新建任务' }))

    expect(onNewTask).toHaveBeenCalledOnce()
  })

  it('blocks new transcription tasks while recording', () => {
    render(
      <TranscriptionToolbar
        backend="local_whisper"
        language="auto"
        localModelStatus="ready"
        newTaskDisabled
        sourceMode="recording"
        onBackendChange={vi.fn()}
        onLanguageChange={vi.fn()}
        onNewTask={vi.fn()}
        onSourceModeChange={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: '新建任务' })).toBeDisabled()
  })

  it('disables audio source switching while viewing history', () => {
    render(
      <TranscriptionToolbar
        backend="local_whisper"
        language="auto"
        localModelStatus="ready"
        sourceMode="recording"
        sourceModeDisabled
        onBackendChange={vi.fn()}
        onLanguageChange={vi.fn()}
        onNewTask={vi.fn()}
        onSourceModeChange={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: '录音' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '导入音频' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '新建任务' })).toBeEnabled()
  })

  it('offers local Whisper download when the model is unavailable', async () => {
    const user = userEvent.setup()
    const onLocalModelDownload = vi.fn()
    mocks.localModel.status = 'error'
    render(
      <TranscriptionToolbar
        backend="local_whisper"
        language="auto"
        localModelStatus="error"
        sourceMode="recording"
        onBackendChange={vi.fn()}
        onLanguageChange={vi.fn()}
        onLocalModelDownload={onLocalModelDownload}
        onSourceModeChange={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: '重试' }))

    expect(onLocalModelDownload).toHaveBeenCalledOnce()
  })

  it('renders an organization model selector and blocks organization without a chat model', () => {
    render(
      <OrganizationPanel
        templates={[
          {
            id: 'builtin-general-summary',
            builtIn: true,
            createdAt: '2026-09-04T00:00:00.000Z',
            isDefault: true,
            name: 'General Summary',
            orderKey: '0001',
            prompt: '{{transcript}}',
            updatedAt: '2026-09-04T00:00:00.000Z'
          }
        ]}
        organizationOutput={null}
        organizationModelReady={false}
        organizationModelSelector={<button type="button">Organization model</button>}
        onOrganize={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'Organization model' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '整理' })).toBeDisabled()
  })

  it('remembers the selected organization model', async () => {
    const user = userEvent.setup()
    render(<TranscriptionPage />)

    await user.click(screen.getByRole('button', { name: 'Mock Model' }))

    expect(MockUsePreferenceUtils.getPreferenceValue('feature.transcription.organization_model_id')).toBe(
      'openai::gpt-4.1'
    )
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

    expect(screen.getByRole('button', { name: '录音' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '导入音频' })).toBeDisabled()
  })

  it('delegates history deletion to the transcription owner', async () => {
    const request = vi.fn().mockResolvedValue(undefined)

    await deleteHistoryRecord({ id: 'record-1' } as never, false, request)

    expect(request).toHaveBeenCalledWith('transcription.recording.delete', { recordId: 'record-1', deleteAudio: false })
  })

  it('handles rejected job promises at the page boundary', async () => {
    await expect(runHandled(Promise.reject(new Error('backend failed')))).resolves.toMatchObject({
      message: 'transcription.error.operation_failed'
    })
  })

  it('keeps actionable transcription errors at the page boundary', async () => {
    await expect(
      runHandled(
        Promise.reject(new Error('Local Whisper model is incomplete. Missing or invalid files: generation_config.json'))
      )
    ).resolves.toMatchObject({ message: 'transcription.error.local_model_incomplete' })
  })

  it('keeps the original draft source type when the toolbar mode changes', () => {
    expect(getDraftSourceType({ sourceType: 'recording' }, 'file')).toBe('recording')
    expect(getDraftSourceType(null, 'file')).toBe('file')
  })

  it('uses Markdown as the default export format', () => {
    expect(getTranscriptExportFilename()).toBe('transcript.md')
    expect(getOrganizationExportFilename()).toBe('transcription-summary.md')
  })
})
