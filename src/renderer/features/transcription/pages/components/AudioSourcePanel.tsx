import { Button, Input } from '@cherrystudio/ui'
import { Pause, Play, Square } from 'lucide-react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'

import type { AudioRecorderStatus } from '../hooks/useAudioRecorder'

type AudioSourcePanelProps = {
  audioRef: RefObject<HTMLAudioElement | null>
  audioUrl: string | null
  error: Error | null
  isMissing: boolean
  inputDisabled?: boolean
  mode: 'recording' | 'file'
  onChooseFile: () => void
  onPause: () => void
  onResume: () => void
  onStart: () => void
  onStop: () => void
  onSourceNameChange?: (name: string) => void
  recordingStatus: AudioRecorderStatus
  sourceName: string | null
}

export function AudioSourcePanel({
  audioRef,
  audioUrl,
  error,
  isMissing,
  inputDisabled = false,
  mode,
  onChooseFile,
  onPause,
  onResume,
  onStart,
  onStop,
  onSourceNameChange,
  recordingStatus,
  sourceName
}: AudioSourcePanelProps) {
  const { t } = useTranslation()

  return (
    <section className="grid min-h-38 gap-3 border-border-subtle border-b py-3">
      <div className="flex min-w-0 items-center gap-2">
        {mode === 'recording' ? (
          recordingStatus === 'idle' || recordingStatus === 'starting' ? (
            <Button
              disabled={inputDisabled || recordingStatus === 'starting'}
              loading={recordingStatus === 'starting'}
              onClick={onStart}>
              <Play />
              {t('transcription.start_recording')}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                disabled={inputDisabled || recordingStatus === 'saving'}
                onClick={recordingStatus === 'paused' ? onResume : onPause}>
                {recordingStatus === 'paused' ? <Play /> : <Pause />}
                {recordingStatus === 'paused' ? t('transcription.resume') : t('transcription.pause')}
              </Button>
              <Button variant="destructive" disabled={inputDisabled || recordingStatus === 'saving'} onClick={onStop}>
                <Square />
                {t('transcription.stop')}
              </Button>
            </>
          )
        ) : (
          <Button disabled={inputDisabled} onClick={onChooseFile}>
            {t('transcription.choose_audio_file')}
          </Button>
        )}
        {onSourceNameChange && !inputDisabled ? (
          <Input
            aria-label={t('transcription.task_name')}
            className="h-8 min-w-0 max-w-80 flex-1"
            value={sourceName ?? ''}
            onChange={(event) => onSourceNameChange(event.target.value)}
          />
        ) : sourceName ? (
          <span className="min-w-0 truncate text-muted-foreground text-sm">{sourceName}</span>
        ) : null}
      </div>
      {audioUrl ? <audio ref={audioRef} className="h-9 w-full" controls src={audioUrl} /> : null}
      {isMissing ? <p className="text-sm text-warning">{t('transcription.audio_unavailable')}</p> : null}
      {error ? <p className="text-error text-sm">{errorMessageText(error, t)}</p> : null}
    </section>
  )
}

function errorMessageText(error: Error, t: (key: string, options?: Record<string, string>) => string): string {
  if (error.message.startsWith('transcription.error.organization_failed|')) {
    return t('transcription.error.organization_failed', {
      detail: error.message.slice('transcription.error.organization_failed|'.length)
    })
  }
  if (error.message.startsWith('transcription.error.')) return t(error.message)
  return t('transcription.error.operation_failed')
}
