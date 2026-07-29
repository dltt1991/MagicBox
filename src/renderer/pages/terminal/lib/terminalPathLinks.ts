const PATH_TOKEN_PATTERN = /(?:[A-Za-z]:\\|\/|(?:\.{1,2}\/|[\w@%+=,.-]+\/))[^\s'"`<>|&;()]*/g
const TRAILING_PUNCTUATION_PATTERN = /[,:;!?)}\]]+$/
const LINE_SUFFIX_PATTERN = /:\d+(?::\d+)?$/

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

export function extractTerminalPathCandidates(text: string, cwd: string): string[] {
  const candidates = new Set<string>()

  for (const match of text.matchAll(PATH_TOKEN_PATTERN)) {
    const path = cleanPathToken(match[0])
    if (!path) continue

    if (/^[A-Za-z]:\\/.test(path)) {
      candidates.add(path)
      continue
    }

    if (path.startsWith('/')) {
      candidates.add(normalizePosixPath(path))
      continue
    }

    candidates.add(normalizePosixPath(`${cwd}/${path}`))
  }

  return [...candidates]
}
