import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { application } from '@application'
import { loggerService } from '@logger'
import { BaseService, Injectable, Phase, ServicePhase } from '@main/core/lifecycle'
import type { TerminalSessionMetadata } from '@shared/ipc/schemas/terminal'
import type { WindowId } from '@shared/ipc/types'
import { type IPty, spawn } from 'node-pty'

const logger = loggerService.withContext('TerminalService')
const TERMINAL_METADATA_PREFIX = `${String.fromCharCode(0x1b)}]777;cherry;cwd=`
const TERMINAL_METADATA_END = String.fromCharCode(0x07)
const TERMINAL_METADATA_PROC_SEPARATOR = ';proc='
const TERMINAL_CWD_REFRESH_DELAY_MS = 120
const NON_PROCESS_SHELL_COMMANDS = new Set(['cd', 'pushd', 'popd'])

type CreateTerminalSessionInput = {
  ownerWindowId: WindowId
  cwd?: string
  cols: number
  rows: number
}

type TerminalSession = {
  ownerWindowId: WindowId
  metadata: TerminalSessionMetadata
  metadataBuffer: string
  pty: IPty
  cwdRefreshTimer: NodeJS.Timeout | null
}

type ShellLaunchConfig = {
  args: string[]
  env: NodeJS.ProcessEnv
}

@Injectable('TerminalService')
@ServicePhase(Phase.WhenReady)
export class TerminalService extends BaseService {
  private readonly sessions = new Map<string, TerminalSession>()

  protected override onInit(): void {
    this.registerDisposable(
      application.get('WindowManager').onWindowDestroyed((managedWindow) => {
        this.closeSessionsForWindow(managedWindow.id)
      })
    )
  }

