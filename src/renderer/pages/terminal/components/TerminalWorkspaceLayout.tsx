import { Button, NormalTooltip, ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@cherrystudio/ui'
import { cn } from '@cherrystudio/ui/lib/utils'
import { usePersistCache } from '@data/hooks/useCache'
import { Maximize2, Minimize2, PanelBottom, PanelRight, PanelRightClose, PanelRightOpen } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export type TerminalWorkspaceLayoutMode = 'right' | 'bottom' | 'terminal-maximized' | 'files-maximized'
type StoredTerminalWorkspaceLayoutMode = TerminalWorkspaceLayoutMode | 'preview-maximized'
type TerminalWorkspaceSplitMode = 'right' | 'bottom'

interface TerminalWorkspaceLayoutProps {
  fileManager: ReactNode | ((actions: ReactNode) => ReactNode)
  terminal: ReactNode | ((actions: ReactNode, onHeaderDoubleClick: () => void) => ReactNode)
  onShowTerminal?: () => void
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

function normalizeSplitMode(value: unknown): TerminalWorkspaceSplitMode {
  return value === 'bottom' ? 'bottom' : 'right'
}

function toPercentSize(size: number): string {
  return `${size}%`
}

export function TerminalWorkspaceLayout({ fileManager, terminal, onShowTerminal }: TerminalWorkspaceLayoutProps) {
  const { t } = useTranslation()
  const [storedMode, setStoredMode] = usePersistCache('terminal.layout.mode')
  const [storedLastSplitMode, setStoredLastSplitMode] = usePersistCache('terminal.layout.last_split_mode')
  const [rightSizes, setRightSizes] = usePersistCache('terminal.layout.right_sizes')
  const [bottomSizes, setBottomSizes] = usePersistCache('terminal.layout.bottom_sizes')
  const [terminalVisible, setTerminalVisible] = usePersistCache('terminal.workspace.terminal_visible')
  const mode = normalizeLayoutMode(storedMode)
  const lastSplitMode = normalizeSplitMode(storedLastSplitMode)
  const isTerminalVisible = terminalVisible !== false
  const splitMode = mode === 'terminal-maximized' ? lastSplitMode : normalizeSplitMode(mode)
  const isTerminalMaximized = mode === 'terminal-maximized'
  const setMode = (nextMode: TerminalWorkspaceLayoutMode) =>
    setStoredMode(nextMode as StoredTerminalWorkspaceLayoutMode)
  const rememberSplitMode = () => {
    if (mode === 'right' || mode === 'bottom') setStoredLastSplitMode(mode)
  }
  const showTerminal = () => {
    const wasHidden = !isTerminalVisible
    setTerminalVisible(true)
    if (wasHidden) onShowTerminal?.()
  }
  const toggleTerminalMaximized = () => {
    if (mode === 'terminal-maximized') {
      setMode(lastSplitMode)
      return
    }

    rememberSplitMode()
    setMode('terminal-maximized')
  }

  const terminalLayoutActions = (
    <div className="flex h-8 shrink-0 items-center gap-1" data-testid="terminal-pane-layout-actions">
      {mode === 'terminal-maximized' ? (
        <LayoutAction label={t('terminal.workspace.layout.restore')} onClick={toggleTerminalMaximized}>
          <Minimize2 />
        </LayoutAction>
      ) : (
        <LayoutAction label={t('terminal.workspace.layout.terminal_maximize')} onClick={toggleTerminalMaximized}>
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
          showTerminal()
          setStoredLastSplitMode('right')
          setMode('right')
        }}>
        <PanelRight />
      </LayoutAction>
      <LayoutAction
        label={t('terminal.workspace.layout.bottom')}
        onClick={() => {
          showTerminal()
          setStoredLastSplitMode('bottom')
          setMode('bottom')
        }}>
        <PanelBottom />
      </LayoutAction>
      <LayoutAction
        label={t(
          isTerminalVisible ? 'terminal.workspace.layout.hide_terminal' : 'terminal.workspace.layout.show_terminal'
        )}
        onClick={() => {
          if (isTerminalVisible) setTerminalVisible(false)
          else showTerminal()
        }}>
        {isTerminalVisible ? <PanelRightClose /> : <PanelRightOpen />}
      </LayoutAction>
    </div>
  )
  const fileManagerContent = typeof fileManager === 'function' ? fileManager(fileManagerLayoutActions) : fileManager
  const terminalContent =
    typeof terminal === 'function' ? terminal(terminalLayoutActions, toggleTerminalMaximized) : terminal
  const terminalPane = (
    <section
      className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      data-testid="terminal-workspace-terminal">
      {terminalContent}
    </section>
  )
  const fileManagerPane = (
    <aside
      className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      data-testid="terminal-workspace-file-manager">
      {fileManagerContent}
    </aside>
  )

  const layout =
    !isTerminalVisible || mode === 'files-maximized' ? (
      fileManagerPane
    ) : mode === 'right' || mode === 'bottom' || mode === 'terminal-maximized' ? (
      <ResizablePanelGroup
        className="relative h-full min-h-0 overflow-hidden"
        direction={splitMode === 'right' ? 'horizontal' : 'vertical'}
        onLayoutChanged={(sizes) => {
          if (isTerminalMaximized) return
          const nextSizes: [number, number] = [sizes.primary ?? 35, sizes.secondary ?? 65]
          if (splitMode === 'right') setRightSizes(nextSizes)
          else setBottomSizes(nextSizes)
        }}>
        <ResizablePanel
          defaultSize={
            isTerminalMaximized ? '0%' : toPercentSize((splitMode === 'right' ? rightSizes : bottomSizes)[0])
          }
          id="primary"
          minSize={isTerminalMaximized ? '0%' : '20%'}
          className={cn('min-h-0 overflow-hidden', isTerminalMaximized && 'hidden')}>
          {fileManagerPane}
        </ResizablePanel>
        {!isTerminalMaximized && <ResizableHandle withHandle />}
        <ResizablePanel
          defaultSize={
            isTerminalMaximized ? '100%' : toPercentSize((splitMode === 'right' ? rightSizes : bottomSizes)[1])
          }
          id="secondary"
          minSize="30%"
          className={cn('min-h-0 overflow-hidden', isTerminalMaximized && 'absolute inset-0 z-20')}>
          {terminalPane}
        </ResizablePanel>
      </ResizablePanelGroup>
    ) : (
      fileManagerPane
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
