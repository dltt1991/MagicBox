import { Button, EmptyState, NormalTooltip } from '@cherrystudio/ui'
import { FilePreview } from '@renderer/components/FilePreview'
import { getFilePreviewFileName, normalizeFilePreviewPath } from '@renderer/utils/filePreview'
import { Copy, FolderOpen, MonitorUp, SquareArrowOutUpRight, X } from 'lucide-react'
import { type ReactNode, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

export interface WorkspacePreviewPaneProps {
  filePath: string | null
  onOpenInNewTab: (filePath: string) => void
  onShowInFolder: (filePath: string) => void
  onOpenSystem: (filePath: string) => void
  onCopyPath: (filePath: string) => void
  onClose: () => void
}

interface PreviewActionProps {
  label: string
  onClick: () => void
  children: ReactNode
}

function PreviewAction({ label, onClick, children }: PreviewActionProps) {
  return (
    <NormalTooltip content={label}>
      <Button aria-label={label} onClick={onClick} size="icon-sm" title={label} variant="ghost">
        {children}
      </Button>
    </NormalTooltip>
  )
}

export function WorkspacePreviewPane({
  filePath,
  onCopyPath,
  onClose,
  onOpenInNewTab,
  onOpenSystem,
  onShowInFolder
}: WorkspacePreviewPaneProps) {
  const { t } = useTranslation()
  const normalizedPath = useMemo(() => {
    if (!filePath) return null
    try {
      return normalizeFilePreviewPath(filePath)
    } catch {
      return null
    }
  }, [filePath])

  if (!normalizedPath) {
    return <EmptyState className="h-full" title={t('terminal.workspace.preview.empty')} />
  }

  const fileName = getFilePreviewFileName(normalizedPath)

  return (
    <FilePreview
      filePath={normalizedPath}
      header={
        <>
          <span className="truncate text-sm">{fileName}</span>
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            <PreviewAction
              label={t('terminal.workspace.preview.open_in_new_tab')}
              onClick={() => onOpenInNewTab(normalizedPath)}>
              <SquareArrowOutUpRight />
            </PreviewAction>
            <PreviewAction
              label={t('terminal.workspace.preview.open_system')}
              onClick={() => onOpenSystem(normalizedPath)}>
              <MonitorUp />
            </PreviewAction>
            <PreviewAction
              label={t('terminal.workspace.preview.show_in_folder')}
              onClick={() => onShowInFolder(normalizedPath)}>
              <FolderOpen />
            </PreviewAction>
            <PreviewAction label={t('terminal.workspace.preview.copy_path')} onClick={() => onCopyPath(normalizedPath)}>
              <Copy />
            </PreviewAction>
            <PreviewAction label={t('terminal.workspace.preview.close')} onClick={onClose}>
              <X />
            </PreviewAction>
          </div>
        </>
      }
    />
  )
}
