import { Copy, Play, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useParams } from 'wouter'
import { useStartSession } from '../../app/actions.ts'
import { useAi } from '../../app/ai.tsx'
import { useData } from '../../app/data.tsx'
import { type ProgramDraft, useDraft } from '../../app/drafts.tsx'
import { useToast } from '../../app/toast.tsx'
import { newId } from '../../core/model/ids.ts'
import { cloneWeek, describeBlock, nextDay } from '../../core/model/program.ts'
import { type Block, type Day, DISCIPLINES, type Discipline, type Program } from '../../core/model/schemas.ts'
import { Button, buttonClass } from '../../ui/components/Button.tsx'
import { DISCIPLINE_LABEL } from '../../ui/components/Discipline.tsx'
import { EmptyState } from '../../ui/components/EmptyState.tsx'
import { Field } from '../../ui/components/Field.tsx'
import { IconButton } from '../../ui/components/IconButton.tsx'
import { SelectField } from '../../ui/components/SelectField.tsx'
import { TextArea } from '../../ui/components/TextArea.tsx'
import { ExercisePicker } from '../../ui/ExercisePicker.tsx'
import { Screen } from '../../ui/shell/Screen.tsx'
import { useUnits } from '../../ui/units.ts'
import { NotFound } from '../NotFound.tsx'
import { BlockSheet } from './BlockSheet.tsx'
import styles from './Programs.module.css'

/** A saved program, edited on a copy until Save. */
export function ProgramEditor() {
  const { id } = useParams<{ id: string }>()
  const data = useData()
  const program = data.programs.find((p) => p.id === id)
  if (!program) return <NotFound />
  return <ProgramForm key={program.id} initial={program} saved />
}

/** A program not saved yet (template, AI, blank). */
export function DraftEditor() {
  const { draft } = useDraft()
  if (!draft) {
    return (
      <Screen title="No draft" back={{ href: '/programs', label: 'Programs' }}>
        <EmptyState
          title="Nothing to edit"
          body="Drafts are kept until you save or leave them; this one is gone."
          action={
            <Link href="/programs/templates" className={buttonClass({ variant: 'primary' })}>
              Choose a template
            </Link>
          }
        />
      </Screen>
    )
  }
  return <ProgramForm key={draft.program.id} initial={draft.program} draft={draft} saved={false} />
}

const ORIGIN_NOTE: Record<ProgramDraft['origin'], string> = {
  new: 'A blank program: add days and exercises, then save.',
  template: 'A copy of the template: change anything, then save it to your programs.',
  ai: 'Written by your AI model. Read it through and change anything before saving: nothing is stored until you do.',
  adjust: 'Your AI model rewrote one week from what you actually did. Check it, then save to replace the week.',
}

