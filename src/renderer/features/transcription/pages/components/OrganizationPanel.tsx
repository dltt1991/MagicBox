import '@cherrystudio/ui/components/composites/markdown/styles'

import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Markdown,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  withFullMarkdown
} from '@cherrystudio/ui'
import CopyButton from '@renderer/components/CopyButton'
import type { TranscriptionPromptTemplate } from '@shared/data/types/transcription'
import Maximize2 from 'lucide-react/dist/esm/icons/maximize-2'
import { type ReactNode, useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CustomPromptDialog } from './CustomPromptDialog'

const MARKDOWN_PLUGINS = withFullMarkdown()
type OrganizationViewMode = 'preview' | 'source'

type OrganizationPanelProps = {
  disabled?: boolean
  isOrganizing?: boolean
  organizationModelReady?: boolean
  organizationModelSelector?: ReactNode
  onExport?: (text: string) => void
  onOrganize?: (input: { prompt: string; templateId: string | null }) => void
  organizationOutput: string | null
  templates: TranscriptionPromptTemplate[]
}

export function OrganizationPanel({
  isOrganizing = false,
  disabled = false,
  organizationModelReady = true,
  organizationModelSelector,
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
  const [expanded, setExpanded] = useState(false)
  const [viewMode, setViewMode] = useState<OrganizationViewMode>('preview')
  const markdownId = useId()
  useEffect(() => {
    if (!customPrompt && defaultTemplateId && !templates.some((template) => template.id === templateId)) {
      setTemplateId(defaultTemplateId)
    }
  }, [customPrompt, defaultTemplateId, templateId, templates])
  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId),
    [templateId, templates]
  )
  const prompt = customPrompt || selectedTemplate?.prompt || ''
  const organizationContent = organizationOutput ?? ''
  const hasOutput = organizationContent.length > 0

  return (
    <section className="grid h-52 min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 border-border-subtle border-t py-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-medium text-sm">{t('transcription.organization')}</h2>
        {organizationModelSelector ? (
          <div className="min-w-44 flex-1 sm:max-w-72">{organizationModelSelector}</div>
        ) : null}
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
          disabled={disabled || !onOrganize || !prompt || !organizationModelReady}
          loading={isOrganizing}
          onClick={() => onOrganize?.({ prompt, templateId: customPrompt ? null : templateId })}>
          {organizationOutput ? t('common.retry') : t('transcription.organize')}
        </Button>
        {hasOutput ? (
          <div className="ml-auto flex items-center gap-1">
            <ViewModeControl mode={viewMode} onModeChange={setViewMode} />
            <CopyButton textToCopy={organizationContent} tooltip={t('common.copy')} />
            <Button size="sm" variant="outline" onClick={() => onExport?.(organizationContent)}>
              {t('transcription.export')}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('transcription.maximize')}
              onClick={() => setExpanded(true)}>
              <Maximize2 className="size-4" aria-hidden />
            </Button>
          </div>
        ) : null}
      </div>
      <OrganizationOutput content={organizationContent} markdownId={`${markdownId}-inline`} mode={viewMode} />
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="grid h-[min(86vh,820px)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-5xl" size="xl">
          <DialogHeader>
            <div className="flex items-center gap-2 pr-8">
              <DialogTitle>{t('transcription.organization')}</DialogTitle>
              <div className="ml-auto flex items-center gap-1">
                <ViewModeControl mode={viewMode} onModeChange={setViewMode} />
                {hasOutput ? <CopyButton textToCopy={organizationContent} tooltip={t('common.copy')} /> : null}
                {hasOutput ? (
                  <Button size="sm" variant="outline" onClick={() => onExport?.(organizationContent)}>
                    {t('transcription.export')}
                  </Button>
                ) : null}
              </div>
            </div>
          </DialogHeader>
          <OrganizationOutput content={organizationContent} markdownId={`${markdownId}-expanded`} mode={viewMode} />
        </DialogContent>
      </Dialog>
      <CustomPromptDialog
        initialPrompt={customPrompt}
        open={customPromptOpen}
        onOpenChange={setCustomPromptOpen}
        onSubmit={setCustomPrompt}
      />
    </section>
  )
}

function ViewModeControl({
  mode,
  onModeChange
}: {
  mode: OrganizationViewMode
  onModeChange: (mode: OrganizationViewMode) => void
}) {
  const { t } = useTranslation()

  return (
    <SegmentedControl<OrganizationViewMode>
      size="sm"
      aria-label={t('transcription.markdown_view_mode')}
      value={mode}
      onValueChange={onModeChange}
      options={[
        { value: 'preview', label: t('transcription.preview') },
        { value: 'source', label: t('transcription.source_markdown') }
      ]}
    />
  )
}

function OrganizationOutput({
  content,
  markdownId,
  mode
}: {
  content: string
  markdownId: string
  mode: OrganizationViewMode
}) {
  const { t } = useTranslation()

  if (mode === 'source' || !content) {
    return (
      <Textarea.Input
        aria-label={t('transcription.organization')}
        className="field-sizing-fixed h-full min-h-0 resize-none overflow-y-auto"
        readOnly
        value={content}
      />
    )
  }

  return (
    <div className="min-h-0 overflow-y-auto rounded-md border border-input px-4 py-3">
      <Markdown id={markdownId} plugins={MARKDOWN_PLUGINS} footnoteLabel={t('common.footnotes')}>
        {content}
      </Markdown>
    </div>
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
