import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'wouter'
import styles from './Screen.module.css'

export interface ScreenProps {
  title: string
  /** Shown under the title for context (a date, a count). */
  subtitle?: ReactNode
  trailing?: ReactNode
  /** Route of the parent screen: shows a back link. */
  back?: { href: string; label: string }
  children?: ReactNode
}

/** Standard screen: large title, optional context line and trailing control, content capped near 720px. */
export function Screen({ title, subtitle, trailing, back, children }: ScreenProps) {
  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        {back && (
          <div className={styles.bar}>
            <Link href={back.href} className={styles.back}>
              <ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />
              {back.label}
            </Link>
          </div>
        )}
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
