import { Plus, Target } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useLocation, useSearch } from 'wouter'
import { useData } from '../../app/data.tsx'
import { useToast } from '../../app/toast.tsx'
import { addDays, formatDay } from '../../core/model/dates.ts'
import { newId } from '../../core/model/ids.ts'
import type { Exercise, Goal, GoalKind } from '../../core/model/schemas.ts'
import {
  formatTime,
  fromDisplayDistance,
  fromDisplayWeight,
  parseTime,
  toDisplayDistance,
  toDisplayWeight,
} from '../../core/model/units.ts'
import { measureOf, trainedExercises } from '../../core/stats/metrics.ts'
import { type GoalProgress, goalBaseline, goalProgress } from '../../core/stats/trends.ts'
import { LineChart } from '../../ui/charts/LineChart.tsx'
import { Meter } from '../../ui/charts/Meter.tsx'
import { Button } from '../../ui/components/Button.tsx'
import { EmptyState } from '../../ui/components/EmptyState.tsx'
import { Field } from '../../ui/components/Field.tsx'
import { Segmented } from '../../ui/components/Segmented.tsx'
import { SelectField } from '../../ui/components/SelectField.tsx'
import { Sheet } from '../../ui/components/Sheet.tsx'
import { useUnits } from '../../ui/units.ts'
import { goalFormatter, goalTitle } from './goalText.ts'
import styles from './Progress.module.css'

/** A goal in one block: what, how far along, and where the trend lands by the deadline. */
export function GoalLine({ goal, progress, onOpen }: { goal: Goal; progress: GoalProgress; onOpen?: () => void }) {
  const { index, disciplineIndex } = useData()
  const units = useUnits()
  const f = goalFormatter(goal, index, units)
  const title = goalTitle(goal, index, units, (id) => (id ? disciplineIndex.get(id)?.name : undefined))
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

/** A goal to start from a link: `?goal=new`, with `&exercise=<id>` to set it on that exercise. */
function presetFrom(search: string, index: ReturnType<typeof useData>['index']): Preset | undefined {
  const params = new URLSearchParams(search)
  if (params.get('goal') !== 'new') return undefined
  const ex = index.get(params.get('exercise') ?? '')
  if (ex?.metric === 'weight_reps') return { kind: 'e1rm', exerciseId: ex.id }
  if (ex?.metric === 'distance_time') return { kind: 'best_time', exerciseId: ex.id }
  return {}
}

interface Preset {
  kind?: GoalKind
  exerciseId?: string
}

export function GoalsSection() {
  const data = useData()
  const units = useUnits()
  const search = useSearch()
  const [location, navigate] = useLocation()
  const fromLink = presetFrom(search, data.index)
  const [editing, setEditing] = useState<Goal | 'new' | null>(null)
  const open = fromLink ? 'new' : editing
  const close = () => {
    setEditing(null)
    // Leave the link's request behind, so closing does not reopen it.
    if (fromLink) navigate(location, { replace: true })
  }
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
                    label={goalTitle(g, data.index, units, (id) =>
                      id ? data.disciplineIndex.get(id)?.name : undefined,
                    )}
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
      <GoalSheet goal={open} preset={fromLink} onClose={close} />
    </section>
  )
}

function GoalSheet({
  goal,
  preset,
  onClose,
}: {
  goal: Goal | 'new' | null
  preset: Preset | undefined
  onClose: () => void
}) {
  return (
    <Sheet open={goal !== null} title={goal && goal !== 'new' ? 'Edit goal' : 'New goal'} onClose={onClose}>
      {goal && (
        <GoalForm
          key={goal === 'new' ? `new-${preset?.exerciseId ?? ''}` : goal.id}
          goal={goal}
          preset={preset}
          onClose={onClose}
        />
      )}
    </Sheet>
  )
}

