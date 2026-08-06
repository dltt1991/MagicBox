import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuItemContent,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@cherrystudio/ui'
import { ClipboardPaste, Copy, FilePlus, FolderOpen, FolderPlus, Info, Pencil, Scissors, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { WorkspaceTreeItem } from '../lib/workspaceTree'

export interface WorkspaceContextMenuActions {
  canPaste: boolean
  onOpenItem: (item: WorkspaceTreeItem) => void
  onRenameItem: (item: WorkspaceTreeItem) => void
  onCopyItems: (items: WorkspaceTreeItem[]) => void
  onCopyPaths: (paths: string[]) => void
  onCutItems: (items: WorkspaceTreeItem[]) => void
  onTrashItems: (items: WorkspaceTreeItem[]) => void
  onShowProperties: (path: string) => void
  onNewFile: () => void
  onNewFolder: () => void
  onPaste: () => void
  onOpenTerminalHere: () => void
}

interface WorkspaceContextMenuProps {
  actions: WorkspaceContextMenuActions
  children: ReactNode
  item?: WorkspaceTreeItem
  rootPath: string
  getSelectedItemsForItem?: (item: WorkspaceTreeItem) => WorkspaceTreeItem[]
  onActionComplete?: () => void
}

export function WorkspaceContextMenu({
  actions,
  children,
  item,
  rootPath,
  getSelectedItemsForItem,
  onActionComplete
}: WorkspaceContextMenuProps) {
  const { t } = useTranslation()
  const getTargetItems = () => (item ? (getSelectedItemsForItem?.(item) ?? [item]) : [])
  const targetItems = getTargetItems()
  const isBatchMenu = targetItems.length > 1
  const runAction = (action: () => void) => {
    action()
    onActionComplete?.()
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-44">
        {item && isBatchMenu ? (
          <>
            <ContextMenuItem onSelect={() => runAction(() => actions.onCopyItems(targetItems))}>
              <ContextMenuItemContent icon={<Copy size={12} />}>
                {t('terminal.workspace.context.copy')}
              </ContextMenuItemContent>
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => runAction(() => actions.onCopyPaths(targetItems.map((item) => item.path)))}>
              <ContextMenuItemContent icon={<Copy size={12} />}>
                {t('terminal.workspace.context.copy_path')}
              </ContextMenuItemContent>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => runAction(() => actions.onCutItems(targetItems))}>
              <ContextMenuItemContent icon={<Scissors size={12} />}>
                {t('terminal.workspace.context.cut')}
              </ContextMenuItemContent>
            </ContextMenuItem>
            <ContextMenuItem disabled={!actions.canPaste} onSelect={() => runAction(actions.onPaste)}>
              <ContextMenuItemContent icon={<ClipboardPaste size={12} />}>
                {t('terminal.workspace.context.paste')}
              </ContextMenuItemContent>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => runAction(() => actions.onTrashItems(targetItems))} variant="destructive">
              <ContextMenuItemContent icon={<Trash2 size={12} />}>
                {t('terminal.workspace.context.trash')}
              </ContextMenuItemContent>
            </ContextMenuItem>
          </>
        ) : item ? (
          <>
            <ContextMenuItem onSelect={() => runAction(() => actions.onOpenItem(item))}>
              <ContextMenuItemContent icon={<FolderOpen size={12} />}>
                {item.kind === 'directory'
                  ? t('terminal.workspace.context.open_folder')
                  : t('terminal.workspace.context.open_file')}
              </ContextMenuItemContent>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => runAction(() => actions.onRenameItem(item))}>
              <ContextMenuItemContent icon={<Pencil size={12} />}>
                {t('terminal.workspace.context.rename')}
              </ContextMenuItemContent>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => runAction(() => actions.onCopyItems(getTargetItems()))}>
              <ContextMenuItemContent icon={<Copy size={12} />}>
                {t('terminal.workspace.context.copy')}
              </ContextMenuItemContent>
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() =>
                runAction(() => actions.onCopyPaths(getTargetItems().map((targetItem) => targetItem.path)))
              }>
              <ContextMenuItemContent icon={<Copy size={12} />}>
                {t('terminal.workspace.context.copy_path')}
              </ContextMenuItemContent>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => runAction(() => actions.onCutItems(getTargetItems()))}>
              <ContextMenuItemContent icon={<Scissors size={12} />}>
                {t('terminal.workspace.context.cut')}
              </ContextMenuItemContent>
            </ContextMenuItem>
            <ContextMenuItem disabled={!actions.canPaste} onSelect={() => runAction(actions.onPaste)}>
              <ContextMenuItemContent icon={<ClipboardPaste size={12} />}>
                {t('terminal.workspace.context.paste')}
              </ContextMenuItemContent>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => runAction(() => actions.onShowProperties(item.path))}>
              <ContextMenuItemContent icon={<Info size={12} />}>
                {t('terminal.workspace.context.properties')}
              </ContextMenuItemContent>
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => runAction(() => actions.onTrashItems(getTargetItems()))}
              variant="destructive">
              <ContextMenuItemContent icon={<Trash2 size={12} />}>
                {t('terminal.workspace.context.trash')}
              </ContextMenuItemContent>
            </ContextMenuItem>
          </>
        ) : (
          <>
            <ContextMenuItem onSelect={() => runAction(actions.onNewFolder)}>
              <ContextMenuItemContent icon={<FolderPlus size={12} />}>
                {t('terminal.workspace.context.new_folder')}
              </ContextMenuItemContent>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => runAction(actions.onNewFile)}>
              <ContextMenuItemContent icon={<FilePlus size={12} />}>
                {t('terminal.workspace.context.new_file')}
              </ContextMenuItemContent>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem disabled={!actions.canPaste} onSelect={() => runAction(actions.onPaste)}>
              <ContextMenuItemContent icon={<ClipboardPaste size={12} />}>
                {t('terminal.workspace.context.paste')}
              </ContextMenuItemContent>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => runAction(actions.onOpenTerminalHere)}>
              <ContextMenuItemContent icon={<FolderOpen size={12} />}>
                {t('terminal.workspace.context.open_terminal_here')}
              </ContextMenuItemContent>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => runAction(() => actions.onCopyPaths([rootPath]))}>
              <ContextMenuItemContent icon={<Copy size={12} />}>
                {t('terminal.workspace.context.copy_path')}
              </ContextMenuItemContent>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => runAction(() => actions.onShowProperties(rootPath))}>
              <ContextMenuItemContent icon={<Info size={12} />}>
                {t('terminal.workspace.context.folder_properties')}
              </ContextMenuItemContent>
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
