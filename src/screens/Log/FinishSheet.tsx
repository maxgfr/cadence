import { useEffect, useState } from 'react'
import { useT } from '../../app/i18n.tsx'
import type { Session } from '../../core/model/schemas.ts'
import { Button } from '../../ui/components/Button.tsx'
import { Field } from '../../ui/components/Field.tsx'
import { Sheet } from '../../ui/components/Sheet.tsx'
import { TextArea } from '../../ui/components/TextArea.tsx'
import { cx } from '../../ui/cx.ts'
import styles from './Log.module.css'

interface FinishSheetProps {
  open: boolean
  session: Session
  elapsedMinutes: number
  onClose: () => void
  onSave: (patch: Pick<Session, 'duration' | 'rpe' | 'notes'>) => Promise<void>
  onDiscard: () => Promise<void>
}

/** End of session: how long, how hard, anything to remember. */
export function FinishSheet({ open, session, elapsedMinutes, onClose, onSave, onDiscard }: FinishSheetProps) {
  const t = useT()
  const hints: Readonly<Record<number, string>> = t.log.rpeHint
  const [duration, setDuration] = useState('')
  const [rpe, setRpe] = useState<number | undefined>(session.rpe)
  const [notes, setNotes] = useState(session.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  useEffect(() => {
    if (open) {
      // A session left open for hours was most likely forgotten: no guess past four hours.
      setDuration(String(session.duration ?? (elapsedMinutes > 0 && elapsedMinutes <= 240 ? elapsedMinutes : '')))
      setConfirmDiscard(false)
    }
  }, [open, session.duration, elapsedMinutes])

  const doneSets = session.entries.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0)
  const minutes = Number.parseInt(duration, 10)

  return (
    <Sheet open={open} title={t.log.finishTitle} onClose={onClose}>
      <form
        className={styles.finish}
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          try {
            await onSave({
              ...(Number.isFinite(minutes) && minutes > 0 ? { duration: minutes } : {}),
              ...(rpe !== undefined ? { rpe } : {}),
              ...(notes.trim() ? { notes: notes.trim() } : {}),
            })
          } finally {
            setBusy(false)
          }
        }}
      >
        <p className={styles.finishSummary}>{doneSets === 0 ? t.log.noneTicked : t.log.setsDone(doneSets)}</p>
        <Field
          label={t.common.durationMinutes}
          inputMode="numeric"
          value={duration}
          onChange={(e) => setDuration(e.target.value.replace(/[^\d]/g, ''))}
        />
        <fieldset className={styles.rpe}>
          <legend className={styles.rpeLegend}>
            {t.log.howHard}{' '}
            <span className={styles.rpeValue}>
              {rpe ? t.log.rpeValue(rpe, hints[rpe] ?? hints[rpe - 1] ?? '') : t.log.optional}
            </span>
          </legend>
          <div className={styles.rpeScale}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
              <button
                key={v}
                type="button"
                className={cx(styles.rpeButton, rpe === v && styles.rpeOn)}
                aria-pressed={rpe === v}
                aria-label={t.log.rpeOption(v, hints[v] ?? '')}
                onClick={() => setRpe(rpe === v ? undefined : v)}
              >
                {v}
              </button>
            ))}
          </div>
        </fieldset>
        <TextArea
          label={t.common.notes}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={1000}
          rows={3}
        />
        <Button type="submit" variant="primary" size="large" full loading={busy}>
          {t.log.saveSession}
        </Button>
        {confirmDiscard ? (
          <div className={styles.discard}>
            <p>{t.log.confirmDelete}</p>
            <Button variant="danger" onClick={onDiscard}>
              {t.log.deleteSession}
            </Button>
            <Button variant="plain" onClick={() => setConfirmDiscard(false)}>
              {t.log.keepIt}
            </Button>
          </div>
        ) : (
          <Button variant="plain" full onClick={() => setConfirmDiscard(true)}>
            {t.log.discardSession}
          </Button>
        )}
      </form>
    </Sheet>
  )
}
