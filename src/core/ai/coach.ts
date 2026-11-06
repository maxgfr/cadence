import type { ModelMessage, UserContent } from 'ai'
import { z } from 'zod'
import { type ExerciseIndex, findExercise, normalizeName } from '../library/exercises.ts'
import { newId } from '../model/ids.ts'
import type { UnitPrefs } from '../model/program.ts'
import {
  type Discipline,
  type Exercise,
  type Goal,
  Language,
  type Metric,
  Mode,
  type Program,
  type Session,
  type SetLog,
  type Settings,
} from '../model/schemas.ts'
import {
  formatTime,
  fromDisplayDistance,
  fromDisplayWeight,
  toDisplayDistance,
  toDisplayWeight,
} from '../model/units.ts'
import { AiExercise, type ExercisesDraft, exercisesFromAi } from './exercises.ts'
import { AiGoal, type GoalProposal, goalsFromAi } from './goals.ts'
import {
  AiProgram,
  AiWeek,
  type AthleteLibrary,
  type Draft,
  draftFromAi,
  draftWeekFromAi,
  languageRule,
  libraryText,
} from './program.ts'

/*
 * What the coach answers each turn: a reply, and changes to the app it proposes. Every action is one object whose
 * fields are all present and nullable (rather than a union): the most portable shape across structured-output modes.
 * Nothing here is ever stored; the athlete applies each proposal or not.
 */

export const COACH_ACTIONS = [
  'log_sets',
  'add_exercises',
  'create_program',
  'adjust_week',
  'add_goals',
  'update_settings',
  'set_rest',
] as const

const AiSet = z.object({
  reps: z.number().nullable(),
  weight: z.number().nullable().describe("Load, in the athlete's weight unit"),
  timeSeconds: z.number().nullable(),
  distance: z.number().nullable().describe("In the athlete's distance unit"),
  rpe: z.number().nullable().describe('Effort 1-10, when they said it'),
})

const AiSettingsPatch = z.object({
  mode: Mode.nullable(),
  weightUnit: z.enum(['kg', 'lb']).nullable(),
  distanceUnit: z.enum(['m', 'yd']).nullable(),
  weekStartsOnMonday: z.boolean().nullable(),
  language: Language.nullable(),
})

const AiAction = z.object({
  type: z.enum(COACH_ACTIONS),
  exercise: z.string().nullable().describe('log_sets: the exercise, by its id in the library, else by name'),
  sets: z.array(AiSet).nullable().describe('log_sets: one entry per set, in the order done'),
  exercises: z.array(AiExercise).nullable().describe('add_exercises: the exercises to add'),
  program: AiProgram.nullable().describe('create_program: the whole program'),
  layout: z
    .enum(['weeks', 'sessions'])
    .nullable()
    .describe('create_program: weeks (a plan week by week) or sessions (one week of sessions done in any order)'),
  programId: z.string().nullable().describe('adjust_week: the id of one of their programs'),
  weekNumber: z.number().nullable().describe('adjust_week: the week to rewrite, 1 for the first'),
  week: AiWeek.nullable().describe('adjust_week: the new week'),
  goals: z.array(AiGoal).nullable().describe('add_goals: the goals'),
  settings: AiSettingsPatch.nullable().describe('update_settings: only what they asked to change, others null'),
  discipline: z.string().nullable().describe('set_rest: a discipline by name, for the rest of a whole sport'),
  restSeconds: z.number().nullable().describe('set_rest: seconds between sets; 0 for no timer'),
})

export const AiCoachReply = z.object({
  reply: z.string().describe('What you say to the athlete'),
  actions: z.array(AiAction).describe('Changes you propose; empty when you only answer'),
})
export type AiCoachReply = z.infer<typeof AiCoachReply>
type AiAction = z.infer<typeof AiAction>

