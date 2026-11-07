import { MessageCircle, Mic } from 'lucide-react'
import { Suspense, useEffect, useState } from 'react'
import { Redirect, useLocation } from 'wouter'
import { useAi } from '../../app/ai.tsx'
import { useCoach } from '../../app/coach.tsx'
import { useT } from '../../app/i18n.tsx'
import { lazyChunk } from '../../app/lazyChunk.tsx'
import { isFocusRoute } from '../../ui/shell/Shell.tsx'
import styles from './CoachBubble.module.css'

// The conversation carries the AI code: loaded the first time the bubble opens it.
const CoachSheet = lazyChunk(() => import('./CoachSheet.tsx').then((m) => m.CoachSheet))

const canRecord = () => typeof MediaRecorder !== 'undefined'

/**
 * The one way to the coach, on every screen once AI is set up: a round button in the corner, above the tab bar (and
 * above the rest timer). It opens the conversation over the screen, which tells the coach where the athlete is; on
 * the logging screen it is a microphone and records as it opens.
 */
export function CoachBubble() {
  const ai = useAi()
  const coach = useCoach()
  const t = useT()
  const [location] = useLocation()
  const [loaded, setLoaded] = useState(false)
  const voice = coach.screen?.voiceFirst === true && canRecord()

  if (!ai.ready) return null
  return (
    <>
      <div className={styles.spacer} aria-hidden="true" />
      <button
        type="button"
        className={styles.bubble}
        data-focus={isFocusRoute(location) || undefined}
        data-raised={coach.screen?.raised || undefined}
        aria-label={voice ? t.coach.speak : t.coach.open}
        aria-haspopup="dialog"
        hidden={coach.open}
        onClick={() => {
          setLoaded(true)
          coach.show({ record: voice })
        }}
      >
        {voice ? (
          <Mic size={24} strokeWidth={2} aria-hidden="true" />
        ) : (
          <MessageCircle size={24} strokeWidth={2} aria-hidden="true" />
        )}
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