function ProgramForm({ initial, draft, saved }: { initial: Program; draft?: ProgramDraft; saved: boolean }) {
  const data = useData()
  const ai = useAi()
  const toast = useToast()
  const units = useUnits()
  const start = useStartSession()
  const { setDraft } = useDraft()
  const [, navigate] = useLocation()
  const [program, setProgram] = useState<Program>(initial)
  const [dirty, setDirty] = useState(!saved)
  const [weekIndex, setWeekIndex] = useState(() => {
    if (draft?.origin === 'adjust') {
      const changed = initial.weeks.findIndex(
        (w, i) => data.programs.find((p) => p.id === initial.id)?.weeks[i]?.id !== w.id,
      )
      return Math.max(0, changed)
    }
    return 0
  })
  const [editing, setEditing] = useState<{ day: number; block: Block } | null>(null)
  const [adding, setAdding] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const advanced = data.settings.mode === 'advanced'
  const isActive = data.settings.activeProgramId === program.id
  const week = program.weeks[weekIndex] ?? program.weeks[0]
  const next = saved ? nextDay(program, data.sessions) : undefined
  // Exercises an AI draft introduced are not in the library until saved.
  const exName = (id: string) =>
    data.index.get(id)?.name ?? draft?.newExercises.find((e) => e.id === id)?.name ?? 'Unknown exercise'
  const exOf = (id: string) => data.index.get(id) ?? draft?.newExercises.find((e) => e.id === id)

  const change = (fn: (p: Program) => Program) => {
    setProgram((p) => {
      const n = fn(p)
      const disciplines = [
        ...new Set(n.weeks.flatMap((w) => w.days.map((d) => d.discipline ?? 'other'))),
      ] as Discipline[]
      return { ...n, disciplines: disciplines.length > 0 ? disciplines : n.disciplines }
    })
    setDirty(true)
  }
  const changeWeek = (fn: (days: Day[]) => Day[]) =>
    change((p) => ({ ...p, weeks: p.weeks.map((w, i) => (i === weekIndex ? { ...w, days: fn(w.days) } : w)) }))
  const changeDay = (d: number, fn: (day: Day) => Day) =>
    changeWeek((days) => days.map((x, i) => (i === d ? fn(x) : x)))

  async function save() {
    const final = { ...program, name: program.name.trim() || 'Program', updatedAt: new Date().toISOString() }
    for (const ex of draft?.newExercises ?? []) {
      if (JSON.stringify(final.weeks).includes(ex.id)) await data.put('exercises', ex)
    }
    await data.put('programs', final)
    if (!data.settings.activeProgramId || draft?.origin === 'adjust')
      await data.updateSettings({ activeProgramId: final.id })
    setDirty(false)
    if (draft) {
      setDraft(null)
      navigate(`/programs/${final.id}`, { replace: true })
    }
    toast(saved ? 'Program saved' : `${final.name} saved${!data.settings.activeProgramId ? ' and set as current' : ''}`)
  }

  return (
    <Screen
      title={program.name || 'Program'}
      subtitle={`${program.weeks.length} ${program.weeks.length === 1 ? 'week' : 'weeks'}${isActive ? ' · current program' : ''}`}
      back={{ href: '/programs', label: 'Programs' }}
    >
      {draft && (
        <div className={styles.notice} role="note">
          <p>{ORIGIN_NOTE[draft.origin]}</p>
          {draft.notes.length > 0 && (
            <ul>
              {draft.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          {draft.newExercises.length > 0 && (
            <p className={styles.muted}>
              New exercises added to your library on save: {draft.newExercises.map((e) => e.name).join(', ')}.
            </p>
          )}
        </div>
      )}

      <div className={styles.meta}>
        <Field
          label="Name"
          value={program.name}
          maxLength={80}
          onChange={(e) => change((p) => ({ ...p, name: e.target.value }))}
        />
        <TextArea
          label="Goal"
          rows={2}
          value={program.goal}
          maxLength={300}
          onChange={(e) => change((p) => ({ ...p, goal: e.target.value }))}
        />
      </div>

      <section aria-label="Weeks">
        <ul className={styles.weeks}>
          {program.weeks.map((w, i) => (
            <li key={w.id}>
              <button
                type="button"
                className={styles.weekChip}
                aria-pressed={i === weekIndex}
                onClick={() => setWeekIndex(i)}
              >
                {w.name || `Week ${i + 1}`}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              className={`${styles.weekChip} ${styles.addChip}`}
              onClick={() => {
                const last = program.weeks[program.weeks.length - 1]
                change((p) => ({
                  ...p,
                  weeks: [
                    ...p.weeks,
                    last
                      ? { ...cloneWeek(last), name: `Week ${p.weeks.length + 1}` }
                      : { id: newId(), name: `Week ${p.weeks.length + 1}`, days: [] },
                  ],
                }))
                setWeekIndex(program.weeks.length)
              }}
            >
              + Week
            </button>
          </li>
        </ul>
      </section>

      {week && (
        <section aria-label={week.name || `Week ${weekIndex + 1}`} className={styles.meta}>
          <div className={styles.weekBar}>
            <Field
              label="Week name"
              value={week.name ?? ''}
              maxLength={60}
              onChange={(e) =>
                change((p) => ({
                  ...p,
                  weeks: p.weeks.map((w, i) => (i === weekIndex ? { ...w, name: e.target.value } : w)),
                }))
              }
            />
            <div className={styles.dayActions}>
              <Button
                variant="plain"
                icon={<Copy size={18} strokeWidth={1.75} aria-hidden="true" />}
                onClick={() => {
                  change((p) => {
                    const weeks = [...p.weeks]
                    weeks.splice(weekIndex + 1, 0, { ...cloneWeek(week), name: `${week.name ?? 'Week'} (copy)` })
                    return { ...p, weeks }
                  })
                  setWeekIndex(weekIndex + 1)
                }}
              >
                Duplicate week
              </Button>
              {program.weeks.length > 1 && (
                <Button
                  variant="plain"
                  icon={<Trash2 size={18} strokeWidth={1.75} aria-hidden="true" />}
                  onClick={() => {
                    change((p) => ({ ...p, weeks: p.weeks.filter((_, i) => i !== weekIndex) }))
                    setWeekIndex(Math.max(0, weekIndex - 1))
                  }}
                >
                  Delete week
                </Button>
              )}
              {saved && ai.ready && (
                <Link
                  href={`/programs/generate?adjust=${program.id}&week=${weekIndex}`}
                  className={buttonClass({ variant: 'plain' })}
                >
                  <Sparkles size={18} strokeWidth={1.75} aria-hidden="true" />
                  Adjust with AI
                </Link>
              )}
            </div>
          </div>

          <ol className={styles.days}>
            {week.days.map((day, d) => (
              <li key={day.id} className={styles.day}>
                <div className={styles.dayFields}>
                  <Field
                    label={`Day ${d + 1}`}
                    value={day.name}
                    maxLength={60}
                    onChange={(e) => changeDay(d, (x) => ({ ...x, name: e.target.value }))}
                  />
                  <SelectField
                    label="Discipline"
                    value={day.discipline ?? 'other'}
                    options={DISCIPLINES.map((x) => ({ value: x, label: DISCIPLINE_LABEL[x] }))}
                    onChange={(e) => changeDay(d, (x) => ({ ...x, discipline: e.target.value as Discipline }))}
                  />
                  <IconButton
                    icon={Trash2}
                    label={`Delete ${day.name || `day ${d + 1}`}`}
                    onClick={() => changeWeek((days) => days.filter((_, i) => i !== d))}
                  />
                </div>
                {day.blocks.length > 0 && (
                  <ol className={styles.blocks}>
                    {day.blocks.map((b) => (
                      <li key={b.id} className={styles.block}>
                        <button
                          type="button"
                          className={styles.blockButton}
                          onClick={() => setEditing({ day: d, block: b })}
                        >
                          <span className={styles.blockName}>{exName(b.exerciseId)}</span>
                          <span className={styles.blockPlan}>
                            {describeBlock(b, exOf(b.exerciseId), units, advanced)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
                <div className={styles.dayActions}>
                  <Button
                    variant="plain"
                    icon={<Plus size={18} strokeWidth={2} aria-hidden="true" />}
                    onClick={() => setAdding(d)}
                  >
                    Add exercise
                  </Button>
                  {saved && !dirty && day.blocks.length > 0 && (
                    <Button
                      variant="plain"
                      icon={<Play size={18} strokeWidth={2} aria-hidden="true" />}
                      onClick={() => start.fromDay(program, { programId: program.id, week: weekIndex, day: d })}
                    >
                      {next?.week === weekIndex && next.day === d ? 'Start (next up)' : 'Start this day'}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <Button
            variant="secondary"
            full
            icon={<Plus size={18} strokeWidth={2} aria-hidden="true" />}
            onClick={() =>
              changeWeek((days) => [
                ...days,
                {
                  id: newId(),
                  name: `Day ${days.length + 1}`,
                  discipline: program.disciplines[0] ?? 'strength',
                  blocks: [],
                },
              ])
            }
          >
            Add day
          </Button>
        </section>
      )}

      {saved && (
        <div className={styles.danger}>
          {confirmDelete ? (
            <>
              <p>Delete this program? Logged sessions stay in History.</p>
              <div className={styles.dayActions}>
                <Button
                  variant="danger"
                  onClick={async () => {
                    await data.remove('programs', program.id)
                    if (isActive) await data.updateSettings({ activeProgramId: undefined })
                    navigate('/programs', { replace: true })
                    toast('Program deleted', [{ label: 'Undo', onClick: () => data.put('programs', initial) }])
                  }}
                >
                  Delete program
                </Button>
                <Button variant="plain" onClick={() => setConfirmDelete(false)}>
                  Keep it
                </Button>
              </div>
            </>
          ) : (
            <Button variant="plain" onClick={() => setConfirmDelete(true)}>
              Delete program
            </Button>
          )}
        </div>
      )}

      <div className={styles.footer}>
        {saved && !isActive && (
          <Button variant="secondary" onClick={() => data.updateSettings({ activeProgramId: program.id })}>
            Make current
          </Button>
        )}
        {draft && (
          <Button
            variant="plain"
            onClick={() => {
              setDraft(null)
              navigate(draft.origin === 'adjust' ? `/programs/${program.id}` : '/programs', { replace: true })
            }}
          >
            Discard
          </Button>
        )}
        <Button variant="primary" disabled={!dirty} onClick={save}>
          {dirty ? (draft ? 'Save program' : 'Save changes') : 'Saved'}
        </Button>
      </div>

      <BlockSheet
        block={editing?.block ?? null}
        onClose={() => setEditing(null)}
        onSave={(b) => {
          if (editing) changeDay(editing.day, (x) => ({ ...x, blocks: x.blocks.map((y) => (y.id === b.id ? b : y)) }))
          setEditing(null)
        }}
        onDelete={() => {
          if (editing)
            changeDay(editing.day, (x) => ({ ...x, blocks: x.blocks.filter((y) => y.id !== editing.block.id) }))
          setEditing(null)
        }}
      />
      <ExercisePicker
        open={adding !== null}
        {...(adding !== null && week?.days[adding]?.discipline ? { discipline: week.days[adding]?.discipline } : {})}
        onClose={() => setAdding(null)}
        onPick={(ex) => {
          if (adding === null) return
          const b: Block = {
            id: newId(),
            exerciseId: ex.id,
            sets: 3,
            ...(ex.metric === 'weight_reps' || ex.metric === 'reps' ? { reps: 8 } : {}),
            ...(ex.metric === 'distance_time' && ex.distance === undefined
              ? { distance: ex.discipline === 'swim' ? 100 : 200 }
              : {}),
            ...(ex.metric === 'time' ? { duration: 30 } : {}),
          }
          changeDay(adding, (x) => ({ ...x, blocks: [...x.blocks, b] }))
          setAdding(null)
          setEditing({ day: adding, block: b })
        }}
      />
    </Screen>
  )
}
