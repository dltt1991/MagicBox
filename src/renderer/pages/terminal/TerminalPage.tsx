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
  Popover,
  PopoverContent,
  PopoverTrigger,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@cherrystudio/ui'
import { cn } from '@cherrystudio/ui/lib/utils'
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
import { ArrowDownAZ, ArrowUpAZ, Eye, EyeOff, FolderOpen, Grid2X2, List, Pin, PinOff, Star, X } from 'lucide-react'
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
import {
  createTerminalQuickCommandId,
  TERMINAL_QUICK_COMMAND_ICON_MAX_BYTES,
  type TerminalQuickCommand
} from './lib/terminalQuickCommands'
import { getTerminalTheme, TERMINAL_THEMES } from './lib/terminalThemes'
import type {
  WorkspaceIconSize,
  WorkspaceSortDirection,
  WorkspaceSortKey,
  WorkspaceTreeItem,
  WorkspaceViewMode
} from './lib/workspaceTree'

type WorkspaceClipboard = {
  operation: 'copy' | 'move'
  items: Array<Pick<WorkspaceTreeItem, 'kind' | 'name' | 'path'>>
}

function IconSizeSwatch({ size }: { size: WorkspaceIconSize }) {
  return (
    <span
      className={cn(
        'rounded-[2px] bg-current',
        size === 'small' && 'size-1',
        size === 'medium' && 'size-1.5',
        size === 'large' && 'size-2'
      )}
    />
  )
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

type QuickCommandDisplayMode = 'label' | 'icon'

function toAbsolutePath(path: string) {
  return AbsoluteFilePathSchema.parse(path)
}

function getQuickCommandProcessName(command: string): string {
  const firstToken = command.trim().split(/\s+/).filter(Boolean)[0] ?? ''
  return firstToken.replace(/^["']|["']$/g, '')
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
  const [terminalVisible, setTerminalVisible] = usePersistCache('terminal.workspace.terminal_visible')
  const [keepDirectory, setKeepDirectory] = usePersistCache('terminal.workspace.keep_directory')
  const [favoriteDirectories, setFavoriteDirectories] = usePersistCache('terminal.workspace.favorite_directories')
  const [iconSize, setIconSize] = usePersistCache('terminal.workspace.icon_size')
  const [workspaceLayoutMode] = usePersistCache('terminal.layout.mode')
  const [terminalFontSize, setTerminalFontSize] = usePersistCache('terminal.font_size')
  const [terminalThemeKey, setTerminalThemeKey] = usePersistCache('terminal.theme')
  const [quickCommands, setQuickCommands] = usePersistCache('terminal.quick_commands')
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
  const [favoriteMenuOpen, setFavoriteMenuOpen] = useState(false)
  const [quickCommandDialogOpen, setQuickCommandDialogOpen] = useState(false)
  const [editingQuickCommand, setEditingQuickCommand] = useState<TerminalQuickCommand | null>(null)
  const [quickCommandInput, setQuickCommandInput] = useState('')
  const [quickCommandLabelInput, setQuickCommandLabelInput] = useState('')
  const [quickCommandIconDataUrl, setQuickCommandIconDataUrl] = useState('')
  const [quickCommandDisplayMode, setQuickCommandDisplayMode] = useState<QuickCommandDisplayMode>('label')
  const [quickCommandError, setQuickCommandError] = useState('')
  const [terminalFocusRequestKey, setTerminalFocusRequestKey] = useState(0)
  const hasSeenTerminalSessionRef = useRef(false)
  const initialSessionRequestRef = useRef(false)
  const workspaceClipboardRef = useRef<WorkspaceClipboard | null>(null)
  const workspaceChildHistoryRef = useRef<string[]>([])
  const workspaceRootRef = useRef(workspaceRoot)
  const lastAutoFollowCwdRef = useRef<string | null>(null)
  const quickCommandRunInFlightRef = useRef(false)
  const openFilePreviewTab = useOpenFilePreviewTab()
  const selectedTerminalTheme = getTerminalTheme(terminalThemeKey)
  const {
    activeSession,
    activeSessionId,
    closeSession,
    createSession,
    ensureSession,
    resizeSession,
    sendInput,
    sessions,
    sessionsReady,
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

  const favoriteDirectorySet = useMemo(() => new Set(favoriteDirectories), [favoriteDirectories])

  const removeFavoriteDirectory = useCallback(
    (path: string) => {
      setFavoriteDirectories(favoriteDirectories.filter((favoritePath) => favoritePath !== path))
    },
    [favoriteDirectories, setFavoriteDirectories]
  )

  const toggleFavoriteDirectory = useCallback(
    (path: string) => {
      if (favoriteDirectorySet.has(path)) {
        removeFavoriteDirectory(path)
        return
      }

      setFavoriteDirectories([...favoriteDirectories, path])
    },
    [favoriteDirectories, favoriteDirectorySet, removeFavoriteDirectory, setFavoriteDirectories]
  )

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

  const createTerminalSession = useCallback(() => {
    void createSession({ cwd: activeSession?.cwd ?? workspaceRoot })
  }, [activeSession?.cwd, createSession, workspaceRoot])

  const closeTerminalSession = useCallback(
    (id: string) => {
      const session = sessions.find((candidate) => candidate.id === id)
      if (session?.processName) {
        const shouldClose = window.confirm(
          t('terminal.close_running_session_confirm', { process: session.processName })
        )
        if (!shouldClose) return
      }

      void closeSession(id)
    },
    [closeSession, sessions, t]
  )

  const closeOtherTerminalSessions = useCallback(() => {
    if (!activeSessionId) return

    for (const session of sessions) {
      if (session.id !== activeSessionId) closeTerminalSession(session.id)
    }
  }, [activeSessionId, closeTerminalSession, sessions])

  const closeAllTerminalSessions = useCallback(() => {
    for (const session of sessions) {
      closeTerminalSession(session.id)
    }
  }, [closeTerminalSession, sessions])

  const openQuickCommandDialog = useCallback((quickCommand: TerminalQuickCommand | null = null) => {
    setEditingQuickCommand(quickCommand)
    setQuickCommandInput(quickCommand?.command ?? '')
    setQuickCommandLabelInput(quickCommand?.label ?? '')
    setQuickCommandIconDataUrl(quickCommand?.iconDataUrl ?? '')
    setQuickCommandDisplayMode(quickCommand?.iconDataUrl ? 'icon' : 'label')
    setQuickCommandError('')
    setQuickCommandDialogOpen(true)
  }, [])

  const closeQuickCommandDialog = useCallback(() => {
    setQuickCommandDialogOpen(false)
    setEditingQuickCommand(null)
    setQuickCommandInput('')
    setQuickCommandLabelInput('')
    setQuickCommandIconDataUrl('')
    setQuickCommandDisplayMode('label')
    setQuickCommandError('')
  }, [])

  const saveQuickCommand = useCallback(() => {
    const command = quickCommandInput.trim()
    const label =
      quickCommandDisplayMode === 'label' ? quickCommandLabelInput.trim() || getQuickCommandProcessName(command) : ''
    if (!command) {
      setQuickCommandError(t('terminal.quick_command.error_command_required'))
      return
    }
    if (quickCommandDisplayMode === 'label' && !label) {
      setQuickCommandError(t('terminal.quick_command.error_display_required'))
      return
    }
    if (quickCommandDisplayMode === 'icon' && !quickCommandIconDataUrl) {
      setQuickCommandError(t('terminal.quick_command.error_icon_required'))
      return
    }

    const nextCommand: TerminalQuickCommand = {
      id: editingQuickCommand?.id ?? createTerminalQuickCommandId(),
      command,
      ...(quickCommandDisplayMode === 'label' ? { label } : {}),
      ...(quickCommandDisplayMode === 'icon' ? { iconDataUrl: quickCommandIconDataUrl } : {})
    }

    setQuickCommands(
      editingQuickCommand
        ? quickCommands.map((quickCommand) => (quickCommand.id === editingQuickCommand.id ? nextCommand : quickCommand))
        : [...quickCommands, nextCommand]
    )
    closeQuickCommandDialog()
  }, [
    closeQuickCommandDialog,
    editingQuickCommand,
    quickCommandDisplayMode,
    quickCommandIconDataUrl,
    quickCommandInput,
    quickCommandLabelInput,
    quickCommands,
    setQuickCommands,
    t
  ])

  const deleteQuickCommand = useCallback(
    (id: string) => {
      setQuickCommands(quickCommands.filter((quickCommand) => quickCommand.id !== id))
    },
    [quickCommands, setQuickCommands]
  )

  const readQuickCommandIcon = useCallback(
    (file: File) => {
      const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/bmp', 'image/x-icon', 'image/vnd.microsoft.icon'])
      const allowedExtensions = /\.(jpe?g|png|bmp|ico)$/i
      if (file.size > TERMINAL_QUICK_COMMAND_ICON_MAX_BYTES) {
        setQuickCommandError(t('terminal.quick_command.error_icon_too_large'))
        return
      }
      if (!allowedTypes.has(file.type) && !allowedExtensions.test(file.name)) {
        setQuickCommandError(t('terminal.quick_command.error_icon_type'))
        return
      }

      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result !== 'string') {
          setQuickCommandError(t('terminal.quick_command.error_icon_read'))
          return
        }
        setQuickCommandIconDataUrl(reader.result)
        setQuickCommandLabelInput('')
        setQuickCommandDisplayMode('icon')
        setQuickCommandError('')
      }
      reader.onerror = () => setQuickCommandError(t('terminal.quick_command.error_icon_read'))
      reader.readAsDataURL(file)
    },
    [t]
  )

  const runQuickCommand = useCallback(
    async (quickCommand: TerminalQuickCommand) => {
      if (quickCommandRunInFlightRef.current) return
      quickCommandRunInFlightRef.current = true

      const input = `${quickCommand.command.trim()}\n`
      if (!input.trim()) {
        quickCommandRunInFlightRef.current = false
        return
      }

      try {
        if (activeSessionId && !activeSession?.processName) {
          await sendInput(activeSessionId, input)
          setTerminalFocusRequestKey((currentKey) => currentKey + 1)
          return
        }

        const session = await createSession({ cwd: activeSession?.cwd ?? workspaceRoot })
        await sendInput(session.id, input)
        setTerminalFocusRequestKey((currentKey) => currentKey + 1)
      } finally {
        quickCommandRunInFlightRef.current = false
      }
    },
    [activeSession?.cwd, activeSession?.processName, activeSessionId, createSession, sendInput, workspaceRoot]
  )

  useCommandHandler('terminal.new', createTerminalSession)
  useCommandHandler(
    'terminal.close_current',
    () => {
      if (activeSessionId) closeTerminalSession(activeSessionId)
    },
    { enabled: Boolean(activeSessionId) }
  )
  useCommandHandler('terminal.close_others', closeOtherTerminalSessions, { enabled: sessions.length > 1 })
  useCommandHandler('terminal.close_all', closeAllTerminalSessions, { enabled: sessions.length > 0 })
  useCommandHandler('terminal.switch_previous', () => switchTerminalSession(-1), { enabled: sessions.length > 1 })
  useCommandHandler('terminal.switch_next', () => switchTerminalSession(1), { enabled: sessions.length > 1 })

  useEffect(() => {
    if (!sessionsReady) return
    if (terminalVisible === false) return
    if (sessions.length > 0) return
    if (initialSessionRequestRef.current) return
    initialSessionRequestRef.current = true
    void ensureSession()
  }, [ensureSession, sessions.length, sessionsReady, terminalVisible])

  useEffect(() => {
    if (sessions.length > 0) {
      hasSeenTerminalSessionRef.current = true
      return
    }
    if (hasSeenTerminalSessionRef.current) setTerminalVisible(false)
  }, [sessions.length, setTerminalVisible])

  useEffect(() => {
    if (sessions.length === 0 && terminalVisible === false) {
      initialSessionRequestRef.current = false
    }
  }, [sessions.length, terminalVisible])

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
        initialSessionRequestRef.current = true
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
  const workspaceIconSizeOptions: Array<{
    value: WorkspaceIconSize
    label: string
    icon: ReactNode
  }> = [
    {
      value: 'small',
      label: t('terminal.workspace.icon_size.small'),
      icon: <IconSizeSwatch size="small" />
    },
    {
      value: 'medium',
      label: t('terminal.workspace.icon_size.medium'),
      icon: <IconSizeSwatch size="medium" />
    },
    {
      value: 'large',
      label: t('terminal.workspace.icon_size.large'),
      icon: <IconSizeSwatch size="large" />
    }
  ]

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
        <Popover open={favoriteMenuOpen} onOpenChange={setFavoriteMenuOpen}>
          <NormalTooltip content={t('terminal.workspace.favorite.title')}>
            <PopoverTrigger asChild>
              <Button
                aria-label={t('terminal.workspace.favorite.title')}
                size="icon-sm"
                title={t('terminal.workspace.favorite.title')}
                variant="ghost">
                <Star className={favoriteDirectories.length > 0 ? 'fill-current' : undefined} />
              </Button>
            </PopoverTrigger>
          </NormalTooltip>
          <PopoverContent align="start" className="w-72 p-1.5">
            {favoriteDirectories.length === 0 ? (
              <div className="px-2.5 py-2 text-muted-foreground text-xs">{t('terminal.workspace.favorite.empty')}</div>
            ) : (
              <div className="flex max-h-72 flex-col gap-0.5 overflow-auto">
                {favoriteDirectories.map((path) => (
                  <div className="group flex items-center gap-1 rounded-md hover:bg-accent" key={path}>
                    <button
                      aria-label={path}
                      className="min-w-0 flex-1 truncate px-2.5 py-1.5 text-left text-sm"
                      onClick={() => {
                        changeWorkspaceRoot(path)
                        setFavoriteMenuOpen(false)
                      }}
                      title={path}
                      type="button">
                      {path}
                    </button>
                    <button
                      aria-label={t('terminal.workspace.favorite.remove_path', { path })}
                      className="mr-1 flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:scale-105 hover:bg-background hover:text-foreground group-hover:opacity-100"
                      onClick={(event) => {
                        event.stopPropagation()
                        removeFavoriteDirectory(path)
                      }}
                      title={t('terminal.workspace.favorite.remove_path', { path })}
                      type="button">
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </PopoverContent>
        </Popover>
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
        {viewMode === 'icons' && (
          <div className="flex shrink-0 items-center gap-0.5">
            {workspaceIconSizeOptions.map((option) => (
              <NormalTooltip content={option.label} key={option.value}>
                <Button
                  aria-label={option.label}
                  onClick={() => setIconSize(option.value)}
                  size="icon-sm"
                  title={option.label}
                  variant={iconSize === option.value ? 'secondary' : 'ghost'}>
                  {option.icon}
                </Button>
              </NormalTooltip>
            ))}
          </div>
        )}
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
                favoriteDirectoryPaths={favoriteDirectories}
                iconSize={iconSize as WorkspaceIconSize}
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
                onToggleFavoriteDirectory={toggleFavoriteDirectory}
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
            favoriteDirectoryPaths={favoriteDirectories}
            iconSize={iconSize as WorkspaceIconSize}
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
            onToggleFavoriteDirectory={toggleFavoriteDirectory}
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
      <Dialog
        open={quickCommandDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeQuickCommandDialog()
        }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editingQuickCommand
                ? t('terminal.quick_command.dialog_edit_title')
                : t('terminal.quick_command.dialog_create_title')}
            </DialogTitle>
            <DialogDescription>{t('terminal.quick_command.dialog_description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3">
              <span className="text-muted-foreground text-sm">{t('terminal.quick_command.command_content')}</span>
              <Input
                aria-label={t('terminal.quick_command.command')}
                autoFocus
                onChange={(event) => setQuickCommandInput(event.target.value)}
                placeholder={t('terminal.quick_command.command_placeholder')}
                value={quickCommandInput}
              />
            </div>
            <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3">
              <span className="pt-1.5 text-muted-foreground text-sm">{t('terminal.quick_command.display_mode')}</span>
              <div className="space-y-3">
                <div className="flex items-center gap-4 text-sm">
                  <label className="flex items-center gap-1.5">
                    <input
                      checked={quickCommandDisplayMode === 'label'}
                      onChange={() => {
                        setQuickCommandDisplayMode('label')
                        setQuickCommandIconDataUrl('')
                      }}
                      type="radio"
                    />
                    {t('terminal.quick_command.display_label')}
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      checked={quickCommandDisplayMode === 'icon'}
                      onChange={() => setQuickCommandDisplayMode('icon')}
                      type="radio"
                    />
                    {t('terminal.quick_command.display_icon')}
                  </label>
                </div>
                {quickCommandDisplayMode === 'label' ? (
                  <Input
                    aria-label={t('terminal.quick_command.label')}
                    onChange={(event) => setQuickCommandLabelInput(event.target.value)}
                    placeholder={
                      getQuickCommandProcessName(quickCommandInput) || t('terminal.quick_command.label_placeholder')
                    }
                    value={quickCommandLabelInput}
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <Input
                      accept=".jpg,.jpeg,.png,.bmp,.ico,image/jpeg,image/png,image/bmp,image/x-icon,image/vnd.microsoft.icon"
                      aria-label={t('terminal.quick_command.icon')}
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) readQuickCommandIcon(file)
                      }}
                      type="file"
                    />
                    {quickCommandIconDataUrl && (
                      <img
                        alt=""
                        className="size-8 shrink-0 rounded border border-border object-contain"
                        src={quickCommandIconDataUrl}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
            {quickCommandError && <p className="text-destructive text-xs">{quickCommandError}</p>}
          </div>
          <DialogFooter>
            <Button onClick={closeQuickCommandDialog} type="button" variant="ghost">
              {t('common.cancel')}
            </Button>
            <Button onClick={saveQuickCommand} type="button">
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <TerminalWorkspaceLayout
        fileManager={fileManager}
        onShowTerminal={() => {
          if (sessions.length === 0) void ensureSession({ cwd: workspaceRoot })
        }}
        terminal={(terminalActions, onTerminalHeaderDoubleClick) => (
          <>
            <TerminalTabs
              actions={terminalActions}
              activeSessionId={activeSessionId}
              onClose={closeTerminalSession}
              onCreate={createTerminalSession}
              onDeleteQuickCommand={deleteQuickCommand}
              onEditQuickCommand={openQuickCommandDialog}
              onHeaderDoubleClick={onTerminalHeaderDoubleClick}
              onOpenQuickCommandDialog={() => openQuickCommandDialog()}
              onRunQuickCommand={(quickCommand) => void runQuickCommand(quickCommand)}
              onSelect={setActiveSessionId}
              onThemeChange={(theme) => setTerminalThemeKey(theme)}
              quickCommands={quickCommands}
              selectedThemeKey={selectedTerminalTheme.key}
              sessions={sessions}
              themes={TERMINAL_THEMES}
            />
            <TerminalPane
              buffer={activeSession?.buffer ?? []}
              cwd={activeSession?.cwd ?? workspaceRoot}
              focusRequestKey={terminalFocusRequestKey}
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
              theme={selectedTerminalTheme.theme}
            />
          </>
        )}
      />
    </main>
  )
}
