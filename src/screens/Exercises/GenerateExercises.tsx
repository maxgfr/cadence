import { PencilLine, Sparkles } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { useAi } from '../../app/ai.tsx'
import { useData } from '../../app/data.tsx'
import { useT } from '../../app/i18n.tsx'
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
import { ExerciseForm } from '../../ui/ExerciseForm.tsx'
import { SportsPicker, sportNames } from '../../ui/SportsPicker.tsx'
import { Screen } from '../../ui/shell/Screen.tsx'
import { useUnits } from '../../ui/units.ts'
import styles from '../Programs/Generate.module.css'
import own from './GenerateExercises.module.css'

/** Asks a model for exercises for the chosen sports, then lets the user pick and edit them before adding them. */
export function GenerateExercises() {
  const data = useData()
  const ai = useAi()
  const toast = useToast()
  const units = useUnits()
  const t = useT()
  const x = t.exercises.ai
  const back = { href: '/exercises', label: t.common.exercises }
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
      <Screen title={x.title} back={back}>
        <EmptyState
          icon={Sparkles}
          title={x.notSetUpTitle}
          body={x.notSetUpBody}
          action={
            <Link href="/settings/ai" className={buttonClass({ variant: 'primary' })}>
              {x.setUp}
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
      setError(x.pickSport)
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
      for (const d of draft?.disciplines ?? []) if (used.has(d.id)) await data.put('disciplines', d)
      for (const e of chosen) await data.put('exercises', e)
      toast(x.added(chosen.length))
      navigate('/exercises')
    }

    return (
      <Screen
        title={x.proposed}
        subtitle={x.proposedSubtitle(draft.exercises.length, ai.config.modelId ?? x.theModel)}
        back={back}
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
                  <span className={own.controls}>
                    <IconButton label={x.editOne(e.name)} icon={PencilLine} onClick={() => setEditing(e)} />
                    <label className={own.pick}>
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
        <div className={own.footer}>
          <Button variant="primary" size="large" full loading={saving} disabled={chosen.length === 0} onClick={add}>
            {chosen.length === 0 ? x.nothingTicked : x.addN(chosen.length)}
          </Button>
          <Button variant="plain" full onClick={() => setDraft(null)}>
            {x.backToQuestions}
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

  return (
    <Screen title={x.title} subtitle={x.formSubtitle(ai.config.modelId ?? '')} back={back}>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault()
          run()
        }}
      >
        <p className={styles.lead}>{x.formLead}</p>
        <SportsPicker value={picked} onChange={setPicked} other={other} onOther={setOther} hint={x.sportsHint} />
        <Segmented
          label={t.common.level}
          options={[
            { value: 'beginner', label: x.beginner },
            { value: 'intermediate', label: x.intermediate },
            { value: 'advanced', label: x.advanced },
          ]}
          value={level}
          onChange={setLevel}
        />
        <RadioCards
          label={x.howMany}
          options={[
            { value: 'essentials', title: x.essentials, body: x.essentialsBody },
            { value: 'complete', title: x.complete, body: x.completeBody },
          ]}
          value={size}
          onChange={setSize}
        />
        <Field
          label={x.equipment}
          placeholder={x.equipmentPlaceholder}
          value={equipment}
          onChange={(e) => setEquipment(e.target.value)}
        />
        {advanced && (
          <TextArea
            label={x.anythingElse}
            placeholder={x.anythingElsePlaceholder}
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
          {busy ? x.proposing : x.propose}
        </Button>
        {busy && (
          <>
            <p className={styles.lead} role="status">
              {x.wait}
            </p>
            <Button variant="plain" full onClick={() => abort.current?.abort()}>
              {x.stop}
            </Button>
          </>
        )}
      </form>
    </Screen>
  )
}
