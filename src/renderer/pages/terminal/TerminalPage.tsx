import {
  Button,
  NormalTooltip,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch
} from '@cherrystudio/ui'
import { usePersistCache } from '@data/hooks/useCache'
import { useOpenFilePreviewTab } from '@renderer/components/FilePreview'
import { ipcApi } from '@renderer/ipc'
import { toast } from '@renderer/services/toast'
import { safeOpen } from '@renderer/utils/file/safeOpen'
import { normalizeFilePreviewPath } from '@renderer/utils/filePreview'
import { isWin } from '@renderer/utils/platform'
import { createFilePathHandle } from '@shared/utils/file'
import { ArrowDownAZ, ArrowUpAZ, FolderOpen, Grid2X2, List } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TerminalPane } from './components/TerminalPane'
import { TerminalTabs } from './components/TerminalTabs'
import { TerminalWorkspaceLayout } from './components/TerminalWorkspaceLayout'
import { WorkspaceFileTree } from './components/WorkspaceFileTree'
import { WorkspacePreviewPane } from './components/WorkspacePreviewPane'
import { useTerminalSessions } from './hooks/useTerminalSessions'
import type { WorkspaceSortDirection, WorkspaceSortKey, WorkspaceViewMode } from './lib/workspaceTree'

function isPathInsideRoot(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`) || path.startsWith(`${root}\\`)
}

export default function TerminalPage() {
  const { t } = useTranslation()
  const [workspaceRoot, setWorkspaceRoot] = usePersistCache('terminal.workspace.root')
  const [includeHidden, setIncludeHidden] = usePersistCache('terminal.workspace.include_hidden')
  const [viewMode, setViewMode] = usePersistCache('terminal.workspace.view_mode')
  const [sortKey, setSortKey] = usePersistCache('terminal.workspace.sort_key')
  const [sortDirection, setSortDirection] = usePersistCache('terminal.workspace.sort_direction')
  const [previewOpen, setPreviewOpen] = usePersistCache('terminal.workspace.preview_open')
  const [previewSizes, setPreviewSizes] = usePersistCache('terminal.workspace.preview_sizes')
  const [selectedWorkspacePath, setSelectedWorkspacePath] = useState<string | null>(null)
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null)
  const [defaultRootResolved, setDefaultRootResolved] = useState(false)
  const openFilePreviewTab = useOpenFilePreviewTab()
  const {
    activeSession,
    activeSessionId,
    closeSession,
    createSession,
    resizeSession,
    sendInput,
    sessions,
    setActiveSessionId
  } = useTerminalSessions({})

  useEffect(() => {
    void createSession()
  }, [createSession])

  useEffect(() => {
    if (workspaceRoot || defaultRootResolved) return
    setDefaultRootResolved(true)
    void window.api
      .resolvePath('~')
      .then((homePath) => {
        if (homePath) setWorkspaceRoot(homePath)
      })
      .catch(() => {
        // Keep the explicit empty state if the platform home path cannot be resolved.
      })
  }, [defaultRootResolved, setWorkspaceRoot, workspaceRoot])

  const selectWorkspace = useCallback(async () => {
    const rootPath = await window.api.file.selectFolder()
    if (!rootPath) return
    setWorkspaceRoot(rootPath)
    setSelectedWorkspacePath(null)
    setActiveFilePath(null)
    setPreviewOpen(false)
  }, [setPreviewOpen, setWorkspaceRoot])

  const activateTerminalPath = useCallback(
    async (path: string) => {
      setSelectedWorkspacePath(path)

      try {
        if (await window.api.file.isDirectory(path)) {
          if (!workspaceRoot || !isPathInsideRoot(path, workspaceRoot)) {
            setWorkspaceRoot(path)
            setSelectedWorkspacePath(null)
          }
          return
        }
      } catch {
        // Let FilePreview render its invalid-path state when a parsed terminal path no longer exists.
      }

      setActiveFilePath(path)
      setPreviewOpen(true)
    },
    [setPreviewOpen, setWorkspaceRoot, workspaceRoot]
  )

  const previewPane = previewOpen && activeFilePath && (
    <aside className="min-h-0 border-border border-t" data-testid="workspace-preview-pane">
      <WorkspacePreviewPane
        filePath={activeFilePath}
        onClose={() => setPreviewOpen(false)}
        onCopyPath={(filePath) => void navigator.clipboard.writeText(filePath)}
        onOpenInNewTab={(filePath) => openFilePreviewTab(normalizeFilePreviewPath(filePath))}
        onOpenSystem={(filePath) =>
          void safeOpen(createFilePathHandle(normalizeFilePreviewPath(filePath))).catch(() =>
            toast.error(t('file_preview.unsupported.open_error'))
          )
        }
        onShowInFolder={(filePath) =>
          void ipcApi.request('file.show_in_folder', createFilePathHandle(normalizeFilePreviewPath(filePath)))
        }
      />
    </aside>
  )
  const sortDirectionLabel =
    sortDirection === 'asc' ? t('terminal.workspace.sort.asc') : t('terminal.workspace.sort.desc')

  const fileManager = (
    <section className="flex h-full min-h-0 flex-col border-border border-r" data-testid="terminal-workspace-tree">
      <div className="flex h-10 min-h-10 items-center gap-1 border-border border-b px-2">
        <NormalTooltip content={t('terminal.workspace.choose')}>
          <Button
            aria-label={t('terminal.workspace.choose')}
            onClick={() => void selectWorkspace()}
            size="icon-sm"
            title={t('terminal.workspace.choose')}
            variant="ghost">
            <FolderOpen />
          </Button>
        </NormalTooltip>
        <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs" title={workspaceRoot ?? undefined}>
          {workspaceRoot ?? t('terminal.workspace.no_root')}
        </span>
      </div>
      <div className="flex h-9 shrink-0 items-center gap-1 border-border border-b px-2">
        <div className="flex shrink-0 items-center gap-0.5">
          <NormalTooltip content={t('terminal.workspace.view.list')}>
            <Button
              aria-label={t('terminal.workspace.view.list')}
              onClick={() => setViewMode('list')}
              size="icon-sm"
              title={t('terminal.workspace.view.list')}
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}>
              <List />
            </Button>
          </NormalTooltip>
          <NormalTooltip content={t('terminal.workspace.view.icons')}>
            <Button
              aria-label={t('terminal.workspace.view.icons')}
              onClick={() => setViewMode('icons')}
              size="icon-sm"
              title={t('terminal.workspace.view.icons')}
              variant={viewMode === 'icons' ? 'secondary' : 'ghost'}>
              <Grid2X2 />
            </Button>
          </NormalTooltip>
        </div>
        <Select value={sortKey} onValueChange={(value) => setSortKey(value as WorkspaceSortKey)}>
          <SelectTrigger aria-label={t('terminal.workspace.sort.label')} className="h-7 w-28 text-xs" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectItem value="name">{t('terminal.workspace.sort.name')}</SelectItem>
            <SelectItem value="mtime">{t('terminal.workspace.sort.mtime')}</SelectItem>
            <SelectItem value="size">{t('terminal.workspace.sort.size')}</SelectItem>
          </SelectContent>
        </Select>
        <NormalTooltip content={sortDirectionLabel}>
          <Button
            aria-label={sortDirectionLabel}
            onClick={() => setSortDirection((sortDirection === 'asc' ? 'desc' : 'asc') as WorkspaceSortDirection)}
            size="icon-sm"
            title={sortDirectionLabel}
            variant="ghost">
            {sortDirection === 'asc' ? <ArrowDownAZ /> : <ArrowUpAZ />}
          </Button>
        </NormalTooltip>
        <label className="ml-auto flex shrink-0 items-center gap-2 text-muted-foreground text-xs">
          <span>{t('terminal.workspace.include_hidden')}</span>
          <Switch checked={includeHidden} onCheckedChange={setIncludeHidden} size="sm" />
        </label>
      </div>
      {previewPane ? (
        <ResizablePanelGroup
          className="min-h-0 flex-1"
          direction="vertical"
          onLayoutChanged={(sizes) => setPreviewSizes([sizes.primary ?? 55, sizes.secondary ?? 45])}>
          <ResizablePanel defaultSize={`${previewSizes[0]}%`} id="workspace-files" minSize="25%">
            <div className="h-full min-h-0 overflow-hidden" data-testid="workspace-file-tree">
              <WorkspaceFileTree
                includeHidden={includeHidden}
                onSelectPath={(path, kind) => {
                  setSelectedWorkspacePath(path)
                  if (kind === 'directory') {
                    setWorkspaceRoot(path)
                    setSelectedWorkspacePath(null)
                    return
                  }
                  setActiveFilePath(path)
                  setPreviewOpen(true)
                }}
                rootPath={workspaceRoot}
                selectedPath={selectedWorkspacePath}
                sortDirection={sortDirection as WorkspaceSortDirection}
                sortKey={sortKey as WorkspaceSortKey}
                viewMode={viewMode as WorkspaceViewMode}
              />
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={`${previewSizes[1]}%`} id="workspace-preview" minSize="25%">
            {previewPane}
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden" data-testid="workspace-file-tree">
          <WorkspaceFileTree
            includeHidden={includeHidden}
            onSelectPath={(path, kind) => {
              setSelectedWorkspacePath(path)
              if (kind === 'directory') {
                setWorkspaceRoot(path)
                setSelectedWorkspacePath(null)
                return
              }
              setActiveFilePath(path)
              setPreviewOpen(true)
            }}
            rootPath={workspaceRoot}
            selectedPath={selectedWorkspacePath}
            sortDirection={sortDirection as WorkspaceSortDirection}
            sortKey={sortKey as WorkspaceSortKey}
            viewMode={viewMode as WorkspaceViewMode}
          />
        </div>
      )}
    </section>
  )

  return (
    <main className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <TerminalWorkspaceLayout
        fileManager={fileManager}
        terminal={
          <>
            <TerminalTabs
              activeSessionId={activeSessionId}
              onClose={(id) => void closeSession(id)}
              onCreate={() => void createSession()}
              onSelect={setActiveSessionId}
              sessions={sessions}
            />
            <TerminalPane
              buffer={activeSession?.buffer ?? []}
              cwd={activeSession?.cwd ?? workspaceRoot}
              key={activeSessionId ?? 'empty'}
              onInput={(data) => {
                if (activeSessionId) void sendInput(activeSessionId, data)
              }}
              onPathActivated={(path) => void activateTerminalPath(path)}
              onResize={(size) => {
                if (activeSessionId) void resizeSession(activeSessionId, size)
              }}
              sessionId={activeSessionId}
              shellKind={isWin ? 'windows' : 'posix'}
            />
          </>
        }
      />
    </main>
  )
}
