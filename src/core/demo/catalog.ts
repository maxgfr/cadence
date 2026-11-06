import { currentMessages, type Messages } from '../i18n/index.ts'
import type { Discipline, Exercise } from '../model/schemas.ts'

/**
 * Demo content: three sports a new user can load as a starting point. Ids are stable (`demo-*` for disciplines,
 * readable slugs for exercises) so loading twice changes nothing and the demo can be removed again. Names are read in
 * the displayed language each time they are used, so the demo is written in the language it is loaded in.
 */

export const DEMO_SPORTS = ['gym', 'swim', 'track'] as const
export type DemoSport = (typeof DEMO_SPORTS)[number]

/** The demo's texts in the displayed language. */
export const demoText = (): Messages['demo'] => currentMessages().demo

/** Each sport's discipline: a fresh record on every read, named in the displayed language. */
export const DEMO_DISCIPLINES: Readonly<Record<DemoSport, Discipline>> = {
  get gym(): Discipline {
    return { id: 'demo-gym', name: demoText().disciplines.gym, color: 'blue' }
  },
  get swim(): Discipline {
    return { id: 'demo-swim', name: demoText().disciplines.swim, color: 'aqua' }
  },
  get track(): Discipline {
    return { id: 'demo-track', name: demoText().disciplines.track, color: 'violet' }
  },
}

type DemoExerciseId = keyof Messages['demo']['exercises']
type DemoExercise = Omit<Exercise, 'disciplineId'> & { sport: DemoSport }
type Spec = Omit<DemoExercise, 'sport' | 'name' | 'id'> & { id: DemoExerciseId }

/** A demo exercise whose name follows the displayed language (`demoExercise` copies it as it reads then). */
const make =
  (sport: DemoSport) =>
  ({ id, ...rest }: Spec): DemoExercise => ({
    id,
    get name() {
      return demoText().exercises[id]
    },
    ...rest,
    sport,
  })

const gym = make('gym')
const swimming = make('swim')
const swim = (e: Omit<Spec, 'metric'>): DemoExercise => swimming({ ...e, metric: 'distance_time', pace: '100m' })
const track = make('track')

export const DEMO_EXERCISES: readonly DemoExercise[] = [
  // Gym: main lifts.
  gym({ id: 'back-squat', metric: 'weight_reps', muscles: ['quads', 'glutes'] }),
  gym({ id: 'front-squat', metric: 'weight_reps', muscles: ['quads', 'core'] }),
  gym({ id: 'deadlift', metric: 'weight_reps', muscles: ['hamstrings', 'glutes', 'back'] }),
  gym({ id: 'romanian-deadlift', metric: 'weight_reps', muscles: ['hamstrings', 'glutes'] }),
  gym({ id: 'bench-press', metric: 'weight_reps', muscles: ['chest', 'triceps', 'shoulders'] }),
  gym({ id: 'overhead-press', metric: 'weight_reps', muscles: ['shoulders', 'triceps'] }),
  gym({ id: 'barbell-row', metric: 'weight_reps', muscles: ['back', 'biceps'] }),
  gym({ id: 'power-clean', metric: 'weight_reps', muscles: ['full_body'] }),
  gym({ id: 'hip-thrust', metric: 'weight_reps', muscles: ['glutes', 'hamstrings'] }),
  // Gym: accessories.
  gym({ id: 'pull-up', metric: 'reps', muscles: ['back', 'biceps'] }),
  gym({ id: 'push-up', metric: 'reps', muscles: ['chest', 'triceps'] }),
  gym({ id: 'dip', metric: 'reps', muscles: ['chest', 'triceps'] }),
  gym({ id: 'lat-pulldown', metric: 'weight_reps', muscles: ['back', 'biceps'] }),
  gym({ id: 'dumbbell-row', metric: 'weight_reps', muscles: ['back', 'biceps'] }),
  gym({
    id: 'incline-db-press',
    metric: 'weight_reps',
    muscles: ['chest', 'shoulders'],
  }),
  gym({
    id: 'bulgarian-split-squat',
    metric: 'weight_reps',
    muscles: ['quads', 'glutes'],
  }),
  gym({ id: 'walking-lunge', metric: 'weight_reps', muscles: ['quads', 'glutes'] }),
  gym({ id: 'leg-curl', metric: 'weight_reps', muscles: ['hamstrings'] }),
  gym({ id: 'nordic-curl', metric: 'reps', muscles: ['hamstrings'] }),
  gym({ id: 'calf-raise', metric: 'weight_reps', muscles: ['calves'] }),
  gym({ id: 'biceps-curl', metric: 'weight_reps', muscles: ['biceps'] }),
  gym({ id: 'triceps-extension', metric: 'weight_reps', muscles: ['triceps'] }),
  gym({ id: 'lateral-raise', metric: 'weight_reps', muscles: ['shoulders'] }),
  gym({ id: 'face-pull', metric: 'weight_reps', muscles: ['shoulders', 'back'] }),
  gym({ id: 'plank', metric: 'time', muscles: ['core'] }),
  gym({ id: 'hanging-leg-raise', metric: 'reps', muscles: ['core'] }),
  // Swimming: strokes as distance sets, then drills.
  swim({ id: 'swim-free', stroke: 'free' }),
  swim({ id: 'swim-back', stroke: 'back' }),
  swim({ id: 'swim-breast', stroke: 'breast' }),
  swim({ id: 'swim-fly', stroke: 'fly' }),
  swim({ id: 'swim-im', stroke: 'im' }),
  swim({ id: 'swim-kick', stroke: 'kick' }),
  swim({ id: 'swim-pull', stroke: 'free' }),
  swim({ id: 'drill-catch-up', stroke: 'drill' }),
  swim({ id: 'drill-fingertip', stroke: 'drill' }),
  swim({ id: 'drill-single-arm', stroke: 'drill' }),
  // Track and field: fixed-distance sprints, open runs and drills, plyometrics.
  track({ id: 'sprint-30', metric: 'distance_time', distance: 30 }),
  track({ id: 'sprint-60', metric: 'distance_time', distance: 60 }),
  track({ id: 'sprint-100', metric: 'distance_time', distance: 100 }),
  track({ id: 'sprint-200', metric: 'distance_time', distance: 200 }),
  track({ id: 'sprint-400', metric: 'distance_time', distance: 400 }),
  track({ id: 'flying-30', metric: 'distance_time', distance: 30 }),
  track({ id: 'block-start', metric: 'distance_time', distance: 10 }),
  track({ id: 'tempo-run', metric: 'distance_time', pace: 'km' }),
  track({ id: 'easy-run', metric: 'distance_time', pace: 'km' }),
  track({ id: 'a-skip', metric: 'distance_time', pace: 'km' }),
  track({ id: 'bounding', metric: 'distance_time', pace: 'km' }),
  track({ id: 'box-jump', metric: 'reps', muscles: ['quads', 'glutes'] }),
  track({ id: 'broad-jump', metric: 'reps', muscles: ['quads', 'glutes'] }),
  track({ id: 'hurdle-hop', metric: 'reps', muscles: ['calves', 'quads'] }),
  track({ id: 'depth-jump', metric: 'reps', muscles: ['quads', 'calves'] }),
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
