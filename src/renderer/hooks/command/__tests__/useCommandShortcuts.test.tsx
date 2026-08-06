import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@data/hooks/usePreference', () => ({
  useMultiplePreferences: () => [{}, vi.fn()]
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

import { useCommandShortcuts } from '../useCommandShortcuts'

describe('useCommandShortcuts', () => {
  it('shows file manager shortcuts in settings without requiring file manager focus', () => {
    const { result } = renderHook(() => useCommandShortcuts())

    expect(result.current.shortcuts.some((shortcut) => shortcut.group === 'fileManager')).toBe(true)
  })

  it('shows terminal tab switching shortcuts in settings', () => {
    const { result } = renderHook(() => useCommandShortcuts())

    expect(result.current.shortcuts.some((shortcut) => shortcut.label === 'settings.shortcuts.terminal_new')).toBe(true)
    expect(
      result.current.shortcuts.some((shortcut) => shortcut.label === 'settings.shortcuts.terminal_close_current')
    ).toBe(true)
    expect(
      result.current.shortcuts.some((shortcut) => shortcut.label === 'settings.shortcuts.terminal_close_others')
    ).toBe(true)
    expect(
      result.current.shortcuts.some((shortcut) => shortcut.label === 'settings.shortcuts.terminal_close_all')
    ).toBe(true)
    expect(
      result.current.shortcuts.some((shortcut) => shortcut.label === 'settings.shortcuts.terminal_switch_next')
    ).toBe(true)
    expect(
      result.current.shortcuts.some((shortcut) => shortcut.label === 'settings.shortcuts.terminal_switch_previous')
    ).toBe(true)
  })
})
