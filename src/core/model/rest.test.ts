import { describe, expect, test } from 'bun:test'
import { type AiCoachReply, coachFromAi } from '../ai/coach.ts'
import { exportBackup, parseBackup } from '../storage/backup.ts'
import { memoryStore } from '../storage/store.ts'
import { ATHLETE, GYM, IDX } from '../testkit.test.ts'
import { restFor } from './program.ts'
import { DEFAULT_SETTINGS, type Exercise } from './schemas.ts'

const squat: Exercise = { id: 'sq', name: 'Squat', metric: 'weight_reps' }

describe('the rest between sets', () => {
  test('the plan, then the exercise, then its sport, then the old default', () => {
    expect(restFor({ id: 'b', exerciseId: 'sq', sets: 3, rest: 240 }, { ...squat, rest: 120 }, { rest: 60 }, 90)).toBe(
      240,
    )
    expect(restFor(undefined, { ...squat, rest: 120 }, { rest: 60 }, 90)).toBe(120)
    expect(restFor(undefined, squat, { rest: 60 }, 90)).toBe(60)
    expect(restFor(undefined, squat, {}, 90)).toBe(90)
    expect(restFor(undefined, { ...squat, rest: 0 }, { rest: 60 }, 90)).toBe(0)
  })

  test('a version 6 backup reads with no rest of its own: the settings rest stands for all', async () => {
    const v6 = { ...(await exportBackup(memoryStore())), version: 6 }
    const b = parseBackup(JSON.stringify({ ...v6, settings: { ...DEFAULT_SETTINGS, defaultRest: 120 } }))
    expect(b.version).toBe(7)
    expect(b.settings.defaultRest).toBe(120)
  })

  test('the coach sets it on an exercise or a sport, never globally', () => {
    const base = {
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
      discipline: null,
      restSeconds: null,
    }
    const gym = ATHLETE.disciplines.find((d) => d.id === GYM)?.name ?? ''
    const ai: AiCoachReply = {
      reply: 'Done.',
      actions: [
        { ...base, type: 'set_rest', exercise: 'back-squat', restSeconds: 180 },
        { ...base, type: 'set_rest', discipline: gym, restSeconds: 90.4 },
        { ...base, type: 'set_rest', discipline: 'Curling', restSeconds: 60 },
        { ...base, type: 'set_rest', exercise: 'back-squat', restSeconds: 5000 },
      ],
    }
    const turn = coachFromAi(ai, {
      library: ATHLETE,
      index: IDX,
      programs: [],
      goals: [],
      active: undefined,
      settings: DEFAULT_SETTINGS,
      today: '2026-11-06',
    })
    expect(
      turn.proposals.map((p) =>
        p.kind === 'rest' ? ['exercise' in p.target ? p.target.exercise.id : p.target.discipline.id, p.seconds] : [],
      ),
    ).toEqual([
      ['back-squat', 180],
      [GYM, 90],
    ])
  })
})
