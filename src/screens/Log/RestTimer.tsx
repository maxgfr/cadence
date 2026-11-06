import { Minus, Plus, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../../app/i18n.tsx'
import { formatTime } from '../../core/model/units.ts'
import styles from './Log.module.css'

export interface RestTimerState {
  /** When the rest ends (ms since epoch), or null when no rest is running. */
  endsAt: number | null
  total: number
  start(seconds: number): void
  add(seconds: number): void
  stop(): void
}

export function useRestTimer(): RestTimerState {
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [total, setTotal] = useState(0)
  const start = useCallback((seconds: number) => {
    if (seconds <= 0) return
    setTotal(seconds)
    setEndsAt(Date.now() + seconds * 1000)
  }, [])
  const add = useCallback((seconds: number) => {
    setEndsAt((e) => (e === null ? e : Math.max(Date.now() + 1000, e + seconds * 1000)))
    setTotal((t) => Math.max(1, t + seconds))
  }, [])
  const stop = useCallback(() => setEndsAt(null), [])
  return useMemo(() => ({ endsAt, total, start, add, stop }), [endsAt, total, start, add, stop])
}

/** The rest between sets: a bar pinned to the bottom, counting down, with a buzz when it ends. */
export function RestTimer({ timer }: { timer: RestTimerState }) {
  const t = useT()
  const [, tick] = useState(0)
  const buzzed = useRef<number | null>(null)
  useEffect(() => {
    if (timer.endsAt === null) return
    const id = setInterval(() => tick((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [timer.endsAt])
  // Read at render: a rest started a moment ago shows its full length at once.
  const now = Date.now()
  const left = timer.endsAt === null ? 0 : Math.max(0, Math.ceil((timer.endsAt - now) / 1000))
  useEffect(() => {
    if (timer.endsAt !== null && left === 0 && buzzed.current !== timer.endsAt) {
      buzzed.current = timer.endsAt
      navigator.vibrate?.([200, 100, 200])
      const id = setTimeout(timer.stop, 4000)
      return () => clearTimeout(id)
    }
  }, [left, timer.endsAt, timer.stop])
  if (timer.endsAt === null) return null
  const fraction = timer.total > 0 ? left / timer.total : 0
  return (
    <section className={styles.rest} aria-label={t.log.restTimer}>
      <div className={styles.restBar} style={{ transform: `scaleX(${fraction})` }} aria-hidden="true" />
      <p className={styles.restText} role="timer" aria-live={left === 0 ? 'assertive' : 'off'}>
        {left === 0 ? t.log.restOver : t.log.rest(formatTime(left, false))}
      </p>
      <div className={styles.restActions}>
        <button
          type="button"
          className={styles.restButton}
          onClick={() => timer.add(-15)}
          aria-label={t.log.secondsLess(15)}
        >
          <Minus size={18} strokeWidth={2} aria-hidden="true" />
          15
        </button>
        <button
          type="button"
          className={styles.restButton}
          onClick={() => timer.add(15)}
          aria-label={t.log.secondsMore(15)}
        >
          <Plus size={18} strokeWidth={2} aria-hidden="true" />
          15
        </button>
        <button type="button" className={styles.restButton} onClick={timer.stop} aria-label={t.log.skipRest}>
          <X size={18} strokeWidth={2} aria-hidden="true" />
          {t.log.skip}
        </button>
      </div>
    </section>
  )
}
