import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useLocation } from 'wouter'
import { cameFrom, sectionOf } from '../../app/hashLocation.ts'
import styles from './Screen.module.css'

export interface ScreenProps {
  title: string
  /** Shown under the title for context (a date, a count). */
  subtitle?: ReactNode
  trailing?: ReactNode
  /**
   * Route of the parent screen. The back link goes back to the screen this one was opened from when that is in the
   * same tab, to the parent when the screen was opened from outside the app, and is not shown when the screen was
   * opened from another tab: going back never changes tab.
   */
  back?: { href: string; label: string }
  children?: ReactNode
}

function BackLink({ href, label }: { href: string; label: string }) {
  const [here, navigate] = useLocation()
  const from = cameFrom()
  const tab = sectionOf(here)
  let go: () => void
  let text = label
  if (from !== undefined) {
    if (sectionOf(from) !== tab || from.split('?')[0] === here) return null
    go = () => history.back()
    if (from !== href) text = 'Back'
  } else {
    if (sectionOf(href) !== tab) return null
    go = () => navigate(href, { replace: true })
  }
  return (
    <div className={styles.bar}>
      <a
        href={`#${from ?? href}`}
        className={styles.back}
        onClick={(e) => {
          e.preventDefault()
          go()
        }}
      >
        <ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />
        {text}
      </a>
    </div>
  )
}

/** Standard screen: large title, optional context line and trailing control, content capped near 720px. */
export function Screen({ title, subtitle, trailing, back, children }: ScreenProps) {
  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        {back && <BackLink href={back.href} label={back.label} />}
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{title}</h1>
          {trailing && <div className={styles.trailing}>{trailing}</div>}
        </div>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </header>
      <div className={styles.body}>{children}</div>
    </div>
  )
}