/** A change the coach proposes, ready to apply; `id` keys it in the conversation. */
export type CoachProposal = { id: string } & (
  | {
      kind: 'log_sets'
      /** The exercise in the library, or one to create with the sets. */
      exercise: Exercise
      isNew: boolean
      sets: SetLog[]
    }
  | { kind: 'add_exercises'; draft: ExercisesDraft }
  | {
      kind: 'program'
      draft: Draft
      origin: 'ai' | 'adjust' /** The week rewritten, 1 for the first (adjust). */
      week?: number
    }
  | { kind: 'add_goals'; goals: GoalProposal[] }
  | { kind: 'settings'; patch: Partial<Settings> }
  | {
      kind: 'rest'
      /** The rest is set on this exercise, or on this discipline (all its exercises without their own). */
      target: { exercise: Exercise } | { discipline: Discipline }
      seconds: number
    }
)

export interface CoachTurn {
  reply: string
  proposals: CoachProposal[]
}

export interface CoachContext {
  library: AthleteLibrary
  index: ExerciseIndex
  programs: readonly Program[]
  goals: readonly Goal[]
  /** The session in progress, if any: logged sets go there. */
  active: Session | undefined
  settings: Settings
  today: string
  now?: Date
}

const finite = (v: number | null | undefined) => (v !== null && v !== undefined && Number.isFinite(v) ? v : undefined)

/** How an exercise the library lacks is measured, from what its sets carry. */
function metricOf(sets: readonly SetLog[]): Metric {
  if (sets.some((s) => s.weight !== undefined)) return 'weight_reps'
  if (sets.some((s) => s.distance !== undefined)) return 'distance_time'
  if (sets.some((s) => s.time !== undefined) && !sets.some((s) => s.reps !== undefined)) return 'time'
  return 'reps'
}

/** Sets as the athlete said them (their units) → stored sets (metric), done. Empty sets are dropped. */
export function setsFromAi(sets: readonly z.infer<typeof AiSet>[], units: UnitPrefs): SetLog[] {
  const out: SetLog[] = []
  for (const s of sets.slice(0, 50)) {
    const reps = finite(s.reps)
    const weight = finite(s.weight)
    const time = finite(s.timeSeconds)
    const distance = finite(s.distance)
    const rpe = finite(s.rpe)
    const set: SetLog = { done: true }
    if (reps !== undefined && reps >= 0 && reps <= 1000) set.reps = Math.round(reps)
    if (weight !== undefined && weight >= 0 && weight < 2000)
      set.weight = Math.round(fromDisplayWeight(weight, units.weightUnit) * 100) / 100
    if (time !== undefined && time > 0 && time < 86_400) set.time = time
    if (distance !== undefined && distance > 0 && distance < 1_000_000)
      set.distance = Math.round(fromDisplayDistance(distance, units.distanceUnit) * 10) / 10
    if (rpe !== undefined && rpe >= 1 && rpe <= 10) set.rpe = Math.round(rpe * 2) / 2
    if (Object.keys(set).length > 1) out.push(set)
  }
  return out
}

function settingsFromAi(p: z.infer<typeof AiSettingsPatch>): Partial<Settings> {
  const patch: Partial<Settings> = {}
  if (p.mode) patch.mode = p.mode
  if (p.weightUnit) patch.weightUnit = p.weightUnit
  if (p.distanceUnit) patch.distanceUnit = p.distanceUnit
  if (p.weekStartsOnMonday !== null) patch.weekStart = p.weekStartsOnMonday ? 1 : 0
  if (p.language) patch.language = p.language
  return patch
}

