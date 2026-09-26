import { createFileRoute } from '@tanstack/react-router'

import TerminalPage from '@renderer/pages/terminal/TerminalPage'

export const Route = createFileRoute('/app/terminal')({
  component: TerminalPage
})
