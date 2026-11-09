import { afterEach, describe, expect, test } from 'bun:test'
import { type ToolSet, tool } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { z } from 'zod'
import { setDisplayLocale } from '../i18n/locale.ts'
import { applyLoggedSets } from '../model/program.ts'
import { DEFAULT_SETTINGS, type Session } from '../model/schemas.ts'
import { ATHLETE, GYM, IDX } from '../testkit.test.ts'
import {
  AiCoachReply,
  type AiSetIn,
  buildPrompt,
  type CoachContext,
  coachFromAi,
  coachSystem,
  describedWithSources,
  sessionText,
  setsFromAi,
} from './coach.ts'
import { AiExercises } from './exercises.ts'
import { generateCoachTurn } from './features.ts'
import { AiGoals } from './goals.ts'
import { AiProgram, AiWeek } from './program.ts'

describe('sets said aloud, into the session', () => {
  const planned: Session = {
    id: 's',
    date: '2026-11-06',
    title: 'Swim',
    entries: [
      {
        id: 'e',
        exerciseId: 'free',
        sets: [
          { distance: 50, time: 40, done: true },
          { distance: 50, done: false },
          { distance: 50, done: false },
        ],
      },
    ],
    status: 'active',
  }

  test('they fill the planned sets not done yet, keep the planned distance, then are added after', () => {
    const next = applyLoggedSets(planned, 'free', [
      { time: 41, done: true },
      { time: 42, done: true },
      { time: 43, done: true },
    ])
    expect(next.entries[0]?.sets).toEqual([
      { distance: 50, time: 40, done: true },
      { distance: 50, time: 41, done: true },
      { distance: 50, time: 42, done: true },
      { time: 43, done: true },
    ])
    expect(planned.entries[0]?.sets[1]?.done).toBe(false)
  })

  test('an exercise not in the session gets its own entry', () => {
    const next = applyLoggedSets(planned, 'kick', [{ distance: 100, done: true }])
    expect(next.entries.map((e) => e.exerciseId)).toEqual(['free', 'kick'])
  })
})

afterEach(() => setDisplayLocale('en'))

const TODAY = '2026-11-06'

const active: Session = {
  id: 's1',
  date: TODAY,
  title: 'Leg day',
  disciplineId: GYM,
  entries: [{ id: 'e1', exerciseId: 'back-squat', sets: [{ reps: 5, weight: 100, done: true }] }],
  status: 'active',
}

const ctx = (p: Partial<CoachContext> = {}): CoachContext => ({
  library: ATHLETE,
  index: IDX,
  programs: [],
  goals: [],
  active,
  settings: DEFAULT_SETTINGS,
  today: TODAY,
  ...p,
})

/** A coach answer: nothing proposed but what the test gives. */
const answer = (p: Partial<AiCoachReply>): AiCoachReply => ({
  reply: 'Done.',
  logSets: [],
  createProgram: [],
  adjustWeek: [],
  addExercises: [],
  addGoals: [],
  updateSettings: [],
  setRest: [],
  describeExercise: [],
  ...p,
})
const set = (p: Partial<AiSetIn>): AiSetIn => ({ reps: 0, weight: 0, timeSeconds: 0, distance: 0, rpe: 0, ...p })
type Sets = AiCoachReply['logSets'][number]['sets']
const sets = (...s: Partial<AiSetIn>[]) => s.map(set) as Sets

/** A model answering each call with what `answerFor` returns for its prompt (the coach first, then the designers). */
function scriptedModel(answerFor: (prompt: string) => unknown) {
  return new MockLanguageModelV4({
    doGenerate: async (options) => {
      const value = answerFor(JSON.stringify(options.prompt))
      if (value instanceof Error) throw value
      return {
        content: [{ type: 'text', text: JSON.stringify(value) }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 1, text: 1, reasoning: undefined },
        },
        warnings: [],
      }
    },
  })
}

/** Parameters with a union (anyOf, or an array of types, as nullable gives), in a JSON schema. */
function unions(schema: unknown): number {
  if (!schema || typeof schema !== 'object') return 0
  if (Array.isArray(schema)) return schema.reduce((n: number, x) => n + unions(x), 0)
  const o = schema as Record<string, unknown>
  const own = o.anyOf || o.oneOf || Array.isArray(o.type) ? 1 : 0
  return own + Object.values(o).reduce((n: number, x) => n + unions(x), 0)
}

