import { Dumbbell, Plus, Search, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'wouter'
import { useData } from '../../app/data.tsx'
import type { Discipline, Exercise } from '../../core/model/schemas.ts'
import { toDisplayDistance } from '../../core/model/units.ts'
import { trainedExercises } from '../../core/stats/metrics.ts'
import { Button, buttonClass } from '../../ui/components/Button.tsx'
import { DisciplineDot } from '../../ui/components/Discipline.tsx'
import { EmptyState } from '../../ui/components/EmptyState.tsx'
import { ListGroup, ListRow } from '../../ui/components/List.tsx'
import { Sheet } from '../../ui/components/Sheet.tsx'
import { DisciplineForm } from '../../ui/DisciplineForm.tsx'
import { ExerciseForm, METRIC_LABEL } from '../../ui/ExerciseForm.tsx'
import { Screen } from '../../ui/shell/Screen.tsx'
import { useUnits } from '../../ui/units.ts'
import styles from './Exercises.module.css'

type Editing = { kind: 'exercise'; value: Exercise | null } | { kind: 'discipline'; value: Discipline | null } | null

export function Exercises() {
  const data = useData()
  const units = useUnits()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Editing>(null)
  const trained = useMemo(
    () => new Set(trainedExercises(data.sessions, data.index).map((e) => e.id)),
    [data.sessions, data.index],
  )
  const q = query.trim().toLowerCase()
  const hits = q ? data.exercises.filter((e) => e.name.toLowerCase().includes(q)) : data.exercises
  const known = new Set(data.disciplines.map((d) => d.id))
  const groups = [
    ...data.disciplines.map((d) => ({ id: d.id as string | undefined, name: d.name })),
    { id: undefined, name: 'No discipline' },
  ]
    .map((g) => ({
      ...g,
      items: hits.filter((e) =>
        g.id === undefined ? !e.disciplineId || !known.has(e.disciplineId) : e.disciplineId === g.id,
      ),
    }))
    .filter((g) => g.items.length > 0)
  const empty = data.exercises.length === 0 && data.disciplines.length === 0

  return (
    <Screen
      title="Exercises"
      subtitle={`${data.exercises.length} ${data.exercises.length === 1 ? 'exercise' : 'exercises'} · ${data.disciplines.length} ${data.disciplines.length === 1 ? 'discipline' : 'disciplines'}`}
    >
      <div className={styles.actions}>
        <Button
          variant="primary"
          icon={<Plus size={18} strokeWidth={2} aria-hidden="true" />}
          onClick={() => setEditing({ kind: 'exercise', value: null })}
        >
          New exercise
        </Button>
        <Button
          variant="secondary"
          icon={<Plus size={18} strokeWidth={2} aria-hidden="true" />}
          onClick={() => setEditing({ kind: 'discipline', value: null })}
        >
          New discipline
        </Button>
        <Link href="/exercises/generate" className={buttonClass({ variant: 'secondary' })}>
          <Sparkles size={18} strokeWidth={1.75} aria-hidden="true" />
          With AI
        </Link>
      </div>

      {empty ? (
        <EmptyState
          icon={Dumbbell}
          title="Your library is empty"
          body="Create the disciplines you train (Gym, Swimming, Climbing…) and their exercises, have them proposed with AI, or load a demo sport as a starting point."
          action={
            <Link href="/settings/demo" className={buttonClass({ variant: 'secondary' })}>
              Load a demo sport
            </Link>
          }
        />
      ) : (
        <>
          {data.disciplines.length > 0 && (
            <ListGroup title="Disciplines">
              {data.disciplines.map((d) => (
                <ListRow
                  key={d.id}
                  leading={<DisciplineDot disciplineId={d.id} />}
                  title={d.name}
                  subtitle={`${data.exercises.filter((e) => e.disciplineId === d.id).length} exercises`}
                  onClick={() => setEditing({ kind: 'discipline', value: d })}
                  chevron
                />
              ))}
            </ListGroup>
          )}
          {data.exercises.length > 0 && (
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
          )}
          {groups.map((g) => (
            <ListGroup key={g.id ?? 'none'} title={g.name}>
              {g.items.map((e) => (
                <ListRow
                  key={e.id}
                  leading={
                    <DisciplineDot
                      disciplineId={e.disciplineId && known.has(e.disciplineId) ? e.disciplineId : undefined}
                    />
                  }
                  title={e.name}
                  subtitle={[
                    METRIC_LABEL[e.metric],
                    e.distance !== undefined
                      ? `${Math.round(toDisplayDistance(e.distance, units.distanceUnit))} ${units.distanceUnit}`
                      : '',
                    trained.has(e.id) ? 'logged' : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  onClick={() => setEditing({ kind: 'exercise', value: e })}
                  chevron
                />
              ))}
            </ListGroup>
          ))}
          {q && hits.length === 0 && (
            <div className={styles.none}>
              <p>No exercise called “{query.trim()}”.</p>
              <Button
                variant="secondary"
                icon={<Plus size={18} strokeWidth={2} aria-hidden="true" />}
                onClick={() => setEditing({ kind: 'exercise', value: null })}
              >
                Create it
              </Button>
            </div>
          )}
        </>
      )}

      <Sheet
        open={editing !== null}
        title={
          editing?.kind === 'discipline'
            ? editing.value
              ? 'Edit discipline'
              : 'New discipline'
            : editing?.value
              ? 'Edit exercise'
              : 'New exercise'
        }
        onClose={() => setEditing(null)}
      >
        {editing?.kind === 'exercise' && (
          <ExerciseForm
            key={editing.value?.id ?? 'new'}
            exercise={editing.value}
            initialName={editing.value ? '' : query.trim()}
            onDone={() => setEditing(null)}
          />
        )}
        {editing?.kind === 'discipline' && (
          <DisciplineForm key={editing.value?.id ?? 'new'} discipline={editing.value} onDone={() => setEditing(null)} />
        )}
      </Sheet>
    </Screen>
  )
}
