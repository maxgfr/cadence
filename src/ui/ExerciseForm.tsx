import { useState } from 'react'
import { useData } from '../app/data.tsx'
import { useToast } from '../app/toast.tsx'
import { normalizeName, usualMetric } from '../core/library/exercises.ts'
import { newId } from '../core/model/ids.ts'
import {
  type Discipline,
  type DisciplineColor,
  type Exercise,
  type Metric,
  MUSCLES,
  type Muscle,
  type PaceUnit,
} from '../core/model/schemas.ts'
import { fromDisplayDistance, toDisplayDistance } from '../core/model/units.ts'
import { Button } from './components/Button.tsx'
import { Field } from './components/Field.tsx'
import { Segmented } from './components/Segmented.tsx'
import { SelectField } from './components/SelectField.tsx'
import { ColorPicker, freeColor } from './DisciplineForm.tsx'
import styles from './Forms.module.css'
import { useUnits } from './units.ts'

export const METRIC_LABEL: Record<Metric, string> = {
  weight_reps: 'Load × reps',
  reps: 'Reps (bodyweight)',
  time: 'Time held',
  distance_time: 'Distance and time',
}

export const MUSCLE_NAMES: Record<Muscle, string> = {
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

const NEW = '__new__'

interface ExerciseFormProps {
  exercise: Exercise | null
  initialName?: string
  /** Pre-selected discipline for a new exercise (the session's). Without it, none is selected. */
  initialDisciplineId?: string
  onDone: (saved?: Exercise) => void
}

/** Creates or edits an exercise. A new discipline can be created on the way. */
export function ExerciseForm({ exercise, initialName = '', initialDisciplineId, onDone }: ExerciseFormProps) {
  const data = useData()
  const units = useUnits()
  const toast = useToast()
  const [name, setName] = useState(exercise?.name ?? initialName)
  const [disciplineId, setDisciplineId] = useState(
    exercise ? (exercise.disciplineId ?? '') : (initialDisciplineId ?? ''),
  )
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<DisciplineColor>(freeColor(data.disciplines))
  const [metric, setMetric] = useState<Metric>(
    exercise?.metric ?? usualMetric(data.exercises, initialDisciplineId) ?? 'weight_reps',
  )
  const [pace, setPace] = useState<PaceUnit>(
    exercise?.pace ?? data.exercises.find((e) => e.disciplineId === initialDisciplineId && e.pace)?.pace ?? '100m',
  )
  const [distance, setDistance] = useState(
    exercise?.distance !== undefined
      ? String(Math.round(toDisplayDistance(exercise.distance, units.distanceUnit)))
      : '',
  )
  const [muscles, setMuscles] = useState<Muscle[]>(exercise?.muscles ?? [])
  const [error, setError] = useState<string>()
  const [newError, setNewError] = useState<string>()
  const used = exercise
    ? data.sessions.some((s) => s.entries.some((e) => e.exerciseId === exercise.id)) ||
      data.programs.some((p) =>
        p.weeks.some((w) => w.days.some((d) => d.blocks.some((b) => b.exerciseId === exercise.id))),
      ) ||
      data.goals.some((g) => g.exerciseId === exercise.id)
    : false
  const d = Number.parseFloat(distance.replace(',', '.'))
  const fixed = metric === 'distance_time' && Number.isFinite(d) && d > 0

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
        if (data.exercises.some((x) => x.id !== exercise?.id && normalizeName(x.name) === normalizeName(n))) {
          setError('An exercise with this name already exists.')
          return
        }
        let did = disciplineId
        if (disciplineId === NEW) {
          const dn = newName.trim()
          if (!dn) {
            setNewError('Name the new discipline.')
            return
          }
          const existing = data.disciplines.find((x) => normalizeName(x.name) === normalizeName(dn))
          if (existing) did = existing.id
          else {
            const created: Discipline = { id: newId(), name: dn.slice(0, 40), color: newColor }
            await data.put('disciplines', created)
            did = created.id
          }
        }
        const next: Exercise = {
          id: exercise?.id ?? newId(),
          name: n,
          metric,
          ...(did ? { disciplineId: did } : {}),
          ...(fixed ? { distance: fromDisplayDistance(d, units.distanceUnit) } : {}),
          ...(metric === 'distance_time' && !fixed ? { pace } : {}),
          ...(muscles.length > 0 ? { muscles } : {}),
          ...(exercise?.stroke ? { stroke: exercise.stroke } : {}),
          ...(exercise?.notes ? { notes: exercise.notes } : {}),
        }
        await data.put('exercises', next)
        toast(exercise ? 'Exercise saved' : `${n} added`)
        onDone(next)
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
        value={disciplineId}
        options={[
          { value: '', label: 'No discipline' },
          ...data.disciplines.map((x) => ({ value: x.id, label: x.name })),
          { value: NEW, label: 'New discipline…' },
        ]}
        onChange={(e) => setDisciplineId(e.target.value)}
      />
      {disciplineId === NEW && (
        <div className={styles.inset}>
          <Field
            label="New discipline"
            placeholder="Gym, Swimming, Climbing…"
            value={newName}
            maxLength={40}
            onChange={(e) => setNewName(e.target.value)}
            {...(newError ? { error: newError } : {})}
          />
          <ColorPicker value={newColor} onChange={setNewColor} />
        </div>
      )}
      <SelectField
        label="Measured by"
        value={metric}
        options={(Object.keys(METRIC_LABEL) as Metric[]).map((m) => ({ value: m, label: METRIC_LABEL[m] }))}
        onChange={(e) => setMetric(e.target.value as Metric)}
        {...(used ? { hint: 'Changing this changes how logged sets of this exercise are read.' } : {})}
      />
      {metric === 'distance_time' && (
        <>
          <Field
            label={`Fixed distance (${units.distanceUnit}, optional)`}
            hint="For a set distance such as a 150 m sprint: sets then only need a time, and records are best times."
            inputMode="decimal"
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
          />
          {!fixed && (
            <Segmented
              label="Pace shown"
              options={[
                { value: '100m', label: 'per 100 m' },
                { value: 'km', label: 'per km' },
              ]}
              value={pace}
              onChange={setPace}
            />
          )}
        </>
      )}
      {data.settings.mode === 'advanced' && metric !== 'distance_time' && (
        <fieldset className={styles.checks}>
          <legend className={styles.legend}>Muscles worked</legend>
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
      {exercise && used && (
        <p className={styles.note}>Used in a session, a program or a goal, so it cannot be deleted.</p>
      )}
    </form>
  )
}
