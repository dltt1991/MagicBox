import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Textarea } from '@cherrystudio/ui'
import CopyButton from '@renderer/components/CopyButton'
import type { TranscriptionSegment } from '@shared/data/types/transcription'
import Maximize2 from 'lucide-react/dist/esm/icons/maximize-2'
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
  const [expanded, setExpanded] = useState(false)
  const seek = useSegmentSeek(audioRef)

  useEffect(() => setDraft(text), [resetKey, text])

  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden py-3">
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
          <Button
            size="icon"
            variant="ghost"
            aria-label={t('transcription.maximize')}
            onClick={() => setExpanded(true)}>
            <Maximize2 className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
      <TranscriptWorkspace
        draft={draft}
        onDraftChange={setDraft}
        onSeek={seek}
        segments={segments}
        textareaLabel={t('transcription.transcript')}
      />
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="grid h-[min(86vh,820px)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-6xl" size="xl">
          <DialogHeader>
            <DialogTitle>{t('transcription.transcript')}</DialogTitle>
          </DialogHeader>
          <TranscriptWorkspace
            draft={draft}
            onDraftChange={setDraft}
            onSeek={seek}
            segments={segments}
            textareaLabel={t('transcription.transcript')}
          />
        </DialogContent>
      </Dialog>
    </section>
  )
}

function TranscriptWorkspace({
  draft,
  onDraftChange,
  onSeek,
  segments,
  textareaLabel
}: {
  draft: string
  onDraftChange: (value: string) => void
  onSeek: (milliseconds: number) => void
  segments: TranscriptionSegment[]
  textareaLabel: string
}) {
  return (
    <div
      className="grid min-h-0 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]"
      data-testid="transcript-workspace">
      <Textarea.Input
        aria-label={textareaLabel}
        className="field-sizing-fixed h-full min-h-0 resize-none overflow-y-auto"
        value={draft}
        onValueChange={onDraftChange}
      />
      <div className="min-h-0 overflow-y-auto border-border-subtle border-t pt-2 md:border-t-0 md:border-l md:pl-3 md:pt-0">
        {segments.map((segment, index) => (
          <button
            key={`${segment.startMs}-${index}`}
            type="button"
            className="grid w-full grid-cols-[3.5rem_minmax(0,1fr)] gap-2 px-1 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent"
            aria-label={`${formatTime(segment.startMs)} ${segment.text}`}
            onClick={() => onSeek(segment.startMs)}>
            <span className="text-muted-foreground tabular-nums">{formatTime(segment.startMs)}</span>
            <span className="truncate">{segment.text}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function formatTime(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
