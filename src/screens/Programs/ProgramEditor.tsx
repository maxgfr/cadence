import { Copy, Play, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useParams } from 'wouter'
import { useStartSession } from '../../app/actions.ts'
import { useCoachScreen } from '../../app/coach.tsx'
import { useData } from '../../app/data.tsx'
import { type ProgramDraft, useDraft } from '../../app/drafts.tsx'
import { useT } from '../../app/i18n.tsx'
import { useToast } from '../../app/toast.tsx'
import { newId } from '../../core/model/ids.ts'
import {
  cloneWeek,
  completedDays,
  describeBlock,
  isSessionSet,
  nextDay,
  restartProgram,
} from '../../core/model/program.ts'
import type { Block, Day, Program } from '../../core/model/schemas.ts'
import { Button, buttonClass } from '../../ui/components/Button.tsx'
import { EmptyState } from '../../ui/components/EmptyState.tsx'
import { Field } from '../../ui/components/Field.tsx'
import { IconButton } from '../../ui/components/IconButton.tsx'
import { Segmented } from '../../ui/components/Segmented.tsx'
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
  const t = useT()
  if (!draft) {
    const m = t.programs.editor
    return (
      <Screen title={m.noDraft} back={{ href: '/programs', label: t.programs.title }}>
        <EmptyState
          title={m.nothingToEdit}
          body={m.draftGone}
          action={
            <Link href="/programs" className={buttonClass({ variant: 'primary' })}>
              {m.goToPrograms}
            </Link>
          }
        />
      </Screen>
    )
  }
  return <ProgramForm key={draft.program.id} initial={draft.program} draft={draft} saved={false} />
}

