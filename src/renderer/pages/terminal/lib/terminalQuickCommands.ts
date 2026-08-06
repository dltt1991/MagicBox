export type TerminalQuickCommand = {
  id: string
  command: string
  iconDataUrl?: string
  label?: string
}

export const TERMINAL_QUICK_COMMAND_ICON_MAX_BYTES = 1024 * 1024

export function createTerminalQuickCommandId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `terminal-quick-command-${Date.now()}`
}
