import type { Exercise } from '../model/schemas.ts'

/** The seeded library: stable ids, never stored, so a fix here reaches every install. */
export const BUILTIN_EXERCISES: readonly Exercise[] = [
  // Main lifts.
  { id: 'back-squat', name: 'Back squat', discipline: 'strength', metric: 'weight_reps', muscles: ['quads', 'glutes'] },
  { id: 'front-squat', name: 'Front squat', discipline: 'strength', metric: 'weight_reps', muscles: ['quads', 'core'] },
  {
    id: 'deadlift',
    name: 'Deadlift',
    discipline: 'strength',
    metric: 'weight_reps',
    muscles: ['hamstrings', 'glutes', 'back'],
  },
  {
    id: 'romanian-deadlift',
    name: 'Romanian deadlift',
    discipline: 'strength',
    metric: 'weight_reps',
    muscles: ['hamstrings', 'glutes'],
  },
  {
    id: 'bench-press',
    name: 'Bench press',
    discipline: 'strength',
    metric: 'weight_reps',
    muscles: ['chest', 'triceps', 'shoulders'],
  },
  {
    id: 'overhead-press',
    name: 'Overhead press',
    discipline: 'strength',
    metric: 'weight_reps',
    muscles: ['shoulders', 'triceps'],
  },
  {
    id: 'barbell-row',
    name: 'Barbell row',
    discipline: 'strength',
    metric: 'weight_reps',
    muscles: ['back', 'biceps'],
  },
  { id: 'power-clean', name: 'Power clean', discipline: 'strength', metric: 'weight_reps', muscles: ['full_body'] },
  {
    id: 'hip-thrust',
    name: 'Hip thrust',
    discipline: 'strength',
    metric: 'weight_reps',
    muscles: ['glutes', 'hamstrings'],
  },
  // Accessories.
  { id: 'pull-up', name: 'Pull-up', discipline: 'strength', metric: 'reps', muscles: ['back', 'biceps'] },
  { id: 'push-up', name: 'Push-up', discipline: 'strength', metric: 'reps', muscles: ['chest', 'triceps'] },
  { id: 'dip', name: 'Dip', discipline: 'strength', metric: 'reps', muscles: ['chest', 'triceps'] },
  {
    id: 'lat-pulldown',
    name: 'Lat pulldown',
    discipline: 'strength',
    metric: 'weight_reps',
    muscles: ['back', 'biceps'],
  },
  {
    id: 'dumbbell-row',
    name: 'Dumbbell row',
    discipline: 'strength',
    metric: 'weight_reps',
    muscles: ['back', 'biceps'],
  },
  {
    id: 'incline-db-press',
    name: 'Incline dumbbell press',
    discipline: 'strength',
    metric: 'weight_reps',
    muscles: ['chest', 'shoulders'],
  },
  {
    id: 'bulgarian-split-squat',
    name: 'Bulgarian split squat',
    discipline: 'strength',
    metric: 'weight_reps',
    muscles: ['quads', 'glutes'],
  },
  {
    id: 'walking-lunge',
    name: 'Walking lunge',
    discipline: 'strength',
    metric: 'weight_reps',
    muscles: ['quads', 'glutes'],
  },
  { id: 'leg-curl', name: 'Leg curl', discipline: 'strength', metric: 'weight_reps', muscles: ['hamstrings'] },
  { id: 'nordic-curl', name: 'Nordic curl', discipline: 'strength', metric: 'reps', muscles: ['hamstrings'] },
  { id: 'calf-raise', name: 'Calf raise', discipline: 'strength', metric: 'weight_reps', muscles: ['calves'] },
  { id: 'biceps-curl', name: 'Biceps curl', discipline: 'strength', metric: 'weight_reps', muscles: ['biceps'] },
  {
    id: 'triceps-extension',
    name: 'Triceps extension',
    discipline: 'strength',
    metric: 'weight_reps',
    muscles: ['triceps'],
  },
  { id: 'lateral-raise', name: 'Lateral raise', discipline: 'strength', metric: 'weight_reps', muscles: ['shoulders'] },
  { id: 'face-pull', name: 'Face pull', discipline: 'strength', metric: 'weight_reps', muscles: ['shoulders', 'back'] },
  { id: 'plank', name: 'Plank', discipline: 'strength', metric: 'time', muscles: ['core'] },
  { id: 'hanging-leg-raise', name: 'Hanging leg raise', discipline: 'strength', metric: 'reps', muscles: ['core'] },
  // Swimming: strokes as distance sets, plus drills.
  { id: 'swim-free', name: 'Freestyle', discipline: 'swim', metric: 'distance_time', stroke: 'free' },
  { id: 'swim-back', name: 'Backstroke', discipline: 'swim', metric: 'distance_time', stroke: 'back' },
  { id: 'swim-breast', name: 'Breaststroke', discipline: 'swim', metric: 'distance_time', stroke: 'breast' },
  { id: 'swim-fly', name: 'Butterfly', discipline: 'swim', metric: 'distance_time', stroke: 'fly' },
  { id: 'swim-im', name: 'Individual medley', discipline: 'swim', metric: 'distance_time', stroke: 'im' },
  { id: 'swim-kick', name: 'Kick set', discipline: 'swim', metric: 'distance_time', stroke: 'kick' },
  { id: 'swim-pull', name: 'Pull buoy', discipline: 'swim', metric: 'distance_time', stroke: 'free' },
  { id: 'drill-catch-up', name: 'Catch-up drill', discipline: 'swim', metric: 'distance_time', stroke: 'drill' },
  { id: 'drill-fingertip', name: 'Fingertip drag drill', discipline: 'swim', metric: 'distance_time', stroke: 'drill' },
  { id: 'drill-single-arm', name: 'Single-arm drill', discipline: 'swim', metric: 'distance_time', stroke: 'drill' },
  // Sprint and running: fixed-distance efforts, then open runs.
  { id: 'sprint-30', name: '30 m sprint', discipline: 'run', metric: 'distance_time', distance: 30 },
  { id: 'sprint-60', name: '60 m sprint', discipline: 'run', metric: 'distance_time', distance: 60 },
  { id: 'sprint-100', name: '100 m sprint', discipline: 'run', metric: 'distance_time', distance: 100 },
  { id: 'sprint-200', name: '200 m sprint', discipline: 'run', metric: 'distance_time', distance: 200 },
  { id: 'sprint-400', name: '400 m sprint', discipline: 'run', metric: 'distance_time', distance: 400 },
  { id: 'flying-30', name: 'Flying 30 m', discipline: 'run', metric: 'distance_time', distance: 30 },
  { id: 'block-start', name: 'Block start (10 m)', discipline: 'run', metric: 'distance_time', distance: 10 },
  { id: 'tempo-run', name: 'Tempo run', discipline: 'run', metric: 'distance_time' },
  { id: 'easy-run', name: 'Easy run', discipline: 'run', metric: 'distance_time' },
  { id: 'a-skip', name: 'A-skips', discipline: 'run', metric: 'distance_time' },
  // Plyometrics.
  { id: 'box-jump', name: 'Box jump', discipline: 'strength', metric: 'reps', muscles: ['quads', 'glutes'] },
  { id: 'broad-jump', name: 'Broad jump', discipline: 'strength', metric: 'reps', muscles: ['quads', 'glutes'] },
  { id: 'bounding', name: 'Bounding', discipline: 'run', metric: 'distance_time' },
  { id: 'hurdle-hop', name: 'Hurdle hops', discipline: 'strength', metric: 'reps', muscles: ['calves', 'quads'] },
  { id: 'depth-jump', name: 'Depth jump', discipline: 'strength', metric: 'reps', muscles: ['quads', 'calves'] },
]

const BUILTIN_IDS: ReadonlySet<string> = new Set(BUILTIN_EXERCISES.map((e) => e.id))

export function isBuiltin(exerciseId: string): boolean {
  return BUILTIN_IDS.has(exerciseId)
}

/** The library the app shows: built-ins first, then the user's own, each sorted by name. */
export function library(custom: readonly Exercise[]): Exercise[] {
  const own = custom.filter((e) => !BUILTIN_IDS.has(e.id)).sort((a, b) => a.name.localeCompare(b.name))
  return [...BUILTIN_EXERCISES, ...own]
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
