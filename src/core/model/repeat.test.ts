import { describe, expect, test } from 'bun:test'
import { draftWeekFromAi } from '../ai/program.ts'
import { lastPerformance } from '../stats/metrics.ts'
import { ATHLETE, entry, IDX, must, session, set } from '../testkit.test.ts'
import {
  currentRef,
  dayToStart,
  describeSets,
  locate,
  nextDay,
  plannedSets,
  replaceBlockExercise,
  sessionFromDay,
  setsFromLast,
  swapEntryExercise,
  weekTodo,
} from './program.ts'
import type { Block, Day, Entry, Program } from './schemas.ts'

const metric = { weightUnit: 'kg', distanceUnit: 'm' } as const
const plain = (s: string) => s.replaceAll('\u00a0', ' ')
const squat = must(IDX.get('back-squat'))
const bench = must(IDX.get('bench-press'))
const plank = must(IDX.get('plank'))
const pullUp = must(IDX.get('pull-up'))

const block = (p: Partial<Block> = {}): Block => ({ id: 'b', exerciseId: squat.id, sets: 3, reps: 5, ...p })
const day = (id: string, name = id): Day => ({ id, name, blocks: [block({ id: `${id}-b` })] })
const program = (days: Day[], p: Partial<Program> = {}): Program => ({
  id: 'p',
  name: 'Plan',
  goal: '',
  source: 'manual',
  weeks: [{ id: 'w', days }],
  createdAt: 'x',
  updatedAt: 'x',
  ...p,
})
const ref = (d: number, dayId?: string) => ({ programId: 'p', week: 0, day: d, ...(dayId ? { dayId } : {}) })
const before = { date: '2026-11-08', startedAt: '2026-11-08T18:00:00.000Z' }

describe('what was done last time', () => {
  const at = (date: string, weight: number, startedAt?: string) =>
    session(date, [entry(squat.id, [set({ weight, reps: 5 })])], startedAt ? { startedAt } : {})

  test('the latest finished session before this one, whatever the order they are stored in', () => {
    const last = lastPerformance([at('2026-11-05', 105), at('2026-11-01', 100)], squat.id, before)
    expect(last?.date).toBe('2026-11-05')
    expect(last?.sets[0]?.weight).toBe(105)
  })

  test('a second session the same day sees the first; a later one is not "before"', () => {
    const morning = at('2026-11-08', 110, '2026-11-08T08:00:00.000Z')
    const night = at('2026-11-08', 120, '2026-11-08T20:00:00.000Z')
    expect(lastPerformance([morning, night], squat.id, before)?.sets[0]?.weight).toBe(110)
  })

  test('only sets ticked in finished sessions count', () => {
    const skipped = session('2026-11-07', [entry(squat.id, [set({ weight: 140, reps: 5, done: false })])])
    const active = session('2026-11-07', [entry(squat.id, [set({ weight: 150, reps: 5 })])], { status: 'active' })
    expect(lastPerformance([at('2026-11-01', 100), skipped, active], squat.id, before)?.sets[0]?.weight).toBe(100)
    expect(lastPerformance([skipped, active], squat.id, before)).toBeUndefined()
  })

  test('reads as one short line, in the athlete units', () => {
    expect(plain(describeSets([set({ weight: 60, reps: 8 }), set({ weight: 60, reps: 8 })], squat, metric))).toBe(
      '2×8 · 60 kg',
    )
    expect(plain(describeSets([set({ weight: 60, reps: 8 }), set({ weight: 62.5, reps: 6 })], squat, metric))).toBe(
      '1×8 · 60 kg, 1×6 · 62.5 kg',
    )
    expect(describeSets([set({ reps: 10 }), set({ reps: 10 })], pullUp, metric)).toBe('2×10')
    expect(describeSets([set({ time: 65 }), set({ time: 65 })], plank, metric)).toContain('2×')
  })
})

