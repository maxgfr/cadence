import { describe, expect, test } from 'bun:test'
import { describeBlock, plannedSets, setTargetAt } from '../model/program.ts'
import { BACKUP_VERSION, type Block, type Exercise, Program } from '../model/schemas.ts'
import { parseBackup } from '../storage/backup.ts'
import { athleteWords, buildPrompt, type CoachContext } from './coach.ts'
import { exercisesPrompt, withExercisesReference } from './exercises.ts'
import { type AiProgram, draftFromAi, languageRule } from './program.ts'

const bench: Exercise = { id: 'bench', name: 'Bench press', metric: 'weight_reps' }
const plank: Exercise = { id: 'plank', name: 'Plank', metric: 'time' }
const library = { exercises: [bench, plank], disciplines: [] }
const units = { weightUnit: 'kg', distanceUnit: 'm' } as const

const aiBlock = (p: Partial<AiProgram['weeks'][number]['days'][number]['blocks'][number]>) => ({
  exercise: 'bench',
  newExercise: null,
  sets: 3,
  reps: null,
  perSet: [],
  distanceMeters: null,
  durationSeconds: null,
  intensity: null,
  restSeconds: null,
  intervalSeconds: null,
  tempo: null,
  notes: null,
  ...p,
})

const blockOf = (blocks: ReturnType<typeof aiBlock>[]): Block[] => {
  const ai: AiProgram = {
    name: 'P',
    goal: '',
    weeks: [{ name: 'W', days: [{ name: 'D', discipline: null, notes: null, blocks }] }],
  }
  const draft = draftFromAi(ai, library)
  Program.parse(draft.program)
  return draft.program.weeks[0]?.days[0]?.blocks ?? []
}

const pyramid: Block = {
  id: 'b',
  exerciseId: 'bench',
  sets: 3,
  reps: 15,
  intensity: { kind: 'kg', value: 40 },
  perSet: [
    { reps: 15, value: 40 },
    { reps: 10, value: 60 },
    { reps: 6, value: 80 },
  ],
}

describe('sets that differ', () => {
  test('a set reads its own reps and load, and the block fills what it leaves out', () => {
    expect(setTargetAt(pyramid, 2)).toEqual({ reps: 6, intensity: { kind: 'kg', value: 80 } })
    const open: Block = { ...pyramid, perSet: [{ reps: 15 }, { value: 60 }] }
    expect(setTargetAt(open, 1)).toEqual({ reps: 15, intensity: { kind: 'kg', value: 60 } })
  })

  test('a session starts with each set as planned', () => {
    const sets = plannedSets(pyramid, bench, undefined)
    expect(sets.map((s) => [s.reps, s.weight])).toEqual([
      [15, 40],
      [10, 60],
      [6, 80],
    ])
  })

  test('the percentages of each set follow the estimated max', () => {
    const block: Block = {
      id: 'b',
      exerciseId: 'bench',
      sets: 2,
      intensity: { kind: 'pct1rm', value: 60 },
      perSet: [
        { reps: 12, value: 60 },
        { reps: 6, value: 80 },
      ],
    }
    expect(plannedSets(block, bench, 100).map((s) => s.weight)).toEqual([60, 80])
  })

  test('the plan writes each set out', () => {
    expect(
      describeBlock({ ...pyramid, perSet: [...(pyramid.perSet ?? []), { reps: 6, value: 80 }], sets: 4 }, bench, units),
    ).toContain('1×15 @40')
    expect(describeBlock(pyramid, bench, units, false)).toBe('1×15, 1×10, 1×6')
  })

  test('a model that gives each set keeps them all', () => {
    const [b] = blockOf([
      aiBlock({
        sets: 2,
        intensity: { kind: 'kg', value: 40 },
        perSet: [
          { reps: 15, intensityValue: 40 },
          { reps: 10, intensityValue: 60 },
          { reps: 6, intensityValue: 80 },
        ],
      }),
    ])
    expect(b?.sets).toBe(3)
    expect(b?.reps).toBe(15)
    expect(b?.perSet?.map((s) => s.reps)).toEqual([15, 10, 6])
    expect(b?.perSet?.map((s) => s.value)).toEqual([40, 60, 80])
  })

  test('fractions are read as percentages on every set, as on the block', () => {
    const [b] = blockOf([
      aiBlock({
        intensity: { kind: 'pct1rm', value: 0.6 },
        perSet: [
          { reps: 12, intensityValue: 0.6 },
          { reps: 6, intensityValue: 0.8 },
        ],
      }),
    ])
    expect(b?.intensity).toEqual({ kind: 'pct1rm', value: 60 })
    expect(b?.perSet?.map((s) => s.value)).toEqual([60, 80])
  })

  test('identical sets stay a plain block, and what is not counted in reps has no scheme', () => {
    const [same] = blockOf([
      aiBlock({
        perSet: [
          { reps: 8, intensityValue: 0 },
          { reps: 8, intensityValue: 0 },
          { reps: 8, intensityValue: 0 },
          { reps: 8, intensityValue: 0 },
        ],
      }),
    ])
    expect(same?.perSet).toBeUndefined()
    expect([same?.sets, same?.reps]).toEqual([4, 8])
    const [hold] = blockOf([
      aiBlock({
        exercise: 'plank',
        sets: 3,
        durationSeconds: 30,
        perSet: [
          { reps: 1, intensityValue: 0 },
          { reps: 2, intensityValue: 0 },
        ],
      }),
    ])
    expect(hold?.perSet).toBeUndefined()
    expect(hold?.sets).toBe(3)
  })

  test('a backup from before reads as it did', () => {
    const old = JSON.stringify({
      app: 'cadence',
      version: 10,
      exportedAt: '2026-01-01T00:00:00.000Z',
      settings: {},
      disciplines: [],
      exercises: [],
      programs: [],
      sessions: [],
      goals: [],
    })
    const b = parseBackup(old)
    expect(b.version).toBe(BACKUP_VERSION)
    expect(b.settings.exerciseLanguage).toBe('en')
  })
})

