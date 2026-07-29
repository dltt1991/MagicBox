import { randomUUID } from 'node:crypto'

import { application } from '@application'
import { loggerService } from '@logger'
import { BaseService, Injectable, Phase, ServicePhase } from '@main/core/lifecycle'
import type { TerminalSessionMetadata } from '@shared/ipc/schemas/terminal'
import type { WindowId } from '@shared/ipc/types'
import { type IPty, spawn } from 'node-pty'

const logger = loggerService.withContext('TerminalService')

type CreateTerminalSessionInput = {
  ownerWindowId: WindowId
  cwd?: string
  cols: number
  rows: number
}

type TerminalSession = {
  ownerWindowId: WindowId
  metadata: TerminalSessionMetadata
  pty: IPty
}

@Injectable('TerminalService')
@ServicePhase(Phase.WhenReady)
export class TerminalService extends BaseService {
  private readonly sessions = new Map<string, TerminalSession>()

  public async createSession(input: CreateTerminalSessionInput): Promise<TerminalSessionMetadata> {
    const cwd = input.cwd ?? application.getPath('sys.home')
    const shell = this.getShell()
    const now = Date.now()
    const metadata: TerminalSessionMetadata = {
      id: randomUUID(),
      cwd,
      shell,
      pid: null,
      status: 'running',
      createdAt: now,
      updatedAt: now
    }

    try {
      const pty = spawn(shell, this.getShellArgs(), {
        name: 'xterm-256color',
        cols: input.cols,
        rows: input.rows,
        cwd,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          LANG: process.env.LANG ?? 'en_US.UTF-8'
        }
      })

      metadata.pid = pty.pid
      this.sessions.set(metadata.id, { ownerWindowId: input.ownerWindowId, metadata, pty })
      pty.onData((data) => {
        application.get('IpcApiService').send(input.ownerWindowId, 'terminal.session.data', { id: metadata.id, data })
      })
      pty.onExit(({ exitCode, signal }) => {
        const session = this.sessions.get(metadata.id)
        if (!session) return

        session.metadata.status = 'exited'
        session.metadata.updatedAt = Date.now()
        application.get('IpcApiService').send(session.ownerWindowId, 'terminal.session.updated', session.metadata)
        application.get('IpcApiService').send(session.ownerWindowId, 'terminal.session.exit', {
          id: metadata.id,
          exitCode,
          signal
        })
      })

      return metadata
    } catch (error) {
      logger.error(`Failed to create terminal session in ${cwd}`, error as Error)
      throw error
    }
  }

  public listSessions(ownerWindowId: WindowId): TerminalSessionMetadata[] {
    return Array.from(this.sessions.values())
      .filter((session) => session.ownerWindowId === ownerWindowId)
      .map(({ metadata }) => metadata)
  }

  public writeInput(ownerWindowId: WindowId, id: string, data: string): void {
    this.getOwnedSession(ownerWindowId, id).pty.write(data)
  }

  public resizeSession(ownerWindowId: WindowId, id: string, size: { cols: number; rows: number }): void {
    this.getOwnedSession(ownerWindowId, id).pty.resize(size.cols, size.rows)
  }

  public killSession(ownerWindowId: WindowId, id: string): void {
    this.getOwnedSession(ownerWindowId, id).pty.kill()
  }

  protected override async onStop(): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.metadata.status === 'running') session.pty.kill()
    }
    this.sessions.clear()
  }

  private getShell(): string {
    if (process.platform === 'win32') return process.env.COMSPEC ?? 'cmd.exe'
    return process.env.SHELL ?? '/bin/bash'
  }

  private getShellArgs(): string[] {
    return process.platform === 'win32' ? [] : ['-l']
  }

  private getOwnedSession(ownerWindowId: WindowId, id: string): TerminalSession {
    const session = this.sessions.get(id)
    if (!session || session.ownerWindowId !== ownerWindowId) {
      throw new Error('Terminal session not found')
    }
    return session
  }
}