  public async createSession(input: CreateTerminalSessionInput): Promise<TerminalSessionMetadata> {
    const cwd = input.cwd ?? application.getPath('sys.home')
    const shell = this.getShell()
    const shellLaunchConfig = this.getShellLaunchConfig(shell)
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
      const pty = spawn(shell, shellLaunchConfig.args, {
        name: 'xterm-256color',
        cols: input.cols,
        rows: input.rows,
        cwd,
        env: {
          ...shellLaunchConfig.env,
          TERM: 'xterm-256color',
          LANG: process.env.LANG ?? 'en_US.UTF-8'
        }
      })

      metadata.pid = pty.pid
      this.sessions.set(metadata.id, {
        ownerWindowId: input.ownerWindowId,
        metadata,
        metadataBuffer: '',
        pty,
        cwdRefreshTimer: null
      })
      pty.onData((data) => {
        this.handleMetadataMarkers(metadata.id, data)
        this.scheduleCwdRefresh(metadata.id)
        application.get('IpcApiService').send(input.ownerWindowId, 'terminal.session.data', { id: metadata.id, data })
      })
      pty.onExit(({ exitCode, signal }) => {
        const session = this.sessions.get(metadata.id)
        if (!session) return

        session.metadata.status = 'exited'
        session.metadata.updatedAt = Date.now()
        application
          .get('IpcApiService')
          .send(session.ownerWindowId, 'terminal.session.updated', { ...session.metadata })
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
      if (session.cwdRefreshTimer) clearTimeout(session.cwdRefreshTimer)
      if (session.metadata.status === 'running') session.pty.kill()
    }
    this.sessions.clear()
  }

  private getShell(): string {
    if (process.platform === 'win32') return process.env.COMSPEC ?? 'cmd.exe'
    return process.env.SHELL ?? '/bin/bash'
  }

  private getShellLaunchConfig(shell: string): ShellLaunchConfig {
    const env = { ...process.env }
    if (process.platform === 'win32') return { args: [], env }

    const shellName = path.basename(shell)
    if (shellName.includes('zsh')) return this.getZshLaunchConfig(env)
    if (shellName.includes('bash')) return this.getBashLaunchConfig(env)

    return { args: ['-l'], env }
  }

  private getZshLaunchConfig(env: NodeJS.ProcessEnv): ShellLaunchConfig {
    const integrationDir = path.join(application.getPath('feature.terminal.temp'), 'zsh')
    const originalZdotdir = process.env.ZDOTDIR ?? application.getPath('sys.home')
    fs.mkdirSync(integrationDir, { recursive: true })
    fs.writeFileSync(path.join(integrationDir, '.zprofile'), this.buildSourceOriginalZshFile('.zprofile'), 'utf8')
    fs.writeFileSync(
      path.join(integrationDir, '.zshrc'),
      [this.buildSourceOriginalZshFile('.zshrc'), this.buildZshIntegrationScript()].join('\n'),
      'utf8'
    )
    fs.writeFileSync(path.join(integrationDir, '.zlogin'), this.buildSourceOriginalZshFile('.zlogin'), 'utf8')

    return {
      args: ['-l'],
      env: {
        ...env,
        CHERRY_ORIGINAL_ZDOTDIR: originalZdotdir,
        ZDOTDIR: integrationDir
      }
    }
  }

  private getBashLaunchConfig(env: NodeJS.ProcessEnv): ShellLaunchConfig {
    const integrationDir = path.join(application.getPath('feature.terminal.temp'), 'bash')
    const rcFile = path.join(integrationDir, 'bashrc')
    fs.mkdirSync(integrationDir, { recursive: true })
    fs.writeFileSync(
      rcFile,
      ['if [ -r "$HOME/.bashrc" ]; then', '  source "$HOME/.bashrc"', 'fi', this.buildBashIntegrationScript()].join(
        '\n'
      ),
      'utf8'
    )

    return { args: ['--rcfile', rcFile, '-i'], env }
  }

  private buildSourceOriginalZshFile(fileName: string): string {
    return [
      `if [ -n "$CHERRY_ORIGINAL_ZDOTDIR" ] && [ -r "$CHERRY_ORIGINAL_ZDOTDIR/${fileName}" ]; then`,
      `  source "$CHERRY_ORIGINAL_ZDOTDIR/${fileName}"`,
      'fi'
    ].join('\n')
  }

  private buildZshIntegrationScript(): string {
    return [
      "__cherry_term_encode(){ printf '%s' \"$1\" | base64 | tr -d '\\n'; }",
      '__cherry_term_update(){ printf \'\\033]777;cherry;cwd=%s;proc=%s\\007\' "$(__cherry_term_encode "$PWD")" "$(__cherry_term_encode "$1")"; }',
      "__cherry_term_precmd(){ __cherry_term_update ''; }",
      '__cherry_term_preexec(){ __cherry_term_update "${1%% *}"; }',
      'autoload -Uz add-zsh-hook 2>/dev/null',
      'add-zsh-hook precmd __cherry_term_precmd 2>/dev/null',
      'add-zsh-hook preexec __cherry_term_preexec 2>/dev/null',
      'add-zsh-hook chpwd __cherry_term_precmd 2>/dev/null',
      '__cherry_term_precmd'
    ].join('\n')
  }

  private buildBashIntegrationScript(): string {
    return [
      "__cherry_term_encode(){ printf '%s' \"$1\" | base64 | tr -d '\\n'; }",
      '__cherry_term_update(){ printf \'\\033]777;cherry;cwd=%s;proc=%s\\007\' "$(__cherry_term_encode "$PWD")" "$(__cherry_term_encode "$1")"; }',
      "__cherry_term_precmd(){ __cherry_term_update ''; }",
      'PROMPT_COMMAND="__cherry_term_precmd${PROMPT_COMMAND:+;$PROMPT_COMMAND}"',
      '__cherry_term_precmd'
    ].join('\n')
  }

  private handleMetadataMarkers(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    let metadataBuffer = session.metadataBuffer + data
    let markerStart = metadataBuffer.indexOf(TERMINAL_METADATA_PREFIX)
    while (markerStart !== -1) {
      const payloadStart = markerStart + TERMINAL_METADATA_PREFIX.length
      const markerEnd = metadataBuffer.indexOf(TERMINAL_METADATA_END, payloadStart)
      if (markerEnd === -1) {
        session.metadataBuffer = metadataBuffer.slice(markerStart, markerStart + 8192)
        return
      }

      const markerPayload = metadataBuffer.slice(payloadStart, markerEnd)
      const procSeparatorIndex = markerPayload.indexOf(TERMINAL_METADATA_PROC_SEPARATOR)
      if (procSeparatorIndex === -1) {
        metadataBuffer = metadataBuffer.slice(markerEnd + TERMINAL_METADATA_END.length)
        markerStart = metadataBuffer.indexOf(TERMINAL_METADATA_PREFIX)
        continue
      }

      const cwd = this.decodeShellMetadata(markerPayload.slice(0, procSeparatorIndex))
      const processName = this.toDisplayProcessName(
        this.decodeShellMetadata(markerPayload.slice(procSeparatorIndex + TERMINAL_METADATA_PROC_SEPARATOR.length))
      )
      let changed = false

      if (cwd && cwd !== session.metadata.cwd) {
        session.metadata.cwd = cwd
        changed = true
      }

      if (processName) {
        if (session.metadata.processName !== processName) {
          session.metadata.processName = processName
          changed = true
        }
      } else if (session.metadata.processName) {
        delete session.metadata.processName
        changed = true
      }

      metadataBuffer = metadataBuffer.slice(markerEnd + TERMINAL_METADATA_END.length)
      markerStart = metadataBuffer.indexOf(TERMINAL_METADATA_PREFIX)
      if (!changed) continue
      session.metadata.updatedAt = Date.now()
      application.get('IpcApiService').send(session.ownerWindowId, 'terminal.session.updated', { ...session.metadata })
    }
    session.metadataBuffer = metadataBuffer.slice(
      Math.max(0, metadataBuffer.length - TERMINAL_METADATA_PREFIX.length + 1)
    )
  }

  private decodeShellMetadata(value: string | undefined): string {
    if (!value) return ''
    try {
      return Buffer.from(value, 'base64').toString('utf8')
    } catch {
      return ''
    }
  }

  private toDisplayProcessName(value: string): string {
    const processName = value.trim()
    return NON_PROCESS_SHELL_COMMANDS.has(processName) ? '' : processName
  }

  private scheduleCwdRefresh(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session || session.metadata.status !== 'running' || !session.metadata.pid || process.platform === 'win32') {
      return
    }

    if (session.cwdRefreshTimer) clearTimeout(session.cwdRefreshTimer)
    session.cwdRefreshTimer = setTimeout(() => {
      session.cwdRefreshTimer = null
      this.refreshCwdFromProcess(sessionId)
    }, TERMINAL_CWD_REFRESH_DELAY_MS)
    session.cwdRefreshTimer.unref?.()
  }

