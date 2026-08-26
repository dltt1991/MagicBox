import TranscriptionPage from '@renderer/pages/transcription/TranscriptionPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/transcription')({
  component: TranscriptionPage
})
