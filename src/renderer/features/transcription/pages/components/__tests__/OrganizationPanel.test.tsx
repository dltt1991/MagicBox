import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { getTemplateDisplayName, OrganizationPanel } from '../OrganizationPanel'

describe('OrganizationPanel', () => {
  const summaryTemplate = {
    id: 'summary',
    name: 'General Summary',
    prompt: 'Summarize {{transcript}}',
    builtIn: true,
    isDefault: true,
    orderKey: 'a',
    createdAt: '2026-08-27T00:00:00.000Z',
    updatedAt: '2026-08-27T00:00:00.000Z'
  }

  it('organizes with a built-in template and a custom prompt', async () => {
    const user = userEvent.setup()
    const onOrganize = vi.fn()
    render(<OrganizationPanel templates={[summaryTemplate]} organizationOutput={null} onOrganize={onOrganize} />)

    await user.click(screen.getByRole('button', { name: 'Organize' }))
    expect(onOrganize).toHaveBeenCalledWith({ prompt: 'Summarize {{transcript}}', templateId: 'summary' })

    await user.click(screen.getByRole('button', { name: 'Custom prompt' }))
    await user.type(screen.getByLabelText('Prompt'), 'Extract decisions')
    await user.click(screen.getByRole('button', { name: 'Use prompt' }))
    await user.click(screen.getByRole('button', { name: 'Organize' }))
    expect(onOrganize).toHaveBeenLastCalledWith({ prompt: 'Extract decisions', templateId: null })
  })

  it('uses locale keys for built-in templates and preserves custom names', () => {
    expect(
      getTemplateDisplayName({ builtIn: true, id: 'builtin-meeting-minutes', name: 'Meeting Minutes' } as never)
    ).toBe('transcription.template.meeting_minutes')
    expect(getTemplateDisplayName({ builtIn: false, id: 'custom', name: 'My outline' } as never)).toBe('My outline')
  })

  it('disables organization until a transcription result is persisted', () => {
    render(<OrganizationPanel templates={[]} organizationOutput={null} onOrganize={vi.fn()} disabled />)

    expect(screen.getByRole('button', { name: 'Organize' })).toBeDisabled()
  })

  it('selects the default template after templates load', async () => {
    const user = userEvent.setup()
    const onOrganize = vi.fn()
    const { rerender } = render(<OrganizationPanel templates={[]} organizationOutput={null} onOrganize={onOrganize} />)

    rerender(<OrganizationPanel templates={[summaryTemplate]} organizationOutput={null} onOrganize={onOrganize} />)
    await user.click(screen.getByRole('button', { name: 'Organize' }))

    expect(onOrganize).toHaveBeenCalledWith({ prompt: 'Summarize {{transcript}}', templateId: 'summary' })
  })

  it('keeps long organization output scrolling inside the result pane', () => {
    render(<OrganizationPanel templates={[summaryTemplate]} organizationOutput="Long organization output" />)

    expect(screen.getByRole('textbox', { name: 'Organization' })).toHaveClass(
      'field-sizing-fixed',
      'h-full',
      'min-h-0',
      'overflow-y-auto'
    )
  })

  it('switches between rendered markdown preview and markdown source', async () => {
    const user = userEvent.setup()
    render(<OrganizationPanel templates={[summaryTemplate]} organizationOutput="# Summary\n\n- Decision" />)

    expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Organization' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Source' }))

    expect(screen.getByRole('textbox', { name: 'Organization' })).toHaveValue('# Summary\n\n- Decision')
  })

  it('opens the organization output in a maximized markdown viewer', async () => {
    const user = userEvent.setup()
    render(<OrganizationPanel templates={[summaryTemplate]} organizationOutput="# Summary" />)

    await user.click(screen.getByRole('button', { name: 'Maximize' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { name: 'Summary' })).toHaveLength(2)
  })
})
