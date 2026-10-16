import type { LanguageModel } from 'ai'
import type { Program, ProgramLayout } from '../model/schemas.ts'
import { generateStructured } from './client.ts'
import { AiExercises, type ExercisesDraft, exercisesFromAi } from './exercises.ts'
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
