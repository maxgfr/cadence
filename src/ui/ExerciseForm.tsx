import { useState } from 'react'
import { Link } from 'wouter'
import { useAi } from '../app/ai.tsx'
import { useCoach } from '../app/coach.tsx'
import { useData } from '../app/data.tsx'
import { useT } from '../app/i18n.tsx'
import { useToast } from '../app/toast.tsx'
import { normalizeName, usualMetric } from '../core/library/exercises.ts'
import { newId } from '../core/model/ids.ts'
import {
  type Discipline,
  type DisciplineColor,
  type Exercise,
  METRICS,
  type Metric,
  MUSCLES,
  type Muscle,
  type PaceUnit,
} from '../core/model/schemas.ts'
import { fromDisplayDistance, toDisplayDistance } from '../core/model/units.ts'
import { Button, buttonClass } from './components/Button.tsx'
import { Field } from './components/Field.tsx'
import { Segmented } from './components/Segmented.tsx'
import { SelectField } from './components/SelectField.tsx'
import { TextArea } from './components/TextArea.tsx'
import { cx } from './cx.ts'
import { ColorPicker, freeColor } from './DisciplineForm.tsx'
import styles from './Forms.module.css'
import { linksIn, WebLink } from './links.tsx'
import { compressPhoto } from './photo.ts'
import { RestField } from './RestField.tsx'
import { useUnits } from './units.ts'

const NEW = '__new__'

interface ExerciseFormProps {
  exercise: Exercise | null
  initialName?: string
  /** Pre-selected discipline for a new exercise (the session's). Without it, none is selected. */
  initialDisciplineId?: string
  /** A description the coach wrote, shown in place of the stored one until saved. */
  initialDescription?: string
  onDone: (saved?: Exercise) => void
  /**
   * Edits an exercise of an AI draft instead: nothing is stored, the result (and a discipline created on the way)
   * goes back to the draft. `disciplines` are the draft's new ones, `names` the names of its other exercises.
   */
  draft?: {
    disciplines: readonly Discipline[]
    names: readonly string[]
    onSave(ex: Exercise, created?: Discipline): void
  }
}

