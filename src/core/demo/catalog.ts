import type { Discipline, Exercise } from '../model/schemas.ts'

/**
 * Demo content: three sports a new user can load as a starting point. Ids are stable (`demo-*` for disciplines,
 * readable slugs for exercises) so loading twice changes nothing and the demo can be removed again.
 */

export const DEMO_SPORTS = ['gym', 'swim', 'track'] as const
export type DemoSport = (typeof DEMO_SPORTS)[number]

export const DEMO_DISCIPLINES: Readonly<Record<DemoSport, Discipline>> = {
  gym: { id: 'demo-gym', name: 'Gym', color: 'blue' },
  swim: { id: 'demo-swim', name: 'Swimming', color: 'aqua' },
  track: { id: 'demo-track', name: 'Track and field', color: 'violet' },
}

type DemoExercise = Omit<Exercise, 'disciplineId'> & { sport: DemoSport }

const gym = (e: Omit<DemoExercise, 'sport'>): DemoExercise => ({ ...e, sport: 'gym' })
const swim = (e: Omit<DemoExercise, 'sport' | 'metric'>): DemoExercise => ({
  ...e,
  metric: 'distance_time',
  pace: '100m',
  sport: 'swim',
})
const track = (e: Omit<DemoExercise, 'sport'>): DemoExercise => ({ ...e, sport: 'track' })