function proposalOf(a: AiAction, c: CoachContext): CoachProposal | undefined {
  const units = { weightUnit: c.settings.weightUnit, distanceUnit: c.settings.distanceUnit }
  const id = newId()
  switch (a.type) {
    case 'log_sets': {
      const name = a.exercise?.trim()
      const sets = setsFromAi(a.sets ?? [], units)
      if (!name || sets.length === 0) return undefined
      const known = findExercise(c.library.exercises, name)
      if (known) return { id, kind: 'log_sets', exercise: known, isNew: false, sets }
      const exercise: Exercise = {
        id: newId(),
        name: name.slice(0, 80),
        metric: metricOf(sets),
        ...(c.active?.disciplineId ? { disciplineId: c.active.disciplineId } : {}),
      }
      return { id, kind: 'log_sets', exercise, isNew: true, sets }
    }
    case 'add_exercises': {
      if (!a.exercises?.length) return undefined
      const draft = exercisesFromAi({ exercises: a.exercises }, c.library)
      return draft.exercises.length > 0 ? { id, kind: 'add_exercises', draft } : undefined
    }
    case 'create_program': {
      if (!a.program) return undefined
      try {
        const draft = draftFromAi(a.program, c.library, c.now, a.layout ?? 'weeks')
        return { id, kind: 'program', origin: 'ai', draft }
      } catch {
        return undefined
      }
    }
    case 'adjust_week': {
      const program = c.programs.find((p) => p.id === a.programId)
      const index = Math.round(finite(a.weekNumber) ?? 0) - 1
      if (!program || !a.week || index < 0 || index >= program.weeks.length) return undefined
      try {
        const draft = draftWeekFromAi(a.week, program, index, c.library)
        return { id, kind: 'program', origin: 'adjust', draft, week: index + 1 }
      } catch {
        return undefined
      }
    }
    case 'add_goals': {
      if (!a.goals?.length) return undefined
      const goals = goalsFromAi({ goals: a.goals }, c.library, c.goals, c.today, c.now)
      return goals.length > 0 ? { id, kind: 'add_goals', goals } : undefined
    }
    case 'set_rest': {
      const seconds = finite(a.restSeconds)
      if (seconds === undefined || seconds < 0 || seconds > 900) return undefined
      const exercise = a.exercise?.trim() ? findExercise(c.library.exercises, a.exercise.trim()) : undefined
      if (exercise) return { id, kind: 'rest', target: { exercise }, seconds: Math.round(seconds) }
      const name = a.discipline?.trim()
      const discipline = name
        ? c.library.disciplines.find((d) => normalizeName(d.name) === normalizeName(name) || d.id === name)
        : undefined
      return discipline ? { id, kind: 'rest', target: { discipline }, seconds: Math.round(seconds) } : undefined
    }
    case 'update_settings': {
      if (!a.settings) return undefined
      const patch = settingsFromAi(a.settings)
      return Object.keys(patch).length > 0 ? { id, kind: 'settings', patch } : undefined
    }
  }
}

/** The model's answer as a reply and proposals: what cannot be applied safely is left out. */
export function coachFromAi(ai: AiCoachReply, c: CoachContext): CoachTurn {
  const proposals: CoachProposal[] = []
  for (const a of ai.actions.slice(0, 12)) {
    const p = proposalOf(a, c)
    if (p) proposals.push(p)
  }
  return { reply: ai.reply.trim().slice(0, 4000), proposals }
}

// ——— Prompt ———

const SYSTEM = `You are the coach inside Cadence, an athlete's training app: an experienced coach across sports \
(strength, swimming, track and field, running and others). You talk with the athlete, and when they ask for it or \
describe what they did, you propose changes to their app as actions. Nothing is applied until they confirm each one, \
so propose exactly what they asked for or clearly meant, nothing more.

Actions:
- log_sets: sets they say they did, for the session in progress. One action per exercise, one entry per set, values \
in their units (given below). "Same as last time" means their last logged sets on that exercise. An exercise not in \
the library may be named; it is created with the sets.
- add_exercises: new exercises for their library, only when asked.
- create_program: a whole program, only when asked to design one. Use library ids; percentages are whole numbers; \
metric units (kg, metres, seconds) inside programs.
- adjust_week: rewrite one week of one of their programs (its id and the week number), only when asked.
- add_goals: goals, only when asked; targets from their logged bests, metric units.
- update_settings: only the settings they asked to change.
- set_rest: the rest between sets of one exercise (exercise) or of a whole sport (discipline), in seconds.

Advice: when asked whether an exercise, a change or a plan is a good idea, give the verdict first (good, adjust it, or \
avoid it) and the reasons from their program, the day it goes in (muscle balance, volume already planned, overlap with \
exercises they have), their goals, their history and effort (RPE), and the limitations they mentioned. When something \
fits better, propose it as an action. Be brief and honest: never invent numbers or history, and say you cannot tell \
when their data is not enough. For pain or injury, advise seeing a professional.

Replies are short and plain: a few sentences, unless they ask for detail.`

