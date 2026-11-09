import { currentMessages, LOCALES, type Messages, messagesFor } from '../i18n/index.ts'
import { normalizeName } from '../library/exercises.ts'
import { newId } from '../model/ids.ts'
import type {
  Block,
  Day,
  Discipline,
  Exercise,
  ExerciseLanguage,
  Intensity,
  Program,
  SetTarget,
  Week,
} from '../model/schemas.ts'
import {
  PRESET_COLORS,
  PRESET_EXERCISES,
  PRESET_SPORTS,
  type PresetExercise,
  type PresetSlug,
  type PresetSport,
} from './catalog.ts'

type PresetId = keyof Messages['presets']['programs']
type BlockSpec = Omit<Block, 'id' | 'exerciseId' | 'sets'>
type Build = (
  b: (slug: PresetSlug, sets: number, spec?: BlockSpec) => Block,
  d: (name: string, blocks: Block[]) => Day,
) => Day[]

interface PresetProgram {
  id: PresetId
  sport: PresetSport
  build: Build
}

const rpe = (value: number) => ({ kind: 'rpe' as const, value })
const pct = (value: number) => ({ kind: 'pct1rm' as const, value })

/** A pyramid, `[reps, value]` for each set, heaviest last; in % of 1RM unless said. */
const pyramid = (
  sets: readonly (readonly [number, number])[],
  rest: number,
  at: (value: number) => Intensity = pct,
): BlockSpec => {
  const perSet: SetTarget[] = sets.map(([reps, value]) => ({ reps, value }))
  const [first] = sets
  return { reps: first?.[0] ?? 1, intensity: at(first?.[1] ?? 1), perSet, rest }
}

const MAIN_LIFT = [
  [15, 55],
  [10, 65],
  [8, 75],
  [6, 82],
] as const

/** By effort, for a lift whose one-rep max few athletes know. */
const MAIN_LIFT_EFFORT = [
  [15, 6.5],
  [10, 7],
  [8, 7.5],
  [6, 8],
] as const

export const PRESET_PROGRAMS: readonly PresetProgram[] = [
  {
    id: 'gym-full-body',
    sport: 'gym',
    build: (b, d) => {
      const { days } = currentMessages().presets
      return [
        d(days.fullBodyA, [
          b('back-squat', 3, { reps: 8, intensity: rpe(7), rest: 150 }),
          b('barbell-bench-press', 3, { reps: 8, intensity: rpe(7), rest: 120 }),
          b('seated-cable-row', 3, { reps: 10, intensity: rpe(7), rest: 90 }),
          b('lateral-raise', 3, { reps: 12, rest: 60 }),
          b('plank', 3, { duration: 45, rest: 60 }),
        ]),
        d(days.fullBodyB, [
          b('romanian-deadlift', 3, { reps: 10, intensity: rpe(7), rest: 120 }),
          b('overhead-press', 3, { reps: 8, intensity: rpe(7), rest: 120 }),
          b('lat-pulldown', 3, { reps: 10, intensity: rpe(7), rest: 90 }),
          b('leg-press', 3, { reps: 12, intensity: rpe(7), rest: 90 }),
          b('hanging-leg-raise', 3, { reps: 10, rest: 60 }),
        ]),
      ]
    },
  },
  {
    id: 'gym-push-pull-legs',
    sport: 'gym',
    build: (b, d) => {
      const { days } = currentMessages().presets
      return [
        d(days.push, [
          b('barbell-bench-press', 4, pyramid(MAIN_LIFT, 150)),
          b('incline-dumbbell-press', 3, { reps: 10, intensity: rpe(8), rest: 90 }),
          b('machine-shoulder-press', 3, { reps: 10, intensity: rpe(8), rest: 90 }),
          b('lateral-raise', 3, { reps: 15, rest: 60 }),
          b('triceps-pushdown', 3, { reps: 12, rest: 60 }),
        ]),
        d(days.pull, [
          b('barbell-row', 4, pyramid(MAIN_LIFT_EFFORT, 150, rpe)),
          b('lat-pulldown', 3, { reps: 10, intensity: rpe(8), rest: 90 }),
          b('seated-cable-row', 3, { reps: 12, intensity: rpe(8), rest: 90 }),
          b('face-pull', 3, { reps: 15, rest: 60 }),
          b('barbell-curl', 3, { reps: 12, rest: 60 }),
        ]),
        d(days.legs, [
          b('back-squat', 4, pyramid(MAIN_LIFT, 180)),
          b('romanian-deadlift', 3, { reps: 10, intensity: rpe(8), rest: 120 }),
          b('leg-press', 3, { reps: 12, intensity: rpe(8), rest: 90 }),
          b('seated-leg-curl', 3, { reps: 12, rest: 60 }),
          b('standing-calf-raise', 3, { reps: 15, rest: 60 }),
        ]),
      ]
    },
  },
  {
    id: 'swim-endurance',
    sport: 'swim',
    build: (b, d) => {
      const { days, notes } = currentMessages().presets
      return [
        d(days.technique, [
          b('swim-freestyle', 1, { distance: 300, notes: notes.warmUp }),
          b('drill-catch-up', 4, { distance: 50, rest: 20 }),
          b('drill-single-arm', 4, { distance: 50, rest: 20 }),
          b('swim-kick', 4, { distance: 50, rest: 20 }),
          b('swim-backstroke', 1, { distance: 200, notes: notes.coolDown }),
        ]),
        d(days.endurance, [
          b('swim-freestyle', 1, { distance: 400, notes: notes.warmUp }),
          b('swim-freestyle', 8, { distance: 100, interval: 120, intensity: rpe(6) }),
          b('swim-pull', 4, { distance: 100, rest: 20 }),
          b('swim-freestyle', 1, { distance: 200, notes: notes.coolDown }),
        ]),
        d(days.speed, [
          b('swim-freestyle', 1, { distance: 300, notes: notes.warmUp }),
          b('drill-fingertip-drag', 4, { distance: 25, rest: 20 }),
          b('swim-50-free', 8, { intensity: rpe(9), rest: 60 }),
          b('swim-backstroke', 1, { distance: 200, notes: notes.coolDown }),
        ]),
      ]
    },
  },
  {
    id: 'running-10k',
    sport: 'running',
    build: (b, d) => {
      const { days, notes } = currentMessages().presets
      return [
        d(days.easy, [
          b('run-easy', 1, { distance: 6000, notes: notes.conversational }),
          b('run-strides', 4, { distance: 100, rest: 60 }),
        ]),
        d(days.intervals, [
          b('run-easy', 1, { distance: 2000, notes: notes.warmUp }),
          b('run-400', 8, { intensity: rpe(8.5), rest: 90 }),
          b('run-easy', 1, { distance: 1500, notes: notes.coolDown }),
        ]),
        d(days.tempo, [
          b('run-easy', 1, { distance: 2000, notes: notes.warmUp }),
          b('run-tempo', 1, { distance: 5000, intensity: rpe(7.5) }),
          b('run-easy', 1, { distance: 1500, notes: notes.coolDown }),
        ]),
        d(days.long, [b('run-long', 1, { distance: 12_000, notes: notes.conversational })]),
      ]
    },
  },
]

