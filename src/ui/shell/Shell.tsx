import { CalendarCheck, ClipboardList, Dumbbell, History, type LucideIcon, Settings, TrendingUp } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'wouter'
import { cx } from '../cx.ts'
import styles from './Shell.module.css'

interface Destination {
  href: string
  label: string
  icon: LucideIcon
  /** Shown in the sidebar only (phones reach it from Settings). */
  sidebarOnly?: boolean
}

const DESTINATIONS: readonly Destination[] = [
  { href: '/', label: 'Today', icon: CalendarCheck },
  { href: '/history', label: 'History', icon: History },
  { href: '/programs', label: 'Programs', icon: ClipboardList },
  { href: '/progress', label: 'Progress', icon: TrendingUp },
  { href: '/exercises', label: 'Exercises', icon: Dumbbell, sidebarOnly: true },
  { href: '/settings', label: 'Settings', icon: Settings },
]

/** The section a path belongs to ("/programs/abc" → "/programs"). */
function section(path: string): string {
  const first = path.split('/')[1] ?? ''
  return `/${first}`
}

/** Routes that take the whole screen: logging a session. */
export function isFocusRoute(path: string): boolean {
  return path.startsWith('/log/')
}

export function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation()
  const focus = isFocusRoute(location)
  const current = section(location)
  return (
    <div className={cx(styles.shell, focus && styles.focus)}>
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      {!focus && (
        <nav className={styles.nav} aria-label="Main">
          <span className={styles.brand}>Cadence</span>
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
                    <span>{d.label}</span>
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