describe('what a model is asked to fill', () => {
  test('every schema stays within strict structured outputs: at most 16 union-typed parameters (Anthropic)', () => {
    for (const schema of [AiCoachReply, AiProgram, AiWeek, AiExercises, AiGoals])
      expect(unions(z.toJSONSchema(schema, { io: 'input' }))).toBeLessThanOrEqual(16)
    // The coach's own: a neutral value stands for "nothing" rather than null.
    expect(unions(z.toJSONSchema(AiCoachReply, { io: 'input' }))).toBe(0)
  })
})

describe('sets said aloud', () => {
  test("the athlete's units become metric, values are bounded, 0 and empty sets dropped", () => {
    const out = setsFromAi(
      [
        set({ reps: 8, weight: 225, rpe: 8.7 }),
        set({}),
        set({ reps: null, weight: null }),
        set({ reps: 8.4, weight: -5 }),
        set({ distance: 100, timeSeconds: 75 }),
      ],
      { weightUnit: 'lb', distanceUnit: 'yd' },
    )
    expect(out).toEqual([
      { done: true, reps: 8, weight: 102.06, rpe: 8.5 },
      { done: true, reps: 8 },
      { done: true, time: 75, distance: 91.4 },
    ])
  })

  test('a known exercise by id or name; an unknown one is created, measured by what its sets carry', () => {
    const turn = coachFromAi(
      answer({
        reply: 'Logged.',
        logSets: [
          { exercise: 'back-squat', sets: sets({ reps: 5, weight: 105 }) },
          { exercise: 'Bench press', sets: sets({ reps: 8, weight: 70 }) },
          { exercise: 'Sled push', sets: sets({ distance: 20, timeSeconds: 12 }) },
          { exercise: 'Wall sit', sets: sets({ timeSeconds: 60 }) },
          { exercise: 'Plank', sets: [] },
        ],
      }),
      ctx(),
    )
    const logs = turn.proposals.flatMap((p) => (p.kind === 'log_sets' ? [p] : []))
    expect(logs.map((p) => [p.exercise.id === 'back-squat', p.isNew, p.exercise.metric])).toEqual([
      [true, false, 'weight_reps'],
      [false, false, 'weight_reps'],
      [false, true, 'distance_time'],
      [false, true, 'time'],
    ])
    expect(logs[2]?.exercise.disciplineId).toBe(GYM)
  })
})

describe('other proposals', () => {
  test('a description is proposed on an exercise of the library; an unknown one or an empty text is left out', () => {
    const turn = coachFromAi(
      answer({ describeExercise: [{ exercise: 'back-squat', description: `  Brace. ${'x'.repeat(5000)}` }] }),
      ctx(),
    )
    expect(turn.proposals).toEqual([
      {
        id: expect.any(String),
        kind: 'exercise_description',
        exercise: expect.objectContaining({ id: 'back-squat' }),
        description: expect.stringMatching(/^Brace\./),
      },
    ])
    const proposal = turn.proposals[0]
    expect(proposal?.kind === 'exercise_description' && proposal.description.length).toBe(4000)
    expect(
      coachFromAi(answer({ describeExercise: [{ exercise: 'nope', description: 'Text' }] }), ctx()).proposals,
    ).toEqual([])
    expect(
      coachFromAi(answer({ describeExercise: [{ exercise: 'back-squat', description: ' ' }] }), ctx()).proposals,
    ).toEqual([])
  })

  test('settings: only what was asked, the others unchanged', () => {
    const turn = coachFromAi(
      answer({
        updateSettings: [
          { mode: 'unchanged', weightUnit: 'lb', distanceUnit: 'unchanged', weekStart: 'sunday', language: 'fr' },
        ],
      }),
      ctx(),
    )
    expect(turn.proposals).toEqual([
      { id: expect.any(String), kind: 'settings', patch: { weightUnit: 'lb', weekStart: 0, language: 'fr' } },
    ])
  })

  test('a week of a program they do not have, or nothing asked, builds nothing: advice is a reply alone', () => {
    const turn = coachFromAi(
      answer({
        reply: 'Adjust it: you already do three squat variations on Monday.',
        adjustWeek: [{ programId: 'nope', weekNumber: 1, brief: '' }],
      }),
      ctx(),
    )
    expect(turn).toEqual({
      reply: 'Adjust it: you already do three squat variations on Monday.',
      proposals: [],
      builds: [],
    })
  })
})

