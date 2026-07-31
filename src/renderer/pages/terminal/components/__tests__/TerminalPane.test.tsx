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
    options: {},
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

import { getTerminalTheme } from '../../lib/terminalThemes'
import { TerminalPane } from '../TerminalPane'

afterEach(() => {
  mocks.fit.mockReset()
  mocks.Terminal.mockClear()
  mocks.terminal.cols = 80
  mocks.terminal.rows = 24
  mocks.terminal.options = {}
  mocks.terminal.buffer.active.getLine.mockReset()
  mocks.terminal.onData.mockClear()
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

    expect(mocks.Terminal).toHaveBeenCalledWith(expect.objectContaining({ fontSize: 18, lineHeight: 1.25 }))
  })

  it('uses a concrete canvas-safe terminal font family', () => {
    render(<TerminalPane buffer={[]} onInput={vi.fn()} onResize={vi.fn()} sessionId="session-1" />)

    expect(mocks.Terminal).toHaveBeenCalledWith(
      expect.objectContaining({ fontFamily: 'Menlo, Monaco, "Courier New", monospace' })
    )
  })

  it('applies the readable font size to the xterm mount DOM', () => {
    render(<TerminalPane buffer={[]} onInput={vi.fn()} onResize={vi.fn()} sessionId="session-1" />)

    expect(screen.getByTestId('terminal-xterm-mount')).toHaveStyle({ fontSize: '18px' })
  })

  it('zooms the terminal font smoothly with accumulated Control plus wheel deltas', async () => {
    render(<TerminalPane buffer={[]} onInput={vi.fn()} onResize={vi.fn()} sessionId="session-1" />)

    fireEvent.wheel(screen.getByTestId('terminal-xterm-mount').parentElement!, { ctrlKey: true, deltaY: -100 })
    expect(screen.getByTestId('terminal-xterm-mount')).toHaveStyle({ fontSize: '18px' })

    await waitFor(() => {
      fireEvent.wheel(screen.getByTestId('terminal-xterm-mount').parentElement!, { ctrlKey: true, deltaY: -100 })
      expect(screen.getByTestId('terminal-xterm-mount')).toHaveStyle({ fontSize: '19px' })
    })
    expect(mocks.terminal.options).toMatchObject({ fontSize: 19 })
  })

  it('reports controlled Control plus wheel font changes to the parent', async () => {
    const onFontSizeChange = vi.fn()
    render(
      <TerminalPane
        buffer={[]}
        fontSize={28}
        onFontSizeChange={onFontSizeChange}
        onInput={vi.fn()}
        onResize={vi.fn()}
        sessionId="session-1"
      />
    )

    fireEvent.wheel(screen.getByTestId('terminal-xterm-mount').parentElement!, { ctrlKey: true, deltaY: 100 })
    fireEvent.wheel(screen.getByTestId('terminal-xterm-mount').parentElement!, { ctrlKey: true, deltaY: 100 })

    expect(onFontSizeChange).toHaveBeenCalledWith(27)
  })

  it('updates the existing terminal instance when Control plus wheel changes the font size', async () => {
    render(<TerminalPane buffer={[]} onInput={vi.fn()} onResize={vi.fn()} sessionId="session-1" />)

    fireEvent.wheel(screen.getByTestId('terminal-xterm-mount'), { ctrlKey: true, deltaY: -100 })
    fireEvent.wheel(screen.getByTestId('terminal-xterm-mount'), { ctrlKey: true, deltaY: -100 })

    await waitFor(() => expect(screen.getByTestId('terminal-xterm-mount')).toHaveStyle({ fontSize: '19px' }))
    expect(mocks.Terminal).toHaveBeenCalledTimes(1)
    expect(mocks.terminal.options).toMatchObject({ fontSize: 19 })
  })

  it('keeps ordinary wheel events for terminal scrolling', () => {
    render(<TerminalPane buffer={[]} onInput={vi.fn()} onResize={vi.fn()} sessionId="session-1" />)

    fireEvent.wheel(screen.getByTestId('terminal-xterm-mount').parentElement!, { ctrlKey: false, deltaY: -100 })

    expect(screen.getByTestId('terminal-xterm-mount')).toHaveStyle({ fontSize: '18px' })
    expect(mocks.Terminal).toHaveBeenCalledTimes(1)
  })

  it('does not forward xterm device-attribute responses as shell input', () => {
    const onInput = vi.fn()
    render(<TerminalPane buffer={[]} onInput={onInput} onResize={vi.fn()} sessionId="session-1" />)

    const onData = mocks.terminal.onData as Mock<(handler: (data: string) => void) => { dispose: () => void }>
    const onDataHandler = onData.mock.calls[0]?.[0]
    onDataHandler?.('\u001b[?1;2c')
    onDataHandler?.('\u001b[?1;2c')

    expect(onInput).not.toHaveBeenCalled()

    onDataHandler?.('ls\n')

    expect(onInput).toHaveBeenCalledWith('ls\n')
  })

  it('fills the terminal pane with the selected theme background color', () => {
    const { container } = render(
      <TerminalPane
        buffer={[]}
        onInput={vi.fn()}
        onResize={vi.fn()}
        sessionId="session-1"
        theme={getTerminalTheme('light').theme}
      />
    )

    expect(container.firstElementChild).toHaveStyle({ backgroundColor: '#f8fafc' })
    expect(screen.getByTestId('terminal-xterm-mount')).toHaveStyle({ backgroundColor: '#f8fafc' })
  })

  it('creates xterm with the selected terminal theme', () => {
    render(
      <TerminalPane
        buffer={[]}
        onInput={vi.fn()}
        onResize={vi.fn()}
        sessionId="session-1"
        theme={getTerminalTheme('dracula').theme}
      />
    )

    expect(mocks.Terminal).toHaveBeenCalledWith(expect.objectContaining({ theme: getTerminalTheme('dracula').theme }))
  })

  it('updates the existing terminal instance when the selected theme changes', () => {
    const { rerender } = render(
      <TerminalPane
        buffer={[]}
        onInput={vi.fn()}
        onResize={vi.fn()}
        sessionId="session-1"
        theme={getTerminalTheme('default-dark').theme}
      />
    )

    rerender(
      <TerminalPane
        buffer={[]}
        onInput={vi.fn()}
        onResize={vi.fn()}
        sessionId="session-1"
        theme={getTerminalTheme('monokai').theme}
      />
    )

    expect(mocks.Terminal).toHaveBeenCalledTimes(1)
    expect(mocks.terminal.options).toMatchObject({ theme: getTerminalTheme('monokai').theme })
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

  it('inserts quoted workspace paths dropped from a multi-selection', () => {
    const onInput = vi.fn()
    const { container } = render(
      <TerminalPane buffer={[]} onInput={onInput} onResize={vi.fn()} sessionId="session-1" />
    )

    fireEvent.drop(container.firstElementChild!, {
      dataTransfer: { getData: () => '{"paths":["/workspace/My App","/workspace/src"]}' }
    })

    expect(onInput).toHaveBeenCalledWith("'/workspace/My App' '/workspace/src'")
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
