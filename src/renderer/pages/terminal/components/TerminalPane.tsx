import '@xterm/xterm/css/xterm.css'

import { FitAddon } from '@xterm/addon-fit'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebglAddon } from '@xterm/addon-webgl'
import { type ILink, Terminal } from '@xterm/xterm'
import { useCallback, useEffect, useEffectEvent, useRef, useState, type WheelEvent } from 'react'

import type { TerminalBufferChunk } from '../hooks/useTerminalSessions'
import { extractTerminalPathLinks } from '../lib/terminalPathLinks'
import { quotePathForShell, type TerminalShellKind } from '../lib/terminalPathQuoting'

const TERMINAL_PATH_DRAG_MIME_TYPE = 'application/x-cherry-terminal-path'
const TERMINAL_FONT_SIZE = 18
const TERMINAL_FONT_SIZE_STEP = 1
const TERMINAL_FONT_SIZE_MIN = 12
const TERMINAL_FONT_SIZE_MAX = 36
const TERMINAL_FONT_WHEEL_DELTA = 180
const TERMINAL_LINE_HEIGHT = 1.25
const TERMINAL_FONT_FAMILY = 'Menlo, Monaco, "Courier New", monospace'

function clampTerminalFontSize(size: number): number {
  return Math.min(TERMINAL_FONT_SIZE_MAX, Math.max(TERMINAL_FONT_SIZE_MIN, size))
}

interface TerminalPaneProps {
  sessionId: string | null
  buffer: readonly TerminalBufferChunk[]
  onInput: (data: string) => void
  onResize: (size: { cols: number; rows: number }) => void
  cwd?: string | null
  onPathActivated?: (path: string) => void
  shellKind?: TerminalShellKind
  fontSize?: number
  onFontSizeChange?: (fontSize: number) => void
}

export function TerminalPane({
  sessionId,
  buffer,
  onInput,
  onResize,
  cwd,
  onPathActivated,
  shellKind = 'posix',
  fontSize: controlledFontSize,
  onFontSizeChange
}: TerminalPaneProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const [uncontrolledFontSize, setUncontrolledFontSize] = useState(TERMINAL_FONT_SIZE)
  const lastWrittenSequenceRef = useRef(-1)
  const wheelDeltaRef = useRef(0)
  const onInputEvent = useEffectEvent(onInput)
  const onResizeEvent = useEffectEvent(onResize)
  const onPathActivatedEvent = useEffectEvent((path: string) => onPathActivated?.(path))
  const terminalFontSize = controlledFontSize ?? uncontrolledFontSize
  const terminalLineHeight = TERMINAL_LINE_HEIGHT
  const terminalFontFamily = TERMINAL_FONT_FAMILY
  const updateTerminalFontSize = useCallback(
    (nextFontSize: number) => {
      const clamped = clampTerminalFontSize(nextFontSize)
      if (clamped === terminalFontSize) return
      if (controlledFontSize === undefined) setUncontrolledFontSize(clamped)
      onFontSizeChange?.(clamped)
    },
    [controlledFontSize, onFontSizeChange, terminalFontSize]
  )
  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (!event.ctrlKey) return
      event.preventDefault()

      wheelDeltaRef.current += event.deltaY
      const steps = Math.trunc(Math.abs(wheelDeltaRef.current) / TERMINAL_FONT_WHEEL_DELTA)
      if (steps === 0) return

      const direction = wheelDeltaRef.current < 0 ? 1 : -1
      const consumed = Math.sign(wheelDeltaRef.current) * steps * TERMINAL_FONT_WHEEL_DELTA
      wheelDeltaRef.current -= consumed
      updateTerminalFontSize(terminalFontSize + direction * steps * TERMINAL_FONT_SIZE_STEP)
    },
    [terminalFontSize, updateTerminalFontSize]
  )

  useEffect(() => {
    const mount = mountRef.current
    if (!mount || !sessionId) return

    const terminal = new Terminal({
      allowProposedApi: true,
      cursorBlink: true,
      fontFamily: terminalFontFamily,
      fontSize: terminalFontSize,
      lineHeight: terminalLineHeight,
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

    terminal.open(mount)
    terminalRef.current = terminal
    lastWrittenSequenceRef.current = -1
    let rafId: number | null = null

    const fit = () => {
      fitAddon.fit()
      if (terminal.cols > 0 && terminal.rows > 0) {
        onResizeEvent({ cols: terminal.cols, rows: terminal.rows })
      }
    }
    const scheduleFit = () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        rafId = null
        fit()
        terminal.focus()
      })
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
    const resizeObserver = new ResizeObserver(scheduleFit)
    resizeObserver.observe(mount)
    scheduleFit()

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      resizeObserver.disconnect()
      inputDisposable.dispose()
      linkDisposable.dispose()
      terminal.dispose()
      terminalRef.current = null
    }
    // Effect Events always read the latest callbacks without recreating xterm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd, sessionId, terminalFontFamily, terminalFontSize, terminalLineHeight])

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
      className="min-h-0 flex-1 overflow-hidden bg-black"
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
      onWheel={handleWheel}>
      <div
        className="[&_.xterm-viewport]:!h-full h-full min-h-0 w-full overflow-hidden bg-black text-base [&_.xterm-screen]:h-full [&_.xterm-viewport]:bg-black [&_.xterm]:h-full [&_.xterm]:bg-black"
        data-testid="terminal-xterm-mount"
        ref={mountRef}
        style={{ fontSize: terminalFontSize }}
      />
    </div>
  )
}
