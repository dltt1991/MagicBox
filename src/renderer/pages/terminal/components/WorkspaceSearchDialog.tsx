import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  NormalTooltip
} from '@cherrystudio/ui'
import { cn } from '@cherrystudio/ui/lib/utils'
import { Icon } from '@iconify/react'
import { getFileIconName } from '@renderer/utils/fileIconName'
import { Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { WorkspaceTreeItem } from '../lib/workspaceTree'

const MATERIAL_ICON_PREFIX = 'material-icon-theme:'
const MAX_SEARCH_RESULTS = 100
const NO_MATCH_SCORE = Number.POSITIVE_INFINITY
const SEARCH_LONG_QUERY_DEBOUNCE_MS = 40
const SEARCH_REQUEST_TIMEOUT_MS = 10_000
const SEARCH_SHORT_QUERY_DEBOUNCE_MS = 160

type WorkspaceSearchResult = Pick<WorkspaceTreeItem, 'kind' | 'name' | 'path'>
type WorkspaceSearchScope = 'current' | 'global'

interface WorkspaceSearchDialogProps {
  globalRootPath?: string | null
  includeHidden: boolean
  onOpenChange: (open: boolean) => void
  onOpenResult: (result: WorkspaceSearchResult) => void
  open: boolean
  rootPath: string | null
}

function basenameOfPath(path: string): string {
  const normalizedPath = path.replace(/\\/g, '/').replace(/\/+$/, '')
  const index = normalizedPath.lastIndexOf('/')
  return index < 0 ? normalizedPath : normalizedPath.slice(index + 1)
}

function relativePathOf(path: string, rootPath: string): string {
  const normalizedPath = path.replace(/\\/g, '/')
  const normalizedRoot = rootPath.replace(/\\/g, '/').replace(/\/+$/, '')
  if (normalizedPath === normalizedRoot) return basenameOfPath(normalizedPath)
  if (normalizedPath.startsWith(`${normalizedRoot}/`)) return normalizedPath.slice(normalizedRoot.length + 1)
  return normalizedPath
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+.!]/g, '\\$&')
}

function wildcardToRegex(pattern: string): RegExp {
  const source = pattern
    .split('')
    .map((char) => {
      if (char === '*') return '.*'
      if (char === '?') return '.'
      return escapeRegex(char)
    })
    .join('')

  return new RegExp(source, 'i')
}

function hasWildcard(value: string): boolean {
  return /[*?]/.test(value)
}

function searchPatternFromQuery(query: string): string {
  return query.replace(/[*?]/g, '').trim()
}

function getSearchDebounceDelay(searchPattern: string): number {
  if (searchPattern.length <= 2) return SEARCH_SHORT_QUERY_DEBOUNCE_MS
  return SEARCH_LONG_QUERY_DEBOUNCE_MS
}

function filenameWithoutExtension(name: string): string {
  const index = name.lastIndexOf('.')
  if (index <= 0) return name

  return name.slice(0, index)
}

function getTextMatchScore(value: string, query: string, baseScore: number): number {
  if (value === query) return baseScore
  if (filenameWithoutExtension(value) === query) return baseScore + 1
  if (value.startsWith(query)) return baseScore + 2
  if (value.includes(query)) return baseScore + 3

  return NO_MATCH_SCORE
}

function getFuzzyMatchScore(value: string, query: string, baseScore: number): number {
  let queryIndex = 0
  let score = baseScore
  let lastIndex = -1
  let streak = 0

  for (let valueIndex = 0; valueIndex < value.length && queryIndex < query.length; valueIndex++) {
    if (value[valueIndex] !== query[queryIndex]) continue

    if (valueIndex === lastIndex + 1) {
      streak++
      score -= streak
    } else {
      streak = 0
    }
    score += valueIndex * 0.1
    lastIndex = valueIndex
    queryIndex++
  }

  if (queryIndex < query.length) return NO_MATCH_SCORE

  return score + Math.max(0, value.length - query.length) * 0.01
}

function getSearchRelevanceScore(result: WorkspaceSearchResult, rootPath: string, query: string): number {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) return NO_MATCH_SCORE

  const name = result.name.toLowerCase()
  const relativePath = relativePathOf(result.path, rootPath).toLowerCase()
  const loweredQuery = normalizedQuery.toLowerCase()

  if (!hasWildcard(normalizedQuery)) {
    return Math.min(
      getTextMatchScore(name, loweredQuery, 0),
      getTextMatchScore(relativePath, loweredQuery, 10),
      getFuzzyMatchScore(name, loweredQuery, 20),
      getFuzzyMatchScore(relativePath, loweredQuery, 30)
    )
  }

  const regex = wildcardToRegex(normalizedQuery)
  if (regex.test(result.name)) return 0
  if (regex.test(relativePathOf(result.path, rootPath))) return 10

  return NO_MATCH_SCORE
}

