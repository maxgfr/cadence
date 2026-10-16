import { Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useData } from '../../app/data.tsx'
import { useToast } from '../../app/toast.tsx'
import { isBuiltin } from '../../core/library/exercises.ts'
import { newId } from '../../core/model/ids.ts'
import {
  DISCIPLINES,
  type Discipline,
  type Exercise,
  type Metric,
  MUSCLES,
  type Muscle,
} from '../../core/model/schemas.ts'
import { fromDisplayDistance, toDisplayDistance } from '../../core/model/units.ts'
import { trainedExercises } from '../../core/stats/metrics.ts'
import { Button } from '../../ui/components/Button.tsx'
import { DISCIPLINE_LABEL, DisciplineDot } from '../../ui/components/Discipline.tsx'
import { Field } from '../../ui/components/Field.tsx'
import { IconButton } from '../../ui/components/IconButton.tsx'
import { ListGroup, ListRow } from '../../ui/components/List.tsx'
import { SelectField } from '../../ui/components/SelectField.tsx'
import { Sheet } from '../../ui/components/Sheet.tsx'
import { Screen } from '../../ui/shell/Screen.tsx'
import { useUnits } from '../../ui/units.ts'
import styles from './Exercises.module.css'

export const METRIC_LABEL: Record<Metric, string> = {
  weight_reps: 'Load × reps',
  reps: 'Reps (bodyweight)',
  time: 'Time held',
  distance_time: 'Distance and time',
}

export function Exercises() {
  const data = useData()
  const units = useUnits()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Exercise | 'new' | null>(null)
  const trained = useMemo(
    () => new Set(trainedExercises(data.sessions, data.index).map((e) => e.id)),
    [data.sessions, data.index],
  )
  const q = query.trim().toLowerCase()
  const hits = q ? data.exercises.filter((e) => e.name.toLowerCase().includes(q)) : data.exercises
  return (
    <Screen
      title="Exercises"
      subtitle={`${data.exercises.length} in the library · ${data.custom.length} of your own`}
      trailing={<IconButton icon={Plus} label="New exercise" onClick={() => setEditing('new')} />}
      back={{ href: '/settings', label: 'Settings' }}
    >
      <label className={styles.search}>
        <Search size={18} strokeWidth={1.75} aria-hidden="true" />
        <span className="sr-only">Search exercises</span>
        <input
          type="search"
          placeholder="Search exercises"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={styles.input}
        />
      </label>
      {DISCIPLINES.map((d) => {
        const items = hits.filter((e) => e.discipline === d)
        if (items.length === 0) return null
        return (
          <ListGroup key={d} title={DISCIPLINE_LABEL[d]}>
            {items.map((e) => {
              const own = !isBuiltin(e.id)
              const sub = [
                METRIC_LABEL[e.metric],
                e.distance !== undefined
                  ? `${Math.round(toDisplayDistance(e.distance, units.distanceUnit))} ${units.distanceUnit}`
                  : '',
                own ? 'yours' : '',
                trained.has(e.id) ? 'logged' : '',
              ]
                .filter(Boolean)
                .join(' · ')
              return (
                <ListRow
                  key={e.id}
                  leading={<DisciplineDot discipline={d} />}
                  title={e.name}
                  subtitle={sub}
                  {...(own
                    ? { onClick: () => setEditing(e), chevron: true }
                    : trained.has(e.id)
                      ? { href: `/progress?exercise=${e.id}` }
                      : {})}
                />
              )
            })}
          </ListGroup>
        )
      })}
      {hits.length === 0 && (
        <div className={styles.none}>
          <p>No exercise called “{query}”.</p>
          <Button
            variant="secondary"
            icon={<Plus size={18} strokeWidth={2} aria-hidden="true" />}
            onClick={() => setEditing('new')}
          >
            Add it
          </Button>
        </div>
      )}
      <Sheet
        open={editing !== null}
        title={editing === 'new' ? 'New exercise' : 'Edit exercise'}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <ExerciseForm
            key={editing === 'new' ? 'new' : editing.id}
            exercise={editing === 'new' ? null : editing}
            initialName={editing === 'new' ? query : ''}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </Screen>
  )
}

const MUSCLE_NAMES: Record<Muscle, string> = {
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  core: 'Core',
  full_body: 'Full body',
}

