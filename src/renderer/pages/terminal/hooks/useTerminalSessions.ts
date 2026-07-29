import { ipcApi, useIpcOn } from '@renderer/ipc'
import type { TerminalSessionMetadata } from '@shared/ipc/schemas/terminal'
import { useCallback, useRef, useState } from 'react'

const DEFAULT_TERMINAL_SIZE = { cols: 80, rows: 24 }
const MAX_BUFFER_CHUNKS = 200

export interface TerminalSession extends TerminalSessionMetadata {
  buffer: string[]
}

interface UseTerminalSessionsOptions {
  cwd?: string
}

export function useTerminalSessions({ cwd }: UseTerminalSessionsOptions) {
  const [sessions, setSessions] = useState<TerminalSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const sessionsRef = useRef<TerminalSession[]>([])

  const createSession = useCallback(async () => {
    const session = await ipcApi.request('terminal.session.create', { cwd, ...DEFAULT_TERMINAL_SIZE })
    const nextSession = { ...session, buffer: [] }
    const nextSessions = [...sessionsRef.current.filter(({ id }) => id !== session.id), nextSession]
    sessionsRef.current = nextSessions
    setSessions(nextSessions)
    setActiveSessionId(session.id)
  }, [cwd])

  const removeSession = useCallback((id: string) => {
    const nextSessions = sessionsRef.current.filter((session) => session.id !== id)
    sessionsRef.current = nextSessions
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

  const resizeSession = useCallback(
    (id: string, size: { cols: number; rows: number }) => ipcApi.request('terminal.session.resize', { id, ...size }),
    []
  )

  useIpcOn('terminal.session.data', ({ id, data }) => {
    const nextSessions = sessionsRef.current.map((session) =>
      session.id === id ? { ...session, buffer: [...session.buffer, data].slice(-MAX_BUFFER_CHUNKS) } : session
    )
    sessionsRef.current = nextSessions
    setSessions(nextSessions)
  })

  useIpcOn('terminal.session.exit', ({ id }) => {
    removeSession(id)
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
