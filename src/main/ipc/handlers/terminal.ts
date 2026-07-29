import { application } from '@application'
import type { terminalRequestSchemas } from '@shared/ipc/schemas/terminal'
import type { IpcHandlersFor } from '@shared/ipc/types'

export const terminalHandlers: IpcHandlersFor<typeof terminalRequestSchemas> = {
  'terminal.session.create': async (input) => application.get('TerminalService').createSession(input),
  'terminal.session.list': async () => application.get('TerminalService').listSessions(),
  'terminal.session.input': async ({ id, data }) => application.get('TerminalService').writeInput(id, data),
  'terminal.session.resize': async ({ id, cols, rows }) =>
    application.get('TerminalService').resizeSession(id, { cols, rows }),
  'terminal.session.kill': async ({ id }) => application.get('TerminalService').killSession(id)
}
