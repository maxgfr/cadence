import { z } from 'zod'
import { type ExerciseIndex, findExercise, normalizeName } from '../library/exercises.ts'
import { addDays, daysBetween, startOfWeek } from '../model/dates.ts'
import { newId } from '../model/ids.ts'
import { describeBlock, nextDay, programsUnderWay } from '../model/program.ts'
import {
  type Block,
  DISCIPLINE_COLORS,
  type Discipline,
  type Exercise,
  type Goal,
  IntensityKind,
  Metric,
  type Program,
  type ProgramLayout,
  type Session,
  type Week,
} from '../model/schemas.ts'
import { type MeasureKind, measureOf } from '../stats/metrics.ts'
import { currentRecords } from '../stats/records.ts'
import { goalProgress, programAdherence, sessionAdherence, weeklyVolume } from '../stats/trends.ts'

/*
 * What a model is asked to return. Every field is present (nullable rather than optional) and unbounded so the
 * schema works with strict structured-output modes; bounds are applied when the answer is turned into a Program.
 */
const AiBlock = z.object({
  exercise: z.string().describe('An exercise id from the library, or the name of an exercise not in it'),
  newExercise: z
    .object({
      discipline: z.string().nullable().describe("One of the athlete's disciplines by name, or a new one"),
      metric: Metric,
    })
    .nullable()
    .describe('Only for an exercise not in the library: its discipline and how it is measured'),
  sets: z.number().describe('Number of sets or repetitions of the block'),
  reps: z.number().nullable().describe('Reps per set (lifts, jumps)'),
  distanceMeters: z.number().nullable().describe('Metres per repetition (swim and run)'),
  durationSeconds: z.number().nullable().describe('Seconds per set for timed holds'),
  intensity: z
    .object({
      kind: IntensityKind.describe(
        'kg, pct1rm (% of 1RM), rpe (1-10), pace (seconds per repetition), pctmax (% of best effort)',
      ),
      value: z.number(),
    })
    .nullable(),
  restSeconds: z.number().nullable(),
  intervalSeconds: z.number().nullable().describe('Swim send-off interval in seconds'),
  tempo: z.string().nullable(),
  notes: z.string().nullable(),
})

const AiDay = z.object({
  name: z.string(),
  discipline: z.string().nullable().describe("The day's discipline: one of the athlete's by name"),
  notes: z.string().nullable(),
  blocks: z.array(AiBlock),
})

export const AiWeek = z.object({ name: z.string(), days: z.array(AiDay) })
export type AiWeek = z.infer<typeof AiWeek>

export const AiProgram = z.object({
  name: z.string(),
  goal: z.string(),
  weeks: z.array(AiWeek),
})
export type AiProgram = z.infer<typeof AiProgram>

export interface Draft {
  program: Program
  /** Exercises the model named that the library lacks; added to the library when the draft is saved. */
  newExercises: Exercise[]
  /** Disciplines the model named that the athlete does not have yet; added when the draft is saved. */
  newDisciplines: Discipline[]
  /** What was corrected on the way in (clamped values, dropped empty days). */
  notes: string[]
}

const clampInt = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)))
const pos = (v: number | null | undefined) =>
  v !== null && v !== undefined && Number.isFinite(v) && v > 0 ? v : undefined
const text = (v: string | null | undefined, max: number) => {
  const t = v?.trim()
  return t ? t.slice(0, max) : undefined
}

interface Resolver {
  resolve(name: string, hint: { discipline: string | null; metric: z.infer<typeof Metric> } | null): string
  discipline(name: string | null | undefined): string | undefined
  get(id: string): Exercise | undefined
  added: Exercise[]
  addedDisciplines: Discipline[]
}

export interface AthleteLibrary {
  exercises: readonly Exercise[]
  disciplines: readonly Discipline[]
}

/**
 * Finds a discipline by name or id, or creates it (with the first free colour) when the athlete does not have it yet.
 * What is created is collected in `added`.
 */
