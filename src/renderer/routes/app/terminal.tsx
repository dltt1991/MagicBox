import TerminalPage from '@renderer/pages/terminal/TerminalPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/terminal')({
  component: TerminalPage
})
