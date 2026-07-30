import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  NormalTooltip,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@cherrystudio/ui'
import { usePersistCache } from '@data/hooks/useCache'
import { useOpenFilePreviewTab } from '@renderer/components/FilePreview'
import { useCommandHandler } from '@renderer/hooks/command'
import { ipcApi } from '@renderer/ipc'
import { toast } from '@renderer/services/toast'
import { safeOpen } from '@renderer/utils/file/safeOpen'
import { normalizeFilePreviewPath } from '@renderer/utils/filePreview'
import { isWin } from '@renderer/utils/platform'
import { AbsoluteFilePathSchema } from '@shared/types/file'
import { createFilePathHandle } from '@shared/utils/file'
import { ArrowDownAZ, ArrowUpAZ, Eye, EyeOff, FolderOpen, Grid2X2, List, Pin, PinOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TerminalPane } from './components/TerminalPane'
import { TerminalTabs } from './components/TerminalTabs'
import { TerminalWorkspaceLayout } from './components/TerminalWorkspaceLayout'
import type { WorkspaceContextMenuActions } from './components/WorkspaceContextMenu'
import { WorkspaceFileTree } from './components/WorkspaceFileTree'
import { WorkspacePreviewPane } from './components/WorkspacePreviewPane'
import { useTerminalSessions } from './hooks/useTerminalSessions'
import type {
  WorkspaceSortDirection,
  WorkspaceSortKey,
  WorkspaceTreeItem,
  WorkspaceViewMode
} from './lib/workspaceTree'

type WorkspaceClipboard = {
  operation: 'copy' | 'move'
  items: Array<Pick<WorkspaceTreeItem, 'kind' | 'name' | 'path'>>
}

type WorkspaceNameDialogState = {
  message: string
  resolve: (value: string | null) => void
}

type WorkspacePasteConflictChoice = { action: 'cancel' } | { action: 'replace' } | { action: 'rename'; newName: string }

type WorkspacePasteConflictDialogState = {
  suggestedName: string
  resolve: (value: WorkspacePasteConflictChoice) => void
}

function toAbsolutePath(path: string) {
  return AbsoluteFilePathSchema.parse(path)
}