export function disciplineResolver(disciplines: readonly Discipline[]): {
  resolve(name: string | null | undefined): string | undefined
  added: Discipline[]
} {
  const added: Discipline[] = []
  return {
    added,
    resolve(name) {
      const n = name?.trim()
      if (!n) return undefined
      const key = normalizeName(n)
      const all = [...disciplines, ...added]
      const known = all.find((d) => normalizeName(d.name) === key || d.id === n)
      if (known) return known.id
      const taken = new Set(all.map((d) => d.color))
      const d: Discipline = {
        id: newId(),
        name: n.slice(0, 40),
        color:
          DISCIPLINE_COLORS.find((c) => !taken.has(c)) ??
          DISCIPLINE_COLORS[all.length % DISCIPLINE_COLORS.length] ??
          'blue',
      }
      added.push(d)
      return d.id
    },
  }
}

function resolver({ exercises: library, disciplines }: AthleteLibrary): Resolver {
  const added: Exercise[] = []
  const ds = disciplineResolver(disciplines)
  const discipline = ds.resolve
  return {
    added,
    addedDisciplines: ds.added,
    discipline,
    get: (id) => library.find((e) => e.id === id) ?? added.find((e) => e.id === id),
    resolve(name, hint) {
      const all = [...library, ...added]
      // Models sometimes copy a whole library line ("deadlift | Deadlift | Gym" or "deadlift: Deadlift (…)").
      const parts = name.split(/[:|]/).map((t) => t.replace(/\(.*\)/g, '').trim())
      const known = findExercise(all, name) ?? parts.map((t) => (t ? findExercise(all, t) : undefined)).find(Boolean)
      if (known) return known.id
      const disciplineId = discipline(hint?.discipline)
      const ex: Exercise = {
        id: newId(),
        name: (parts.find(Boolean) ?? name).trim().slice(0, 80) || 'Exercise',
        metric: hint?.metric ?? 'reps',
        ...(disciplineId ? { disciplineId } : {}),
      }
      added.push(ex)
      return ex.id
    },
  }
}

function toWeek(w: AiWeek, r: Resolver, notes: string[], index: number): Week | undefined {
  const days = w.days
    .map((d) => {
      const blocks: Block[] = d.blocks.map((blk) => {
        const out: Block = {
          id: newId(),
          exerciseId: r.resolve(blk.exercise, blk.newExercise),
          sets: clampInt(blk.sets, 1, 50),
        }
        if (blk.sets !== out.sets) notes.push('Sets outside 1 to 50 were brought within it.')
        const reps = pos(blk.reps)
        if (reps !== undefined) out.reps = clampInt(reps, 1, 500)
        const distance = pos(blk.distanceMeters)
        if (distance !== undefined) out.distance = distance
        const duration = pos(blk.durationSeconds)
        if (duration !== undefined) out.duration = duration
        const iv = pos(blk.intensity?.value)
        if (blk.intensity && iv !== undefined) {
          // Small models write percentages as fractions (0.8) or put an effort rating (8) under a percentage.
          let kind = blk.intensity.kind
          let value = iv
          if (kind === 'pct1rm' || kind === 'pctmax') {
            if (iv <= 1.5) {
              value = Math.round(iv * 100)
              notes.push('Percentages given as fractions (0.8) were read as 80%.')
            } else if (iv <= 10) {
              kind = 'rpe'
              notes.push('Percentages of 10 or less were read as RPE.')
            }
          }
          const max = { kg: 1000, pct1rm: 110, rpe: 10, pace: 3600, pctmax: 100 }[kind]
          out.intensity = { kind, value: Math.min(value, max) }
        }
        const rest = pos(blk.restSeconds)
        if (rest !== undefined) out.rest = Math.round(rest)
        const interval = pos(blk.intervalSeconds)
        if (interval !== undefined) out.interval = Math.round(interval)
        // Fit the prescription to how the exercise is measured: a hold given in "reps" is seconds, a distance event
        // has no reps.
        const metric = r.get(out.exerciseId)?.metric
        if (metric === 'time' && out.duration === undefined && out.reps !== undefined) {
          out.duration = out.reps
          delete out.reps
          notes.push('Timed exercises given in reps were read as seconds.')
        }
        if (metric === 'distance_time') delete out.reps
        const tempo = text(blk.tempo, 20)
        // A tempo is digits ("3-1-1-0"); "-" or "n/a" means none.
        if (tempo && /\d/.test(tempo)) out.tempo = tempo
        const n = text(blk.notes, 300)
        if (n) out.notes = n
        return out
      })
      const disciplineId = r.discipline(d.discipline)
      const day = { id: newId(), name: text(d.name, 60) ?? 'Day', ...(disciplineId ? { disciplineId } : {}), blocks }
      const dn = text(d.notes, 500)
      return dn ? { ...day, notes: dn } : day
    })
    .filter((d) => {
      if (d.blocks.length === 0) notes.push('Days with no exercise were left out.')
      return d.blocks.length > 0
    })
  if (days.length === 0) return undefined
  return { id: newId(), name: text(w.name, 60) ?? `Week ${index + 1}`, days }
}

