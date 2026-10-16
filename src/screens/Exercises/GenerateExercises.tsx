import { PencilLine, Sparkles } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { useAi } from '../../app/ai.tsx'
import { useData } from '../../app/data.tsx'
import { useToast } from '../../app/toast.tsx'
import { describeAiError } from '../../core/ai/client.ts'
import { type ExercisesAnswers, type ExercisesDraft, exercisesPrompt } from '../../core/ai/exercises.ts'
import { generateExercisesDraft } from '../../core/ai/features.ts'
import type { Discipline, Exercise } from '../../core/model/schemas.ts'
import { toDisplayDistance } from '../../core/model/units.ts'
import { Button, buttonClass } from '../../ui/components/Button.tsx'
import { ColorDot } from '../../ui/components/Discipline.tsx'
import { EmptyState } from '../../ui/components/EmptyState.tsx'
import { Field } from '../../ui/components/Field.tsx'
import { IconButton } from '../../ui/components/IconButton.tsx'
import { ListGroup, ListRow } from '../../ui/components/List.tsx'
import { RadioCards } from '../../ui/components/RadioCards.tsx'
import { Segmented } from '../../ui/components/Segmented.tsx'
import { Sheet } from '../../ui/components/Sheet.tsx'
import { TextArea } from '../../ui/components/TextArea.tsx'
import { ExerciseForm, METRIC_LABEL, MUSCLE_NAMES } from '../../ui/ExerciseForm.tsx'
import { SportsPicker, sportNames } from '../../ui/SportsPicker.tsx'
import { Screen } from '../../ui/shell/Screen.tsx'
import { useUnits } from '../../ui/units.ts'
import styles from '../Programs/Generate.module.css'
import own from './GenerateExercises.module.css'

const BACK = { href: '/exercises', label: 'Exercises' }

