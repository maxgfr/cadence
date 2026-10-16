import type { ExerciseIndex } from '../library/exercises.ts'
import type { Session } from '../model/schemas.ts'
import { better, completed, entryBest, type MeasureKind, measureOf } from './metrics.ts'

export interface PersonalRecord {
  exerciseId: string
  kind: MeasureKind
  value: number
  date: string
  sessionId: string
  /** The record it beat; absent for the first value ever logged on that exercise. */
  previous?: number
}

/** Every record set over time, oldest first: each session's best that beat everything before it. */
export function recordHistory(sessions: readonly Session[], exercises: ExerciseIndex): PersonalRecord[] {
  const bests = new Map<string, number>()
  const out: PersonalRecord[] = []
  for (const s of completed(sessions)) {
    const sessionBest = new Map<string, number>()
    for (const e of s.entries) {
      const ex = exercises.get(e.exerciseId)
      if (!ex) continue
      const kind = measureOf(ex)
      const v = entryBest(kind, e, ex)
      if (v === undefined) continue
      const cur = sessionBest.get(ex.id)
      if (cur === undefined || better(kind, v, cur)) sessionBest.set(ex.id, v)
    }
    for (const [exerciseId, value] of sessionBest) {
      const ex = exercises.get(exerciseId)
      if (!ex) continue
      const kind = measureOf(ex)
      const prev = bests.get(exerciseId)
      if (prev === undefined || better(kind, value, prev)) {
        bests.set(exerciseId, value)
        out.push({
          exerciseId,
          kind,
          value,
          date: s.date,
          sessionId: s.id,
          ...(prev !== undefined ? { previous: prev } : {}),
        })
      }
    }
  }
  return out
}

/** The standing record of every exercise, most recent first. */
export function currentRecords(sessions: readonly Session[], exercises: ExerciseIndex): PersonalRecord[] {
  const latest = new Map<string, PersonalRecord>()
  for (const r of recordHistory(sessions, exercises)) latest.set(r.exerciseId, r)
  return [...latest.values()].sort((a, b) => b.date.localeCompare(a.date))
}

/** Records a given session set (shown on its summary). */
export function recordsOf(sessionId: string, sessions: readonly Session[], exercises: ExerciseIndex): PersonalRecord[] {
  return recordHistory(sessions, exercises).filter((r) => r.sessionId === sessionId)
}