export const DEMO_EXERCISES: readonly DemoExercise[] = [
  // Gym: main lifts.
  gym({ id: 'back-squat', name: 'Back squat', metric: 'weight_reps', muscles: ['quads', 'glutes'] }),
  gym({ id: 'front-squat', name: 'Front squat', metric: 'weight_reps', muscles: ['quads', 'core'] }),
  gym({ id: 'deadlift', name: 'Deadlift', metric: 'weight_reps', muscles: ['hamstrings', 'glutes', 'back'] }),
  gym({ id: 'romanian-deadlift', name: 'Romanian deadlift', metric: 'weight_reps', muscles: ['hamstrings', 'glutes'] }),
  gym({ id: 'bench-press', name: 'Bench press', metric: 'weight_reps', muscles: ['chest', 'triceps', 'shoulders'] }),
  gym({ id: 'overhead-press', name: 'Overhead press', metric: 'weight_reps', muscles: ['shoulders', 'triceps'] }),
  gym({ id: 'barbell-row', name: 'Barbell row', metric: 'weight_reps', muscles: ['back', 'biceps'] }),
  gym({ id: 'power-clean', name: 'Power clean', metric: 'weight_reps', muscles: ['full_body'] }),
  gym({ id: 'hip-thrust', name: 'Hip thrust', metric: 'weight_reps', muscles: ['glutes', 'hamstrings'] }),
  // Gym: accessories.
  gym({ id: 'pull-up', name: 'Pull-up', metric: 'reps', muscles: ['back', 'biceps'] }),
  gym({ id: 'push-up', name: 'Push-up', metric: 'reps', muscles: ['chest', 'triceps'] }),
  gym({ id: 'dip', name: 'Dip', metric: 'reps', muscles: ['chest', 'triceps'] }),
  gym({ id: 'lat-pulldown', name: 'Lat pulldown', metric: 'weight_reps', muscles: ['back', 'biceps'] }),
  gym({ id: 'dumbbell-row', name: 'Dumbbell row', metric: 'weight_reps', muscles: ['back', 'biceps'] }),
  gym({
    id: 'incline-db-press',
    name: 'Incline dumbbell press',
    metric: 'weight_reps',
    muscles: ['chest', 'shoulders'],
  }),
  gym({
    id: 'bulgarian-split-squat',
    name: 'Bulgarian split squat',
    metric: 'weight_reps',
    muscles: ['quads', 'glutes'],
  }),
  gym({ id: 'walking-lunge', name: 'Walking lunge', metric: 'weight_reps', muscles: ['quads', 'glutes'] }),
  gym({ id: 'leg-curl', name: 'Leg curl', metric: 'weight_reps', muscles: ['hamstrings'] }),
  gym({ id: 'nordic-curl', name: 'Nordic curl', metric: 'reps', muscles: ['hamstrings'] }),
  gym({ id: 'calf-raise', name: 'Calf raise', metric: 'weight_reps', muscles: ['calves'] }),
  gym({ id: 'biceps-curl', name: 'Biceps curl', metric: 'weight_reps', muscles: ['biceps'] }),
  gym({ id: 'triceps-extension', name: 'Triceps extension', metric: 'weight_reps', muscles: ['triceps'] }),
  gym({ id: 'lateral-raise', name: 'Lateral raise', metric: 'weight_reps', muscles: ['shoulders'] }),
  gym({ id: 'face-pull', name: 'Face pull', metric: 'weight_reps', muscles: ['shoulders', 'back'] }),
  gym({ id: 'plank', name: 'Plank', metric: 'time', muscles: ['core'] }),
  gym({ id: 'hanging-leg-raise', name: 'Hanging leg raise', metric: 'reps', muscles: ['core'] }),
  // Swimming: strokes as distance sets, then drills.
  swim({ id: 'swim-free', name: 'Freestyle', stroke: 'free' }),
  swim({ id: 'swim-back', name: 'Backstroke', stroke: 'back' }),
  swim({ id: 'swim-breast', name: 'Breaststroke', stroke: 'breast' }),
  swim({ id: 'swim-fly', name: 'Butterfly', stroke: 'fly' }),
  swim({ id: 'swim-im', name: 'Individual medley', stroke: 'im' }),
  swim({ id: 'swim-kick', name: 'Kick set', stroke: 'kick' }),
  swim({ id: 'swim-pull', name: 'Pull buoy', stroke: 'free' }),
  swim({ id: 'drill-catch-up', name: 'Catch-up drill', stroke: 'drill' }),
  swim({ id: 'drill-fingertip', name: 'Fingertip drag drill', stroke: 'drill' }),
  swim({ id: 'drill-single-arm', name: 'Single-arm drill', stroke: 'drill' }),
  // Track and field: fixed-distance sprints, open runs and drills, plyometrics.
  track({ id: 'sprint-30', name: '30 m sprint', metric: 'distance_time', distance: 30 }),
  track({ id: 'sprint-60', name: '60 m sprint', metric: 'distance_time', distance: 60 }),
  track({ id: 'sprint-100', name: '100 m sprint', metric: 'distance_time', distance: 100 }),
  track({ id: 'sprint-200', name: '200 m sprint', metric: 'distance_time', distance: 200 }),
  track({ id: 'sprint-400', name: '400 m sprint', metric: 'distance_time', distance: 400 }),
  track({ id: 'flying-30', name: 'Flying 30 m', metric: 'distance_time', distance: 30 }),
  track({ id: 'block-start', name: 'Block start (10 m)', metric: 'distance_time', distance: 10 }),
  track({ id: 'tempo-run', name: 'Tempo run', metric: 'distance_time', pace: 'km' }),
  track({ id: 'easy-run', name: 'Easy run', metric: 'distance_time', pace: 'km' }),
  track({ id: 'a-skip', name: 'A-skips', metric: 'distance_time', pace: 'km' }),
  track({ id: 'bounding', name: 'Bounding', metric: 'distance_time', pace: 'km' }),
  track({ id: 'box-jump', name: 'Box jump', metric: 'reps', muscles: ['quads', 'glutes'] }),
  track({ id: 'broad-jump', name: 'Broad jump', metric: 'reps', muscles: ['quads', 'glutes'] }),
  track({ id: 'hurdle-hop', name: 'Hurdle hops', metric: 'reps', muscles: ['calves', 'quads'] }),
  track({ id: 'depth-jump', name: 'Depth jump', metric: 'reps', muscles: ['quads', 'calves'] }),
]

export const DEMO_EXERCISE_IDS: ReadonlySet<string> = new Set(DEMO_EXERCISES.map((e) => e.id))

/** A demo exercise as the user gets it, in the discipline given (its own sport's, or the one that needs it). */
export function demoExercise(id: string, disciplineId: string | undefined): Exercise | undefined {
  const e = DEMO_EXERCISES.find((x) => x.id === id)
  if (!e) return undefined
  const { sport: _sport, ...rest } = e
  return disciplineId ? { ...rest, disciplineId } : rest
}

export function sportOf(exerciseId: string): DemoSport | undefined {
  return DEMO_EXERCISES.find((e) => e.id === exerciseId)?.sport
}
