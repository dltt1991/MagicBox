import { Button } from '@cherrystudio/ui'
import { useTranslation } from 'react-i18next'

export default function TranscriptionPage() {
  const { t } = useTranslation()

  return (
    <main className="flex h-full flex-col gap-4 p-6">
      <div>
        <h1 className="font-semibold text-xl">{t('title.transcription')}</h1>
        <h2 className="text-muted-foreground text-sm">{t('common.disabled')}</h2>
      </div>
      <div className="flex gap-2">
        <Button disabled>{t('title.transcription')}</Button>
        <Button disabled variant="outline">
          {t('common.select')}
        </Button>
      </div>
    </main>
  )
}