function GoalForm({ goal, preset, onClose }: { goal: Goal | 'new'; preset: Preset | undefined; onClose: () => void }) {
  const data = useData()
  const units = useUnits()
  const toast = useToast()
  const advanced = data.settings.mode === 'advanced'
  const existing = goal !== 'new' ? goal : null
  // Exercises with logged sessions come first: a goal starts from where you are.
  const trained = useMemo(() => trainedExercises(data.sessions, data.index), [data.sessions, data.index])
  const byData = (metric: Exercise['metric']) => [
    ...trained.filter((e) => e.metric === metric),
    ...data.exercises.filter((e) => e.metric === metric && !trained.includes(e)),
  ]
  const lifts = byData('weight_reps')
  const timed = byData('distance_time')
  const [kind, setKind] = useState<GoalKind>(
    existing?.kind ?? preset?.kind ?? (lifts.length > 0 ? 'e1rm' : 'frequency'),
  )
  const [exerciseId, setExerciseId] = useState(
    existing
      ? (existing.exerciseId ?? '')
      : (preset?.exerciseId ?? (kind === 'best_time' ? timed : lifts)[0]?.id ?? ''),
  )
  const [discipline, setDiscipline] = useState(existing?.disciplineId ?? '')
  const [volume, setVolume] = useState<'tonnage' | 'distance'>(existing?.volume ?? 'tonnage')
  // null until typed: the suggestion fills the field.
  const [typed, setTyped] = useState<string | null>(() => (existing ? displayValue(existing.target) : null))
  const [deadline, setDeadline] = useState(existing?.deadline ?? addDays(data.today, 84))
  const [error, setError] = useState<string>()
  const scope = {
    ...((kind === 'e1rm' || kind === 'best_time') && exerciseId ? { exerciseId } : {}),
    ...((kind === 'weekly_volume' || kind === 'frequency') && discipline ? { disciplineId: discipline } : {}),
    ...(kind === 'weekly_volume' ? { volume } : {}),
  }
  const baseline = goalBaseline(
    { kind, deadline: deadline > data.today ? deadline : addDays(data.today, 1), ...scope },
    data.sessions,
    data.index,
    data.today,
    data.settings.weekStart,
  )
  const f = goalFormatter({ id: '', kind, target: 1, deadline, createdAt: '', ...scope }, data.index, units)
  const target = typed ?? (baseline && !existing ? displayValue(baseline.suggested) : '')

  /** A stored value as typed in the target field, in the user's units. */
  function displayValue(v: number): string {
    if (kind === 'e1rm') return String(Math.round(toDisplayWeight(v, units.weightUnit) * 10) / 10)
    if (kind === 'best_time') {
      const ex = data.index.get(exerciseId)
      const perKm = ex !== undefined && measureOf(ex) === 'pace' && ex.pace === 'km'
      return formatTime(perKm ? v * 10 : v).replace(' s', '')
    }
    if (kind === 'weekly_volume' && volume === 'distance')
      return String(Math.round(toDisplayDistance(v, units.distanceUnit)))
    if (kind === 'weekly_volume') return String(Math.round(toDisplayWeight(v, units.weightUnit)))
    return String(v)
  }

  const exerciseOptions = (kind === 'e1rm' ? lifts : timed).map((e) => ({ value: e.id, label: e.name }))
  const timedEx = data.index.get(exerciseId)
  const targetLabel =
    kind === 'e1rm'
      ? `Target (${units.weightUnit})`
      : kind === 'best_time'
        ? timedEx && measureOf(timedEx) === 'pace'
          ? timedEx.pace === 'km'
            ? 'Target pace per km (m:ss)'
            : 'Target pace per 100 m (m:ss)'
          : 'Target time (seconds or m:ss)'
        : kind === 'frequency'
          ? 'Sessions per week'
          : volume === 'distance'
            ? `Distance per week (${units.distanceUnit})`
            : `Kilograms lifted per week (${units.weightUnit})`

  function parseTarget(): number | undefined {
    const t = target.trim()
    if (kind === 'best_time') {
      const s = parseTime(t)
      if (s === undefined) return undefined
      return timedEx && measureOf(timedEx) === 'pace' && timedEx.pace === 'km' ? s / 10 : s
    }
    const v = Number.parseFloat(t.replace(',', '.'))
    if (!Number.isFinite(v) || v <= 0) return undefined
    if (kind === 'e1rm') return fromDisplayWeight(v, units.weightUnit)
    if (kind === 'weekly_volume')
      return volume === 'distance' ? fromDisplayDistance(v, units.distanceUnit) : fromDisplayWeight(v, units.weightUnit)
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
          ...scope,
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
          setTyped(null)
          if (k === 'e1rm') setExerciseId(lifts[0]?.id ?? '')
          if (k === 'best_time') setExerciseId(timed[0]?.id ?? '')
        }}
      />
      {(kind === 'e1rm' || kind === 'best_time') && (
        <SelectField
          label="Exercise"
          value={exerciseId}
          options={exerciseOptions}
          onChange={(e) => {
            setExerciseId(e.target.value)
            setTyped(null)
          }}
        />
      )}
      {(kind === 'weekly_volume' || kind === 'frequency') && (
        <SelectField
          label="Discipline"
          value={discipline}
          options={[
            { value: '', label: 'All training' },
            ...data.disciplines.map((d) => ({ value: d.id, label: d.name })),
          ]}
          onChange={(e) => {
            setDiscipline(e.target.value)
            setTyped(null)
          }}
        />
      )}
      {kind === 'weekly_volume' && (
        <Segmented
          label="Volume of"
          options={[
            { value: 'tonnage', label: 'Kilograms lifted' },
            { value: 'distance', label: 'Distance covered' },
          ]}
          value={volume}
          onChange={(v) => {
            setVolume(v)
            setTyped(null)
          }}
        />
      )}
      {(kind === 'e1rm' || kind === 'best_time') && exerciseOptions.length === 0 && (
        <p className={styles.formNote}>
          {kind === 'e1rm'
            ? 'No exercise measured by load × reps yet.'
            : 'No exercise measured by distance and time yet.'}{' '}
          Create one under Exercises first.
        </p>
      )}
      <div className={styles.baseline} role="status">
        {baseline ? (
          <>
            <p>
              <span className={styles.baselineLabel}>Now</span> {f(baseline.current)}
              {baseline.basis === 'best'
                ? kind === 'e1rm'
                  ? ', your best estimated 1RM'
                  : ', your best'
                : ', your average over the last 4 weeks'}
            </p>
            {!existing && (
              <p>
                <span className={styles.baselineLabel}>Suggested</span> {f(baseline.suggested)} by{' '}
                {formatDay(deadline > data.today ? deadline : addDays(data.today, 1), new Date().getFullYear())}: a
                stretch that stays within reach. Change it as you like.
              </p>
            )}
          </>
        ) : (
          <p>
            Nothing logged for this yet, so there is no starting point: log a session first, or set a target you know.
          </p>
        )}
      </div>
      <Field
        label={targetLabel}
        inputMode="decimal"
        value={target}
        onChange={(e) => setTyped(e.target.value)}
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