/** Asks a model for exercises for the chosen sports, then lets the user pick and edit them before adding them. */
export function GenerateExercises() {
  const data = useData()
  const ai = useAi()
  const toast = useToast()
  const units = useUnits()
  const [, navigate] = useLocation()
  const advanced = data.settings.mode === 'advanced'

  const [picked, setPicked] = useState<string[]>([])
  const [other, setOther] = useState('')
  const [level, setLevel] = useState<ExercisesAnswers['level']>('beginner')
  const [size, setSize] = useState<ExercisesAnswers['size']>('complete')
  const [equipment, setEquipment] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const abort = useRef<AbortController | null>(null)

  const [draft, setDraft] = useState<ExercisesDraft | null>(null)
  const [left, setLeft] = useState<ReadonlySet<string>>(new Set())
  const [editing, setEditing] = useState<Exercise | null>(null)
  const [saving, setSaving] = useState(false)

  if (!ai.ready) {
    return (
      <Screen title="Exercises with AI" back={BACK}>
        <EmptyState
          icon={Sparkles}
          title="No AI model set up"
          body="Exercises can always be created by hand. To have a library proposed for your sports, add a provider, a model and your own key; requests go straight from this device to that provider."
          action={
            <Link href="/settings/ai" className={buttonClass({ variant: 'primary' })}>
              Set up AI
            </Link>
          }
        />
      </Screen>
    )
  }

  const athlete = { exercises: data.exercises, disciplines: data.disciplines }

  async function run() {
    setError(undefined)
    const sports = sportNames(picked, other, data.disciplineIndex)
    if (sports.length === 0) {
      setError('Pick or type at least one sport.')
      return
    }
    setBusy(true)
    const ctrl = new AbortController()
    abort.current = ctrl
    try {
      const model = await ai.model()
      const pair = exercisesPrompt({ sports, level, size, equipment, notes: advanced ? notes : '' }, athlete)
      setDraft(await generateExercisesDraft(model, pair, athlete, ctrl.signal))
      setLeft(new Set())
      window.scrollTo(0, 0)
    } catch (e) {
      setError(describeAiError(e))
    } finally {
      setBusy(false)
      abort.current = null
    }
  }

  if (draft) {
    const chosen = draft.exercises.filter((e) => !left.has(e.id))
    const newOnes = new Map(draft.disciplines.map((d) => [d.id, d]))
    const disciplineOf = (id: string | undefined): Discipline | undefined =>
      id === undefined ? undefined : (data.disciplineIndex.get(id) ?? newOnes.get(id))
    const groups = [
      ...data.disciplines.map((d) => ({ d: d as Discipline | undefined, isNew: false })),
      ...draft.disciplines.map((d) => ({ d: d as Discipline | undefined, isNew: true })),
      { d: undefined, isNew: false },
    ]
      .map((g) => ({
        ...g,
        items: draft.exercises.filter((e) => disciplineOf(e.disciplineId)?.id === g.d?.id),
      }))
      .filter((g) => g.items.length > 0)

    const line = (e: Exercise) =>
      [
        METRIC_LABEL[e.metric],
        e.distance !== undefined
          ? `${Math.round(toDisplayDistance(e.distance, units.distanceUnit))} ${units.distanceUnit}`
          : '',
        e.pace ? `pace per ${e.pace === 'km' ? 'km' : '100 m'}` : '',
        advanced && e.muscles ? e.muscles.map((m) => MUSCLE_NAMES[m]).join(', ') : '',
      ]
        .filter(Boolean)
        .join(' · ')

    async function add() {
      setSaving(true)
      const used = new Set(chosen.map((e) => e.disciplineId))
      for (const d of draft?.disciplines ?? []) if (used.has(d.id)) await data.put('disciplines', d)
      for (const e of chosen) await data.put('exercises', e)
      toast(`${chosen.length} ${chosen.length === 1 ? 'exercise' : 'exercises'} added`)
      navigate('/exercises')
    }

    return (
      <Screen
        title="Proposed exercises"
        subtitle={`${draft.exercises.length} from ${ai.config.modelId ?? 'the model'} · pick and edit before adding`}
        back={BACK}
      >
        <p className={styles.lead}>
          Untick what you do not want; open one to rename it or change how it is measured. Nothing is in your library
          until you add it.
        </p>
        {draft.skipped.length > 0 && (
          <p className={styles.lead}>Already in your library, so left out: {draft.skipped.join(', ')}.</p>
        )}
        {groups.map((g) => (
          <ListGroup
            key={g.d?.id ?? 'none'}
            title={g.d ? (g.isNew ? `${g.d.name} (new discipline)` : g.d.name) : 'No discipline'}
          >
            {g.items.map((e) => (
              <ListRow
                key={e.id}
                leading={<ColorDot color={g.d?.color} />}
                title={e.name}
                subtitle={line(e)}
                trailing={
                  <span className={own.controls}>
                    <IconButton label={`Edit ${e.name}`} icon={PencilLine} onClick={() => setEditing(e)} />
                    <label className={own.pick}>
                      <input
                        type="checkbox"
                        aria-label={`Add ${e.name}`}
                        checked={!left.has(e.id)}
                        onChange={(x) => {
                          const next = new Set(left)
                          if (x.target.checked) next.delete(e.id)
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
        <div className={own.footer}>
          <Button variant="primary" size="large" full loading={saving} disabled={chosen.length === 0} onClick={add}>
            {chosen.length === 0
              ? 'Nothing ticked'
              : `Add ${chosen.length} ${chosen.length === 1 ? 'exercise' : 'exercises'}`}
          </Button>
          <Button variant="plain" full onClick={() => setDraft(null)}>
            Back to the questions
          </Button>
        </div>

        <Sheet open={editing !== null} title="Edit exercise" onClose={() => setEditing(null)}>
          {editing && (
            <ExerciseForm
              key={editing.id}
              exercise={editing}
              onDone={() => setEditing(null)}
              draft={{
                disciplines: draft.disciplines,
                names: draft.exercises.filter((x) => x.id !== editing.id).map((x) => x.name),
                onSave(ex, created) {
                  setDraft({
                    ...draft,
                    exercises: draft.exercises.map((x) => (x.id === ex.id ? ex : x)),
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

  return (
    <Screen
      title="Exercises with AI"
      subtitle={`${ai.config.modelId ?? ''} · the result is a list you pick from and edit`}
      back={BACK}
    >
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault()
          run()
        }}
      >
        <p className={styles.lead}>
          Proposes the exercises your sports need, each with its discipline and how it is measured. What you already
          have is left out.
        </p>
        <SportsPicker
          value={picked}
          onChange={setPicked}
          other={other}
          onOther={setOther}
          hint="A sport you do not have yet becomes a new discipline when you add its exercises."
        />
        <Segmented
          label="Level"
          options={[
            { value: 'beginner', label: 'Beginner' },
            { value: 'intermediate', label: 'Intermediate' },
            { value: 'advanced', label: 'Advanced' },
          ]}
          value={level}
          onChange={setLevel}
        />
        <RadioCards
          label="How many"
          options={[
            {
              value: 'essentials',
              title: 'Essentials',
              body: 'About 8 per sport: the main movements to start with.',
            },
            {
              value: 'complete',
              title: 'Complete',
              body: 'About 20 to 25 per sport: accessories, technique drills, conditioning and warm-up too.',
            },
          ]}
          value={size}
          onChange={setSize}
        />
        <Field
          label="Equipment and facilities (optional)"
          placeholder="Full gym, 25 m pool, 400 m track"
          value={equipment}
          onChange={(e) => setEquipment(e.target.value)}
        />
        {advanced && (
          <TextArea
            label="Anything else"
            placeholder="No overhead pressing, include mobility work…"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
          />
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <Button
          type="submit"
          variant="primary"
          size="large"
          full
          loading={busy}
          icon={<Sparkles size={20} strokeWidth={1.75} aria-hidden="true" />}
        >
          {busy ? 'Proposing exercises…' : 'Propose exercises'}
        </Button>
        {busy && (
          <>
            <p className={styles.lead} role="status">
              This often takes under a minute, several minutes with a model running on this computer.
            </p>
            <Button variant="plain" full onClick={() => abort.current?.abort()}>
              Stop
            </Button>
          </>
        )}
      </form>
    </Screen>
  )
}
