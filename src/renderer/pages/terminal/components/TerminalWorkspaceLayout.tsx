import { Button, NormalTooltip, ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@cherrystudio/ui'
import { usePersistCache } from '@data/hooks/useCache'
import { Files, Maximize2, Minimize2, PanelBottom, PanelRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export type TerminalWorkspaceLayoutMode = 'right' | 'bottom' | 'terminal-maximized' | 'files-maximized'
type StoredTerminalWorkspaceLayoutMode = TerminalWorkspaceLayoutMode | 'preview-maximized'

interface TerminalWorkspaceLayoutProps {
  fileManager: ReactNode
  terminal: ReactNode
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

function normalizeLayoutMode(value: unknown): TerminalWorkspaceLayoutMode {
  if (value === 'preview-maximized') return 'files-maximized'
  if (value === 'right' || value === 'bottom' || value === 'terminal-maximized' || value === 'files-maximized') {
    return value
  }
  return 'right'
}

function toPercentSize(size: number): string {
  return `${size}%`
}

export function TerminalWorkspaceLayout({ fileManager, terminal }: TerminalWorkspaceLayoutProps) {
  const { t } = useTranslation()
  const [storedMode, setStoredMode] = usePersistCache('terminal.layout.mode')
  const [rightSizes, setRightSizes] = usePersistCache('terminal.layout.right_sizes')
  const [bottomSizes, setBottomSizes] = usePersistCache('terminal.layout.bottom_sizes')
  const mode = normalizeLayoutMode(storedMode)
  const setMode = (nextMode: TerminalWorkspaceLayoutMode) =>
    setStoredMode(nextMode as StoredTerminalWorkspaceLayoutMode)

  const terminalPane = (
    <section className="flex min-w-0 flex-1 flex-col" data-testid="terminal-workspace-terminal">
      {terminal}
    </section>
  )
  const fileManagerPane = (
    <aside className="flex min-h-0 min-w-0 flex-col" data-testid="terminal-workspace-file-manager">
      {fileManager}
    </aside>
  )

  const layout =
    mode === 'terminal-maximized' ? (
      terminalPane
    ) : mode === 'files-maximized' ? (
      fileManagerPane
    ) : (
      <ResizablePanelGroup
        direction={mode === 'right' ? 'horizontal' : 'vertical'}
        onLayoutChanged={(sizes) => {
          const nextSizes: [number, number] = [sizes.primary ?? 35, sizes.secondary ?? 65]
          if (mode === 'right') setRightSizes(nextSizes)
          else setBottomSizes(nextSizes)
        }}>
        <ResizablePanel
          defaultSize={toPercentSize((mode === 'right' ? rightSizes : bottomSizes)[0])}
          id="primary"
          minSize="20%">
          {fileManagerPane}
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel
          defaultSize={toPercentSize((mode === 'right' ? rightSizes : bottomSizes)[1])}
          id="secondary"
          minSize="30%">
          {terminalPane}
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
        <LayoutAction label={t('terminal.workspace.layout.files_maximize')} onClick={() => setMode('files-maximized')}>
          <Files />
        </LayoutAction>
        {(mode === 'terminal-maximized' || mode === 'files-maximized') && (
          <LayoutAction label={t('terminal.workspace.layout.restore')} onClick={() => setMode('right')}>
            <Minimize2 />
          </LayoutAction>
        )}
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1">{layout}</div>
      </div>
    </div>
  )
}
