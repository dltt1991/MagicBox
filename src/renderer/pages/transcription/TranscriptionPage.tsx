import { Button } from '@cherrystudio/ui'
import { DefaultModelSelector } from '@renderer/components/DefaultModelSelector'
import { usePreference } from '@renderer/data/hooks/usePreference'
import { useSaveTranscriptionResult } from '@renderer/hooks/transcription/useSaveTranscriptionResult'
import { useTranscriptionPromptTemplates } from '@renderer/hooks/transcription/useTranscriptionPromptTemplates'
import { useTranscriptionRecord } from '@renderer/hooks/transcription/useTranscriptionRecord'
import { useTranscriptionRecords } from '@renderer/hooks/transcription/useTranscriptionRecords'
import { useLocalModel } from '@renderer/hooks/useLocalModel'
import { useModelById } from '@renderer/hooks/useModel'
import { useProviders } from '@renderer/hooks/useProvider'
import { ipcApi } from '@renderer/ipc'
import type { Model, UniqueModelId } from '@shared/data/types/model'
import { parseUniqueModelId } from '@shared/data/types/model'
import type { TranscriptionRecordView, TranscriptionSegment } from '@shared/data/types/transcription'
import type { TranscriptionBackendConfig } from '@shared/ipc/schemas/transcription'
import { isSpeechToTextModel } from '@shared/utils/model'
import { type RefObject, useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AudioSourcePanel } from './components/AudioSourcePanel'
import { OrganizationPanel } from './components/OrganizationPanel'
import { TranscriptEditor } from './components/TranscriptEditor'
import { TranscriptionHistorySidebar } from './components/TranscriptionHistorySidebar'
import { TranscriptionToolbar } from './components/TranscriptionToolbar'
import { useAudioPlaybackUrl } from './hooks/useAudioPlaybackUrl'
import { useAudioRecorder } from './hooks/useAudioRecorder'
import { type TranscriptionDraftSource, useTranscriptionDraft } from './hooks/useTranscriptionDraft'
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
  const { adopt: adoptDraftSource, replace: replaceDraftSource, source: draftSource } = useTranscriptionDraft()
  const [backend, setBackend] = useState<TranscriptionBackendConfig['backend']>('local_whisper')
  const [language, setLanguage] = useState('auto')
  const [actionError, setActionError] = useState<Error | null>(null)
  const { hasMore, isLoadingMore, items: records, loadMore, refresh } = useTranscriptionRecords()
  const { record, result } = useTranscriptionRecord(selectedId)
  const { templates } = useTranscriptionPromptTemplates()
  const [transcriptionModelId, setTranscriptionModelId] = usePreference('feature.transcription.model_id')
  const { model: transcriptionModel } = useModelById(transcriptionModelId as UniqueModelId | null)
  const { providers } = useProviders()
  const recorder = useAudioRecorder()
  const job = useTranscriptionJob()
  const localWhisper = useLocalModel('whisper')
  const previewSource = useMemo(
    () =>
      draftSource?.sourceType === 'file'
        ? { audioPath: draftSource.audioPath }
        : draftSource?.sourceType === 'recording'
          ? { recordingId: draftSource.recordingId }
          : null,
    [draftSource]
  )
  const playback = useAudioPlaybackUrl(record?.id ?? null, previewSource)
  const missingIds = new Set(playback.missing && record ? [record.id] : [])

  const audioUrl = playback.url
  const audioPath = draftSource?.sourceType === 'file' ? draftSource.audioPath : (record?.audioPath ?? null)
  const recordingId = draftSource?.sourceType === 'recording' ? draftSource.recordingId : null
  const backendConfig = useMemo(
    () =>
      buildBackendConfig(backend, {
        transcriptionModel
      }),
    [backend, transcriptionModel]
  )
  const canTranscribe = Boolean((audioPath || recordingId || record?.id) && backendConfig)
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
    await replaceDraftSource({
      audioPath: filePath,
      name: filePath.split(/[\\/]/).pop() ?? t('transcription.import_audio'),
      sourceType: 'file'
    })
  }, [replaceDraftSource, t])

  const handleStopRecording = useCallback(async () => {
    const recording = await recorder.stop()
    if (!recording) return
    setSelectedId(null)
    await replaceDraftSource({
      name: recording.suggestedName,
      recordingId: recording.recordingId,
      sourceType: 'recording'
    })
  }, [recorder, replaceDraftSource])

  const handleTranscribe = useCallback(async () => {
    if ((!audioPath && !recordingId && !record?.id) || !backendConfig) return
    const { record: nextRecord } = await job.start({
      backend: backendConfig,
      language,
      ...(selectedId ? { recordId: selectedId } : audioPath ? { audioPath } : { recordingId: recordingId! }),
      sourceType: getDraftSourceType(draftSource, record?.sourceType ?? sourceMode)
    })
    setSelectedId(nextRecord.id)
    adoptDraftSource()
    await refresh()
  }, [
    audioPath,
    adoptDraftSource,
    backendConfig,
    draftSource,
    job,
    language,
    record?.id,
    record?.sourceType,
    recordingId,
    refresh,
    selectedId,
    sourceMode
  ])

  const handleDelete = useCallback(
    async (target: TranscriptionRecordView, deleteAudio: boolean) => {
      await deleteHistoryRecord(target, deleteAudio, (route, input) => ipcApi.request(route, input))
      if (selectedId === target.id) setSelectedId(null)
      await refresh()
    },
    [refresh, selectedId]
  )
  const handleAction = useCallback(async (promise: Promise<unknown>) => {
    setActionError(null)
    await promise.catch(() => setActionError(new Error('transcription.error.operation_failed')))
  }, [])

  return (
    <main className="grid h-full min-h-0 grid-cols-1 bg-background lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="flex min-h-0 flex-col px-4 py-3">
        <TranscriptionToolbar
          backend={backend}
          language={language}
          localModelStatus={localWhisper.status}
          onlineModelSelector={
            <DefaultModelSelector
              filter={isSpeechToTextModel}
              model={transcriptionModel}
              onSelect={(model) => {
                void setTranscriptionModelId(model?.id ?? null).catch(() => {
                  setActionError(new Error('transcription.error.operation_failed'))
                })
              }}
              placeholder={t('settings.models.empty')}
              providers={providers}
            />
          }
          recordingActive={recorder.status !== 'idle'}
          sourceMode={sourceMode}
          onBackendChange={setBackend}
          onLanguageChange={setLanguage}
          onSourceModeChange={setSourceMode}
        />
        <AudioSourcePanel
          audioRef={audioRef}
          audioUrl={audioUrl}
          error={recorder.error ?? job.error ?? actionError}
          isMissing={playback.missing}
          mode={sourceMode}
          onChooseFile={() => void handleAction(handleChooseFile())}
          onPause={recorder.pause}
          onResume={recorder.resume}
          onStart={() => void handleAction(recorder.start())}
          onStop={() => void handleAction(handleStopRecording())}
          recordingStatus={recorder.status}
          sourceName={draftSource?.name ?? record?.title ?? null}
        />
        <div className="flex shrink-0 items-center gap-2 border-border-subtle border-b py-2">
          <Button
            disabled={!canTranscribe || job.isRunning}
            loading={job.isRunning}
            onClick={() => void handleAction(handleTranscribe())}>
            {t('transcription.transcribe')}
          </Button>
          <Button disabled={!job.isRunning} variant="outline" onClick={() => void handleAction(job.cancel())}>
            {t('common.cancel')}
          </Button>
          {job.progress ? (
            <span className="text-muted-foreground text-sm">
              {t(PROGRESS_LABEL_KEYS[job.progress.stage] ?? 'transcription.progress.preparing')}{' '}
              {job.progress.percent ? `${job.progress.percent}%` : ''}
            </span>
          ) : null}
        </div>
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto]">
          {record && result ? (
            <PersistedTranscriptEditor
              key={record.id}
              audioRef={audioRef}
              onActionError={() => setActionError(new Error('transcription.error.operation_failed'))}
              recordId={record.id}
              segments={segments}
              text={transcriptText}
            />
          ) : (
            <TranscriptEditor
              audioRef={audioRef}
              disabled
              segments={segments}
              text={transcriptText}
              onExport={(text) => void handleAction(window.api.file.save('transcript.txt', text))}
            />
          )}
          <OrganizationPanel
            templates={templates}
            organizationOutput={organizationOutput}
            isOrganizing={job.isRunning}
            disabled={!record || !result}
            onExport={(text) => void handleAction(window.api.file.save('transcription-summary.txt', text))}
            onOrganize={
              record && result
                ? ({ prompt, templateId }) =>
                    void handleAction(job.organize({ recordId: record.id, prompt, templateId }))
                : undefined
            }
          />
        </div>
      </div>
      <TranscriptionHistorySidebar
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        missingRecordIds={missingIds}
        records={records}
        selectedId={selectedId}
        onDelete={(record, deleteAudio) => void handleAction(handleDelete(record, deleteAudio))}
        onLoadMore={loadMore}
        onSelect={(recordId) => {
          void handleAction(
            replaceDraftSource(null).then(() => {
              setSelectedId(recordId)
            })
          )
        }}
      />
    </main>
  )
}

