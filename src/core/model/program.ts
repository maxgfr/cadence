import type { ExerciseIndex } from '../library/exercises.ts'
import { newId } from './ids.ts'
import type { Block, Day, Entry, Exercise, Intensity, Program, ProgramRef, Session, SetLog } from './schemas.ts'
import { type DistanceUnit, formatDistance, formatTime, formatWeight, type WeightUnit } from './units.ts'

export interface UnitPrefs {
  weightUnit: WeightUnit
  distanceUnit: DistanceUnit
}

export function formatIntensity(i: Intensity, units: UnitPrefs): string {
  switch (i.kind) {
    case 'kg':
      return formatWeight(i.value, units.weightUnit)
    case 'pct1rm':
      return `${i.value}%`
    case 'rpe':
      return `RPE ${i.value}`
    case 'pace':
      return formatTime(i.value)
    case 'pctmax':
      return `${i.value}% max`
  }
}

/**
 * The block as a coach writes it: "5×5 @80%", "8×50 m @1:50", "6×60 m @95% max · rest 3:00".
 * Normal mode leaves out intensity, rest and tempo (`detail` false).
 */
export function describeBlock(block: Block, exercise: Exercise | undefined, units: UnitPrefs, detail = true): string {
  const fixed = exercise?.distance
  let volume: string
  if (block.distance !== undefined || fixed !== undefined) {
    volume = `${block.sets}×${formatDistance(block.distance ?? fixed ?? 0, units.distanceUnit)}`
  } else if (block.reps !== undefined) volume = `${block.sets}×${block.reps}`
  else if (block.duration !== undefined) volume = `${block.sets}×${formatTime(block.duration, false)}`
  else volume = block.sets === 1 ? '1 rep' : `${block.sets} reps`
  if (block.sets === 1 && (block.distance !== undefined || fixed !== undefined))
    volume = formatDistance(block.distance ?? fixed ?? 0, units.distanceUnit)
  const parts = [volume]
  if (block.interval !== undefined) parts[0] += ` @${formatTime(block.interval, false)}`
  if (detail && block.intensity)
    parts[0] +=
      block.interval !== undefined
        ? ` · ${formatIntensity(block.intensity, units)}`
        : ` @${formatIntensity(block.intensity, units)}`
  if (detail && block.rest !== undefined && block.rest > 0) parts.push(`rest ${formatTime(block.rest, false)}`)
  if (detail && block.tempo) parts.push(`tempo ${block.tempo}`)
  return parts.join(' · ')
}

export function dayAt(program: Program, ref: Pick<ProgramRef, 'week' | 'day'>): Day | undefined {
  return program.weeks[ref.week]?.days[ref.day]
}

export function totalDays(program: Program): number {
  return program.weeks.reduce((n, w) => n + w.days.length, 0)
}

const order = (r: Pick<ProgramRef, 'week' | 'day'>, program: Program) => {
  let n = 0
  for (let w = 0; w < r.week; w++) n += program.weeks[w]?.days.length ?? 0
  return n + r.day
}

/**
 * The program's next day: the one after the furthest day already completed, so a missed weekday never
 * leaves the athlete behind. Undefined once every day is done.
 */
export function nextDay(program: Program, sessions: readonly Session[]): ProgramRef | undefined {
  let furthest = -1
  for (const s of sessions) {
    if (s.status !== 'done' || s.programRef?.programId !== program.id) continue
    furthest = Math.max(furthest, order(s.programRef, program))
  }
  let n = 0
  for (let w = 0; w < program.weeks.length; w++) {
    const days = program.weeks[w]?.days.length ?? 0
    for (let d = 0; d < days; d++, n++) if (n > furthest) return { programId: program.id, week: w, day: d }
  }
  return undefined
}

export function completedDays(program: Program, sessions: readonly Session[]): number {
  const next = nextDay(program, sessions)
  return next ? order(next, program) : totalDays(program)
}

/** Weight to load for a planned block: the absolute load, or a share of the estimated 1RM rounded to 2.5 kg. */
export function suggestedWeight(block: Block, e1rm: number | undefined): number | undefined {
  const i = block.intensity
  if (!i) return undefined
  if (i.kind === 'kg') return i.value
  if (i.kind === 'pct1rm' && e1rm !== undefined) return Math.round((e1rm * i.value) / 100 / 2.5) * 2.5
  return undefined
}

/** The empty sets of an entry, pre-filled from its plan so logging is mostly confirming. */
export function plannedSets(block: Block, exercise: Exercise | undefined, e1rm: number | undefined): SetLog[] {
  const weight = suggestedWeight(block, e1rm)
  const distance = block.distance ?? exercise?.distance
  const rpe = block.intensity?.kind === 'rpe' ? block.intensity.value : undefined
  return Array.from({ length: block.sets }, () => {
    const s: SetLog = { done: false }
    if (block.reps !== undefined) s.reps = block.reps
    if (weight !== undefined) s.weight = weight
    if (block.duration !== undefined) s.time = block.duration
    if (distance !== undefined && exercise?.metric === 'distance_time') s.distance = distance
    if (rpe !== undefined) s.rpe = rpe
    return s
  })
}

export function emptySet(exercise: Exercise | undefined, previous?: SetLog): SetLog {
  if (previous) return { ...previous, done: false }
  const s: SetLog = { done: false }
  if (exercise?.distance !== undefined) s.distance = exercise.distance
  return s
}

/** A new active session for a program day, entries pre-filled from the plan. */
export function sessionFromDay(
  program: Program,
  ref: ProgramRef,
  exercises: ExerciseIndex,
  e1rmOf: (exerciseId: string) => number | undefined,
  date: string,
  now: Date = new Date(),
): Session {
  const day = dayAt(program, ref)
  const entries: Entry[] = (day?.blocks ?? []).map((block) => ({
    id: newId(),
    exerciseId: block.exerciseId,
    planned: block,
    sets: plannedSets(block, exercises.get(block.exerciseId), e1rmOf(block.exerciseId)),
  }))
  const weekName = program.weeks[ref.week]?.name ?? `Week ${ref.week + 1}`
  return {
    id: newId(),
    date,
    title: day ? `${day.name} · ${weekName}` : program.name,
    ...(day?.disciplineId ? { disciplineId: day.disciplineId } : {}),
    programRef: ref,
    entries,
    status: 'active',
    startedAt: now.toISOString(),
  }
}

/** A session with no plan: the athlete adds exercises as they go. */
export function freeSession(
  discipline: { id: string; name: string } | undefined,
  date: string,
  now: Date = new Date(),
): Session {
  return {
    id: newId(),
    date,
    title: discipline ? `${discipline.name} session` : 'Session',
    ...(discipline ? { disciplineId: discipline.id } : {}),
    entries: [],
    status: 'active',
    startedAt: now.toISOString(),
  }
}

/** The disciplines a program trains, in the order its days first use them. */
export function programDisciplines(program: Program): string[] {
  const out: string[] = []
  for (const w of program.weeks)
    for (const d of w.days) if (d.disciplineId && !out.includes(d.disciplineId)) out.push(d.disciplineId)
  return out
}

/** Fresh ids throughout, for a copied week or day. */
export function cloneWeek(week: Program['weeks'][number]): Program['weeks'][number] {
  return {
    ...week,
    id: newId(),
    days: week.days.map((d) => ({ ...d, id: newId(), blocks: d.blocks.map((b) => ({ ...b, id: newId() })) })),
  }
}
