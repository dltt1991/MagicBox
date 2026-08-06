import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuItemContent,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@cherrystudio/ui'
import type { TerminalSessionMetadata } from '@shared/ipc/schemas/terminal'
import { Check, Palette, Pencil, Plus, Terminal, Trash2, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { TerminalQuickCommand } from '../lib/terminalQuickCommands'
import type { TerminalThemeDefinition, TerminalThemeKey } from '../lib/terminalThemes'

interface TerminalTabsProps {
  sessions: readonly TerminalSessionMetadata[]
  activeSessionId: string | null
  onCreate: () => void
  onSelect: (id: string) => void
  onClose: (id: string) => void
  actions?: ReactNode
  onHeaderDoubleClick?: () => void
  themes?: readonly TerminalThemeDefinition[]
  selectedThemeKey?: TerminalThemeKey
  onThemeChange?: (theme: TerminalThemeKey) => void
  quickCommands?: readonly TerminalQuickCommand[]
  onOpenQuickCommandDialog?: () => void
  onRunQuickCommand?: (command: TerminalQuickCommand) => void
  onEditQuickCommand?: (command: TerminalQuickCommand) => void
  onDeleteQuickCommand?: (id: string) => void
}

function getTerminalSessionLabel(session: TerminalSessionMetadata, fallback: string): string {
  if (session.processName) return session.processName

  const { cwd } = session
  const normalized = cwd.replace(/[\\/]+$/, '')
  const basename = normalized.split(/[\\/]/).filter(Boolean).at(-1)
  return basename || fallback
}

export function TerminalTabs({
  sessions,
  activeSessionId,
  onCreate,
  onSelect,
  onClose,
  actions,
  onHeaderDoubleClick,
  themes = [],
  selectedThemeKey,
  onThemeChange,
  quickCommands = [],
  onOpenQuickCommandDialog,
  onRunQuickCommand,
  onEditQuickCommand,
  onDeleteQuickCommand
}: TerminalTabsProps) {
  const { t } = useTranslation()
  const selectedTheme = themes.find(({ key }) => key === selectedThemeKey)

  const tabBar = (
    <div
      className="flex h-9 shrink-0 items-center border-border border-b bg-muted/30 px-1"
      data-testid="terminal-tabs-bar"
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest('button')) return
        onHeaderDoubleClick?.()
      }}>
      <div
        aria-label={t('terminal.title')}
        className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
        role="toolbar">
        {sessions.map((session, index) => {
          const fallbackLabel = t('terminal.session', { index: index + 1 })
          const label = getTerminalSessionLabel(session, fallbackLabel)
          const isActive = session.id === activeSessionId

          return (
            <div className="flex shrink-0 items-center" key={session.id}>
              <Button
                className={
                  isActive
                    ? 'h-7 gap-1.5 rounded-r-none px-2 text-xs shadow-none'
                    : 'h-7 gap-1.5 rounded-r-none px-2 text-muted-foreground text-xs shadow-none'
                }
                onClick={() => onSelect(session.id)}
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
      <div className="flex shrink-0 items-center gap-1" data-testid="terminal-tabs-actions">
        {quickCommands.map((quickCommand) => {
          const label = quickCommand.label?.trim() || quickCommand.command
          const button = (
            <Button
              aria-label={label}
              className={
                quickCommand.iconDataUrl ? 'size-7 shrink-0 p-1 shadow-none' : 'h-7 shrink-0 px-2 text-xs shadow-none'
              }
              onClick={(event) => {
                event.currentTarget.blur()
                onRunQuickCommand?.(quickCommand)
              }}
              size={quickCommand.iconDataUrl ? 'icon-sm' : 'sm'}
              title={quickCommand.command}
              type="button"
              variant="ghost">
              {quickCommand.iconDataUrl ? (
                <img alt="" className="size-full rounded-sm object-contain" src={quickCommand.iconDataUrl} />
              ) : (
                <span className="max-w-24 truncate">{label}</span>
              )}
            </Button>
          )

          return (
            <ContextMenu key={quickCommand.id}>
              <ContextMenuTrigger asChild>{button}</ContextMenuTrigger>
              <ContextMenuContent className="min-w-32">
                <ContextMenuItem onSelect={() => onEditQuickCommand?.(quickCommand)}>
                  <ContextMenuItemContent icon={<Pencil size={12} />}>
                    {t('terminal.quick_command.edit')}
                  </ContextMenuItemContent>
                </ContextMenuItem>
                <ContextMenuItem variant="destructive" onSelect={() => onDeleteQuickCommand?.(quickCommand.id)}>
                  <ContextMenuItemContent icon={<Trash2 size={12} />}>
                    {t('terminal.quick_command.delete')}
                  </ContextMenuItemContent>
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          )
        })}
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
        {themes.length > 0 && selectedThemeKey && onThemeChange && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={t('terminal.theme.select')}
                className="size-7 shrink-0 shadow-none"
                size="icon-sm"
                title={selectedTheme ? t(selectedTheme.labelKey) : t('terminal.theme.select')}
                type="button"
                variant="ghost">
                <Palette className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              {themes.map((theme) => (
                <DropdownMenuItem key={theme.key} onSelect={() => onThemeChange(theme.key)}>
                  <span
                    aria-hidden="true"
                    className="size-3 rounded-[2px] border border-border"
                    style={{ backgroundColor: theme.swatch }}
                  />
                  <span className="min-w-0 flex-1 truncate">{t(theme.labelKey)}</span>
                  {theme.key === selectedThemeKey && <Check className="size-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {actions}
      </div>
    </div>
  )

  if (!onOpenQuickCommandDialog) return tabBar

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{tabBar}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-40">
        <ContextMenuItem onSelect={onOpenQuickCommandDialog}>
          <ContextMenuItemContent>{t('terminal.quick_command.customize')}</ContextMenuItemContent>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
