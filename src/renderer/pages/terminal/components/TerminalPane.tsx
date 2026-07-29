import '@xterm/xterm/css/xterm.css'

import { FitAddon } from '@xterm/addon-fit'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebglAddon } from '@xterm/addon-webgl'
import { Terminal } from '@xterm/xterm'
import { useEffect, useEffectEvent, useRef } from 'react'

interface TerminalPaneProps {
  sessionId: string | null
  buffer: readonly string[]
  onInput: (data: string) => void
  onResize: (size: { cols: number; rows: number }) => void
}

export function TerminalPane({ sessionId, buffer, onInput, onResize }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const lastBufferRef = useRef<readonly string[]>([])
  const onInputEvent = useEffectEvent(onInput)
  const onResizeEvent = useEffectEvent(onResize)

  useEffect(() => {
    const container = containerRef.current
    if (!container || !sessionId) return

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: 'var(--font-family-mono)',
      fontSize: 13,
      scrollback: 5000
    })
    const fitAddon = new FitAddon()
    const unicode11Addon = new Unicode11Addon()
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(unicode11Addon)
    terminal.unicode.activeVersion = '11'

    try {
      terminal.loadAddon(new WebglAddon())
    } catch {
      // Keep xterm's DOM renderer when WebGL is unavailable for this window.
    }

    terminal.open(container)
    terminalRef.current = terminal
    lastBufferRef.current = []

    const fit = () => {
      fitAddon.fit()
      onResizeEvent({ cols: terminal.cols, rows: terminal.rows })
    }
    const inputDisposable = terminal.onData((data) => onInputEvent(data))
    const resizeObserver = new ResizeObserver(fit)
    resizeObserver.observe(container)
    fit()
    terminal.focus()

    return () => {
      resizeObserver.disconnect()
      inputDisposable.dispose()
      terminal.dispose()
      terminalRef.current = null
    }
    // Effect Events always read the latest callbacks without recreating xterm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return

    const pendingBuffer = getPendingBufferChunks(lastBufferRef.current, buffer)
    if (pendingBuffer.length === 0) return

    terminal.write(pendingBuffer.join(''))
    lastBufferRef.current = buffer
  }, [buffer])

  return <div className="min-h-0 flex-1 overflow-hidden p-2" data-terminal-session-id={sessionId} ref={containerRef} />
}

function getPendingBufferChunks(previous: readonly string[], next: readonly string[]): readonly string[] {
  if (next.length > previous.length) return next.slice(previous.length)

  const maxOverlap = Math.min(previous.length, next.length)
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (previous.slice(-overlap).every((chunk, index) => chunk === next[index])) {
      return next.slice(overlap)
    }
  }

  return next
}
