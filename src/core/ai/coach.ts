import type { ModelMessage } from 'ai'
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
import { type ExercisesAnswers, type ExercisesDraft, exercisesPrompt } from './exercises.ts'
import { type GoalProposal, goalsPrompt } from './goals.ts'
import {
  type AthleteLibrary,
  adjustWeekPrompt,
  contextPrompt,
  type Draft,
  languageRule,
  libraryText,
  type ProgramShape,
  type PromptPair,
  type ScratchAnswers,
  scratchPrompt,
} from './program.ts'

/*
 * What the coach answers each turn: a reply, and the changes it proposes, one list per kind of change. Fields are all
 * present, with a neutral value (0, "", "unchanged") rather than null wherever one does: strict structured-output
 * modes cap how many nullable fields one schema may have (Anthropic: 16), and the exercise and goal schemas carry
 * some. A program or a week is only described here (what to build): it is then designed by its own call and schema.
 * Nothing here is ever stored; the athlete applies each proposal or not.
 */

const AiSet = z.object({
  reps: z.number().describe('0 when not said'),
  weight: z.number().describe("Load, in the athlete's weight unit; 0 for none or not said"),
  timeSeconds: z.number().describe('0 when not said'),
  distance: z.number().describe("In the athlete's distance unit; 0 when not said"),
  rpe: z.number().describe('Effort 1-10 when they said it, else 0'),
})
/** A set as a model gives it: 0 (or null) for what was not said. */
export type AiSetIn = { [K in keyof z.infer<typeof AiSet>]: number | null }

/** Each setting, or "unchanged". */
const AiSettingsPatch = z.object({
  mode: z.enum(['unchanged', ...Mode.options]),
  weightUnit: z.enum(['unchanged', 'kg', 'lb']),
  distanceUnit: z.enum(['unchanged', 'm', 'yd']),
  weekStart: z.enum(['unchanged', 'monday', 'sunday']),
  language: z.enum(['unchanged', ...Language.options]),
})

const AiLogSets = z.object({
  exercise: z.string().describe('The exercise, by its id in the library, else by name'),
  sets: z.array(AiSet).describe('One entry per set, in the order done'),
})

const Level = z.enum(['beginner', 'intermediate', 'advanced'])

const AiProgramRequest = z.object({
  brief: z
    .string()
    .describe(
      'Everything they asked for, for the program designer: the split, how many exercises per session, the equipment, the goal, limitations',
    ),
  layout: z
    .enum(['weeks', 'sessions'])
    .describe('weeks: a plan week by week; sessions: a set of sessions done in any order and repeated'),
  weeks: z.number().describe('weeks layout: how many weeks; 0 otherwise'),
  daysPerWeek: z.number().describe('weeks layout: training days per week; 0 otherwise'),
  sessions: z.number().describe('sessions layout: how many distinct sessions, 0 to let the designer choose'),
  sports: z.array(z.string()).describe('The sports it covers, by name'),
  level: Level,
})
type AiProgramRequest = z.infer<typeof AiProgramRequest>

const AiWeekRequest = z.object({
  programId: z.string().describe('The id of one of their programs'),
  weekNumber: z.number().describe('The week to rewrite, 1 for the first'),
  brief: z.string().describe('What to change, as they asked; "" to fit it to how they trained'),
})

const AiExercisesRequest = z.object({
  sports: z.array(z.string()).describe('The sports, by name'),
  level: Level,
  size: z.enum(['essentials', 'complete']).describe('essentials: the few that matter; complete: a full library'),
  equipment: z.string().describe('What they have, "" when not said'),
  notes: z.string().describe('Anything else they asked for, "" when nothing'),
})

const AiGoalsRequest = z.object({
  focus: z.string().describe('What the goals are about, "" for their training as a whole'),
})

const AiRest = z.object({
  exercise: z.string().describe('An exercise by id or name; "" for a whole sport'),
  discipline: z.string().describe('A discipline by name, for all its exercises; "" for one exercise'),
  seconds: z.number().describe('Seconds between sets; 0 for no timer'),
})

export const AiCoachReply = z.object({
  reply: z.string().describe('What you say to the athlete'),
  logSets: z.array(AiLogSets).describe('Sets they say they did; empty unless they told you'),
  createProgram: z.array(AiProgramRequest).describe('A program to design, only when asked: at most one'),
  adjustWeek: z.array(AiWeekRequest).describe('A week of one of their programs to rewrite, only when asked'),
  addExercises: z.array(AiExercisesRequest).describe('Exercises to propose for their library, only when asked'),
  addGoals: z.array(AiGoalsRequest).describe('Goals to propose, only when asked: at most one'),
  updateSettings: z.array(AiSettingsPatch).describe('Settings to change, only when asked: at most one'),
  setRest: z.array(AiRest).describe('The rest between sets of an exercise or a sport, only when asked'),
})
export type AiCoachReply = z.infer<typeof AiCoachReply>

