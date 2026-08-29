import { usePersistCache } from '@data/hooks/useCache'
import { usePreference } from '@data/hooks/usePreference'
import { toast } from '@renderer/services/toast'
import type { SidebarAppId } from '@renderer/utils/sidebar'
import {
  getOrderedVisibleSidebarFavoriteItems,
  getOrderedVisibleSidebarFavorites,
  getSidebarMiniAppFavoriteIds,
  migrateTerminalFavoriteDefault,
  removeSidebarEntityFavorite,
  removeSidebarMiniApp,
  reorderSidebarFavorites,
  setSidebarAppPinned,
  toggleSidebarEntityFavorite,
  toggleSidebarMiniApp
} from '@renderer/utils/sidebar'
import type { SidebarFavoriteItem } from '@shared/data/preference/preferenceTypes'
import { useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Single entry point for the `ui.sidebar.favorites` preference.
 *
 * `favorites` is the full ordered mixed list (apps and mini apps interleaved) the
 * sidebar renders and drag-reorders as one list; `reorderFavorites` persists a new
 * mixed order. The partitioned `appFavorites` / `miniAppFavoriteIds` remain for
 * surfaces (launchpad, mini app menu) that need to know a single type's membership
 * (e.g. pin state), and `setAppPinned` / `toggleMiniApp` / `removeMiniApp` mutate
 * membership. The launchpad owns its own tile ordering elsewhere (built-in apps via
 * `ui.launchpad.app_order`, mini apps via `orderKey`), so favorites carries the
 * sidebar order only. Every mutation goes through the mix-preserving helpers in
 * `utils/sidebar`, so components never touch the raw `type` tags.
 */
export function useSidebarFavorites() {
  const { t } = useTranslation()
  const [favorites, setFavorites] = usePreference('ui.sidebar.favorites')
  const [terminalFavoriteMigrated, setTerminalFavoriteMigrated] = usePersistCache(
    'ui.sidebar.terminal_favorite_migrated'
  )

  const normalizedFavorites = useMemo(() => (Array.isArray(favorites) ? favorites : []), [favorites])
  const favoriteItems = useMemo(() => getOrderedVisibleSidebarFavoriteItems(normalizedFavorites), [normalizedFavorites])
  const appFavorites = useMemo(() => getOrderedVisibleSidebarFavorites(normalizedFavorites), [normalizedFavorites])
  const miniAppFavoriteIds = useMemo(() => getSidebarMiniAppFavoriteIds(normalizedFavorites), [normalizedFavorites])
  const agentFavoriteIds = useMemo(
    () => favoriteItems.flatMap((favorite) => (favorite.type === 'agent' ? [favorite.id] : [])),
    [favoriteItems]
  )
  const assistantFavoriteIds = useMemo(
    () => favoriteItems.flatMap((favorite) => (favorite.type === 'assistant' ? [favorite.id] : [])),
    [favoriteItems]
  )

  const persist = useCallback(
    (next: SidebarFavoriteItem[]) => {
      void setFavorites(next).catch(() => {
        toast.error(t('common.error'))
      })
    },
    [setFavorites, t]
  )

  useEffect(() => {
    if (terminalFavoriteMigrated) return
    if (normalizedFavorites.length === 0) {
      setTerminalFavoriteMigrated(true)
      return
    }

    const migrated = migrateTerminalFavoriteDefault(normalizedFavorites)
    if (!migrated) {
      setTerminalFavoriteMigrated(true)
      return
    }

    void setFavorites(migrated)
      .then(() => setTerminalFavoriteMigrated(true))
      .catch(() => {
        toast.error(t('common.error'))
      })
  }, [normalizedFavorites, setFavorites, setTerminalFavoriteMigrated, t, terminalFavoriteMigrated])

  const setAppPinned = useCallback(
    (id: SidebarAppId, pinned: boolean) => persist(setSidebarAppPinned(normalizedFavorites, id, pinned)),
    [normalizedFavorites, persist]
  )
  const toggleMiniApp = useCallback(
    (id: string) => persist(toggleSidebarMiniApp(normalizedFavorites, id)),
    [normalizedFavorites, persist]
  )
  const removeMiniApp = useCallback(
    (id: string) => {
      if (!miniAppFavoriteIds.includes(id)) return
      persist(removeSidebarMiniApp(normalizedFavorites, id))
    },
    [normalizedFavorites, miniAppFavoriteIds, persist]
  )
  const toggleAgent = useCallback(
    (id: string) => persist(toggleSidebarEntityFavorite(normalizedFavorites, 'agent', id)),
    [normalizedFavorites, persist]
  )
  const toggleAssistant = useCallback(
    (id: string) => persist(toggleSidebarEntityFavorite(normalizedFavorites, 'assistant', id)),
    [normalizedFavorites, persist]
  )
  const removeAgent = useCallback(
    (id: string) => {
      if (!agentFavoriteIds.includes(id)) return
      persist(removeSidebarEntityFavorite(normalizedFavorites, 'agent', id))
    },
    [normalizedFavorites, agentFavoriteIds, persist]
  )
  const removeAssistant = useCallback(
    (id: string) => {
      if (!assistantFavoriteIds.includes(id)) return
      persist(removeSidebarEntityFavorite(normalizedFavorites, 'assistant', id))
    },
    [normalizedFavorites, assistantFavoriteIds, persist]
  )
  const reorderFavorites = useCallback(
    (orderedItems: readonly SidebarFavoriteItem[]) =>
      persist(reorderSidebarFavorites(normalizedFavorites, orderedItems)),
    [normalizedFavorites, persist]
  )

  return {
    favorites: favoriteItems,
    appFavorites,
    miniAppFavoriteIds,
    agentFavoriteIds,
    assistantFavoriteIds,
    setAppPinned,
    reorderFavorites,
    toggleMiniApp,
    removeMiniApp,
    toggleAgent,
    toggleAssistant,
    removeAgent,
    removeAssistant
  }
}
