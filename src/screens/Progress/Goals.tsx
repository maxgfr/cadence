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
import { type MeasureKind, measureOf, trainedExercises } from '../../core/stats/metrics.ts'
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

/** What a goal is on: one exercise's best, or, for a sport or all training, sessions or volume per week. */
const KINDS: readonly { value: GoalKind; label: string; advanced?: boolean }[] = [
  { value: 'exercise', label: 'An exercise' },
  { value: 'frequency', label: 'Sessions a week' },
  { value: 'weekly_volume', label: 'Volume a week', advanced: true },
]

/** How an exercise goal's target reads, from what the exercise is measured by. */
const TARGET_OF: Record<MeasureKind, string> = {
  e1rm: 'its estimated one-rep max',
  reps: 'the most reps in a set',
  hold: 'the longest set',
  best_time: 'the best time over its distance',
  pace: 'the best pace',
}

/** A goal to start from a link: `?goal=new`, with `&exercise=<id>` to set it on that exercise. */
function presetFrom(search: string, index: ReturnType<typeof useData>['index']): Preset | undefined {
  const params = new URLSearchParams(search)
  if (params.get('goal') !== 'new') return undefined
  const ex = index.get(params.get('exercise') ?? '')
  return ex ? { kind: 'exercise', exerciseId: ex.id } : {}
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
          body="A target with a date, on any exercise (a heavier squat, more pull-ups, a faster 100 m) or on how often you train a sport. It starts from where you are, and Cadence projects where your trend lands."
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
  const startExercise = data.index.get(existing?.exerciseId ?? preset?.exerciseId ?? '')
  // The sport comes first: it narrows the exercises, and scopes sessions and volume.
  const [sport, setSport] = useState(
    startExercise ? (startExercise.disciplineId ?? '') : (existing?.disciplineId ?? ''),
  )
  // Exercises with logged sessions come first: a goal starts from where you are.
  const trained = useMemo(() => trainedExercises(data.sessions, data.index), [data.sessions, data.index])
  const inSport = (e: Exercise) => !sport || e.disciplineId === sport
  const choices = [...trained.filter(inSport), ...data.exercises.filter((e) => inSport(e) && !trained.includes(e))]
  const [kind, setKind] = useState<GoalKind>(existing?.kind ?? preset?.kind ?? 'exercise')
  const [exerciseId, setExerciseId] = useState(startExercise?.id ?? choices[0]?.id ?? '')
  const [volume, setVolume] = useState<'tonnage' | 'distance'>(existing?.volume ?? 'tonnage')
  // null until typed: the suggestion fills the field.
  const [typed, setTyped] = useState<string | null>(() => (existing ? displayValue(existing.target) : null))
  const [deadline, setDeadline] = useState(existing?.deadline ?? addDays(data.today, 84))
  const [error, setError] = useState<string>()
  const exercise = kind === 'exercise' ? data.index.get(exerciseId) : undefined
  const measure = exercise ? measureOf(exercise) : undefined
  const scope = {
    ...(kind === 'exercise' && exerciseId ? { exerciseId } : {}),
    ...(kind !== 'exercise' && sport ? { disciplineId: sport } : {}),
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
  const perKm = exercise?.pace === 'km'

  /** A stored value as typed in the target field, in the user's units. */
  function displayValue(v: number): string {
    if (kind === 'exercise') {
      const ex = data.index.get(exerciseId)
      switch (ex ? measureOf(ex) : 'e1rm') {
        case 'e1rm':
          return String(Math.round(toDisplayWeight(v, units.weightUnit) * 10) / 10)
        case 'reps':
          return String(Math.round(v))
        case 'pace':
          return formatTime(ex?.pace === 'km' ? v * 10 : v, false)
        default:
          return formatTime(v).replace(' s', '')
      }
    }
    if (kind === 'weekly_volume' && volume === 'distance')
      return String(Math.round(toDisplayDistance(v, units.distanceUnit)))
    if (kind === 'weekly_volume') return String(Math.round(toDisplayWeight(v, units.weightUnit)))
    return String(v)
  }

  const targetLabel =
    kind === 'exercise'
      ? {
          e1rm: `Target estimated 1RM (${units.weightUnit})`,
          reps: 'Target reps in a set',
          hold: 'Target time held (seconds or m:ss)',
          best_time: 'Target time (seconds or m:ss)',
          pace: `Target pace per ${perKm ? 'km' : '100 m'} (m:ss)`,
        }[measure ?? 'e1rm']
      : kind === 'frequency'
        ? 'Sessions per week'
        : volume === 'distance'
          ? `Distance per week (${units.distanceUnit})`
          : `Kilograms lifted per week (${units.weightUnit})`

  function parseTarget(): number | undefined {
    const t = target.trim()
    if (measure === 'hold' || measure === 'best_time' || measure === 'pace') {
      const s = parseTime(t)
      if (s === undefined || s <= 0) return undefined
      return measure === 'pace' && perKm ? s / 10 : s
    }
    const v = Number.parseFloat(t.replace(',', '.'))
    if (!Number.isFinite(v) || v <= 0) return undefined
    if (measure === 'e1rm') return fromDisplayWeight(v, units.weightUnit)
    if (measure === 'reps') return Math.round(v)
    if (kind === 'weekly_volume')
      return volume === 'distance' ? fromDisplayDistance(v, units.distanceUnit) : fromDisplayWeight(v, units.weightUnit)
    return v
  }

  return (
    <form
      className={styles.form}
      onSubmit={async (e) => {
        e.preventDefault()
        if (kind === 'exercise' && !exercise) {
          setError('Pick an exercise.')
          return
        }
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
        label="Sport"
        value={sport}
        options={[{ value: '', label: 'All sports' }, ...data.disciplines.map((d) => ({ value: d.id, label: d.name }))]}
        onChange={(e) => {
          const next = e.target.value
          setSport(next)
          setTyped(null)
          if (kind === 'exercise' && next && data.index.get(exerciseId)?.disciplineId !== next) {
            const first =
              trained.find((x) => x.disciplineId === next) ?? data.exercises.find((x) => x.disciplineId === next)
            setExerciseId(first?.id ?? '')
          }
        }}
      />
      <Segmented
        label="Goal on"
        options={KINDS.filter((k) => advanced || !k.advanced || k.value === kind)}
        value={kind}
        onChange={(k) => {
          setKind(k)
          setTyped(null)
          setError(undefined)
        }}
      />
      {kind === 'exercise' &&
        (choices.length > 0 ? (
          <SelectField
            label="Exercise"
            value={exerciseId}
            options={choices.map((e) => ({ value: e.id, label: e.name }))}
            {...(measure
              ? {
                  hint: `The goal is on ${TARGET_OF[measure]}, as the exercise is measured.`,
                }
              : {})}
            onChange={(e) => {
              setExerciseId(e.target.value)
              setTyped(null)
            }}
          />
        ) : (
          <p className={styles.formNote}>
            No exercise {sport ? `in ${data.disciplineIndex.get(sport)?.name ?? 'this sport'} ` : ''}yet. Create one
            under Exercises first.
          </p>
        ))}
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
      {(kind !== 'exercise' || exercise) && (
        <div className={styles.baseline} role="status">
          {baseline ? (
            <>
              <p>
                <span className={styles.baselineLabel}>Now</span> {f(baseline.current)}
                {baseline.basis === 'best' ? ', your best so far' : ', your average over the last 4 weeks'}
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
      )}
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
