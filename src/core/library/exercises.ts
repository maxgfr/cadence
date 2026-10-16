import type { Exercise } from '../model/schemas.ts'

/** The user's exercises, sorted by name for pickers and lists; numbers in order ("30 m" before "100 m"). */
export function sortedExercises(all: readonly Exercise[]): Exercise[] {
  return [...all].sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))
}

/** How a discipline's exercises are usually measured: the default for a new one. */
export function usualMetric(
  all: readonly Exercise[],
  disciplineId: string | undefined,
): Exercise['metric'] | undefined {
  if (!disciplineId) return undefined
  const counts = new Map<Exercise['metric'], number>()
  for (const e of all) if (e.disciplineId === disciplineId) counts.set(e.metric, (counts.get(e.metric) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
}

export type ExerciseIndex = ReadonlyMap<string, Exercise>

export function indexExercises(all: readonly Exercise[]): ExerciseIndex {
  return new Map(all.map((e) => [e.id, e]))
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Finds an exercise by id or, failing that, by name (case, accents and punctuation ignored). */
export function findExercise(all: readonly Exercise[], idOrName: string): Exercise | undefined {
  const direct = all.find((e) => e.id === idOrName)
  if (direct) return direct
  const key = norm(idOrName)
  return all.find((e) => norm(e.name) === key || norm(e.id) === key)
}

export { norm as normalizeName }