/** Creates or edits an exercise. A new discipline can be created on the way. */
export function ExerciseForm({
  exercise,
  initialName = '',
  initialDisciplineId,
  initialDescription,
  onDone,
  draft,
}: ExerciseFormProps) {
  const data = useData()
  const ai = useAi()
  const coach = useCoach()
  const disciplines = [...data.disciplines, ...(draft?.disciplines ?? [])]
  const units = useUnits()
  const toast = useToast()
  const t = useT()
  const [name, setName] = useState(exercise?.name ?? initialName)
  const [disciplineId, setDisciplineId] = useState(
    exercise ? (exercise.disciplineId ?? '') : (initialDisciplineId ?? ''),
  )
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<DisciplineColor>(freeColor(disciplines))
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
  const [rest, setRest] = useState<number | undefined>(exercise?.rest)
  const [description, setDescription] = useState(initialDescription ?? exercise?.description ?? '')
  const [notes, setNotes] = useState(exercise?.notes ?? '')
  const [photo, setPhoto] = useState(exercise?.photo)
  const [photoError, setPhotoError] = useState(false)
  const [error, setError] = useState<string>()
  const [newError, setNewError] = useState<string>()
  const used =
    exercise && !draft
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
          setError(t.forms.exercise.nameRequired)
          return
        }
        const taken = [
          ...data.exercises.filter((x) => x.id !== exercise?.id).map((x) => x.name),
          ...(draft?.names ?? []),
        ]
        if (taken.some((x) => normalizeName(x) === normalizeName(n))) {
          setError(t.forms.exercise.nameTaken)
          return
        }
        let did = disciplineId
        let created: Discipline | undefined
        if (disciplineId === NEW) {
          const dn = newName.trim()
          if (!dn) {
            setNewError(t.forms.exercise.newDisciplineRequired)
            return
          }
          const existing = disciplines.find((x) => normalizeName(x.name) === normalizeName(dn))
          if (existing) did = existing.id
          else {
            created = { id: newId(), name: dn.slice(0, 40), color: newColor }
            if (!draft) await data.put('disciplines', created)
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
          ...(notes.trim() ? { notes: notes.trim().slice(0, 500) } : {}),
          ...(description.trim() ? { description: description.trim().slice(0, 4000) } : {}),
          ...(photo ? { photo } : {}),
          ...(rest !== undefined ? { rest } : {}),
        }
        if (draft) {
          draft.onSave(next, created)
          return
        }
        await data.put('exercises', next)
        toast(exercise ? t.forms.exercise.saved : t.forms.exercise.added(n))
        onDone(next)
      }}
    >
      <Field
        label={t.common.name}
        value={name}
        maxLength={80}
        onChange={(e) => setName(e.target.value)}
        {...(error ? { error } : {})}
      />
      <SelectField
        label={t.common.discipline}
        value={disciplineId}
        options={[
          { value: '', label: t.common.noDiscipline },
          ...disciplines.map((x) => ({
            value: x.id,
            label: draft?.disciplines.includes(x) ? t.forms.exercise.draftDiscipline(x.name) : x.name,
          })),
          { value: NEW, label: t.forms.exercise.newDisciplineOption },
        ]}
        onChange={(e) => setDisciplineId(e.target.value)}
      />
      {disciplineId === NEW && (
        <div className={styles.inset}>
          <Field
            label={t.forms.exercise.newDiscipline}
            placeholder={t.forms.discipline.placeholder}
            value={newName}
            maxLength={40}
            onChange={(e) => setNewName(e.target.value)}
            {...(newError ? { error: newError } : {})}
          />
          <ColorPicker value={newColor} onChange={setNewColor} />
        </div>
      )}
      <SelectField
        label={t.forms.exercise.measuredBy}
        value={metric}
        options={METRICS.map((m) => ({ value: m, label: t.labels.metric[m] }))}
        onChange={(e) => setMetric(e.target.value as Metric)}
        hint={used ? `${t.labels.metricHelp[metric]} ${t.forms.exercise.metricChanged}` : t.labels.metricHelp[metric]}
      />
      {metric === 'distance_time' && (
        <>
          <Field
            label={t.forms.exercise.fixedDistance(units.distanceUnit)}
            hint={t.forms.exercise.fixedDistanceHint}
            inputMode="decimal"
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
          />
          {!fixed && (
            <Segmented
              label={t.forms.exercise.paceShown}
              options={[
                { value: '100m', label: t.forms.exercise.per100m },
                { value: 'km', label: t.forms.exercise.perKm },
              ]}
              value={pace}
              onChange={setPace}
            />
          )}
        </>
      )}
      {data.settings.mode === 'advanced' && metric !== 'distance_time' && (
        <fieldset className={styles.checks}>
          <legend className={styles.legend}>{t.forms.exercise.muscles}</legend>
          {MUSCLES.map((m) => (
            <label key={m}>
              <input
                type="checkbox"
                checked={muscles.includes(m)}
                onChange={(e) => setMuscles(e.target.checked ? [...muscles, m] : muscles.filter((x) => x !== m))}
              />
              {t.labels.muscle[m]}
            </label>
          ))}
        </fieldset>
      )}
      <RestField
        value={rest}
        inherited={data.disciplineIndex.get(disciplineId)?.rest ?? data.settings.defaultRest}
        from={
          data.disciplineIndex.get(disciplineId)?.rest !== undefined
            ? data.disciplineIndex.get(disciplineId)?.name
            : undefined
        }
        onChange={setRest}
      />
      <TextArea
        label={t.forms.exercise.description}
        hint={t.forms.exercise.descriptionHint}
        rows={5}
        maxLength={4000}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      {linksIn(description).length > 0 && (
        <div className={styles.links}>
          {linksIn(description).map((url) => (
            <WebLink key={url} href={url} />
          ))}
        </div>
      )}
      {/* Hands over to the coach, the only way to AI: this form closes first, being a modal over it. */}
      {exercise &&
        !draft &&
        (ai.ready ? (
          <Button
            variant="plain"
            full
            onClick={() => {
              onDone()
              coach.show({ text: t.coach.starters.describeExercise(exercise.name) })
            }}
          >
            {t.forms.exercise.askCoach}
          </Button>
        ) : (
          <Link href="/settings/ai" className={buttonClass({ variant: 'plain', full: true })}>
            {t.forms.exercise.askCoach}
          </Link>
        ))}
      <TextArea
        label={t.forms.exercise.myNotes}
        rows={3}
        maxLength={500}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className={styles.photoField}>
        <span className={styles.legend}>{t.forms.exercise.photo}</span>
        {photo && (
          <img className={styles.photo} src={photo} alt={t.forms.exercise.photoOf(name.trim() || t.common.exercise)} />
        )}
        <div className={styles.photoActions}>
          <label className={cx(buttonClass({ variant: 'secondary' }), styles.photoPick)}>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={async (e) => {
                const input = e.target
                const file = input.files?.[0]
                if (!file) return
                try {
                  setPhoto(await compressPhoto(file))
                  setPhotoError(false)
                } catch {
                  setPhotoError(true)
                }
                // Picking the same file again still counts as a change.
                input.value = ''
              }}
            />
            {photo ? t.forms.exercise.changePhoto : t.forms.exercise.addPhoto}
          </label>
          {photo && (
            <Button variant="plain" onClick={() => setPhoto(undefined)}>
              {t.forms.exercise.removePhoto}
            </Button>
          )}
        </div>
        {photoError ? (
          <p className={styles.note} role="alert">
            {t.forms.exercise.photoFailed}
          </p>
        ) : (
          <p className={styles.note}>{t.forms.exercise.photoHint}</p>
        )}
      </div>
      <Button type="submit" variant="primary" size="large" full>
        {exercise ? t.common.save : t.forms.exercise.add}
      </Button>
      {exercise && !used && !draft && (
        <Button
          variant="danger"
          full
          onClick={async () => {
            await data.remove('exercises', exercise.id)
            toast(t.forms.exercise.deleted(exercise.name), [
              { label: t.forms.undo, onClick: () => data.put('exercises', exercise) },
            ])
            onDone()
          }}
        >
          {t.forms.exercise.delete}
        </Button>
      )}
      {exercise && used && <p className={styles.note}>{t.forms.exercise.inUse}</p>}
    </form>
  )
}