export async function runHandled(promise: Promise<unknown>): Promise<void> {
  await promise.catch(() => undefined)
}

export function getDraftSourceType(
  draftSource: Pick<TranscriptionDraftSource, 'sourceType'> | null,
  fallback: 'recording' | 'file'
): 'recording' | 'file' {
  return draftSource?.sourceType ?? fallback
}

export function buildBackendConfig(
  backend: TranscriptionBackendConfig['backend'],
  options: {
    transcriptionModel: Model | undefined
  }
): TranscriptionBackendConfig | null {
  if (backend === 'provider_model') {
    if (!options.transcriptionModel || !isSpeechToTextModel(options.transcriptionModel)) return null
    const { providerId, modelId } = parseUniqueModelId(options.transcriptionModel.id)
    return { backend, providerId, modelId }
  }
  if (backend === 'custom_endpoint') {
    return null
  }
  return { backend }
}

type DeleteRequest = (
  route: 'transcription.recording.delete',
  input: { deleteAudio: boolean; recordId: string }
) => Promise<unknown>

export async function deleteHistoryRecord(
  record: Pick<TranscriptionRecordView, 'id'>,
  deleteAudio: boolean,
  request: DeleteRequest
): Promise<void> {
  await request('transcription.recording.delete', { recordId: record.id, deleteAudio })
}

function PersistedTranscriptEditor({
  audioRef,
  onActionError,
  recordId,
  segments,
  text
}: {
  audioRef: RefObject<HTMLAudioElement | null>
  onActionError: () => void
  recordId: string
  segments: TranscriptionSegment[]
  text: string
}) {
  const saveResult = useSaveTranscriptionResult(recordId)
  const handleAction = useCallback(
    async (promise: Promise<unknown>) => {
      await promise.catch(onActionError)
    },
    [onActionError]
  )
  return (
    <TranscriptEditor
      audioRef={audioRef}
      isSaving={saveResult.isSaving}
      segments={segments}
      text={text}
      onExport={(value) => void handleAction(window.api.file.save('transcript.txt', value))}
      onSave={({ transcriptText, segments: nextSegments }) =>
        void handleAction(saveResult.updateText({ transcriptText, segments: nextSegments }))
      }
    />
  )
}
