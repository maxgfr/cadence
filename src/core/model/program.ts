import { currentMessages } from '../i18n/index.ts'
import type { ExerciseIndex } from '../library/exercises.ts'
import type { LastPerformance } from '../stats/metrics.ts'
import { addDays } from './dates.ts'
import { newId } from './ids.ts'
import type {
  Block,
  Day,
  Discipline,
  Entry,
  Exercise,
  Intensity,
  Program,
  ProgramRef,
  Session,
  SetLog,
} from './schemas.ts'
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
      return currentMessages().core.pctMax(String(i.value))
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
  else volume = currentMessages().core.reps(block.sets)
  if (block.sets === 1 && (block.distance !== undefined || fixed !== undefined))
    volume = formatDistance(block.distance ?? fixed ?? 0, units.distanceUnit)
  const parts = [volume]
  if (block.interval !== undefined) parts[0] += ` @${formatTime(block.interval, false)}`
  if (detail && block.intensity)
    parts[0] +=
      block.interval !== undefined
        ? ` · ${formatIntensity(block.intensity, units)}`
        : ` @${formatIntensity(block.intensity, units)}`
  if (detail && block.rest !== undefined && block.rest > 0)
    parts.push(currentMessages().core.rest(formatTime(block.rest, false)))
  if (detail && block.tempo) parts.push(currentMessages().core.tempo(block.tempo))
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

/**
 * Where a session's day is in the program as it is now: found by its id, so a day deleted on another device does not
 * shift the others. Undefined when that day is gone. Sessions from before version 8 have no id and read by position.
 */
export function locate(program: Program, ref: ProgramRef): Pick<ProgramRef, 'week' | 'day'> | undefined {
  if (ref.dayId === undefined) return { week: ref.week, day: ref.day }
  for (const [week, w] of program.weeks.entries()) {
    const day = w.days.findIndex((d) => d.id === ref.dayId)
    if (day >= 0) return { week, day }
  }
  return undefined
}

