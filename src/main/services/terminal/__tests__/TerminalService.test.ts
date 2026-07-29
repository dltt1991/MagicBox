import { application } from '@application'
import { BaseService } from '@main/core/lifecycle'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { spawn, write, resize, kill, onData, onExit, onWindowDestroyed, broadcast, send } = vi.hoisted(() => ({
  spawn: vi.fn(),
  write: vi.fn(),
  resize: vi.fn(),
  kill: vi.fn(),
  onData: vi.fn(),
  onExit: vi.fn(),
  onWindowDestroyed: vi.fn(),
  broadcast: vi.fn(),
  send: vi.fn()
}))

vi.mock('node-pty', () => ({ spawn }))

import { TerminalService } from '../TerminalService'

describe('TerminalService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    BaseService.resetInstances()
    spawn.mockReturnValue({ pid: 123, write, resize, kill, onData, onExit })
    vi.mocked(application.getPath).mockReturnValue('/mock/home')
    const applicationGet = vi.mocked(application.get) as unknown as {
      mockImplementation(fn: (serviceName: string) => unknown): void
    }
    applicationGet.mockImplementation((serviceName: string) => {
      if (serviceName === 'WindowManager') return { onWindowDestroyed }
      return { broadcast, send }
    })
    onWindowDestroyed.mockReturnValue({ dispose: vi.fn() })
  })

  it('spawns a terminal session with the requested cwd and dimensions', async () => {
    const service = new TerminalService()

    const session = await service.createSession({ ownerWindowId: 'window-1', cwd: '/workspace', cols: 120, rows: 40 })

    expect(spawn).toHaveBeenCalledWith(
      session.shell,
      expect.arrayContaining(['-l']),
      expect.objectContaining({ cols: 120, rows: 40, cwd: '/workspace' })
    )
    expect(session).toMatchObject({ cwd: '/workspace', pid: 123, status: 'running' })
  })

  it('forwards input and size changes to the matching terminal', async () => {
    const service = new TerminalService()
    const session = await service.createSession({ ownerWindowId: 'window-1', cols: 80, rows: 24 })

    service.writeInput('window-1', session.id, 'ls\n')
    service.resizeSession('window-1', session.id, { cols: 100, rows: 30 })

    expect(write).toHaveBeenCalledWith('ls\n')
    expect(resize).toHaveBeenCalledWith(100, 30)
    expect(application.getPath).toHaveBeenCalledWith('sys.home')
  })

  it('kills the matching terminal session', async () => {
    const service = new TerminalService()
    const session = await service.createSession({ ownerWindowId: 'window-1', cols: 80, rows: 24 })

    service.killSession('window-1', session.id)

    expect(kill).toHaveBeenCalledOnce()
  })

  it('lists and controls only sessions owned by the caller window', async () => {
    const service = new TerminalService()
    const owned = await service.createSession({ ownerWindowId: 'window-1', cols: 80, rows: 24 })
    const other = await service.createSession({ ownerWindowId: 'window-2', cols: 80, rows: 24 })

    expect(service.listSessions('window-1')).toEqual([owned])
    expect(service.listSessions('window-2')).toEqual([other])
    expect(() => service.writeInput('window-2', owned.id, 'rm -rf nope\n')).toThrow('Terminal session not found')
    expect(() => service.killSession('window-2', owned.id)).toThrow('Terminal session not found')
  })

  it('broadcasts PTY data and exit updates', async () => {
    const service = new TerminalService()
    const session = await service.createSession({ ownerWindowId: 'window-1', cols: 80, rows: 24 })
    const ipcApiService = application.get('IpcApiService')
    const send = vi.mocked(ipcApiService.send)
    const broadcast = vi.mocked(ipcApiService.broadcast)

    onData.mock.calls[0][0]('hello')
    onExit.mock.calls[0][0]({ exitCode: 0 })

    expect(send).toHaveBeenCalledWith('window-1', 'terminal.session.data', { id: session.id, data: 'hello' })
    expect(send).toHaveBeenCalledWith(
      'window-1',
      'terminal.session.updated',
      expect.objectContaining({ id: session.id, status: 'exited' })
    )
    expect(send).toHaveBeenCalledWith('window-1', 'terminal.session.exit', {
      id: session.id,
      exitCode: 0,
      signal: undefined
    })
    expect(broadcast).not.toHaveBeenCalled()
  })

  it('kills all live sessions when the service stops', async () => {
    const service = new TerminalService()
    await service.createSession({ ownerWindowId: 'window-1', cols: 80, rows: 24 })
    await service.createSession({ ownerWindowId: 'window-1', cols: 80, rows: 24 })

    await (service as unknown as { onStop(): Promise<void> }).onStop()

    expect(kill).toHaveBeenCalledTimes(2)
  })

  it('kills sessions owned by a destroyed window', async () => {
    const service = new TerminalService()
    ;(service as unknown as { onInit(): void }).onInit()
    const owned = await service.createSession({ ownerWindowId: 'window-1', cols: 80, rows: 24 })
    const other = await service.createSession({ ownerWindowId: 'window-2', cols: 80, rows: 24 })

    onWindowDestroyed.mock.calls[0][0]({ id: 'window-1' })

    expect(kill).toHaveBeenCalledOnce()
    expect(service.listSessions('window-1')).toEqual([])
    expect(service.listSessions('window-2')).toEqual([other])
    expect(() => service.writeInput('window-1', owned.id, 'echo nope\n')).toThrow('Terminal session not found')
  })
})
