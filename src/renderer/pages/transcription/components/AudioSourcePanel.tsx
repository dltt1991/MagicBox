import { Button } from '@cherrystudio/ui'
import { Pause, Play, Square } from 'lucide-react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'

type AudioSourcePanelProps = {
  audioRef: RefObject<HTMLAudioElement | null>
  audioUrl: string | null
  error: Error | null
  isMissing: boolean
  mode: 'recording' | 'file'
  onChooseFile: () => void
  onPause: () => void
  onResume: () => void
  onStart: () => void
  onStop: () => void
  recordingStatus: 'idle' | 'recording' | 'paused' | 'saving'
  sourceName: string | null
}

export function AudioSourcePanel({
  audioRef,
  audioUrl,
  error,
  isMissing,
  mode,
  onChooseFile,
  onPause,
  onResume,
  onStart,
  onStop,
  recordingStatus,
  sourceName
}: AudioSourcePanelProps) {
  const { t } = useTranslation()

  return (
    <section className="grid min-h-38 gap-3 border-border-subtle border-b py-3">
      <div className="flex min-w-0 items-center gap-2">
        {mode === 'recording' ? (
          recordingStatus === 'idle' ? (
            <Button onClick={onStart}>
              <Play />
              {t('transcription.start_recording')}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                disabled={recordingStatus === 'saving'}
                onClick={recordingStatus === 'paused' ? onResume : onPause}>
                {recordingStatus === 'paused' ? <Play /> : <Pause />}
                {recordingStatus === 'paused' ? t('transcription.resume') : t('transcription.pause')}
              </Button>
              <Button variant="destructive" disabled={recordingStatus === 'saving'} onClick={onStop}>
                <Square />
                {t('transcription.stop')}
              </Button>
            </>
          )
        ) : (
          <Button onClick={onChooseFile}>{t('transcription.choose_audio_file')}</Button>
        )}
        {sourceName ? <span className="min-w-0 truncate text-muted-foreground text-sm">{sourceName}</span> : null}
      </div>
      {audioUrl ? <audio ref={audioRef} className="h-9 w-full" controls src={audioUrl} /> : null}
      {isMissing ? <p className="text-sm text-warning">{t('transcription.audio_unavailable')}</p> : null}
      {error ? <p className="text-error text-sm">{error.message}</p> : null}
    </section>
  )
}
