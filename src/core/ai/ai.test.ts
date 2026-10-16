import { describe, expect, test } from 'bun:test'
import { MockLanguageModelV4 } from 'ai/test'
import { instantiate, TEMPLATES } from '../demo/programs.ts'
import { Exercise, Program } from '../model/schemas.ts'
import { ATHLETE, DISCIPLINES, entry, IDX, must, session, set } from '../testkit.test.ts'
import catalogJson from './catalog.json'
import { Catalog, findProvider, nativeModelId, sortedModels, sortedProviders, toCatalogModels } from './catalog.ts'
import { createModel, describeAiError, generateStructured } from './client.ts'
import { type AiExercises, exercisesFromAi, exercisesPrompt } from './exercises.ts'
import { adjustWeekDraft, generateExercisesDraft, generateProgramDraft } from './features.ts'
import { type AiProgram, contextPrompt, draftFromAi, scratchPrompt, summarizeContext } from './program.ts'

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
}

function jsonModel(value: unknown): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: 'text', text: JSON.stringify(value) }],
      finishReason: { unified: 'stop', raw: undefined },
      usage,
      warnings: [],
    },
  })
}

const block = (exercise: string, p: Partial<AiProgram['weeks'][number]['days'][number]['blocks'][number]> = {}) => ({
  exercise,
  newExercise: null,
  sets: 3,
  reps: null,
  distanceMeters: null,
  durationSeconds: null,
  intensity: null,
  restSeconds: null,
  intervalSeconds: null,
  tempo: null,
  notes: null,
  ...p,
})

const answer: AiProgram = {
  name: 'Speed and strength',
  goal: 'Faster 100 m',
  weeks: [
    {
      name: 'Week 1',
      days: [
        {
          name: 'Track',
          discipline: 'Track and field',
          notes: null,
          blocks: [
            block('sprint-60', { sets: 4, intensity: { kind: 'pctmax', value: 95 }, restSeconds: 240 }),
            block('Sled push', {
              sets: 4,
              durationSeconds: 15,
              newExercise: { discipline: 'Strongman', metric: 'time' },
            }),
          ],
        },
        {
          name: 'Gym',
          discipline: 'gym',
          notes: 'Heavy',
          blocks: [
            block('Back Squat', { sets: 120, reps: 4, intensity: { kind: 'pct1rm', value: 180 } }),
            block('bench-press', { sets: 3, reps: 5, intensity: { kind: 'pct1rm', value: 8 } }),
            block('deadlift: Deadlift (strength, weight_reps)', {
              sets: 3,
              reps: 3,
              intensity: { kind: 'pct1rm', value: 0.85 },
            }),
            block('plank', { sets: 3, reps: 45, tempo: '-' }),
          ],
        },
        { name: 'Empty', discipline: null, notes: null, blocks: [] },
      ],
    },
  ],
}

describe('program drafts', () => {
  test('a model answer becomes a valid draft: library matched by id or name, new exercises created, values bounded', () => {
    const d = draftFromAi(answer, ATHLETE)
    expect(Program.safeParse(d.program).success).toBe(true)
    expect(d.program.source).toBe('ai')
    const [track, gym] = d.program.weeks[0]?.days ?? []
    expect(d.program.weeks[0]?.days).toHaveLength(2)
    expect(track?.blocks[0]).toMatchObject({
      exerciseId: 'sprint-60',
      sets: 4,
      rest: 240,
      intensity: { kind: 'pctmax', value: 95 },
    })
    expect(d.newExercises).toHaveLength(1)
    expect(d.newDisciplines).toHaveLength(1)
    expect(d.newDisciplines[0]).toMatchObject({ name: 'Strongman', color: 'orange' })
    expect(d.newExercises[0]).toMatchObject({
      name: 'Sled push',
      disciplineId: d.newDisciplines[0]?.id,
      metric: 'time',
    })
    expect(track?.disciplineId).toBe('demo-track')
    expect(gym?.disciplineId).toBe('demo-gym')
    expect(track?.blocks[1]?.exerciseId).toBe(must(d.newExercises[0]).id)
    expect(gym?.blocks[0]).toMatchObject({
      exerciseId: 'back-squat',
      sets: 50,
      intensity: { kind: 'pct1rm', value: 110 },
    })
    expect(gym?.blocks[1]?.intensity).toEqual({ kind: 'rpe', value: 8 })
    expect(gym?.blocks[2]).toMatchObject({ exerciseId: 'deadlift', intensity: { kind: 'pct1rm', value: 85 } })
    expect(gym?.blocks[3]).toMatchObject({ exerciseId: 'plank', duration: 45 })
    expect(gym?.blocks[3]?.reps).toBeUndefined()
    expect(gym?.blocks[3]?.tempo).toBeUndefined()
    expect(new Set(d.notes).size).toBe(d.notes.length)
    expect(d.notes).toContain('Days with no exercise were left out.')
  })

  test('a program with no days is refused', () => {
    expect(() => draftFromAi({ ...answer, weeks: [{ name: 'W', days: [] }] }, ATHLETE)).toThrow('no training days')
  })

  test('generation through a model returns a draft and sends the library and answers', async () => {
    const model = jsonModel(answer)
    const pair = scratchPrompt(
      {
        sports: ['Track and field'],
        level: 'intermediate',
        daysPerWeek: 3,
        weeks: 4,
        goal: 'Run 11.9',
        limitations: 'left knee',
      },
      ATHLETE,
      '2026-10-16',
    )
    const d = await generateProgramDraft(model, pair, ATHLETE)
    expect(d.program.name).toBe('Speed and strength')
    const sent = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    expect(sent).toContain('back-squat | Back squat | Gym')
    expect(sent).toContain('Disciplines: Gym, Swimming, Track and field')
    expect(sent).toContain('Run 11.9')
    expect(sent).toContain('left knee')
  })

  test('an answer that does not match the schema is an error, never a program', async () => {
    await expect(
      generateStructured(jsonModel({ name: 'x' }), { system: '', prompt: '', schema: Program }),
    ).rejects.toThrow()
  })

  test('adjusting a week replaces only that week', async () => {
    const program = instantiate(must(TEMPLATES[0]), new Set(['gym'] as const))
    const d = await adjustWeekDraft(jsonModel(answer.weeks[0]), { system: '', prompt: '' }, program, 1, ATHLETE)
    expect(d.program.id).toBe(program.id)
    expect(d.program.weeks[0]).toEqual(must(program.weeks[0]))
    expect(d.program.weeks[1]?.days.map((x) => x.name)).toEqual(['Track', 'Gym'])
    expect(d.program.weeks[2]).toEqual(must(program.weeks[2]))
  })
})

