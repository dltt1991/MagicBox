import { application } from '@application'
import { IpcError, IpcErrorCode } from '@shared/ipc/errors/IpcError'
import type { terminalRequestSchemas } from '@shared/ipc/schemas/terminal'
import type { IpcContext, IpcHandlersFor, WindowId } from '@shared/ipc/types'

function requireSenderWindow(ctx: IpcContext): WindowId {
  if (!ctx.senderId) {
    throw new IpcError(IpcErrorCode.FORBIDDEN_SENDER, 'Terminal requests require a managed window')
  }
  return ctx.senderId
}

export const terminalHandlers: IpcHandlersFor<typeof terminalRequestSchemas> = {
  'terminal.session.create': async (input, ctx) =>
    application.get('TerminalService').createSession({ ownerWindowId: requireSenderWindow(ctx), ...input }),
  'terminal.session.ensure': async (input, ctx) =>
    application.get('TerminalService').ensureSession({ ownerWindowId: requireSenderWindow(ctx), ...input }),
  'terminal.session.list': async (_input, ctx) =>
    application.get('TerminalService').listSessions(requireSenderWindow(ctx)),
  'terminal.session.input': async ({ id, data }, ctx) =>
    application.get('TerminalService').writeInput(requireSenderWindow(ctx), id, data),
  'terminal.session.resize': async ({ id, cols, rows }, ctx) =>
    application.get('TerminalService').resizeSession(requireSenderWindow(ctx), id, { cols, rows }),
  'terminal.session.kill': async ({ id }, ctx) =>
    application.get('TerminalService').killSession(requireSenderWindow(ctx), id)
}
