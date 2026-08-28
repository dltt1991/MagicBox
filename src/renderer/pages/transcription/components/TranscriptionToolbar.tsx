import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@cherrystudio/ui'
import type { TranscriptionLanguage } from '@shared/data/types/transcription'
import type { TranscriptionBackendConfig } from '@shared/ipc/schemas/transcription'
import { useTranslation } from 'react-i18next'

type SourceMode = 'recording' | 'file'

type TranscriptionToolbarProps = {
  backend: TranscriptionBackendConfig['backend']
  language: TranscriptionLanguage
  localModelStatus: string
  onBackendChange: (backend: TranscriptionBackendConfig['backend']) => void
  onLanguageChange: (language: TranscriptionLanguage) => void
  onSourceModeChange: (sourceMode: SourceMode) => void
  providerAvailable: boolean
  recordingActive?: boolean
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
  localModelStatus,
  onBackendChange,
  onLanguageChange,
  onSourceModeChange,
  providerAvailable,
  recordingActive = false,
  sourceMode
}: TranscriptionToolbarProps) {
  const { t } = useTranslation()

  return (
    <header className="flex flex-wrap items-center gap-2 border-border-subtle border-b pb-3">
      <div className="flex shrink-0 rounded-md border border-border p-0.5" aria-label={t('transcription.source')}>
        <Button
          size="sm"
          variant={sourceMode === 'recording' ? 'default' : 'ghost'}
          disabled={recordingActive}
          onClick={() => onSourceModeChange('recording')}>
          {t('transcription.recording')}
        </Button>
        <Button
          size="sm"
          variant={sourceMode === 'file' ? 'default' : 'ghost'}
          disabled={recordingActive}
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
          <SelectItem disabled={!providerAvailable} value="provider_model">
            {t('transcription.backend_provider')}
          </SelectItem>
          <SelectItem value="custom_endpoint">{t('transcription.backend_custom')}</SelectItem>
        </SelectContent>
      </Select>
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
      <span className="ml-auto text-muted-foreground text-xs">
        {t(MODEL_STATUS_LABEL_KEYS[localModelStatus] ?? 'transcription.model_status.not_downloaded')}
      </span>
    </header>
  )
}