describe('context', () => {
  test('the summary carries sessions, records, goals and the current program', () => {
    const program = instantiate(must(TEMPLATES[0]), new Set(['gym'] as const))
    const sessions = [
      session('2026-10-10', [entry('back-squat', [set({ weight: 100, reps: 5, rpe: 8 })])], {
        title: 'Full body A',
        rpe: 7,
        programRef: { programId: program.id, week: 0, day: 0 },
      }),
    ]
    const text = summarizeContext({
      sessions,
      goals: [
        {
          id: 'g',
          kind: 'e1rm',
          exerciseId: 'back-squat',
          target: 140,
          deadline: '2026-12-31',
          createdAt: '2026-10-01T00:00:00Z',
        },
      ],
      programs: [program],
      activeProgramId: program.id,
      exercises: IDX,
      disciplines: DISCIPLINES,
      today: '2026-10-16',
      weekStart: 1,
    })
    expect(text).toContain('2026-10-10 Full body A (Gym), session RPE 7')
    expect(text).toContain('Back squat [100kgx5@RPE8]')
    expect(text).toContain('Back squat: estimated 1RM 116.7 kg')
    expect(text).toContain('e1rm on Back squat: target 140 by 2026-12-31')
    expect(text).toContain('Current program: Beginner full body')
    expect(contextPrompt({ weeks: 4, daysPerWeek: 3, focus: '', sports: ['Gym'] }, text, ATHLETE).prompt).toContain(
      text,
    )
  })
})

describe('catalog', () => {
  const catalog = Catalog.parse(catalogJson)

  test('the bundled catalog parses and lists the main vendors first', () => {
    expect(catalog.providers.length).toBeGreaterThan(10)
    expect(sortedProviders(catalog)[0]?.id).toBe('anthropic')
    const anthropic = must(findProvider(catalog, 'anthropic'))
    expect(sortedModels(anthropic)[0]?.structured).toBe(true)
    expect(findProvider(catalog, 'custom')?.client).toBe('openai-compatible')
  })
})

describe('native model ids', () => {
  const both = { openrouter: true, models_dev: true }
  test('the provider prefix is removed and OpenRouter-only variants leave vendor lists', () => {
    expect(nativeModelId('anthropic', { id: 'anthropic/claude-sonnet-5-5', name: 'S', sources: both })).toBe(
      'claude-sonnet-5-5',
    )
    expect(
      nativeModelId('anthropic', { id: 'anthropic/claude-sonnet-5.5:batch', name: 'S', sources: { openrouter: true } }),
    ).toBeUndefined()
    expect(
      nativeModelId('openrouter', { id: 'openrouter/anthropic/claude-sonnet-5.5', name: 'S', sources: both }),
    ).toBe('anthropic/claude-sonnet-5.5')
    expect(nativeModelId('openrouter', { id: 'openrouter/auto', name: 'Auto', sources: { openrouter: true } })).toBe(
      'openrouter/auto',
    )
    const models = toCatalogModels('anthropic', [
      { id: 'anthropic/claude-haiku-5-5', name: 'H', sources: both },
      { id: 'anthropic/claude-haiku-5.5:batch', name: 'H', sources: { openrouter: true } },
    ])
    expect(models.map((m) => m.id)).toEqual(['claude-haiku-5-5'])
  })

  test("llm-models' own api_id wins when it is there, absent meaning not served", () => {
    expect(nativeModelId('anthropic', { id: 'anthropic/x', name: 'X', api_id: 'x-native' })).toBe('x-native')
    expect(
      nativeModelId('anthropic', { id: 'anthropic/x', name: 'X', sources: both, api_id: undefined }),
    ).toBeUndefined()
  })

  test('the bundled catalog only lists native ids for the vendors', () => {
    const catalog = Catalog.parse(catalogJson)
    for (const id of ['anthropic', 'openai', 'google'])
      for (const m of must(findProvider(catalog, id)).models)
        expect(m.id.startsWith(`${id}/`) || m.id.includes(':')).toBe(false)
  })
})

