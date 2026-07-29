import { Button, NormalTooltip, ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@cherrystudio/ui'
import { usePersistCache } from '@data/hooks/useCache'
import { Eye, EyeOff, Maximize2, Minimize2, PanelBottom, PanelRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export type TerminalWorkspaceLayoutMode = 'right' | 'bottom' | 'terminal-maximized' | 'files-maximized'
type StoredTerminalWorkspaceLayoutMode = TerminalWorkspaceLayoutMode | 'preview-maximized'

interface TerminalWorkspaceLayoutProps {
  fileManager: ReactNode | ((actions: ReactNode) => ReactNode)
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
  const [terminalVisible, setTerminalVisible] = usePersistCache('terminal.workspace.terminal_visible')
  const mode = normalizeLayoutMode(storedMode)
  const isTerminalVisible = terminalVisible !== false
  const setMode = (nextMode: TerminalWorkspaceLayoutMode) =>
    setStoredMode(nextMode as StoredTerminalWorkspaceLayoutMode)

  const terminalLayoutActions = (
    <div className="absolute top-1 right-2 z-10 flex h-8 items-center gap-1" data-testid="terminal-pane-layout-actions">
      {mode === 'terminal-maximized' ? (
        <LayoutAction label={t('terminal.workspace.layout.restore')} onClick={() => setMode('right')}>
          <Minimize2 />
        </LayoutAction>
      ) : (
        <LayoutAction
          label={t('terminal.workspace.layout.terminal_maximize')}
          onClick={() => setMode('terminal-maximized')}>
          <Maximize2 />
        </LayoutAction>
      )}
    </div>
  )
  const fileManagerLayoutActions = (
    <div className="flex h-8 shrink-0 items-center gap-1" data-testid="file-manager-layout-actions">
      <LayoutAction
        label={t('terminal.workspace.layout.right')}
        onClick={() => {
          setTerminalVisible(true)
          setMode('right')
        }}>
        <PanelRight />
      </LayoutAction>
      <LayoutAction
        label={t('terminal.workspace.layout.bottom')}
        onClick={() => {
          setTerminalVisible(true)
          setMode('bottom')
        }}>
        <PanelBottom />
      </LayoutAction>
      {mode === 'files-maximized' ? (
        <LayoutAction label={t('terminal.workspace.layout.restore')} onClick={() => setMode('right')}>
          <Minimize2 />
        </LayoutAction>
      ) : (
        <LayoutAction label={t('terminal.workspace.layout.files_maximize')} onClick={() => setMode('files-maximized')}>
          <Maximize2 />
        </LayoutAction>
      )}
      <LayoutAction
        label={t(
          isTerminalVisible ? 'terminal.workspace.layout.hide_terminal' : 'terminal.workspace.layout.show_terminal'
        )}
        onClick={() => setTerminalVisible(!isTerminalVisible)}>
        {isTerminalVisible ? <EyeOff /> : <Eye />}
      </LayoutAction>
    </div>
  )
  const fileManagerContent = typeof fileManager === 'function' ? fileManager(fileManagerLayoutActions) : fileManager
  const terminalPane = (
    <section
      className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      data-testid="terminal-workspace-terminal">
      {terminalLayoutActions}
      {terminal}
    </section>
  )
  const fileManagerPane = (
    <aside
      className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
      data-testid="terminal-workspace-file-manager">
      {fileManagerContent}
    </aside>
  )

  const layout = !isTerminalVisible ? (
    fileManagerPane
  ) : mode === 'terminal-maximized' ? (
    terminalPane
  ) : mode === 'files-maximized' ? (
    fileManagerPane
  ) : (
    <ResizablePanelGroup
      className="h-full min-h-0 overflow-hidden"
      direction={mode === 'right' ? 'horizontal' : 'vertical'}
      onLayoutChanged={(sizes) => {
        const nextSizes: [number, number] = [sizes.primary ?? 35, sizes.secondary ?? 65]
        if (mode === 'right') setRightSizes(nextSizes)
        else setBottomSizes(nextSizes)
      }}>
      <ResizablePanel
        defaultSize={toPercentSize((mode === 'right' ? rightSizes : bottomSizes)[0])}
        id="primary"
        minSize="20%"
        className="min-h-0 overflow-hidden">
        {fileManagerPane}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel
        defaultSize={toPercentSize((mode === 'right' ? rightSizes : bottomSizes)[1])}
        id="secondary"
        minSize="30%"
        className="min-h-0 overflow-hidden">
        {terminalPane}
      </ResizablePanel>
    </ResizablePanelGroup>
  )

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col"
      data-layout-mode={mode}
      data-terminal-visible={String(isTerminalVisible)}
      data-testid="terminal-workspace-layout">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">{layout}</div>
      </div>
    </div>
  )
}
