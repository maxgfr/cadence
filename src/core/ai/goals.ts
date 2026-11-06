import { z } from 'zod'
import { findExercise, normalizeName } from '../library/exercises.ts'
import { addDays } from '../model/dates.ts'
import { newId } from '../model/ids.ts'
import { GOAL_KINDS, type Goal } from '../model/schemas.ts'
import { measureOf } from '../stats/metrics.ts'
import { type AthleteLibrary, languageRule, libraryText, type PromptPair } from './program.ts'

/* What a model is asked to return: every field present (nullable rather than optional), bounds applied after. */
export const AiGoal = z.object({
  kind: z
    .enum(GOAL_KINDS)
    .describe(
      'exercise: a best on one exercise; weekly_volume: kg lifted or metres a week; frequency: sessions a week',
    ),
  exercise: z.string().nullable().describe('For an exercise goal: the id of an exercise of the library'),
  discipline: z
    .string()
    .nullable()
    .describe("For a weekly goal: one of the athlete's disciplines by name, or null for all training"),
  volume: z.enum(['tonnage', 'distance']).nullable().describe('For weekly_volume: tonnage (kg) or distance (metres)'),
  target: z
    .number()
    .describe(
      'Metric: estimated 1RM in kg, reps in a set, seconds held, best time in seconds, pace in seconds per 100 m, kg or metres a week, or sessions a week',
    ),
  weeks: z.number().describe('Weeks from today to the deadline'),
  why: z.string().nullable().describe('One short sentence: why this goal and target, from their training'),
})

export const AiGoals = z.object({ goals: z.array(AiGoal) })
export type AiGoals = z.infer<typeof AiGoals>

/** A goal proposed by a model, not saved yet, with the reason the model gave. */
export interface GoalProposal {
  goal: Goal
  why?: string
}

const sane = (v: number, min: number, max: number) => Number.isFinite(v) && v >= min && v <= max

/**
 * Turns a model's answer into goals the athlete can pick from: an exercise goal needs one of their exercises, a weekly
 * goal one of their disciplines or none; targets out of any plausible range and goals already set are left out.
 */
export function goalsFromAi(
  ai: AiGoals,
  library: AthleteLibrary,
  existing: readonly Goal[],
  today: string,
  now: Date = new Date(),
): GoalProposal[] {
  const out: GoalProposal[] = []
  const key = (g: Pick<Goal, 'kind' | 'exerciseId' | 'disciplineId' | 'volume'>) =>
    [g.kind, g.exerciseId ?? '', g.disciplineId ?? '', g.volume ?? ''].join('|')
  const taken = new Set(existing.filter((g) => !g.achievedAt).map(key))
  for (const a of ai.goals) {
    const weeks = Math.round(a.weeks)
    if (!sane(weeks, 1, 104) || !(a.target > 0)) continue
    const goal: Goal = {
      id: newId(),
      kind: a.kind,
      target: a.target,
      deadline: addDays(today, weeks * 7),
      createdAt: now.toISOString(),
    }
    if (a.kind === 'exercise') {
      const ex = a.exercise ? findExercise(library.exercises, a.exercise) : undefined
      if (!ex) continue
      goal.exerciseId = ex.id
      if (ex.disciplineId) goal.disciplineId = ex.disciplineId
      const kind = measureOf(ex)
      const ok =
        kind === 'e1rm'
          ? sane(a.target, 1, 600)
          : kind === 'reps'
            ? sane(a.target, 1, 1000)
            : kind === 'pace'
              ? sane(a.target, 10, 3600)
              : sane(a.target, 0.5, 86_400)
      if (!ok) continue
      if (kind === 'reps') goal.target = Math.round(a.target)
    } else {
      const name = a.discipline?.trim()
      const d = name
        ? library.disciplines.find((x) => normalizeName(x.name) === normalizeName(name) || x.id === name)
        : undefined
      if (d) goal.disciplineId = d.id
      if (a.kind === 'frequency') {
        if (!sane(a.target, 1, 14)) continue
        goal.target = Math.round(a.target)
      } else {
        goal.volume = a.volume ?? 'tonnage'
        if (!sane(a.target, 1, 1_000_000)) continue
      }
    }
    const k = key(goal)
    if (taken.has(k)) continue
    taken.add(k)
    const why = a.why?.trim()
    out.push({ goal, ...(why ? { why: why.slice(0, 200) } : {}) })
  }
  return out
}

const SYSTEM = `You are an experienced coach across sports. From a self-coached athlete's own training, you propose the \
few goals that would move them forward: specific, measurable, and within reach by their deadline.

Rules:
- Two to four goals, each on what they actually train. No goal they already have.
- An exercise goal is on one exercise of the library below, by its id, in what that exercise is measured by.
- Start from their logged bests and weekly averages: a target stretches them, never doubles them. Typical gains: about \
1% a week on an estimated 1RM (15% at most), a few reps or seconds on a bodyweight or held exercise, under 1% a week \
off a time or a pace, 10 to 30% on a weekly volume, one more session a week.
- Without history on something, do not set a goal on it.
- Deadlines between 4 and 16 weeks.`

export interface GoalsAnswers {
  /** What the athlete wants to focus on, in their words; may be empty. */
  focus: string
}

export function goalsPrompt(a: GoalsAnswers, context: string, library: AthleteLibrary): PromptPair {
  return {
    system: `${SYSTEM}\n${languageRule()}\n\n${libraryText(library)}`,
    prompt: [
      'Propose goals for this athlete.',
      `Focus: ${a.focus.trim() || 'what their training shows they are working on'}.`,
      '',
      'Athlete history:',
      context,
    ].join('\n'),
  }
}