function compareSearchResults(
  left: WorkspaceSearchResult,
  right: WorkspaceSearchResult,
  rootPath: string,
  query: string
): number {
  const leftScore = getSearchRelevanceScore(left, rootPath, query)
  const rightScore = getSearchRelevanceScore(right, rootPath, query)
  if (leftScore !== rightScore) return leftScore - rightScore

  const leftRelativePath = relativePathOf(left.path, rootPath)
  const rightRelativePath = relativePathOf(right.path, rootPath)
  if (leftRelativePath.length !== rightRelativePath.length) return leftRelativePath.length - rightRelativePath.length

  return leftRelativePath.localeCompare(rightRelativePath)
}

function WorkspaceResultIcon({ result }: { result: WorkspaceSearchResult }) {
  const iconName = result.kind === 'directory' ? 'folder-base' : getFileIconName(result.path)

  return <Icon className="size-4 shrink-0" height={16} icon={`${MATERIAL_ICON_PREFIX}${iconName}`} width={16} />
}

export function WorkspaceSearchDialog({
  globalRootPath,
  includeHidden,
  onOpenChange,
  onOpenResult,
  open,
  rootPath
}: WorkspaceSearchDialogProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const activeSearchRequestIdRef = useRef<string | null>(null)
  const searchRequestSequenceRef = useRef(0)
  const [query, setQuery] = useState('')
  const [deferredSearchPattern, setDeferredSearchPattern] = useState('')
  const [items, setItems] = useState<WorkspaceSearchResult[]>([])
  const [itemsSearchPattern, setItemsSearchPattern] = useState('')
  const [itemsRootPath, setItemsRootPath] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [scope, setScope] = useState<WorkspaceSearchScope>('current')
  const searchPattern = searchPatternFromQuery(query)
  const searchRootPath = scope === 'global' ? (globalRootPath ?? rootPath) : rootPath
  const canUseCachedItems =
    Boolean(searchRootPath) &&
    itemsRootPath === searchRootPath &&
    Boolean(itemsSearchPattern) &&
    (itemsSearchPattern === searchPattern ||
      (!hasWildcard(query) && searchPattern.toLowerCase().startsWith(itemsSearchPattern.toLowerCase())))

  const results = useMemo(() => {
    if (!searchRootPath || !searchPattern || !canUseCachedItems) return []
    const normalizedQuery = query.trim()
    const filteredItems = hasWildcard(normalizedQuery)
      ? items.filter((item) => getSearchRelevanceScore(item, searchRootPath, normalizedQuery) < NO_MATCH_SCORE)
      : itemsSearchPattern === searchPattern
        ? items
        : items.filter((item) => getSearchRelevanceScore(item, searchRootPath, normalizedQuery) < NO_MATCH_SCORE)

    return filteredItems
      .sort((left, right) => compareSearchResults(left, right, searchRootPath, query))
      .slice(0, MAX_SEARCH_RESULTS)
  }, [canUseCachedItems, items, itemsSearchPattern, query, searchRootPath, searchPattern])

  const activeResult = results[activeIndex] ?? null
  const cancelDirectorySearch = useCallback((requestId: string | null) => {
    if (!requestId) return
    void window.api.file.cancelDirectorySearch?.(requestId)
  }, [])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open || !searchRootPath || !searchPattern) {
      setDeferredSearchPattern('')
      return
    }

    const timer = window.setTimeout(() => {
      setDeferredSearchPattern(searchPattern)
    }, getSearchDebounceDelay(searchPattern))

    return () => window.clearTimeout(timer)
  }, [open, searchPattern, searchRootPath])

  useEffect(() => {
    if (!open || !searchRootPath || !searchPattern) return
    if (itemsRootPath === searchRootPath && itemsSearchPattern === searchPattern) return

    setIsLoading(true)
    setError(false)
  }, [itemsRootPath, itemsSearchPattern, open, searchPattern, searchRootPath])

  useEffect(() => {
    if (!open || !searchRootPath || !deferredSearchPattern) {
      setItems([])
      setItemsSearchPattern('')
      setItemsRootPath('')
      setError(false)
      setIsLoading(false)
      return
    }

    let isStale = false
    setIsLoading(true)
    setError(false)
    let timeoutId: number | undefined
    if (activeSearchRequestIdRef.current) {
      cancelDirectorySearch(activeSearchRequestIdRef.current)
    }
    const searchRequestId = `workspace-search-${Date.now()}-${++searchRequestSequenceRef.current}`
    activeSearchRequestIdRef.current = searchRequestId
    const searchRequest = window.api.file.listDirectoryEntries(searchRootPath, {
      includeDirectories: true,
      includeFiles: true,
      includeHidden,
      maxDepth: 0,
      maxEntries: MAX_SEARCH_RESULTS,
      searchPattern: deferredSearchPattern,
      searchRequestId,
      recursive: true
    })
    const timeoutRequest = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new Error('Workspace search timed out'))
      }, SEARCH_REQUEST_TIMEOUT_MS)
    })

    void Promise.race([searchRequest, timeoutRequest])
      .then((entries) => {
        if (isStale) return
        setItems(
          entries.map((entry) => ({
            kind: entry.isDirectory ? 'directory' : 'file',
            name: basenameOfPath(entry.path),
            path: entry.path
          }))
        )
        setItemsSearchPattern(deferredSearchPattern)
        setItemsRootPath(searchRootPath)
      })
      .catch(() => {
        if (!isStale) setError(true)
      })
      .finally(() => {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId)
        if (!isStale) setIsLoading(false)
      })

    return () => {
      isStale = true
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      if (activeSearchRequestIdRef.current === searchRequestId) {
        activeSearchRequestIdRef.current = null
      }
      cancelDirectorySearch(searchRequestId)
    }
  }, [cancelDirectorySearch, deferredSearchPattern, includeHidden, open, searchRootPath])

  useEffect(() => {
    setActiveIndex(-1)
  }, [query, searchRootPath])

  const moveActiveResult = useCallback(
    (direction: -1 | 1) => {
      if (results.length === 0) return
      setActiveIndex((currentIndex) => {
        if (currentIndex < 0) return direction > 0 ? 0 : results.length - 1
        return (currentIndex + direction + results.length) % results.length
      })
    },
    [results.length]
  )

  const openActiveResult = useCallback(() => {
    if (!activeResult) return
    onOpenResult(activeResult)
  }, [activeResult, onOpenResult])

  const toggleScope = useCallback(() => {
    setScope((currentScope) => (currentScope === 'current' ? 'global' : 'current'))
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden p-0">
        <DialogHeader className="border-border border-b px-4 py-3">
          <DialogTitle>{t('terminal.workspace.search.title')}</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-col">
          <div className="border-border border-b p-3">
            <div className="flex items-center gap-2 rounded-md border border-input px-2">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <Input
                ref={inputRef}
                aria-label={t('terminal.workspace.search.input')}
                className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Tab') {
                    event.preventDefault()
                    toggleScope()
                  }
                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    moveActiveResult(1)
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    moveActiveResult(-1)
                  }
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    openActiveResult()
                  }
                }}
                placeholder={t('terminal.workspace.search.placeholder')}
                value={query}
              />
            </div>
            <div className="mt-2 flex items-center gap-1">
              <Button
                aria-pressed={scope === 'current'}
                onClick={() => setScope('current')}
                size="sm"
                type="button"
                variant={scope === 'current' ? 'secondary' : 'ghost'}>
                {t('terminal.workspace.search.scope_current')}
              </Button>
              <Button
                aria-pressed={scope === 'global'}
                onClick={() => setScope('global')}
                size="sm"
                type="button"
                variant={scope === 'global' ? 'secondary' : 'ghost'}>
                {t('terminal.workspace.search.scope_global')}
              </Button>
            </div>
          </div>
          <div className="max-h-[min(30rem,calc(85vh-8rem))] min-h-0 overflow-y-auto p-2">
            {!searchRootPath ? (
              <EmptyState title={t('terminal.workspace.no_root')} />
            ) : error ? (
              <EmptyState title={t('terminal.workspace.search.error')} />
            ) : !query.trim() ? (
              <EmptyState title={t('terminal.workspace.search.empty_query')} />
            ) : results.length > 0 ? (
              <div className="flex flex-col gap-0.5">
                {isLoading ? (
                  <div className="px-2 py-1 text-muted-foreground text-xs">
                    {t('terminal.workspace.search.loading')}
                  </div>
                ) : null}
                {results.map((result, index) => {
                  const relativePath = searchRootPath ? relativePathOf(result.path, searchRootPath) : result.path
                  const isActive = index === activeIndex

                  return (
                    <NormalTooltip content={result.path} key={result.path}>
                      <button
                        aria-selected={isActive}
                        className={cn(
                          'flex h-12 min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm',
                          isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/70'
                        )}
                        onClick={() => onOpenResult(result)}
                        onMouseEnter={() => setActiveIndex(index)}
                        type="button">
                        <WorkspaceResultIcon result={result} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{result.name}</span>
                          <span className="block truncate text-muted-foreground text-xs">{relativePath}</span>
                        </span>
                      </button>
                    </NormalTooltip>
                  )
                })}
              </div>
            ) : isLoading ? (
              <EmptyState title={t('terminal.workspace.search.loading')} />
            ) : (
              <EmptyState title={t('terminal.workspace.search.no_results')} />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
