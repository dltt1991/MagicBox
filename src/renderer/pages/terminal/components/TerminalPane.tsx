import '@xterm/xterm/css/xterm.css'

import { FitAddon } from '@xterm/addon-fit'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebglAddon } from '@xterm/addon-webgl'
import { type ILink, Terminal } from '@xterm/xterm'
import { useEffect, useEffectEvent, useRef } from 'react'

import type { TerminalBufferChunk } from '../hooks/useTerminalSessions'
import { extractTerminalPathLinks } from '../lib/terminalPathLinks'
import { quotePathForShell, type TerminalShellKind } from '../lib/terminalPathQuoting'

const TERMINAL_PATH_DRAG_MIME_TYPE = 'application/x-cherry-terminal-path'

interface TerminalPaneProps {
  sessionId: string | null
  buffer: readonly TerminalBufferChunk[]
  onInput: (data: string) => void
  onResize: (size: { cols: number; rows: number }) => void
  cwd?: string | null
  onPathActivated?: (path: string) => void
  shellKind?: TerminalShellKind
}

export function TerminalPane({
  sessionId,
  buffer,
  onInput,
  onResize,
  cwd,
  onPathActivated,
  shellKind = 'posix'
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const lastWrittenSequenceRef = useRef(-1)
  const onInputEvent = useEffectEvent(onInput)
  const onResizeEvent = useEffectEvent(onResize)
  const onPathActivatedEvent = useEffectEvent((path: string) => onPathActivated?.(path))

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
    lastWrittenSequenceRef.current = -1

    const fit = () => {
      fitAddon.fit()
      onResizeEvent({ cols: terminal.cols, rows: terminal.rows })
    }
    const inputDisposable = terminal.onData((data) => onInputEvent(data))
    const linkDisposable = terminal.registerLinkProvider({
      provideLinks: (bufferLineNumber, callback) => {
        const line = terminal.buffer.active.getLine(bufferLineNumber - 1)
        if (!line) {
          callback(undefined)
          return
        }

        const links = extractTerminalPathLinks(line.translateToString(true), cwd ?? '/').map<ILink>((candidate) => ({
          range: {
            start: { x: candidate.startIndex + 1, y: bufferLineNumber },
            end: { x: candidate.endIndex + 1, y: bufferLineNumber }
          },
          text: candidate.text,
          activate: () => onPathActivatedEvent(candidate.path)
        }))
        callback(links.length > 0 ? links : undefined)
      }
    })
    const resizeObserver = new ResizeObserver(fit)
    resizeObserver.observe(container)
    fit()
    terminal.focus()

    return () => {
      resizeObserver.disconnect()
      inputDisposable.dispose()
      linkDisposable.dispose()
      terminal.dispose()
      terminalRef.current = null
    }
    // Effect Events always read the latest callbacks without recreating xterm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd, sessionId])

  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return

    const pendingBuffer = buffer.filter((chunk) => chunk.sequence > lastWrittenSequenceRef.current)
    if (pendingBuffer.length === 0) return

    terminal.write(pendingBuffer.map((chunk) => chunk.data).join(''))
    lastWrittenSequenceRef.current = pendingBuffer.at(-1)?.sequence ?? lastWrittenSequenceRef.current
  }, [buffer])

  return (
    <div
      className="min-h-0 flex-1 overflow-hidden p-2"
      data-terminal-session-id={sessionId}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        const payload = event.dataTransfer.getData(TERMINAL_PATH_DRAG_MIME_TYPE)
        try {
          const { path } = JSON.parse(payload) as { path?: unknown }
          if (typeof path === 'string') onInputEvent(quotePathForShell(path, shellKind))
        } catch {
          // Ignore drops that do not use the terminal path payload.
        }
      }}
      ref={containerRef}
    />
  )
}
