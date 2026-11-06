import { Link } from 'wouter'
import { useT } from '../app/i18n.tsx'
import { buttonClass } from '../ui/components/Button.tsx'
import { EmptyState } from '../ui/components/EmptyState.tsx'
import { Screen } from '../ui/shell/Screen.tsx'

export function NotFound() {
  const t = useT()
  return (
    <Screen title={t.shell.notFoundTitle}>
      <EmptyState
        title={t.shell.nothingHere}
        body={t.shell.notFoundBody}
        action={
          <Link href="/" className={buttonClass({ variant: 'primary' })}>
            {t.shell.goToToday}
          </Link>
        }
      />
    </Screen>
  )
}
