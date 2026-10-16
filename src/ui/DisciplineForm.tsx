import { useId, useState } from 'react'
import { useData } from '../app/data.tsx'
import { useToast } from '../app/toast.tsx'
import { normalizeName } from '../core/library/exercises.ts'
import { newId } from '../core/model/ids.ts'
import { DISCIPLINE_COLORS, type Discipline, type DisciplineColor } from '../core/model/schemas.ts'
import { Button } from './components/Button.tsx'
import { COLOR_LABEL, ColorDot } from './components/Discipline.tsx'
import { Field } from './components/Field.tsx'
import styles from './Forms.module.css'

/** The first colour no discipline uses yet. */
export function freeColor(disciplines: readonly Discipline[]): DisciplineColor {
  const taken = new Set(disciplines.map((d) => d.color))
  return (
    DISCIPLINE_COLORS.find((c) => !taken.has(c)) ??
    DISCIPLINE_COLORS[disciplines.length % DISCIPLINE_COLORS.length] ??
    'blue'
  )
}

export function ColorPicker({ value, onChange }: { value: DisciplineColor; onChange: (c: DisciplineColor) => void }) {
  const group = useId()
  return (
    <fieldset className={styles.colors}>
      <legend className={styles.legend}>Colour</legend>
      {DISCIPLINE_COLORS.map((c) => (
        <label key={c} className={styles.color} title={COLOR_LABEL[c]}>
          <input type="radio" name={group} value={c} checked={value === c} onChange={() => onChange(c)} />
          <ColorDot color={c} />
          <span className="sr-only">{COLOR_LABEL[c]}</span>
        </label>
      ))}
    </fieldset>
  )
}

/** Creates or edits a discipline. A discipline in use cannot be deleted: its sessions and exercises point at it. */
export function DisciplineForm({
  discipline,
  onDone,
}: {
  discipline: Discipline | null
  onDone: (d?: Discipline) => void
}) {
  const data = useData()
  const toast = useToast()
  const [name, setName] = useState(discipline?.name ?? '')
  const [color, setColor] = useState<DisciplineColor>(discipline?.color ?? freeColor(data.disciplines))
  const [error, setError] = useState<string>()
  const used = discipline
    ? data.exercises.some((e) => e.disciplineId === discipline.id) ||
      data.sessions.some((s) => s.disciplineId === discipline.id) ||
      data.programs.some((p) => p.weeks.some((w) => w.days.some((d) => d.disciplineId === discipline.id))) ||
      data.goals.some((g) => g.disciplineId === discipline.id)
    : false
  return (
    <form
      className={styles.form}
      onSubmit={async (e) => {
        e.preventDefault()
        const n = name.trim()
        if (!n) {
          setError('Give it a name, such as Gym, Swimming or Climbing.')
          return
        }
        if (data.disciplines.some((d) => d.id !== discipline?.id && normalizeName(d.name) === normalizeName(n))) {
          setError('You already have a discipline with this name.')
          return
        }
        const next: Discipline = { id: discipline?.id ?? newId(), name: n, color }
        await data.put('disciplines', next)
        toast(discipline ? 'Discipline saved' : `${n} added`)
        onDone(next)
      }}
    >
      <Field
        label="Name"
        value={name}
        maxLength={40}
        placeholder="Gym, Swimming, Climbing…"
        onChange={(e) => setName(e.target.value)}
        {...(error ? { error } : {})}
      />
      <ColorPicker value={color} onChange={setColor} />
      <Button type="submit" variant="primary" size="large" full>
        {discipline ? 'Save' : 'Add discipline'}
      </Button>
      {discipline && !used && (
        <Button
          variant="danger"
          full
          onClick={async () => {
            await data.remove('disciplines', discipline.id)
            toast(`${discipline.name} deleted`, [{ label: 'Undo', onClick: () => data.put('disciplines', discipline) }])
            onDone()
          }}
        >
          Delete discipline
        </Button>
      )}
      {discipline && used && (
        <p className={styles.note}>Exercises, sessions or programs use it, so it cannot be deleted.</p>
      )}
    </form>
  )
}