  private refreshCwdFromProcess(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session || session.metadata.status !== 'running' || !session.metadata.pid) return

    execFile('lsof', ['-a', '-p', String(session.metadata.pid), '-d', 'cwd', '-Fn'], (error, stdout) => {
      if (error) return

      const cwd = this.parseLsofCwd(stdout)
      const currentSession = this.sessions.get(sessionId)
      if (!cwd || !currentSession || currentSession.metadata.cwd === cwd) return

      currentSession.metadata.cwd = cwd
      delete currentSession.metadata.processName
      currentSession.metadata.updatedAt = Date.now()
      application
        .get('IpcApiService')
        .send(currentSession.ownerWindowId, 'terminal.session.updated', { ...currentSession.metadata })
    })
  }

  private parseLsofCwd(output: string): string {
    const cwdLine = output
      .split('\n')
      .find((line) => line.startsWith('n/') || (process.platform !== 'win32' && line.startsWith('n~')))
    return cwdLine ? cwdLine.slice(1) : ''
  }

  private getOwnedSession(ownerWindowId: WindowId, id: string): TerminalSession {
    const session = this.sessions.get(id)
    if (!session || session.ownerWindowId !== ownerWindowId) {
      throw new Error('Terminal session not found')
    }
    return session
  }

  private closeSessionsForWindow(ownerWindowId: WindowId): void {
    for (const [id, session] of this.sessions.entries()) {
      if (session.ownerWindowId !== ownerWindowId) continue
      if (session.cwdRefreshTimer) clearTimeout(session.cwdRefreshTimer)
      if (session.metadata.status === 'running') session.pty.kill()
      this.sessions.delete(id)
    }
  }
}
