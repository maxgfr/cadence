import { currentMessages, LOCALES, type Messages, messagesFor } from '../i18n/index.ts'
import { normalizeName } from '../library/exercises.ts'
import { newId } from '../model/ids.ts'
import type { Block, Day, Discipline, Exercise, ExerciseLanguage, Program, SetTarget, Week } from '../model/schemas.ts'
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

/** A pyramid by effort, `[reps, RPE]` for each set. */
const pyramid = (sets: readonly (readonly [number, number])[], rest: number, notes: string): BlockSpec => {
  const perSet: SetTarget[] = sets.map(([reps, value]) => ({ reps, value }))
  const [first] = sets
  return { reps: first?.[0] ?? 1, intensity: rpe(first?.[1] ?? 1), perSet, rest, notes }
}

/** A double progression: the bottom of the range is the target, the top is when the load goes up. */
const range = (low: number, high: number, intensity: number, rest: number, ...extra: string[]): BlockSpec => ({
  reps: low,
  intensity: rpe(intensity),
  rest,
  notes: [...extra, currentMessages().presets.notes.repRange(low, high)].join(' '),
})

/** A block planned in case there is time: offered during the session, added by the athlete if they want it. */
const optional = (spec: BlockSpec): BlockSpec => ({ ...spec, optional: true })