function ProgramForm({ initial, draft, saved }: { initial: Program; draft?: ProgramDraft; saved: boolean }) {
  const data = useData()
  const t = useT()
  const m = t.programs.editor
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
  const week = program.weeks[weekIndex] ?? program.weeks[0]
  const set = isSessionSet(program)
  // A set's items are sessions, a plan's are days.
  const unitN = set ? t.programs.sessionN : t.programs.dayN
  const unitLower = set ? m.sessionLower : m.dayLower
  const next = saved ? nextDay(program, data.sessions) : undefined
  // Exercises an AI draft introduced are not in the library until saved.
  const exName = (id: string) =>
    data.index.get(id)?.name ?? draft?.newExercises.find((e) => e.id === id)?.name ?? m.unknownExercise
  const exOf = (id: string) => data.index.get(id) ?? draft?.newExercises.find((e) => e.id === id)

  // The coach reads the week on show, to answer "is it balanced?" or rewrite it, without leaving the editor.
  const shown = (week?.days ?? [])
    .map(
      (d) =>
        `${d.name}: ${d.blocks.map((b) => `${exName(b.exerciseId)} ${describeBlock(b, exOf(b.exerciseId), units)}`).join(', ') || 'no exercise yet'}`,
    )
    .join(' | ')
  useCoachScreen({
    where: [
      saved
        ? `editing their program "${program.name}" (id ${program.id})`
        : `looking at a program draft, "${program.name}", not saved yet`,
      `${set ? 'its sessions' : `week ${weekIndex + 1} of ${program.weeks.length}`}: ${shown || 'empty'}`,
    ].join('; '),
    starters: [
      t.coach.starters.balance,
      ...(saved && !set ? [t.coach.starters.adjustWeek(weekIndex + 1)] : []),
      t.coach.starters.addExercise,
    ],
  })

  const change = (fn: (p: Program) => Program) => {
    setProgram(fn)
    setDirty(true)
  }
  const changeWeek = (fn: (days: Day[]) => Day[]) =>
    change((p) => ({ ...p, weeks: p.weeks.map((w, i) => (i === weekIndex ? { ...w, days: fn(w.days) } : w)) }))
  const changeDay = (d: number, fn: (day: Day) => Day) =>
    changeWeek((days) => days.map((x, i) => (i === d ? fn(x) : x)))

  async function save() {
    const final = {
      ...program,
      name: program.name.trim() || t.common.program,
      // A set of sessions is the days of one week.
      weeks: set ? program.weeks.slice(0, 1) : program.weeks,
      updatedAt: new Date().toISOString(),
    }
    const used = JSON.stringify(final.weeks)
    for (const d of draft?.newDisciplines ?? []) {
      if (used.includes(d.id) || draft?.newExercises.some((e) => e.disciplineId === d.id && used.includes(e.id)))
        await data.put('disciplines', d)
    }
    for (const ex of draft?.newExercises ?? []) {
      if (JSON.stringify(final.weeks).includes(ex.id)) await data.put('exercises', ex)
    }
    await data.put('programs', final)
    setDirty(false)
    if (draft) {
      setDraft(null)
      navigate(`/programs/${final.id}`, { replace: true })
    }
    toast(saved ? m.programSaved : m.namedSaved(final.name))
  }

  return (
    <Screen
      title={program.name || t.common.program}
      subtitle={
        set ? t.programs.sessionsAnyOrder(program.weeks[0]?.days.length ?? 0) : t.programs.weeks(program.weeks.length)
      }
      back={{ href: '/programs', label: t.programs.title }}
    >
      {draft && (
        <div className={styles.notice} role="note">
          <p>{m.origin[draft.origin]}</p>
          {draft.notes.length > 0 && (
            <ul>
              {draft.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          {draft.newExercises.length > 0 && (
            <p className={styles.muted}>{m.newExercisesOnSave(draft.newExercises.map((e) => e.name).join(', '))}</p>
          )}
        </div>
      )}

      <div className={styles.meta}>
        <Field
          label={t.common.name}
          value={program.name}
          maxLength={80}
          onChange={(e) => change((p) => ({ ...p, name: e.target.value }))}
        />
        <TextArea
          label={m.goal}
          rows={2}
          value={program.goal}
          maxLength={300}
          onChange={(e) => change((p) => ({ ...p, goal: e.target.value }))}
        />
        <Segmented
          label={m.structure}
          options={[
            { value: 'sessions', label: m.setOfSessions },
            { value: 'weeks', label: m.weekByWeek },
          ]}
          value={set ? 'sessions' : 'weeks'}
          onChange={(v) => {
            change(({ layout: _old, ...p }) => (v === 'sessions' ? { ...p, layout: 'sessions' } : p))
            setWeekIndex(0)
          }}
        />
        <p className={styles.muted}>
          {set
            ? `${m.sessionsHelp}${
                program.weeks.length > 1 ? ` ${m.onlyFirstWeekKept(program.weeks[0]?.name || m.firstWeek)}` : ''
              }`
            : m.weeksHelp}
        </p>
      </div>

      {!set && (
        <section aria-label={m.weeksLabel}>
          <ul className={styles.weeks}>
            {program.weeks.map((w, i) => (
              <li key={w.id}>
                <button
                  type="button"
                  className={styles.weekChip}
                  aria-pressed={i === weekIndex}
                  onClick={() => setWeekIndex(i)}
                >
                  {w.name || t.programs.weekN(i + 1)}
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
                        ? { ...cloneWeek(last), name: t.programs.weekN(p.weeks.length + 1) }
                        : { id: newId(), name: t.programs.weekN(p.weeks.length + 1), days: [] },
                    ],
                  }))
                  setWeekIndex(program.weeks.length)
                }}
              >
                {m.addWeek}
              </button>
            </li>
          </ul>
        </section>
      )}

      {week && (
        <section
          aria-label={set ? m.sessionsLabel : week.name || t.programs.weekN(weekIndex + 1)}
          className={styles.meta}
        >
          {!set && (
            <div className={styles.weekBar}>
              <Field
                label={m.weekName}
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
                      weeks.splice(weekIndex + 1, 0, {
                        ...cloneWeek(week),
                        name: m.copyOf(week.name ?? m.weekFallback),
                      })
                      return { ...p, weeks }
                    })
                    setWeekIndex(weekIndex + 1)
                  }}
                >
                  {m.duplicateWeek}
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
                    {m.deleteWeek}
                  </Button>
                )}
              </div>
            </div>
          )}

          <ol className={styles.days}>
            {week.days.map((day, d) => (
              <li key={day.id} className={styles.day}>
                <div className={styles.dayFields}>
                  <Field
                    label={unitN(d + 1)}
                    value={day.name}
                    maxLength={60}
                    onChange={(e) => changeDay(d, (x) => ({ ...x, name: e.target.value }))}
                  />
                  <SelectField
                    label={t.common.discipline}
                    value={day.disciplineId ?? ''}
                    options={[
                      { value: '', label: m.noDiscipline },
                      ...data.disciplines.map((x) => ({ value: x.id, label: x.name })),
                      ...(draft?.newDisciplines ?? []).map((x) => ({ value: x.id, label: m.newDiscipline(x.name) })),
                    ]}
                    onChange={(e) =>
                      changeDay(d, ({ disciplineId: _old, ...x }) =>
                        e.target.value ? { ...x, disciplineId: e.target.value } : x,
                      )
                    }
                  />
                  <IconButton
                    icon={Trash2}
                    label={m.deleteItem(day.name || unitLower(d + 1))}
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
                    {m.addExercise}
                  </Button>
                  {saved && !dirty && day.blocks.length > 0 && (
                    <Button
                      variant="plain"
                      icon={<Play size={18} strokeWidth={2} aria-hidden="true" />}
                      onClick={() => start.fromDay(program, { programId: program.id, week: weekIndex, day: d })}
                    >
                      {next?.week === weekIndex && next.day === d
                        ? m.startNext
                        : set
                          ? m.startThisSession
                          : m.startThisDay}
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
                  name: unitN(days.length + 1),
                  ...(days[days.length - 1]?.disciplineId ? { disciplineId: days[days.length - 1]?.disciplineId } : {}),
                  blocks: [],
                },
              ])
            }
          >
            {set ? m.addSession : m.addDay}
          </Button>
        </section>
      )}

      {saved && (
        <div className={styles.danger}>
          {/* Only on what is stored: unsaved edits are not written by the way. */}
          {!dirty && completedDays(program, data.sessions) > 0 && (
            <Button
              variant="plain"
              onClick={async () => {
                const before = program
                const restarted = restartProgram(before)
                await data.put('programs', restarted)
                setProgram(restarted)
                toast(m.programRestarted, [
                  {
                    label: m.undo,
                    onClick: async () => {
                      await data.put('programs', before)
                      setProgram(before)
                    },
                  },
                ])
              }}
            >
              {m.restartProgram}
            </Button>
          )}
          {confirmDelete ? (
            <>
              <p>{m.confirmDelete}</p>
              <div className={styles.dayActions}>
                <Button
                  variant="danger"
                  onClick={async () => {
                    await data.remove('programs', program.id)
                    navigate('/programs', { replace: true })
                    toast(m.programDeleted, [{ label: m.undo, onClick: () => data.put('programs', initial) }])
                  }}
                >
                  {m.deleteProgram}
                </Button>
                <Button variant="plain" onClick={() => setConfirmDelete(false)}>
                  {m.keepIt}
                </Button>
              </div>
            </>
          ) : (
            <Button variant="plain" onClick={() => setConfirmDelete(true)}>
              {m.deleteProgram}
            </Button>
          )}
        </div>
      )}

      <div className={styles.footer}>
        {draft && (
          <Button
            variant="plain"
            onClick={() => {
              setDraft(null)
              navigate(draft.origin === 'adjust' ? `/programs/${program.id}` : '/programs', { replace: true })
            }}
          >
            {m.discard}
          </Button>
        )}
        <Button variant="primary" disabled={!dirty} onClick={save}>
          {dirty ? (draft ? m.saveProgram : m.saveChanges) : m.saved}
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
        disciplineId={adding !== null ? week?.days[adding]?.disciplineId : undefined}
        onClose={() => setAdding(null)}
        onPick={(ex) => {
          if (adding === null) return
          const b: Block = {
            id: newId(),
            exerciseId: ex.id,
            sets: 3,
            ...(ex.metric === 'weight_reps' || ex.metric === 'reps' ? { reps: 8 } : {}),
            ...(ex.metric === 'distance_time' && ex.distance === undefined
              ? { distance: ex.pace === 'km' ? 1000 : 100 }
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
