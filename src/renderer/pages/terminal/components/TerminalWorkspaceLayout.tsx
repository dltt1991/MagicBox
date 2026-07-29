import { Button, NormalTooltip, ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@cherrystudio/ui'
import { usePersistCache } from '@data/hooks/useCache'
import { Maximize2, Minimize2, PanelBottom, PanelRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export type TerminalWorkspaceLayoutMode = 'right' | 'bottom' | 'terminal-maximized' | 'preview-maximized'

interface TerminalWorkspaceLayoutProps {
  fileTree: ReactNode
  terminal: ReactNode
  preview: ReactNode
}

interface LayoutActionProps {
  label: string
  onClick: () => void
  children: ReactNode
}

function LayoutAction({ label, onClick, children }: LayoutActionProps) {
  return (
    <NormalTooltip content={label}>
      <Button aria-label={label} onClick={onClick} size="icon-sm" title={label} variant="ghost">
        {children}
      </Button>
    </NormalTooltip>
  )
}

function isLayoutMode(value: unknown): value is TerminalWorkspaceLayoutMode {
  return value === 'right' || value === 'bottom' || value === 'terminal-maximized' || value === 'preview-maximized'
}

function toPercentSize(size: number): string {
  return `${size}%`
}

export function TerminalWorkspaceLayout({ fileTree, terminal, preview }: TerminalWorkspaceLayoutProps) {
  const { t } = useTranslation()
  const [storedMode, setStoredMode] = usePersistCache('terminal.layout.mode')
  const [rightSizes, setRightSizes] = usePersistCache('terminal.layout.right_sizes')
  const [bottomSizes, setBottomSizes] = usePersistCache('terminal.layout.bottom_sizes')
  const mode = isLayoutMode(storedMode) ? storedMode : 'right'
  const setMode = (nextMode: TerminalWorkspaceLayoutMode) => setStoredMode(nextMode)

  const terminalPane = (
    <section className="flex min-w-0 flex-1 flex-col" data-testid="terminal-workspace-terminal">
      {terminal}
    </section>
  )
  const previewPane = (
    <aside className="min-h-0 min-w-0" data-testid="terminal-workspace-preview">
      {preview}
    </aside>
  )

  const layout =
    mode === 'terminal-maximized' ? (
      terminalPane
    ) : mode === 'preview-maximized' ? (
      previewPane
    ) : (
      <ResizablePanelGroup
        direction={mode === 'right' ? 'horizontal' : 'vertical'}
        onLayoutChanged={(sizes) => {
          const nextSizes: [number, number] = [sizes.primary ?? 60, sizes.secondary ?? 40]
          if (mode === 'right') setRightSizes(nextSizes)
          else setBottomSizes(nextSizes)
        }}>
        <ResizablePanel
          defaultSize={toPercentSize((mode === 'right' ? rightSizes : bottomSizes)[0])}
          id="primary"
          minSize="25%">
          {terminalPane}
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel
          defaultSize={toPercentSize((mode === 'right' ? rightSizes : bottomSizes)[1])}
          id="secondary"
          minSize="20%">
          {previewPane}
        </ResizablePanel>
      </ResizablePanelGroup>
    )

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col"
      data-layout-mode={mode}
      data-testid="terminal-workspace-layout">
      <div className="flex h-10 shrink-0 items-center justify-end gap-1 border-border border-b px-2">
        <LayoutAction label={t('terminal.workspace.layout.right')} onClick={() => setMode('right')}>
          <PanelRight />
        </LayoutAction>
        <LayoutAction label={t('terminal.workspace.layout.bottom')} onClick={() => setMode('bottom')}>
          <PanelBottom />
        </LayoutAction>
        <LayoutAction
          label={t('terminal.workspace.layout.terminal_maximize')}
          onClick={() => setMode('terminal-maximized')}>
          <Maximize2 />
        </LayoutAction>
        <LayoutAction
          label={t('terminal.workspace.layout.preview_maximize')}
          onClick={() => setMode('preview-maximized')}>
          <Maximize2 />
        </LayoutAction>
        {(mode === 'terminal-maximized' || mode === 'preview-maximized') && (
          <LayoutAction label={t('terminal.workspace.layout.restore')} onClick={() => setMode('right')}>
            <Minimize2 />
          </LayoutAction>
        )}
      </div>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-64 min-w-56 flex-col border-border border-r" data-testid="terminal-workspace-tree">
          {fileTree}
        </aside>
        <div className="flex min-w-0 flex-1">{layout}</div>
      </div>
    </div>
  )
}
