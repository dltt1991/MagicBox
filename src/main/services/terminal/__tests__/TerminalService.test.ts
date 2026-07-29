import { application } from '@application'
import { BaseService } from '@main/core/lifecycle'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  spawn,
  write,
  resize,
  kill,
  onData,
  onExit,
  onWindowDestroyed,
  broadcast,
  send,
  execFile,
  mkdirSync,
  writeFileSync
} = vi.hoisted(() => ({
  spawn: vi.fn(),
  write: vi.fn(),
  resize: vi.fn(),
  kill: vi.fn(),
  onData: vi.fn(),
  onExit: vi.fn(),
  onWindowDestroyed: vi.fn(),
  broadcast: vi.fn(),
  send: vi.fn(),
  execFile: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn()
}))

vi.mock('node-pty', () => ({ spawn }))
vi.mock('node:child_process', () => ({ execFile }))
vi.mock('node:fs', () => ({ default: { mkdirSync, writeFileSync }, mkdirSync, writeFileSync }))

import { TerminalService } from '../TerminalService'

describe('TerminalService', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    BaseService.resetInstances()
    spawn.mockReturnValue({ pid: 123, write, resize, kill, onData, onExit })
    execFile.mockImplementation((_file, _args, callback) => callback(null, 'p123\nn/mock/home\n', ''))
    vi.mocked(application.getPath).mockImplementation((key: string) =>
      key === 'feature.terminal.temp' ? '/mock/terminal-temp' : '/mock/home'
    )
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

  it('loads shell integration from startup files instead of writing install commands into the PTY', async () => {
    const service = new TerminalService()
    await service.createSession({ ownerWindowId: 'window-1', cols: 80, rows: 24 })

    expect(write).not.toHaveBeenCalled()
    expect(mkdirSync).toHaveBeenCalledWith('/mock/terminal-temp/zsh', { recursive: true })
    expect(writeFileSync).toHaveBeenCalledWith(
      '/mock/terminal-temp/zsh/.zshrc',
      expect.stringContaining('add-zsh-hook precmd __cherry_term_precmd'),
      'utf8'
    )
    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['-l']),
      expect.objectContaining({
        env: expect.objectContaining({
          ZDOTDIR: '/mock/terminal-temp/zsh',
          CHERRY_ORIGINAL_ZDOTDIR: '/mock/home'
        })
      })
    )
  })

  it('updates session cwd and process name from shell metadata markers', async () => {
    const service = new TerminalService()
    const session = await service.createSession({ ownerWindowId: 'window-1', cols: 80, rows: 24 })
    const cwd = Buffer.from('/workspace/src').toString('base64')
    const processName = Buffer.from('pnpm').toString('base64')

    onData.mock.calls[0][0](`\u001b]777;cherry;cwd=${cwd};proc=${processName}\u0007`)

    expect(send).toHaveBeenCalledWith(
      'window-1',
      'terminal.session.updated',
      expect.objectContaining({ id: session.id, cwd: '/workspace/src', processName: 'pnpm' })
    )
  })

  it('updates session metadata when shell markers are split across PTY chunks', async () => {
    const service = new TerminalService()
    const session = await service.createSession({ ownerWindowId: 'window-1', cols: 80, rows: 24 })
    const cwd = Buffer.from('/workspace/src').toString('base64')
    const processName = Buffer.from('pnpm').toString('base64')
    const marker = `\u001b]777;cherry;cwd=${cwd};proc=${processName}\u0007`

    onData.mock.calls[0][0](marker.slice(0, 16))
    onData.mock.calls[0][0](marker.slice(16))

    expect(send).toHaveBeenCalledWith(
      'window-1',
      'terminal.session.updated',
      expect.objectContaining({ id: session.id, cwd: '/workspace/src', processName: 'pnpm' })
    )
  })

  it('does not use directory-changing shell builtins as session labels', async () => {
    const service = new TerminalService()
    const session = await service.createSession({ ownerWindowId: 'window-1', cwd: '/workspace', cols: 80, rows: 24 })
    const cwd = Buffer.from('/workspace/src').toString('base64')
    const processName = Buffer.from('cd').toString('base64')

    onData.mock.calls[0][0](`\u001b]777;cherry;cwd=${cwd};proc=${processName}\u0007`)

    const updatedPayloads = send.mock.calls
      .filter(([, event]) => event === 'terminal.session.updated')
      .map(([, , payload]) => payload)
    expect(updatedPayloads.at(-1)).toMatchObject({ id: session.id, cwd: '/workspace/src' })
    expect(updatedPayloads.at(-1)).not.toHaveProperty('processName')
  })

  it('refreshes the session cwd from the shell process when PTY output has no shell marker', async () => {
    vi.useFakeTimers()
    execFile.mockImplementation((_file, _args, callback) => callback(null, 'p123\nn/workspace/src\n', ''))
    const service = new TerminalService()
    const session = await service.createSession({ ownerWindowId: 'window-1', cwd: '/workspace', cols: 80, rows: 24 })

    onData.mock.calls[0][0]('plain prompt output')
    await vi.runOnlyPendingTimersAsync()

    expect(execFile).toHaveBeenCalledWith('lsof', ['-a', '-p', '123', '-d', 'cwd', '-Fn'], expect.any(Function))
    expect(send).toHaveBeenCalledWith(
      'window-1',
      'terminal.session.updated',
      expect.objectContaining({ id: session.id, cwd: '/workspace/src' })
    )
  })

  it('clears transient shell command names when the process cwd refresh catches up', async () => {
    vi.useFakeTimers()
    execFile.mockImplementation((_file, _args, callback) => callback(null, 'p123\nn/workspace/src\n', ''))
    const service = new TerminalService()
    const session = await service.createSession({ ownerWindowId: 'window-1', cwd: '/workspace', cols: 80, rows: 24 })
    const cwd = Buffer.from('/workspace').toString('base64')
    const processName = Buffer.from('cd').toString('base64')

    onData.mock.calls[0][0](`\u001b]777;cherry;cwd=${cwd};proc=${processName}\u0007`)
    await vi.runOnlyPendingTimersAsync()

    const updatedPayloads = send.mock.calls
      .filter(([, event]) => event === 'terminal.session.updated')
      .map(([, , payload]) => payload)
    expect(updatedPayloads.at(-1)).toMatchObject({ id: session.id, cwd: '/workspace/src' })
    expect(updatedPayloads.at(-1)).not.toHaveProperty('processName')
  })

  it('clears the process name when the shell returns to the prompt', async () => {
    const service = new TerminalService()
    const session = await service.createSession({ ownerWindowId: 'window-1', cols: 80, rows: 24 })
    const cwd = Buffer.from('/workspace/src').toString('base64')
    const processName = Buffer.from('pnpm').toString('base64')

    onData.mock.calls[0][0](`\u001b]777;cherry;cwd=${cwd};proc=${processName}\u0007`)
    onData.mock.calls[0][0](`\u001b]777;cherry;cwd=${cwd};proc=\u0007`)

    const updatedPayloads = send.mock.calls
      .filter(([, event]) => event === 'terminal.session.updated')
      .map(([, , payload]) => payload)
    expect(updatedPayloads.at(-1)).toMatchObject({ id: session.id, cwd: '/workspace/src' })
    expect(updatedPayloads.at(-1)).not.toHaveProperty('processName')
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
