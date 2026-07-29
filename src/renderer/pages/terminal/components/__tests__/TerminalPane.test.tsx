import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const terminal = {
    cols: 80,
    rows: 24,
    dispose: vi.fn(),
    focus: vi.fn(),
    loadAddon: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    open: vi.fn(),
    unicode: { activeVersion: '' },
    write: vi.fn()
  }

  return {
    terminal,
    Terminal: vi.fn(() => terminal),
    fit: vi.fn()
  }
})

vi.mock('@xterm/xterm', () => ({ Terminal: mocks.Terminal }))
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class FitAddon {
    fit = mocks.fit
  }
}))
vi.mock('@xterm/addon-unicode11', () => ({ Unicode11Addon: class Unicode11Addon {} }))
vi.mock('@xterm/addon-webgl', () => ({ WebglAddon: class WebglAddon {} }))

import { TerminalPane } from '../TerminalPane'

afterEach(() => {
  mocks.fit.mockReset()
  mocks.terminal.write.mockReset()
})

describe('TerminalPane', () => {
  it('writes new output after the session buffer reaches its cap', () => {
    const initialBuffer = Array.from({ length: 200 }, (_, index) => String(index))
    const { rerender } = render(
      <TerminalPane buffer={initialBuffer} onInput={vi.fn()} onResize={vi.fn()} sessionId="session-1" />
    )

    rerender(
      <TerminalPane
        buffer={[...initialBuffer.slice(1), '200']}
        onInput={vi.fn()}
        onResize={vi.fn()}
        sessionId="session-1"
      />
    )

    expect(mocks.terminal.write).toHaveBeenLastCalledWith('200')
  })

  it('writes every new output chunk after the session buffer cap advances by more than one chunk', () => {
    const initialBuffer = Array.from({ length: 200 }, (_, index) => String(index))
    const { rerender } = render(
      <TerminalPane buffer={initialBuffer} onInput={vi.fn()} onResize={vi.fn()} sessionId="session-1" />
    )

    rerender(
      <TerminalPane
        buffer={[...initialBuffer.slice(2), '200', '201']}
        onInput={vi.fn()}
        onResize={vi.fn()}
        sessionId="session-1"
      />
    )

    expect(mocks.terminal.write).toHaveBeenLastCalledWith('200201')
  })
})