/**
 * Turns a model's answer into an editable program draft, matching exercises and disciplines by id or name. A set of
 * sessions keeps the days of the answer's first week that has any.
 */
export function draftFromAi(
  ai: AiProgram,
  library: AthleteLibrary,
  now: Date = new Date(),
  layout: ProgramLayout = 'weeks',
): Draft {
  const notes: string[] = []
  const r = resolver(library)
  const all = ai.weeks.map((w, i) => toWeek(w, r, notes, i)).filter((w): w is Week => w !== undefined)
  if (all.length === 0) throw new Error('The model returned a program with no training days.')
  const weeks = layout === 'sessions' ? all.slice(0, 1) : all
  if (layout === 'sessions' && all.length > 1) notes.push('Only the first week was kept, as the set of sessions.')
  const at = now.toISOString()
  return {
    program: {
      id: newId(),
      name: text(ai.name, 80) ?? 'AI program',
      goal: text(ai.goal, 300) ?? '',
      ...(layout === 'sessions' ? { layout } : {}),
      weeks,
      source: 'ai',
      createdAt: at,
      updatedAt: at,
    },
    newExercises: r.added,
    newDisciplines: r.addedDisciplines,
    notes: [...new Set(notes)],
  }
}

/** Turns a model's week into a replacement for week `index` of `program`. */
export function draftWeekFromAi(
  ai: AiWeek,
  program: Program,
  index: number,
  library: AthleteLibrary,
  now: Date = new Date(),
): Draft {
  const notes: string[] = []
  const r = resolver(library)
  const week = toWeek(ai, r, notes, index)
  if (!week) throw new Error('The model returned a week with no training days.')
  const weeks = program.weeks.map((w, i) => (i === index ? week : w))
  return {
    program: { ...program, weeks, updatedAt: now.toISOString() },
    newExercises: r.added,
    newDisciplines: r.addedDisciplines,
    notes: [...new Set(notes)],
  }
}

// ——— Prompts ———

const SYSTEM = `You are an experienced coach across sports: strength training, swimming, track and field, running and \
others. You write safe, progressive, realistic programs that a self-coached athlete can follow without supervision.

Rules:
- Use exercises from the athlete's library below by their id whenever one fits: the exercise field is the id alone. \
Only invent an exercise when nothing in the library fits; then give its name and fill newExercise.
- Give each day the discipline it trains, by the name of one of the athlete's disciplines; name a new one only for a \
sport the athlete does not have yet.
- Percentages are whole numbers: 80 means 80%. RPE is from 1 to 10.
- Leave rest days out: list training days only.
- Units are metric: kilograms, metres, seconds.
- Strength: give sets and reps; give intensity as pct1rm or rpe (or kg only when a load is known).
- Sprint: give the distance per repetition (or use a fixed-distance sprint exercise), intensity as pctmax, and full \
recovery rest (2 to 8 minutes).
- Swim: give distance per repetition and either a send-off interval (intervalSeconds) or rest, with an rpe intensity.
- Include warm-up blocks where they matter (swim warm-up, sprint drills).
- Progress load or volume week to week; deload or taper in the last week of a block of four or more weeks.
- Keep each session within the time the athlete has.
- Every week has the same number of training days, one per session the athlete can do.`

