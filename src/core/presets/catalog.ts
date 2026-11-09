import type { Messages } from '../i18n/index.ts'
import type { Discipline, Exercise, Muscle } from '../model/schemas.ts'

/**
 * Presets: real exercise libraries and programs an athlete adds on purpose, apart from the demo's example data. Ids are
 * stable (`preset-*`) so adding twice changes nothing and two devices agree on the same records.
 */

export const PRESET_SPORTS = ['gym', 'swim', 'running'] as const
export type PresetSport = (typeof PRESET_SPORTS)[number]

export const PRESET_COLORS: Readonly<Record<PresetSport, Discipline['color']>> = {
  gym: 'blue',
  swim: 'aqua',
  running: 'orange',
}

export type PresetSlug = keyof Messages['presets']['exercises']

export interface PresetExercise extends Pick<Exercise, 'metric' | 'pace' | 'distance' | 'stroke' | 'muscles'> {
  slug: PresetSlug
  sport: PresetSport
}

const gym =
  (metric: 'weight_reps' | 'reps' | 'time') =>
  (slug: PresetSlug, ...muscles: Muscle[]): PresetExercise => ({
    slug,
    sport: 'gym',
    metric,
    ...(muscles.length > 0 ? { muscles } : {}),
  })
const load = gym('weight_reps')
const body = gym('reps')
const hold = gym('time')

const swim = (slug: PresetSlug, stroke: NonNullable<Exercise['stroke']>): PresetExercise => ({
  slug,
  sport: 'swim',
  metric: 'distance_time',
  pace: '100m',
  stroke,
})
const swimEvent = (slug: PresetSlug, distance: number): PresetExercise => ({
  slug,
  sport: 'swim',
  metric: 'distance_time',
  distance,
  stroke: 'free',
})
const run = (slug: PresetSlug): PresetExercise => ({ slug, sport: 'running', metric: 'distance_time', pace: 'km' })
const runEvent = (slug: PresetSlug, distance: number): PresetExercise => ({
  slug,
  sport: 'running',
  metric: 'distance_time',
  distance,
})