describe('what the coach has built', () => {
  const ppl = {
    brief: 'Push, pull, legs with abs and shoulders on leg day; 7 exercises per session; machines and dumbbells',
    layout: 'sessions' as const,
    weeks: 0,
    daysPerWeek: 0,
    sessions: 3,
    sports: ['Gym'],
    level: 'beginner' as const,
  }

  test('a program is described, then designed by the program prompt: from scratch, or on their history', () => {
    const c = ctx()
    const { builds } = coachFromAi(answer({ createProgram: [ppl, ppl] }), c)
    expect(builds).toHaveLength(1)
    const b = builds[0]
    if (b?.kind !== 'program') throw new Error('expected a program')
    expect(b.shape).toEqual({ layout: 'sessions', sessions: 3 })
    const fresh = buildPrompt(b, c, 'Today is 2026-11-06.').prompt
    expect(fresh).toContain('Design a set of 3 distinct training sessions')
    expect(fresh).toContain('7 exercises per session; machines and dumbbells')
    const trained = buildPrompt(b, ctx({ trained: true }), 'Sessions in the last 8 weeks: 6.').prompt
    expect(trained).toContain("Base it on the athlete's own training history below.")
    expect(trained).toContain('Sessions in the last 8 weeks: 6.')

    const odd = coachFromAi(answer({ createProgram: [{ ...ppl, layout: 'weeks', weeks: 99, daysPerWeek: 0 }] }), c)
    expect(odd.builds[0]).toMatchObject({ shape: { layout: 'weeks', weeks: 4, daysPerWeek: 3 } })
  })

  test('asked for a program and goals, the turn proposes the designed program and goals, nothing applied', async () => {
    const program = {
      name: 'Push Pull Legs',
      goal: 'Simple machine work',
      weeks: [
        {
          name: 'Sessions',
          days: ['Push', 'Pull', 'Legs'].map((name) => ({
            name,
            discipline: 'Gym',
            notes: null,
            blocks: [
              {
                exercise: 'back-squat',
                newExercise: null,
                sets: 3,
                reps: 10,
                distanceMeters: null,
                durationSeconds: null,
                intensity: null,
                restSeconds: 90,
                perSet: [],
                intervalSeconds: null,
                tempo: null,
                notes: null,
              },
            ],
          })),
        },
      ],
    }
    const goal = { kind: 'frequency', exercise: null, discipline: 'Gym', volume: null, target: 3, weeks: 8, why: null }
    const model = scriptedModel((prompt) =>
      prompt.includes('You are the coach inside Cadence')
        ? answer({
            reply: 'I am designing your push, pull, legs.',
            createProgram: [ppl],
            addGoals: [{ focus: 'consistency' }],
          })
        : prompt.includes('Design a set of')
          ? program
          : { goals: [goal] },
    )
    const stages: number[] = []
    const turn = await generateCoachTurn(
      model,
      { context: ctx(), history: '' },
      [],
      { text: 'PPL, 7 exercises' },
      undefined,
      (n) => stages.push(n),
    )
    expect(stages).toEqual([2])
    expect(model.doGenerateCalls).toHaveLength(3)
    expect(turn.reply).toBe('I am designing your push, pull, legs.')
    expect(turn.failed).toBeUndefined()
    const kinds = turn.proposals.map((p) => p.kind)
    expect(kinds).toEqual(['program', 'add_goals'])
    const designed = turn.proposals[0]
    if (designed?.kind !== 'program') throw new Error('expected a program')
    expect(designed.draft.program.layout).toBe('sessions')
    expect(designed.draft.program.weeks[0]?.days.map((d) => d.name)).toEqual(['Push', 'Pull', 'Legs'])
  })

  test('a design that fails leaves the reply and the rest, with the reason', async () => {
    const model = scriptedModel((prompt) =>
      prompt.includes('You are the coach inside Cadence')
        ? answer({
            reply: 'Here you go.',
            logSets: [{ exercise: 'back-squat', sets: sets({ reps: 5, weight: 100 }) }],
            addGoals: [{ focus: '' }],
          })
        : new Error('overloaded'),
    )
    const turn = await generateCoachTurn(model, { context: ctx(), history: '' }, [], { text: 'squat 5 at 100' })
    expect(turn.reply).toBe('Here you go.')
    expect(turn.proposals.map((p) => p.kind)).toEqual(['log_sets'])
    expect(turn.failed).toBeInstanceOf(Error)
  })
})