/** The athlete's disciplines, then one exercise per line: `id | name | discipline | measured by | fixed distance`. */
function libraryText({ exercises, disciplines }: AthleteLibrary): string {
  const name = (id: string | undefined) => disciplines.find((d) => d.id === id)?.name ?? '-'
  return [
    `Disciplines: ${disciplines.length > 0 ? disciplines.map((d) => d.name).join(', ') : 'none yet'}`,
    '',
    exercises.length > 0
      ? 'Exercise library:'
      : 'Exercise library: empty, so name every exercise and fill newExercise.',
    'id | name | discipline | measured by | fixed distance',
    ...exercises.map(
      (e) => `${e.id} | ${e.name} | ${name(e.disciplineId)} | ${e.metric} | ${e.distance ? `${e.distance} m` : '-'}`,
    ),
  ].join('\n')
}

/**
 * The program's shape: a plan of `weeks` with `daysPerWeek` days, or a set of sessions repeated in any order (with
 * `sessions` of them, or as many as the model sees fit).
 */
export type ProgramShape =
  | { layout: 'weeks'; daysPerWeek: number; weeks: number }
  | { layout: 'sessions'; sessions?: number }

/** What to ask for, by shape. */
function shapeLines(s: ProgramShape): string[] {
  if (s.layout === 'weeks')
    return [`Design a ${s.weeks}-week training program.`, `Training days per week: ${s.daysPerWeek}.`]
  return [
    `Design a set of ${s.sessions ? `${s.sessions} distinct` : 'distinct'} training sessions (${s.sessions ? '' : 'as many as the goal needs, 2 to 6; '}no weekly schedule): the athlete does them in any order and repeats them.`,
    'Return them as one week whose days are the sessions, each named for what it trains (Leg day, Upper body, Bodyweight…). Do not progress or deload across weeks: give each session its working sets.',
  ]
}

export interface ScratchAnswers {
  /** Sports by name: the athlete's disciplines picked, and any typed in. */
  sports: string[]
  level: 'beginner' | 'intermediate' | 'advanced'
  shape: ProgramShape
  goal: string
  /** Advanced mode. */
  sessionMinutes?: number
  equipment?: string
  targetDate?: string
  limitations?: string
  intensityStyle?: 'pct1rm' | 'rpe'
  notes?: string
}

export interface PromptPair {
  system: string
  prompt: string
}

export function scratchPrompt(a: ScratchAnswers, library: AthleteLibrary, today: string): PromptPair {
  const lines = [
    ...shapeLines(a.shape),
    `Sports: ${a.sports.length > 0 ? a.sports.join(', ') : "the athlete's disciplines"}.`,
    `Level: ${a.level}.`,
    `Goal: ${a.goal.trim() || 'general fitness in these sports'}.`,
  ]
  if (a.sessionMinutes) lines.push(`Time per session: about ${a.sessionMinutes} minutes.`)
  if (a.equipment?.trim()) lines.push(`Equipment and facilities: ${a.equipment.trim()}.`)
  if (a.targetDate)
    lines.push(`Target date: ${a.targetDate} (today is ${today}, ${daysBetween(today, a.targetDate)} days away).`)
  if (a.limitations?.trim()) lines.push(`Injuries or limitations to respect: ${a.limitations.trim()}.`)
  if (a.intensityStyle)
    lines.push(`Prescribe strength intensity as ${a.intensityStyle === 'pct1rm' ? '% of 1RM' : 'RPE'}.`)
  if (a.notes?.trim()) lines.push(`Other notes: ${a.notes.trim()}`)
  return { system: `${SYSTEM}\n\n${libraryText(library)}`, prompt: lines.join('\n') }
}

