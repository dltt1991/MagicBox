import { application } from '@application'
import { BaseService } from '@main/core/lifecycle'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { spawn, write, resize, kill, onData, onExit } = vi.hoisted(() => ({
  spawn: vi.fn(),
  write: vi.fn(),
  resize: vi.fn(),
  kill: vi.fn(),
  onData: vi.fn(),
  onExit: vi.fn()
}))

vi.mock('node-pty', () => ({ spawn }))

import { TerminalService } from '../TerminalService'

describe('TerminalService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    BaseService.resetInstances()
    spawn.mockReturnValue({ pid: 123, write, resize, kill, onData, onExit })
    vi.mocked(application.getPath).mockReturnValue('/mock/home')
  })

  it('spawns a terminal session with the requested cwd and dimensions', async () => {
    const service = new TerminalService()

    const session = await service.createSession({ cwd: '/workspace', cols: 120, rows: 40 })

    expect(spawn).toHaveBeenCalledWith(
      session.shell,
      expect.arrayContaining(['-l']),
      expect.objectContaining({ cols: 120, rows: 40, cwd: '/workspace' })
    )
    expect(session).toMatchObject({ cwd: '/workspace', pid: 123, status: 'running' })
  })

  it('forwards input and size changes to the matching terminal', async () => {
    const service = new TerminalService()
    const session = await service.createSession({ cols: 80, rows: 24 })

    service.writeInput(session.id, 'ls\n')
    service.resizeSession(session.id, { cols: 100, rows: 30 })

    expect(write).toHaveBeenCalledWith('ls\n')
    expect(resize).toHaveBeenCalledWith(100, 30)
    expect(application.getPath).toHaveBeenCalledWith('sys.home')
  })

  it('kills the matching terminal session', async () => {
    const service = new TerminalService()
    const session = await service.createSession({ cols: 80, rows: 24 })

    service.killSession(session.id)

    expect(kill).toHaveBeenCalledOnce()
  })

  it('broadcasts PTY data and exit updates', async () => {
    const service = new TerminalService()
    const session = await service.createSession({ cols: 80, rows: 24 })
    const broadcast = vi.mocked(application.get('IpcApiService').broadcast)

    onData.mock.calls[0][0]('hello')
    onExit.mock.calls[0][0]({ exitCode: 0 })

    expect(broadcast).toHaveBeenCalledWith('terminal.session.data', { id: session.id, data: 'hello' })
    expect(broadcast).toHaveBeenCalledWith(
      'terminal.session.updated',
      expect.objectContaining({ id: session.id, status: 'exited' })
    )
    expect(broadcast).toHaveBeenCalledWith('terminal.session.exit', { id: session.id, exitCode: 0, signal: undefined })
  })

  it('kills all live sessions when the service stops', async () => {
    const service = new TerminalService()
    await service.createSession({ cols: 80, rows: 24 })
    await service.createSession({ cols: 80, rows: 24 })

    await (service as unknown as { onStop(): Promise<void> }).onStop()

    expect(kill).toHaveBeenCalledTimes(2)
  })
})
