import type { LanguageModel } from 'ai'
import { newId } from '../model/ids.ts'
import type { Goal, Program, ProgramLayout } from '../model/schemas.ts'
import { generateStructured } from './client.ts'
import {
  AiCoachReply,
  buildPrompt,
  type CoachBuild,
  type CoachInput,
  type CoachMessage,
  type CoachPromptInput,
  type CoachProposal,
  type CoachTurn,
  coachFromAi,
  coachMessages,
  coachSystem,
} from './coach.ts'
import { AiExercises, type ExercisesDraft, exercisesFromAi } from './exercises.ts'
import { AiGoals, type GoalProposal, goalsFromAi } from './goals.ts'
import {
  AiProgram,
  AiWeek,
  type AthleteLibrary,
  type Draft,
  draftFromAi,
  draftWeekFromAi,
  type PromptPair,
} from './program.ts'

/** Generates a whole program; the result is a draft the user edits and saves (nothing is stored here). */
export async function generateProgramDraft(
  model: LanguageModel,
  pair: PromptPair,
  library: AthleteLibrary,
  signal?: AbortSignal,
  layout: ProgramLayout = 'weeks',
): Promise<Draft> {
  const ai = await generateStructured(model, { ...pair, schema: AiProgram, ...(signal ? { signal } : {}) })
  return draftFromAi(ai, library, new Date(), layout)
}

/** Rewrites one week of a program; the result is a draft of the whole program with that week replaced. */
export async function adjustWeekDraft(
  model: LanguageModel,
  pair: PromptPair,
  program: Program,
  index: number,
  library: AthleteLibrary,
  signal?: AbortSignal,
): Promise<Draft> {
  const ai = await generateStructured(model, { ...pair, schema: AiWeek, ...(signal ? { signal } : {}) })
  return draftWeekFromAi(ai, program, index, library)
}

/** Proposes exercises for the athlete's library; the result is a draft the user picks from and edits. */
export async function generateExercisesDraft(
  model: LanguageModel,
  pair: PromptPair,
  library: AthleteLibrary,
  signal?: AbortSignal,
): Promise<ExercisesDraft> {
  const ai = await generateStructured(model, { ...pair, schema: AiExercises, ...(signal ? { signal } : {}) })
  return exercisesFromAi(ai, library)
}

/** Proposes goals from the athlete's own training; the result is a list they pick from (nothing is stored here). */
export async function generateGoalsDraft(
  model: LanguageModel,
  pair: PromptPair,
  library: AthleteLibrary,
  existing: readonly Goal[],
  today: string,
  signal?: AbortSignal,
): Promise<GoalProposal[]> {
  const ai = await generateStructured(model, { ...pair, schema: AiGoals, ...(signal ? { signal } : {}) })
  return goalsFromAi(ai, library, existing, today)
}

/** Designs one thing the coach was asked to build, with that feature's own prompt and schema. */
async function runBuild(
  model: LanguageModel,
  b: CoachBuild,
  prompt: CoachPromptInput,
  signal: AbortSignal | undefined,
): Promise<CoachProposal | undefined> {
  const c = prompt.context
  const pair = buildPrompt(b, c, prompt.history)
  const id = newId()
  switch (b.kind) {
    case 'program': {
      const draft = await generateProgramDraft(model, pair, c.library, signal, b.shape.layout)
      return { id, kind: 'program', origin: 'ai', draft }
    }
    case 'week': {
      const draft = await adjustWeekDraft(model, pair, b.program, b.index, c.library, signal)
      return { id, kind: 'program', origin: 'adjust', draft, week: b.index + 1 }
    }
    case 'exercises': {
      const draft = await generateExercisesDraft(model, pair, c.library, signal)
      return draft.exercises.length > 0 ? { id, kind: 'add_exercises', draft } : undefined
    }
    case 'goals': {
      const goals = await generateGoalsDraft(model, pair, c.library, c.goals, c.today, signal)
      return goals.length > 0 ? { id, kind: 'add_goals', goals } : undefined
    }
  }
}

/**
 * One turn with the coach: its reply and the changes it proposes, none applied. What it was asked to build (a
 * program, a week, exercises, goals) is then designed by that feature's own call, all at once; `onBuilding` says when
 * that starts. One that fails leaves the others, its error in `failed`.
 */
export async function generateCoachTurn(
  model: LanguageModel,
  prompt: CoachPromptInput,
  history: readonly CoachMessage[],
  input: CoachInput,
  signal?: AbortSignal,
  onBuilding?: (count: number) => void,
): Promise<CoachTurn> {
  const ai = await generateStructured(model, {
    system: coachSystem(prompt),
    prompt: '',
    messages: coachMessages(history, input),
    schema: AiCoachReply,
    ...(signal ? { signal } : {}),
  })
  const { reply, proposals, builds } = coachFromAi(ai, prompt.context)
  if (builds.length === 0) return { reply, proposals }
  onBuilding?.(builds.length)
  const built = await Promise.allSettled(builds.map((b) => runBuild(model, b, prompt, signal)))
  signal?.throwIfAborted()
  let failed: unknown
  for (const r of built) {
    if (r.status === 'rejected') failed ??= r.reason
    else if (r.value) proposals.push(r.value)
  }
  return { reply, proposals, ...(failed !== undefined ? { failed } : {}) }
}
