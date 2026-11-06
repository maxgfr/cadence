import { useId, useState } from 'react'
import { useData } from '../app/data.tsx'
import { useT } from '../app/i18n.tsx'
import { useToast } from '../app/toast.tsx'
import { normalizeName } from '../core/library/exercises.ts'
import { newId } from '../core/model/ids.ts'
import { DISCIPLINE_COLORS, type Discipline, type DisciplineColor } from '../core/model/schemas.ts'
import { Button } from './components/Button.tsx'
import { ColorDot } from './components/Discipline.tsx'
import { Field } from './components/Field.tsx'
import styles from './Forms.module.css'
import { RestField } from './RestField.tsx'

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
  const t = useT()
  return (
    <fieldset className={styles.colors}>
      <legend className={styles.legend}>{t.forms.discipline.colour}</legend>
      {DISCIPLINE_COLORS.map((c) => (
        <label key={c} className={styles.color} title={t.labels.color[c]}>
          <input type="radio" name={group} value={c} checked={value === c} onChange={() => onChange(c)} />
          <ColorDot color={c} />
          <span className="sr-only">{t.labels.color[c]}</span>
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
  const t = useT()
  const [name, setName] = useState(discipline?.name ?? '')
  const [color, setColor] = useState<DisciplineColor>(discipline?.color ?? freeColor(data.disciplines))
  const [rest, setRest] = useState<number | undefined>(discipline?.rest)
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
          setError(t.forms.discipline.nameRequired)
          return
        }
        if (data.disciplines.some((d) => d.id !== discipline?.id && normalizeName(d.name) === normalizeName(n))) {
          setError(t.forms.discipline.nameTaken)
          return
        }
        const next: Discipline = {
          id: discipline?.id ?? newId(),
          name: n,
          color,
          ...(rest !== undefined ? { rest } : {}),
        }
        await data.put('disciplines', next)
        toast(discipline ? t.forms.discipline.saved : t.forms.discipline.added(n))
        onDone(next)
      }}
    >
      <Field
        label={t.common.name}
        value={name}
        maxLength={40}
        placeholder={t.forms.discipline.placeholder}
        onChange={(e) => setName(e.target.value)}
        {...(error ? { error } : {})}
      />
      <ColorPicker value={color} onChange={setColor} />
      <RestField value={rest} inherited={data.settings.defaultRest} onChange={setRest} />
      <Button type="submit" variant="primary" size="large" full>
        {discipline ? t.common.save : t.forms.discipline.add}
      </Button>
      {discipline && !used && (
        <Button
          variant="danger"
          full
          onClick={async () => {
            await data.remove('disciplines', discipline.id)
            toast(t.forms.discipline.deleted(discipline.name), [
              { label: t.forms.undo, onClick: () => data.put('disciplines', discipline) },
            ])
            onDone()
          }}
        >
          {t.forms.discipline.delete}
        </Button>
      )}
      {discipline && used && <p className={styles.note}>{t.forms.discipline.inUse}</p>}
    </form>
  )
}
