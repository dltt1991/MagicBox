import { EmptyState } from '@cherrystudio/ui'
import { cn } from '@cherrystudio/ui/lib/utils'
import { Icon } from '@iconify/react'
import { loggerService } from '@logger'
import { useCommandShortcutPreferences } from '@renderer/hooks/command'
import { useDirectoryTree } from '@renderer/hooks/useDirectoryTree'
import { getFileIconName } from '@renderer/utils/fileIconName'
import { platform } from '@renderer/utils/platform'
import type { SupportedPlatform } from '@shared/types/command'
import { resolveCommandByKeybinding } from '@shared/utils/command'
import { getShortcutBindingFromKeyboardEvent } from '@shared/utils/shortcut'
import { ChevronDown, ChevronRight, Star } from 'lucide-react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  projectWorkspaceTree,
  type WorkspaceIconSize,
  type WorkspaceSortDirection,
  type WorkspaceSortKey,
  type WorkspaceTreeItem,
  type WorkspaceViewMode
} from '../lib/workspaceTree'
import { WorkspaceContextMenu, type WorkspaceContextMenuActions } from './WorkspaceContextMenu'

const TERMINAL_PATH_DRAG_MIME_TYPE = 'application/x-cherry-terminal-path'
const MATERIAL_ICON_PREFIX = 'material-icon-theme:'
const logger = loggerService.withContext('WorkspaceFileTree')
const WORKSPACE_ICON_CLASS: Record<WorkspaceIconSize, string> = {
  small: 'size-4',
  medium: 'size-6',
  large: 'size-8'
}
const WORKSPACE_ICON_PIXELS: Record<WorkspaceIconSize, number> = {
  small: 16,
  medium: 24,
  large: 32
}
const ICON_CARD_CLASS: Record<WorkspaceIconSize, string> = {
  small: 'min-h-20 p-2',
  medium: 'min-h-24 p-3',
  large: 'min-h-32 p-4'
}
const ICON_GRID_CLASS: Record<WorkspaceIconSize, string> = {
  small: 'grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))]',
  medium: 'grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))]',
  large: 'grid-cols-[repeat(auto-fill,minmax(7rem,1fr))]'
}

type MarqueePoint = {
  x: number
  y: number
}

type MarqueeSelection = {
  start: MarqueePoint
  current: MarqueePoint
}

type WorkspaceKeyboardEvent = {
  key: string
  code?: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  target: EventTarget | null
  preventDefault: () => void
  stopPropagation: () => void
}

const FILE_MANAGER_COMMAND_CONTEXT = { 'file_manager.focused': true } as const
const FILE_MANAGER_COMMAND_PREFIX = 'file_manager.'

export interface WorkspaceFileTreeProps {
  rootPath: string | null
  selectedPath: string | null
  includeHidden: boolean
  viewMode: WorkspaceViewMode
  iconSize?: WorkspaceIconSize
  sortKey: WorkspaceSortKey
  sortDirection: WorkspaceSortDirection
  onSelectPath: (path: string, kind: WorkspaceTreeItem['kind']) => void
  onHighlightPath?: (path: string) => void
  onOpenChildHistoryPath?: () => void
  onOpenParentPath?: (path: string) => void
  expandedTreePaths?: readonly string[]
  onExpandedTreePathsChange?: (paths: string[]) => void
  contextMenuActions?: WorkspaceContextMenuActions
  favoriteDirectoryPaths?: readonly string[]
  onToggleFavoriteDirectory?: (path: string) => void
  refreshKey?: number
  restoreFocusKey?: number
}

