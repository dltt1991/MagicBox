import type { TerminalSessionMetadata } from '@shared/ipc/schemas/terminal'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  listeners: new Map<string, (payload: unknown) => void>()
}))

vi.mock('@renderer/ipc', () => ({
  ipcApi: { request: mocks.request },
  useIpcOn: (event: string, listener: (payload: unknown) => void) => {
    mocks.listeners.set(event, listener)
  }
}))

import { __resetTerminalSessionsForTesting, useTerminalSessions } from '../useTerminalSessions'

const session: TerminalSessionMetadata = {
  id: 'session-1',
  cwd: '/workspace',
  shell: '/bin/zsh',
  pid: 123,
  status: 'running',
  createdAt: 1,
  updatedAt: 1
}

describe('useTerminalSessions', () => {
  beforeEach(() => {
    __resetTerminalSessionsForTesting()
    mocks.request.mockReset()
    mocks.request.mockImplementation((route: string) => {
      if (route === 'terminal.session.list') return Promise.resolve([])
      return Promise.resolve(session)
    })
    mocks.listeners.clear()
  })

  it('restores existing sessions before creating a new one', async () => {
    mocks.request.mockImplementation((route: string) => {
      if (route === 'terminal.session.list') return Promise.resolve([session])
      return Promise.resolve(session)
    })

    const { result } = renderHook(() => useTerminalSessions({ cwd: '/workspace' }))

    await act(async () => {})

    expect(mocks.request).toHaveBeenCalledWith('terminal.session.list')
    expect(mocks.request).not.toHaveBeenCalledWith(
      'terminal.session.create',
      expect.objectContaining({ cwd: '/workspace' })
    )
    expect(result.current.sessions).toEqual([{ ...session, buffer: [], nextBufferSequence: 0 }])
    expect(result.current.activeSessionId).toBe(session.id)
  })

  it('creates a session with the workspace cwd and stores its metadata', async () => {
    const { result } = renderHook(() => useTerminalSessions({ cwd: '/workspace' }))

    let createdSession: TerminalSessionMetadata | undefined
    await act(async () => {
      createdSession = await result.current.createSession()
    })

    expect(mocks.request).toHaveBeenCalledWith('terminal.session.create', {
      cwd: '/workspace',
      cols: 80,
      rows: 24
    })
    expect(createdSession).toEqual(session)
    expect(result.current.sessions).toEqual([{ ...session, buffer: [], nextBufferSequence: 0 }])
    expect(result.current.activeSessionId).toBe(session.id)
    expect(result.current.activeSession).toEqual({ ...session, buffer: [], nextBufferSequence: 0 })
  })

  it('creates a session with an explicit cwd override', async () => {
    const { result } = renderHook(() => useTerminalSessions({ cwd: '/workspace' }))

    await act(() => result.current.createSession({ cwd: '/workspace/src' }))

    expect(mocks.request).toHaveBeenCalledWith('terminal.session.create', {
      cwd: '/workspace/src',
      cols: 80,
      rows: 24
    })
  })

  it('ensures a session through the idempotent terminal route', async () => {
    const { result } = renderHook(() => useTerminalSessions({ cwd: '/workspace' }))

    await act(() => result.current.ensureSession({ cwd: '/workspace' }))

    expect(mocks.request).toHaveBeenCalledWith('terminal.session.ensure', {
      cwd: '/workspace',
      cols: 80,
      rows: 24
    })
    expect(result.current.sessions).toEqual([{ ...session, buffer: [], nextBufferSequence: 0 }])
  })

  it('keeps a created session when an older empty list response resolves later', async () => {
    let resolveList: (value: TerminalSessionMetadata[]) => void = () => {}
    mocks.request.mockImplementation((route: string) => {
      if (route === 'terminal.session.list') {
        return new Promise<TerminalSessionMetadata[]>((resolve) => {
          resolveList = resolve
        })
      }
      return Promise.resolve(session)
    })
    const { result } = renderHook(() => useTerminalSessions({ cwd: '/workspace' }))

    await act(() => result.current.ensureSession())
    await act(async () => {
      resolveList([])
    })

    expect(result.current.sessions).toEqual([{ ...session, buffer: [], nextBufferSequence: 0 }])
    expect(mocks.request.mock.calls.filter(([route]) => route === 'terminal.session.ensure')).toHaveLength(1)
  })

  it('coalesces concurrent session creation requests for the same cwd', async () => {
    const first = renderHook(() => useTerminalSessions({ cwd: '/workspace' }))
    const second = renderHook(() => useTerminalSessions({ cwd: '/workspace' }))

    await act(async () => {
      await Promise.all([first.result.current.createSession(), second.result.current.createSession()])
    })

    expect(mocks.request.mock.calls.filter(([route]) => route === 'terminal.session.create')).toHaveLength(1)
    expect(first.result.current.sessions).toEqual([{ ...session, buffer: [], nextBufferSequence: 0 }])
    expect(second.result.current.sessions).toEqual([{ ...session, buffer: [], nextBufferSequence: 0 }])
  })

  it('keeps created sessions available across terminal page remounts', async () => {
    const first = renderHook(() => useTerminalSessions({ cwd: '/workspace' }))
    await act(() => first.result.current.createSession())
    await act(async () => {})
    first.unmount()

    mocks.request.mockClear()
    mocks.request.mockImplementation((route: string) => {
      if (route === 'terminal.session.list') return new Promise<never>(() => {})
      return Promise.resolve(session)
    })
    const second = renderHook(() => useTerminalSessions({ cwd: '/workspace' }))

    expect(second.result.current.sessions).toEqual([{ ...session, buffer: [], nextBufferSequence: 0 }])
    expect(second.result.current.activeSessionId).toBe(session.id)
    expect(mocks.request).not.toHaveBeenCalledWith(
      'terminal.session.create',
      expect.objectContaining({ cwd: '/workspace' })
    )
  })

  it('appends terminal data to the matching session buffer', async () => {
    const { result } = renderHook(() => useTerminalSessions({ cwd: '/workspace' }))
    await act(() => result.current.createSession())

    act(() => mocks.listeners.get('terminal.session.data')?.({ id: session.id, data: 'hello' }))

    act(() => mocks.listeners.get('terminal.session.data')?.({ id: session.id, data: 'hello again' }))

    expect(result.current.sessions[0]?.buffer).toEqual([
      { sequence: 0, data: 'hello' },
      { sequence: 1, data: 'hello again' }
    ])
  })

  it('removes a session when its process exits', async () => {
    const { result } = renderHook(() => useTerminalSessions({ cwd: '/workspace' }))
    await act(() => result.current.createSession())

    act(() => mocks.listeners.get('terminal.session.exit')?.({ id: session.id, exitCode: 0 }))

    expect(result.current.sessions).toEqual([])
    expect(result.current.activeSessionId).toBeNull()
  })

  it('updates session metadata without dropping buffered terminal output', async () => {
    const { result } = renderHook(() => useTerminalSessions({ cwd: '/workspace' }))
    await act(() => result.current.createSession())

    act(() => mocks.listeners.get('terminal.session.data')?.({ id: session.id, data: 'hello' }))
    act(() =>
      mocks.listeners.get('terminal.session.updated')?.({
        ...session,
        cwd: '/workspace/src',
        processName: 'pnpm',
        updatedAt: 2
      })
    )

    expect(result.current.sessions[0]).toMatchObject({
      cwd: '/workspace/src',
      processName: 'pnpm',
      buffer: [{ sequence: 0, data: 'hello' }],
      nextBufferSequence: 1
    })
  })

  it('clears the previous process name when metadata update omits it', async () => {
    const { result } = renderHook(() => useTerminalSessions({ cwd: '/workspace' }))
    mocks.request.mockResolvedValueOnce({ ...session, processName: 'pnpm' })
    await act(() => result.current.createSession())

    act(() =>
      mocks.listeners.get('terminal.session.updated')?.({
        ...session,
        cwd: '/workspace/src',
        updatedAt: 2
      })
    )

    expect(result.current.sessions[0]).toMatchObject({
      cwd: '/workspace/src',
      buffer: [],
      nextBufferSequence: 0
    })
    expect(result.current.sessions[0]).not.toHaveProperty('processName')
  })

  it('skips duplicate terminal resize requests for the same session size', async () => {
    const { result } = renderHook(() => useTerminalSessions({ cwd: '/workspace' }))
    await act(() => result.current.createSession())
    mocks.request.mockClear()

    void result.current.resizeSession(session.id, { cols: 80, rows: 24 })
    expect(mocks.request).not.toHaveBeenCalled()

    void result.current.resizeSession(session.id, { cols: 100, rows: 30 })
    expect(mocks.request).toHaveBeenCalledWith('terminal.session.resize', {
      id: session.id,
      cols: 100,
      rows: 30
    })

    mocks.request.mockClear()
    void result.current.resizeSession(session.id, { cols: 100, rows: 30 })
    expect(mocks.request).not.toHaveBeenCalled()
  })
})
