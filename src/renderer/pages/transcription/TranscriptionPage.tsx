import { Button } from '@cherrystudio/ui'
import { usePreference } from '@renderer/data/hooks/usePreference'
import { useSaveTranscriptionResult } from '@renderer/hooks/transcription/useSaveTranscriptionResult'
import { useTranscriptionPromptTemplates } from '@renderer/hooks/transcription/useTranscriptionPromptTemplates'
import { useTranscriptionRecord } from '@renderer/hooks/transcription/useTranscriptionRecord'
import {
  useDeleteTranscriptionRecord,
  useTranscriptionRecords
} from '@renderer/hooks/transcription/useTranscriptionRecords'
import { ipcApi } from '@renderer/ipc'
import type { TranscriptionRecord } from '@shared/data/types/transcription'
import type { TranscriptionBackendConfig } from '@shared/ipc/schemas/transcription'
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AudioSourcePanel } from './components/AudioSourcePanel'
import { OrganizationPanel } from './components/OrganizationPanel'
import { TranscriptEditor } from './components/TranscriptEditor'
import { TranscriptionHistorySidebar } from './components/TranscriptionHistorySidebar'
import { TranscriptionToolbar } from './components/TranscriptionToolbar'
import { useAudioPlaybackUrl } from './hooks/useAudioPlaybackUrl'
import { useAudioRecorder } from './hooks/useAudioRecorder'
import { useTranscriptionJob } from './hooks/useTranscriptionJob'

const PROGRESS_LABEL_KEYS: Record<string, string> = {
  canceled: 'transcription.progress.canceled',
  completed: 'transcription.progress.completed',
  failed: 'transcription.progress.failed',
  loading_model: 'transcription.progress.loading_model',
  organizing: 'transcription.progress.organizing',
  preparing: 'transcription.progress.preparing',
  transcribing: 'transcription.progress.transcribing'
}

