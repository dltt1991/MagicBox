import { Button, NormalTooltip, Switch } from '@cherrystudio/ui'
import { usePersistCache } from '@data/hooks/useCache'
import { useOpenFilePreviewTab } from '@renderer/components/FilePreview'
import { ipcApi } from '@renderer/ipc'
import { toast } from '@renderer/services/toast'
import { safeOpen } from '@renderer/utils/file/safeOpen'
import { normalizeFilePreviewPath } from '@renderer/utils/filePreview'
import { createFilePathHandle } from '@shared/utils/file'
import { FolderOpen } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TerminalPane } from './components/TerminalPane'
import { TerminalTabs } from './components/TerminalTabs'
import { TerminalWorkspaceLayout } from './components/TerminalWorkspaceLayout'
import { WorkspaceFileTree } from './components/WorkspaceFileTree'
import { WorkspacePreviewPane } from './components/WorkspacePreviewPane'
import { useTerminalSessions } from './hooks/useTerminalSessions'

export default function TerminalPage() {
  const { t } = useTranslation()
  const [workspaceRoot, setWorkspaceRoot] = usePersistCache('terminal.workspace.root')
  const [includeHidden, setIncludeHidden] = usePersistCache('terminal.workspace.include_hidden')
  const [selectedWorkspacePath, setSelectedWorkspacePath] = useState<string | null>(null)
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null)
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

  const selectWorkspace = useCallback(async () => {
    const rootPath = await window.api.file.selectFolder()
    if (!rootPath) return
    setWorkspaceRoot(rootPath)
    setSelectedWorkspacePath(null)
    setActiveFilePath(null)
  }, [setWorkspaceRoot])

  return (
    <main className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <TerminalWorkspaceLayout
        fileTree={
          <>
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
              <span
                className="min-w-0 flex-1 truncate text-muted-foreground text-xs"
                title={workspaceRoot ?? undefined}>
                {workspaceRoot ?? t('terminal.workspace.no_root')}
              </span>
            </div>
            <label className="flex h-9 shrink-0 items-center justify-between border-border border-b px-3 text-muted-foreground text-xs">
              <span>{t('terminal.workspace.include_hidden')}</span>
              <Switch checked={includeHidden} onCheckedChange={setIncludeHidden} size="sm" />
            </label>
            <div className="min-h-0 flex-1 overflow-hidden" data-testid="workspace-file-tree">
              <WorkspaceFileTree
                includeHidden={includeHidden}
                onSelectPath={(path, kind) => {
                  setSelectedWorkspacePath(path)
                  if (kind === 'file') setActiveFilePath(path)
                }}
                rootPath={workspaceRoot}
                selectedPath={selectedWorkspacePath}
              />
            </div>
          </>
        }
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
              key={activeSessionId ?? 'empty'}
              onInput={(data) => {
                if (activeSessionId) void sendInput(activeSessionId, data)
              }}
              onResize={(size) => {
                if (activeSessionId) void resizeSession(activeSessionId, size)
              }}
              sessionId={activeSessionId}
            />
          </>
        }
        preview={
          <aside className="h-full min-h-0 border-border border-l" data-testid="workspace-preview-pane">
            <WorkspacePreviewPane
              filePath={activeFilePath}
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
        }
      />
    </main>
  )
}
