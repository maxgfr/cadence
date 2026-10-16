import { Plus, Target } from 'lucide-react'
import { useState } from 'react'
import { useData } from '../../app/data.tsx'
import { useToast } from '../../app/toast.tsx'
import { addDays, formatDay } from '../../core/model/dates.ts'
import { newId } from '../../core/model/ids.ts'
import type { Discipline, Goal, GoalKind } from '../../core/model/schemas.ts'
import {
  formatTime,
  fromDisplayDistance,
  fromDisplayWeight,
  parseTime,
  toDisplayDistance,
  toDisplayWeight,
} from '../../core/model/units.ts'
import { measureOf } from '../../core/stats/metrics.ts'
import { type GoalProgress, goalProgress } from '../../core/stats/trends.ts'
import { LineChart } from '../../ui/charts/LineChart.tsx'
import { Meter } from '../../ui/charts/Meter.tsx'
import { Button } from '../../ui/components/Button.tsx'
import { EmptyState } from '../../ui/components/EmptyState.tsx'
import { Field } from '../../ui/components/Field.tsx'
import { SelectField } from '../../ui/components/SelectField.tsx'
import { Sheet } from '../../ui/components/Sheet.tsx'
import { useUnits } from '../../ui/units.ts'
import { goalFormatter, goalTitle } from './goalText.ts'
import styles from './Progress.module.css'

/** A goal in one block: what, how far along, and where the trend lands by the deadline. */
export function GoalLine({ goal, progress, onOpen }: { goal: Goal; progress: GoalProgress; onOpen?: () => void }) {
  const { index } = useData()
  const units = useUnits()
  const f = goalFormatter(goal, index, units)
  const title = goalTitle(goal, index, units)
  let status: string
  if (progress.achieved) status = `Reached: ${progress.current !== undefined ? f(progress.current) : ''}`
  else if (progress.current === undefined) status = 'Nothing logged for it yet'
  else if (progress.daysLeft < 0) status = `Deadline passed at ${f(progress.current)}`
  else if (progress.projection)
    status = `${f(progress.current)} now · trend reaches ${f(progress.projection.value)} by the deadline${progress.onTrack ? ', on track' : ''}`
  else status = `${f(progress.current)} now · ${progress.daysLeft} days left`
  const projected =
    progress.projection && progress.start !== undefined && progress.start !== goal.target
      ? progress.lowerIsBetter
        ? (progress.start - progress.projection.value) / (progress.start - goal.target)
        : (progress.projection.value - progress.start) / (goal.target - progress.start)
      : undefined
  const body = (
    <>
      <span className={styles.goalTitle}>{title}</span>
      <Meter
        fraction={progress.fraction}
        {...(projected !== undefined ? { projected: Math.max(0, projected) } : {})}
        label={`${title}: ${Math.round(progress.fraction * 100)}%`}
      />
      <span className={styles.goalStatus}>{status}</span>
    </>
  )
  return onOpen ? (
    <button type="button" className={styles.goal} onClick={onOpen}>
      {body}
    </button>
  ) : (
    <div className={styles.goal}>{body}</div>
  )
}

const KINDS: readonly { value: GoalKind; label: string; advanced?: boolean }[] = [
  { value: 'e1rm', label: 'Lift a heavier max (estimated 1RM)' },
  { value: 'best_time', label: 'Run or swim faster' },
  { value: 'frequency', label: 'Train more often' },
  { value: 'weekly_volume', label: 'Reach a weekly volume', advanced: true },
]

