export type TerminalShellKind = 'posix' | 'windows'

export function quotePathForShell(path: string, shellKind: TerminalShellKind = 'posix'): string {
  if (shellKind === 'windows') {
    return `"${path.replaceAll('"', '\\"')}"`
  }

  return `'${path.replaceAll("'", "'\\''")}'`
}