describe('starting from last time', () => {
  const last = { date: '2026-11-05', sets: [set({ weight: 60, reps: 5 }), set({ weight: 62.5, reps: 4 })] }

  test('the load lifted last time comes first, set by set, over the load of the plan; reps stay the plan’s', () => {
    const sets = plannedSets(block({ intensity: { kind: 'kg', value: 100 } }), squat, undefined, last)
    expect(sets.map((s) => s.weight)).toEqual([60, 62.5, 62.5])
    expect(sets.map((s) => s.reps)).toEqual([5, 5, 5])
    expect(sets.every((s) => !s.done)).toBe(true)
    const pct = plannedSets(block({ intensity: { kind: 'pct1rm', value: 80 } }), squat, 200, last)
    expect(pct[0]?.weight).toBe(60)
  })

  test('with no history the plan still fills it', () => {
    const sets = plannedSets(block({ intensity: { kind: 'pct1rm', value: 80 } }), squat, 200)
    expect(sets[0]?.weight).toBe(160)
    expect(plannedSets(block(), squat, undefined)[0]?.weight).toBeUndefined()
  })

  test('sessionFromDay asks for last time per exercise and names its day', () => {
    const p = program([day('d1')])
    const s = sessionFromDay(
      p,
      ref(0),
      IDX,
      () => undefined,
      '2026-11-08',
      new Date(),
      () => last,
    )
    expect(s.entries[0]?.sets[0]?.weight).toBe(60)
    expect(s.programRef).toEqual(ref(0, 'd1'))
  })

  test('an exercise added by hand repeats last time, none ticked; a time or a distance starts empty', () => {
    expect(setsFromLast(squat, last)).toEqual([
      { done: false, weight: 60, reps: 5 },
      { done: false, weight: 62.5, reps: 4 },
    ])
    expect(setsFromLast(pullUp, { date: 'x', sets: [set({ reps: 12 })] })).toEqual([{ done: false, reps: 12 }])
    expect(setsFromLast(plank, { date: 'x', sets: [set({ time: 60 })] })).toEqual([{ done: false }])
    expect(setsFromLast(squat, undefined)).toEqual([{ done: false }])
  })
})

describe('replacing an exercise', () => {
  const last = { date: 'x', sets: [set({ weight: 40, reps: 8 })] }
  const planned: Entry = {
    id: 'e',
    exerciseId: squat.id,
    planned: block({ intensity: { kind: 'kg', value: 100 } }),
    sets: [set({ weight: 100, reps: 5 }), set({ weight: 100, reps: 5, done: false })],
  }

  test('measured the same way: ticked sets and the plan stay, the rest takes the new load, the kilos do not follow', () => {
    const e = swapEntryExercise(planned, squat, bench, last)
    expect(e.exerciseId).toBe(bench.id)
    expect(e.planned?.exerciseId).toBe(bench.id)
    expect(e.planned?.intensity).toBeUndefined()
    expect(e.planned?.sets).toBe(3)
    expect(e.sets).toEqual([
      { weight: 100, reps: 5, done: true },
      { weight: 40, reps: 5, done: false },
    ])
  })

  test('with no history on the new exercise, the old load does not linger', () => {
    expect(swapEntryExercise(planned, squat, bench, undefined).sets[1]).toEqual({ reps: 5, done: false })
  })

  test('a percentage still means something on the new exercise', () => {
    const pct = { ...planned, planned: block({ intensity: { kind: 'pct1rm', value: 80 } }) }
    expect(swapEntryExercise(pct, squat, bench, last).planned?.intensity?.kind).toBe('pct1rm')
  })

  test('measured differently: the plan goes, as many sets, nothing carried over', () => {
    const e = swapEntryExercise(planned, squat, plank, undefined)
    expect(e.exerciseId).toBe(plank.id)
    expect(e.planned).toBeUndefined()
    expect(e.sets).toEqual([{ done: false }, { done: false }])
  })

  test('the program can follow, on that session only; a block gone since is reported', () => {
    const p = program([
      { ...day('d1'), blocks: [block({ id: 'x', intensity: { kind: 'kg', value: 100 } })] },
      { ...day('d2'), blocks: [block({ id: 'y' })] },
    ])
    const next = must(replaceBlockExercise(p, ref(0, 'd1'), 'x', bench.id))
    const [d1, d2] = next.weeks[0]?.days ?? []
    expect(d1?.blocks[0]?.exerciseId).toBe(bench.id)
    expect(d1?.blocks[0]?.intensity).toBeUndefined()
    expect(d2?.blocks[0]?.exerciseId).toBe(squat.id)
    expect(replaceBlockExercise(p, ref(0, 'd1'), 'gone', bench.id)).toBeUndefined()
    expect(replaceBlockExercise(p, ref(0, 'deleted'), 'x', bench.id)).toBeUndefined()
  })
})

