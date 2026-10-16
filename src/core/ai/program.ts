import { z } from 'zod'
import { type ExerciseIndex, findExercise } from '../library/exercises.ts'
import { addDays, daysBetween } from '../model/dates.ts'
import { newId } from '../model/ids.ts'
import { describeBlock, nextDay } from '../model/program.ts'
import {
  type Block,
  Discipline,
  type Exercise,
  type Goal,
  IntensityKind,
  Metric,
  type Program,
  type Session,
  type Week,
} from '../model/schemas.ts'
import { currentRecords } from '../stats/records.ts'
import { goalProgress, programAdherence, sessionAdherence, weeklyVolume } from '../stats/trends.ts'

/*
 * What a model is asked to return. Every field is present (nullable rather than optional) and unbounded so the
 * schema works with strict structured-output modes; bounds are applied when the answer is turned into a Program.
 */
const AiBlock = z.object({
  exercise: z.string().describe('An exercise id from the library, or the name of an exercise not in it'),
  newExercise: z
    .object({ discipline: Discipline, metric: Metric })
    .nullable()
    .describe('Only for an exercise not in the library: how it is measured'),
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
  discipline: Discipline,
  notes: z.string().nullable(),
  blocks: z.array(AiBlock),
})

export const AiWeek = z.object({ name: z.string(), days: z.array(AiDay) })
export type AiWeek = z.infer<typeof AiWeek>

export const AiProgram = z.object({
  name: z.string(),
  goal: z.string(),
  disciplines: z.array(Discipline),
  weeks: z.array(AiWeek),
})
export type AiProgram = z.infer<typeof AiProgram>

export interface Draft {
  program: Program
  /** Exercises the model named that the library lacks; added to the library when the draft is saved. */
  newExercises: Exercise[]
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
  resolve(name: string, hint: { discipline: Discipline; metric: z.infer<typeof Metric> } | null): string
  get(id: string): Exercise | undefined
  added: Exercise[]
}