export function GoalsSection({ startOpen }: { startOpen: boolean }) {
  const data = useData()
  const units = useUnits()
  const [editing, setEditing] = useState<Goal | 'new' | null>(startOpen ? 'new' : null)
  const goals = [...data.goals].sort((a, b) => a.deadline.localeCompare(b.deadline))
  return (
    <section className={styles.section} aria-labelledby="goals-title">
      <div className={styles.sectionHead}>
        <h2 id="goals-title" className={styles.sectionTitle}>
          Goals
        </h2>
        {goals.length > 0 && (
          <Button
            variant="plain"
            icon={<Plus size={18} strokeWidth={2} aria-hidden="true" />}
            onClick={() => setEditing('new')}
          >
            Add goal
          </Button>
        )}
      </div>
      {goals.length === 0 ? (
        <EmptyState
          icon={Target}
          level={3}
          title="No goal yet"
          body="A target with a date: a heavier squat, a faster 100 m, three sessions a week. Cadence tracks it and projects where your trend lands."
          action={
            <Button variant="primary" onClick={() => setEditing('new')}>
              Set a goal
            </Button>
          }
        />
      ) : (
        <div className={styles.goals}>
          {goals.map((g) => {
            const p = goalProgress(g, data.sessions, data.index, data.today, data.settings.weekStart)
            return (
              <div key={g.id} className={styles.goalCard}>
                <GoalLine goal={g} progress={p} onOpen={() => setEditing(g)} />
                {data.settings.mode === 'advanced' && p.series.length > 1 && (
                  <LineChart
                    label={goalTitle(g, data.index, units)}
                    points={p.series}
                    format={goalFormatter(g, data.index, units)}
                    target={{ value: g.target, label: 'Target' }}
                    {...(p.projection ? { projection: p.projection } : {})}
                    height={160}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
      <GoalSheet goal={editing} onClose={() => setEditing(null)} />
    </section>
  )
}

function GoalSheet({ goal, onClose }: { goal: Goal | 'new' | null; onClose: () => void }) {
  return (
    <Sheet open={goal !== null} title={goal && goal !== 'new' ? 'Edit goal' : 'New goal'} onClose={onClose}>
      {goal && <GoalForm key={goal === 'new' ? 'new' : goal.id} goal={goal} onClose={onClose} />}
    </Sheet>
  )
}

function GoalForm({ goal, onClose }: { goal: Goal | 'new'; onClose: () => void }) {
  const data = useData()
  const units = useUnits()
  const toast = useToast()
  const advanced = data.settings.mode === 'advanced'
  const existing = goal !== 'new' ? goal : null
  const [kind, setKind] = useState<GoalKind>(existing?.kind ?? 'e1rm')
  const [exerciseId, setExerciseId] = useState(existing ? (existing.exerciseId ?? '') : 'back-squat')
  const [discipline, setDiscipline] = useState<Discipline | ''>(existing?.discipline ?? '')
  const [target, setTarget] = useState(() => (existing ? displayTarget(existing) : ''))
  const [deadline, setDeadline] = useState(existing?.deadline ?? addDays(data.today, 84))
  const [error, setError] = useState<string>()

  function displayTarget(g: Goal): string {
    if (g.kind === 'e1rm') return String(Math.round(toDisplayWeight(g.target, units.weightUnit) * 10) / 10)
    if (g.kind === 'best_time') return formatTime(g.target).replace(' s', '')
    if (g.kind === 'weekly_volume' && (g.discipline === 'swim' || g.discipline === 'run'))
      return String(Math.round(toDisplayDistance(g.target, units.distanceUnit)))
    if (g.kind === 'weekly_volume') return String(Math.round(toDisplayWeight(g.target, units.weightUnit)))
    return String(g.target)
  }

  const lifts = data.exercises.filter((e) => e.metric === 'weight_reps')
  const timed = data.exercises.filter((e) => e.metric === 'distance_time')
  const exerciseOptions = (kind === 'e1rm' ? lifts : timed).map((e) => ({ value: e.id, label: e.name }))
  const timedEx = data.index.get(exerciseId)
  const targetLabel =
    kind === 'e1rm'
      ? `Target (${units.weightUnit})`
      : kind === 'best_time'
        ? timedEx && measureOf(timedEx) === 'pace'
          ? timedEx.discipline === 'run'
            ? 'Target pace per km (m:ss)'
            : 'Target pace per 100 m (m:ss)'
          : 'Target time (seconds or m:ss)'
        : kind === 'frequency'
          ? 'Sessions per week'
          : discipline === 'swim' || discipline === 'run'
            ? `Metres per week (${units.distanceUnit})`
            : `Kilograms lifted per week (${units.weightUnit})`

  function parseTarget(): number | undefined {
    const t = target.trim()
    if (kind === 'best_time') {
      const s = parseTime(t)
      if (s === undefined) return undefined
      return timedEx && measureOf(timedEx) === 'pace' && timedEx.discipline === 'run' ? s / 10 : s
    }
    const v = Number.parseFloat(t.replace(',', '.'))
    if (!Number.isFinite(v) || v <= 0) return undefined
    if (kind === 'e1rm') return fromDisplayWeight(v, units.weightUnit)
    if (kind === 'weekly_volume')
      return discipline === 'swim' || discipline === 'run'
        ? fromDisplayDistance(v, units.distanceUnit)
        : fromDisplayWeight(v, units.weightUnit)
    return v
  }

  return (
    <form
      className={styles.form}
      onSubmit={async (e) => {
        e.preventDefault()
        const value = parseTarget()
        if (value === undefined) {
          setError('Enter a target value.')
          return
        }
        if (deadline <= data.today) {
          setError('Pick a deadline after today.')
          return
        }
        const next: Goal = {
          id: existing?.id ?? newId(),
          kind,
          target: value,
          deadline,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
          ...((kind === 'e1rm' || kind === 'best_time') && exerciseId ? { exerciseId } : {}),
          ...((kind === 'weekly_volume' || kind === 'frequency') && discipline ? { discipline } : {}),
        }
        await data.put('goals', next)
        onClose()
        toast(existing ? 'Goal updated' : 'Goal set')
      }}
    >
      <SelectField
        label="Goal"
        value={kind}
        options={KINDS.filter((k) => advanced || !k.advanced || k.value === kind)}
        onChange={(e) => {
          const k = e.target.value as GoalKind
          setKind(k)
          setTarget('')
          if (k === 'e1rm') setExerciseId('back-squat')
          if (k === 'best_time') setExerciseId('sprint-100')
          if (k === 'weekly_volume' && !discipline) setDiscipline('strength')
        }}
      />
      {(kind === 'e1rm' || kind === 'best_time') && (
        <SelectField
          label="Exercise"
          value={exerciseId}
          options={exerciseOptions}
          onChange={(e) => setExerciseId(e.target.value)}
        />
      )}
      {(kind === 'weekly_volume' || kind === 'frequency') && (
        <SelectField
          label="Discipline"
          value={discipline}
          options={[
            ...(kind === 'frequency' ? [{ value: '', label: 'Any' }] : []),
            { value: 'strength', label: 'Gym' },
            { value: 'swim', label: 'Swim' },
            { value: 'run', label: 'Track' },
          ]}
          onChange={(e) => setDiscipline(e.target.value as Discipline | '')}
        />
      )}
      <Field
        label={targetLabel}
        inputMode="decimal"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        {...(error ? { error } : {})}
      />
      <Field
        label="Deadline"
        type="date"
        value={deadline}
        min={addDays(data.today, 1)}
        onChange={(e) => setDeadline(e.target.value)}
      />
      <p className={styles.formNote}>
        {formatDay(deadline, new Date().getFullYear())}: progress is measured from what you log until then.
      </p>
      <Button type="submit" variant="primary" size="large" full>
        {existing ? 'Save goal' : 'Set goal'}
      </Button>
      {existing && (
        <Button
          variant="danger"
          full
          onClick={async () => {
            await data.remove('goals', existing.id)
            onClose()
            toast('Goal deleted', [{ label: 'Undo', onClick: () => data.put('goals', existing) }])
          }}
        >
          Delete goal
        </Button>
      )}
    </form>
  )
}
