import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ILinkProvider } from '@xterm/xterm'
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const terminal = {
    buffer: {
      active: {
        getLine: vi.fn()
      }
    },
    cols: 80,
    rows: 24,
    dispose: vi.fn(),
    focus: vi.fn(),
    loadAddon: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    open: vi.fn(),
    registerLinkProvider: vi.fn(() => ({ dispose: vi.fn() })),
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
  mocks.terminal.cols = 80
  mocks.terminal.rows = 24
  mocks.terminal.buffer.active.getLine.mockReset()
  mocks.terminal.registerLinkProvider.mockClear()
  mocks.terminal.write.mockReset()
})

describe('TerminalPane', () => {
  it('allows xterm proposed APIs required by loaded terminal addons', () => {
    render(<TerminalPane buffer={[]} onInput={vi.fn()} onResize={vi.fn()} sessionId="session-1" />)

    expect(mocks.Terminal).toHaveBeenCalledWith(expect.objectContaining({ allowProposedApi: true }))
  })

  it('uses a readable terminal font size by default', () => {
    render(<TerminalPane buffer={[]} onInput={vi.fn()} onResize={vi.fn()} sessionId="session-1" />)

    expect(mocks.Terminal).toHaveBeenCalledWith(expect.objectContaining({ fontSize: 16 }))
  })

  it('fills the terminal pane with xterm background color', () => {
    const { container } = render(
      <TerminalPane buffer={[]} onInput={vi.fn()} onResize={vi.fn()} sessionId="session-1" />
    )

    expect(container.firstElementChild).toHaveClass('bg-black')
    expect(screen.getByTestId('terminal-xterm-mount')).toHaveClass('bg-black')
  })

  it('opens xterm inside a stable inner mount element', () => {
    const { container } = render(
      <TerminalPane buffer={[]} onInput={vi.fn()} onResize={vi.fn()} sessionId="session-1" />
    )
    const mount = container.querySelector('[data-testid="terminal-xterm-mount"]')

    expect(mount).not.toBeNull()
    expect(mocks.terminal.open).toHaveBeenCalledWith(mount)
  })

  it('does not report zero-sized terminal measurements to the session', async () => {
    const onResize = vi.fn()
    mocks.terminal.cols = 0
    mocks.terminal.rows = 0

    render(<TerminalPane buffer={[]} onInput={vi.fn()} onResize={onResize} sessionId="session-1" />)

    await waitFor(() => expect(mocks.fit).toHaveBeenCalled())
    expect(onResize).not.toHaveBeenCalled()
  })

  it('writes new output after the session buffer reaches its cap', () => {
    const initialBuffer = Array.from({ length: 200 }, (_, index) => ({ sequence: index, data: String(index) }))
    const { rerender } = render(
      <TerminalPane buffer={initialBuffer} onInput={vi.fn()} onResize={vi.fn()} sessionId="session-1" />
    )

    rerender(
      <TerminalPane
        buffer={[...initialBuffer.slice(1), { sequence: 200, data: '200' }]}
        onInput={vi.fn()}
        onResize={vi.fn()}
        sessionId="session-1"
      />
    )

    expect(mocks.terminal.write).toHaveBeenLastCalledWith('200')
  })

  it('writes every new output chunk after the session buffer cap advances by more than one chunk', () => {
    const initialBuffer = Array.from({ length: 200 }, (_, index) => ({ sequence: index, data: 'x' }))
    const { rerender } = render(
      <TerminalPane buffer={initialBuffer} onInput={vi.fn()} onResize={vi.fn()} sessionId="session-1" />
    )

    rerender(
      <TerminalPane
        buffer={[...initialBuffer.slice(2), { sequence: 200, data: 'x' }, { sequence: 201, data: 'x' }]}
        onInput={vi.fn()}
        onResize={vi.fn()}
        sessionId="session-1"
      />
    )

    expect(mocks.terminal.write).toHaveBeenLastCalledWith('xx')
  })

  it('inserts a quoted workspace path dropped from the file tree', () => {
    const onInput = vi.fn()
    const { container } = render(
      <TerminalPane buffer={[]} onInput={onInput} onResize={vi.fn()} sessionId="session-1" />
    )

    fireEvent.drop(container.firstElementChild!, {
      dataTransfer: { getData: () => '{"path":"/workspace/My App"}' }
    })

    expect(onInput).toHaveBeenCalledWith("'/workspace/My App'")
  })

  it('inserts a Windows-quoted path when the active shell is Windows', () => {
    const onInput = vi.fn()
    const { container } = render(
      <TerminalPane buffer={[]} onInput={onInput} onResize={vi.fn()} sessionId="session-1" shellKind="windows" />
    )

    fireEvent.drop(container.firstElementChild!, {
      dataTransfer: { getData: () => '{"path":"C:\\\\Program Files\\\\a.txt"}' }
    })

    expect(onInput).toHaveBeenCalledWith('"C:\\Program Files\\a.txt"')
  })

  it('registers terminal path links and activates parsed paths', () => {
    const onPathActivated = vi.fn()
    mocks.terminal.buffer.active.getLine.mockReturnValue({
      translateToString: () => 'see src/index.ts:12'
    })

    render(
      <TerminalPane
        buffer={[]}
        cwd="/repo"
        onInput={vi.fn()}
        onPathActivated={onPathActivated}
        onResize={vi.fn()}
        sessionId="session-1"
      />
    )

    const registerLinkProvider = mocks.terminal.registerLinkProvider as Mock<(provider: ILinkProvider) => unknown>
    const [provider] = registerLinkProvider.mock.calls[0] ?? []
    const callback = vi.fn()
    provider.provideLinks(1, callback)
    const link = callback.mock.calls[0]?.[0]?.[0]
    link.activate(new MouseEvent('click'), link.text)

    expect(onPathActivated).toHaveBeenCalledWith('/repo/src/index.ts')
  })
})
