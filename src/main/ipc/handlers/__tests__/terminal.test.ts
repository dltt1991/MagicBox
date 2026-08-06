import { beforeEach, describe, expect, it, vi } from 'vitest'

const { terminalService } = vi.hoisted(() => ({
  terminalService: {
    createSession: vi.fn(),
    ensureSession: vi.fn(),
    listSessions: vi.fn(),
    writeInput: vi.fn(),
    resizeSession: vi.fn(),
    killSession: vi.fn()
  }
}))

vi.mock('@application', () => ({
  application: {
    get: vi.fn(() => terminalService)
  }
}))

import { terminalRequestSchemas } from '@shared/ipc/schemas/terminal'

import { terminalHandlers } from '../terminal'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('terminal IPC schemas', () => {
  it('accepts terminal input data', () => {
    expect(terminalRequestSchemas['terminal.session.input'].input.parse({ id: 's1', data: 'ls\n' })).toEqual({
      id: 's1',
      data: 'ls\n'
    })
  })

  it('rejects terminal dimensions outside the supported range', () => {
    expect(() =>
      terminalRequestSchemas['terminal.session.resize'].input.parse({ id: 's1', cols: 0, rows: 24 })
    ).toThrow()
  })

  it('rejects unbounded terminal payload fields', () => {
    expect(() =>
      terminalRequestSchemas['terminal.session.input'].input.parse({ id: 's1', data: 'x'.repeat(16_385) })
    ).toThrow()
    expect(() =>
      terminalRequestSchemas['terminal.session.create'].input.parse({ cwd: 'x'.repeat(4097), cols: 80, rows: 24 })
    ).toThrow()
    expect(() => terminalRequestSchemas['terminal.session.kill'].input.parse({ id: 'x'.repeat(129) })).toThrow()
  })
})

describe('terminal handlers', () => {
  const ctx = { senderId: 'window-1' }

  it('delegates terminal commands to TerminalService', async () => {
    terminalService.createSession.mockResolvedValue({ id: 's1' })
    terminalService.ensureSession.mockResolvedValue({ id: 's1' })
    terminalService.listSessions.mockReturnValue([])

    await terminalHandlers['terminal.session.create']({ cwd: '/workspace', cols: 80, rows: 24 }, ctx)
    await terminalHandlers['terminal.session.ensure']({ cwd: '/workspace', cols: 80, rows: 24 }, ctx)
    await terminalHandlers['terminal.session.list'](undefined, ctx)
    await terminalHandlers['terminal.session.input']({ id: 's1', data: 'ls\n' }, ctx)
    await terminalHandlers['terminal.session.resize']({ id: 's1', cols: 100, rows: 30 }, ctx)
    await terminalHandlers['terminal.session.kill']({ id: 's1' }, ctx)

    expect(terminalService.createSession).toHaveBeenCalledWith({
      ownerWindowId: 'window-1',
      cwd: '/workspace',
      cols: 80,
      rows: 24
    })
    expect(terminalService.ensureSession).toHaveBeenCalledWith({
      ownerWindowId: 'window-1',
      cwd: '/workspace',
      cols: 80,
      rows: 24
    })
    expect(terminalService.listSessions).toHaveBeenCalledWith('window-1')
    expect(terminalService.writeInput).toHaveBeenCalledWith('window-1', 's1', 'ls\n')
    expect(terminalService.resizeSession).toHaveBeenCalledWith('window-1', 's1', { cols: 100, rows: 30 })
    expect(terminalService.killSession).toHaveBeenCalledWith('window-1', 's1')
  })

  it('rejects terminal commands from unmanaged senders', async () => {
    await expect(
      terminalHandlers['terminal.session.create']({ cols: 80, rows: 24 }, { senderId: null })
    ).rejects.toThrow('managed window')
  })
})
