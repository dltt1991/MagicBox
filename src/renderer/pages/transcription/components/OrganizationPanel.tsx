import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@cherrystudio/ui'
import CopyButton from '@renderer/components/CopyButton'
import type { TranscriptionPromptTemplate } from '@shared/data/types/transcription'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CustomPromptDialog } from './CustomPromptDialog'

type OrganizationPanelProps = {
  disabled?: boolean
  isOrganizing?: boolean
  onExport?: (text: string) => void
  onOrganize?: (input: { prompt: string; templateId: string | null }) => void
  organizationOutput: string | null
  templates: TranscriptionPromptTemplate[]
}

export function OrganizationPanel({
  isOrganizing = false,
  disabled = false,
  onExport,
  onOrganize,
  organizationOutput,
  templates
}: OrganizationPanelProps) {
  const { t } = useTranslation()
  const defaultTemplateId = templates.find((template) => template.isDefault)?.id ?? templates[0]?.id ?? ''
  const [templateId, setTemplateId] = useState(defaultTemplateId)
  const [customPrompt, setCustomPrompt] = useState('')
  const [customPromptOpen, setCustomPromptOpen] = useState(false)
  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId),
    [templateId, templates]
  )
  const prompt = customPrompt || selectedTemplate?.prompt || ''

  return (
    <section className="grid min-h-52 grid-rows-[auto_minmax(8rem,1fr)] gap-3 border-border-subtle border-t py-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-medium text-sm">{t('transcription.organization')}</h2>
        <Select
          value={customPrompt ? 'custom' : templateId}
          onValueChange={(value) => {
            if (value === 'custom') setCustomPromptOpen(true)
            else {
              setCustomPrompt('')
              setTemplateId(value)
            }
          }}>
          <SelectTrigger size="sm" aria-label={t('transcription.template')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {templates.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                {template.builtIn ? t(getTemplateDisplayName(template)) : template.name}
              </SelectItem>
            ))}
            <SelectItem value="custom">{t('transcription.custom_prompt')}</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => setCustomPromptOpen(true)}>
          {t('transcription.custom_prompt')}
        </Button>
        <Button
          size="sm"
          disabled={disabled || !onOrganize || !prompt}
          loading={isOrganizing}
          onClick={() => onOrganize?.({ prompt, templateId: customPrompt ? null : templateId })}>
          {organizationOutput ? t('common.retry') : t('transcription.organize')}
        </Button>
        {organizationOutput ? (
          <div className="ml-auto flex gap-1">
            <CopyButton textToCopy={organizationOutput} tooltip={t('common.copy')} />
            <Button size="sm" variant="outline" onClick={() => onExport?.(organizationOutput)}>
              {t('transcription.export')}
            </Button>
          </div>
        ) : null}
      </div>
      <Textarea.Input
        aria-label={t('transcription.organization')}
        className="min-h-32 resize-none"
        readOnly
        value={organizationOutput ?? ''}
      />
      <CustomPromptDialog
        initialPrompt={customPrompt}
        open={customPromptOpen}
        onOpenChange={setCustomPromptOpen}
        onSubmit={setCustomPrompt}
      />
    </section>
  )
}

const BUILT_IN_TEMPLATE_LABEL_KEYS: Record<string, string> = {
  'builtin-article-draft': 'transcription.template.article_draft',
  'builtin-general-summary': 'transcription.template.general_summary',
  'builtin-interview-notes': 'transcription.template.interview_notes',
  'builtin-meeting-minutes': 'transcription.template.meeting_minutes'
}

export function getTemplateDisplayName(template: Pick<TranscriptionPromptTemplate, 'builtIn' | 'id' | 'name'>): string {
  return template.builtIn ? (BUILT_IN_TEMPLATE_LABEL_KEYS[template.id] ?? template.name) : template.name
}