export interface PresetOptions {
  sports: readonly PresetSport[]
  withPrograms: boolean
  library: { exercises: readonly Exercise[]; disciplines: readonly Discipline[] }
  exerciseLanguage: ExerciseLanguage
  now?: Date
}

export interface PresetData {
  disciplines: Discipline[]
  exercises: Exercise[]
  programs: Program[]
}

const namesOf = (read: (m: Messages) => string) => new Set(LOCALES.map((l) => normalizeName(read(messagesFor(l)))))

/**
 * What adding these sports brings. An exercise or discipline the athlete already has under any language's name is used
 * as it is, by the preset's programs too, and nothing is added twice.
 */
export function buildPreset({
  sports,
  withPrograms,
  library,
  exerciseLanguage,
  now = new Date(),
}: PresetOptions): PresetData {
  const chosen = PRESET_SPORTS.filter((s) => sports.includes(s))
  const disciplines: Discipline[] = []
  const disciplineOf = new Map<PresetSport, string>()
  for (const sport of chosen) {
    const id = `preset-${sport}`
    const names = namesOf((m) => m.presets.disciplines[sport])
    const mine = library.disciplines.find((d) => d.id === id || names.has(normalizeName(d.name)))
    disciplineOf.set(sport, mine?.id ?? id)
    if (!mine) disciplines.push({ id, name: currentMessages().presets.disciplines[sport], color: PRESET_COLORS[sport] })
  }

  const exercises: Exercise[] = []
  const exerciseOf = new Map<PresetSlug, string>()
  for (const e of PRESET_EXERCISES) {
    if (!chosen.includes(e.sport)) continue
    const id = `preset-${e.slug}`
    const names = namesOf((m) => m.presets.exercises[e.slug])
    const mine = library.exercises.find((x) => x.id === id || names.has(normalizeName(x.name)))
    exerciseOf.set(e.slug, mine?.id ?? id)
    if (!mine) exercises.push(toExercise(e, id, disciplineOf.get(e.sport), exerciseLanguage))
  }

  const at = now.toISOString()
  const programs = !withPrograms
    ? []
    : PRESET_PROGRAMS.filter((p) => chosen.includes(p.sport)).map((p): Program => {
        const disciplineId = disciplineOf.get(p.sport)
        const days = p.build(
          (slug, sets, spec = {}) => ({
            id: newId(),
            exerciseId: exerciseOf.get(slug) ?? `preset-${slug}`,
            sets,
            ...spec,
          }),
          (name, blocks) => ({ id: newId(), name, ...(disciplineId ? { disciplineId } : {}), blocks }),
        )
        const week: Week = { id: newId(), days }
        const { name, goal } = currentMessages().presets.programs[p.id]
        return {
          id: `preset-program-${p.id}`,
          name,
          goal,
          layout: 'sessions',
          weeks: [week],
          source: 'template',
          templateId: p.id,
          createdAt: at,
          updatedAt: at,
        }
      })
  return { disciplines, exercises, programs }
}

function toExercise(
  e: PresetExercise,
  id: string,
  disciplineId: string | undefined,
  language: ExerciseLanguage,
): Exercise {
  const { slug: _slug, sport: _sport, ...spec } = e
  return {
    id,
    name: messagesFor(language).presets.exercises[e.slug],
    ...(disciplineId ? { disciplineId } : {}),
    ...spec,
  }
}
