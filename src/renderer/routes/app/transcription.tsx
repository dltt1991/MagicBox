import { TranscriptionPage } from '@renderer/features/transcription'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/transcription')({
  component: TranscriptionPage
})
