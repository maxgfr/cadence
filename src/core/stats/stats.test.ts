import { describe, expect, test } from 'bun:test'
import { entry, IDX, must, session, set } from '../testkit.test.ts'
import { currentE1rm, epley, exerciseSeries } from './metrics.ts'
import { currentRecords, recordHistory, recordsOf } from './records.ts'
import { consistency, goalProgress, linearFit, sessionAdherence, weeklyVolume, weekStreak } from './trends.ts'

const squat = must(IDX.get('back-squat'))
const sprint60 = must(IDX.get('sprint-60'))

describe('epley', () => {
  test('one rep is the weight itself', () => expect(epley(100, 1)).toBe(100))
  test('five reps', () => expect(epley(100, 5)).toBeCloseTo(116.67, 2))
  test('no estimate past 12 reps or without load', () => {
    expect(epley(100, 15)).toBeUndefined()
    expect(epley(0, 5)).toBeUndefined()
  })
})

describe('records', () => {
  const s1 = session('2026-09-01', [
    entry('back-squat', [set({ weight: 100, reps: 5 }), set({ weight: 105, reps: 3 })]),
  ])
  const s2 = session('2026-09-08', [entry('back-squat', [set({ weight: 110, reps: 3 })])])
  const s3 = session('2026-09-15', [entry('back-squat', [set({ weight: 100, reps: 3 })])])
  const s4 = session('2026-09-16', [
    entry('sprint-60', [set({ distance: 60, time: 8.1 }), set({ distance: 60, time: 7.9 })]),
  ])
  const s5 = session('2026-09-20', [
    entry('sprint-60', [set({ distance: 60, time: 8.0 }), set({ distance: 30, time: 4.2 })]),
  ])
  const all = [s3, s1, s2, s4, s5]

  test('session best per exercise, oldest first', () => {
    const series = exerciseSeries(all, squat)
    expect(series.map((p) => p.date)).toEqual(['2026-09-01', '2026-09-08', '2026-09-15'])
    expect(series[0]?.value).toBeCloseTo(116.67, 2)
    expect(series[1]?.value).toBeCloseTo(121, 2)
  })

  test('a record is set only when it beats every earlier session', () => {
    const h = recordHistory(all, IDX)
    const squats = h.filter((r) => r.exerciseId === 'back-squat')
    expect(squats.map((r) => r.sessionId)).toEqual([s1.id, s2.id])
    expect(squats[0]?.previous).toBeUndefined()
    expect(squats[1]?.previous).toBeCloseTo(116.67, 2)
  })

  test('lower is better for sprint times, and only full-distance efforts count', () => {
    const series = exerciseSeries(all, sprint60)
    expect(series.map((p) => p.value)).toEqual([7.9, 8.0])
    expect(recordsOf(s5.id, all, IDX)).toEqual([])
    expect(currentRecords(all, IDX).find((r) => r.exerciseId === 'sprint-60')?.value).toBe(7.9)
  })

  test('sets not marked done are ignored', () => {
    const s = session('2026-10-01', [entry('back-squat', [set({ weight: 200, reps: 1, done: false })])])
    expect(exerciseSeries([s], squat)).toEqual([])
  })

  test('current e1RM: best of the recent window, else the last known', () => {
    expect(currentE1rm(all, squat, '2026-09-20')).toBeCloseTo(121, 2)
    expect(currentE1rm(all, squat, '2027-06-01')).toBeCloseTo(110, 2)
    expect(currentE1rm(all, sprint60, '2026-09-20')).toBeUndefined()
  })
})

describe('weekly volume', () => {
  test('tonnage, swim and run metres, sets per muscle, by Monday-first week', () => {
    const sessions = [
      session('2026-10-12', [entry('back-squat', [set({ weight: 100, reps: 5 }), set({ weight: 100, reps: 5 })])]),
      session(
        '2026-10-14',
        [entry('swim-free', [set({ distance: 400, time: 400 }), set({ distance: 100, time: 90 })])],
        {
          discipline: 'swim',
        },
      ),
      session('2026-10-18', [entry('sprint-100', [set({ time: 12.5 })])], { discipline: 'run' }),
      session('2026-10-05', [entry('deadlift', [set({ weight: 140, reps: 3 })])]),
    ]
    const v = weeklyVolume(sessions, IDX, '2026-10-16', 1, 2)
    expect(v.map((w) => w.week)).toEqual(['2026-10-05', '2026-10-12'])
    expect(v[0]?.tonnage).toBe(420)
    expect(v[1]?.tonnage).toBe(1000)
    expect(v[1]?.swimMeters).toBe(500)
    expect(v[1]?.runMeters).toBe(100)
    expect(v[1]?.setsByMuscle.quads).toBe(2)
    expect(v[1]?.sessions).toBe(3)
  })

  test('Sunday-first weeks', () => {
    const v = weeklyVolume([session('2026-10-18', [])], IDX, '2026-10-18', 0, 1)
    expect(v[0]?.week).toBe('2026-10-18')
    expect(v[0]?.sessions).toBe(1)
  })
})

