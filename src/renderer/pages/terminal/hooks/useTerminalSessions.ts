import { ipcApi, useIpcOn } from '@renderer/ipc'
import type { TerminalSessionMetadata } from '@shared/ipc/schemas/terminal'
import { useCallback, useRef, useState } from 'react'

const DEFAULT_TERMINAL_SIZE = { cols: 80, rows: 24 }
const MAX_BUFFER_CHUNKS = 200

export interface TerminalBufferChunk {
  sequence: number
  data: string
}

export interface TerminalSession extends TerminalSessionMetadata {
  buffer: TerminalBufferChunk[]
  nextBufferSequence: number
}

interface UseTerminalSessionsOptions {
  cwd?: string
}

interface CreateTerminalSessionOptions {
  cwd?: string | null
}

export function useTerminalSessions({ cwd }: UseTerminalSessionsOptions) {
  const [sessions, setSessions] = useState<TerminalSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const sessionsRef = useRef<TerminalSession[]>([])
  const sessionSizesRef = useRef(new Map<string, { cols: number; rows: number }>())

  const createSession = useCallback(
    async (options: CreateTerminalSessionOptions = {}) => {
      const sessionCwd = options.cwd ?? cwd
      const session = await ipcApi.request('terminal.session.create', {
        ...(sessionCwd ? { cwd: sessionCwd } : {}),
        ...DEFAULT_TERMINAL_SIZE
      })
      const nextSession = { ...session, buffer: [], nextBufferSequence: 0 }
      const nextSessions = [...sessionsRef.current.filter(({ id }) => id !== session.id), nextSession]
      sessionsRef.current = nextSessions
      sessionSizesRef.current.set(session.id, DEFAULT_TERMINAL_SIZE)
      setSessions(nextSessions)
      setActiveSessionId(session.id)
    },
    [cwd]
  )

  const removeSession = useCallback((id: string) => {
    const nextSessions = sessionsRef.current.filter((session) => session.id !== id)
    sessionsRef.current = nextSessions
    sessionSizesRef.current.delete(id)
    setSessions(nextSessions)
    setActiveSessionId((activeId) => (activeId === id ? (nextSessions.at(-1)?.id ?? null) : activeId))
  }, [])

  const closeSession = useCallback(
    async (id: string) => {
      await ipcApi.request('terminal.session.kill', { id })
      removeSession(id)
    },
    [removeSession]
  )

  const sendInput = useCallback(
    (id: string, data: string) => ipcApi.request('terminal.session.input', { id, data }),
    []
  )

  const resizeSession = useCallback((id: string, size: { cols: number; rows: number }) => {
    const previousSize = sessionSizesRef.current.get(id)
    if (previousSize?.cols === size.cols && previousSize.rows === size.rows) return

    sessionSizesRef.current.set(id, size)
    return ipcApi.request('terminal.session.resize', { id, ...size })
  }, [])

  useIpcOn('terminal.session.data', ({ id, data }) => {
    const nextSessions = sessionsRef.current.map((session) =>
      session.id === id
        ? {
            ...session,
            buffer: [...session.buffer, { sequence: session.nextBufferSequence, data }].slice(-MAX_BUFFER_CHUNKS),
            nextBufferSequence: session.nextBufferSequence + 1
          }
        : session
    )
    sessionsRef.current = nextSessions
    setSessions(nextSessions)
  })

  useIpcOn('terminal.session.exit', ({ id }) => {
    removeSession(id)
  })

  useIpcOn('terminal.session.updated', (metadata) => {
    const nextSessions = sessionsRef.current.map((session) =>
      session.id === metadata.id ? { ...session, ...metadata } : session
    )
    sessionsRef.current = nextSessions
    setSessions(nextSessions)
  })

  return {
    sessions,
    activeSessionId,
    activeSession: sessions.find((session) => session.id === activeSessionId) ?? null,
    createSession,
    closeSession,
    setActiveSessionId,
    sendInput,
    resizeSession
  }
}
