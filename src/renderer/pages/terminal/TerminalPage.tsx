import { EmptyState } from '@cherrystudio/ui'
import { useTranslation } from 'react-i18next'

export default function TerminalPage() {
  const { t } = useTranslation()

  return (
    <main className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <EmptyState title={t('terminal.title')} />
    </main>
  )
}
