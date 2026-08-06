import type { ITheme } from '@xterm/xterm'

export const TERMINAL_THEME_KEYS = [
  'default-dark',
  'light',
  'solarized-dark',
  'dracula',
  'monokai',
  'one-dark-pro',
  'gruvbox-dark',
  'nord'
] as const

export type TerminalThemeKey = (typeof TERMINAL_THEME_KEYS)[number]

export type TerminalThemeDefinition = {
  key: TerminalThemeKey
  labelKey: string
  swatch: string
  theme: ITheme
}

export const DEFAULT_TERMINAL_THEME_KEY: TerminalThemeKey = 'default-dark'

export const TERMINAL_THEMES: readonly TerminalThemeDefinition[] = [
  {
    key: 'default-dark',
    labelKey: 'terminal.theme.default_dark',
    swatch: '#000000',
    theme: {
      background: '#000000',
      foreground: '#ffffff',
      cursor: '#ffffff',
      selectionBackground: '#5a5a5a'
    }
  },
  {
    key: 'light',
    labelKey: 'terminal.theme.light',
    swatch: '#f8fafc',
    theme: {
      background: '#f8fafc',
      foreground: '#1f2937',
      cursor: '#111827',
      selectionBackground: '#cbd5e1'
    }
  },
  {
    key: 'solarized-dark',
    labelKey: 'terminal.theme.solarized_dark',
    swatch: '#002b36',
    theme: {
      background: '#002b36',
      foreground: '#839496',
      cursor: '#93a1a1',
      selectionBackground: '#073642'
    }
  },
  {
    key: 'dracula',
    labelKey: 'terminal.theme.dracula',
    swatch: '#282a36',
    theme: {
      background: '#282a36',
      foreground: '#f8f8f2',
      cursor: '#f8f8f2',
      selectionBackground: '#44475a'
    }
  },
  {
    key: 'monokai',
    labelKey: 'terminal.theme.monokai',
    swatch: '#272822',
    theme: {
      background: '#272822',
      foreground: '#f8f8f2',
      cursor: '#f8f8f0',
      selectionBackground: '#49483e'
    }
  },
  {
    key: 'one-dark-pro',
    labelKey: 'terminal.theme.one_dark_pro',
    swatch: '#282c34',
    theme: {
      background: '#282c34',
      foreground: '#abb2bf',
      cursor: '#528bff',
      selectionBackground: '#3e4451'
    }
  },
  {
    key: 'gruvbox-dark',
    labelKey: 'terminal.theme.gruvbox_dark',
    swatch: '#282828',
    theme: {
      background: '#282828',
      foreground: '#ebdbb2',
      cursor: '#fabd2f',
      selectionBackground: '#504945'
    }
  },
  {
    key: 'nord',
    labelKey: 'terminal.theme.nord',
    swatch: '#2e3440',
    theme: {
      background: '#2e3440',
      foreground: '#d8dee9',
      cursor: '#88c0d0',
      selectionBackground: '#434c5e'
    }
  }
]

export function getTerminalTheme(key: TerminalThemeKey | null | undefined): TerminalThemeDefinition {
  return TERMINAL_THEMES.find((theme) => theme.key === key) ?? TERMINAL_THEMES[0]
}