function ExerciseForm({
  exercise,
  initialName,
  onDone,
}: {
  exercise: Exercise | null
  initialName: string
  onDone: () => void
}) {
  const data = useData()
  const units = useUnits()
  const toast = useToast()
  const [name, setName] = useState(exercise?.name ?? initialName)
  const [discipline, setDiscipline] = useState<Discipline>(exercise?.discipline ?? 'strength')
  const [metric, setMetric] = useState<Metric>(exercise?.metric ?? 'weight_reps')
  const [distance, setDistance] = useState(
    exercise?.distance !== undefined
      ? String(Math.round(toDisplayDistance(exercise.distance, units.distanceUnit)))
      : '',
  )
  const [muscles, setMuscles] = useState<Muscle[]>(exercise?.muscles ?? [])
  const [error, setError] = useState<string>()
  const used = exercise
    ? data.sessions.some((s) => s.entries.some((e) => e.exerciseId === exercise.id)) ||
      data.programs.some((p) =>
        p.weeks.some((w) => w.days.some((d) => d.blocks.some((b) => b.exerciseId === exercise.id))),
      )
    : false
  return (
    <form
      className={styles.form}
      onSubmit={async (e) => {
        e.preventDefault()
        const n = name.trim()
        if (!n) {
          setError('Give it a name.')
          return
        }
        if (data.exercises.some((x) => x.id !== exercise?.id && x.name.toLowerCase() === n.toLowerCase())) {
          setError('An exercise with this name already exists.')
          return
        }
        const d = Number.parseFloat(distance.replace(',', '.'))
        const next: Exercise = {
          id: exercise?.id ?? newId(),
          name: n,
          discipline,
          metric,
          ...(metric === 'distance_time' && Number.isFinite(d) && d > 0
            ? { distance: fromDisplayDistance(d, units.distanceUnit) }
            : {}),
          ...(muscles.length > 0 && discipline === 'strength' ? { muscles } : {}),
        }
        await data.put('exercises', next)
        toast(exercise ? 'Exercise saved' : `${n} added`)
        onDone()
      }}
    >
      <Field
        label="Name"
        value={name}
        maxLength={80}
        onChange={(e) => setName(e.target.value)}
        {...(error ? { error } : {})}
      />
      <SelectField
        label="Discipline"
        value={discipline}
        options={DISCIPLINES.map((d) => ({ value: d, label: DISCIPLINE_LABEL[d] }))}
        onChange={(e) => setDiscipline(e.target.value as Discipline)}
      />
      <SelectField
        label="Measured by"
        value={metric}
        options={(Object.keys(METRIC_LABEL) as Metric[]).map((m) => ({ value: m, label: METRIC_LABEL[m] }))}
        onChange={(e) => setMetric(e.target.value as Metric)}
        {...(used ? { hint: 'Changing this changes how logged sets of this exercise are read.' } : {})}
      />
      {metric === 'distance_time' && (
        <Field
          label={`Fixed distance (${units.distanceUnit}, optional)`}
          hint="For a set distance such as a 150 m sprint: sets then only need a time, and records are best times."
          inputMode="decimal"
          value={distance}
          onChange={(e) => setDistance(e.target.value)}
        />
      )}
      {discipline === 'strength' && data.settings.mode === 'advanced' && (
        <fieldset className={styles.muscles}>
          <legend>Muscles worked</legend>
          {MUSCLES.map((m) => (
            <label key={m}>
              <input
                type="checkbox"
                checked={muscles.includes(m)}
                onChange={(e) => setMuscles(e.target.checked ? [...muscles, m] : muscles.filter((x) => x !== m))}
              />
              {MUSCLE_NAMES[m]}
            </label>
          ))}
        </fieldset>
      )}
      <Button type="submit" variant="primary" size="large" full>
        {exercise ? 'Save' : 'Add exercise'}
      </Button>
      {exercise && !used && (
        <Button
          variant="danger"
          full
          onClick={async () => {
            await data.remove('exercises', exercise.id)
            toast(`${exercise.name} deleted`, [{ label: 'Undo', onClick: () => data.put('exercises', exercise) }])
            onDone()
          }}
        >
          Delete exercise
        </Button>
      )}
      {exercise && used && <p className={styles.note}>Used in a session or a program, so it cannot be deleted.</p>}
    </form>
  )
}
