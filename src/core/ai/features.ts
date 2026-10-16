import type { LanguageModel } from 'ai'
import type { Exercise, Program } from '../model/schemas.ts'
import { generateStructured } from './client.ts'
import { AiProgram, AiWeek, type Draft, draftFromAi, draftWeekFromAi, type PromptPair } from './program.ts'

/** Generates a whole program; the result is a draft the user edits and saves (nothing is stored here). */
export async function generateProgramDraft(
  model: LanguageModel,
  pair: PromptPair,
  library: readonly Exercise[],
  signal?: AbortSignal,
): Promise<Draft> {
  const ai = await generateStructured(model, { ...pair, schema: AiProgram, ...(signal ? { signal } : {}) })
  return draftFromAi(ai, library)
}

/** Rewrites one week of a program; the result is a draft of the whole program with that week replaced. */
export async function adjustWeekDraft(
  model: LanguageModel,
  pair: PromptPair,
  program: Program,
  index: number,
  library: readonly Exercise[],
  signal?: AbortSignal,
): Promise<Draft> {
  const ai = await generateStructured(model, { ...pair, schema: AiWeek, ...(signal ? { signal } : {}) })
  return draftWeekFromAi(ai, program, index, library)
}