export interface ContextInput {
  sessions: readonly Session[]
  goals: readonly Goal[]
  programs: readonly Program[]
  exercises: ExerciseIndex
  disciplines: readonly Discipline[]
  today: string
  weekStart: 0 | 1
}

const round = (n: number) => Math.round(n * 10) / 10

/** What an exercise goal's values are, for the model (metric units). */
const GOAL_MEASURE: Record<MeasureKind, string> = {
  e1rm: 'estimated 1RM in kg',
  reps: 'most reps in a set',
  hold: 'longest set in seconds',
  best_time: 'best time in seconds',
  pace: 'best pace in seconds per 100 m',
}

function recordText(kind: string, value: number): string {
  switch (kind) {
    case 'e1rm':
      return `estimated 1RM ${round(value)} kg`
    case 'reps':
      return `${value} reps`
    case 'hold':
      return `${round(value)} s hold`
    case 'best_time':
      return `${round(value)} s`
    default:
      return `${round(value)} s per 100 m`
  }
}

/** A compact, metric summary of the athlete's recent training, records and goals, for a model to plan from. */
export function summarizeContext(c: ContextInput): string {
  const out: string[] = [`Today is ${c.today}.`]
  const dName = (id: string | undefined) => c.disciplines.find((d) => d.id === id)?.name
  const units = { weightUnit: 'kg' as const, distanceUnit: 'm' as const }
  const done = c.sessions.filter((s) => s.status === 'done')
  const since = addDays(c.today, -56)
  const recent = done.filter((s) => s.date >= since).sort((a, b) => b.date.localeCompare(a.date))
  out.push(`Sessions in the last 8 weeks: ${recent.length}.`)
  const vol = weeklyVolume(c.sessions, c.exercises, c.today, c.weekStart, 8)
  out.push(
    'Weekly volume, oldest first (sessions / kg lifted / metres covered):',
    vol.map((w) => `${w.week}: ${w.sessions} / ${Math.round(w.tonnage)} / ${Math.round(w.meters)}`).join('; '),
  )
  if (recent.length > 0) {
    out.push('Latest sessions:')
    for (const s of recent.slice(0, 10)) {
      const items = s.entries
        .map((e) => {
          const ex = c.exercises.get(e.exerciseId)
          const sets = e.sets.filter((x) => x.done)
          if (!ex || sets.length === 0) return undefined
          const top = sets
            .map((x) =>
              [
                x.weight !== undefined ? `${x.weight}kg` : '',
                x.reps !== undefined ? `x${x.reps}` : '',
                x.distance !== undefined ? `${x.distance}m` : '',
                x.time !== undefined ? `${x.time}s` : '',
                x.rpe !== undefined ? `@RPE${x.rpe}` : '',
              ].join(''),
            )
            .join(', ')
          return `${ex.name} [${top}]`
        })
        .filter(Boolean)
      const adh = sessionAdherence(s)
      out.push(
        `- ${s.date} ${s.title}${dName(s.disciplineId) ? ` (${dName(s.disciplineId)})` : ''}${s.rpe ? `, session RPE ${s.rpe}` : ''}${adh !== undefined ? `, ${Math.round(adh * 100)}% of planned sets` : ''}: ${items.join('; ')}`,
      )
    }
  }
  const prs = currentRecords(c.sessions, c.exercises).slice(0, 15)
  if (prs.length > 0) {
    out.push('Personal records:')
    for (const r of prs)
      out.push(`- ${c.exercises.get(r.exerciseId)?.name ?? r.exerciseId}: ${recordText(r.kind, r.value)} (${r.date})`)
  }
  const goals = c.goals.filter((g) => !g.achievedAt)
  if (goals.length > 0) {
    out.push('Goals:')
    for (const g of goals) {
      const p = goalProgress(g, c.sessions, c.exercises, c.today, c.weekStart)
      const ex = g.exerciseId ? c.exercises.get(g.exerciseId) : undefined
      const what =
        g.kind === 'exercise'
          ? `${ex ? GOAL_MEASURE[measureOf(ex)] : 'best'} on ${ex?.name ?? g.exerciseId}`
          : `${g.kind === 'frequency' ? 'sessions per week' : g.volume === 'distance' ? 'metres per week' : 'kg lifted per week'} in ${dName(g.disciplineId) ?? 'all training'}`
      out.push(
        `- ${what}: target ${g.target} by ${g.deadline}; current ${p.current !== undefined ? round(p.current) : 'none yet'}`,
      )
    }
  }
  for (const { program: active } of programsUnderWay(c.programs, c.sessions, startOfWeek(c.today, c.weekStart))) {
    const adh = programAdherence(c.sessions, active.id)
    const next = nextDay(active, c.sessions)
    out.push(
      `Program under way: ${active.name} (${active.weeks.length} weeks)${adh !== undefined ? `, ${Math.round(adh * 100)}% of planned sets done` : ''}${next ? `, next: week ${next.week + 1} day ${next.day + 1}` : ', finished'}.`,
    )
    const w = active.weeks[next?.week ?? 0]
    if (w)
      out.push(
        `Its current week: ${w.days.map((d) => `${d.name}: ${d.blocks.map((b) => `${c.exercises.get(b.exerciseId)?.name ?? b.exerciseId} ${describeBlock(b, c.exercises.get(b.exerciseId), units)}`).join(', ')}`).join(' | ')}`,
      )
  }
  return out.join('\n')
}

