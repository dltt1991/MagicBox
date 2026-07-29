import { describe, expect, it } from 'vitest'

import { quotePathForShell } from '../terminalPathQuoting'

describe('quotePathForShell', () => {
  it('single-quotes paths containing spaces', () => {
    expect(quotePathForShell('/Users/me/My App')).toBe("'/Users/me/My App'")
  })

  it('escapes embedded single quotes for POSIX shells', () => {
    expect(quotePathForShell("/Users/me/O'Reilly")).toBe("'/Users/me/O'\\''Reilly'")
  })
})
