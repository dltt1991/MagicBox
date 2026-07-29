import { Button } from '@cherrystudio/ui'
import type { TerminalSessionMetadata } from '@shared/ipc/schemas/terminal'
import { Plus, Terminal, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface TerminalTabsProps {
  sessions: readonly TerminalSessionMetadata[]
  activeSessionId: string | null
  onCreate: () => void
  onSelect: (id: string) => void
  onClose: (id: string) => void
}

export function TerminalTabs({ sessions, activeSessionId, onCreate, onSelect, onClose }: TerminalTabsProps) {
  const { t } = useTranslation()

  return (
    <div className="flex h-9 shrink-0 items-center border-border border-b bg-muted/30 px-1">
      <div
        aria-label={t('terminal.title')}
        className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
        role="tablist">
        {sessions.map((session, index) => {
          const label = t('terminal.session', { index: index + 1 })
          const isActive = session.id === activeSessionId

          return (
            <div className="flex shrink-0 items-center" key={session.id}>
              <Button
                aria-selected={isActive}
                className={
                  isActive
                    ? 'h-7 gap-1.5 rounded-r-none px-2 text-xs shadow-none'
                    : 'h-7 gap-1.5 rounded-r-none px-2 text-muted-foreground text-xs shadow-none'
                }
                onClick={() => onSelect(session.id)}
                role="tab"
                size="sm"
                type="button"
                variant={isActive ? 'secondary' : 'ghost'}>
                <Terminal className="size-3.5" />
                <span>{label}</span>
              </Button>
              <Button
                aria-label={t('terminal.close_session', { index: index + 1 })}
                className={
                  isActive
                    ? 'h-7 rounded-l-none px-1.5 shadow-none'
                    : 'h-7 rounded-l-none px-1.5 text-muted-foreground shadow-none'
                }
                onClick={() => onClose(session.id)}
                size="sm"
                title={t('terminal.close_session', { index: index + 1 })}
                type="button"
                variant={isActive ? 'secondary' : 'ghost'}>
                <X className="size-3.5" />
              </Button>
            </div>
          )
        })}
      </div>
      <Button
        aria-label={t('terminal.new_session')}
        className="size-7 shrink-0 shadow-none"
        onClick={onCreate}
        size="icon-sm"
        title={t('terminal.new_session')}
        type="button"
        variant="ghost">
        <Plus className="size-4" />
      </Button>
    </div>
  )
}
