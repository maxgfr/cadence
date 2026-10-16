import { Check, ChevronLeft, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'wouter'
import { useData } from '../../app/data.tsx'
import { useToast } from '../../app/toast.tsx'
import { newId } from '../../core/model/ids.ts'
import { describeBlock, emptySet } from '../../core/model/program.ts'
import type { Entry, Exercise, Session, SetLog } from '../../core/model/schemas.ts'
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

function useElapsed(startedAt: string | undefined): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return startedAt ? Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000)) : 0
}

const clock = (s: number) => {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** The logging screen: one card per exercise, one row per set, a tick per set done, a rest timer between. */
export function Log() {
  const { id } = useParams<{ id: string }>()
  const data = useData()
  const [, navigate] = useLocation()
  const stored = data.sessions.find((s) => s.id === id)
  const [session, setSession] = useState<Session | undefined>(stored)
  const [picking, setPicking] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const rest = useRestTimer()
  const elapsed = useElapsed(session?.startedAt)
  const advanced = data.settings.mode === 'advanced'
  const units = useUnits()
  const toast = useToast()
  const saving = useRef<Promise<void>>(Promise.resolve())

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
        <Link href="/" className={styles.back}>
          <ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />
          Today
        </Link>
        <span className={styles.clock} role="timer" aria-label={`Elapsed ${clock(elapsed)}`}>
          {clock(elapsed)}
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
          <span aria-hidden="true">·</span>
          <span>
            {setDone} of {setTotal} sets
          </span>
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
                onSetDone={(done) => {
                  if (done) rest.start(entry.planned?.rest ?? data.settings.defaultRest)
                }}
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
        elapsedMinutes={Math.round(elapsed / 60)}
        onClose={() => setFinishing(false)}
        onSave={async (patch) => {
          const done: Session = { ...session, ...patch, status: 'done' }
          await saving.current
          await data.put('sessions', done)
          rest.stop()
          navigate(`/history/${done.id}?saved=1`)
        }}
        onDiscard={async () => {
          await saving.current
          await data.remove('sessions', session.id)
          rest.stop()
          navigate('/')
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
  onSetDone: (done: boolean) => void
}

function EntryCard({ entry, exercise, advanced, plan, onChange, onRemove, onSetDone }: EntryCardProps) {
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
        <IconButton icon={Trash2} label={`Remove ${exercise?.name ?? 'exercise'}`} onClick={onRemove} />
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
              onChange={(next) => {
                setAt(i, next)
                if (next.done !== s.done) onSetDone(next.done)
              }}
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
