import { CheckCircle2, ListChecks, Pencil, Trash2, Trophy } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useParams, useSearch } from 'wouter'
import { useData } from '../../app/data.tsx'
import { useToast } from '../../app/toast.tsx'
import { formatDay } from '../../core/model/dates.ts'
import { describeBlock } from '../../core/model/program.ts'
import type { Exercise, Session, SetLog } from '../../core/model/schemas.ts'
import { formatDistance, formatTime, formatWeight } from '../../core/model/units.ts'
import { recordsOf } from '../../core/stats/records.ts'
import { sessionAdherence } from '../../core/stats/trends.ts'
import { Button } from '../../ui/components/Button.tsx'
import { DisciplineTag } from '../../ui/components/Discipline.tsx'
import { Field } from '../../ui/components/Field.tsx'
import { ListGroup, ListRow } from '../../ui/components/List.tsx'
import { SelectField } from '../../ui/components/SelectField.tsx'
import { Sheet } from '../../ui/components/Sheet.tsx'
import { TextArea } from '../../ui/components/TextArea.tsx'
import { Screen } from '../../ui/shell/Screen.tsx'
import { formatMeasure, MEASURE_LABEL, useUnits } from '../../ui/units.ts'
import { NotFound } from '../NotFound.tsx'
import styles from './History.module.css'
import { sessionSummary } from './summary.ts'

export function SessionDetail() {
  const { id } = useParams<{ id: string }>()
  const saved = new URLSearchParams(useSearch()).get('saved') === '1'
  const data = useData()
  const units = useUnits()
  const toast = useToast()
  const [, navigate] = useLocation()
  const [editing, setEditing] = useState(false)
  const session = data.sessions.find((s) => s.id === id)
  if (!session) return <NotFound />
  const advanced = data.settings.mode === 'advanced'
  const records = recordsOf(session.id, data.sessions, data.index)
  const adherence = sessionAdherence(session)
  const year = new Date().getFullYear()

  return (
    <Screen
      title={session.title}
      subtitle={
        <>
          {formatDay(session.date, year)} · <DisciplineTag disciplineId={session.disciplineId} />
        </>
      }
      back={{ href: '/progress?view=history', label: 'History' }}
    >
      {saved && (
        <p className={styles.saved} role="status">
          <CheckCircle2 size={20} strokeWidth={2} aria-hidden="true" />
          Session saved{records.filter((r) => r.previous !== undefined).length > 0 ? ' with new records' : ''}.
        </p>
      )}
      <dl className={styles.stats}>
        <div>
          <dt>Done</dt>
          <dd>{sessionSummary(session, data.index, units).split(' · ')[0]}</dd>
        </div>
        {session.duration !== undefined && (
          <div>
            <dt>Duration</dt>
            <dd>{session.duration} min</dd>
          </div>
        )}
        {session.rpe !== undefined && (
          <div>
            <dt>Effort</dt>
            <dd>RPE {session.rpe}</dd>
          </div>
        )}
        {advanced && adherence !== undefined && (
          <div>
            <dt>Of the plan</dt>
            <dd>{Math.round(adherence * 100)}%</dd>
          </div>
        )}
      </dl>

      {records.length > 0 && (
        <ListGroup title="Records">
          {records.map((r) => {
            const ex = data.index.get(r.exerciseId)
            return (
              <ListRow
                key={r.exerciseId}
                leading={<Trophy size={18} strokeWidth={1.75} />}
                title={ex?.name ?? r.exerciseId}
                subtitle={
                  r.previous !== undefined
                    ? `${MEASURE_LABEL[r.kind]}, was ${formatMeasure(r.kind, r.previous, units, ex)}`
                    : `${MEASURE_LABEL[r.kind]}, first one logged`
                }
                trailing={<strong>{formatMeasure(r.kind, r.value, units, ex)}</strong>}
                href={`/progress?exercise=${r.exerciseId}`}
              />
            )
          })}
        </ListGroup>
      )}

      <ol className={styles.entries} aria-label="Exercises">
        {session.entries.map((e) => {
          const ex = data.index.get(e.exerciseId)
          const done = e.sets.filter((s) => s.done).length
          return (
            <li key={e.id} className={styles.entry}>
              <div className={styles.entryHead}>
                <h2 className={styles.entryName}>{ex?.name ?? 'Unknown exercise'}</h2>
                <span className={styles.adh}>
                  {e.planned
                    ? `${Math.min(done, e.planned.sets)} of ${e.planned.sets} planned sets`
                    : `${done} ${done === 1 ? 'set' : 'sets'}`}
                </span>
              </div>
              {e.planned && <p className={styles.plan}>Plan {describeBlock(e.planned, ex, units, advanced)}</p>}
              <SetsTable sets={e.sets} exercise={ex} advanced={advanced} />
            </li>
          )
        })}
      </ol>

      {session.notes && <p className={styles.notes}>{session.notes}</p>}

      <div className={styles.actions}>
        <Button
          variant="secondary"
          icon={<Pencil size={18} strokeWidth={1.75} aria-hidden="true" />}
          onClick={() => setEditing(true)}
        >
          Edit details
        </Button>
        <Button
          variant="secondary"
          icon={<ListChecks size={18} strokeWidth={1.75} aria-hidden="true" />}
          onClick={async () => {
            await data.put('sessions', { ...session, status: 'active' })
            navigate(`/log/${session.id}`)
          }}
        >
          Edit sets
        </Button>
        <Button
          variant="danger"
          icon={<Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />}
          onClick={async () => {
            await data.remove('sessions', session.id)
            navigate('/progress?view=history')
            toast('Session deleted', [{ label: 'Undo', onClick: () => data.put('sessions', session) }])
          }}
        >
          Delete
        </Button>
      </div>
      <p className={styles.plan}>{sessionSummary(session, data.index, units)}</p>
      <Sheet open={editing} title="Edit session" onClose={() => setEditing(false)}>
        {editing && <DetailsForm session={session} onDone={() => setEditing(false)} />}
      </Sheet>
    </Screen>
  )
}