function formatSize(size: number): string {
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

function formatTime(mtime: number): string {
  if (!mtime) return '-'
  return new Date(mtime).toLocaleString()
}

function isHiddenWorkspaceItem(item: WorkspaceTreeItem): boolean {
  return item.name.startsWith('.')
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false

  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

function containsEventTarget(element: HTMLElement | null, target: EventTarget | null): boolean {
  return Boolean(element && target instanceof Node && element.contains(target))
}

function getParentPath(path: string): string | null {
  const normalizedPath = path.replace(/\\/g, '/').replace(/\/+$/, '')
  if (!normalizedPath || normalizedPath === '/') return null
  if (/^[A-Za-z]:$/.test(normalizedPath)) return null

  const parentPath = normalizedPath.slice(0, normalizedPath.lastIndexOf('/')) || '/'
  if (/^[A-Za-z]:$/.test(parentPath)) return `${parentPath}/`
  if (parentPath === normalizedPath) return null

  return parentPath
}

function basenameOfPath(path: string): string {
  const normalizedPath = path.replace(/\\/g, '/').replace(/\/+$/, '')
  const index = normalizedPath.lastIndexOf('/')
  return index < 0 ? normalizedPath : normalizedPath.slice(index + 1)
}

function getMarqueeRect(selection: MarqueeSelection) {
  const left = Math.min(selection.start.x, selection.current.x)
  const top = Math.min(selection.start.y, selection.current.y)
  const right = Math.max(selection.start.x, selection.current.x)
  const bottom = Math.max(selection.start.y, selection.current.y)

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
    right,
    bottom
  }
}

function rectsIntersect(a: { left: number; right: number; top: number; bottom: number }, b: DOMRect) {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top
}

function flattenWorkspaceItems(items: readonly WorkspaceTreeItem[]): WorkspaceTreeItem[] {
  const flattenedItems: WorkspaceTreeItem[] = []

  const visit = (treeItems: readonly WorkspaceTreeItem[]) => {
    for (const item of treeItems) {
      flattenedItems.push(item)
      if (item.children?.length) visit(item.children)
    }
  }

  visit(items)
  return flattenedItems
}

function flattenVisibleTreeItems(
  items: readonly WorkspaceTreeItem[],
  expandedPaths: ReadonlySet<string>
): Array<{ item: WorkspaceTreeItem; depth: number }> {
  const visibleItems: Array<{ item: WorkspaceTreeItem; depth: number }> = []

  const visit = (treeItems: readonly WorkspaceTreeItem[], depth: number) => {
    for (const item of treeItems) {
      visibleItems.push({ item, depth })
      if (item.kind === 'directory' && expandedPaths.has(item.path) && item.children?.length) {
        visit(item.children, depth + 1)
      }
    }
  }

  visit(items, 0)
  return visibleItems
}

function compareWorkspaceItems(
  left: WorkspaceTreeItem,
  right: WorkspaceTreeItem,
  sortKey: WorkspaceSortKey,
  sortDirection: WorkspaceSortDirection
): number {
  if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1

  const direction = sortDirection === 'asc' ? 1 : -1
  if (sortKey === 'mtime') {
    const result = left.mtime - right.mtime
    if (result !== 0) return result * direction
  }
  if (sortKey === 'size') {
    const result = left.size - right.size
    if (result !== 0) return result * direction
  }

  return left.name.localeCompare(right.name) * direction
}

function mergeLazyTreeChildren(
  items: readonly WorkspaceTreeItem[],
  lazyChildrenByPath: ReadonlyMap<string, readonly WorkspaceTreeItem[]>,
  sortKey: WorkspaceSortKey,
  sortDirection: WorkspaceSortDirection
): WorkspaceTreeItem[] {
  return items.map((item) => {
    if (item.kind !== 'directory') return item

    const lazyChildren = lazyChildrenByPath.get(item.path)
    const children = lazyChildren ?? item.children
    if (!children?.length) return item

    return {
      ...item,
      children: mergeLazyTreeChildren(children, lazyChildrenByPath, sortKey, sortDirection).sort((left, right) =>
        compareWorkspaceItems(left, right, sortKey, sortDirection)
      )
    }
  })
}

function WorkspaceItemIcon({ item, size = 'small' }: { item: WorkspaceTreeItem; size?: WorkspaceIconSize }) {
  const iconName = item.kind === 'directory' ? 'folder-base' : getFileIconName(item.path)

  return (
    <Icon
      className={cn('shrink-0', WORKSPACE_ICON_CLASS[size])}
      height={WORKSPACE_ICON_PIXELS[size]}
      icon={`${MATERIAL_ICON_PREFIX}${iconName}`}
      width={WORKSPACE_ICON_PIXELS[size]}
    />
  )
}

export function WorkspaceFileTree({
  rootPath,
  selectedPath,
  includeHidden,
  viewMode,
  iconSize,
  sortKey,
  sortDirection,
  onSelectPath,
  onHighlightPath,
  onOpenChildHistoryPath,
  onOpenParentPath,
  expandedTreePaths,
  onExpandedTreePathsChange,
  contextMenuActions,
  favoriteDirectoryPaths,
  onToggleFavoriteDirectory,
  refreshKey,
  restoreFocusKey
}: WorkspaceFileTreeProps) {
  return (
    <WorkspaceFileTreeContent
      key={`${includeHidden}:${viewMode}:${refreshKey ?? 0}`}
      includeHidden={includeHidden}
      iconSize={iconSize}
      contextMenuActions={contextMenuActions}
      favoriteDirectoryPaths={favoriteDirectoryPaths}
      onHighlightPath={onHighlightPath}
      expandedTreePaths={expandedTreePaths}
      onExpandedTreePathsChange={onExpandedTreePathsChange}
      onOpenChildHistoryPath={onOpenChildHistoryPath}
      onOpenParentPath={onOpenParentPath}
      onSelectPath={onSelectPath}
      onToggleFavoriteDirectory={onToggleFavoriteDirectory}
      rootPath={rootPath}
      restoreFocusKey={restoreFocusKey}
      sortDirection={sortDirection}
      sortKey={sortKey}
      selectedPath={selectedPath}
      viewMode={viewMode}
    />
  )
}

function WorkspaceFileTreeContent({
  rootPath,
  selectedPath,
  includeHidden,
  viewMode,
  iconSize = 'medium',
  sortKey,
  sortDirection,
  onSelectPath,
  onHighlightPath,
  onOpenChildHistoryPath,
  onOpenParentPath,
  expandedTreePaths,
  onExpandedTreePathsChange,
  contextMenuActions,
  favoriteDirectoryPaths = [],
  onToggleFavoriteDirectory,
  restoreFocusKey
}: WorkspaceFileTreeProps) {
  const { t } = useTranslation()
  const contentRef = useRef<HTMLDivElement>(null)
  const { error, isLoading, root, version } = useDirectoryTree(rootPath ?? undefined, {
    includeHidden,
    maxDepth: 1,
    respectGitignore: true,
    withStats: true
  })
  const projectedItems = useMemo(
    () => (root ? projectWorkspaceTree(root, sortKey, sortDirection) : []),
    // useDirectoryTree preserves root identity while applying mutations, so version must invalidate this projection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [root, version, sortKey, sortDirection]
  )
  const [internalExpandedTreePaths, setInternalExpandedTreePaths] = useState<ReadonlySet<string>>(() => new Set())
  const [lazyChildrenByPath, setLazyChildrenByPath] = useState<ReadonlyMap<string, readonly WorkspaceTreeItem[]>>(
    () => new Map()
  )
  const effectiveExpandedTreePaths = useMemo(
    () => new Set(expandedTreePaths ?? internalExpandedTreePaths),
    [expandedTreePaths, internalExpandedTreePaths]
  )
  const items = useMemo(
    () => mergeLazyTreeChildren(projectedItems, lazyChildrenByPath, sortKey, sortDirection),
    [lazyChildrenByPath, projectedItems, sortDirection, sortKey]
  )
  const allItems = useMemo(() => flattenWorkspaceItems(items), [items])
  const visibleTreeItems = useMemo(
    () => flattenVisibleTreeItems(items, effectiveExpandedTreePaths),
    [effectiveExpandedTreePaths, items]
  )
  const navigationItems = useMemo(
    () => (viewMode === 'tree' ? visibleTreeItems.map(({ item }) => item) : items),
    [items, viewMode, visibleTreeItems]
  )
  const selectedItem = useMemo(
    () =>
      navigationItems.find((item) => item.path === selectedPath) ??
      allItems.find((item) => item.path === selectedPath) ??
      null,
    [allItems, navigationItems, selectedPath]
  )
  const selectedIndex = useMemo(
    () => navigationItems.findIndex((item) => item.path === selectedPath),
    [navigationItems, selectedPath]
  )
  const favoriteDirectorySet = useMemo(() => new Set(favoriteDirectoryPaths), [favoriteDirectoryPaths])
  const [marqueeSelection, setMarqueeSelection] = useState<MarqueeSelection | null>(null)
  const [marqueeSelectedPaths, setMarqueeSelectedPaths] = useState<ReadonlySet<string>>(() => new Set())
  const [selectedPaths, setSelectedPaths] = useState<ReadonlySet<string>>(() => new Set())
  const [contextMenuItem, setContextMenuItem] = useState<WorkspaceTreeItem | null>(null)
  const isWorkspaceShortcutActiveRef = useRef(false)
  const loadingLazyChildrenPathsRef = useRef<Set<string>>(new Set())
  const marqueeSelectedPathsRef = useRef<ReadonlySet<string>>(new Set())
  const previousRootPathRef = useRef(rootPath)
  const selectedPathsRef = useRef<ReadonlySet<string>>(new Set())
  const [selectionAnchorPath, setSelectionAnchorPath] = useState<string | null>(null)
  const shortcutPreferences = useCommandShortcutPreferences()
  const applyMarqueeSelectedPaths = useCallback((paths: ReadonlySet<string>) => {
    marqueeSelectedPathsRef.current = paths
    setMarqueeSelectedPaths(paths)
  }, [])
  const applySelectedPaths = useCallback((paths: ReadonlySet<string>) => {
    selectedPathsRef.current = paths
    setSelectedPaths(paths)
  }, [])
  const canUseWorkspaceShortcuts = Boolean(contextMenuActions)

  const restoreWorkspaceTreeFocus = useCallback(() => {
    isWorkspaceShortcutActiveRef.current = true
    contentRef.current?.focus({ preventScroll: true })
  }, [])

  const getContentPoint = useCallback((event: MouseEvent | ReactMouseEvent<HTMLDivElement>) => {
    const content = contentRef.current
    if (!content) return null

    const rect = content.getBoundingClientRect()
    return {
      x: event.clientX - rect.left + content.scrollLeft,
      y: event.clientY - rect.top + content.scrollTop
    }
  }, [])

  const updateMarqueeSelection = useCallback(
    (selection: MarqueeSelection) => {
      const content = contentRef.current
      if (!content) return

      const marqueeRect = getMarqueeRect(selection)
      const contentRect = content.getBoundingClientRect()
      const nextPaths = new Set<string>()

      content.querySelectorAll<HTMLElement>('[data-workspace-item-path]').forEach((element) => {
        const path = element.dataset.workspaceItemPath
        if (!path) return

        const itemRect = element.getBoundingClientRect()
        const relativeItemRect = new DOMRect(
          itemRect.left - contentRect.left + content.scrollLeft,
          itemRect.top - contentRect.top + content.scrollTop,
          itemRect.width,
          itemRect.height
        )

        if (rectsIntersect(marqueeRect, relativeItemRect)) nextPaths.add(path)
      })

      applyMarqueeSelectedPaths(nextPaths)
    },
    [applyMarqueeSelectedPaths]
  )

  const getCurrentSelectedItems = useCallback(() => {
    const currentPaths = new Set([...selectedPathsRef.current, ...marqueeSelectedPathsRef.current])
    return allItems.filter((item) => currentPaths.has(item.path))
  }, [allItems])

  const getShortcutTargetItems = useCallback(() => {
    const currentSelectedItems = getCurrentSelectedItems()
    return currentSelectedItems.length > 0 ? currentSelectedItems : selectedItem ? [selectedItem] : []
  }, [getCurrentSelectedItems, selectedItem])

  const activateWorkspaceShortcuts = useCallback(() => {
    isWorkspaceShortcutActiveRef.current = true
  }, [])

  const activateWorkspaceKeyboard = useCallback(() => {
    isWorkspaceShortcutActiveRef.current = true
    contentRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    const rootPathChanged = previousRootPathRef.current !== rootPath
    previousRootPathRef.current = rootPath

    if (marqueeSelectedPathsRef.current.size > 0) applyMarqueeSelectedPaths(new Set())
    setMarqueeSelection((currentSelection) => (currentSelection ? null : currentSelection))
    if (selectedPathsRef.current.size > 0) applySelectedPaths(new Set())
    setSelectionAnchorPath(null)
    if (rootPathChanged) {
      setLazyChildrenByPath(new Map())
      setInternalExpandedTreePaths(new Set())
    }

    if (rootPathChanged && canUseWorkspaceShortcuts && document.activeElement === document.body) {
      contentRef.current?.focus()
    }
  }, [applyMarqueeSelectedPaths, applySelectedPaths, canUseWorkspaceShortcuts, rootPath, version, viewMode])

  useEffect(() => {
    if (!canUseWorkspaceShortcuts || !restoreFocusKey) return

    restoreWorkspaceTreeFocus()
  }, [canUseWorkspaceShortcuts, restoreFocusKey, restoreWorkspaceTreeFocus])

  useEffect(() => {
    if (!marqueeSelection) return

    const handleMouseMove = (event: MouseEvent) => {
      const current = getContentPoint(event)
      if (!current) return

      const nextSelection = { ...marqueeSelection, current }
      setMarqueeSelection(nextSelection)
      updateMarqueeSelection(nextSelection)
    }

    const handleMouseUp = () => {
      const nextPaths = marqueeSelectedPathsRef.current
      applySelectedPaths(nextPaths)
      setSelectionAnchorPath(nextPaths.values().next().value ?? null)
      setMarqueeSelection(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp, { once: true })

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [applySelectedPaths, getContentPoint, marqueeSelection, updateMarqueeSelection])

  const handleMarqueeMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isEditableShortcutTarget(event.target)) return
    if ((event.target as HTMLElement).closest('[data-workspace-item-path]')) return

    const start = getContentPoint(event)
    if (!start) return

    event.preventDefault()
    const nextSelection = { start, current: start }
    setMarqueeSelection(nextSelection)
    applyMarqueeSelectedPaths(new Set())
  }

  const selectSingleItem = (item: WorkspaceTreeItem) => {
    applySelectedPaths(new Set([item.path]))
    applyMarqueeSelectedPaths(new Set())
    setSelectionAnchorPath(item.path)
    onSelectPath(item.path, item.kind)
  }

  const toggleItemSelection = (item: WorkspaceTreeItem) => {
    applyMarqueeSelectedPaths(new Set())
    const nextPaths = new Set(selectedPathsRef.current)
    if (nextPaths.has(item.path)) {
      nextPaths.delete(item.path)
    } else {
      nextPaths.add(item.path)
    }
    applySelectedPaths(nextPaths)
    setSelectionAnchorPath(item.path)
  }

  const selectRangeToItem = (item: WorkspaceTreeItem) => {
    applyMarqueeSelectedPaths(new Set())
    const anchorPath = selectionAnchorPath ?? selectedPath ?? item.path
    const anchorIndex = navigationItems.findIndex((candidate) => candidate.path === anchorPath)
    const itemIndex = navigationItems.findIndex((candidate) => candidate.path === item.path)

    if (anchorIndex < 0 || itemIndex < 0) {
      applySelectedPaths(new Set([item.path]))
      setSelectionAnchorPath(item.path)
      return
    }

    const startIndex = Math.min(anchorIndex, itemIndex)
    const endIndex = Math.max(anchorIndex, itemIndex)
    applySelectedPaths(new Set(navigationItems.slice(startIndex, endIndex + 1).map((candidate) => candidate.path)))
  }

  const ensureContextMenuTarget = (item: WorkspaceTreeItem) => {
    if (selectedPathsRef.current.has(item.path) || marqueeSelectedPathsRef.current.has(item.path)) return

    applySelectedPaths(new Set([item.path]))
    applyMarqueeSelectedPaths(new Set())
    setSelectionAnchorPath(item.path)
  }

  const getSelectedItemsForContextItem = useCallback(
    (item: WorkspaceTreeItem) => {
      const currentSelectedItems = getCurrentSelectedItems()
      return currentSelectedItems.some((selectedItem) => selectedItem.path === item.path)
        ? currentSelectedItems
        : [item]
    },
    [getCurrentSelectedItems]
  )

  const getDraggedItemsForItem = useCallback(
    (item: WorkspaceTreeItem) => {
      const currentSelectedItems = getCurrentSelectedItems()
      return currentSelectedItems.some((selectedItem) => selectedItem.path === item.path)
        ? currentSelectedItems
        : [item]
    },
    [getCurrentSelectedItems]
  )

  const handleContextMenuCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!rootPath || !contextMenuActions) return

    const itemElement = (event.target as HTMLElement).closest<HTMLElement>('[data-workspace-item-path]')
    const item = itemElement?.dataset.workspaceItemPath
      ? (allItems.find((candidate) => candidate.path === itemElement.dataset.workspaceItemPath) ?? null)
      : null

    setContextMenuItem(item)
    if (item) ensureContextMenuTarget(item)
  }

  const runShortcut = (event: WorkspaceKeyboardEvent, action: () => void) => {
    event.preventDefault()
    event.stopPropagation()
    action()
  }

  const setExpandedPaths = useCallback(
    (paths: ReadonlySet<string>) => {
      if (onExpandedTreePathsChange) {
        onExpandedTreePathsChange([...paths])
        return
      }
      setInternalExpandedTreePaths(new Set(paths))
    },
    [onExpandedTreePathsChange]
  )

  const loadLazyTreeChildren = useCallback(
    async (item: WorkspaceTreeItem) => {
      if (lazyChildrenByPath.has(item.path)) return
      if (loadingLazyChildrenPathsRef.current.has(item.path)) return
      loadingLazyChildrenPathsRef.current.add(item.path)

      try {
        const entries = await window.api.file.listDirectoryEntries(item.path, {
          includeDirectories: true,
          includeFiles: true,
          includeHidden,
          recursive: false
        })
        const lazyChildren = entries.map((entry) => ({
          id: entry.path,
          name: basenameOfPath(entry.path),
          path: entry.path,
          kind: entry.isDirectory ? ('directory' as const) : ('file' as const),
          mtime: 0,
          size: 0
        }))

        setLazyChildrenByPath((currentChildren) => {
          if (currentChildren.has(item.path)) return currentChildren
          const nextChildren = new Map(currentChildren)
          nextChildren.set(item.path, lazyChildren)
          return nextChildren
        })
      } catch (error) {
        logger.error(`Failed to load workspace tree children for ${item.path}`, error as Error)
      } finally {
        loadingLazyChildrenPathsRef.current.delete(item.path)
      }
    },
    [includeHidden, lazyChildrenByPath]
  )

  useEffect(() => {
    if (viewMode !== 'tree') return

    for (const item of allItems) {
      if (item.kind !== 'directory') continue
      if (!effectiveExpandedTreePaths.has(item.path)) continue
      if (item.children?.length || lazyChildrenByPath.has(item.path)) continue

      void loadLazyTreeChildren(item)
    }
  }, [allItems, effectiveExpandedTreePaths, lazyChildrenByPath, loadLazyTreeChildren, viewMode])

  const toggleTreeDirectory = useCallback(
    (item: WorkspaceTreeItem) => {
      const nextPaths = new Set(effectiveExpandedTreePaths)
      if (nextPaths.has(item.path)) {
        nextPaths.delete(item.path)
      } else {
        nextPaths.add(item.path)
        void loadLazyTreeChildren(item)
      }
      setExpandedPaths(nextPaths)
    },
    [effectiveExpandedTreePaths, loadLazyTreeChildren, setExpandedPaths]
  )

  const resolveFileManagerCommand = useCallback(
    (event: WorkspaceKeyboardEvent) =>
      resolveCommandByKeybinding({
        binding: getShortcutBindingFromKeyboardEvent(event),
        preferences: shortcutPreferences,
        context: FILE_MANAGER_COMMAND_CONTEXT,
        platform: platform as SupportedPlatform,
        scope: 'renderer',
        canExecuteCommand: (command) => command.startsWith(FILE_MANAGER_COMMAND_PREFIX)
      }),
    [shortcutPreferences]
  )

  const handleKeyDown = useCallback(
    (event: WorkspaceKeyboardEvent) => {
      if (!rootPath || isEditableShortcutTarget(event.target)) return

      const key = event.key.toLowerCase()
      const hasModifier = event.metaKey || event.ctrlKey
      const command = resolveFileManagerCommand(event)

      if (command === 'file_manager.open_parent') {
        const parentPath = getParentPath(rootPath)
        if (parentPath) runShortcut(event, () => onOpenParentPath?.(parentPath))
        return
      }

      if (command === 'file_manager.open_child_history') {
        runShortcut(event, () => onOpenChildHistoryPath?.())
        return
      }

      if (!hasModifier && !event.altKey && !event.shiftKey) {
        if (viewMode === 'tree' && selectedItem) {
          if (key === 'arrowright' && selectedItem.kind === 'directory') {
            const firstChild = selectedItem.children?.[0]
            if (!effectiveExpandedTreePaths.has(selectedItem.path)) {
              runShortcut(event, () => toggleTreeDirectory(selectedItem))
              return
            }
            if (firstChild) {
              runShortcut(event, () => onHighlightPath?.(firstChild.path))
              return
            }
          }

          if (key === 'arrowleft') {
            if (selectedItem.kind === 'directory' && effectiveExpandedTreePaths.has(selectedItem.path)) {
              runShortcut(event, () => toggleTreeDirectory(selectedItem))
              return
            }

            const parentPath = getParentPath(selectedItem.path)
            const parentItem = parentPath ? allItems.find((item) => item.path === parentPath) : null
            if (parentItem) {
              runShortcut(event, () => onHighlightPath?.(parentItem.path))
              return
            }
          }
        }

        const direction =
          key === 'arrowdown' || key === 'arrowright' ? 1 : key === 'arrowup' || key === 'arrowleft' ? -1 : 0

        if (direction !== 0 && navigationItems.length > 0) {
          const fallbackIndex = direction > 0 ? 0 : navigationItems.length - 1
          const nextIndex =
            selectedIndex < 0
              ? fallbackIndex
              : Math.min(navigationItems.length - 1, Math.max(0, selectedIndex + direction))

          runShortcut(event, () => onHighlightPath?.(navigationItems[nextIndex].path))
          return
        }
      }

      if (!contextMenuActions) return

      const showProperties = () => contextMenuActions.onShowProperties(selectedItem ? selectedItem.path : rootPath)

      if (command === 'file_manager.select_all') {
        runShortcut(event, () => {
          applyMarqueeSelectedPaths(new Set())
          applySelectedPaths(new Set(navigationItems.map((item) => item.path)))
          setSelectionAnchorPath(navigationItems[0]?.path ?? null)
        })
        return
      }

      if (command === 'file_manager.new_folder') {
        runShortcut(event, contextMenuActions.onNewFolder)
        return
      }

      if (command === 'file_manager.new_file') {
        runShortcut(event, contextMenuActions.onNewFile)
        return
      }

      if (command === 'file_manager.open_terminal_here') {
        runShortcut(event, contextMenuActions.onOpenTerminalHere)
        return
      }

      if (command === 'file_manager.paste') {
        runShortcut(event, contextMenuActions.onPaste)
        return
      }

      if (command === 'file_manager.properties') {
        runShortcut(event, showProperties)
        return
      }

      const currentShortcutTargetItems = getShortcutTargetItems()
      if (command === 'file_manager.copy_path') {
        runShortcut(event, () =>
          contextMenuActions.onCopyPaths(
            currentShortcutTargetItems.length > 0 ? currentShortcutTargetItems.map((item) => item.path) : [rootPath]
          )
        )
        return
      }

      if (currentShortcutTargetItems.length === 0) return
      const primaryItem = currentShortcutTargetItems[0]

      if (command === 'file_manager.open') {
        runShortcut(event, () => contextMenuActions.onOpenItem(primaryItem))
        return
      }

      if (command === 'file_manager.rename') {
        runShortcut(event, () => contextMenuActions.onRenameItem(primaryItem))
        return
      }

      if (command === 'file_manager.copy') {
        runShortcut(event, () => contextMenuActions.onCopyItems(currentShortcutTargetItems))
        return
      }

      if (command === 'file_manager.cut') {
        runShortcut(event, () => contextMenuActions.onCutItems(currentShortcutTargetItems))
        return
      }

      if (command === 'file_manager.delete') {
        runShortcut(event, () => contextMenuActions.onTrashItems(currentShortcutTargetItems))
      }
    },
    [
      contextMenuActions,
      applyMarqueeSelectedPaths,
      applySelectedPaths,
      allItems,
      effectiveExpandedTreePaths,
      getShortcutTargetItems,
      navigationItems,
      onHighlightPath,
      onOpenChildHistoryPath,
      onOpenParentPath,
      resolveFileManagerCommand,
      rootPath,
      selectedIndex,
      selectedItem,
      toggleTreeDirectory,
      viewMode
    ]
  )

  useEffect(() => {
    if (!canUseWorkspaceShortcuts) return

    const handleDocumentMouseDown = (event: MouseEvent) => {
      isWorkspaceShortcutActiveRef.current = containsEventTarget(contentRef.current, event.target)
    }

    const handleDocumentFocusIn = (event: FocusEvent) => {
      isWorkspaceShortcutActiveRef.current = containsEventTarget(contentRef.current, event.target)
    }

    const handleDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!isWorkspaceShortcutActiveRef.current) return
      if (containsEventTarget(contentRef.current, event.target)) return
      handleKeyDown(event)
    }

    document.addEventListener('mousedown', handleDocumentMouseDown, true)
    document.addEventListener('focusin', handleDocumentFocusIn, true)
    document.addEventListener('keydown', handleDocumentKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown, true)
      document.removeEventListener('focusin', handleDocumentFocusIn, true)
      document.removeEventListener('keydown', handleDocumentKeyDown)
    }
  }, [canUseWorkspaceShortcuts, handleKeyDown])

  useEffect(() => {
    if (!selectedPath) return

    const selectedElement = Array.from(
      contentRef.current?.querySelectorAll<HTMLElement>('[data-workspace-item-path]') ?? []
    ).find((element) => element.dataset.workspaceItemPath === selectedPath)

    selectedElement?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [navigationItems, selectedPath])

  const renderItem = (item: WorkspaceTreeItem, className?: string, depth = 0) => {
    const isHidden = isHiddenWorkspaceItem(item)
    const isSelected = selectedPath === item.path || selectedPaths.has(item.path) || marqueeSelectedPaths.has(item.path)
    const isFavoriteDirectory = item.kind === 'directory' && favoriteDirectorySet.has(item.path)
    const canToggleFavorite = item.kind === 'directory' && Boolean(onToggleFavoriteDirectory)
    const isExpandedTreeDirectory =
      viewMode === 'tree' && item.kind === 'directory' && effectiveExpandedTreePaths.has(item.path)
    const favoriteButton = canToggleFavorite ? (
      <button
        aria-label={t(isFavoriteDirectory ? 'terminal.workspace.favorite.remove' : 'terminal.workspace.favorite.add', {
          name: item.name
        })}
        className={cn(
          'flex size-6 items-center justify-center rounded text-muted-foreground transition duration-150 hover:scale-110 hover:bg-accent hover:text-foreground',
          isFavoriteDirectory ? 'text-warning opacity-100' : 'opacity-0 group-hover:opacity-100'
        )}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onToggleFavoriteDirectory?.(item.path)
        }}
        onMouseDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        title={t(isFavoriteDirectory ? 'terminal.workspace.favorite.remove' : 'terminal.workspace.favorite.add', {
          name: item.name
        })}
        type="button">
        <Star className="size-4" fill={isFavoriteDirectory ? 'currentColor' : 'none'} />
      </button>
    ) : null

    const button = (
      <div
        aria-label={item.name}
        aria-expanded={viewMode === 'tree' && item.kind === 'directory' ? isExpandedTreeDirectory : undefined}
        className={cn(
          'group relative min-w-0 rounded-md text-left text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
          viewMode === 'list' && 'w-full',
          viewMode === 'tree' && 'w-full',
          isSelected && 'bg-accent text-accent-foreground',
          isHidden && 'opacity-60',
          className
        )}
        data-hidden={isHidden ? 'true' : undefined}
        data-kind={item.kind}
        data-list-columns={viewMode === 'list' ? 'workspace-file-list' : undefined}
        data-selected={isSelected ? 'true' : undefined}
        data-testid="workspace-item"
        data-workspace-item-path={item.path}
        draggable
        key={item.id}
        onClick={(event) => {
          if (contextMenuActions) activateWorkspaceKeyboard()

          if (event.shiftKey) {
            selectRangeToItem(item)
            return
          }

          if (event.metaKey || event.ctrlKey) {
            toggleItemSelection(item)
            return
          }

          if (viewMode === 'tree' && item.kind === 'directory') {
            applySelectedPaths(new Set())
            applyMarqueeSelectedPaths(new Set())
            setSelectionAnchorPath(item.path)
            onHighlightPath?.(item.path)
            toggleTreeDirectory(item)
            return
          }

          selectSingleItem(item)
        }}
        onContextMenu={() => {
          ensureContextMenuTarget(item)
        }}
        onMouseDown={() => {
          if (contextMenuActions) activateWorkspaceKeyboard()
        }}
        onDragStart={(event) => {
          const draggedPaths = getDraggedItemsForItem(item).map((draggedItem) => draggedItem.path)
          event.dataTransfer.setData(
            TERMINAL_PATH_DRAG_MIME_TYPE,
            JSON.stringify(draggedPaths.length === 1 ? { path: item.path } : { paths: draggedPaths })
          )
        }}
        role="button"
        tabIndex={-1}
        title={item.path}>
        {viewMode === 'icons' ? (
          <span className={cn('flex flex-col items-center justify-center gap-2', ICON_CARD_CLASS[iconSize])}>
            <WorkspaceItemIcon item={item} size={iconSize} />
            {favoriteButton && (
              <span className="absolute top-1 right-1" data-workspace-favorite-slot>
                {favoriteButton}
              </span>
            )}
            <span className="line-clamp-2 w-full break-words text-center text-xs">{item.name}</span>
          </span>
        ) : viewMode === 'tree' ? (
          <span
            className="flex min-h-8 items-center gap-1 px-2 pr-9"
            data-workspace-tree-row
            style={{ paddingLeft: depth * 16 + 8 }}>
            <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
              {item.kind === 'directory' ? (
                isExpandedTreeDirectory ? (
                  <ChevronDown className="size-3.5" />
                ) : (
                  <ChevronRight className="size-3.5" />
                )
              ) : null}
            </span>
            <WorkspaceItemIcon item={item} />
            <span className="truncate">{item.name}</span>
            <span className="absolute top-1 right-1 flex justify-end" data-workspace-favorite-slot>
              {favoriteButton}
            </span>
          </span>
        ) : (
          <span className="grid min-h-8 items-center gap-2 px-2 pr-9" data-workspace-list-row>
            <span className="flex min-w-0 items-center gap-2">
              <WorkspaceItemIcon item={item} />
              <span className="truncate">{item.name}</span>
            </span>
            <span className="hidden truncate text-muted-foreground text-xs" data-workspace-list-metadata="mtime">
              {formatTime(item.mtime)}
            </span>
            <span
              className="hidden truncate text-right text-muted-foreground text-xs"
              data-workspace-list-metadata="size">
              {item.kind === 'directory' ? '-' : formatSize(item.size)}
            </span>
            <span className="absolute top-1 right-1 flex justify-end" data-workspace-favorite-slot>
              {favoriteButton}
            </span>
          </span>
        )}
      </div>
    )

    return button
  }

  const body = !rootPath ? (
    <EmptyState className="h-full" title={t('terminal.workspace.tree.empty')} />
  ) : isLoading ? (
    <EmptyState className="h-full" title={t('terminal.workspace.tree.loading')} />
  ) : error ? (
    <EmptyState className="h-full" title={t('terminal.workspace.tree.error')} />
  ) : items.length === 0 ? (
    <EmptyState className="h-full" title={t('terminal.workspace.tree.no_files')} />
  ) : viewMode === 'list' ? (
    <div className="space-y-1" data-workspace-list-container>
      <div
        className="sticky top-0 z-10 grid h-7 items-center gap-2 bg-background px-2 pr-9 text-muted-foreground text-xs"
        data-list-columns="workspace-file-list"
        data-testid="workspace-list-header"
        data-workspace-list-row>
        <span>{t('terminal.workspace.sort.name')}</span>
        <span className="hidden" data-workspace-list-metadata="mtime">
          {t('terminal.workspace.sort.mtime')}
        </span>
        <span className="hidden text-right" data-workspace-list-metadata="size">
          {t('terminal.workspace.sort.size')}
        </span>
      </div>
      {items.map((item) => renderItem(item))}
    </div>
  ) : viewMode === 'tree' ? (
    <div className="space-y-0.5" data-testid="workspace-tree-container" data-workspace-tree-container>
      {visibleTreeItems.map(({ item, depth }) => renderItem(item, undefined, depth))}
    </div>
  ) : (
    <div
      className={cn('grid gap-2', ICON_GRID_CLASS[iconSize])}
      data-icon-size={iconSize}
      data-testid="workspace-icon-grid">
      {items.map((item) => renderItem(item))}
    </div>
  )

  const content = (
    <div
      className="relative h-full min-h-0 overflow-auto p-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      ref={contentRef}
      data-testid="workspace-file-tree-content"
      data-view-mode={viewMode}
      onContextMenuCapture={handleContextMenuCapture}
      onFocusCapture={activateWorkspaceShortcuts}
      onKeyDownCapture={(event: ReactKeyboardEvent<HTMLDivElement>) => handleKeyDown(event)}
      onMouseDown={(event) => {
        activateWorkspaceShortcuts()
        handleMarqueeMouseDown(event)
      }}
      tabIndex={contextMenuActions ? 0 : undefined}>
      {body}
      {marqueeSelection && (
        <div
          className="pointer-events-none absolute z-20 border border-primary bg-primary/10"
          data-testid="workspace-marquee-selection"
          style={getMarqueeRect(marqueeSelection)}
        />
      )}
    </div>
  )

  return contextMenuActions && rootPath ? (
    <WorkspaceContextMenu
      actions={contextMenuActions}
      getSelectedItemsForItem={getSelectedItemsForContextItem}
      item={contextMenuItem ?? undefined}
      onActionComplete={restoreWorkspaceTreeFocus}
      rootPath={rootPath}>
      {content}
    </WorkspaceContextMenu>
  ) : (
    content
  )
}