function isPathInsideRoot(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`) || path.startsWith(`${root}\\`)
}

function buildWorkspacePathSegments(path: string): Array<{ label: string; path: string }> {
  if (!path) return []

  const separator = path.includes('\\') && !path.includes('/') ? '\\' : '/'
  if (separator === '\\') {
    const parts = path.split('\\').filter(Boolean)
    const [drive, ...rest] = parts
    const segments: Array<{ label: string; path: string }> = drive ? [{ label: drive, path: `${drive}\\` }] : []
    let current = drive ? `${drive}\\` : ''
    for (const part of rest) {
      current = current.endsWith('\\') ? `${current}${part}` : `${current}\\${part}`
      segments.push({ label: part, path: current })
    }
    return segments
  }

  const parts = path.split('/').filter(Boolean)
  if (!path.startsWith('/')) {
    let current = ''
    return parts.map((part) => {
      current = current ? `${current}/${part}` : part
      return { label: part, path: current }
    })
  }

  let current = ''
  return [
    { label: '/', path: '/' },
    ...parts.map((part) => {
      current = `${current}/${part}`
      return { label: part, path: current }
    })
  ]
}

function formatWorkspaceSize(size: number): string {
  if (size < 1024) return `${size} B`

  const units = ['KB', 'MB', 'GB', 'TB']
  let value = size / 1024
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }

  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`
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
  const [, setTerminalVisible] = usePersistCache('terminal.workspace.terminal_visible')
  const [keepDirectory, setKeepDirectory] = usePersistCache('terminal.workspace.keep_directory')
  const [workspaceLayoutMode] = usePersistCache('terminal.layout.mode')
  const [terminalFontSize, setTerminalFontSize] = usePersistCache('terminal.font_size')
  const [selectedWorkspacePath, setSelectedWorkspacePath] = useState<string | null>(null)
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null)
  const [defaultRootResolved, setDefaultRootResolved] = useState(false)
  const [isEditingWorkspaceRoot, setIsEditingWorkspaceRoot] = useState(false)
  const [workspaceRootDraft, setWorkspaceRootDraft] = useState(workspaceRoot ?? '')
  const [workspaceClipboard, setWorkspaceClipboard] = useState<WorkspaceClipboard | null>(null)
  const [workspaceFocusRestoreKey, setWorkspaceFocusRestoreKey] = useState(0)
  const [workspaceRefreshKey, setWorkspaceRefreshKey] = useState(0)
  const [workspaceNameDialog, setWorkspaceNameDialog] = useState<WorkspaceNameDialogState | null>(null)
  const [workspaceNameValue, setWorkspaceNameValue] = useState('')
  const [workspacePasteConflictDialog, setWorkspacePasteConflictDialog] =
    useState<WorkspacePasteConflictDialogState | null>(null)
  const [workspacePasteConflictName, setWorkspacePasteConflictName] = useState('')
  const hasSeenTerminalSessionRef = useRef(false)
  const workspaceClipboardRef = useRef<WorkspaceClipboard | null>(null)
  const workspaceChildHistoryRef = useRef<string[]>([])
  const workspaceRootRef = useRef(workspaceRoot)
  const lastAutoFollowCwdRef = useRef<string | null>(null)
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

  const setWorkspaceClipboardState = useCallback((nextClipboard: WorkspaceClipboard | null) => {
    workspaceClipboardRef.current = nextClipboard
    setWorkspaceClipboard(nextClipboard)
  }, [])

  const setWorkspaceRootState = useCallback(
    (nextRoot: string | null) => {
      workspaceRootRef.current = nextRoot
      setWorkspaceRoot(nextRoot)
    },
    [setWorkspaceRoot]
  )

  const restoreWorkspaceFocus = useCallback(() => {
    setWorkspaceFocusRestoreKey((currentKey) => currentKey + 1)
  }, [])

  const switchTerminalSession = useCallback(
    (direction: -1 | 1) => {
      if (sessions.length < 2 || !activeSessionId) return

      const activeIndex = sessions.findIndex((session) => session.id === activeSessionId)
      if (activeIndex < 0) return

      const nextIndex = (activeIndex + direction + sessions.length) % sessions.length
      const nextSession = sessions[nextIndex]
      if (nextSession) setActiveSessionId(nextSession.id)
    },
    [activeSessionId, sessions, setActiveSessionId]
  )

  useCommandHandler('terminal.switch_previous', () => switchTerminalSession(-1), { enabled: sessions.length > 1 })
  useCommandHandler('terminal.switch_next', () => switchTerminalSession(1), { enabled: sessions.length > 1 })

  useEffect(() => {
    void createSession()
  }, [createSession])

  useEffect(() => {
    if (sessions.length > 0) {
      hasSeenTerminalSessionRef.current = true
      return
    }
    if (hasSeenTerminalSessionRef.current) setTerminalVisible(false)
  }, [sessions.length, setTerminalVisible])

  useEffect(() => {
    if (workspaceRoot || defaultRootResolved) return
    setDefaultRootResolved(true)
    void window.api
      .resolvePath('~')
      .then((homePath) => {
        if (homePath) setWorkspaceRootState(homePath)
      })
      .catch(() => {
        // Keep the explicit empty state if the platform home path cannot be resolved.
      })
  }, [defaultRootResolved, setWorkspaceRootState, workspaceRoot])

  useEffect(() => {
    if (!isEditingWorkspaceRoot) setWorkspaceRootDraft(workspaceRoot ?? '')
  }, [isEditingWorkspaceRoot, workspaceRoot])

  useEffect(() => {
    workspaceRootRef.current = workspaceRoot
  }, [workspaceRoot])

  useEffect(() => {
    if (keepDirectory || !activeSession?.cwd) return
    if (activeSession.cwd === lastAutoFollowCwdRef.current) return

    lastAutoFollowCwdRef.current = activeSession.cwd
    if (activeSession.cwd === workspaceRoot) return
    setWorkspaceRootState(activeSession.cwd)
    setSelectedWorkspacePath(null)
    setActiveFilePath(null)
    setPreviewOpen(false)
  }, [activeSession?.cwd, keepDirectory, setPreviewOpen, setWorkspaceRootState, workspaceRoot])

  const changeWorkspaceRoot = useCallback(
    (path: string, options: { clearChildHistory?: boolean } = {}) => {
      const nextPath = path.trim()
      if (!nextPath) return
      if (options.clearChildHistory ?? true) workspaceChildHistoryRef.current = []
      setWorkspaceRootState(nextPath)
      setSelectedWorkspacePath(null)
      setActiveFilePath(null)
      setPreviewOpen(false)
      setIsEditingWorkspaceRoot(false)
    },
    [setPreviewOpen, setWorkspaceRootState]
  )

  const openWorkspaceParent = useCallback(
    (path: string) => {
      if (workspaceRoot) workspaceChildHistoryRef.current.push(workspaceRoot)
      changeWorkspaceRoot(path, { clearChildHistory: false })
    },
    [changeWorkspaceRoot, workspaceRoot]
  )

  const openWorkspaceChildHistory = useCallback(() => {
    const nextPath = workspaceChildHistoryRef.current.pop()
    if (!nextPath) return
    changeWorkspaceRoot(nextPath, { clearChildHistory: false })
  }, [changeWorkspaceRoot])

  const cancelWorkspaceRootEdit = useCallback(() => {
    setWorkspaceRootDraft(workspaceRoot ?? '')
    setIsEditingWorkspaceRoot(false)
  }, [workspaceRoot])

  const selectWorkspace = useCallback(async () => {
    const rootPath = await window.api.file.selectFolder()
    if (!rootPath) return
    changeWorkspaceRoot(rootPath)
  }, [changeWorkspaceRoot])

  const activateTerminalPath = useCallback(
    async (path: string) => {
      setSelectedWorkspacePath(path)

      try {
        if (await window.api.file.isDirectory(path)) {
          if (!workspaceRoot || !isPathInsideRoot(path, workspaceRoot)) {
            setWorkspaceRootState(path)
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
    [setPreviewOpen, setWorkspaceRootState, workspaceRoot]
  )

  const refreshWorkspace = useCallback(() => {
    setWorkspaceRefreshKey((currentKey) => currentKey + 1)
  }, [])

  const promptWorkspaceName = useCallback((message: string, defaultValue = '') => {
    return new Promise<string | null>((resolve) => {
      setWorkspaceNameValue(defaultValue)
      setWorkspaceNameDialog({ message, resolve })
    })
  }, [])

  const resolveWorkspaceNameDialog = useCallback(
    (value: string | null) => {
      workspaceNameDialog?.resolve(value)
      setWorkspaceNameDialog(null)
      if (workspaceNameDialog) restoreWorkspaceFocus()
    },
    [restoreWorkspaceFocus, workspaceNameDialog]
  )

  const handleWorkspaceNameSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const name = workspaceNameValue.trim()
      resolveWorkspaceNameDialog(name ? name : null)
    },
    [resolveWorkspaceNameDialog, workspaceNameValue]
  )

  const promptWorkspacePasteConflict = useCallback((suggestedName: string) => {
    return new Promise<WorkspacePasteConflictChoice>((resolve) => {
      setWorkspacePasteConflictName(suggestedName)
      setWorkspacePasteConflictDialog({ suggestedName, resolve })
    })
  }, [])

  const resolveWorkspacePasteConflictDialog = useCallback(
    (value: WorkspacePasteConflictChoice) => {
      workspacePasteConflictDialog?.resolve(value)
      setWorkspacePasteConflictDialog(null)
      if (workspacePasteConflictDialog) restoreWorkspaceFocus()
    },
    [restoreWorkspaceFocus, workspacePasteConflictDialog]
  )

  const handleWorkspacePasteConflictRename = useCallback(() => {
    const newName = workspacePasteConflictName.trim()
    if (!newName) return

    resolveWorkspacePasteConflictDialog({ action: 'rename', newName })
  }, [resolveWorkspacePasteConflictDialog, workspacePasteConflictName])

  const handleWorkspaceOpenItem = useCallback(
    (item: WorkspaceTreeItem) => {
      if (item.kind === 'directory') {
        changeWorkspaceRoot(item.path)
        return
      }

      void safeOpen(createFilePathHandle(normalizeFilePreviewPath(item.path))).catch(() =>
        toast.error(t('file_preview.unsupported.open_error'))
      )
    },
    [changeWorkspaceRoot, t]
  )

  const handleWorkspaceRenameItem = useCallback(
    (item: WorkspaceTreeItem) => {
      void (async () => {
        const newName = await promptWorkspaceName(t('terminal.workspace.dialog.rename'), item.name)
        if (!newName || newName === item.name) return

        await ipcApi
          .request('file.path_rename', { path: toAbsolutePath(item.path), newName })
          .then((result) => {
            refreshWorkspace()
            if (selectedWorkspacePath === item.path) setSelectedWorkspacePath(result.path)
            if (activeFilePath === item.path) setActiveFilePath(result.path)
          })
          .catch(() => toast.error(t('terminal.workspace.dialog.operation_failed')))
      })()
    },
    [activeFilePath, promptWorkspaceName, refreshWorkspace, selectedWorkspacePath, t]
  )

  const handleWorkspaceTrashItems = useCallback(
    (items: WorkspaceTreeItem[]) => {
      if (items.length === 0) return

      const confirmMessage =
        items.length === 1
          ? t('terminal.workspace.dialog.trash_confirm', { name: items[0].name })
          : t('terminal.workspace.dialog.trash_confirm_many', { count: items.length })
      const shouldTrash = window.confirm(confirmMessage)
      restoreWorkspaceFocus()
      if (!shouldTrash) return

      const itemPaths = new Set(items.map((item) => item.path))

      void Promise.all(items.map((item) => ipcApi.request('file.path_trash', { path: toAbsolutePath(item.path) })))
        .then(() => {
          refreshWorkspace()
          if (selectedWorkspacePath && itemPaths.has(selectedWorkspacePath)) setSelectedWorkspacePath(null)
          if (activeFilePath && itemPaths.has(activeFilePath)) {
            setActiveFilePath(null)
            setPreviewOpen(false)
          }
        })
        .catch(() => toast.error(t('terminal.workspace.dialog.operation_failed')))
    },
    [activeFilePath, refreshWorkspace, restoreWorkspaceFocus, selectedWorkspacePath, setPreviewOpen, t]
  )

  const handleWorkspaceNewFile = useCallback(() => {
    if (!workspaceRoot) return

    void (async () => {
      const name = await promptWorkspaceName(
        t('terminal.workspace.dialog.new_file'),
        t('terminal.workspace.dialog.new_file_default')
      )
      if (!name) return

      await ipcApi
        .request('file.path_create_file', { parentPath: toAbsolutePath(workspaceRoot), name })
        .then(refreshWorkspace)
        .catch(() => toast.error(t('terminal.workspace.dialog.operation_failed')))
    })()
  }, [promptWorkspaceName, refreshWorkspace, t, workspaceRoot])

  const handleWorkspaceNewFolder = useCallback(() => {
    if (!workspaceRoot) return

    void (async () => {
      const name = await promptWorkspaceName(
        t('terminal.workspace.dialog.new_folder'),
        t('terminal.workspace.dialog.new_folder_default')
      )
      if (!name) return

      await ipcApi
        .request('file.path_create_directory', { parentPath: toAbsolutePath(workspaceRoot), name })
        .then(refreshWorkspace)
        .catch(() => toast.error(t('terminal.workspace.dialog.operation_failed')))
    })()
  }, [promptWorkspaceName, refreshWorkspace, t, workspaceRoot])

  const handleWorkspacePaste = useCallback(() => {
    const clipboard = workspaceClipboardRef.current
    const targetRoot = workspaceRootRef.current
    if (!clipboard || !targetRoot) return

    void (async () => {
      let hasCompletedPaste = false

      for (const item of clipboard.items) {
        const baseInput = {
          sourcePath: toAbsolutePath(item.path),
          targetDirectory: toAbsolutePath(targetRoot),
          operation: clipboard.operation
        }
        let result = await ipcApi.request('file.path_paste', { ...baseInput, conflict: 'prompt' })

        while (result.status === 'conflict') {
          const choice = await promptWorkspacePasteConflict(result.suggestedName)

          if (choice.action === 'cancel') return
          if (choice.action === 'replace') {
            result = await ipcApi.request('file.path_paste', { ...baseInput, conflict: 'replace' })
          } else {
            result = await ipcApi.request('file.path_paste', {
              ...baseInput,
              conflict: 'rename',
              newName: choice.newName
            })
          }
        }

        if (result.status === 'completed') hasCompletedPaste = true
      }

      if (hasCompletedPaste) {
        refreshWorkspace()
        if (clipboard.operation === 'move') setWorkspaceClipboardState(null)
      }
    })().catch(() => toast.error(t('terminal.workspace.dialog.operation_failed')))
  }, [promptWorkspacePasteConflict, refreshWorkspace, setWorkspaceClipboardState, t])

  const handleWorkspaceProperties = useCallback(
    (path: string) => {
      if (!path) return

      void ipcApi
        .request('file.path_stat', { path: toAbsolutePath(path) })
        .then((info) => {
          const kindLabels = {
            directory: t('terminal.workspace.dialog.kind.directory'),
            file: t('terminal.workspace.dialog.kind.file'),
            other: t('terminal.workspace.dialog.kind.other')
          }
          const kindLabel = kindLabels[info.kind]
          window.alert(
            [
              `${t('terminal.workspace.dialog.properties.name')}: ${info.name}`,
              `${t('terminal.workspace.dialog.properties.path')}: ${info.path}`,
              `${t('terminal.workspace.dialog.properties.kind')}: ${kindLabel}`,
              `${t('terminal.workspace.dialog.properties.size')}: ${formatWorkspaceSize(info.size)}`,
              `${t('terminal.workspace.dialog.properties.created_at')}: ${new Date(info.createdAt).toLocaleString()}`,
              `${t('terminal.workspace.dialog.properties.modified_at')}: ${new Date(info.modifiedAt).toLocaleString()}`
            ].join('\n')
          )
          restoreWorkspaceFocus()
        })
        .catch(() => toast.error(t('terminal.workspace.dialog.operation_failed')))
    },
    [restoreWorkspaceFocus, t]
  )

  const workspaceContextMenuActions = useMemo<WorkspaceContextMenuActions>(
    () => ({
      canPaste: Boolean(workspaceClipboard && workspaceRoot),
      onOpenItem: handleWorkspaceOpenItem,
      onRenameItem: handleWorkspaceRenameItem,
      onCopyItems: (items) => setWorkspaceClipboardState({ operation: 'copy', items }),
      onCopyPaths: (paths) => void navigator.clipboard.writeText(paths.join('\n')),
      onCutItems: (items) => setWorkspaceClipboardState({ operation: 'move', items }),
      onTrashItems: handleWorkspaceTrashItems,
      onShowProperties: handleWorkspaceProperties,
      onNewFile: handleWorkspaceNewFile,
      onNewFolder: handleWorkspaceNewFolder,
      onPaste: handleWorkspacePaste,
      onOpenTerminalHere: () => {
        setTerminalVisible(true)
        void createSession({ cwd: workspaceRoot })
      }
    }),
    [
      createSession,
      handleWorkspaceNewFile,
      handleWorkspaceNewFolder,
      handleWorkspaceOpenItem,
      handleWorkspacePaste,
      handleWorkspaceProperties,
      handleWorkspaceRenameItem,
      handleWorkspaceTrashItems,
      setTerminalVisible,
      setWorkspaceClipboardState,
      workspaceClipboard,
      workspaceRoot
    ]
  )

  const previewDirection = workspaceLayoutMode === 'bottom' ? 'horizontal' : 'vertical'
  const previewPane = previewOpen && activeFilePath && (
    <aside
      className={
        previewDirection === 'horizontal'
          ? 'h-full min-h-0 overflow-hidden border-border border-l'
          : 'h-full min-h-0 overflow-hidden border-border border-t'
      }
      data-testid="workspace-preview-pane">
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
  const workspacePathSegments = workspaceRoot ? buildWorkspacePathSegments(workspaceRoot) : []

  const fileManager = (layoutActions: ReactNode) => (
    <section
      className="flex h-full min-h-0 flex-col overflow-hidden border-border border-r"
      data-testid="terminal-workspace-tree">
      <div className="flex h-10 shrink-0 items-center gap-1 border-border border-b px-2">
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
        {isEditingWorkspaceRoot ? (
          <Input
            aria-label={t('terminal.workspace.path_input')}
            autoFocus
            className="h-7 min-w-0 flex-1 text-xs"
            onBlur={() => changeWorkspaceRoot(workspaceRootDraft)}
            onChange={(event) => setWorkspaceRootDraft(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') changeWorkspaceRoot(workspaceRootDraft)
              if (event.key === 'Escape') cancelWorkspaceRootEdit()
            }}
            value={workspaceRootDraft}
          />
        ) : (
          <div
            className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-muted-foreground text-xs"
            data-testid="terminal-workspace-path-bar"
            onDoubleClick={() => setIsEditingWorkspaceRoot(true)}
            title={workspaceRoot ?? undefined}>
            {workspacePathSegments.length > 0 ? (
              workspacePathSegments.map((segment, index) => (
                <span className="flex min-w-0 items-center gap-1" key={`${segment.path}:${index}`}>
                  {index > 0 && !(index === 1 && workspacePathSegments[0]?.label === '/') && (
                    <span className="shrink-0 opacity-50">/</span>
                  )}
                  <button
                    aria-label={segment.path}
                    className="min-w-0 truncate rounded px-1 py-0.5 text-left hover:bg-accent hover:text-accent-foreground"
                    onClick={() => changeWorkspaceRoot(segment.path)}
                    title={segment.path}
                    type="button">
                    {segment.label}
                  </button>
                </span>
              ))
            ) : (
              <span className="truncate">{t('terminal.workspace.no_root')}</span>
            )}
          </div>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1" data-testid="terminal-workspace-path-actions">
          {layoutActions}
        </div>
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
        <NormalTooltip content={t('terminal.workspace.include_hidden')}>
          <Button
            aria-label={t('terminal.workspace.include_hidden')}
            className="ml-auto"
            onClick={() => setIncludeHidden(!includeHidden)}
            size="icon-sm"
            title={t('terminal.workspace.include_hidden')}
            variant={includeHidden ? 'secondary' : 'ghost'}>
            {includeHidden ? <Eye /> : <EyeOff />}
          </Button>
        </NormalTooltip>
        <NormalTooltip content={t('terminal.workspace.keep_directory')}>
          <Button
            aria-label={t('terminal.workspace.keep_directory')}
            onClick={() => setKeepDirectory(!keepDirectory)}
            size="icon-sm"
            title={t('terminal.workspace.keep_directory')}
            variant={keepDirectory ? 'secondary' : 'ghost'}>
            {keepDirectory ? <Pin /> : <PinOff />}
          </Button>
        </NormalTooltip>
      </div>
      {previewPane ? (
        <ResizablePanelGroup
          className="min-h-0 flex-1 overflow-hidden"
          direction={previewDirection}
          onLayoutChanged={(sizes) => setPreviewSizes([sizes.primary ?? 55, sizes.secondary ?? 45])}>
          <ResizablePanel defaultSize={`${previewSizes[0]}%`} id="workspace-files" minSize="25%">
            <div className="h-full min-h-0 overflow-hidden" data-testid="workspace-file-tree">
              <WorkspaceFileTree
                contextMenuActions={workspaceContextMenuActions}
                includeHidden={includeHidden}
                onHighlightPath={setSelectedWorkspacePath}
                onOpenChildHistoryPath={openWorkspaceChildHistory}
                onOpenParentPath={openWorkspaceParent}
                onSelectPath={(path, kind) => {
                  setSelectedWorkspacePath(path)
                  if (kind === 'directory') {
                    workspaceChildHistoryRef.current = []
                    setWorkspaceRootState(path)
                    setSelectedWorkspacePath(null)
                    return
                  }
                  setActiveFilePath(path)
                  setPreviewOpen(true)
                }}
                rootPath={workspaceRoot}
                restoreFocusKey={workspaceFocusRestoreKey}
                refreshKey={workspaceRefreshKey}
                selectedPath={selectedWorkspacePath}
                sortDirection={sortDirection as WorkspaceSortDirection}
                sortKey={sortKey as WorkspaceSortKey}
                viewMode={viewMode as WorkspaceViewMode}
              />
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={`${previewSizes[1]}%`} id="workspace-preview" minSize="25%">
            <div className="h-full min-h-0 overflow-hidden">{previewPane}</div>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden" data-testid="workspace-file-tree">
          <WorkspaceFileTree
            contextMenuActions={workspaceContextMenuActions}
            includeHidden={includeHidden}
            onHighlightPath={setSelectedWorkspacePath}
            onOpenChildHistoryPath={openWorkspaceChildHistory}
            onOpenParentPath={openWorkspaceParent}
            onSelectPath={(path, kind) => {
              setSelectedWorkspacePath(path)
              if (kind === 'directory') {
                workspaceChildHistoryRef.current = []
                setWorkspaceRootState(path)
                setSelectedWorkspacePath(null)
                return
              }
              setActiveFilePath(path)
              setPreviewOpen(true)
            }}
            rootPath={workspaceRoot}
            restoreFocusKey={workspaceFocusRestoreKey}
            refreshKey={workspaceRefreshKey}
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
      <Dialog
        open={Boolean(workspaceNameDialog)}
        onOpenChange={(open) => {
          if (!open) resolveWorkspaceNameDialog(null)
        }}>
        <DialogContent aria-describedby={undefined} className="max-w-sm">
          <form className="space-y-4" onSubmit={handleWorkspaceNameSubmit}>
            <DialogHeader>
              <DialogTitle>{workspaceNameDialog?.message ?? ''}</DialogTitle>
            </DialogHeader>
            <Input
              aria-label={workspaceNameDialog?.message ?? ''}
              autoFocus
              onChange={(event) => setWorkspaceNameValue(event.target.value)}
              value={workspaceNameValue}
            />
            <DialogFooter>
              <Button onClick={() => resolveWorkspaceNameDialog(null)} type="button" variant="ghost">
                {t('common.cancel')}
              </Button>
              <Button type="submit">{t('common.confirm')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(workspacePasteConflictDialog)}
        onOpenChange={(open) => {
          if (!open) resolveWorkspacePasteConflictDialog({ action: 'cancel' })
        }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('terminal.workspace.dialog.paste_conflict_title')}</DialogTitle>
            <DialogDescription>{t('terminal.workspace.dialog.paste_conflict_description')}</DialogDescription>
          </DialogHeader>
          <Input
            aria-label={t('terminal.workspace.dialog.paste_conflict_rename_label')}
            autoFocus
            onChange={(event) => setWorkspacePasteConflictName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleWorkspacePasteConflictRename()
            }}
            value={workspacePasteConflictName}
          />
          <DialogFooter>
            <Button
              onClick={() => resolveWorkspacePasteConflictDialog({ action: 'cancel' })}
              type="button"
              variant="ghost">
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => resolveWorkspacePasteConflictDialog({ action: 'replace' })}
              type="button"
              variant="destructive">
              {t('terminal.workspace.dialog.paste_conflict_replace')}
            </Button>
            <Button
              disabled={!workspacePasteConflictName.trim()}
              onClick={handleWorkspacePasteConflictRename}
              type="button">
              {t('terminal.workspace.dialog.paste_conflict_rename')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <TerminalWorkspaceLayout
        fileManager={fileManager}
        onShowTerminal={() => {
          if (sessions.length === 0) void createSession({ cwd: workspaceRoot })
        }}
        terminal={(terminalActions, onTerminalHeaderDoubleClick) => (
          <>
            <TerminalTabs
              actions={terminalActions}
              activeSessionId={activeSessionId}
              onClose={(id) => void closeSession(id)}
              onCreate={() => void createSession({ cwd: workspaceRoot })}
              onHeaderDoubleClick={onTerminalHeaderDoubleClick}
              onSelect={setActiveSessionId}
              sessions={sessions}
            />
            <TerminalPane
              buffer={activeSession?.buffer ?? []}
              cwd={activeSession?.cwd ?? workspaceRoot}
              fontSize={typeof terminalFontSize === 'number' ? terminalFontSize : undefined}
              key={activeSessionId ?? 'empty'}
              onFontSizeChange={setTerminalFontSize}
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
        )}
      />
    </main>
  )
}
