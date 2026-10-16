import { DEMO_DISCIPLINES, DEMO_EXERCISES, demoExercise } from './demo/catalog.ts'
import { indexExercises } from './library/exercises.ts'
import { newId } from './model/ids.ts'
import type { Discipline, Entry, Exercise, Session, SetLog } from './model/schemas.ts'

/** Shared fixtures for the core tests (a `.test.ts` file so the app bundle never includes it). */

/** Every demo sport loaded: the library most tests use. */
export const DISCIPLINES: Discipline[] = Object.values(DEMO_DISCIPLINES)
export const LIB: Exercise[] = DEMO_EXERCISES.map((e) => demoExercise(e.id, DEMO_DISCIPLINES[e.sport].id) as Exercise)
export const IDX = indexExercises(LIB)
export const ATHLETE = { exercises: LIB, disciplines: DISCIPLINES }

export const GYM = DEMO_DISCIPLINES.gym.id
export const SWIM = DEMO_DISCIPLINES.swim.id
export const TRACK = DEMO_DISCIPLINES.track.id

export function set(p: Partial<SetLog> = {}): SetLog {
  return { done: true, ...p }
}

export function entry(exerciseId: string, sets: SetLog[]): Entry {
  return { id: newId(), exerciseId, sets }
}

export function session(date: string, entries: Entry[], p: Partial<Session> = {}): Session {
  return { id: newId(), date, title: 'Session', disciplineId: GYM, entries, status: 'done', ...p }
}

/** The value, or a failed test: for lookups the fixtures guarantee. */
export function must<T>(v: T | undefined | null): T {
  if (v === undefined || v === null) throw new Error('expected a value')
  return v
}
