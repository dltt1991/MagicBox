import { Button, ConfirmDialog } from '@cherrystudio/ui'
import type { TranscriptionRecord } from '@shared/data/types/transcription'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

type TranscriptionHistorySidebarProps = {
  missingRecordIds: ReadonlySet<string>
  onDelete: (record: TranscriptionRecord, deleteAudio: boolean) => void
  onSelect: (recordId: string) => void
  records: TranscriptionRecord[]
  selectedId: string | null
}

export function TranscriptionHistorySidebar({
  missingRecordIds,
  onDelete,
  onSelect,
  records,
  selectedId
}: TranscriptionHistorySidebarProps) {
  const { t } = useTranslation()
  const [deleteTarget, setDeleteTarget] = useState<TranscriptionRecord | null>(null)
  const [deleteAudio, setDeleteAudio] = useState(false)

  return (
    <aside className="flex min-h-0 w-full flex-col border-border-subtle border-l bg-sidebar lg:w-64">
      <div className="shrink-0 border-border-subtle border-b px-3 py-2">
        <h2 className="font-medium text-sm">{t('transcription.history')}</h2>
      </div>
      <div className="min-h-0 overflow-y-auto p-2">
        {records.map((record) => {
          const missing = missingRecordIds.has(record.id)
          return (
            <div key={record.id} className={selectedId === record.id ? 'bg-accent' : ''}>
              <div className="flex items-center gap-1 px-2 py-2">
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-sm focus-visible:bg-accent"
                  aria-label={record.title}
                  onClick={() => onSelect(record.id)}>
                  {record.title}
                </button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t('transcription.delete_record', { title: record.title })}
                  onClick={() => {
                    setDeleteTarget(record)
                    setDeleteAudio(false)
                  }}>
                  <Trash2 />
                </Button>
              </div>
              <div className="flex items-center gap-2 px-2 pb-2 text-muted-foreground text-xs">
                <span>{formatDuration(record.durationMs)}</span>
                <span className="truncate">{record.modelId ?? record.backend ?? t('transcription.not_available')}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={missing}
                  aria-label={t('transcription.play_record', { title: record.title })}
                  onClick={() => onSelect(record.id)}>
                  {t('transcription.play')}
                </Button>
              </div>
              {missing ? (
                <p className="px-2 pb-2 text-warning text-xs">{t('transcription.audio_unavailable')}</p>
              ) : null}
            </div>
          )
        })}
      </div>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t('transcription.delete_record_title')}
        description={deleteTarget?.audioManaged ? t('transcription.delete_record_description') : undefined}
        content={
          deleteTarget?.audioManaged ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={deleteAudio} onChange={(event) => setDeleteAudio(event.target.checked)} />
              {t('transcription.delete_recording_audio')}
            </label>
          ) : undefined
        }
        cancelText={t('common.cancel')}
        confirmText={t('common.delete')}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) onDelete(deleteTarget, deleteAudio)
        }}
      />
    </aside>
  )
}

function formatDuration(durationMs: number | null): string {
  if (!durationMs) return '--:--'
  const seconds = Math.floor(durationMs / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
