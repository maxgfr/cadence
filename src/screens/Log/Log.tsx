import { Check, ChevronLeft, Plus, Timer, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'wouter'
import { useData } from '../../app/data.tsx'
import { cameFrom } from '../../app/hashLocation.ts'
import { useToast } from '../../app/toast.tsx'
import { newId } from '../../core/model/ids.ts'
import { describeBlock, emptySet } from '../../core/model/program.ts'
import type { Entry, Exercise, Session, SetLog } from '../../core/model/schemas.ts'
import { formatTime } from '../../core/model/units.ts'
import { Button } from '../../ui/components/Button.tsx'
import { DisciplineTag } from '../../ui/components/Discipline.tsx'
import { EmptyState } from '../../ui/components/EmptyState.tsx'
import { IconButton } from '../../ui/components/IconButton.tsx'
import { cx } from '../../ui/cx.ts'
import { ExercisePicker } from '../../ui/ExercisePicker.tsx'
import { useUnits } from '../../ui/units.ts'
import { FinishSheet } from './FinishSheet.tsx'
import styles from './Log.module.css'
import { RestTimer, useRestTimer } from './RestTimer.tsx'
import { SetRow, setColumns } from './SetRow.tsx'

/**
 * The logging screen: one card per exercise, one row per set, a tick per set done. No clock runs: the rest timer
 * starts only when asked, from an exercise.
 */
export function Log() {
  const { id } = useParams<{ id: string }>()
  const data = useData()
  const [, navigate] = useLocation()
  const stored = data.sessions.find((s) => s.id === id)
  const [session, setSession] = useState<Session | undefined>(stored)
  const [picking, setPicking] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const rest = useRestTimer()
  const advanced = data.settings.mode === 'advanced'
  const units = useUnits()
  const toast = useToast()
  const saving = useRef<Promise<void>>(Promise.resolve())
  const from = cameFrom()

  useEffect(() => {
    if (!session && stored) setSession(stored)
  }, [stored, session])

  const update = useCallback(
    (next: Session) => {
      setSession(next)
      saving.current = saving.current.then(() => data.put('sessions', next))
    },
    [data],
  )

  if (!session) {
    return (
      <main className={styles.log}>
        <EmptyState
          title="Session not found"
          body="It may have been deleted."
          action={<Link href="/">Go to Today</Link>}
        />
      </main>
    )
  }

  const updateEntry = (entryId: string, fn: (e: Entry) => Entry) =>
    update({ ...session, entries: session.entries.map((e) => (e.id === entryId ? fn(e) : e)) })

  const setDone = session.entries.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0)
  const setTotal = session.entries.reduce((n, e) => n + e.sets.length, 0)

  return (
    <main className={styles.log} aria-labelledby="log-title">
      <header className={styles.bar}>
        {/* Back to where the session was opened from (Today, a program, History), or Today. */}
        <a
          href={`#${from ?? '/'}`}
          className={styles.back}
          onClick={(e) => {
            e.preventDefault()
            if (from !== undefined) history.back()
            else navigate('/', { replace: true })
          }}
        >
          <ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />
          {from !== undefined ? 'Back' : 'Today'}
        </a>
        <span className={styles.count}>
          {setDone} of {setTotal} sets
        </span>
        <Button variant="primary" onClick={() => setFinishing(true)}>
          Finish
        </Button>
      </header>

      <div className={styles.head}>
        <h1 id="log-title" className={styles.title}>
          {session.title}
        </h1>
        <p className={styles.sub}>
          <DisciplineTag disciplineId={session.disciplineId} />
        </p>
      </div>

      {session.entries.length === 0 && (
        <EmptyState
          title="Add your first exercise"
          body="Pick from the library; each exercise gets its own sets to tick off."
          level={2}
        />
      )}

      <ol className={styles.entries}>
        {session.entries.map((entry) => {
          const ex = data.index.get(entry.exerciseId)
          return (
            <li key={entry.id}>
              <EntryCard
                entry={entry}
                exercise={ex}
                advanced={advanced}
                plan={entry.planned ? describeBlock(entry.planned, ex, units, advanced) : undefined}
                onChange={(fn) => updateEntry(entry.id, fn)}
                onRemove={() => {
                  const before = session
                  update({ ...session, entries: session.entries.filter((e) => e.id !== entry.id) })
                  toast(`${ex?.name ?? 'Exercise'} removed`, [{ label: 'Undo', onClick: () => update(before) }])
                }}
                rest={entry.planned?.rest ?? data.settings.defaultRest}
                onRest={(seconds) => rest.start(seconds)}
              />
            </li>
          )
        })}
      </ol>

      <Button
        variant="secondary"
        size="large"
        full
        icon={<Plus size={20} strokeWidth={2} aria-hidden="true" />}
        onClick={() => setPicking(true)}
      >
        Add exercise
      </Button>

      <ExercisePicker
        open={picking}
        disciplineId={session.disciplineId}
        onClose={() => setPicking(false)}
        onPick={(ex) => {
          setPicking(false)
          update({
            ...session,
            entries: [...session.entries, { id: newId(), exerciseId: ex.id, sets: [emptySet(ex)] }],
          })
        }}
      />

      <FinishSheet
        open={finishing}
        session={session}
        elapsedMinutes={
          session.startedAt ? Math.round(Math.max(0, Date.now() - Date.parse(session.startedAt)) / 60000) : 0
        }
        onClose={() => setFinishing(false)}
        onSave={async (patch) => {
          const done: Session = { ...session, ...patch, status: 'done' }
          await saving.current
          await data.put('sessions', done)
          rest.stop()
          navigate(`/progress/sessions/${done.id}?saved=1`, { replace: true })
        }}
        onDiscard={async () => {
          await saving.current
          await data.remove('sessions', session.id)
          rest.stop()
          navigate('/', { replace: true })
          toast('Session discarded')
        }}
      />

      <RestTimer timer={rest} />
    </main>
  )
}

