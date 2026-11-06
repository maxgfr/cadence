import { CheckCircle2, ListChecks, Pencil, Trash2, Trophy } from 'lucide-react'
import { useState } from 'react'
import { useLocation, useParams, useSearch } from 'wouter'
import { useData } from '../../app/data.tsx'
import { useT } from '../../app/i18n.tsx'
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
import { formatMeasure, useUnits } from '../../ui/units.ts'
import { NotFound } from '../NotFound.tsx'
import styles from './History.module.css'
import { sessionSummary } from './summary.ts'

export function SessionDetail() {
  const { id } = useParams<{ id: string }>()
  const saved = new URLSearchParams(useSearch()).get('saved') === '1'
  const data = useData()
  const t = useT()
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
      back={{ href: '/progress?view=history', label: t.history.title }}
    >
      {saved && (
        <p className={styles.saved} role="status">
          <CheckCircle2 size={20} strokeWidth={2} aria-hidden="true" />
          {records.some((r) => r.previous !== undefined) ? t.history.savedWithRecords : t.history.saved}
        </p>
      )}
      <dl className={styles.stats}>
        <div>
          <dt>{t.history.done}</dt>
          <dd>{sessionSummary(session, data.index, units).split(' · ')[0]}</dd>
        </div>
        {session.duration !== undefined && (
          <div>
            <dt>{t.history.duration}</dt>
            <dd>{t.history.minutes(session.duration)}</dd>
          </div>
        )}
        {session.rpe !== undefined && (
          <div>
            <dt>{t.history.effort}</dt>
            <dd>RPE {session.rpe}</dd>
          </div>
        )}
        {advanced && adherence !== undefined && (
          <div>
            <dt>{t.history.ofPlan}</dt>
            <dd>{t.progress.percent(Math.round(adherence * 100))}</dd>
          </div>
        )}
      </dl>

      {records.length > 0 && (
        <ListGroup title={t.progress.records}>
          {records.map((r) => {
            const ex = data.index.get(r.exerciseId)
            return (
              <ListRow
                key={r.exerciseId}
                leading={<Trophy size={18} strokeWidth={1.75} />}
                title={ex?.name ?? r.exerciseId}
                subtitle={
                  r.previous !== undefined
                    ? t.history.recordWas(t.labels.measure[r.kind], formatMeasure(r.kind, r.previous, units, ex))
                    : t.history.recordFirst(t.labels.measure[r.kind])
                }
                trailing={<strong>{formatMeasure(r.kind, r.value, units, ex)}</strong>}
                href={`/progress?exercise=${r.exerciseId}`}
              />
            )
          })}
        </ListGroup>
      )}

      <ol className={styles.entries} aria-label={t.common.exercises}>
        {session.entries.map((e) => {
          const ex = data.index.get(e.exerciseId)
          const done = e.sets.filter((s) => s.done).length
          return (
            <li key={e.id} className={styles.entry}>
              <div className={styles.entryHead}>
                <h2 className={styles.entryName}>{ex?.name ?? t.history.unknownExercise}</h2>
                <span className={styles.adh}>
                  {e.planned
                    ? t.history.plannedSets(Math.min(done, e.planned.sets), e.planned.sets)
                    : t.history.sets(done)}
                </span>
              </div>
              {e.planned && (
                <p className={styles.plan}>{t.history.plan(describeBlock(e.planned, ex, units, advanced))}</p>
              )}
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
          {t.history.editDetails}
        </Button>
        <Button
          variant="secondary"
          icon={<ListChecks size={18} strokeWidth={1.75} aria-hidden="true" />}
          onClick={async () => {
            await data.put('sessions', { ...session, status: 'active' })
            navigate(`/log/${session.id}`)
          }}
        >
          {t.history.editSets}
        </Button>
        <Button
          variant="danger"
          icon={<Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />}
          onClick={async () => {
            await data.remove('sessions', session.id)
            navigate('/progress?view=history')
            toast(t.history.sessionDeleted, [{ label: t.history.undo, onClick: () => data.put('sessions', session) }])
          }}
        >
          {t.common.delete}
        </Button>
      </div>
      <p className={styles.plan}>{sessionSummary(session, data.index, units)}</p>
      <Sheet open={editing} title={t.history.editSession} onClose={() => setEditing(false)}>
        {editing && <DetailsForm session={session} onDone={() => setEditing(false)} />}
      </Sheet>
    </Screen>
  )
}

function DetailsForm({ session, onDone }: { session: Session; onDone: () => void }) {
  const data = useData()
  const t = useT()
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
          setError(t.history.pickDate)
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
        toast(t.history.sessionUpdated)
        onDone()
      }}
    >
      <Field label={t.common.name} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
      <Field
        label={t.common.date}
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        {...(error ? { error } : {})}
      />
      <SelectField
        label={t.common.discipline}
        value={discipline}
        options={[
          { value: '', label: t.common.none },
          ...data.disciplines.map((d) => ({ value: d.id, label: d.name })),
        ]}
        onChange={(e) => setDiscipline(e.target.value)}
      />
      <Field
        label={t.common.durationMinutes}
        inputMode="numeric"
        value={duration}
        onChange={(e) => setDuration(e.target.value)}
      />
      <SelectField
        label={t.history.effortRpe}
        value={rpe}
        options={[
          { value: '', label: t.history.notRated },
          ...Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
        ]}
        onChange={(e) => setRpe(e.target.value)}
      />
      <TextArea
        label={t.common.notes}
        rows={3}
        value={notes}
        maxLength={1000}
        onChange={(e) => setNotes(e.target.value)}
      />
      <Button type="submit" variant="primary" size="large" full>
        {t.common.save}
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
  const t = useT()
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
    cols.push({ key: 'r', label: t.common.reps, value: (s) => (s.reps !== undefined ? String(s.reps) : '–') })
  if (metric === 'distance_time' && exercise?.distance === undefined)
    cols.push({
      key: 'd',
      label: t.common.distance,
      value: (s) => (s.distance !== undefined ? formatDistance(s.distance, units.distanceUnit) : '–'),
    })
  if (metric === 'time' || metric === 'distance_time')
    cols.push({ key: 't', label: t.common.time, value: (s) => (s.time !== undefined ? formatTime(s.time) : '–') })
  if (advanced || sets.some((s) => s.rpe !== undefined))
    cols.push({ key: 'e', label: t.common.rpe, value: (s) => (s.rpe !== undefined ? String(s.rpe) : '–') })
  const rows = sets.map((s, i) => ({ s, n: i + 1 }))
  return (
    <table className={styles.sets}>
      <thead>
        <tr>
          <th scope="col">{t.history.set}</th>
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
              {s.done ? '' : <span className="sr-only">{t.history.notDone}</span>}
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
