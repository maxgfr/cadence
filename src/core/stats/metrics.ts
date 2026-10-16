import type { ExerciseIndex } from '../library/exercises.ts'
import type { Entry, Exercise, Session, SetLog } from '../model/schemas.ts'

/** Epley's estimate of the one-rep max. Past 12 reps it says little, so those sets give no estimate. */
export function epley(weight: number, reps: number): number | undefined {
  if (!(weight > 0) || !(reps >= 1) || reps > 12) return undefined
  return reps === 1 ? weight : weight * (1 + reps / 30)
}

export function doneSets(entry: Entry): SetLog[] {
  return entry.sets.filter((s) => s.done)
}

/**
 * What "better" means for an exercise, measured per session:
 * - `e1rm`: estimated one-rep max (loaded lifts), higher is better;
 * - `reps`: most reps in a set (bodyweight), higher is better;
 * - `hold`: longest set (planks, timed holds), higher is better;
 * - `best_time`: fastest effort over the exercise's fixed distance (sprints), lower is better;
 * - `pace`: fastest pace in seconds per 100 m over open distances (swim sets, runs), lower is better.
 */
export type MeasureKind = 'e1rm' | 'reps' | 'hold' | 'best_time' | 'pace'

export function measureOf(exercise: Exercise): MeasureKind {
  switch (exercise.metric) {
    case 'weight_reps':
      return 'e1rm'
    case 'reps':
      return 'reps'
    case 'time':
      return 'hold'
    case 'distance_time':
      return exercise.distance !== undefined ? 'best_time' : 'pace'
  }
}

export function lowerIsBetter(kind: MeasureKind): boolean {
  return kind === 'best_time' || kind === 'pace'
}

export function better(kind: MeasureKind, a: number, b: number): boolean {
  return lowerIsBetter(kind) ? a < b : a > b
}

/** The value one set reaches on a measure, if it measures it at all. */
export function setValue(kind: MeasureKind, set: SetLog, exercise: Exercise): number | undefined {
  switch (kind) {
    case 'e1rm':
      return set.weight !== undefined && set.reps !== undefined ? epley(set.weight, set.reps) : undefined
    case 'reps':
      return set.reps !== undefined && set.reps > 0 ? set.reps : undefined
    case 'hold':
      return set.time !== undefined && set.time > 0 ? set.time : undefined
    case 'best_time': {
      // Only full-distance efforts count: a 60 m logged on the 100 m line is not a 100 m time.
      const d = set.distance ?? exercise.distance
      return set.time !== undefined && set.time > 0 && d === exercise.distance ? set.time : undefined
    }
    case 'pace':
      // Under 25 m a pace per 100 m is noise (push-offs, partial lengths).
      return set.time !== undefined && set.time > 0 && set.distance !== undefined && set.distance >= 25
        ? (set.time / set.distance) * 100
        : undefined
  }
}

export function entryBest(kind: MeasureKind, entry: Entry, exercise: Exercise): number | undefined {
  let best: number | undefined
  for (const s of doneSets(entry)) {
    const v = setValue(kind, s, exercise)
    if (v !== undefined && (best === undefined || better(kind, v, best))) best = v
  }
  return best
}

export interface Point {
  date: string
  value: number
  sessionId: string
}

export function completed(sessions: readonly Session[]): Session[] {
  return sessions
    .filter((s) => s.status === 'done')
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}

/** The exercise's best per session, oldest first. */
export function exerciseSeries(sessions: readonly Session[], exercise: Exercise): Point[] {
  const kind = measureOf(exercise)
  const out: Point[] = []
  for (const s of completed(sessions)) {
    let best: number | undefined
    for (const e of s.entries) {
      if (e.exerciseId !== exercise.id) continue
      const v = entryBest(kind, e, exercise)
      if (v !== undefined && (best === undefined || better(kind, v, best))) best = v
    }
    if (best !== undefined) out.push({ date: s.date, value: best, sessionId: s.id })
  }
  return out
}

/** The best estimated 1RM of the last `days` days, else the most recent one ever logged. */
export function currentE1rm(
  sessions: readonly Session[],
  exercise: Exercise,
  today: string,
  days = 60,
): number | undefined {
  if (measureOf(exercise) !== 'e1rm') return undefined
  const series = exerciseSeries(sessions, exercise)
  if (series.length === 0) return undefined
  const since = new Date(`${today}T00:00:00Z`).getTime() - days * 86_400_000
  const recent = series.filter((p) => new Date(`${p.date}T00:00:00Z`).getTime() >= since)
  if (recent.length === 0) return series[series.length - 1]?.value
  return Math.max(...recent.map((p) => p.value))
}

/** Exercises with at least one logged set, most recently trained first. */
export function trainedExercises(sessions: readonly Session[], exercises: ExerciseIndex): Exercise[] {
  const last = new Map<string, string>()
  for (const s of completed(sessions)) {
    for (const e of s.entries) if (doneSets(e).length > 0) last.set(e.exerciseId, s.date)
  }
  return [...last.entries()]
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([id]) => exercises.get(id))
    .filter((e): e is Exercise => e !== undefined)
}
