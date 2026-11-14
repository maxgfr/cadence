import { Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useData } from '../app/data.tsx'
import { useT } from '../app/i18n.tsx'
import { searchExercises } from '../core/library/search.ts'
import type { Exercise } from '../core/model/schemas.ts'
import type { PresetSlug } from '../core/presets/catalog.ts'
import { ExerciseArt } from './art/ExerciseArt.tsx'
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

/**
 * Search your exercises and pick one: what matches, then related exercises, then presets to add on the spot; or
 * create it (it is then picked).
 */
export function ExercisePicker({ open, onClose, onPick, disciplineId, title }: ExercisePickerProps) {
  const { exercises, disciplines, settings, addPresetExercise } = useData()
  const t = useT()
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [adding, setAdding] = useState<PresetSlug | null>(null)
  const found = useMemo(
    () => searchExercises(query, exercises, settings.exerciseLanguage),
    [query, exercises, settings.exerciseLanguage],
  )
  const groups = useMemo(() => {
    const known = new Set(disciplines.map((d) => d.id))
    const order = [
      ...disciplines.filter((d) => d.id === disciplineId),
      ...disciplines.filter((d) => d.id !== disciplineId),
    ].map((d) => ({ id: d.id as string | undefined, name: d.name }))
    order.push({ id: undefined, name: t.common.noDiscipline })
    return order
      .map((g) => ({
        ...g,
        items: found.matches.filter((e) =>
          g.id === undefined ? !e.disciplineId || !known.has(e.disciplineId) : e.disciplineId === g.id,
        ),
      }))
      .filter((g) => g.items.length > 0)
  }, [found.matches, disciplines, disciplineId, t])

  const close = () => {
    setQuery('')
    setCreating(false)
    onClose()
  }
  const pick = (e: Exercise) => {
    setQuery('')
    onPick(e)
  }
  const addPreset = async (slug: PresetSlug) => {
    setAdding(slug)
    try {
      const added = await addPresetExercise(slug)
      if (added) pick(added)
    } finally {
      setAdding(null)
    }
  }
  const row = (e: Exercise, withDot = false) => (
    <li key={e.id}>
      <button type="button" className={styles.item} onClick={() => pick(e)}>
        <ExerciseArt exercise={e} size="thumb" />
        {withDot && <DisciplineDot disciplineId={e.disciplineId} />}
        <span className={styles.name}>{e.name}</span>
      </button>
    </li>
  )
  const nothing = groups.length === 0 && found.related.length === 0 && found.presets.length === 0

  return (
    <Sheet
      open={open}
      title={creating ? t.forms.picker.newExercise : (title ?? t.forms.picker.title)}
      onClose={close}
      tall
    >
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
        <div className={styles.pane}>
          <div className={styles.top}>
            <div className={styles.search}>
              <Search size={18} strokeWidth={1.75} aria-hidden="true" />
              <input
                type="search"
                aria-label={t.forms.picker.search}
                placeholder={t.forms.picker.search}
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
              {query.trim() ? t.forms.picker.createNamed(query.trim()) : t.forms.picker.create}
            </Button>
          </div>
          <div className={styles.results}>
            {exercises.length === 0 && found.presets.length === 0 && (
              <p className={styles.none}>{t.forms.picker.libraryEmpty}</p>
            )}
            {exercises.length > 0 && nothing && <p className={styles.none}>{t.forms.picker.noMatch(query.trim())}</p>}
            {groups.map((g) => (
              <section key={g.id ?? 'none'} aria-label={g.name}>
                <h3 className={styles.groupTitle}>
                  <DisciplineDot disciplineId={g.id} />
                  {g.name}
                </h3>
                <ul className={styles.list}>{g.items.map((e) => row(e))}</ul>
              </section>
            ))}
            {found.related.length > 0 && (
              <section aria-label={t.forms.picker.related}>
                <h3 className={styles.groupTitle}>{t.forms.picker.related}</h3>
                <ul className={styles.list}>{found.related.map((e) => row(e, true))}</ul>
              </section>
            )}
            {found.presets.length > 0 && (
              // Folded while their own exercises answer the search; open when nothing of theirs does.
              <details
                key={found.matches.length === 0 ? 'open' : 'folded'}
                className={styles.presets}
                open={found.matches.length === 0}
              >
                <summary className={styles.groupTitle}>{t.forms.picker.fromPresets(found.presets.length)}</summary>
                <ul className={styles.list}>
                  {found.presets.map((p) => (
                    <li key={p.slug}>
                      <button
                        type="button"
                        className={styles.item}
                        onClick={() => addPreset(p.slug)}
                        disabled={adding !== null}
                        aria-busy={adding === p.slug}
                      >
                        <ExerciseArt exercise={p} size="thumb" />
                        <span className={styles.name}>
                          {p.name}
                          <span className={styles.hint}>{t.forms.picker.presetHint}</span>
                        </span>
                        <Plus size={18} strokeWidth={2} aria-hidden="true" className={styles.add} />
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>
      )}
    </Sheet>
  )
}
