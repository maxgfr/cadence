import { DEMO_DISCIPLINES, type DemoSport, demoExercise, sportOf } from '../demo/catalog.ts'
import type { Discipline, Exercise, Goal, Program, Session } from '../model/schemas.ts'

/**
 * Version 1 had four fixed disciplines (`strength`, `swim`, `run`, `other`) and a built-in exercise library.
 * Version 2 has the user's own disciplines and no built-ins. Old records become: `strength` → Gym, `swim` →
 * Swimming, `run` → Track and field (the demo's disciplines, with the same ids), `other` → no discipline; built-in
 * exercises still referenced are copied into the user's library.
 */

type Raw = Record<string, unknown>

const OLD: Readonly<Record<string, DemoSport>> = { strength: 'gym', swim: 'swim', run: 'track' }

export interface Records {
  disciplines: Discipline[]
  exercises: Exercise[]
  programs: Program[]
  sessions: Session[]
  goals: Goal[]
}

/** Goal kinds before version 4, both a best on one exercise: a heavier lift and a faster effort. */
const OLD_GOAL_KINDS: ReadonlySet<unknown> = new Set(['e1rm', 'best_time'])

/** Whether any goal still has a kind from before version 4. */
export function needsGoalMigration(goals: readonly unknown[] | undefined): boolean {
  return (goals ?? []).some((g) => typeof g === 'object' && g !== null && OLD_GOAL_KINDS.has((g as Raw).kind))
}

/** Goals of versions 1 to 3 on one exercise (`e1rm`, `best_time`) become `exercise` goals, which mean the same. */
export function migrateGoals<T>(goals: readonly T[]): T[] {
  return goals.map((g) =>
    typeof g === 'object' && g !== null && OLD_GOAL_KINDS.has((g as Raw).kind) ? { ...g, kind: 'exercise' } : g,
  )
}

/** Whether any record still has a version 1 shape. */
export function needsMigration(r: { [K in keyof Records]?: unknown[] }): boolean {
  const has = (list: unknown[] | undefined, key: string) =>
    (list ?? []).some((x) => typeof x === 'object' && x !== null && key in x)
  return (
    has(r.exercises, 'discipline') ||
    has(r.sessions, 'discipline') ||
    has(r.programs, 'disciplines') ||
    has(r.goals, 'discipline')
  )
}

export function migrateV1(r: { [K in keyof Records]?: unknown[] }): Records {
  const used = new Set<DemoSport>()
  const disciplineOf = (old: unknown): string | undefined => {
    const sport = typeof old === 'string' ? OLD[old] : undefined
    if (!sport) return undefined
    used.add(sport)
    return DEMO_DISCIPLINES[sport].id
  }
  const exercises: Exercise[] = (r.exercises ?? []).map((x) => {
    const { discipline, ...rest } = x as Raw
    const disciplineId = disciplineOf(discipline)
    const e = { ...rest, ...(disciplineId ? { disciplineId } : {}) } as Exercise
    if (e.metric === 'distance_time' && e.distance === undefined && !e.pace)
      e.pace = discipline === 'run' ? 'km' : '100m'
    return e
  })
  const programs: Program[] = (r.programs ?? []).map((x) => {
    const { disciplines: _old, ...rest } = x as Raw
    const p = rest as unknown as Program
    return {
      ...p,
      weeks: p.weeks.map((w) => ({
        ...w,
        days: w.days.map((d) => {
          const { discipline, ...day } = d as unknown as Raw
          const disciplineId = disciplineOf(discipline)
          return {
            ...(day as unknown as Program['weeks'][number]['days'][number]),
            ...(disciplineId ? { disciplineId } : {}),
          }
        }),
      })),
    }
  })
  const sessions: Session[] = (r.sessions ?? []).map((x) => {
    const { discipline, ...rest } = x as Raw
    const disciplineId = disciplineOf(discipline)
    return { ...(rest as unknown as Session), ...(disciplineId ? { disciplineId } : {}) }
  })
  const goals: Goal[] = (r.goals ?? []).map((x) => {
    const { discipline, ...rest } = x as Raw
    const g = rest as unknown as Goal
    const disciplineId = disciplineOf(discipline)
    return {
      ...g,
      ...(disciplineId ? { disciplineId } : {}),
      ...(g.kind === 'weekly_volume'
        ? { volume: discipline === 'swim' || discipline === 'run' ? 'distance' : 'tonnage' }
        : {}),
    } as Goal
  })
  // Built-in exercises the old data refers to join the user's library.
  const have = new Set(exercises.map((e) => e.id))
  const referenced = new Set<string>([
    ...sessions.flatMap((s) => s.entries.map((e) => e.exerciseId)),
    ...programs.flatMap((p) => p.weeks.flatMap((w) => w.days.flatMap((d) => d.blocks.map((b) => b.exerciseId)))),
    ...goals.flatMap((g) => (g.exerciseId ? [g.exerciseId] : [])),
  ])
  for (const id of referenced) {
    if (have.has(id)) continue
    const sport = sportOf(id)
    if (!sport) continue
    used.add(sport)
    const e = demoExercise(id, DEMO_DISCIPLINES[sport].id)
    if (e) exercises.push(e)
  }
  const existing = (r.disciplines ?? []) as Discipline[]
  const disciplines = [
    ...existing,
    ...[...used].map((s) => DEMO_DISCIPLINES[s]).filter((d) => !existing.some((x) => x.id === d.id)),
  ]
  return { disciplines, exercises, programs, sessions, goals }
}