export const PRESET_EXERCISES: readonly PresetExercise[] = [
  // Chest.
  load('barbell-bench-press', 'chest', 'triceps', 'shoulders'),
  load('incline-barbell-bench-press', 'chest', 'shoulders', 'triceps'),
  load('decline-bench-press', 'chest', 'triceps'),
  load('dumbbell-bench-press', 'chest', 'triceps', 'shoulders'),
  load('incline-dumbbell-press', 'chest', 'shoulders'),
  load('dumbbell-fly', 'chest'),
  load('cable-crossover', 'chest'),
  load('machine-chest-press', 'chest', 'triceps'),
  load('pec-deck', 'chest'),
  body('push-up', 'chest', 'triceps'),
  body('chest-dip', 'chest', 'triceps'),
  // Back.
  load('deadlift', 'hamstrings', 'glutes', 'back'),
  load('barbell-row', 'back', 'biceps'),
  load('dumbbell-row', 'back', 'biceps'),
  load('t-bar-row', 'back', 'biceps'),
  load('seated-cable-row', 'back', 'biceps'),
  load('machine-row', 'back', 'biceps'),
  load('lat-pulldown', 'back', 'biceps'),
  load('straight-arm-pulldown', 'back'),
  body('pull-up', 'back', 'biceps'),
  body('chin-up', 'back', 'biceps'),
  body('inverted-row', 'back', 'biceps'),
  load('back-extension', 'back', 'glutes'),
  load('shrug', 'back'),
  // Shoulders.
  load('overhead-press', 'shoulders', 'triceps'),
  load('seated-dumbbell-press', 'shoulders', 'triceps'),
  load('arnold-press', 'shoulders', 'triceps'),
  load('machine-shoulder-press', 'shoulders', 'triceps'),
  load('lateral-raise', 'shoulders'),
  load('cable-lateral-raise', 'shoulders'),
  load('front-raise', 'shoulders'),
  load('rear-delt-fly', 'shoulders', 'back'),
  load('reverse-pec-deck', 'shoulders', 'back'),
  load('face-pull', 'shoulders', 'back'),
  load('upright-row', 'shoulders', 'back'),
  // Arms.
  load('barbell-curl', 'biceps'),
  load('dumbbell-curl', 'biceps'),
  load('hammer-curl', 'biceps'),
  load('preacher-curl', 'biceps'),
  load('cable-curl', 'biceps'),
  load('concentration-curl', 'biceps'),
  load('triceps-pushdown', 'triceps'),
  load('overhead-triceps-extension', 'triceps'),
  load('skull-crusher', 'triceps'),
  load('close-grip-bench-press', 'triceps', 'chest'),
  // Legs and glutes.
  load('back-squat', 'quads', 'glutes'),
  load('front-squat', 'quads', 'core'),
  load('goblet-squat', 'quads', 'glutes'),
  load('hack-squat', 'quads', 'glutes'),
  load('smith-machine-squat', 'quads', 'glutes'),
  load('leg-press', 'quads', 'glutes'),
  load('leg-extension', 'quads'),
  load('lying-leg-curl', 'hamstrings'),
  load('seated-leg-curl', 'hamstrings'),
  load('romanian-deadlift', 'hamstrings', 'glutes'),
  load('sumo-deadlift', 'glutes', 'hamstrings', 'back'),
  load('bulgarian-split-squat', 'quads', 'glutes'),
  load('walking-lunge', 'quads', 'glutes'),
  load('step-up', 'quads', 'glutes'),
  load('hip-thrust', 'glutes', 'hamstrings'),
  body('glute-bridge', 'glutes', 'hamstrings'),
  load('cable-kickback', 'glutes'),
  load('hip-abduction-machine', 'glutes'),
  // No muscle: the model has no adductors, and counting them as another would skew its volume.
  load('hip-adduction-machine'),
  load('standing-calf-raise', 'calves'),
  load('seated-calf-raise', 'calves'),
  body('nordic-curl', 'hamstrings'),
  // Core and whole body.
  hold('plank', 'core'),
  hold('side-plank', 'core'),
  body('crunch', 'core'),
  load('cable-crunch', 'core'),
  body('hanging-leg-raise', 'core'),
  body('russian-twist', 'core'),
  body('ab-wheel-rollout', 'core'),
  load('power-clean', 'full_body'),
  load('kettlebell-swing', 'glutes', 'hamstrings'),
  hold('farmers-carry', 'full_body'),
  // Machines and cable stations.
  load('pendulum-squat', 'quads', 'glutes'),
  load('belt-squat', 'quads', 'glutes'),
  load('hip-thrust-machine', 'glutes', 'hamstrings'),
  body('glute-ham-raise', 'hamstrings', 'glutes'),
  load('incline-machine-press', 'chest', 'shoulders'),
  load('machine-lateral-raise', 'shoulders'),
  // Counted in reps: the counterweight makes them easier, so it must not read as a load.
  body('assisted-pull-up', 'back', 'biceps'),
  body('assisted-dip', 'chest', 'triceps'),
  load('machine-biceps-curl', 'biceps'),
  load('machine-triceps-extension', 'triceps'),
  load('ab-crunch-machine', 'core'),
  load('dumbbell-pullover', 'chest', 'back'),
  load('cable-pull-through', 'glutes', 'hamstrings'),
  load('cable-wood-chop', 'core'),
  // Swimming.
  swim('swim-freestyle', 'free'),
  swim('swim-backstroke', 'back'),
  swim('swim-breaststroke', 'breast'),
  swim('swim-butterfly', 'fly'),
  swim('swim-medley', 'im'),
  swim('swim-kick', 'kick'),
  swim('swim-pull', 'free'),
  swim('drill-catch-up', 'drill'),
  swim('drill-fingertip-drag', 'drill'),
  swim('drill-single-arm', 'drill'),
  swim('drill-sculling', 'drill'),
  swim('drill-closed-fist', 'drill'),
  swim('drill-side-kick', 'drill'),
  swimEvent('swim-50-free', 50),
  swimEvent('swim-100-free', 100),
  swimEvent('swim-400-free', 400),
  // Running.
  run('run-easy'),
  run('run-long'),
  run('run-tempo'),
  run('run-fartlek'),
  run('run-hills'),
  run('run-strides'),
  run('run-progression'),
  runEvent('run-200', 200),
  runEvent('run-400', 400),
  runEvent('run-800', 800),
  runEvent('run-1000', 1000),
  runEvent('run-5k', 5000),
  runEvent('run-10k', 10_000),
  runEvent('run-half', 21_097),
  runEvent('run-marathon', 42_195),
]