describe('client', () => {
  async function headersSent(baseUrl?: string): Promise<Headers> {
    const real = globalThis.fetch
    let seen = new Headers()
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      seen = new Headers(init?.headers)
      return new Response(JSON.stringify({ error: { message: 'stop' } }), { status: 400 })
    }) as typeof fetch
    try {
      const provider = {
        id: 'anthropic',
        name: 'Anthropic',
        client: 'anthropic' as const,
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
        models: [],
      }
      const model = await createModel({
        provider,
        modelId: 'claude-test',
        apiKey: 'k',
        ...(baseUrl ? { baseUrl } : {}),
      })
      await generateStructured(model, { system: 's', prompt: 'p', schema: Program }).catch(() => {})
    } finally {
      globalThis.fetch = real
    }
    return seen
  }

  test("Anthropic's browser header goes to Anthropic's own host only", async () => {
    expect((await headersSent()).get('anthropic-dangerous-direct-browser-access')).toBe('true')
    expect(
      (await headersSent('https://proxy.example.com/v1')).get('anthropic-dangerous-direct-browser-access'),
    ).toBeNull()
  })

  test('errors become sentences the user can act on', () => {
    expect(describeAiError(new Error('401 Unauthorized'))).toContain('refused the key')
    expect(describeAiError(new TypeError('Failed to fetch'))).toContain('could not be reached')
  })
})

const exercise = (
  name: string,
  p: Partial<AiExercises['exercises'][number]> = {},
): AiExercises['exercises'][number] => ({
  name,
  discipline: null,
  metric: 'weight_reps',
  distanceMeters: null,
  pace: null,
  muscles: null,
  notes: null,
  ...p,
})

describe('exercise drafts', () => {
  const library: AiExercises = {
    exercises: [
      exercise('Good morning', { discipline: 'gym', muscles: ['hamstrings', 'glutes', 'glutes'] }),
      exercise('back squat', { discipline: 'Gym' }),
      exercise('Good Morning', { discipline: 'Gym' }),
      exercise('Flying 20 m', { discipline: 'Track and field', metric: 'distance_time', distanceMeters: 20 }),
      exercise('Recovery run', { discipline: 'Track and field', metric: 'distance_time', muscles: ['calves'] }),
      exercise('Hangboard repeaters', { discipline: 'Climbing', metric: 'time', notes: '  7 s on, 3 s off  ' }),
      exercise('   ', { discipline: 'Bouldering' }),
    ],
  }

  test('a model answer becomes valid new exercises: known and repeated names left out, fields fitted to the metric', () => {
    const d = exercisesFromAi(library, ATHLETE)
    expect(d.exercises.map((e) => e.name)).toEqual([
      'Good morning',
      'Flying 20 m',
      'Recovery run',
      'Hangboard repeaters',
    ])
    for (const e of d.exercises) expect(Exercise.safeParse(e).success).toBe(true)
    expect(d.skipped).toEqual(['Back squat'])
    const [rdl, flying, easy, hang] = d.exercises
    expect(rdl).toMatchObject({ disciplineId: 'demo-gym', muscles: ['hamstrings', 'glutes'] })
    expect(flying).toMatchObject({ disciplineId: 'demo-track', distance: 20 })
    expect(flying?.pace).toBeUndefined()
    expect(easy).toMatchObject({ pace: '100m' })
    expect(easy?.muscles).toBeUndefined()
    expect(d.disciplines).toHaveLength(1)
    expect(d.disciplines[0]).toMatchObject({ name: 'Climbing', color: 'orange' })
    expect(hang).toMatchObject({ disciplineId: d.disciplines[0]?.id, metric: 'time', notes: '7 s on, 3 s off' })
  })

  test('an answer with nothing new is refused', () => {
    expect(() => exercisesFromAi({ exercises: [exercise('Back squat')] }, ATHLETE)).toThrow('already in your library')
    expect(() => exercisesFromAi({ exercises: [] }, ATHLETE)).toThrow('no exercise')
  })

  test('generation through a model sends the sports and what the athlete already has', async () => {
    const model = jsonModel(library)
    const pair = exercisesPrompt(
      { sports: ['Climbing'], level: 'beginner', size: 'complete', equipment: 'Bouldering gym', notes: '' },
      ATHLETE,
    )
    expect(pair.prompt).toContain('Climbing')
    expect(pair.prompt).toContain('Bouldering gym')
    expect(pair.system).toContain('Back squat (Gym)')
    const d = await generateExercisesDraft(model, pair, ATHLETE)
    expect(d.exercises).toHaveLength(4)
  })
})