describe('sessions follow their day when the program changes', () => {
  const p = program([day('a'), day('b'), day('c')])
  const on = (d: number, dayId?: string) => session('2026-11-03', [], { programRef: ref(d, dayId) })

  test('found by id wherever it moved; gone means gone; no id reads by position', () => {
    expect(locate(p, ref(0, 'c'))).toEqual({ week: 0, day: 2 })
    expect(locate(p, ref(1, 'gone'))).toBeUndefined()
    expect(locate(p, ref(1))).toEqual({ week: 0, day: 1 })
  })

  test('deleting a day keeps the others ticked where they belong', () => {
    const edited = program([day('b'), day('c')])
    const todo = must(weekTodo(edited, [on(1, 'b'), on(0, 'a')], '2026-11-02'))
    expect(todo.days.map((d) => d.done !== undefined)).toEqual([true, false])
    expect(nextDay(edited, [on(1, 'b')])).toMatchObject({ day: 1 })
  })

  test('a session from before version 8 still ticks by position', () => {
    expect(must(weekTodo(p, [on(1)], '2026-11-02')).days.map((d) => d.done !== undefined)).toEqual([false, true, false])
  })

  test('the session in progress is shown on its day, or on none once it is deleted', () => {
    expect(currentRef([program([day('b')])], ref(1, 'b'))).toMatchObject({ day: 0 })
    expect(currentRef([program([day('b')])], ref(1, 'a'))).toBeUndefined()
    expect(currentRef([], ref(1, 'a'))).toBeUndefined()
    expect(currentRef([p], undefined)).toBeUndefined()
  })

  test('a day done can be started again, without a twin to move to', () => {
    const todo = must(weekTodo(p, [on(0, 'a')], '2026-11-02'))
    expect(todo.days[0]?.done).toBeDefined()
    expect(dayToStart(todo, ref(0))).toEqual(ref(0))
  })

  test('a second go at a day leaves the week and the plan where they were', () => {
    const twice = [on(0, 'a'), on(0, 'a')]
    const todo = must(weekTodo(p, twice, '2026-11-02'))
    expect(todo.left).toBe(2)
    expect(nextDay(p, twice)).toMatchObject({ day: 1 })
  })

  test('a week the coach rewrites keeps its days, so what was logged on them stays ticked', () => {
    const ai = {
      name: 'New week',
      days: [
        {
          name: 'New A',
          discipline: '',
          notes: '',
          blocks: [
            {
              exercise: squat.id,
              sets: 3,
              reps: 5,
              distanceMeters: 0,
              durationSeconds: 0,
              intensityKind: 'none',
              intensityValue: 0,
              restSeconds: 0,
              intervalSeconds: 0,
              tempo: '',
              notes: '',
            },
          ],
        },
      ],
    }
    const draft = draftWeekFromAi(ai as never, p, 0, ATHLETE)
    expect(draft.program.weeks[0]?.days[0]?.id).toBe('a')
  })
})