/** A session's reference with its day where it is now; undefined when the program or the day is gone. */
export function currentRef(programs: readonly Program[], ref: ProgramRef | undefined): ProgramRef | undefined {
  const program = ref && programs.find((p) => p.id === ref.programId)
  const at = program && ref && locate(program, ref)
  return at && ref && { ...ref, ...at }
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
    let latestDay = -1
    for (const s of sessions) {
      if (s.status !== 'done' || s.programRef?.programId !== program.id) continue
      const at = locate(program, s.programRef)
      if (!at) continue
      if (
        !latest ||
        s.date > latest.date ||
        (s.date === latest.date && (s.startedAt ?? '') > (latest.startedAt ?? ''))
      ) {
        latest = s
        latestDay = at.day
      }
    }
    return { programId: program.id, week: 0, day: (latestDay + 1) % count }
  }
  let furthest = -1
  for (const s of sessions) {
    if (s.status !== 'done' || s.programRef?.programId !== program.id) continue
    const at = locate(program, s.programRef)
    if (at) furthest = Math.max(furthest, order(at, program))
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

/** The load lifted last time on the set of this rank, else on its last set. */
function loadAt(last: LastPerformance | undefined, i: number): number | undefined {
  return (last?.sets[i] ?? last?.sets[last.sets.length - 1])?.weight
}

/**
 * The empty sets of an entry, pre-filled so logging is mostly confirming: reps and times from its plan, the load the
 * athlete really lifted last time, else the plan's.
 */
export function plannedSets(
  block: Block,
  exercise: Exercise | undefined,
  e1rm: number | undefined,
  last?: LastPerformance,
): SetLog[] {
  const planned = suggestedWeight(block, e1rm)
  const distance = block.distance ?? exercise?.distance
  const rpe = block.intensity?.kind === 'rpe' ? block.intensity.value : undefined
  return Array.from({ length: block.sets }, (_, i) => {
    const s: SetLog = { done: false }
    const weight = (exercise?.metric === 'weight_reps' ? loadAt(last, i) : undefined) ?? planned
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

/**
 * The sets of an exercise added by hand: as many as last time, with their load and reps, none ticked. A time or a
 * distance is a result to beat, not a setting to reuse: those start empty.
 */
export function setsFromLast(exercise: Exercise | undefined, last: LastPerformance | undefined): SetLog[] {
  const metric = exercise?.metric
  if (!last || (metric !== 'weight_reps' && metric !== 'reps')) return [emptySet(exercise)]
  return last.sets.map((set) => ({
    done: false,
    ...(metric === 'weight_reps' && set.weight !== undefined ? { weight: set.weight } : {}),
    ...(set.reps !== undefined ? { reps: set.reps } : {}),
  }))
}

/** Sets as one short line: "3×8 · 60 kg", "2×8 · 60 kg, 1×6 · 62.5 kg", "4×1:05", "2×100 m 1:50". */
export function describeSets(sets: readonly SetLog[], exercise: Exercise | undefined, units: UnitPrefs): string {
  const metric = exercise?.metric ?? 'weight_reps'
  const text = (s: SetLog) => {
    const time = s.time !== undefined ? formatTime(s.time) : ''
    if (metric === 'time') return time || '–'
    if (metric === 'distance_time') {
      const open = exercise?.distance === undefined && s.distance !== undefined
      return [open ? formatDistance(s.distance ?? 0, units.distanceUnit) : '', time].filter(Boolean).join(' ') || '–'
    }
    return String(s.reps ?? '–')
  }
  const load = (s: SetLog) =>
    metric === 'weight_reps' && s.weight !== undefined ? ` · ${formatWeight(s.weight, units.weightUnit)}` : ''
  const groups: { line: string; n: number }[] = []
  for (const s of sets) {
    const line = `${text(s)}${load(s)}`
    const previous = groups[groups.length - 1]
    if (previous?.line === line) previous.n++
    else groups.push({ line, n: 1 })
  }
  const counted = metric === 'weight_reps' || metric === 'reps'
  return groups.map((g) => (counted || g.n > 1 ? `${g.n}×${g.line}` : g.line)).join(', ')
}

/** A block without its load: kilos written for one exercise mean nothing on another. */
function withoutLoad(block: Block): Block {
  if (block.intensity?.kind !== 'kg') return block
  const { intensity: _load, ...rest } = block
  return rest
}

/**
 * An entry moved to another exercise. Measured the same way, its plan and the sets ticked stay (a wrong exercise
 * being corrected), the others take the load last lifted on the new one. Measured differently, nothing carries over.
 */
export function swapEntryExercise(
  entry: Entry,
  from: Exercise | undefined,
  to: Exercise,
  last: LastPerformance | undefined,
): Entry {
  if (from?.metric !== to.metric) {
    const { planned: _plan, ...rest } = entry
    const fresh = setsFromLast(to, last)
    return {
      ...rest,
      exerciseId: to.id,
      sets: entry.sets.map((_, i) => fresh[i] ?? emptySet(to, fresh[fresh.length - 1])),
    }
  }
  return {
    ...entry,
    exerciseId: to.id,
    ...(entry.planned ? { planned: { ...withoutLoad(entry.planned), exerciseId: to.id } } : {}),
    sets: entry.sets.map((set, i) => {
      if (set.done) return set
      const { weight: _old, distance: oldDistance, ...rest } = set
      const load = to.metric === 'weight_reps' ? loadAt(last, i) : undefined
      const distance = to.distance ?? (from.distance === undefined ? oldDistance : undefined)
      return {
        ...rest,
        ...(load !== undefined ? { weight: load } : {}),
        ...(distance !== undefined ? { distance } : {}),
      }
    }),
  }
}

/** The program with one block of the session's day on another exercise; undefined when that block is gone. */
export function replaceBlockExercise(
  program: Program,
  ref: ProgramRef,
  blockId: string,
  exerciseId: string,
): Program | undefined {
  const at = locate(program, ref)
  const day = at && dayAt(program, at)
  if (!at || !day?.blocks.some((b) => b.id === blockId)) return undefined
  return {
    ...program,
    weeks: program.weeks.map((w, i) =>
      i !== at.week
        ? w
        : {
            ...w,
            days: w.days.map((d, j) =>
              j !== at.day
                ? d
                : {
                    ...d,
                    blocks: d.blocks.map((b) => (b.id === blockId ? { ...withoutLoad(b), exerciseId } : b)),
                  },
            ),
          },
    ),
  }
}

/** A new active session for a program day, entries pre-filled from the plan and from last time. */
export function sessionFromDay(
  program: Program,
  ref: ProgramRef,
  exercises: ExerciseIndex,
  e1rmOf: (exerciseId: string) => number | undefined,
  date: string,
  now: Date = new Date(),
  lastOf?: (exerciseId: string) => LastPerformance | undefined,
): Session {
  const day = dayAt(program, ref)
  const entries: Entry[] = (day?.blocks ?? []).map((block) => ({
    id: newId(),
    exerciseId: block.exerciseId,
    planned: block,
    sets: plannedSets(block, exercises.get(block.exerciseId), e1rmOf(block.exerciseId), lastOf?.(block.exerciseId)),
  }))
  const weekName = program.weeks[ref.week]?.name ?? currentMessages().core.week(ref.week + 1)
  return {
    id: newId(),
    date,
    title: day ? (isSessionSet(program) ? day.name : `${day.name} · ${weekName}`) : program.name,
    ...(day?.disciplineId ? { disciplineId: day.disciplineId } : {}),
    programRef: day ? { ...ref, dayId: day.id } : ref,
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
    title: discipline ? currentMessages().core.disciplineSession(discipline.name) : currentMessages().core.session,
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
  // Each session with its day where it is now; one whose day was deleted since ticks nothing.
  const mine = sessions.flatMap((session) => {
    if (session.status !== 'done' || session.programRef?.programId !== program.id) return []
    const at = locate(program, session.programRef)
    return at ? [{ session, ...at }] : []
  })
  const thisWeek = mine.filter((x) => x.session.date >= weekStart && x.session.date <= weekEnd)
  const set = isSessionSet(program)
  const week = set
    ? 0
    : thisWeek.length > 0
      ? Math.min(...thisWeek.map((x) => x.week))
      : nextDay(program, sessions)?.week
  if (week === undefined) return undefined
  const plan = program.weeks[week]?.days ?? []
  // Each session done ticks its own day, or, when that one is ticked already, a day of the same name still open: a
  // week with the same session twice (Full body A, B, A) needs it done twice.
  const pool = (set ? thisWeek : mine)
    .filter((x) => x.week === week)
    .sort(
      (a, b) =>
        a.session.date.localeCompare(b.session.date) ||
        (a.session.startedAt ?? '').localeCompare(b.session.startedAt ?? ''),
    )
  const done = new Map<number, Session>()
  const twins: typeof pool = []
  for (const x of pool) {
    if (plan[x.day] && !done.has(x.day)) done.set(x.day, x.session)
    else twins.push(x)
  }
  for (const x of twins) {
    const name = plan[x.day]?.name
    const d = plan.findIndex((day, i) => !done.has(i) && day.name === name)
    if (d >= 0) done.set(d, x.session)
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

/**
 * Sets said aloud, into the session: they fill the exercise's planned sets not done yet, in order (the plan's
 * distance kept when the athlete gave none), then are added after them. An exercise not in the session gets its entry.
 */
export function applyLoggedSets(session: Session, exerciseId: string, sets: readonly SetLog[]): Session {
  const at = session.entries.findLastIndex((e) => e.exerciseId === exerciseId)
  if (at === -1)
    return { ...session, entries: [...session.entries, { id: newId(), exerciseId, sets: sets.map((s) => ({ ...s })) }] }
  const entries = [...session.entries]
  const entry = entries[at]
  if (!entry) return session
  const next = entry.sets.map((s) => ({ ...s }))
  let i = 0
  for (const [k, s] of next.entries()) {
    const said = sets[i]
    if (!said) break
    if (s.done) continue
    next[k] = { ...(s.distance !== undefined ? { distance: s.distance } : {}), ...said, done: true }
    i++
  }
  next.push(...sets.slice(i).map((s) => ({ ...s })))
  entries[at] = { ...entry, sets: next }
  return { ...session, entries }
}

/**
 * The rest between sets of an exercise: the plan's, else the exercise's, else its discipline's, else the settings'
 * (what Settings used to set for everything). 0 means no timer.
 */
export function restFor(
  planned: Block | undefined,
  exercise: Exercise | undefined,
  discipline: Pick<Discipline, 'rest'> | undefined,
  fallback: number,
): number {
  return planned?.rest ?? exercise?.rest ?? discipline?.rest ?? fallback
}
