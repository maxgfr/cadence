import { Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useData } from '../app/data.tsx'
import type { Exercise } from '../core/model/schemas.ts'
import { Button } from './components/Button.tsx'
import { DisciplineDot } from './components/Discipline.tsx'
import { Sheet } from './components/Sheet.tsx'
import { ExerciseForm } from './ExerciseForm.tsx'
import styles from './ExercisePicker.module.css'

export interface ExercisePickerProps {
  open: boolean
  onClose: () => void
  onPick: (exercise: Exercise) => void
  /** Listed first, and the discipline of an exercise created from here. */
  disciplineId?: string | undefined
  title?: string
}

/** Search your exercises and pick one, or create it on the spot (it is then picked). */
export function ExercisePicker({ open, onClose, onPick, disciplineId, title = 'Add exercise' }: ExercisePickerProps) {
  const { exercises, disciplines } = useData()
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const hits = q ? exercises.filter((e) => e.name.toLowerCase().includes(q)) : exercises
    const known = new Set(disciplines.map((d) => d.id))
    const order = [
      ...disciplines.filter((d) => d.id === disciplineId),
      ...disciplines.filter((d) => d.id !== disciplineId),
    ].map((d) => ({ id: d.id as string | undefined, name: d.name }))
    order.push({ id: undefined, name: 'No discipline' })
    return order
      .map((g) => ({
        ...g,
        items: hits.filter((e) =>
          g.id === undefined ? !e.disciplineId || !known.has(e.disciplineId) : e.disciplineId === g.id,
        ),
      }))
      .filter((g) => g.items.length > 0)
  }, [exercises, disciplines, query, disciplineId])

  const close = () => {
    setQuery('')
    setCreating(false)
    onClose()
  }

  return (
    <Sheet open={open} title={creating ? 'New exercise' : title} onClose={close}>
      {creating ? (
        <ExerciseForm
          exercise={null}
          initialName={query.trim()}
          {...(disciplineId ? { initialDisciplineId: disciplineId } : {})}
          onDone={(saved) => {
            setCreating(false)
            setQuery('')
            if (saved) onPick(saved)
          }}
        />
      ) : (
        <>
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
          <Button
            variant="secondary"
            full
            icon={<Plus size={18} strokeWidth={2} aria-hidden="true" />}
            onClick={() => setCreating(true)}
          >
            {query.trim() ? `Create “${query.trim()}”` : 'Create an exercise'}
          </Button>
          <div className={styles.results}>
            {exercises.length === 0 && (
              <p className={styles.none}>
                Your library is empty: create your first exercise, or load the demo from Settings.
              </p>
            )}
            {exercises.length > 0 && groups.length === 0 && (
              <p className={styles.none}>No exercise matches “{query.trim()}”.</p>
            )}
            {groups.map((g) => (
              <section key={g.id ?? 'none'} aria-label={g.name}>
                <h3 className={styles.groupTitle}>
                  <DisciplineDot disciplineId={g.id} />
                  {g.name}
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
        </>
      )}
    </Sheet>
  )
}
