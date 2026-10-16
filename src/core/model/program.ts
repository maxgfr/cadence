import type { ExerciseIndex } from '../library/exercises.ts'
import { addDays } from './dates.ts'
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

/** A set of sessions done in any order and repeated, rather than a plan of weeks. */
export function isSessionSet(program: Program): boolean {
  return program.layout === 'sessions'
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
  if (isSessionSet(program)) {
    // A set of sessions never ends: the one after the latest done, round again after the last.
    const count = program.weeks[0]?.days.length ?? 0
    if (count === 0) return undefined
    let latest: Session | undefined
    for (const s of sessions) {
      if (s.status !== 'done' || s.programRef?.programId !== program.id) continue
      if (!latest || s.date > latest.date || (s.date === latest.date && (s.startedAt ?? '') > (latest.startedAt ?? '')))
        latest = s
    }
    return { programId: program.id, week: 0, day: latest?.programRef ? (latest.programRef.day + 1) % count : 0 }
  }
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

/** Days done so far: up to the next one for a plan of weeks, every session logged for a set of sessions. */
export function completedDays(program: Program, sessions: readonly Session[]): number {
  if (isSessionSet(program))
    return sessions.filter((s) => s.status === 'done' && s.programRef?.programId === program.id).length
  const next = nextDay(program, sessions)
  return next ? order(next, program) : totalDays(program)
}

/**
 * The days to pick from when starting a session of this program out of turn: every session of a set, or the days of
 * the current week of a plan (its last week once it is finished).
 */
export function choosableDays(program: Program, sessions: readonly Session[], weekStart?: string): ProgramRef[] {
  // A plan under way offers the week of its todo while some of it is left, so what is started ticks the todo.
  const todo = weekStart !== undefined ? weekTodo(program, sessions, weekStart) : undefined
  const week = isSessionSet(program)
    ? 0
    : todo && todo.week !== undefined && todo.left > 0
      ? todo.week
      : (nextDay(program, sessions)?.week ?? program.weeks.length - 1)
  return (program.weeks[week]?.days ?? [])
    .map((d, day) => ({ d, ref: { programId: program.id, week, day } }))
    .filter(({ d }) => d.blocks.length > 0)
    .map(({ ref }) => ref)
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
    title: day ? (isSessionSet(program) ? day.name : `${day.name} · ${weekName}`) : program.name,
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

export interface WeekTodo {
  program: Program
  /** The program week this calendar week works on; undefined for a set of sessions. */
  week: number | undefined
  days: { ref: ProgramRef; day: Day; done: Session | undefined }[]
  /** Days of the list not done yet. */
  left: number
  /** Days of a plan not done yet, to its end; undefined for a set of sessions. */
  programLeft: number | undefined
}

/**
 * What a program asks of this calendar week (from `weekStart`, the first day, for seven days), each day with the
 * session that did it:
 * - a plan: the days of the program week under way, that is the week of the first of its sessions done this calendar
 *   week, or else the week of its next day; a day done earlier counts as done;
 * - a set of sessions: each of its sessions once, done when logged this calendar week.
 * Undefined for a plan finished before this week.
 */
export function weekTodo(program: Program, sessions: readonly Session[], weekStart: string): WeekTodo | undefined {
  const weekEnd = addDays(weekStart, 6)
  const mine = sessions.filter((s) => s.status === 'done' && s.programRef?.programId === program.id)
  const thisWeek = mine.filter((s) => s.date >= weekStart && s.date <= weekEnd)
  const set = isSessionSet(program)
  const week = set
    ? 0
    : thisWeek.length > 0
      ? Math.min(...thisWeek.map((s) => s.programRef?.week ?? 0))
      : nextDay(program, sessions)?.week
  if (week === undefined) return undefined
  const plan = program.weeks[week]?.days ?? []
  // Each session done ticks its own day, or, when that one is ticked already, a day of the same name still open: a
  // week with the same session twice (Full body A, B, A) needs it done twice.
  const pool = (set ? thisWeek : mine)
    .filter((s) => s.programRef?.week === week)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startedAt ?? '').localeCompare(b.startedAt ?? ''))
  const done = new Map<number, Session>()
  const twins: Session[] = []
  for (const x of pool) {
    const d = x.programRef?.day ?? -1
    if (plan[d] && !done.has(d)) done.set(d, x)
    else twins.push(x)
  }
  for (const x of twins) {
    const name = plan[x.programRef?.day ?? -1]?.name
    const d = plan.findIndex((day, i) => !done.has(i) && day.name === name)
    if (d >= 0) done.set(d, x)
  }
  const days = plan.map((day, d) => ({ ref: { programId: program.id, week, day: d }, day, done: done.get(d) }))
  return {
    program,
    week: set ? undefined : week,
    days,
    left: days.filter((x) => !x.done).length,
    programLeft: set ? undefined : totalDays(program) - completedDays(program, sessions),
  }
}

/**
 * The day to log when the athlete picks `ref` from a program under way: that day, or, when it is done already this
 * week, the first day of the same name still to do (the second Full body A of the week).
 */
export function dayToStart(todo: WeekTodo | undefined, ref: ProgramRef): ProgramRef {
  if (!todo || todo.week !== ref.week) return ref
  const picked = todo.days[ref.day]
  if (!picked?.done) return ref
  return todo.days.find((x) => !x.done && x.day.name === picked.day.name)?.ref ?? ref
}

/**
 * The programs under way, the latest trained first: those with a session logged, minus plans finished before this
 * week. Athletes switch between them during the week; none is "the" current one.
 */
export function programsUnderWay(
  programs: readonly Program[],
  sessions: readonly Session[],
  weekStart: string,
): WeekTodo[] {
  const last = new Map<string, string>()
  for (const s of sessions) {
    const id = s.programRef?.programId
    if (s.status === 'done' && id && s.date > (last.get(id) ?? '')) last.set(id, s.date)
  }
  return programs
    .filter((p) => last.has(p.id))
    .sort((a, b) => (last.get(b.id) ?? '').localeCompare(last.get(a.id) ?? ''))
    .map((p) => weekTodo(p, sessions, weekStart))
    .filter((t): t is WeekTodo => t !== undefined)
}

/** Fresh ids throughout, for a copied week or day. */
export function cloneWeek(week: Program['weeks'][number]): Program['weeks'][number] {
  return {
    ...week,
    id: newId(),
    days: week.days.map((d) => ({ ...d, id: newId(), blocks: d.blocks.map((b) => ({ ...b, id: newId() })) })),
  }
}
