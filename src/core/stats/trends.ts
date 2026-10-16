import type { ExerciseIndex } from '../library/exercises.ts'
import { addDays, daysBetween, startOfWeek } from '../model/dates.ts'
import type { Exercise, Goal, Muscle, Session } from '../model/schemas.ts'
import { completed, doneSets, exerciseSeries, lowerIsBetter, measureOf, type Point } from './metrics.ts'

export interface WeekVolume {
  /** First day of the week. */
  week: string
  sessions: number
  minutes: number
  /** Kilograms moved on loaded lifts (weight × reps). */
  tonnage: number
  /** Metres covered on distance exercises. */
  meters: number
  /** Hard sets per muscle group (each done set of an exercise counts for every muscle it lists). */
  setsByMuscle: Partial<Record<Muscle, number>>
  /** The same figures per discipline id; sessions and sets without a discipline are under `''`. */
  byDiscipline: Record<string, DisciplineWeek>
}

export interface DisciplineWeek {
  sessions: number
  tonnage: number
  meters: number
}

const NONE = ''

function share(w: WeekVolume, disciplineId: string | undefined): DisciplineWeek {
  const key = disciplineId ?? NONE
  let d = w.byDiscipline[key]
  if (!d) {
    d = { sessions: 0, tonnage: 0, meters: 0 }
    w.byDiscipline[key] = d
  }
  return d
}

const emptyWeek = (week: string): WeekVolume => ({
  week,
  sessions: 0,
  minutes: 0,
  tonnage: 0,
  meters: 0,
  setsByMuscle: {},
  byDiscipline: {},
})

/** Volume per week for the `weeks` weeks ending with the week of `today`, oldest first, empty weeks included. */
export function weeklyVolume(
  sessions: readonly Session[],
  exercises: ExerciseIndex,
  today: string,
  weekStart: 0 | 1,
  weeks = 12,
): WeekVolume[] {
  const last = startOfWeek(today, weekStart)
  const out: WeekVolume[] = []
  const byWeek = new Map<string, WeekVolume>()
  for (let i = weeks - 1; i >= 0; i--) {
    const w = emptyWeek(addDays(last, -7 * i))
    out.push(w)
    byWeek.set(w.week, w)
  }
  for (const s of completed(sessions)) {
    const w = byWeek.get(startOfWeek(s.date, weekStart))
    if (!w) continue
    w.sessions++
    w.minutes += s.duration ?? 0
    share(w, s.disciplineId).sessions++
    for (const e of s.entries) {
      const ex = exercises.get(e.exerciseId)
      if (!ex) continue
      // An exercise counts where it belongs; one without a discipline counts with its session.
      const d = share(w, ex.disciplineId ?? s.disciplineId)
      for (const set of doneSets(e)) {
        if (ex.metric === 'weight_reps' && set.weight !== undefined && set.reps !== undefined) {
          w.tonnage += set.weight * set.reps
          d.tonnage += set.weight * set.reps
        }
        if (ex.metric === 'distance_time') {
          const m = set.distance ?? ex.distance ?? 0
          w.meters += m
          d.meters += m
        }
        for (const m of ex.muscles ?? []) w.setsByMuscle[m] = (w.setsByMuscle[m] ?? 0) + 1
      }
    }
  }
  return out
}

export interface HeatDay {
  date: string
  sessions: number
  minutes: number
  /** 0 (rest) to 4 (a long or double day). */
  level: 0 | 1 | 2 | 3 | 4
}

/** Assumed length of a session logged without a duration. */
const DEFAULT_MINUTES = 45

/** Every day of the `weeks` weeks ending with the week of `today`, Monday- or Sunday-first. */
export function consistency(sessions: readonly Session[], today: string, weekStart: 0 | 1, weeks = 16): HeatDay[] {
  const first = addDays(startOfWeek(today, weekStart), -7 * (weeks - 1))
  const days = new Map<string, HeatDay>()
  for (let i = 0; i < weeks * 7; i++) {
    const date = addDays(first, i)
    days.set(date, { date, sessions: 0, minutes: 0, level: 0 })
  }
  for (const s of completed(sessions)) {
    const d = days.get(s.date)
    if (!d) continue
    d.sessions++
    d.minutes += s.duration ?? DEFAULT_MINUTES
  }
  for (const d of days.values()) {
    if (d.sessions === 0) continue
    d.level = d.minutes < 40 ? 1 : d.minutes < 75 ? 2 : d.minutes < 110 ? 3 : 4
  }
  return [...days.values()]
}

