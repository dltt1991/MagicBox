const PATH_TOKEN_PATTERN = /(?:[A-Za-z]:\\|\/|(?:\.{1,2}\/|[\w@%+=,.-]+\/))[^\s'"`<>|&;()]*/g
const TRAILING_PUNCTUATION_PATTERN = /[,:;!?)}\]]+$/
const LINE_SUFFIX_PATTERN = /:\d+(?::\d+)?$/

export interface TerminalPathLinkCandidate {
  path: string
  startIndex: number
  endIndex: number
  text: string
}

function normalizePosixPath(path: string): string {
  const parts = path.split('/')
  const normalized: string[] = []

  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') {
      normalized.pop()
      continue
    }
    normalized.push(part)
  }

  return `/${normalized.join('/')}`
}

function cleanPathToken(token: string): string {
  return token.replace(TRAILING_PUNCTUATION_PATTERN, '').replace(LINE_SUFFIX_PATTERN, '')
}

function isUrlSlashMatch(text: string, index: number, token: string): boolean {
  return token.startsWith('/') && index > 0 && text[index - 1] === ':'
}

export function extractTerminalPathLinks(text: string, cwd: string): TerminalPathLinkCandidate[] {
  const candidates = new Map<string, TerminalPathLinkCandidate>()

  for (const match of text.matchAll(PATH_TOKEN_PATTERN)) {
    const token = match[0]
    const index = match.index ?? 0
    if (isUrlSlashMatch(text, index, token)) continue

    const path = cleanPathToken(token)
    if (!path) continue

    if (/^[A-Za-z]:\\/.test(path)) {
      candidates.set(path, { path, startIndex: index, endIndex: index + path.length, text: path })
      continue
    }

    if (path.startsWith('/')) {
      const normalized = normalizePosixPath(path)
      candidates.set(normalized, { path: normalized, startIndex: index, endIndex: index + path.length, text: path })
      continue
    }

    const normalized = normalizePosixPath(`${cwd}/${path}`)
    candidates.set(normalized, { path: normalized, startIndex: index, endIndex: index + path.length, text: path })
  }

  return [...candidates.values()]
}

export function extractTerminalPathCandidates(text: string, cwd: string): string[] {
  return extractTerminalPathLinks(text, cwd).map((candidate) => candidate.path)
}
