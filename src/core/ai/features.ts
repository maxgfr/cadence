import type { LanguageModel } from 'ai'
import type { Goal, Program, ProgramLayout } from '../model/schemas.ts'
import { generateStructured } from './client.ts'
import {
  AiCoachReply,
  type CoachInput,
  type CoachMessage,
  type CoachPromptInput,
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

/** One turn with the coach: its reply and the changes it proposes, none applied. */
export async function generateCoachTurn(
  model: LanguageModel,
  prompt: CoachPromptInput,
  history: readonly CoachMessage[],
  input: CoachInput,
  signal?: AbortSignal,
): Promise<CoachTurn> {
  const ai = await generateStructured(model, {
    system: coachSystem(prompt),
    prompt: '',
    messages: coachMessages(history, input),
    schema: AiCoachReply,
    ...(signal ? { signal } : {}),
  })
  return coachFromAi(ai, prompt.context)
}
