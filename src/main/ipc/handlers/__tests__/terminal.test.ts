import { beforeEach, describe, expect, it, vi } from 'vitest'

const { terminalService } = vi.hoisted(() => ({
  terminalService: {
    createSession: vi.fn(),
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
})

describe('terminal handlers', () => {
  const ctx = { senderId: 'window-1' }

  it('delegates terminal commands to TerminalService', async () => {
    terminalService.createSession.mockResolvedValue({ id: 's1' })
    terminalService.listSessions.mockReturnValue([])

    await terminalHandlers['terminal.session.create']({ cwd: '/workspace', cols: 80, rows: 24 }, ctx)
    await terminalHandlers['terminal.session.list'](undefined, ctx)
    await terminalHandlers['terminal.session.input']({ id: 's1', data: 'ls\n' }, ctx)
    await terminalHandlers['terminal.session.resize']({ id: 's1', cols: 100, rows: 30 }, ctx)
    await terminalHandlers['terminal.session.kill']({ id: 's1' }, ctx)

    expect(terminalService.createSession).toHaveBeenCalledWith({ cwd: '/workspace', cols: 80, rows: 24 })
    expect(terminalService.listSessions).toHaveBeenCalledOnce()
    expect(terminalService.writeInput).toHaveBeenCalledWith('s1', 'ls\n')
    expect(terminalService.resizeSession).toHaveBeenCalledWith('s1', { cols: 100, rows: 30 })
    expect(terminalService.killSession).toHaveBeenCalledWith('s1')
  })
})
