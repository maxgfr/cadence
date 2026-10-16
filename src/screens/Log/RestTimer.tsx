import { Minus, Plus, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  const [, tick] = useState(0)
  const buzzed = useRef<number | null>(null)
  useEffect(() => {
    if (timer.endsAt === null) return
    const t = setInterval(() => tick((n) => n + 1), 250)
    return () => clearInterval(t)
  }, [timer.endsAt])
  // Read at render: a rest started a moment ago shows its full length at once.
  const now = Date.now()
  const left = timer.endsAt === null ? 0 : Math.max(0, Math.ceil((timer.endsAt - now) / 1000))
  useEffect(() => {
    if (timer.endsAt !== null && left === 0 && buzzed.current !== timer.endsAt) {
      buzzed.current = timer.endsAt
      navigator.vibrate?.([200, 100, 200])
      const t = setTimeout(timer.stop, 4000)
      return () => clearTimeout(t)
    }
  }, [left, timer.endsAt, timer.stop])
  if (timer.endsAt === null) return null
  const fraction = timer.total > 0 ? left / timer.total : 0
  return (
    <section className={styles.rest} aria-label="Rest timer">
      <div className={styles.restBar} style={{ transform: `scaleX(${fraction})` }} aria-hidden="true" />
      <p className={styles.restText} role="timer" aria-live={left === 0 ? 'assertive' : 'off'}>
        {left === 0 ? 'Rest over, go' : <>Rest {formatTime(left, false)}</>}
      </p>
      <div className={styles.restActions}>
        <button type="button" className={styles.restButton} onClick={() => timer.add(-15)} aria-label="15 seconds less">
          <Minus size={18} strokeWidth={2} aria-hidden="true" />
          15
        </button>
        <button type="button" className={styles.restButton} onClick={() => timer.add(15)} aria-label="15 seconds more">
          <Plus size={18} strokeWidth={2} aria-hidden="true" />
          15
        </button>
        <button type="button" className={styles.restButton} onClick={timer.stop} aria-label="Skip rest">
          <X size={18} strokeWidth={2} aria-hidden="true" />
          Skip
        </button>
      </div>
    </section>
  )
}
