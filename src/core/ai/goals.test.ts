import { afterEach, describe, expect, test } from 'bun:test'
import { APICallError } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { setDisplayLocale } from '../i18n/locale.ts'
import type { Goal } from '../model/schemas.ts'
import { ATHLETE, GYM } from '../testkit.test.ts'
import { type CatalogProvider, CUSTOM_PROVIDER_INFO } from './catalog.ts'
import { describeAiError, toLlmSettings } from './client.ts'
import { exercisesPrompt } from './exercises.ts'
import { generateGoalsDraft } from './features.ts'
import { type AiGoals, goalsFromAi, goalsPrompt } from './goals.ts'
import { languageRule, scratchPrompt } from './program.ts'

afterEach(() => setDisplayLocale('en'))

const TODAY = '2026-11-06'

const goal = (p: Partial<AiGoals['goals'][number]>): AiGoals['goals'][number] => ({
  kind: 'exercise',
  exercise: null,
  discipline: null,
  volume: null,
  target: 100,
  weeks: 8,
  why: null,
  ...p,
})

describe('goals from a model', () => {
  test('exercise goals need one of the athlete’s exercises, by id or name, and a plausible target', () => {
    const out = goalsFromAi(
      {
        goals: [
          goal({ exercise: 'back-squat', target: 140, why: '  From your 130 kg estimate. ' }),
          goal({ exercise: 'Pull-up', target: 11.6 }),
          goal({ exercise: 'Underwater basket weaving', target: 3 }),
          goal({ exercise: 'bench-press', target: 4000 }),
          goal({ exercise: 'deadlift', target: 180, weeks: 0 }),
        ],
      },
      ATHLETE,
      [],
      TODAY,
    )
    expect(out.map((p) => [p.goal.exerciseId, p.goal.target])).toEqual([
      ['back-squat', 140],
      ['pull-up', 12],
    ])
    expect(out[0]?.why).toBe('From your 130 kg estimate.')
    expect(out[0]?.goal.deadline).toBe('2027-01-01')
    expect(out[0]?.goal.disciplineId).toBe(GYM)
  })

  test('weekly goals take a known discipline or none, and goals already set are left out', () => {
    const existing: Goal[] = [
      { id: 'g', kind: 'frequency', target: 3, deadline: '2027-01-01', createdAt: TODAY, disciplineId: GYM },
    ]
    const gymName = ATHLETE.disciplines.find((d) => d.id === GYM)?.name ?? ''
    const out = goalsFromAi(
      {
        goals: [
          goal({ kind: 'frequency', discipline: gymName, target: 4 }),
          goal({ kind: 'frequency', discipline: 'Curling', target: 3.4 }),
          goal({ kind: 'weekly_volume', discipline: null, volume: 'distance', target: 12_000 }),
          goal({ kind: 'frequency', target: 30 }),
        ],
      },
      ATHLETE,
      existing,
      TODAY,
    )
    expect(out.map((p) => [p.goal.kind, p.goal.disciplineId, p.goal.volume, p.goal.target])).toEqual([
      ['frequency', undefined, undefined, 3],
      ['weekly_volume', undefined, 'distance', 12_000],
    ])
  })

  test('generation sends the history and returns proposals, nothing stored', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: {
        content: [{ type: 'text', text: JSON.stringify({ goals: [goal({ exercise: 'back-squat', target: 150 })] }) }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 1, text: 1, reasoning: undefined },
        },
        warnings: [],
      },
    })
    const pair = goalsPrompt({ focus: 'squat' }, 'Today is 2026-11-06.', ATHLETE)
    const out = await generateGoalsDraft(model, pair, ATHLETE, [], TODAY)
    expect(out).toHaveLength(1)
    const sent = JSON.stringify(model.doGenerateCalls[0]?.prompt)
    expect(sent).toContain('Focus: squat')
    expect(sent).toContain('back-squat')
  })
})

describe('the language the model writes in', () => {
  test('every prompt asks for the displayed language', () => {
    expect(languageRule('fr')).toContain('French')
    setDisplayLocale('de')
    const a = { sports: ['Gym'], level: 'beginner' as const, shape: { layout: 'sessions' as const }, goal: '' }
    expect(scratchPrompt(a, ATHLETE, TODAY).system).toContain('in German')
    expect(
      exercisesPrompt({ sports: ['Gym'], level: 'beginner', size: 'essentials', equipment: '', notes: '' }, ATHLETE)
        .system,
    ).toContain('in German')
    expect(goalsPrompt({ focus: '' }, '', ATHLETE).system).toContain('in German')
  })
})

describe('settings for llm-connect', () => {
  const provider = (p: Partial<CatalogProvider>): CatalogProvider => ({
    id: 'x',
    name: 'X',
    client: 'openai',
    models: [],
    ...p,
  })

  test('a catalog provider: its package, its address unless the user overrides it, its CORS headers', () => {
    expect(
      toLlmSettings({ provider: provider({ client: 'anthropic', id: 'anthropic' }), modelId: 'm', apiKey: 'k' }),
    ).toMatchObject({ providerNpm: '@ai-sdk/anthropic', model: 'm', apiKey: 'k' })
    const groq = provider({ client: 'openai-compatible', api: 'https://api.groq.com/openai/v1', headers: { a: 'b' } })
    expect(toLlmSettings({ provider: groq, modelId: 'm', apiKey: 'k' })).toMatchObject({
      providerNpm: '@ai-sdk/openai-compatible',
      providerApi: 'https://api.groq.com/openai/v1',
      headers: { a: 'b' },
    })
    expect(
      toLlmSettings({ provider: groq, modelId: 'm', apiKey: 'k', baseUrl: ' https://proxy.example.com/v1 ' })
        .providerApi,
    ).toBe('https://proxy.example.com/v1')
    expect(toLlmSettings({ provider: provider({ client: 'openrouter' }), modelId: 'm', apiKey: 'k' }).providerNpm).toBe(
      '@openrouter/ai-sdk-provider',
    )
  })

  test('the custom endpoint needs its address; a compatible provider without one is refused', () => {
    expect(
      toLlmSettings({
        provider: CUSTOM_PROVIDER_INFO,
        modelId: 'llama',
        apiKey: '',
        baseUrl: 'http://localhost:11434/v1',
      }),
    ).toMatchObject({ customEndpoint: 'http://localhost:11434/v1', customModel: 'llama' })
    expect(() => toLlmSettings({ provider: CUSTOM_PROVIDER_INFO, modelId: 'llama', apiKey: '' })).toThrow('address')
    expect(() =>
      toLlmSettings({ provider: provider({ client: 'openai-compatible' }), modelId: 'm', apiKey: '' }),
    ).toThrow('No address')
  })

  test("the provider's answers read as what to do", () => {
    const answer = (statusCode: number) =>
      new APICallError({ message: 'x', url: 'https://api.example.com', requestBodyValues: {}, statusCode })
    expect(describeAiError(answer(401))).toContain('refused the key')
    expect(describeAiError(answer(429))).toContain('rate limit')
    expect(describeAiError(answer(529))).toContain('overloaded')
  })
})