describe('consistency', () => {
  test('one cell per day with a level by minutes', () => {
    const days = consistency(
      [session('2026-10-14', [], { duration: 30 }), session('2026-10-15', [], { duration: 120 })],
      '2026-10-16',
      1,
      2,
    )
    expect(days).toHaveLength(14)
    expect(days[0]?.date).toBe('2026-10-05')
    expect(days.find((d) => d.date === '2026-10-14')?.level).toBe(1)
    expect(days.find((d) => d.date === '2026-10-15')?.level).toBe(4)
    expect(days.find((d) => d.date === '2026-10-16')?.level).toBe(0)
  })

  test('week streak counts back from this week, or last week while this one is empty', () => {
    const s = [session('2026-10-01', []), session('2026-10-08', [])]
    expect(weekStreak(s, '2026-10-16', 1)).toBe(2)
    expect(weekStreak(s, '2026-10-30', 1)).toBe(0)
  })
})

describe('adherence', () => {
  test('done planned sets over planned sets, capped per block', () => {
    const e = entry('back-squat', [set(), set(), set({ done: false }), set()])
    e.planned = { id: 'b', exerciseId: 'back-squat', sets: 3 }
    expect(sessionAdherence(session('2026-10-01', [e]))).toBe(1)
    const e2 = entry('bench-press', [set(), set({ done: false })])
    e2.planned = { id: 'c', exerciseId: 'bench-press', sets: 2 }
    expect(sessionAdherence(session('2026-10-01', [e, e2]))).toBeCloseTo(4 / 5)
    expect(sessionAdherence(session('2026-10-01', [entry('dip', [set()])]))).toBeUndefined()
  })
})

describe('goals', () => {
  test('linear fit', () => {
    const f = linearFit([
      { x: 0, y: 1 },
      { x: 1, y: 3 },
      { x: 2, y: 5 },
    ])
    expect(f?.slope).toBeCloseTo(2)
    expect(f?.intercept).toBeCloseTo(1)
    expect(linearFit([{ x: 1, y: 1 }])).toBeUndefined()
    expect(
      linearFit([
        { x: 1, y: 1 },
        { x: 1, y: 2 },
      ]),
    ).toBeUndefined()
  })

  test('e1RM goal: progress from the start value and a projection to the deadline', () => {
    const sessions = [
      session('2026-09-01', [entry('back-squat', [set({ weight: 100, reps: 1 })])]),
      session('2026-09-15', [entry('back-squat', [set({ weight: 105, reps: 1 })])]),
      session('2026-09-29', [entry('back-squat', [set({ weight: 110, reps: 1 })])]),
    ]
    const goal = {
      id: 'g',
      kind: 'e1rm' as const,
      exerciseId: 'back-squat',
      target: 120,
      deadline: '2026-10-27',
      createdAt: '2026-09-01T10:00:00Z',
    }
    const p = goalProgress(goal, sessions, IDX, '2026-09-29', 1)
    expect(p.start).toBe(100)
    expect(p.current).toBe(110)
    expect(p.fraction).toBeCloseTo(0.5)
    expect(p.projection?.value).toBeCloseTo(120, 5)
    expect(p.onTrack).toBe(true)
    expect(p.daysLeft).toBe(28)
  })

  test('best-time goal: lower is better and reaching it is achieved', () => {
    const sessions = [
      session('2026-09-01', [entry('sprint-100', [set({ time: 13 })])]),
      session('2026-09-20', [entry('sprint-100', [set({ time: 12.4 })])]),
    ]
    const goal = {
      id: 'g',
      kind: 'best_time' as const,
      exerciseId: 'sprint-100',
      target: 12.5,
      deadline: '2026-12-01',
      createdAt: '2026-08-30T10:00:00Z',
    }
    const p = goalProgress(goal, sessions, IDX, '2026-09-21', 1)
    expect(p.lowerIsBetter).toBe(true)
    expect(p.achieved).toBe(true)
    expect(p.fraction).toBe(1)
    expect(p.projection).toBeUndefined()
  })

  test('frequency goal counts sessions per week', () => {
    const sessions = [session('2026-10-12', []), session('2026-10-13', []), session('2026-10-06', [])]
    const goal = {
      id: 'g',
      kind: 'frequency' as const,
      target: 3,
      deadline: '2026-12-01',
      createdAt: '2026-10-01T10:00:00Z',
    }
    const p = goalProgress(goal, sessions, IDX, '2026-10-14', 1)
    expect(p.current).toBe(2)
    expect(p.achieved).toBe(false)
  })
})