function DetailsForm({ session, onDone }: { session: Session; onDone: () => void }) {
  const data = useData()
  const toast = useToast()
  const [title, setTitle] = useState(session.title)
  const [date, setDate] = useState(session.date)
  const [discipline, setDiscipline] = useState(session.disciplineId ?? '')
  const [duration, setDuration] = useState(session.duration !== undefined ? String(session.duration) : '')
  const [rpe, setRpe] = useState(session.rpe !== undefined ? String(session.rpe) : '')
  const [notes, setNotes] = useState(session.notes ?? '')
  const [error, setError] = useState<string>()
  return (
    <form
      className={styles.form}
      onSubmit={async (e) => {
        e.preventDefault()
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          setError('Pick a date.')
          return
        }
        const minutes = Number.parseInt(duration, 10)
        const { disciplineId: _d, duration: _m, rpe: _r, notes: _n, ...rest } = session
        await data.put('sessions', {
          ...rest,
          title: title.trim().slice(0, 80) || session.title,
          date,
          ...(discipline ? { disciplineId: discipline } : {}),
          ...(Number.isFinite(minutes) && minutes > 0 ? { duration: minutes } : {}),
          ...(rpe ? { rpe: Number(rpe) } : {}),
          ...(notes.trim() ? { notes: notes.trim().slice(0, 1000) } : {}),
        })
        toast('Session updated')
        onDone()
      }}
    >
      <Field label="Name" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
      <Field
        label="Date"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        {...(error ? { error } : {})}
      />
      <SelectField
        label="Discipline"
        value={discipline}
        options={[{ value: '', label: 'None' }, ...data.disciplines.map((d) => ({ value: d.id, label: d.name }))]}
        onChange={(e) => setDiscipline(e.target.value)}
      />
      <Field
        label="Duration (minutes)"
        inputMode="numeric"
        value={duration}
        onChange={(e) => setDuration(e.target.value)}
      />
      <SelectField
        label="Effort (RPE)"
        value={rpe}
        options={[
          { value: '', label: 'Not rated' },
          ...Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
        ]}
        onChange={(e) => setRpe(e.target.value)}
      />
      <TextArea label="Notes" rows={3} value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
      <Button type="submit" variant="primary" size="large" full>
        Save
      </Button>
    </form>
  )
}

function SetsTable({
  sets,
  exercise,
  advanced,
}: {
  sets: SetLog[]
  exercise: Exercise | undefined
  advanced: boolean
}) {
  const units = useUnits()
  const metric = exercise?.metric ?? 'weight_reps'
  const cols: { key: string; label: string; value: (s: SetLog) => string }[] = []
  if (metric === 'weight_reps')
    cols.push({
      key: 'w',
      label: units.weightUnit,
      value: (s) => (s.weight !== undefined ? formatWeight(s.weight, units.weightUnit, false) : '–'),
    })
  if (metric === 'weight_reps' || metric === 'reps')
    cols.push({ key: 'r', label: 'Reps', value: (s) => (s.reps !== undefined ? String(s.reps) : '–') })
  if (metric === 'distance_time' && exercise?.distance === undefined)
    cols.push({
      key: 'd',
      label: 'Distance',
      value: (s) => (s.distance !== undefined ? formatDistance(s.distance, units.distanceUnit) : '–'),
    })
  if (metric === 'time' || metric === 'distance_time')
    cols.push({ key: 't', label: 'Time', value: (s) => (s.time !== undefined ? formatTime(s.time) : '–') })
  if (advanced || sets.some((s) => s.rpe !== undefined))
    cols.push({ key: 'e', label: 'RPE', value: (s) => (s.rpe !== undefined ? String(s.rpe) : '–') })
  const rows = sets.map((s, i) => ({ s, n: i + 1 }))
  return (
    <table className={styles.sets}>
      <thead>
        <tr>
          <th scope="col">Set</th>
          {cols.map((c) => (
            <th key={c.key} scope="col">
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(({ s, n }) => (
          <tr key={n} className={s.done ? undefined : styles.skipped}>
            <td>
              {n}
              {s.done ? '' : <span className="sr-only"> (not done)</span>}
            </td>
            {cols.map((c) => (
              <td key={c.key}>{c.value(s)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