/** Sessions in a row of weeks, ending this week (or last week while this one has none yet), with at least one session. */
export function weekStreak(sessions: readonly Session[], today: string, weekStart: 0 | 1): number {
  const weeks = new Set(completed(sessions).map((s) => startOfWeek(s.date, weekStart)))
  let w = startOfWeek(today, weekStart)
  if (!weeks.has(w)) w = addDays(w, -7)
  let n = 0
  while (weeks.has(w)) {
    n++
    w = addDays(w, -7)
  }
  return n
}

/** Done sets over planned sets for the planned entries of a session (0–1); undefined without a plan. */
export function sessionAdherence(session: Session): number | undefined {
  let planned = 0
  let done = 0
  for (const e of session.entries) {
    if (!e.planned) continue
    planned += e.planned.sets
    done += Math.min(doneSets(e).length, e.planned.sets)
  }
  return planned === 0 ? undefined : done / planned
}

/** Mean adherence over a program's completed sessions. */
export function programAdherence(sessions: readonly Session[], programId: string): number | undefined {
  const values = completed(sessions)
    .filter((s) => s.programRef?.programId === programId)
    .map(sessionAdherence)
    .filter((v): v is number => v !== undefined)
  if (values.length === 0) return undefined
  return values.reduce((a, b) => a + b, 0) / values.length
}

export interface Fit {
  slope: number
  intercept: number
}

/** Least squares over (x, y); undefined with fewer than two distinct x. */
export function linearFit(points: readonly { x: number; y: number }[]): Fit | undefined {
  const n = points.length
  if (n < 2) return undefined
  const mx = points.reduce((a, p) => a + p.x, 0) / n
  const my = points.reduce((a, p) => a + p.y, 0) / n
  let sxx = 0
  let sxy = 0
  for (const p of points) {
    sxx += (p.x - mx) ** 2
    sxy += (p.x - mx) * (p.y - my)
  }
  if (sxx === 0) return undefined
  const slope = sxy / sxx
  return { slope, intercept: my - slope * mx }
}

export interface GoalProgress {
  /** The series the goal is measured on (session bests, or one value per week), oldest first. */
  series: { date: string; value: number }[]
  start?: number
  current?: number
  /** 0–1 from the starting value to the target. */
  fraction: number
  lowerIsBetter: boolean
  achieved: boolean
  /** The linear trend of recent values, carried to the deadline; absent with too little data. */
  projection?: { date: string; value: number }
  onTrack?: boolean
  daysLeft: number
}

function goalSeries(
  goal: Goal,
  sessions: readonly Session[],
  exercises: ExerciseIndex,
  today: string,
  weekStart: 0 | 1,
): { series: { date: string; value: number }[]; lower: boolean; weekly: boolean } {
  if (goal.kind === 'e1rm' || goal.kind === 'best_time') {
    const ex: Exercise | undefined = goal.exerciseId ? exercises.get(goal.exerciseId) : undefined
    if (!ex) return { series: [], lower: goal.kind === 'best_time', weekly: false }
    const pts: Point[] = exerciseSeries(sessions, ex)
    return { series: pts, lower: lowerIsBetter(measureOf(ex)), weekly: false }
  }
  const since = goal.createdAt.slice(0, 10)
  const weeks = Math.max(4, Math.ceil(daysBetween(since, today) / 7) + 1)
  const vol = weeklyVolume(sessions, exercises, today, weekStart, Math.min(weeks, 52))
  const value = (w: WeekVolume) => {
    const scope = goal.disciplineId ? w.byDiscipline[goal.disciplineId] : undefined
    if (goal.kind === 'frequency') return goal.disciplineId ? (scope?.sessions ?? 0) : w.sessions
    if (goal.volume === 'distance') return goal.disciplineId ? (scope?.meters ?? 0) : w.meters
    return goal.disciplineId ? (scope?.tonnage ?? 0) : w.tonnage
  }
  // The running week is incomplete: it only counts once it beats the last full one.
  const series = vol.map((w) => ({ date: w.week, value: value(w) }))
  return { series, lower: false, weekly: true }
}

