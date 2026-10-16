import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useData } from '../app/data.tsx'
import { DISCIPLINES, type Discipline, type Exercise } from '../core/model/schemas.ts'
import { DISCIPLINE_LABEL, DisciplineDot } from './components/Discipline.tsx'
import { Sheet } from './components/Sheet.tsx'
import styles from './ExercisePicker.module.css'

export interface ExercisePickerProps {
  open: boolean
  onClose: () => void
  onPick: (exercise: Exercise) => void
  /** Listed first. */
  discipline?: Discipline
  title?: string
}

/** Search the library and pick an exercise; the session's discipline comes first. */
export function ExercisePicker({ open, onClose, onPick, discipline, title = 'Add exercise' }: ExercisePickerProps) {
  const { exercises } = useData()
  const [query, setQuery] = useState('')
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const hits = q ? exercises.filter((e) => e.name.toLowerCase().includes(q)) : exercises
    const order = discipline ? [discipline, ...DISCIPLINES.filter((d) => d !== discipline)] : DISCIPLINES
    return order.map((d) => ({ d, items: hits.filter((e) => e.discipline === d) })).filter((g) => g.items.length > 0)
  }, [exercises, query, discipline])

  return (
    <Sheet
      open={open}
      title={title}
      onClose={() => {
        setQuery('')
        onClose()
      }}
    >
      <div className={styles.search}>
        <Search size={18} strokeWidth={1.75} aria-hidden="true" />
        <input
          type="search"
          aria-label="Search exercises"
          placeholder="Search exercises"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={styles.input}
          enterKeyHint="search"
        />
      </div>
      <div className={styles.results}>
        {groups.length === 0 && <p className={styles.none}>No exercise matches. Add your own under Exercises.</p>}
        {groups.map((g) => (
          <section key={g.d} aria-label={DISCIPLINE_LABEL[g.d]}>
            <h3 className={styles.groupTitle}>
              <DisciplineDot discipline={g.d} />
              {DISCIPLINE_LABEL[g.d]}
            </h3>
            <ul className={styles.list}>
              {g.items.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    className={styles.item}
                    onClick={() => {
                      setQuery('')
                      onPick(e)
                    }}
                  >
                    {e.name}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Sheet>
  )
}