/**
 * What the coach was asked to build: a program, a week, exercises or goals. Each is designed by its own call (its own
 * prompt and schema, as tested in their modules), then proposed like any other change.
 */
export type CoachBuild =
  | { kind: 'program'; shape: ProgramShape; brief: string; sports: string[]; level: ScratchAnswers['level'] }
  | { kind: 'week'; program: Program; index: number; brief: string }
  | { kind: 'exercises'; answers: ExercisesAnswers }
  | { kind: 'goals'; focus: string }

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
  /** Why something the coach was asked to build could not be (the first error), when one failed. */
  failed?: unknown
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
  /** They have finished sessions: a program is built on their history rather than from scratch. */
  trained?: boolean
  /** Where the athlete is in the app as they ask ("editing the program …"), for the model. */
  screen?: string
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

/** Sets as the athlete said them (their units) → stored sets (metric), done. 0 is "not said"; empty sets are dropped. */
export function setsFromAi(sets: readonly AiSetIn[], units: UnitPrefs): SetLog[] {
  const out: SetLog[] = []
  for (const s of sets.slice(0, 50)) {
    const reps = finite(s.reps)
    const weight = finite(s.weight)
    const time = finite(s.timeSeconds)
    const distance = finite(s.distance)
    const rpe = finite(s.rpe)
    const set: SetLog = { done: true }
    if (reps !== undefined && reps > 0 && reps <= 1000) set.reps = Math.round(reps)
    if (weight !== undefined && weight > 0 && weight < 2000)
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
  if (p.mode !== 'unchanged') patch.mode = p.mode
  if (p.weightUnit !== 'unchanged') patch.weightUnit = p.weightUnit
  if (p.distanceUnit !== 'unchanged') patch.distanceUnit = p.distanceUnit
  if (p.weekStart !== 'unchanged') patch.weekStart = p.weekStart === 'monday' ? 1 : 0
  if (p.language !== 'unchanged') patch.language = p.language
  return patch
}

const whole = (v: number | null | undefined, min: number, max: number): number | undefined => {
  const n = finite(v)
  return n !== undefined && n >= min && n <= max ? Math.round(n) : undefined
}

/** A program's shape as the coach described it, bounded: a week plan, or a set of sessions. */
function shapeOf(r: AiProgramRequest): ProgramShape {
  if (r.layout === 'weeks')
    return { layout: 'weeks', weeks: whole(r.weeks, 1, 16) ?? 4, daysPerWeek: whole(r.daysPerWeek, 1, 7) ?? 3 }
  const sessions = whole(r.sessions, 1, 7)
  return { layout: 'sessions', ...(sessions ? { sessions } : {}) }
}

function logSetsOf(a: z.infer<typeof AiLogSets>, c: CoachContext): CoachProposal | undefined {
  const name = a.exercise.trim()
  const sets = setsFromAi(a.sets, { weightUnit: c.settings.weightUnit, distanceUnit: c.settings.distanceUnit })
  if (!name || sets.length === 0) return undefined
  const id = newId()
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

function restOf(a: z.infer<typeof AiRest>, c: CoachContext): CoachProposal | undefined {
  const seconds = whole(a.seconds, 0, 900)
  if (seconds === undefined) return undefined
  const id = newId()
  const exercise = a.exercise.trim() ? findExercise(c.library.exercises, a.exercise.trim()) : undefined
  if (exercise) return { id, kind: 'rest', target: { exercise }, seconds }
  const name = a.discipline.trim()
  const discipline = name
    ? c.library.disciplines.find((d) => normalizeName(d.name) === normalizeName(name) || d.id === name)
    : undefined
  return discipline ? { id, kind: 'rest', target: { discipline }, seconds } : undefined
}

/**
 * The model's answer as a reply, the proposals ready to apply, and what is still to be designed (`builds`): what
 * cannot be applied safely is left out.
 */
export function coachFromAi(ai: AiCoachReply, c: CoachContext): CoachTurn & { builds: CoachBuild[] } {
  const proposals: CoachProposal[] = []
  const add = (p: CoachProposal | undefined) => {
    if (p && proposals.length < 12) proposals.push(p)
  }
  for (const a of ai.logSets) add(logSetsOf(a, c))
  for (const a of ai.setRest) add(restOf(a, c))
  const patch = ai.updateSettings[0] ? settingsFromAi(ai.updateSettings[0]) : {}
  if (Object.keys(patch).length > 0) add({ id: newId(), kind: 'settings', patch })

  const builds: CoachBuild[] = []
  const brief = (v: string) => v.trim().slice(0, 2000)
  const names = (v: readonly string[]) => v.map((x) => x.trim().slice(0, 80)).filter(Boolean)
  const exercises = ai.addExercises[0]
  if (exercises)
    builds.push({
      kind: 'exercises',
      answers: {
        sports: names(exercises.sports),
        level: exercises.level,
        size: exercises.size,
        equipment: brief(exercises.equipment),
        notes: brief(exercises.notes),
      },
    })
  const program = ai.createProgram[0]
  if (program)
    builds.push({
      kind: 'program',
      shape: shapeOf(program),
      brief: brief(program.brief),
      sports: names(program.sports),
      level: program.level,
    })
  for (const w of ai.adjustWeek.slice(0, 2)) {
    const p = c.programs.find((x) => x.id === w.programId)
    const index = (whole(w.weekNumber, 1, 520) ?? 0) - 1
    if (p && index >= 0 && index < p.weeks.length)
      builds.push({ kind: 'week', program: p, index, brief: brief(w.brief) })
  }
  const goals = ai.addGoals[0]
  if (goals) builds.push({ kind: 'goals', focus: brief(goals.focus) })
  return { reply: ai.reply.trim().slice(0, 4000), proposals, builds }
}

/**
 * What the designer of a build is asked: the prompts of the program, week, exercises and goals features, with what
 * the athlete told the coach. A program builds on their history when they have one.
 */
export function buildPrompt(b: CoachBuild, c: CoachContext, history: string): PromptPair {
  switch (b.kind) {
    case 'program': {
      return c.trained
        ? contextPrompt({ shape: b.shape, focus: b.brief, sports: b.sports }, history, c.library)
        : scratchPrompt({ sports: b.sports, level: b.level, shape: b.shape, goal: b.brief }, c.library, c.today)
    }
    case 'week':
      return adjustWeekPrompt(b.program, b.index, history, c.library, c.index, b.brief)
    case 'exercises':
      return exercisesPrompt(b.answers, c.library)
    case 'goals':
      return goalsPrompt({ focus: b.focus }, history, c.library)
  }
}

// ——— Prompt ———

const SYSTEM = `You are the coach inside Cadence, an athlete's training app: an experienced coach across sports \
(strength, swimming, track and field, running and others). You talk with the athlete, and when they ask for it or \
describe what they did, you propose changes to their app. Nothing is applied until they confirm each one, so propose \
exactly what they asked for or clearly meant, nothing more; leave every other list empty.

Changes:
- logSets: sets they say they did, for the session in progress. One item per exercise, one entry per set, values in \
their units (given below), 0 for what they did not say. "Same as last time" means their last logged sets on that \
exercise. An exercise not in the library may be named; it is created with the sets.
- addExercises: only when asked for exercises for their library: the sports, level and equipment, for the \
exercise designer.
- createProgram: only when asked to design a program. Do not write the program: describe it for the program designer, \
who sees their library and history. Put in the brief everything they asked for (the split, how many sessions and how \
many exercises per session, the equipment, their level, goal and limitations), and say in your reply that you are \
designing it. The same goes for adjustWeek, addExercises and addGoals: you describe, a designer builds.
- adjustWeek: rewrite one week of one of their programs (its id and the week number), only when asked; the brief says \
what to change.
- addGoals: only when asked for goals: what they are about, for the goal designer.
- updateSettings: only the settings they asked to change, "unchanged" for the others.
- setRest: the rest between sets of one exercise or of a whole sport (discipline), in seconds.

Advice: when asked whether an exercise, a change or a plan is a good idea, give the verdict first (good, adjust it, or \
avoid it) and the reasons from their program, the day it goes in (muscle balance, volume already planned, overlap with \
exercises they have), their goals, their history and effort (RPE), and the limitations they mentioned. When something \
fits better, propose it. Be brief and honest: never invent numbers or history, and say you cannot tell when their \
data is not enough. For pain or injury, advise seeing a professional.

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
    ...(c.screen ? ['', `Where they are in the app as they write: ${c.screen}`] : []),
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

/** What the athlete sends: what they typed. */
export interface CoachInput {
  text: string
}

/** The last turns of the conversation, then the new message. */
export function coachMessages(history: readonly CoachMessage[], input: CoachInput): ModelMessage[] {
  const past = history
    .slice(-12)
    .map(
      (m): ModelMessage =>
        m.role === 'user' ? { role: 'user', content: m.text } : { role: 'assistant', content: m.text },
    )
  return [...past, { role: 'user', content: input.text.trim() }]
}
