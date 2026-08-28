import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import TranscriptionPage from '../TranscriptionPage'

describe('TranscriptionPage', () => {
  it('switches between recording and file input modes', async () => {
    const user = userEvent.setup()
    render(<TranscriptionPage />)

    expect(screen.getByRole('button', { name: 'Start recording' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Import audio' }))

    expect(screen.getByRole('button', { name: 'Choose audio file' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Start recording' })).not.toBeInTheDocument()
  })
})
