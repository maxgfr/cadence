import { z } from 'zod'
import { normalizeName } from '../library/exercises.ts'
import { newId } from '../model/ids.ts'
import { type Discipline, Exercise, Metric, Muscle, PaceUnit } from '../model/schemas.ts'
import { type AthleteLibrary, disciplineResolver, type PromptPair } from './program.ts'

/* What a model is asked to return: every field present (nullable rather than optional), bounds applied after. */
const AiExercise = z.object({
  name: z.string().describe('The usual English name, without the discipline in it'),
  discipline: z.string().nullable().describe("One of the athlete's disciplines by name, or the sport it belongs to"),
  metric: Metric.describe(
    'weight_reps for loaded lifts, reps for bodyweight reps, time for holds and timed work, distance_time for swims, runs and sprints',
  ),
  distanceMeters: z
    .number()
    .nullable()
    .describe('Only for a fixed-distance event logged as a time (60 m sprint, 50 m freestyle); null otherwise'),
  pace: PaceUnit.nullable().describe(
    'For open-distance work: 100m (swimming) or km (running, cycling); null otherwise',
  ),
  muscles: z.array(Muscle).nullable().describe('Main muscles worked, for strength and bodyweight exercises'),
  notes: z.string().nullable().describe('One short coaching cue, or null'),
})

export const AiExercises = z.object({ exercises: z.array(AiExercise) })
export type AiExercises = z.infer<typeof AiExercises>

/** Exercises proposed by a model, not saved yet: the user picks and edits them, then adds them to the library. */
export interface ExercisesDraft {
  exercises: Exercise[]
  /** Disciplines the exercises use that the athlete does not have yet; added with the first exercise using them. */
  disciplines: Discipline[]
  /** Names the model proposed that are already in the library, left out. */
  skipped: string[]
}

const text = (v: string | null | undefined, max: number) => {
  const t = v?.trim()
  return t ? t.slice(0, max) : undefined
}

/** Turns a model's answer into new exercises: those already in the library or repeated are left out. */
export function exercisesFromAi(ai: AiExercises, library: AthleteLibrary): ExercisesDraft {
  const ds = disciplineResolver(library.disciplines)
  const known = new Map(library.exercises.map((e) => [normalizeName(e.name), e.name]))
  const seen = new Set<string>()
  const skipped: string[] = []
  const exercises: Exercise[] = []
  for (const a of ai.exercises) {
    const name = text(a.name, 80)
    if (!name) continue
    const key = normalizeName(name)
    const existing = known.get(key)
    if (existing) {
      skipped.push(existing)
      continue
    }
    if (seen.has(key)) continue
    const distance = a.metric === 'distance_time' && a.distanceMeters && a.distanceMeters > 0 ? a.distanceMeters : 0
    const disciplineId = ds.resolve(a.discipline)
    const muscles = a.metric === 'distance_time' ? [] : [...new Set(a.muscles ?? [])]
    const notes = text(a.notes, 500)
    const parsed = Exercise.safeParse({
      id: newId(),
      name,
      metric: a.metric,
      ...(disciplineId ? { disciplineId } : {}),
      ...(distance > 0 ? { distance: Math.round(distance) } : {}),
      ...(a.metric === 'distance_time' && distance === 0 ? { pace: a.pace ?? '100m' } : {}),
      ...(muscles.length > 0 ? { muscles } : {}),
      ...(notes ? { notes } : {}),
    })
    if (!parsed.success) continue
    seen.add(key)
    exercises.push(parsed.data)
  }
  if (exercises.length === 0)
    throw new Error(
      skipped.length > 0
        ? 'Every exercise the model proposed is already in your library.'
        : 'The model returned no exercise.',
    )
  const used = new Set(exercises.map((e) => e.disciplineId))
  return { exercises, disciplines: ds.added.filter((d) => used.has(d.id)), skipped: [...new Set(skipped)] }
}

export interface ExercisesAnswers {
  /** Sports by name: the athlete's disciplines picked, and any typed in. */
  sports: string[]
  level: 'beginner' | 'intermediate' | 'advanced'
  /** Roughly how many exercises per sport. */
  size: 'essentials' | 'complete'
  equipment: string
  notes: string
}

const SYSTEM = `You are an experienced coach across sports: strength training, swimming, track and field, running and \
others. You build a self-coached athlete's exercise library: the exercises they will plan their programs with and log \
set by set.

Rules:
- One entry per exercise, named as athletes usually write it, in English. No variants that differ only by load or \
reps; a fixed-distance event (60 m, 100 m, 50 m freestyle) is its own exercise.
- Give each exercise the discipline it belongs to: one of the athlete's disciplines by name, or the sport's name.
- How it is measured: weight_reps for anything loaded, reps for bodyweight repetitions, time for holds and timed \
work, distance_time for distances covered in a time.
- distanceMeters only for a fixed-distance event; open-distance work (an easy run, a swim set) has none and a pace \
unit instead: 100m for swimming, km for running and cycling.
- Muscles only for strength and bodyweight work, from the list given.
- Cover what the sport needs at that level: main movements, accessories, technique drills, conditioning and warm-up.
- Leave out the exercises the athlete already has.`

export function exercisesPrompt(a: ExercisesAnswers, library: AthleteLibrary): PromptPair {
  const name = (id: string | undefined) => library.disciplines.find((d) => d.id === id)?.name ?? '-'
  const has = library.exercises.map((e) => `${e.name} (${name(e.disciplineId)})`)
  const lines = [
    `Build an exercise library for: ${a.sports.join(', ')}.`,
    `Level: ${a.level}.`,
    a.size === 'essentials'
      ? 'Keep it to the essentials: about 8 exercises per sport.'
      : 'Make it complete: about 20 to 25 exercises per sport.',
  ]
  if (a.equipment.trim()) lines.push(`Equipment and facilities: ${a.equipment.trim()}.`)
  if (a.notes.trim()) lines.push(`Other notes: ${a.notes.trim()}`)
  return {
    system: [
      SYSTEM,
      '',
      `The athlete's disciplines: ${library.disciplines.length > 0 ? library.disciplines.map((d) => d.name).join(', ') : 'none yet'}.`,
      `Exercises they already have: ${has.length > 0 ? has.join('; ') : 'none'}.`,
    ].join('\n'),
    prompt: lines.join('\n'),
  }
}
