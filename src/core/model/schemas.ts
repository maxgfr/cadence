import { z } from 'zod'

/**
 * The training data model. Every stored value is metric (kg, m, s); units are a display concern.
 * Dates are local calendar days as `YYYY-MM-DD`.
 */

/** Identity colours a discipline can take (categorical palette slots, see DESIGN.md). */
export const DISCIPLINE_COLORS = ['blue', 'aqua', 'violet', 'orange', 'magenta', 'green', 'yellow', 'red'] as const
export const DisciplineColor = z.enum(DISCIPLINE_COLORS)
export type DisciplineColor = z.infer<typeof DisciplineColor>

/** How an exercise is measured: load × reps, bodyweight reps, a duration, or a distance in a time. */
export const METRICS = ['weight_reps', 'reps', 'time', 'distance_time'] as const
export const Metric = z.enum(METRICS)
export type Metric = z.infer<typeof Metric>

export const STROKES = ['free', 'back', 'breast', 'fly', 'im', 'kick', 'drill'] as const
export const Stroke = z.enum(STROKES)
export type Stroke = z.infer<typeof Stroke>

export const MUSCLES = [
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'core',
  'full_body',
] as const
export const Muscle = z.enum(MUSCLES)
export type Muscle = z.infer<typeof Muscle>

const id = z.string().min(1)

/** A sport or kind of training the user defines (Gym, Swimming, Climbing…). None exists until they create one. */
export const Discipline = z.object({
  id,
  name: z.string().trim().min(1).max(40),
  color: DisciplineColor,
})
export type Discipline = z.infer<typeof Discipline>
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
const positive = z.number().finite().positive()
const nonNegative = z.number().finite().nonnegative()

/** How a pace reads for an open-distance exercise: per 100 m (swimming) or per km (running). */
export const PaceUnit = z.enum(['100m', 'km'])
export type PaceUnit = z.infer<typeof PaceUnit>

export const Exercise = z.object({
  id,
  name: z.string().trim().min(1).max(80),
  disciplineId: z.string().optional(),
  metric: Metric,
  pace: PaceUnit.optional(),
  muscles: z.array(Muscle).optional(),
  stroke: Stroke.optional(),
  /** Fixed distance in metres for distance events (60 m sprint, 50 m free): logged sets then only need a time. */
  distance: positive.optional(),
  notes: z.string().max(500).optional(),
})
export type Exercise = z.infer<typeof Exercise>

/**
 * A prescribed intensity: an absolute load, a share of the one-rep max, an effort (RPE 1–10), a target time
 * per repetition in seconds (pace), or a share of the athlete's best (sprints, swim efforts).
 */
export const INTENSITY_KINDS = ['kg', 'pct1rm', 'rpe', 'pace', 'pctmax'] as const
export const IntensityKind = z.enum(INTENSITY_KINDS)
export type IntensityKind = z.infer<typeof IntensityKind>
export const Intensity = z.object({ kind: IntensityKind, value: positive })
export type Intensity = z.infer<typeof Intensity>

/** One planned line of a day: "5×5 @80%", "8×50 m free @1:00", "6×60 m @95%, rest 3'". */
export const Block = z.object({
  id,
  exerciseId: id,
  sets: z.number().int().min(1).max(50),
  reps: z.number().int().min(1).max(500).optional(),
  /** Metres per repetition. */
  distance: positive.optional(),
  /** Seconds per repetition (holds, timed efforts). */
  duration: positive.optional(),
  intensity: Intensity.optional(),
  /** Rest between sets, seconds. */
  rest: nonNegative.optional(),
  /** Send-off interval, seconds (swim "@1:00"). */
  interval: positive.optional(),
  tempo: z.string().max(20).optional(),
  notes: z.string().max(300).optional(),
})
export type Block = z.infer<typeof Block>

export const Day = z.object({
  id,
  name: z.string().trim().min(1).max(60),
  disciplineId: z.string().optional(),
  blocks: z.array(Block),
  notes: z.string().max(500).optional(),
})
export type Day = z.infer<typeof Day>

export const Week = z.object({ id, name: z.string().max(60).optional(), days: z.array(Day) })
export type Week = z.infer<typeof Week>

export const ProgramSource = z.enum(['manual', 'template', 'ai'])
export type ProgramSource = z.infer<typeof ProgramSource>

