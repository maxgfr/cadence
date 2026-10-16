import { useData } from '../app/data.tsx'
import type { Discipline } from '../core/model/schemas.ts'
import { DisciplineDot } from './components/Discipline.tsx'
import { Field } from './components/Field.tsx'
import styles from './SportsPicker.module.css'

/** The sports picked, by name: the athlete's disciplines ticked, then those typed in (comma separated). */
export function sportNames(picked: readonly string[], other: string, index: ReadonlyMap<string, Discipline>): string[] {
  return [
    ...picked.map((id) => index.get(id)?.name).filter((n): n is string => n !== undefined),
    ...other
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  ]
}

/** Tick some of the athlete's disciplines and type in others. */
export function SportsPicker({
  value,
  onChange,
  other,
  onOther,
  hint,
}: {
  value: string[]
  onChange: (v: string[]) => void
  other: string
  onOther: (v: string) => void
  /** What a sport typed in becomes. */
  hint: string
}) {
  const { disciplines } = useData()
  return (
    <div className={styles.sports}>
      {disciplines.length > 0 && (
        <fieldset className={styles.chips}>
          <legend className={styles.legend}>Your disciplines</legend>
          {disciplines.map((d) => (
            <label key={d.id} className={styles.chip}>
              <input
                type="checkbox"
                checked={value.includes(d.id)}
                onChange={(e) => onChange(e.target.checked ? [...value, d.id] : value.filter((x) => x !== d.id))}
              />
              <DisciplineDot disciplineId={d.id} />
              {d.name}
            </label>
          ))}
        </fieldset>
      )}
      <Field
        label={disciplines.length > 0 ? 'Other sports (optional)' : 'Sports'}
        placeholder="Climbing, cycling…"
        hint={hint}
        value={other}
        onChange={(e) => onOther(e.target.value)}
      />
    </div>
  )
}