/** The session in progress as the model reads it: exercise ids and the sets logged so far, in the athlete's units. */
export function sessionText(s: Session | undefined, index: ExerciseIndex, units: UnitPrefs): string {
  if (!s) return 'No session in progress: logged sets start a new one.'
  const lines = [`Session in progress: "${s.title}" (${s.date}).`]
  for (const e of s.entries) {
    const ex = index.get(e.exerciseId)
    const sets = e.sets
      .filter((x) => x.done)
      .map((x) =>
        [
          x.weight !== undefined
            ? `${Math.round(toDisplayWeight(x.weight, units.weightUnit) * 10) / 10} ${units.weightUnit}`
            : '',
          x.reps !== undefined ? `${x.reps} reps` : '',
          x.distance !== undefined
            ? `${Math.round(toDisplayDistance(x.distance, units.distanceUnit))} ${units.distanceUnit}`
            : '',
          x.time !== undefined ? formatTime(x.time) : '',
          x.rpe !== undefined ? `RPE ${x.rpe}` : '',
        ]
          .filter(Boolean)
          .join(' '),
      )
    lines.push(`- ${e.exerciseId} (${ex?.name ?? '?'}): ${sets.length > 0 ? sets.join('; ') : 'no set done yet'}`)
  }
  return lines.join('\n')
}

export interface CoachPromptInput {
  context: CoachContext
  /** `summarizeContext` of their history, records and goals. */
  history: string
}

/** The system prompt: the coach's rules, the language, and everything the athlete's app knows. */
export function coachSystem({ context: c, history }: CoachPromptInput): string {
  const units = { weightUnit: c.settings.weightUnit, distanceUnit: c.settings.distanceUnit }
  return [
    SYSTEM,
    languageRule(),
    '',
    `Their units: weight in ${units.weightUnit}, distance in ${units.distanceUnit}, times in seconds. Mode: ${c.settings.mode}.`,
    '',
    libraryText(c.library),
    '',
    c.programs.length > 0
      ? `Their programs (id | name | weeks):\n${c.programs.map((p) => `${p.id} | ${p.name} | ${p.weeks.length}`).join('\n')}`
      : 'Their programs: none yet.',
    '',
    sessionText(c.active, c.index, units),
    '',
    'Their training:',
    history,
  ].join('\n')
}

/** A turn of the conversation as kept on the device (in memory only). */
export interface CoachMessage {
  role: 'user' | 'assistant'
  text: string
}

/** What the athlete sends: words, a recording the model hears as is, or both. */
export interface CoachInput {
  text?: string
  audio?: { data: Uint8Array; mediaType: string }
}

/** The last turns of the conversation, then the new message (its recording as a file part). */
export function coachMessages(history: readonly CoachMessage[], input: CoachInput): ModelMessage[] {
  const past = history
    .slice(-12)
    .map(
      (m): ModelMessage =>
        m.role === 'user' ? { role: 'user', content: m.text } : { role: 'assistant', content: m.text },
    )
  const text = input.text?.trim() || 'Here is my voice note.'
  const content: UserContent = input.audio
    ? [
        { type: 'file', data: input.audio.data, mediaType: input.audio.mediaType },
        { type: 'text', text },
      ]
    : text
  return [...past, { role: 'user', content }]
}