export interface ContextAnswers {
  shape: ProgramShape
  focus: string
  sports: string[]
}

export function contextPrompt(a: ContextAnswers, context: string, library: AthleteLibrary): PromptPair {
  return {
    system: `${SYSTEM}\n\n${libraryText(library)}`,
    prompt: [
      ...shapeLines(a.shape),
      "Base it on the athlete's own training history below.",
      `Sports: ${a.sports.length > 0 ? a.sports.join(', ') : 'as in their history'}.`,
      `Focus: ${a.focus.trim() || 'keep progressing toward their goals'}.`,
      'Base loads on their records (use pct1rm from their estimated 1RM, or kg near what they lifted), keep what they',
      'adhered to, and move their goals forward.',
      '',
      'Athlete history:',
      context,
    ].join('\n'),
  }
}

/** Asks for a replacement of the program's week `index`, from what was actually done in the week before it. */
export function adjustWeekPrompt(
  program: Program,
  index: number,
  context: string,
  library: AthleteLibrary,
  exercises: ExerciseIndex,
): PromptPair {
  const units = { weightUnit: 'kg' as const, distanceUnit: 'm' as const }
  const week = program.weeks[index]
  const plan = week
    ? week.days
        .map(
          (d) =>
            `${d.name} (${library.disciplines.find((x) => x.id === d.disciplineId)?.name ?? 'no discipline'}): ${d.blocks.map((b) => `${b.exerciseId} ${describeBlock(b, exercises.get(b.exerciseId), units)}`).join('; ')}`,
        )
        .join('\n')
    : '(none)'
  return {
    system: `${SYSTEM}\n\n${libraryText(library)}`,
    prompt: [
      `The athlete follows "${program.name}" (goal: ${program.goal || 'not stated'}).`,
      `Rewrite week ${index + 1} so it fits what they actually did: if sets were missed or the effort was higher`,
      'than planned, ease off; if everything was done at a lower effort than planned, progress a little more.',
      `Keep the same number of days (${week?.days.length ?? 3}) and the same structure where it worked.`,
      '',
      `Planned week ${index + 1}:`,
      plan,
      '',
      'Athlete history:',
      context,
    ].join('\n'),
  }
}
