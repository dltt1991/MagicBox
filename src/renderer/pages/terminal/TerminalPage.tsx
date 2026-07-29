import { useEffect } from 'react'

import { TerminalPane } from './components/TerminalPane'
import { TerminalTabs } from './components/TerminalTabs'
import { useTerminalSessions } from './hooks/useTerminalSessions'

export default function TerminalPage() {
  const {
    activeSession,
    activeSessionId,
    closeSession,
    createSession,
    resizeSession,
    sendInput,
    sessions,
    setActiveSessionId
  } = useTerminalSessions({})

  useEffect(() => {
    void createSession()
  }, [createSession])

  return (
    <main className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <TerminalTabs
        activeSessionId={activeSessionId}
        onClose={(id) => void closeSession(id)}
        onCreate={() => void createSession()}
        onSelect={setActiveSessionId}
        sessions={sessions}
      />
      <TerminalPane
        buffer={activeSession?.buffer ?? []}
        key={activeSessionId ?? 'empty'}
        onInput={(data) => {
          if (activeSessionId) void sendInput(activeSessionId, data)
        }}
        onResize={(size) => {
          if (activeSessionId) void resizeSession(activeSessionId, size)
        }}
        sessionId={activeSessionId}
      />
    </main>
  )
}
