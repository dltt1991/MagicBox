import { describe, expect, it } from 'vitest'

import { extractTerminalPathCandidates } from '../terminalPathLinks'

describe('extractTerminalPathCandidates', () => {
  it('extracts absolute POSIX paths', () => {
    expect(extractTerminalPathCandidates('open /Users/me/a.txt', '/Users/me')).toContain('/Users/me/a.txt')
  })

  it('resolves relative paths against the terminal working directory', () => {
    expect(extractTerminalPathCandidates('see src/index.ts:12', '/repo')).toContain('/repo/src/index.ts')
  })

  it('extracts Windows paths and ignores shell metacharacters', () => {
    expect(extractTerminalPathCandidates('edit C:\\Users\\me\\a.txt && $HOME', '/repo')).toEqual([
      'C:\\Users\\me\\a.txt'
    ])
  })
})
