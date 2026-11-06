import { afterEach, describe, expect, test } from 'bun:test'
import { MockLanguageModelV4 } from 'ai/test'
import { setDisplayLocale } from '../i18n/locale.ts'
import { DEFAULT_SETTINGS, type Session } from '../model/schemas.ts'
import { ATHLETE, GYM, IDX } from '../testkit.test.ts'
import { type AiCoachReply, type CoachContext, coachFromAi, coachSystem, sessionText, setsFromAi } from './coach.ts'
import { generateCoachTurn } from './features.ts'

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

type Action = AiCoachReply['actions'][number]
const action = (p: Partial<Action>): Action => ({
  type: 'log_sets',
  exercise: null,
  sets: null,
  exercises: null,
  program: null,
  layout: null,
  programId: null,
  weekNumber: null,
  week: null,
  goals: null,
  settings: null,
  ...p,
})
const set = (p: Partial<NonNullable<Action['sets']>[number]>) => ({
  reps: null,
  weight: null,
  timeSeconds: null,
  distance: null,
  rpe: null,
  ...p,
})

describe('sets said aloud', () => {
  test("the athlete's units become metric, values are bounded, empty sets dropped", () => {
    const sets = setsFromAi(
      [
        set({ reps: 8, weight: 225, rpe: 8.7 }),
        set({}),
        set({ reps: 8.4, weight: -5 }),
        set({ distance: 100, timeSeconds: 75 }),
      ],
      { weightUnit: 'lb', distanceUnit: 'yd' },
    )
    expect(sets).toEqual([
      { done: true, reps: 8, weight: 102.06, rpe: 8.5 },
      { done: true, reps: 8 },
      { done: true, time: 75, distance: 91.4 },
    ])
  })

  test('a known exercise by id or name; an unknown one is created, measured by what its sets carry', () => {
    const turn = coachFromAi(
      {
        reply: 'Logged.',
        actions: [
          action({ exercise: 'back-squat', sets: [set({ reps: 5, weight: 105 })] }),
          action({ exercise: 'Bench press', sets: [set({ reps: 8, weight: 70 })] }),
          action({ exercise: 'Sled push', sets: [set({ distance: 20, timeSeconds: 12 })] }),
          action({ exercise: 'Wall sit', sets: [set({ timeSeconds: 60 })] }),
          action({ exercise: 'Plank', sets: [] }),
        ],
      },
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
  test('settings: only what was asked, within bounds', () => {
    const turn = coachFromAi(
      {
        reply: 'Done.',
        actions: [
          action({
            type: 'update_settings',
            settings: {
              mode: null,
              weightUnit: 'lb',
              distanceUnit: null,
              weekStartsOnMonday: false,
              restSeconds: 5000,
              language: 'fr',
            },
          }),
        ],
      },
      ctx(),
    )
    expect(turn.proposals).toEqual([
      { id: expect.any(String), kind: 'settings', patch: { weightUnit: 'lb', weekStart: 0, language: 'fr' } },
    ])
  })

  test('a week of a program they do not have, or an empty answer, proposes nothing: advice is a reply alone', () => {
    const turn = coachFromAi(
      {
        reply: 'Adjust it: you already do three squat variations on Monday.',
        actions: [
          action({ type: 'adjust_week', programId: 'nope', weekNumber: 1, week: { name: 'W1', days: [] } }),
          action({ type: 'add_goals', goals: [] }),
        ],
      },
      ctx(),
    )
    expect(turn).toEqual({ reply: 'Adjust it: you already do three squat variations on Monday.', proposals: [] })
  })
})

describe('the conversation', () => {
  test('the model gets the rules, the language, the library, the session in progress and the history', async () => {
    setDisplayLocale('fr')
    const system = coachSystem({
      context: ctx({ settings: { ...DEFAULT_SETTINGS, weightUnit: 'lb' } }),
      history: 'Today is 2026-11-06.',
    })
    expect(system).toContain('in French')
    expect(system).toContain('weight in lb')
    expect(system).toContain('back-squat')
    expect(system).toContain('Session in progress: "Leg day"')
    expect(system).toContain('220.5 lb 5 reps')
    expect(system).toContain('Today is 2026-11-06.')
    expect(sessionText(undefined, IDX, { weightUnit: 'kg', distanceUnit: 'm' })).toContain('No session in progress')
  })

  test('a voice note goes to the model as a file part, after the last turns; the answer becomes proposals', async () => {
    const answer: AiCoachReply = {
      reply: 'Trois séries de squat notées.',
      actions: [
        action({ exercise: 'back-squat', sets: [set({ reps: 5, weight: 100 }), set({ reps: 5, weight: 100 })] }),
      ],
    }
    const model = new MockLanguageModelV4({
      doGenerate: {
        content: [{ type: 'text', text: JSON.stringify(answer) }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 1, text: 1, reasoning: undefined },
        },
        warnings: [],
      },
    })
    const turn = await generateCoachTurn(
      model,
      { context: ctx(), history: '' },
      [
        { role: 'user', text: 'Salut' },
        { role: 'assistant', text: 'Bonjour !' },
      ],
      { audio: { data: new Uint8Array([1, 2, 3]), mediaType: 'audio/wav' } },
    )
    expect(turn.reply).toBe('Trois séries de squat notées.')
    expect(turn.proposals).toHaveLength(1)
    const prompt = model.doGenerateCalls[0]?.prompt ?? []
    expect(prompt.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user'])
    const last = prompt.at(-1)
    expect(JSON.stringify(last)).toContain('audio/wav')
  })
})
