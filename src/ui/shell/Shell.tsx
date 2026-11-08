import {
  CalendarCheck,
  ClipboardList,
  Dumbbell,
  type LucideIcon,
  NotebookPen,
  Settings,
  TrendingUp,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'wouter'
import { sectionOf } from '../../app/hashLocation.ts'
import { useT } from '../../app/i18n.tsx'
import type { Messages } from '../../core/i18n/index.ts'
import { cx } from '../cx.ts'
import styles from './Shell.module.css'

interface Destination {
  href: string
  label: keyof Messages['shell']['nav']
  icon: LucideIcon
  /** Shown in the sidebar only (phones reach it from another screen). */
  sidebarOnly?: boolean
}

const DESTINATIONS: readonly Destination[] = [
  { href: '/', label: 'today', icon: CalendarCheck },
  { href: '/programs', label: 'programs', icon: ClipboardList },
  { href: '/progress', label: 'progress', icon: TrendingUp },
  { href: '/exercises', label: 'exercises', icon: Dumbbell },
  { href: '/notes', label: 'notes', icon: NotebookPen, sidebarOnly: true },
  { href: '/settings', label: 'settings', icon: Settings },
]

/** Routes that take the whole screen: logging a session. */
export function isFocusRoute(path: string): boolean {
  return path.startsWith('/log/')
}

export function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation()
  const t = useT()
  const focus = isFocusRoute(location)
  const current = sectionOf(location)
  return (
    <div className={cx(styles.shell, focus && styles.focus)}>
      <a className={styles.skip} href="#main">
        {t.shell.skipToContent}
      </a>
      {!focus && (
        <nav className={styles.nav} aria-label={t.shell.mainNav}>
          <span className={styles.brand}>{t.common.appName}</span>
          <ul className={styles.tabs}>
            {DESTINATIONS.map((d) => {
              const here = current === d.href
              return (
                <li key={d.href} className={cx(d.sidebarOnly && styles.sidebarOnly)}>
                  <Link
                    href={d.href}
                    className={styles.tab}
                    aria-current={here ? (location === d.href ? 'page' : 'true') : undefined}
                  >
                    <d.icon className={styles.tabIcon} size={20} strokeWidth={here ? 2.25 : 1.75} aria-hidden="true" />
                    <span>{t.shell.nav[d.label]}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      )}
      <main id="main" className={styles.main} tabIndex={-1}>
        {children}
      </main>
    </div>
  )
}
