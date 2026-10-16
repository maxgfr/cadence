import { Link } from 'wouter'
import { buttonClass } from '../ui/components/Button.tsx'
import { EmptyState } from '../ui/components/EmptyState.tsx'
import { Screen } from '../ui/shell/Screen.tsx'

export function NotFound() {
  return (
    <Screen title="Not found">
      <EmptyState
        title="Nothing here"
        body="This page does not exist, or what it showed was deleted."
        action={
          <Link href="/" className={buttonClass({ variant: 'primary' })}>
            Go to Today
          </Link>
        }
      />
    </Screen>
  )
}
