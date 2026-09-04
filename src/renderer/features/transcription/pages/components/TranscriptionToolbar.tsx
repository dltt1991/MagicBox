import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@cherrystudio/ui'
import type { TranscriptionLanguage } from '@shared/data/types/transcription'
import type { TranscriptionBackendConfig } from '@shared/ipc/schemas/transcription'
import { Download, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

type SourceMode = 'recording' | 'file'

type TranscriptionToolbarProps = {
  backend: TranscriptionBackendConfig['backend']
  language: TranscriptionLanguage
  localModelStatus: string
  localModelPercent?: number
  newTaskDisabled?: boolean
  onLocalModelCancel?: () => void
  onLocalModelDownload?: () => void
  onNewTask?: () => void
  onBackendChange: (backend: TranscriptionBackendConfig['backend']) => void
  onLanguageChange: (language: TranscriptionLanguage) => void
  onSourceModeChange: (sourceMode: SourceMode) => void
  onlineModelSelector?: ReactNode
  recordingActive?: boolean
  sourceModeDisabled?: boolean
  sourceMode: SourceMode
}

const MODEL_STATUS_LABEL_KEYS: Record<string, string> = {
  downloading: 'transcription.model_status.downloading',
  error: 'transcription.model_status.error',
  not_downloaded: 'transcription.model_status.not_downloaded',
  ready: 'transcription.model_status.ready',
  unsupported: 'transcription.model_status.unsupported'
}

export function TranscriptionToolbar({
  backend,
  language,
  localModelPercent = 0,
  localModelStatus,
  newTaskDisabled = false,
  onLocalModelCancel,
  onLocalModelDownload,
  onNewTask,
  onBackendChange,
  onLanguageChange,
  onSourceModeChange,
  onlineModelSelector,
  recordingActive = false,
  sourceModeDisabled = false,
  sourceMode
}: TranscriptionToolbarProps) {
  const { t } = useTranslation()
  const canDownloadLocalModel =
    backend === 'local_whisper' &&
    Boolean(onLocalModelDownload) &&
    (localModelStatus === 'not_downloaded' || localModelStatus === 'error')
  const canCancelLocalModelDownload =
    backend === 'local_whisper' && localModelStatus === 'downloading' && Boolean(onLocalModelCancel)

  return (
    <header className="flex flex-wrap items-center gap-2 border-border-subtle border-b pb-3">
      <Button size="sm" variant="outline" disabled={newTaskDisabled || !onNewTask} onClick={onNewTask}>
        <Plus />
        {t('transcription.new_task')}
      </Button>
      <div className="flex shrink-0 rounded-md border border-border p-0.5" aria-label={t('transcription.source')}>
        <Button
          size="sm"
          variant={sourceMode === 'recording' ? 'default' : 'ghost'}
          disabled={recordingActive || sourceModeDisabled}
          onClick={() => onSourceModeChange('recording')}>
          {t('transcription.recording')}
        </Button>
        <Button
          size="sm"
          variant={sourceMode === 'file' ? 'default' : 'ghost'}
          disabled={recordingActive || sourceModeDisabled}
          onClick={() => onSourceModeChange('file')}>
          {t('transcription.import_audio')}
        </Button>
      </div>
      <Select value={backend} onValueChange={onBackendChange}>
        <SelectTrigger size="sm" aria-label={t('transcription.backend')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="local_whisper">{t('transcription.backend_local')}</SelectItem>
          <SelectItem value="provider_model">{t('transcription.backend_provider')}</SelectItem>
        </SelectContent>
      </Select>
      {backend === 'provider_model' ? onlineModelSelector : null}
      <Select value={language} onValueChange={onLanguageChange}>
        <SelectTrigger size="sm" aria-label={t('common.language')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">{t('transcription.language_auto')}</SelectItem>
          <SelectItem value="en">{t('transcription.language_english')}</SelectItem>
          <SelectItem value="zh">{t('transcription.language_chinese')}</SelectItem>
        </SelectContent>
      </Select>
      <div className="ml-auto flex items-center gap-2">
        <span className="text-muted-foreground text-xs">
          {t(MODEL_STATUS_LABEL_KEYS[localModelStatus] ?? 'transcription.model_status.not_downloaded')}
          {canCancelLocalModelDownload && localModelPercent > 0 ? ` ${localModelPercent}%` : ''}
        </span>
        {canDownloadLocalModel ? (
          <Button size="sm" variant="outline" onClick={onLocalModelDownload}>
            <Download />
            {t(localModelStatus === 'error' ? 'common.retry' : 'settings.dependencies.localModels.download')}
          </Button>
        ) : null}
        {canCancelLocalModelDownload ? (
          <Button size="sm" variant="outline" onClick={onLocalModelCancel}>
            {t('common.cancel')}
          </Button>
        ) : null}
      </div>
    </header>
  )
}