export default function TranscriptionPage() {
  const { t } = useTranslation()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [sourceMode, setSourceMode] = useState<'recording' | 'file'>('recording')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draftSource, setDraftSource] = useState<{ audioPath: string; name: string; previewUrl: string | null } | null>(
    null
  )
  const [backend, setBackend] = useState<TranscriptionBackendConfig['backend']>('local_whisper')
  const [language, setLanguage] = useState('auto')
  const { items: records, refresh } = useTranscriptionRecords()
  const { record, result } = useTranscriptionRecord(selectedId)
  const { templates } = useTranscriptionPromptTemplates()
  const [customEndpointBaseUrl] = usePreference('feature.transcription.custom_endpoint.base_url')
  const [customEndpointRequestFormat] = usePreference('feature.transcription.custom_endpoint.request_format')
  const [defaultModelId] = usePreference('chat.default_model_id')
  const { deleteRecord } = useDeleteTranscriptionRecord()
  const saveResult = useSaveTranscriptionResult(record?.id ?? selectedId ?? '__transcription_unselected__')
  const recorder = useAudioRecorder()
  const job = useTranscriptionJob()
  const playback = useAudioPlaybackUrl(record?.id ?? null)
  const missingIds = new Set(playback.missing && record ? [record.id] : [])

  const audioUrl = draftSource?.previewUrl ?? playback.url
  const audioPath = draftSource?.audioPath ?? record?.audioPath ?? null
  const canTranscribe = Boolean(audioPath && (backend !== 'custom_endpoint' || customEndpointBaseUrl))
  const transcriptText = result?.transcriptText ?? ''
  const segments = result?.segments ?? []
  const organizationOutput = result?.organizationOutput ?? null

  const handleChooseFile = useCallback(async () => {
    const selected = await window.api.file.open({
      properties: ['openFile'],
      filters: [
        { name: t('transcription.audio_files'), extensions: ['wav', 'mp3', 'm4a', 'aac', 'ogg', 'flac', 'webm'] }
      ]
    })
    const first = Array.isArray(selected) ? selected[0] : selected
    const filePath = typeof first === 'string' ? first : first?.path
    if (!filePath) return
    setSelectedId(null)
    setDraftSource({
      audioPath: filePath,
      name: filePath.split(/[\\/]/).pop() ?? t('transcription.import_audio'),
      previewUrl: null
    })
  }, [t])

  const handleStopRecording = useCallback(async () => {
    const recording = await recorder.stop()
    setSelectedId(null)
    setDraftSource({
      audioPath: recording.audioPath,
      name: recording.audioPath.split(/[\\/]/).pop() ?? t('transcription.recording'),
      previewUrl: recording.previewUrl
    })
  }, [recorder, t])

  const handleTranscribe = useCallback(async () => {
    if (!audioPath) return
    const backendConfig = buildBackendConfig(backend, {
      customEndpointBaseUrl,
      customEndpointRequestFormat,
      defaultModelId
    })
    const { record: nextRecord } = await job.start({
      audioPath,
      backend: backendConfig,
      language,
      recordId: selectedId ?? undefined,
      sourceType: draftSource ? sourceMode : (record?.sourceType ?? sourceMode)
    })
    setSelectedId(nextRecord.id)
    setDraftSource(null)
    await refresh()
  }, [
    audioPath,
    backend,
    customEndpointBaseUrl,
    customEndpointRequestFormat,
    defaultModelId,
    draftSource,
    job,
    language,
    record?.sourceType,
    refresh,
    selectedId,
    sourceMode
  ])

  const handleDelete = useCallback(
    async (target: TranscriptionRecord, deleteAudio: boolean) => {
      if (deleteAudio) await ipcApi.request('transcription.recording.delete', { recordId: target.id, deleteAudio })
      await deleteRecord(target.id)
      if (selectedId === target.id) setSelectedId(null)
      await refresh()
    },
    [deleteRecord, refresh, selectedId]
  )

  return (
    <main className="grid h-full min-h-0 grid-cols-1 bg-background lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="flex min-h-0 flex-col px-4 py-3">
        <TranscriptionToolbar
          backend={backend}
          language={language}
          localModelStatus="ready"
          sourceMode={sourceMode}
          onBackendChange={setBackend}
          onLanguageChange={setLanguage}
          onSourceModeChange={setSourceMode}
        />
        <AudioSourcePanel
          audioRef={audioRef}
          audioUrl={audioUrl}
          error={recorder.error ?? job.error}
          isMissing={playback.missing}
          mode={sourceMode}
          onChooseFile={handleChooseFile}
          onPause={recorder.pause}
          onResume={recorder.resume}
          onStart={recorder.start}
          onStop={() => void handleStopRecording()}
          recordingStatus={recorder.status}
          sourceName={draftSource?.name ?? record?.title ?? null}
        />
        <div className="flex shrink-0 items-center gap-2 border-border-subtle border-b py-2">
          <Button
            disabled={!canTranscribe || job.isRunning}
            loading={job.isRunning}
            onClick={() => void handleTranscribe()}>
            {t('transcription.transcribe')}
          </Button>
          <Button disabled={!job.isRunning} variant="outline" onClick={() => void job.cancel()}>
            {t('common.cancel')}
          </Button>
          {backend === 'custom_endpoint' && !customEndpointBaseUrl ? (
            <span className="text-muted-foreground text-sm">{t('transcription.custom_endpoint_required')}</span>
          ) : null}
          {job.progress ? (
            <span className="text-muted-foreground text-sm">
              {t(PROGRESS_LABEL_KEYS[job.progress.stage] ?? 'transcription.progress.preparing')}{' '}
              {job.progress.percent ? `${job.progress.percent}%` : ''}
            </span>
          ) : null}
        </div>
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto]">
          <TranscriptEditor
            audioRef={audioRef}
            isSaving={saveResult.isSaving}
            segments={segments}
            text={transcriptText}
            onExport={(text) => void window.api.file.save('transcript.txt', text)}
            onSave={({ transcriptText: nextText, segments }) =>
              void saveResult.updateText({ transcriptText: nextText, segments })
            }
          />
          <OrganizationPanel
            templates={templates}
            organizationOutput={organizationOutput}
            isOrganizing={job.isRunning}
            onExport={(text) => void window.api.file.save('transcription-summary.txt', text)}
            onOrganize={({ prompt, templateId }) => {
              if (record?.id) void job.organize({ recordId: record.id, prompt, templateId })
            }}
          />
        </div>
      </div>
      <TranscriptionHistorySidebar
        missingRecordIds={missingIds}
        records={records}
        selectedId={selectedId}
        onDelete={handleDelete}
        onSelect={(recordId) => {
          setDraftSource(null)
          setSelectedId(recordId)
        }}
      />
    </main>
  )
}

function buildBackendConfig(
  backend: TranscriptionBackendConfig['backend'],
  options: {
    customEndpointBaseUrl: string
    customEndpointRequestFormat: 'openai_multipart' | 'json_base64'
    defaultModelId: string | null
  }
): TranscriptionBackendConfig {
  if (backend === 'provider_model') {
    const [providerId, modelId] = (options.defaultModelId || 'openai::whisper-1').split('::')
    return { backend, providerId: providerId || 'openai', modelId: modelId || 'whisper-1' }
  }
  if (backend === 'custom_endpoint')
    return { backend, baseUrl: options.customEndpointBaseUrl, requestFormat: options.customEndpointRequestFormat }
  return { backend }
}
