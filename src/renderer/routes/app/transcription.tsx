import { createFileRoute } from '@tanstack/react-router'

import { TranscriptionPage } from '@renderer/features/transcription'

export const Route = createFileRoute('/app/transcription')({
  component: TranscriptionPage
})