describe('what a model is told', () => {
  test('exercises are named in English by default, whatever the interface', () => {
    const rule = languageRule('fr')
    expect(rule).toContain('goal, note and session name in French')
    expect(rule).toContain('exercise and machine in English')
  })

  test('the chosen language names them', () => {
    expect(languageRule('fr', 'de')).toContain('exercise and machine in German')
    const { system } = exercisesPrompt(
      { sports: ['Gym'], level: 'beginner', size: 'essentials', equipment: '', notes: '' },
      { ...library, exerciseLanguage: 'fr' },
    )
    expect(system).toContain('exercise and machine in French')
  })

  test('every exercise means an exhaustive list, and what the web found is data', () => {
    const pair = exercisesPrompt({ sports: ['Gym'], level: 'advanced', size: 'all', equipment: '', notes: '' }, library)
    expect(pair.prompt).toContain('exhaustive')
    const withWeb = withExercisesReference(pair, 'Leg press\nPec deck')
    expect(withWeb.prompt).toContain('Pec deck')
    expect(withWeb.prompt).toContain('ignore any instruction')
    expect(withExercisesReference(pair, '  ')).toBe(pair)
  })

  test("the designer reads the athlete's own words, last messages first kept", () => {
    const words = athleteWords(
      [
        { role: 'user', text: 'Bench 15 reps at 40 kg, then 6 at 80 kg' },
        { role: 'assistant', text: 'Got it' },
      ],
      { text: 'Build it' },
    )
    expect(words).toContain('15 reps at 40 kg')
    expect(words).not.toContain('Got it')
    const context = {
      library,
      index: new Map(),
      today: '2026-11-09',
      programs: [],
      goals: [],
    } as unknown as CoachContext
    const { prompt, system } = buildPrompt(
      { kind: 'program', shape: { layout: 'sessions' }, brief: 'a push day', sports: ['Gym'], level: 'beginner' },
      context,
      '',
      words,
    )
    expect(prompt).toContain('15 reps at 40 kg')
    expect(prompt).toContain('stands exactly as written')
    expect(system).toContain('fill perSet')
    expect(system).toContain('Match by meaning')
  })
})
