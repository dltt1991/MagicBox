export function quotePathForShell(path: string): string {
  return `'${path.replaceAll("'", "'\\''")}'`
}
