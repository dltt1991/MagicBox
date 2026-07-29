import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@cherrystudio/ui', () => ({
  EmptyState: ({ title }: { title?: string }) => <div data-testid="empty-state">{title}</div>
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

import TerminalPage from '../TerminalPage'

afterEach(cleanup)

describe('TerminalPage', () => {
  it('renders the translated terminal title in the empty state', () => {
    render(<TerminalPage />)

    expect(screen.getByTestId('empty-state')).toHaveTextContent('terminal.title')
  })
})
