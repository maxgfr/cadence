import { PencilLine } from 'lucide-react'
import { useState } from 'react'
import { Redirect, useLocation } from 'wouter'
import { useData } from '../../app/data.tsx'
import { useDraft } from '../../app/drafts.tsx'
import { useT } from '../../app/i18n.tsx'
import { useToast } from '../../app/toast.tsx'
import type { ExercisesDraft } from '../../core/ai/exercises.ts'
import type { Discipline, Exercise } from '../../core/model/schemas.ts'
import { toDisplayDistance } from '../../core/model/units.ts'
import { Button } from '../../ui/components/Button.tsx'
import { ColorDot } from '../../ui/components/Discipline.tsx'
import { IconButton } from '../../ui/components/IconButton.tsx'
import { ListGroup, ListRow } from '../../ui/components/List.tsx'
import { Sheet } from '../../ui/components/Sheet.tsx'
import { ExerciseForm } from '../../ui/ExerciseForm.tsx'
import { Screen } from '../../ui/shell/Screen.tsx'
import { useUnits } from '../../ui/units.ts'
import styles from './ReviewExercises.module.css'

/** The exercises the coach proposed: picked and edited before they reach the library. */
export function ReviewExercises() {
  const { exercises: proposed } = useDraft()
  if (!proposed) return <Redirect to="/exercises" replace />
  return <Review initial={proposed} />
}

function Review({ initial }: { initial: ExercisesDraft }) {
  const data = useData()
  const { setExercises } = useDraft()
  const toast = useToast()
  const units = useUnits()
  const t = useT()
  const x = t.exercises.ai
  const [, navigate] = useLocation()
  const advanced = data.settings.mode === 'advanced'
  const [draft, setDraft] = useState(initial)
  const [left, setLeft] = useState<ReadonlySet<string>>(new Set())
  const [editing, setEditing] = useState<Exercise | null>(null)
  const [saving, setSaving] = useState(false)

  const chosen = draft.exercises.filter((e) => !left.has(e.id))
  const newOnes = new Map(draft.disciplines.map((d) => [d.id, d]))
  const disciplineOf = (id: string | undefined): Discipline | undefined =>
    id === undefined ? undefined : (data.disciplineIndex.get(id) ?? newOnes.get(id))
  const groups = [
    ...data.disciplines.map((d) => ({ d: d as Discipline | undefined, isNew: false })),
    ...draft.disciplines.map((d) => ({ d: d as Discipline | undefined, isNew: true })),
    { d: undefined, isNew: false },
  ]
    .map((g) => ({ ...g, items: draft.exercises.filter((e) => disciplineOf(e.disciplineId)?.id === g.d?.id) }))
    .filter((g) => g.items.length > 0)

  const line = (e: Exercise) =>
    [
      t.labels.metric[e.metric],
      e.distance !== undefined
        ? `${Math.round(toDisplayDistance(e.distance, units.distanceUnit))} ${units.distanceUnit}`
        : '',
      e.pace ? x.pacePer(e.pace === 'km' ? 'km' : '100 m') : '',
      advanced && e.muscles ? e.muscles.map((m) => t.labels.muscle[m]).join(', ') : '',
    ]
      .filter(Boolean)
      .join(' · ')

  async function add() {
    setSaving(true)
    const used = new Set(chosen.map((e) => e.disciplineId))
    for (const d of draft.disciplines) if (used.has(d.id)) await data.put('disciplines', d)
    for (const e of chosen) await data.put('exercises', e)
    toast(x.added(chosen.length))
    setExercises(null)
    navigate('/exercises')
  }

  return (
    <Screen
      title={x.proposed}
      subtitle={x.proposedSubtitle(draft.exercises.length)}
      back={{ href: '/exercises', label: t.common.exercises }}
    >
      <p className={styles.lead}>{x.reviewLead}</p>
      {draft.skipped.length > 0 && <p className={styles.lead}>{x.skipped(draft.skipped.join(', '))}</p>}
      {groups.map((g) => (
        <ListGroup
          key={g.d?.id ?? 'none'}
          title={g.d ? (g.isNew ? x.newDiscipline(g.d.name) : g.d.name) : t.common.noDiscipline}
        >
          {g.items.map((e) => (
            <ListRow
              key={e.id}
              leading={<ColorDot color={g.d?.color} />}
              title={e.name}
              subtitle={line(e)}
              trailing={
                <span className={styles.controls}>
                  <IconButton label={x.editOne(e.name)} icon={PencilLine} onClick={() => setEditing(e)} />
                  <label className={styles.pick}>
                    <input
                      type="checkbox"
                      aria-label={x.addOne(e.name)}
                      checked={!left.has(e.id)}
                      onChange={(ev) => {
                        const next = new Set(left)
                        if (ev.target.checked) next.delete(e.id)
                        else next.add(e.id)
                        setLeft(next)
                      }}
                    />
                  </label>
                </span>
              }
            />
          ))}
        </ListGroup>
      ))}
      <div className={styles.footer}>
        <Button variant="primary" size="large" full loading={saving} disabled={chosen.length === 0} onClick={add}>
          {chosen.length === 0 ? x.nothingTicked : x.addN(chosen.length)}
        </Button>
        <Button
          variant="plain"
          full
          onClick={() => {
            setExercises(null)
            navigate('/exercises')
          }}
        >
          {x.discard}
        </Button>
      </div>

      <Sheet open={editing !== null} title={t.exercises.editExercise} onClose={() => setEditing(null)}>
        {editing && (
          <ExerciseForm
            key={editing.id}
            exercise={editing}
            onDone={() => setEditing(null)}
            draft={{
              disciplines: draft.disciplines,
              names: draft.exercises.filter((y) => y.id !== editing.id).map((y) => y.name),
              onSave(ex, created) {
                setDraft({
                  ...draft,
                  exercises: draft.exercises.map((y) => (y.id === ex.id ? ex : y)),
                  disciplines: created ? [...draft.disciplines, created] : draft.disciplines,
                })
                setEditing(null)
              },
            }}
          />
        )}
      </Sheet>
    </Screen>
  )
}
