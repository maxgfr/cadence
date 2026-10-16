import { describe, expect, test } from 'bun:test'
import { MockLanguageModelV4 } from 'ai/test'
import { instantiate, TEMPLATES } from '../library/templates.ts'
import { Program } from '../model/schemas.ts'
import { entry, IDX, LIB, must, session, set } from '../testkit.test.ts'
import catalogJson from './catalog.json'
import { Catalog, findProvider, sortedModels, sortedProviders } from './catalog.ts'
import { createModel, describeAiError, generateStructured } from './client.ts'
import { adjustWeekDraft, generateProgramDraft } from './features.ts'
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
  disciplines: ['run', 'strength'],
  weeks: [
    {
      name: 'Week 1',
      days: [
        {
          name: 'Track',
          discipline: 'run',
          notes: null,
          blocks: [
            block('sprint-60', { sets: 4, intensity: { kind: 'pctmax', value: 95 }, restSeconds: 240 }),
            block('Sled push', { sets: 4, durationSeconds: 15, newExercise: { discipline: 'run', metric: 'time' } }),
          ],
        },
        {
          name: 'Gym',
          discipline: 'strength',
          notes: 'Heavy',
          blocks: [block('Back Squat', { sets: 120, reps: 4, intensity: { kind: 'pct1rm', value: 180 } })],
        },
        { name: 'Empty', discipline: 'other', notes: null, blocks: [] },
      ],
    },
  ],
}

describe('program drafts', () => {
  test('a model answer becomes a valid draft: library matched by id or name, new exercises created, values bounded', () => {
    const d = draftFromAi(answer, LIB)
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
    expect(d.newExercises[0]).toMatchObject({ name: 'Sled push', discipline: 'run', metric: 'time' })
    expect(track?.blocks[1]?.exerciseId).toBe(must(d.newExercises[0]).id)
    expect(gym?.blocks[0]).toMatchObject({
      exerciseId: 'back-squat',
      sets: 50,
      intensity: { kind: 'pct1rm', value: 110 },
    })
    expect(d.notes.some((n) => n.includes('Empty'))).toBe(true)
  })

  test('a program with no days is refused', () => {
    expect(() => draftFromAi({ ...answer, weeks: [{ name: 'W', days: [] }] }, LIB)).toThrow('no training days')
  })

  test('generation through a model returns a draft and sends the library and answers', async () => {
    const model = jsonModel(answer)
    const pair = scratchPrompt(
      {
        disciplines: ['run'],
        level: 'intermediate',
        daysPerWeek: 3,
        weeks: 4,
        goal: 'Run 11.9',
        limitations: 'left knee',
      },
      LIB,
      '2026-10-16',
    )
    const d = await generateProgramDraft(model, pair, LIB)
    expect(d.program.name).toBe('Speed and strength')
    const sent = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    expect(sent).toContain('back-squat: Back squat')
    expect(sent).toContain('Run 11.9')
    expect(sent).toContain('left knee')
  })

  test('an answer that does not match the schema is an error, never a program', async () => {
    await expect(
      generateStructured(jsonModel({ name: 'x' }), { system: '', prompt: '', schema: Program }),
    ).rejects.toThrow()
  })

  test('adjusting a week replaces only that week', async () => {
    const program = instantiate(must(TEMPLATES[0]))
    const d = await adjustWeekDraft(jsonModel(answer.weeks[0]), { system: '', prompt: '' }, program, 1, LIB)
    expect(d.program.id).toBe(program.id)
    expect(d.program.weeks[0]).toEqual(must(program.weeks[0]))
    expect(d.program.weeks[1]?.days.map((x) => x.name)).toEqual(['Track', 'Gym'])
    expect(d.program.weeks[2]).toEqual(must(program.weeks[2]))
  })
})

describe('context', () => {
  test('the summary carries sessions, records, goals and the current program', () => {
    const program = instantiate(must(TEMPLATES[0]))
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
      today: '2026-10-16',
      weekStart: 1,
    })
    expect(text).toContain('2026-10-10 Full body A, session RPE 7')
    expect(text).toContain('Back squat [100kgx5@RPE8]')
    expect(text).toContain('Back squat: estimated 1RM 116.7 kg')
    expect(text).toContain('e1rm on Back squat: target 140 by 2026-12-31')
    expect(text).toContain('Current program: Beginner full body')
    expect(
      contextPrompt({ weeks: 4, daysPerWeek: 3, focus: '', disciplines: ['strength'] }, text, LIB).prompt,
    ).toContain(text)
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