export function goalProgress(
  goal: Goal,
  sessions: readonly Session[],
  exercises: ExerciseIndex,
  today: string,
  weekStart: 0 | 1,
): GoalProgress {
  const { series, lower, weekly } = goalSeries(goal, sessions, exercises, today, weekStart)
  const daysLeft = daysBetween(today, goal.deadline)
  const created = goal.createdAt.slice(0, 10)
  const before = series.filter((p) => p.date <= created)
  let current: number | undefined
  if (weekly) {
    const done = series.slice(0, -1)
    const thisWeek = series[series.length - 1]?.value ?? 0
    const lastFull = done[done.length - 1]?.value ?? 0
    current = Math.max(thisWeek, lastFull)
  } else if (series.length > 0) {
    const values = series.map((p) => p.value)
    current = lower ? Math.min(...values) : Math.max(...values)
  }
  const start = weekly
    ? series.find((p) => p.date >= startOfWeek(created, weekStart))?.value
    : (before[before.length - 1]?.value ?? series[0]?.value)
  const achieved = current !== undefined && (lower ? current <= goal.target : current >= goal.target)
  let fraction = 0
  if (current !== undefined) {
    if (start !== undefined && start !== goal.target) {
      fraction = lower ? (start - current) / (start - goal.target) : (current - start) / (goal.target - start)
    } else if (!lower) fraction = current / goal.target
    if (achieved) fraction = 1
    fraction = Math.min(1, Math.max(0, fraction))
  }
  // Trend: the last eight weeks, or the last ten sessions.
  const recent = weekly ? series.slice(-9, -1) : series.slice(-10)
  const fit = linearFit(recent.map((p) => ({ x: daysBetween(today, p.date), y: p.value })))
  let projection: GoalProgress['projection']
  let onTrack: boolean | undefined
  if (fit && daysLeft > 0 && !achieved) {
    const value = Math.max(0, fit.intercept + fit.slope * daysLeft)
    projection = { date: goal.deadline, value }
    onTrack = lower ? value <= goal.target : value >= goal.target
  }
  return {
    series,
    ...(start !== undefined ? { start } : {}),
    ...(current !== undefined ? { current } : {}),
    fraction,
    lowerIsBetter: lower,
    achieved,
    ...(projection ? { projection } : {}),
    ...(onTrack !== undefined ? { onTrack } : {}),
    daysLeft,
  }
}

export interface GoalBaseline {
  /** Where the athlete stands: their best (a lift, a time) or their average of the last four full weeks. */
  current: number
  basis: 'best' | 'recent_weeks'
  lowerIsBetter: boolean
  /** A target that stretches the current value by the deadline without being out of reach. */
  suggested: number
}

const roundTo = (v: number, step: number, up: boolean) => (up ? Math.ceil(v / step) : Math.floor(v / step)) * step

/**
 * The starting point of a goal being set, from what is logged: nothing is suggested without data. The stretch grows
 * with the time to the deadline and is capped: about 1% a week on a lift (15% at most), 0.5% a week off a time (6%),
 * 2% a week on a weekly volume (30%), one more session a week.
 */
export function goalBaseline(
  draft: Pick<Goal, 'kind' | 'deadline'> & Partial<Pick<Goal, 'exerciseId' | 'disciplineId' | 'volume'>>,
  sessions: readonly Session[],
  exercises: ExerciseIndex,
  today: string,
  weekStart: 0 | 1,
): GoalBaseline | undefined {
  const goal: Goal = { id: 'baseline', target: 1, createdAt: today, ...draft }
  const { series, lower, weekly } = goalSeries(goal, sessions, exercises, today, weekStart)
  let current: number
  if (weekly) {
    const full = series.slice(0, -1).slice(-4)
    if (full.length === 0) return undefined
    current = full.reduce((n, p) => n + p.value, 0) / full.length
  } else {
    if (series.length === 0) return undefined
    const values = series.map((p) => p.value)
    current = lower ? Math.min(...values) : Math.max(...values)
  }
  if (!(current > 0)) return undefined
  const weeks = Math.max(1, daysBetween(today, goal.deadline) / 7)
  let suggested: number
  switch (goal.kind) {
    case 'e1rm':
      suggested = roundTo(current * (1 + Math.min(0.15, 0.01 * weeks)), 2.5, true)
      break
    case 'best_time':
      suggested = roundTo(current * (1 - Math.min(0.06, 0.005 * weeks)), 0.1, false)
      break
    case 'frequency':
      suggested = Math.min(7, Math.round(current) + 1)
      break
    case 'weekly_volume':
      suggested = roundTo(current * (1 + Math.min(0.3, 0.02 * weeks)), 100, true)
      break
  }
  return { current, basis: weekly ? 'recent_weeks' : 'best', lowerIsBetter: lower, suggested }
}