/**
 * How a program is laid out: `weeks`, a plan followed week by week to its end, or `sessions`, a set of sessions
 * (Leg day, Bodyweight…) done again and again in any order, kept as the days of its only week.
 */
export const ProgramLayout = z.enum(['weeks', 'sessions'])
export type ProgramLayout = z.infer<typeof ProgramLayout>

export const Program = z.object({
  id,
  name: z.string().trim().min(1).max(80),
  goal: z.string().max(300).default(''),
  /** Absent means `weeks` (every program before version 3). */
  layout: ProgramLayout.optional(),
  weeks: z.array(Week).min(1),
  source: ProgramSource,
  templateId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Program = z.infer<typeof Program>

export const SetLog = z.object({
  reps: z.number().int().min(0).max(1000).optional(),
  /** Kilograms. */
  weight: nonNegative.optional(),
  /** Seconds. */
  time: nonNegative.optional(),
  /** Metres. */
  distance: nonNegative.optional(),
  rpe: z.number().min(1).max(10).optional(),
  done: z.boolean(),
})
export type SetLog = z.infer<typeof SetLog>

export const Entry = z.object({
  id,
  exerciseId: id,
  sets: z.array(SetLog),
  /** The block this entry was planned from, as it was when the session started. */
  planned: Block.optional(),
  notes: z.string().max(300).optional(),
})
export type Entry = z.infer<typeof Entry>

export const ProgramRef = z.object({ programId: id, week: z.number().int().min(0), day: z.number().int().min(0) })
export type ProgramRef = z.infer<typeof ProgramRef>

export const Session = z.object({
  id,
  date: isoDate,
  title: z.string().max(80),
  disciplineId: z.string().optional(),
  programRef: ProgramRef.optional(),
  entries: z.array(Entry),
  status: z.enum(['active', 'done']),
  startedAt: z.string().optional(),
  /** Minutes. */
  duration: nonNegative.optional(),
  rpe: z.number().min(1).max(10).optional(),
  notes: z.string().max(1000).optional(),
})
export type Session = z.infer<typeof Session>

/**
 * A target: the best on one exercise, in what that exercise is measured by (estimated 1RM, most reps, longest set,
 * best time or pace), or, for one discipline or all training, a weekly volume (kilograms lifted or metres covered) or
 * a number of sessions per week.
 */
export const GOAL_KINDS = ['exercise', 'weekly_volume', 'frequency'] as const
export const GoalKind = z.enum(GOAL_KINDS)
export type GoalKind = z.infer<typeof GoalKind>

export const Goal = z.object({
  id,
  kind: GoalKind,
  exerciseId: z.string().optional(),
  disciplineId: z.string().optional(),
  /** Weekly volume only: kilograms lifted (weight × reps) or metres covered. */
  volume: z.enum(['tonnage', 'distance']).optional(),
  target: positive,
  deadline: isoDate,
  createdAt: z.string(),
  achievedAt: z.string().optional(),
})
export type Goal = z.infer<typeof Goal>

export const Mode = z.enum(['normal', 'advanced'])
export type Mode = z.infer<typeof Mode>

export const Settings = z.object({
  mode: Mode.default('normal'),
  weightUnit: z.enum(['kg', 'lb']).default('kg'),
  distanceUnit: z.enum(['m', 'yd']).default('m'),
  /** 1 = Monday, 0 = Sunday. */
  weekStart: z.union([z.literal(0), z.literal(1)]).default(1),
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  /** Default rest timer, seconds, when a block prescribes none. */
  defaultRest: z.number().int().min(0).max(900).default(90),
  onboarded: z.boolean().default(false),
})
export type Settings = z.infer<typeof Settings>

export const DEFAULT_SETTINGS: Settings = Settings.parse({})

/**
 * 3: programs can be a set of sessions (`layout`). 4: goals on an exercise are one kind, `exercise` (versions 2 and 3
 * had `e1rm` and `best_time`, read as `exercise`).
 */
export const BACKUP_VERSION = 4
export const Backup = z.object({
  app: z.literal('cadence'),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string(),
  settings: Settings,
  disciplines: z.array(Discipline),
  exercises: z.array(Exercise),
  programs: z.array(Program),
  sessions: z.array(Session),
  goals: z.array(Goal),
})
export type Backup = z.infer<typeof Backup>