describe('a description checked on the web', () => {
  const search: ToolSet = { web_search: tool({ description: 'search', inputSchema: z.object({}) }) }
  const usage = {
    inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  }
  const asked = answer({
    reply: 'Here it is.',
    describeExercise: [{ exercise: 'back-squat', description: 'From memory.' }],
  })
  /** The coach answers, then the search behind the description gives `found`. */
  const searching = (found: () => { text: string; urls: string[] }) =>
    new MockLanguageModelV4({
      doGenerate: async (options) => {
        const coach = JSON.stringify(options.prompt).includes('You are the coach inside Cadence')
        const { text, urls } = coach ? { text: JSON.stringify(asked), urls: [] } : found()
        return {
          content: [
            { type: 'text' as const, text },
            ...urls.map((url, i) => ({ type: 'source' as const, sourceType: 'url' as const, id: `s${i}`, url })),
          ],
          finishReason: { unified: 'stop' as const, raw: undefined },
          usage,
          warnings: [],
        }
      },
    })
  const describedBy = (turn: { proposals: readonly { kind: string; description?: string }[] }) =>
    turn.proposals.find((p) => p.kind === 'exercise_description')?.description

  test('its text comes from the search, followed by its https sources, once each', async () => {
    const model = searching(() => ({
      text: 'Checked text.',
      urls: ['https://a.example/rack', 'http://b.example/x', 'https://a.example/rack'],
    }))
    const turn = await generateCoachTurn(
      model,
      { context: ctx(), history: '' },
      [],
      { text: 'describe' },
      undefined,
      undefined,
      search,
    )
    expect(describedBy(turn)).toBe('Checked text.\n\nSources\nhttps://a.example/rack')
    expect(model.doGenerateCalls).toHaveLength(2)
    expect(model.doGenerateCalls[0]?.tools).toBeUndefined()
    expect(model.doGenerateCalls[1]?.tools?.map((t) => t.name)).toEqual(['web_search'])
  })

  test('no search tool, no search: one call, the coach’s own text', async () => {
    const model = searching(() => ({ text: 'never', urls: [] }))
    const turn = await generateCoachTurn(model, { context: ctx(), history: '' }, [], { text: 'describe' })
    expect(describedBy(turn)).toBe('From memory.')
    expect(model.doGenerateCalls).toHaveLength(1)
  })

  test('a search that fails keeps the description and says why', async () => {
    const model = searching(() => {
      throw new Error('overloaded')
    })
    const turn = await generateCoachTurn(
      model,
      { context: ctx(), history: '' },
      [],
      { text: 'describe' },
      undefined,
      undefined,
      search,
    )
    expect(describedBy(turn)).toBe('From memory.')
    expect(turn.failed).toBeInstanceOf(Error)
  })

  test('sources always fit in what a description can hold', () => {
    const urls = Array.from({ length: 8 }, (_, i) => ({ sourceType: 'url', url: `https://e.example/${i}` }))
    const out = describedWithSources('x'.repeat(5000), urls)
    expect(out.length).toBeLessThanOrEqual(4000)
    expect(out.endsWith('https://e.example/4')).toBe(true)
  })
})

describe('the conversation', () => {
  test('the model gets the rules, the language, the library, the session in progress, the screen and the history', async () => {
    setDisplayLocale('fr')
    const system = coachSystem({
      context: ctx({ settings: { ...DEFAULT_SETTINGS, weightUnit: 'lb' }, screen: 'the Goals screen' }),
      history: 'Today is 2026-11-06.',
    })
    expect(system).toContain('in French')
    expect(system).toContain('weight in lb')
    expect(system).toContain('back-squat')
    expect(system).toContain('Session in progress: "Leg day"')
    expect(system).toContain('220.5 lb 5 reps')
    expect(system).toContain('Where they are in the app as they write: the Goals screen')
    expect(system).toContain('Today is 2026-11-06.')
    expect(sessionText(undefined, IDX, { weightUnit: 'kg', distanceUnit: 'm' })).toContain('No session in progress')
  })

  test('the message goes to the model after the last turns; the answer becomes proposals', async () => {
    const model = scriptedModel(() =>
      answer({
        reply: 'Trois séries de squat notées.',
        logSets: [{ exercise: 'back-squat', sets: sets({ reps: 5, weight: 100 }, { reps: 5, weight: 100 }) }],
      }),
    )
    const turn = await generateCoachTurn(
      model,
      { context: ctx(), history: '' },
      [
        { role: 'user', text: 'Salut' },
        { role: 'assistant', text: 'Bonjour !' },
      ],
      { text: 'squat, deux séries de cinq à 100' },
    )
    expect(turn.reply).toBe('Trois séries de squat notées.')
    expect(turn.proposals).toHaveLength(1)
    const prompt = model.doGenerateCalls[0]?.prompt ?? []
    expect(prompt.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user'])
    const last = prompt.at(-1)
    expect(JSON.stringify(last)).toContain('squat, deux séries de cinq à 100')
  })
})