interface EntryCardProps {
  entry: Entry
  exercise: Exercise | undefined
  advanced: boolean
  plan: string | undefined
  onChange: (fn: (e: Entry) => Entry) => void
  onRemove: () => void
  /** Seconds of rest for this exercise (its plan's, or the default); 0 for none. */
  rest: number
  onRest: (seconds: number) => void
}

function EntryCard({ entry, exercise, advanced, plan, onChange, onRemove, rest, onRest }: EntryCardProps) {
  const cols = setColumns(exercise, advanced)
  const units = useUnits()
  const allDone = entry.sets.length > 0 && entry.sets.every((s) => s.done)
  const setAt = (i: number, next: SetLog) =>
    onChange((e) => ({ ...e, sets: e.sets.map((s, j) => (j === i ? next : s)) }))
  return (
    <article className={cx(styles.entry, allDone && styles.entryDone)} aria-label={exercise?.name ?? 'Exercise'}>
      <header className={styles.entryHead}>
        <div className={styles.entryText}>
          <h2 className={styles.entryName}>
            {allDone && <Check className={styles.entryCheck} size={18} strokeWidth={2.5} aria-hidden="true" />}
            {exercise?.name ?? 'Unknown exercise'}
          </h2>
          {plan && <p className={styles.plan}>Plan {plan}</p>}
          {entry.planned?.notes && <p className={styles.plan}>{entry.planned.notes}</p>}
        </div>
        <div className={styles.entryTools}>
          {rest > 0 && (
            <Button
              variant="plain"
              icon={<Timer size={18} strokeWidth={1.75} aria-hidden="true" />}
              aria-label={`Rest ${formatTime(rest, false)} after ${exercise?.name ?? 'this exercise'}`}
              onClick={() => onRest(rest)}
            >
              Rest {formatTime(rest, false)}
            </Button>
          )}
          <IconButton icon={Trash2} label={`Remove ${exercise?.name ?? 'exercise'}`} onClick={onRemove} />
        </div>
      </header>
      <div className={styles.table}>
        <div
          className={cx(styles.row, styles.headRow)}
          aria-hidden="true"
          style={{ gridTemplateColumns: cols.template }}
        >
          <span>Set</span>
          {cols.fields.map((f) => (
            <span key={f}>{cols.label(f, units)}</span>
          ))}
          <span />
        </div>
        {entry.sets
          .map((s, i) => ({ s, i, n: i + 1 }))
          .map(({ s, i, n }) => (
            <SetRow
              key={n}
              index={i}
              set={s}
              exercise={exercise}
              columns={cols}
              planned={entry.planned}
              onChange={(next) => setAt(i, next)}
            />
          ))}
      </div>
      <div className={styles.entryActions}>
        <Button
          variant="plain"
          icon={<Plus size={18} strokeWidth={2} aria-hidden="true" />}
          onClick={() => onChange((e) => ({ ...e, sets: [...e.sets, emptySet(exercise, e.sets[e.sets.length - 1])] }))}
        >
          Add set
        </Button>
        {entry.sets.length > 1 && (
          <Button variant="plain" onClick={() => onChange((e) => ({ ...e, sets: e.sets.slice(0, -1) }))}>
            Remove last set
          </Button>
        )}
      </div>
    </article>
  )
}
