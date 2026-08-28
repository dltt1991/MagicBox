import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { OrganizationPanel } from '../OrganizationPanel'

describe('OrganizationPanel', () => {
  it('organizes with a built-in template and a custom prompt', async () => {
    const user = userEvent.setup()
    const onOrganize = vi.fn()
    render(
      <OrganizationPanel
        templates={[
          {
            id: 'summary',
            name: 'General Summary',
            prompt: 'Summarize {{transcript}}',
            builtIn: true,
            isDefault: true,
            orderKey: 'a',
            createdAt: '2026-08-27T00:00:00.000Z',
            updatedAt: '2026-08-27T00:00:00.000Z'
          }
        ]}
        organizationOutput={null}
        onOrganize={onOrganize}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Organize' }))
    expect(onOrganize).toHaveBeenCalledWith({ prompt: 'Summarize {{transcript}}', templateId: 'summary' })

    await user.click(screen.getByRole('button', { name: 'Custom prompt' }))
    await user.type(screen.getByLabelText('Prompt'), 'Extract decisions')
    await user.click(screen.getByRole('button', { name: 'Use prompt' }))
    await user.click(screen.getByRole('button', { name: 'Organize' }))
    expect(onOrganize).toHaveBeenLastCalledWith({ prompt: 'Extract decisions', templateId: null })
  })
})
