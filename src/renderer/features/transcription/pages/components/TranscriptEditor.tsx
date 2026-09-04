import { Button, Textarea } from '@cherrystudio/ui'
import CopyButton from '@renderer/components/CopyButton'
import type { TranscriptionSegment } from '@shared/data/types/transcription'
import type { RefObject } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useSegmentSeek } from '../hooks/useSegmentSeek'

type TranscriptEditorProps = {
  audioRef: RefObject<HTMLAudioElement | null>
  disabled?: boolean
  isSaving?: boolean
  onExport?: (text: string) => void
  onSave?: (value: { segments: TranscriptionSegment[]; transcriptText: string }) => void
  resetKey?: string
  segments: TranscriptionSegment[]
  text: string
}

export function TranscriptEditor({
  audioRef,
  disabled = false,
  isSaving = false,
  onExport,
  onSave,
  resetKey,
  segments,
  text
}: TranscriptEditorProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(text)
  const seek = useSegmentSeek(audioRef)

  useEffect(() => setDraft(text), [resetKey, text])

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)] gap-3 overflow-hidden py-3">
      <div className="flex items-center gap-2">
        <h2 className="font-medium text-sm">{t('transcription.transcript')}</h2>
        <div className="ml-auto flex items-center gap-1">
          <CopyButton textToCopy={draft} tooltip={t('common.copy')} />
          <Button size="sm" variant="outline" onClick={() => onExport?.(draft)}>
            {t('transcription.export')}
          </Button>
          <Button
            size="sm"
            disabled={disabled || !onSave || draft === text}
            loading={isSaving}
            onClick={() => onSave?.({ transcriptText: draft, segments })}>
            {t('common.save')}
          </Button>
        </div>
      </div>
      <Textarea.Input
        aria-label={t('transcription.transcript')}
        className="field-sizing-fixed h-full min-h-0 resize-none overflow-y-auto"
        value={draft}
        onValueChange={setDraft}
      />
      <div className="min-h-0 overflow-y-auto border-border-subtle border-t pt-2">
        {segments.map((segment, index) => (
          <button
            key={`${segment.startMs}-${index}`}
            type="button"
            className="grid w-full grid-cols-[3.5rem_minmax(0,1fr)] gap-2 px-1 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent"
            aria-label={`${formatTime(segment.startMs)} ${segment.text}`}
            onClick={() => seek(segment.startMs)}>
            <span className="text-muted-foreground tabular-nums">{formatTime(segment.startMs)}</span>
            <span className="truncate">{segment.text}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function formatTime(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