function resolver(library: readonly Exercise[]): Resolver {
  const added: Exercise[] = []
  return {
    added,
    get: (id) => library.find((e) => e.id === id) ?? added.find((e) => e.id === id),
    resolve(name, hint) {
      const all = [...library, ...added]
      // Models sometimes copy a whole library line ("deadlift | Deadlift | strength" or "deadlift: Deadlift (…)").
      const parts = name.split(/[:|]/).map((t) => t.replace(/\(.*\)/g, '').trim())
      const known = findExercise(all, name) ?? parts.map((t) => (t ? findExercise(all, t) : undefined)).find(Boolean)
      if (known) return known.id
      const ex: Exercise = {
        id: newId(),
        name: (parts.find(Boolean) ?? name).trim().slice(0, 80) || 'Exercise',
        discipline: hint?.discipline ?? 'other',
        metric: hint?.metric ?? 'reps',
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
      const day = { id: newId(), name: text(d.name, 60) ?? 'Day', discipline: d.discipline, blocks }
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

/** Turns a model's answer into an editable program draft, matching exercises to the library by id or name. */
export function draftFromAi(ai: AiProgram, library: readonly Exercise[], now: Date = new Date()): Draft {
  const notes: string[] = []
  const r = resolver(library)
  const weeks = ai.weeks.map((w, i) => toWeek(w, r, notes, i)).filter((w): w is Week => w !== undefined)
  const unique = [...new Set(notes)]
  if (weeks.length === 0) throw new Error('The model returned a program with no training days.')
  const disciplines = [
    ...new Set(
      ai.disciplines.length > 0 ? ai.disciplines : weeks.flatMap((w) => w.days.map((d) => d.discipline ?? 'other')),
    ),
  ]
  const at = now.toISOString()
  return {
    program: {
      id: newId(),
      name: text(ai.name, 80) ?? 'AI program',
      goal: text(ai.goal, 300) ?? '',
      disciplines: disciplines.length > 0 ? disciplines : ['other'],
      weeks,
      source: 'ai',
      createdAt: at,
      updatedAt: at,
    },
    newExercises: r.added,
    notes: unique,
  }
}

/** Turns a model's week into a replacement for week `index` of `program`. */
export function draftWeekFromAi(
  ai: AiWeek,
  program: Program,
  index: number,
  library: readonly Exercise[],
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
    notes: [...new Set(notes)],
  }
}

// ——— Prompts ———

const SYSTEM = `You are an experienced coach for strength training, sprinting and swimming. You write safe, progressive, \
realistic programs that a self-coached athlete can follow without supervision.

Rules:
- Use exercises from the library below by their id whenever one fits: the exercise field is the id alone, such as \
back-squat. Only invent an exercise when nothing in the library fits; then give its name and fill newExercise.
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

/** One exercise per line: `id | name | discipline | measured by | fixed distance`. The model answers with the id. */
function libraryText(library: readonly Exercise[]): string {
  return [
    'id | name | discipline | measured by | fixed distance',
    ...library.map(
      (e) => `${e.id} | ${e.name} | ${e.discipline} | ${e.metric} | ${e.distance ? `${e.distance} m` : '-'}`,
    ),
  ].join('\n')
}

export interface ScratchAnswers {
  disciplines: Discipline[]
  level: 'beginner' | 'intermediate' | 'advanced'
  daysPerWeek: number
  weeks: number
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

export function scratchPrompt(a: ScratchAnswers, library: readonly Exercise[], today: string): PromptPair {
  const lines = [
    `Design a ${a.weeks}-week training program.`,
    `Disciplines: ${a.disciplines.join(', ')}.`,
    `Level: ${a.level}.`,
    `Training days per week: ${a.daysPerWeek}.`,
    `Goal: ${a.goal.trim() || 'general fitness in these disciplines'}.`,
  ]
  if (a.sessionMinutes) lines.push(`Time per session: about ${a.sessionMinutes} minutes.`)
  if (a.equipment?.trim()) lines.push(`Equipment and facilities: ${a.equipment.trim()}.`)
  if (a.targetDate)
    lines.push(`Target date: ${a.targetDate} (today is ${today}, ${daysBetween(today, a.targetDate)} days away).`)
  if (a.limitations?.trim()) lines.push(`Injuries or limitations to respect: ${a.limitations.trim()}.`)
  if (a.intensityStyle)
    lines.push(`Prescribe strength intensity as ${a.intensityStyle === 'pct1rm' ? '% of 1RM' : 'RPE'}.`)
  if (a.notes?.trim()) lines.push(`Other notes: ${a.notes.trim()}`)
  return { system: `${SYSTEM}\n\nExercise library:\n${libraryText(library)}`, prompt: lines.join('\n') }
}

export interface ContextInput {
  sessions: readonly Session[]
  goals: readonly Goal[]
  programs: readonly Program[]
  activeProgramId?: string
  exercises: ExerciseIndex
  today: string
  weekStart: 0 | 1
}

const round = (n: number) => Math.round(n * 10) / 10

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
  const units = { weightUnit: 'kg' as const, distanceUnit: 'm' as const }
  const done = c.sessions.filter((s) => s.status === 'done')
  const since = addDays(c.today, -56)
  const recent = done.filter((s) => s.date >= since).sort((a, b) => b.date.localeCompare(a.date))
  out.push(`Sessions in the last 8 weeks: ${recent.length}.`)
  const vol = weeklyVolume(c.sessions, c.exercises, c.today, c.weekStart, 8)
  out.push(
    'Weekly volume, oldest first (sessions / tonnage kg / swim m / run m):',
    vol.map((w) => `${w.week}: ${w.sessions} / ${Math.round(w.tonnage)} / ${w.swimMeters} / ${w.runMeters}`).join('; '),
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
        `- ${s.date} ${s.title}${s.rpe ? `, session RPE ${s.rpe}` : ''}${adh !== undefined ? `, ${Math.round(adh * 100)}% of planned sets` : ''}: ${items.join('; ')}`,
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
      const what = g.exerciseId
        ? (c.exercises.get(g.exerciseId)?.name ?? g.exerciseId)
        : (g.discipline ?? 'all training')
      out.push(
        `- ${g.kind} on ${what}: target ${g.target} by ${g.deadline}; current ${p.current !== undefined ? round(p.current) : 'none yet'}`,
      )
    }
  }
  const active = c.programs.find((p) => p.id === c.activeProgramId)
  if (active) {
    const adh = programAdherence(c.sessions, active.id)
    const next = nextDay(active, c.sessions)
    out.push(
      `Current program: ${active.name} (${active.weeks.length} weeks)${adh !== undefined ? `, ${Math.round(adh * 100)}% of planned sets done` : ''}${next ? `, next: week ${next.week + 1} day ${next.day + 1}` : ', finished'}.`,
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
  weeks: number
  daysPerWeek: number
  focus: string
  disciplines: Discipline[]
}

export function contextPrompt(a: ContextAnswers, context: string, library: readonly Exercise[]): PromptPair {
  return {
    system: `${SYSTEM}\n\nExercise library:\n${libraryText(library)}`,
    prompt: [
      `Design the athlete's next ${a.weeks}-week program from their own training history below.`,
      `Disciplines: ${a.disciplines.join(', ')}. Training days per week: ${a.daysPerWeek}.`,
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
  library: readonly Exercise[],
  exercises: ExerciseIndex,
): PromptPair {
  const units = { weightUnit: 'kg' as const, distanceUnit: 'm' as const }
  const week = program.weeks[index]
  const plan = week
    ? week.days
        .map(
          (d) =>
            `${d.name} (${d.discipline ?? 'other'}): ${d.blocks.map((b) => `${b.exerciseId} ${describeBlock(b, exercises.get(b.exerciseId), units)}`).join('; ')}`,
        )
        .join('\n')
    : '(none)'
  return {
    system: `${SYSTEM}\n\nExercise library:\n${libraryText(library)}`,
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