export const PRESET_PROGRAMS: readonly PresetProgram[] = [
  {
    id: 'gym-machines-ppl',
    sport: 'gym',
    build: (b, d) => {
      const { days, notes } = currentMessages().presets
      return [
        d(days.push, [
          b('machine-chest-press', 4, range(6, 10, 8, 150, notes.rampUp)),
          b('incline-machine-press', 3, range(8, 12, 8, 120)),
          b('seated-dip-machine', 3, range(8, 12, 8, 120)),
          b('pec-deck', 3, range(10, 15, 9, 90)),
          b('machine-lateral-raise', 4, range(12, 20, 9, 90)),
          b('triceps-pushdown', 3, range(10, 15, 9, 90)),
          b('ab-crunch-machine', 3, range(10, 15, 8, 60)),
          b('overhead-triceps-extension', 3, optional(range(10, 15, 9, 90, notes.onCable))),
        ]),
        d(days.pull, [
          b('lat-pulldown', 4, range(8, 12, 8, 150, notes.rampUp)),
          b('machine-row', 4, range(8, 12, 8, 150)),
          b('reverse-pec-deck', 4, range(12, 20, 9, 90)),
          b('machine-lateral-raise', 4, range(12, 20, 9, 90)),
          b('machine-biceps-curl', 4, range(10, 15, 9, 90)),
          b('shrug', 3, range(10, 15, 9, 60)),
          b('hammer-curl', 3, optional(range(10, 15, 9, 60, notes.withRope))),
        ]),
        d(days.legs, [
          b('leg-press', 4, range(10, 15, 8, 180, notes.rampUp)),
          b('leg-extension', 4, range(10, 15, 9, 90)),
          b('lying-leg-curl', 5, range(10, 15, 9, 90)),
          b('hip-adduction-machine', 4, range(12, 15, 8, 90)),
          b('hip-abduction-machine', 4, range(12, 15, 8, 60)),
          b('standing-calf-raise', 5, range(10, 15, 9, 90, notes.pauseInStretch)),
          b('ab-crunch-machine', 3, optional(range(10, 15, 8, 60))),
        ]),
      ]
    },
  },
  {
    id: 'gym-machines-full-body',
    sport: 'gym',
    build: (b, d) => {
      const { days, notes } = currentMessages().presets
      return [
        d(days.fullBodyA, [
          b('leg-press', 3, range(8, 12, 8, 180, notes.rampUp)),
          b('machine-chest-press', 3, range(6, 10, 8, 150)),
          b('lat-pulldown', 3, range(8, 12, 8, 150)),
          b('seated-leg-curl', 2, range(10, 15, 9, 90)),
          b('machine-lateral-raise', 3, range(12, 20, 9, 90)),
          b('triceps-pushdown', 2, range(10, 15, 9, 90)),
          b('standing-calf-raise', 2, range(10, 15, 9, 90, notes.pauseInStretch)),
        ]),
        d(days.fullBodyB, [
          b('hack-squat', 3, range(8, 12, 8, 180, notes.rampUp)),
          b('machine-row', 3, range(8, 12, 8, 150)),
          b('incline-machine-press', 3, range(8, 12, 8, 120)),
          b('lying-leg-curl', 2, range(10, 15, 9, 90)),
          b('overhead-triceps-extension', 2, range(10, 15, 9, 90)),
          b('machine-biceps-curl', 2, range(10, 15, 9, 90)),
          b('standing-calf-raise', 2, range(10, 15, 9, 90, notes.pauseInStretch)),
          b('ab-crunch-machine', 2, range(10, 15, 8, 60)),
        ]),
        d(days.fullBodyC, [
          b('machine-shoulder-press', 3, range(8, 12, 8, 120, notes.rampUp)),
          b('machine-high-row', 3, range(8, 12, 8, 120)),
          b('leg-extension', 3, range(10, 15, 9, 90)),
          b('hip-thrust-machine', 2, range(8, 12, 8, 120)),
          b('seated-leg-curl', 3, range(10, 15, 9, 90)),
          b('pec-deck', 2, range(10, 15, 9, 90)),
          b('reverse-pec-deck', 3, range(12, 20, 9, 90)),
          b('cable-curl', 2, range(10, 15, 9, 60)),
        ]),
      ]
    },
  },
  {
    id: 'gym-machines-upper-lower',
    sport: 'gym',
    build: (b, d) => {
      const { days, notes } = currentMessages().presets
      const topSetThenBackOff = [
        [6, 8],
        [8, 8],
        [10, 8],
      ] as const
      return [
        d(days.upperA, [
          b('machine-chest-press', 3, pyramid(topSetThenBackOff, 150, [notes.rampUp, notes.backOff].join(' '))),
          b('lat-pulldown', 3, range(8, 12, 8, 150)),
          b('incline-machine-press', 3, range(8, 12, 8, 120)),
          b('machine-row', 3, range(8, 12, 8, 150)),
          b('machine-lateral-raise', 3, range(12, 20, 9, 90)),
          b('triceps-pushdown', 2, range(10, 15, 9, 90)),
          b('machine-biceps-curl', 2, range(10, 15, 9, 90)),
        ]),
        d(days.lowerA, [
          b('leg-press', 4, range(8, 12, 8, 180, notes.rampUp)),
          b('seated-leg-curl', 3, range(10, 15, 9, 90)),
          b('leg-extension', 3, range(10, 15, 9, 90)),
          b('hip-adduction-machine', 2, range(12, 15, 8, 90)),
          b('standing-calf-raise', 3, range(10, 15, 9, 90, notes.pauseInStretch)),
          b('ab-crunch-machine', 2, range(10, 15, 8, 60)),
        ]),
        d(days.upperB, [
          b('machine-shoulder-press', 3, range(8, 12, 8, 120, notes.rampUp)),
          b('machine-high-row', 3, range(8, 12, 8, 120)),
          b('pec-deck', 3, range(10, 15, 9, 90)),
          b('reverse-pec-deck', 3, range(12, 20, 9, 90)),
          b('cable-lateral-raise', 3, range(12, 20, 9, 60, notes.oneArmBehind)),
          b('overhead-triceps-extension', 2, range(10, 15, 9, 90)),
          b('cable-curl', 2, range(10, 15, 9, 60)),
        ]),
        d(days.lowerB, [
          b('hack-squat', 3, range(8, 12, 8, 180, notes.rampUp)),
          b('hip-thrust-machine', 3, range(8, 12, 8, 120)),
          b('lying-leg-curl', 3, range(10, 15, 9, 90)),
          b('leg-extension', 2, range(10, 15, 9, 90)),
          b('hip-abduction-machine', 2, range(12, 15, 8, 60)),
          b('seated-calf-raise', 3, range(10, 15, 9, 90, notes.pauseInStretch)),
          b('cable-crunch', 2, range(10, 15, 8, 60)),
        ]),
      ]
    },
  },
  {
    id: 'gym-machines-full-body-2x',
    sport: 'gym',
    build: (b, d) => {
      const { days, notes } = currentMessages().presets
      return [
        d(days.fullBodyA, [
          b('leg-press', 3, range(8, 12, 8, 180, notes.rampUp)),
          b('machine-chest-press', 3, range(6, 10, 8, 150)),
          b('lat-pulldown', 3, range(8, 12, 8, 150)),
          b('seated-leg-curl', 3, range(10, 15, 9, 90)),
          b('machine-lateral-raise', 3, range(12, 20, 9, 90)),
          b('triceps-pushdown', 2, range(10, 15, 9, 90)),
          b('ab-crunch-machine', 2, range(10, 15, 8, 60)),
        ]),
        d(days.fullBodyB, [
          b('hack-squat', 3, range(8, 12, 8, 180, notes.rampUp)),
          b('machine-row', 3, range(8, 12, 8, 150)),
          b('incline-machine-press', 3, range(8, 12, 8, 120)),
          b('lying-leg-curl', 2, range(10, 15, 9, 90)),
          b('reverse-pec-deck', 2, range(12, 20, 9, 90)),
          b('machine-biceps-curl', 2, range(10, 15, 9, 90)),
          b('standing-calf-raise', 3, range(10, 15, 9, 90, notes.pauseInStretch)),
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
  /** Only these exercises (one picked from a search), with their sport's discipline when it is missing. */
  only?: readonly PresetSlug[]
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
  only,
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
    if (!chosen.includes(e.sport) || (only && !only.includes(e.slug))) continue
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
