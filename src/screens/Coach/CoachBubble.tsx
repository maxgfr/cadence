import { MessageCircle } from 'lucide-react'
import { Suspense, useEffect, useState } from 'react'
import { Redirect, useLocation } from 'wouter'
import { useAi } from '../../app/ai.tsx'
import { useCoach } from '../../app/coach.tsx'
import { useT } from '../../app/i18n.tsx'
import { lazyChunk } from '../../app/lazyChunk.tsx'
import { isFocusRoute } from '../../ui/shell/Shell.tsx'
import styles from './CoachBubble.module.css'

// The conversation carries the AI code: loaded when it is first shown.
const CoachSheet = lazyChunk(() => import('./CoachSheet.tsx').then((m) => m.CoachSheet))
const CoachDock = lazyChunk(() => import('./CoachSheet.tsx').then((m) => m.CoachDock))

/** A computer's screen: room for the app and the coach side by side. */
const DOCKED = '(min-width: 1200px)'

function useDocked(): boolean {
  const [query] = useState(() => (typeof matchMedia === 'undefined' ? undefined : matchMedia(DOCKED)))
  const [docked, setDocked] = useState(query?.matches ?? false)
  useEffect(() => {
    if (!query) return
    const on = () => setDocked(query.matches)
    query.addEventListener('change', on)
    return () => query.removeEventListener('change', on)
  }, [query])
  return docked
}

/**
 * The one way to the coach, once AI is set up. On a computer it is always there, a column beside the app. On phones
 * and tablets it is a round button in the corner, above the tab bar (and above the rest timer), that opens the
 * conversation over the screen. Either way the screen tells the coach where the athlete is.
 */
export function CoachBubble() {
  const ai = useAi()
  const coach = useCoach()
  const t = useT()
  const [location] = useLocation()
  const [loaded, setLoaded] = useState(false)
  const docked = useDocked() && ai.ready

  // The app's screens make room for the column.
  useEffect(() => {
    const root = document.documentElement
    if (docked) root.dataset.coachDock = ''
    else delete root.dataset.coachDock
    return () => {
      delete root.dataset.coachDock
    }
  }, [docked])

  if (!ai.ready) return null
  if (docked)
    return (
      <Suspense fallback={null}>
        <CoachDock />
      </Suspense>
    )
  return (
    <>
      <div className={styles.spacer} aria-hidden="true" />
      <button
        type="button"
        className={styles.bubble}
        data-focus={isFocusRoute(location) || undefined}
        data-raised={coach.screen?.raised || undefined}
        aria-label={t.coach.open}
        aria-haspopup="dialog"
        hidden={coach.open}
        onClick={() => {
          setLoaded(true)
          coach.show()
        }}
      >
        <MessageCircle size={24} strokeWidth={2} aria-hidden="true" />
      </button>
      {(loaded || coach.open) && (
        <Suspense fallback={null}>
          <CoachSheet />
        </Suspense>
      )}
    </>
  )
}

/** An older link to the coach: Today, with the coach open over it. */
export function OpenCoach() {
  const { show } = useCoach()
  useEffect(() => show(), [show])
  return <Redirect to="/" replace />
}
