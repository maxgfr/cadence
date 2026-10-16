import { indexExercises, library } from './library/exercises.ts'
import { newId } from './model/ids.ts'
import type { Entry, Session, SetLog } from './model/schemas.ts'

/** Shared fixtures for the core tests (a `.test.ts` file so the app bundle never includes it). */

export const LIB = library([])
export const IDX = indexExercises(LIB)

export function set(p: Partial<SetLog> = {}): SetLog {
  return { done: true, ...p }
}

export function entry(exerciseId: string, sets: SetLog[]): Entry {
  return { id: newId(), exerciseId, sets }
}

export function session(date: string, entries: Entry[], p: Partial<Session> = {}): Session {
  return { id: newId(), date, title: 'Session', discipline: 'strength', entries, status: 'done', ...p }
}

/** The value, or a failed test: for lookups the fixtures guarantee. */
export function must<T>(v: T | undefined | null): T {
  if (v === undefined || v === null) throw new Error('expected a value')
  return v
}
