import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { BaseService } from '@main/core/lifecycle'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MediaKind } from '../types'

const { handleMock, unhandleMock, ipcMainMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
  unhandleMock: vi.fn(),
  ipcMainMock: { handle: vi.fn(), on: vi.fn(), removeHandler: vi.fn(), removeListener: vi.fn() }
}))

vi.mock('electron', () => ({
  protocol: { handle: handleMock, unhandle: unhandleMock },
  ipcMain: ipcMainMock
}))

import { MediaProtocolService } from '../MediaProtocolService'

describe('MediaProtocolService audio', () => {
  let audioDir: string
  let service: MediaProtocolService
  let handler: (request: Request) => Response | Promise<Response>

  beforeEach(async () => {
    audioDir = mkdtempSync(path.join(tmpdir(), 'cherry-media-audio-'))
    handleMock.mockReset()
    handleMock.mockImplementation((_scheme: string, fn: typeof handler) => {
      handler = fn
    })
    BaseService.resetInstances()
    service = new MediaProtocolService()
    await service._doInit()
  })

  afterEach(async () => {
    await service._doDestroy()
    rmSync(audioDir, { recursive: true, force: true })
  })

  it('streams a requested range from a file-backed audio entry without leaking its path', async () => {
    const audioPath = path.join(audioDir, 'private-recording.webm')
    writeFileSync(audioPath, '0123456789')
    const url = service.getUrl(MediaKind.Audio, service.storeFile(MediaKind.Audio, 'record-1', audioPath, 'audio/webm'))

    const response = await handler(new Request(url, { headers: { Range: 'bytes=2-5' } }))

    expect(response.status).toBe(206)
    expect(response.headers.get('Content-Range')).toBe('bytes 2-5/10')
    expect(response.headers.get('Content-Length')).toBe('4')
    expect(response.headers.get('Accept-Ranges')).toBe('bytes')
    expect(await response.text()).toBe('2345')
    expect([...response.headers.values()].join('\n')).not.toContain(audioPath)
  })
})
