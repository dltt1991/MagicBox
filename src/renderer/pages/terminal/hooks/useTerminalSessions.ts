import { ipcApi, useIpcOn } from '@renderer/ipc'
import type { TerminalSessionMetadata } from '@shared/ipc/schemas/terminal'
import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_TERMINAL_SIZE = { cols: 80, rows: 24 }
const MAX_BUFFER_CHUNKS = 200
const pendingCreateSessionRequests = new Map<string, Promise<TerminalSessionMetadata>>()

type TerminalSessionsSnapshot = {
  activeSessionId: string | null
  sessions: TerminalSession[]
  sessionsReady: boolean
}

export interface TerminalBufferChunk {
  sequence: number
  data: string
}

export interface TerminalSession extends TerminalSessionMetadata {
  buffer: TerminalBufferChunk[]
  nextBufferSequence: number
}

let sharedSnapshot: TerminalSessionsSnapshot = {
  activeSessionId: null,
  sessions: [],
  sessionsReady: false
}
let sharedSessionsVersion = 0

const snapshotSubscribers = new Set<(snapshot: TerminalSessionsSnapshot) => void>()

interface UseTerminalSessionsOptions {
  cwd?: string
}

interface CreateTerminalSessionOptions {
  cwd?: string | null
}

type TerminalSessionRequestRoute = 'terminal.session.create' | 'terminal.session.ensure'

function getCreateSessionRequestKey(cwd: string | null | undefined): string {
  return cwd ?? ''
}

function publishSnapshot(nextSnapshot: TerminalSessionsSnapshot): void {
  sharedSnapshot = nextSnapshot
  for (const subscriber of snapshotSubscribers) {
    subscriber(sharedSnapshot)
  }
}

function publishSessions(
  sessions: TerminalSession[],
  activeSessionId: string | null = sharedSnapshot.activeSessionId
): void {
  sharedSessionsVersion += 1
  publishSnapshot({
    sessions,
    activeSessionId,
    sessionsReady: sharedSnapshot.sessionsReady
  })
}

function publishSessionsReady(sessionsReady: boolean): void {
  publishSnapshot({ ...sharedSnapshot, sessionsReady })
}

function toTerminalSession(metadata: TerminalSessionMetadata): TerminalSession {
  const existingSession = sharedSnapshot.sessions.find(({ id }) => id === metadata.id)
  return {
    ...metadata,
    buffer: existingSession?.buffer ?? [],
    nextBufferSequence: existingSession?.nextBufferSequence ?? 0
  }
}

export function __resetTerminalSessionsForTesting(): void {
  pendingCreateSessionRequests.clear()
  sharedSessionsVersion = 0
  publishSnapshot({
    activeSessionId: null,
    sessions: [],
    sessionsReady: false
  })
}

export function useTerminalSessions({ cwd }: UseTerminalSessionsOptions) {
  const [sessions, setSessions] = useState<TerminalSession[]>(sharedSnapshot.sessions)
  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(sharedSnapshot.activeSessionId)
  const [sessionsReady, setSessionsReady] = useState(sharedSnapshot.sessionsReady)
  const sessionsRef = useRef<TerminalSession[]>(sharedSnapshot.sessions)
  const sessionSizesRef = useRef(new Map<string, { cols: number; rows: number }>())

  useEffect(() => {
    const subscriber = (snapshot: TerminalSessionsSnapshot) => {
      sessionsRef.current = snapshot.sessions
      setSessions(snapshot.sessions)
      setActiveSessionIdState(snapshot.activeSessionId)
      setSessionsReady(snapshot.sessionsReady)
    }
    snapshotSubscribers.add(subscriber)
    subscriber(sharedSnapshot)

    return () => {
      snapshotSubscribers.delete(subscriber)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const listStartedAtVersion = sharedSessionsVersion

    void ipcApi
      .request('terminal.session.list')
      .then((existingSessions) => {
        if (cancelled) return
        if (listStartedAtVersion !== sharedSessionsVersion) return

        const nextSessions = existingSessions.map(toTerminalSession)

        for (const { id } of nextSessions) {
          if (!sessionSizesRef.current.has(id)) {
            sessionSizesRef.current.set(id, DEFAULT_TERMINAL_SIZE)
          }
        }
        publishSessions(
          nextSessions,
          sharedSnapshot.activeSessionId && nextSessions.some(({ id }) => id === sharedSnapshot.activeSessionId)
            ? sharedSnapshot.activeSessionId
            : (nextSessions.at(-1)?.id ?? null)
        )
      })
      .finally(() => {
        if (!cancelled) publishSessionsReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const requestSession = useCallback(
    async (route: TerminalSessionRequestRoute, options: CreateTerminalSessionOptions = {}) => {
      const sessionCwd = options.cwd ?? cwd
      const requestKey = `${route}:${getCreateSessionRequestKey(sessionCwd)}`
      let sessionRequest = pendingCreateSessionRequests.get(requestKey)
      if (!sessionRequest) {
        sessionRequest = ipcApi
          .request(route, {
            ...(sessionCwd ? { cwd: sessionCwd } : {}),
            ...DEFAULT_TERMINAL_SIZE
          })
          .finally(() => {
            pendingCreateSessionRequests.delete(requestKey)
          })
        pendingCreateSessionRequests.set(requestKey, sessionRequest)
      }
      const session = await sessionRequest
      const nextSession = { ...session, buffer: [], nextBufferSequence: 0 }
      const nextSessions = [...sessionsRef.current.filter(({ id }) => id !== session.id), nextSession]
      sessionSizesRef.current.set(session.id, DEFAULT_TERMINAL_SIZE)
      publishSessions(nextSessions, session.id)
      return session
    },
    [cwd]
  )

  const createSession = useCallback(
    (options: CreateTerminalSessionOptions = {}) => requestSession('terminal.session.create', options),
    [requestSession]
  )

  const ensureSession = useCallback(
    (options: CreateTerminalSessionOptions = {}) => requestSession('terminal.session.ensure', options),
    [requestSession]
  )

  const removeSession = useCallback((id: string) => {
    const nextSessions = sessionsRef.current.filter((session) => session.id !== id)
    sessionSizesRef.current.delete(id)
    publishSessions(
      nextSessions,
      sharedSnapshot.activeSessionId === id ? (nextSessions.at(-1)?.id ?? null) : sharedSnapshot.activeSessionId
    )
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

  const setActiveSessionId = useCallback((id: string | null) => {
    publishSnapshot({ ...sharedSnapshot, activeSessionId: id })
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
    publishSessions(nextSessions)
  })

  useIpcOn('terminal.session.exit', ({ id }) => {
    removeSession(id)
  })

  useIpcOn('terminal.session.updated', (metadata) => {
    const nextSessions = sessionsRef.current.map((session) =>
      session.id === metadata.id
        ? {
            ...metadata,
            buffer: session.buffer,
            nextBufferSequence: session.nextBufferSequence
          }
        : session
    )
    publishSessions(nextSessions)
  })

  return {
    sessions,
    sessionsReady,
    activeSessionId,
    activeSession: sessions.find((session) => session.id === activeSessionId) ?? null,
    createSession,
    ensureSession,
    closeSession,
    setActiveSessionId,
    sendInput,
    resizeSession
  }
}
