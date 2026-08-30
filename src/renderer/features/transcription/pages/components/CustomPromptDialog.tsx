import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea
} from '@cherrystudio/ui'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

type CustomPromptDialogProps = {
  initialPrompt: string
  onOpenChange: (open: boolean) => void
  onSubmit: (prompt: string) => void
  open: boolean
}

export function CustomPromptDialog({ initialPrompt, onOpenChange, onSubmit, open }: CustomPromptDialogProps) {
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState(initialPrompt)

  useEffect(() => setPrompt(initialPrompt), [initialPrompt, open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t('transcription.custom_prompt')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="transcription-custom-prompt">{t('transcription.prompt')}</Label>
          <Textarea.Input id="transcription-custom-prompt" value={prompt} rows={6} onValueChange={setPrompt} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!prompt.trim()}
            onClick={() => {
              onSubmit(prompt.trim())
              onOpenChange(false)
            }}>
            {t('transcription.use_prompt')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
