import { Clock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useT } from '../../app/i18n.tsx'
import type { Session } from '../../core/model/schemas.ts'
import { sessionClock } from '../../core/model/sessionProgress.ts'
import styles from './Log.module.css'

/**
 * The time the session has been running, counting up in the top bar. It ticks on its own, so the screen around it
 * does not render every second; a screen reader reads it in minutes when it gets there, and is never told each second.
 */
export function SessionClock({ session }: { session: Pick<Session, 'status' | 'startedAt'> }) {
  const t = useT()
  const [, tick] = useState(0)
  const start = session.status === 'active' && session.startedAt ? Date.parse(session.startedAt) : Number.NaN
  useEffect(() => {
    if (!Number.isFinite(start)) return
    // On each whole second since the start, so the seconds turn over evenly.
    let id: ReturnType<typeof setTimeout>
    const next = () => {
      const since = (((Date.now() - start) % 1000) + 1000) % 1000
      id = setTimeout(() => {
        tick((n) => n + 1)
        next()
      }, 1000 - since)
    }
    next()
    return () => clearTimeout(id)
  }, [start])
  // Read at render: the clock is right the moment the screen opens.
  const clock = sessionClock(session, Date.now())
  if (!clock) return null
  return (
    <p className={styles.clock}>
      <Clock size={14} strokeWidth={2.25} aria-hidden="true" />
      <span className="sr-only">{t.log.elapsed(clock.minutes)}</span>
      <span aria-hidden="true">{clock.text}</span>
    </p>
  )
}
