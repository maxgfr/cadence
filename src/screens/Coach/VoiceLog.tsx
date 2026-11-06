import { Mic, Square } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useT } from '../../app/i18n.tsx'
import { canRecord } from '../../app/voice.ts'
import { dropNote, isOffline, keepNote, type PendingNote, pendingNotes } from '../../app/voiceQueue.ts'
import type { CoachInput, CoachProposal } from '../../core/ai/coach.ts'
import { newId } from '../../core/model/ids.ts'
import { Button } from '../../ui/components/Button.tsx'
import { Field } from '../../ui/components/Field.tsx'
import { useUnits } from '../../ui/units.ts'
import styles from './Coach.module.css'
import { setText } from './ProposalCard.tsx'
import { useCoachTurn } from './useCoachSender.ts'
import { useRecorder } from './useRecorder.ts'

type LogProposal = Extract<CoachProposal, { kind: 'log_sets' }>

/**
 * The logging screen's voice: say what was done, check the sets heard, add them. One large button at a time, for a
 * thumb between sets. Offline, the note waits on the device for this session. Loaded only when opened.
 */
export function VoiceLog({
  sessionId,
  onAdd,
}: {
  sessionId: string
  /** Adds the sets to the session (the logging screen owns it). */
  onAdd: (proposals: LogProposal[]) => void
}) {
  const t = useT()
  const s = t.coach.logSheet
  const units = useUnits()
  const { status, turn, fromVoice, describe } = useCoachTurn()
  const [error, setError] = useState<string>()
  const [note, setNote] = useState<string>()
  const [heard, setHeard] = useState<LogProposal[] | null>(null)
  const [typed, setTyped] = useState('')
  const [pending, setPending] = useState<PendingNote[]>([])
  const onError = useCallback((e: unknown) => setError(describe(e)), [describe])
  const recorder = useRecorder(onError)
  const busy = status.kind !== 'idle'

  const refresh = useCallback(() => {
    pendingNotes().then((all) => setPending(all.filter((n) => n.sessionId === sessionId)))
  }, [sessionId])
  useEffect(refresh, [refresh])

  const run = async (input: () => Promise<CoachInput>, blob?: Blob, keptId?: string) => {
    setError(undefined)
    setNote(undefined)
    setHeard(null)
    try {
      const answer = await turn([], await input(), true)
      const logs = answer.proposals.filter((p): p is LogProposal => p.kind === 'log_sets')
      setHeard(logs)
      if (logs.length === 0) setNote(answer.reply || s.nothing)
      if (keptId) await dropNote(keptId)
    } catch (e) {
      if (blob && isOffline(e)) {
        if (!keptId) await keepNote({ id: newId(), blob, createdAt: new Date().toISOString(), sessionId })
        setNote(s.kept)
      } else setError(describe(e))
    } finally {
      refresh()
    }
  }

  const fromBlob = (blob: Blob, keptId?: string) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      if (!keptId)
        keepNote({ id: newId(), blob, createdAt: new Date().toISOString(), sessionId }).then(() => {
          setNote(s.kept)
          refresh()
        })
      return
    }
    run(() => fromVoice(blob), blob, keptId)
  }

  const total = heard?.reduce((n, p) => n + p.sets.length, 0) ?? 0

  return (
    <div className={styles.voiceLog}>
      <p className={styles.lead}>{s.lead}</p>

      {pending.length > 0 && (
        <div className={styles.pending}>
          <p>{t.coach.pending(pending.length)}</p>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              // One note at a time: its sets are checked before the next.
              const [first] = pending
              if (first) fromBlob(first.blob, first.id)
            }}
          >
            {t.coach.sendPending}
          </Button>
        </div>
      )}

      {heard && heard.length > 0 ? (
        <>
          <ul className={styles.heard}>
            {heard.map((p) => (
              <li key={p.id}>
                <strong>{p.exercise.name}</strong>
                <span>{p.sets.map((x) => setText(x, units)).join(' · ')}</span>
                {p.isNew && <span className={styles.cardLine}>{t.coach.proposal.newExercise(p.exercise.name)}</span>}
              </li>
            ))}
          </ul>
          <Button variant="primary" size="large" full onClick={() => onAdd(heard)}>
            {s.add(total)}
          </Button>
          <Button variant="plain" full onClick={() => setHeard(null)}>
            {s.tryAgain}
          </Button>
        </>
      ) : recorder.recording ? (
        <>
          <p className={styles.listening} role="status">
            <span className={styles.dot} aria-hidden="true" />
            {t.coach.listening}
          </p>
          <Button
            variant="primary"
            size="large"
            full
            icon={<Square size={20} strokeWidth={2} aria-hidden="true" />}
            onClick={async () => {
              const blob = await recorder.stop()
              if (blob) fromBlob(blob)
            }}
          >
            {t.coach.stop}
          </Button>
          <Button variant="plain" full onClick={recorder.cancel}>
            {t.coach.cancel}
          </Button>
        </>
      ) : (
        <>
          {canRecord() && (
            <button
              type="button"
              className={styles.bigMic}
              aria-label={t.coach.record}
              disabled={busy}
              onClick={recorder.start}
            >
              <Mic size={36} strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
          <form
            className={styles.typed}
            onSubmit={(e) => {
              e.preventDefault()
              if (typed.trim() && !busy) run(async () => ({ text: typed.trim() }))
            }}
          >
            <Field label={s.typeIt} value={typed} onChange={(e) => setTyped(e.target.value)} />
            <Button type="submit" variant="secondary" disabled={busy || !typed.trim()}>
              {t.coach.send}
            </Button>
          </form>
        </>
      )}

      {busy && (
        <p className={styles.status} role="status">
          <span className={styles.dot} aria-hidden="true" />
          {status.kind === 'thinking'
            ? t.coach.thinking
            : status.ratio !== undefined && status.ratio < 1
              ? t.coach.downloading(Math.round(status.ratio * 100))
              : t.coach.transcribing}
        </p>
      )}
      {note && <p className={styles.lead}>{note}</p>}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
