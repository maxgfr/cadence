import { describe, expect, test } from 'bun:test'
import { instantiate, TEMPLATES } from '../demo/programs.ts'
import { entry, IDX, LIB, must, session, set } from '../testkit.test.ts'
import { addDays, daysBetween, startOfWeek } from './dates.ts'
import {
  choosableDays,
  completedDays,
  dayToStart,
  describeBlock,
  nextDay,
  programsUnderWay,
  sessionFromDay,
  suggestedWeight,
  totalDays,
  weekTodo,
} from './program.ts'
import { Exercise, Program } from './schemas.ts'
import { formatDistance, formatTime, formatWeight, fromDisplayWeight, parseTime } from './units.ts'

const metric = { weightUnit: 'kg', distanceUnit: 'm' } as const
/** Formatted values join numbers and units with no-break spaces; compare them as plain text. */
const plain = (s: string) => s.replaceAll('\u00a0', ' ')

const ALL = new Set(['gym', 'swim', 'track'] as const)

describe('demo library and programs', () => {
  test('every demo exercise is valid and ids are unique', () => {
    for (const e of LIB) expect(Exercise.safeParse(e).success).toBe(true)
    expect(new Set(LIB.map((e) => e.id)).size).toBe(LIB.length)
  })

  test('every template builds a valid program that only uses library exercises', () => {
    for (const t of TEMPLATES) {
      const p = instantiate(t, ALL, new Date('2026-10-16T08:00:00Z'))
      expect(Program.safeParse(p).success).toBe(true)
      for (const w of p.weeks)
        for (const d of w.days) for (const b of d.blocks) expect(IDX.has(b.exerciseId)).toBe(true)
    }
  })

  test('a demo program keeps a stable id; its weeks, days and blocks get fresh ones', () => {
    const t = must(TEMPLATES[0])
    const a = instantiate(t, ALL)
    const b = instantiate(t, ALL)
    expect(a.id).toBe('demo-program-beginner-full-body')
    expect(a.weeks[0]?.days[0]?.blocks[0]?.id).not.toBe(b.weeks[0]?.days[0]?.blocks[0]?.id)
  })
})

describe('library helpers', () => {
  test('numbers sort in order, and a discipline has a usual measure', async () => {
    const { sortedExercises, usualMetric } = await import('../library/exercises.ts')
    const names = sortedExercises([
      { id: 'a', name: '100 m sprint', metric: 'distance_time' },
      { id: 'b', name: '30 m sprint', metric: 'distance_time' },
      { id: 'c', name: 'A-skips', metric: 'distance_time' },
    ]).map((e) => e.name)
    expect(names).toEqual(['30 m sprint', '100 m sprint', 'A-skips'])
    expect(usualMetric(LIB, 'demo-swim')).toBe('distance_time')
    expect(usualMetric(LIB, undefined)).toBeUndefined()
  })
})

describe('describeBlock', () => {
  test('lifts, swim intervals, sprints', () => {
    expect(
      describeBlock(
        { id: 'a', exerciseId: 'back-squat', sets: 5, reps: 5, intensity: { kind: 'pct1rm', value: 80 } },
        IDX.get('back-squat'),
        metric,
      ),
    ).toBe('5×5 @80%')
    expect(
      describeBlock(
        { id: 'a', exerciseId: 'swim-free', sets: 8, distance: 50, interval: 60 },
        IDX.get('swim-free'),
        metric,
      ).replaceAll('\u00a0', ' '),
    ).toBe('8×50 m @1:00')
    expect(
      describeBlock(
        { id: 'a', exerciseId: 'sprint-60', sets: 6, intensity: { kind: 'pctmax', value: 95 }, rest: 180 },
        IDX.get('sprint-60'),
        metric,
      ).replaceAll('\u00a0', ' '),
    ).toBe('6×60 m @95% max · rest 3:00')
  })

  test('normal mode leaves out intensity and rest', () => {
    expect(
      describeBlock(
        { id: 'a', exerciseId: 'back-squat', sets: 5, reps: 5, intensity: { kind: 'pct1rm', value: 80 }, rest: 120 },
        IDX.get('back-squat'),
        metric,
        false,
      ),
    ).toBe('5×5')
  })
})

describe('schedule', () => {
  const program = instantiate(must(TEMPLATES[0]), ALL)

  test('the next day follows the furthest day done, across weeks', () => {
    expect(nextDay(program, [])).toMatchObject({ week: 0, day: 0 })
    const done = session('2026-10-01', [], { programRef: { programId: program.id, week: 0, day: 2 } })
    expect(nextDay(program, [done])).toMatchObject({ week: 1, day: 0 })
    const active = { ...done, status: 'active' as const, programRef: { programId: program.id, week: 1, day: 1 } }
    expect(nextDay(program, [done, active])).toMatchObject({ week: 1, day: 0 })
  })

  test('undefined once every day is done', () => {
    const last = program.weeks.length - 1
    const day = (program.weeks[last]?.days.length ?? 1) - 1
    const done = session('2026-10-01', [], { programRef: { programId: program.id, week: last, day } })
    expect(nextDay(program, [done])).toBeUndefined()
    expect(totalDays(program)).toBe(12)
  })

  test('a set of sessions goes round from the latest one done, and never ends', () => {
    const set = { ...program, layout: 'sessions' as const, weeks: program.weeks.slice(0, 1) }
    const ref = (day: number) => ({ programRef: { programId: set.id, week: 0, day } })
    expect(nextDay(set, [])).toMatchObject({ week: 0, day: 0 })
    const legs = session('2026-10-01', [], ref(2))
    const upper = session('2026-10-03', [], ref(0))
    expect(nextDay(set, [upper, legs])).toMatchObject({ week: 0, day: 1 })
    expect(nextDay(set, [legs])).toMatchObject({ week: 0, day: 0 })
    expect(completedDays(set, [upper, legs])).toBe(2)
    expect(choosableDays(set, [legs])).toHaveLength(3)
    expect(sessionFromDay(set, { programId: set.id, week: 0, day: 1 }, IDX, () => 100, '2026-10-16').title).toBe(
      must(set.weeks[0]?.days[1]).name,
    )
  })

  test('the week todo of a plan: the program week under way, and what is left of it and of the plan', () => {
    const ref = (week: number, day: number) => ({ programRef: { programId: program.id, week, day } })
    const before = session('2026-10-08', [], ref(0, 2))
    const monday = session('2026-10-12', [], ref(1, 1))
    const t = must(weekTodo(program, [before, monday], '2026-10-12'))
    expect(t.week).toBe(1)
    expect(t.days.map((d) => d.done !== undefined)).toEqual([false, true, false])
    expect(t.left).toBe(2)
    expect(t.programLeft).toBe(7)
    // Nothing yet this week: the week of the next day.
    expect(weekTodo(program, [before], '2026-10-12')?.week).toBe(1)
  })

  test('the same session twice in a week is done twice, and picking it again starts the one left', () => {
    // Beginner full body: Full body A, Full body B, Full body A.
    const ref = (day: number) => ({ programRef: { programId: program.id, week: 0, day } })
    const twice = [session('2026-10-12', [], ref(0)), session('2026-10-14', [], ref(0))]
    const t = must(weekTodo(program, twice, '2026-10-12'))
    expect(t.days.map((d) => d.done !== undefined)).toEqual([true, false, true])
    const once = must(weekTodo(program, twice.slice(0, 1), '2026-10-12'))
    expect(dayToStart(once, { programId: program.id, week: 0, day: 0 }).day).toBe(2)
    expect(dayToStart(once, { programId: program.id, week: 0, day: 1 }).day).toBe(1)
    // The list offers the todo's week while some of it is left.
    expect(choosableDays(program, twice.slice(0, 1), '2026-10-12').map((r) => r.week)).toEqual([0, 0, 0])
  })

  test('the week todo of a set: each session once, done when logged this week', () => {
    const set = { ...program, layout: 'sessions' as const, weeks: program.weeks.slice(0, 1) }
    const ref = (day: number) => ({ programRef: { programId: set.id, week: 0, day } })
    const t = must(weekTodo(set, [session('2026-10-05', [], ref(0)), session('2026-10-13', [], ref(1))], '2026-10-12'))
    expect(t.days.map((d) => d.done !== undefined)).toEqual([false, true, false])
    expect(t.programLeft).toBeUndefined()
  })

  test('programs under way: those trained, the latest first', () => {
    const other = { ...program, id: 'other' }
    const untouched = { ...program, id: 'untouched' }
    const s1 = session('2026-10-05', [], { programRef: { programId: program.id, week: 0, day: 0 } })
    const s2 = session('2026-10-13', [], { programRef: { programId: 'other', week: 0, day: 0 } })
    expect(programsUnderWay([program, other, untouched], [s1, s2], '2026-10-12').map((t) => t.program.id)).toEqual([
      'other',
      program.id,
    ])
  })

  test('the days to choose from are those of the current week', () => {
    const done = session('2026-10-01', [], { programRef: { programId: program.id, week: 0, day: 2 } })
    expect(choosableDays(program, [done]).map((r) => r.week)).toEqual([1, 1, 1])
  })

  test('a session from a day is pre-filled from the plan', () => {
    const s = sessionFromDay(program, { programId: program.id, week: 0, day: 0 }, IDX, () => 100, '2026-10-16')
    expect(s.status).toBe('active')
    expect(s.entries).toHaveLength(4)
    expect(s.entries[0]?.sets).toHaveLength(3)
    expect(s.entries[0]?.sets[0]).toMatchObject({ reps: 5, rpe: 7, done: false })
    expect(s.entries[0]?.planned?.exerciseId).toBe('back-squat')
  })

  test('percentage loads round to 2.5 kg from the estimated max', () => {
    expect(suggestedWeight({ id: 'a', exerciseId: 'x', sets: 1, intensity: { kind: 'pct1rm', value: 80 } }, 117)).toBe(
      92.5,
    )
    expect(
      suggestedWeight({ id: 'a', exerciseId: 'x', sets: 1, intensity: { kind: 'pct1rm', value: 80 } }, undefined),
    ).toBeUndefined()
    expect(
      suggestedWeight({ id: 'a', exerciseId: 'x', sets: 1, intensity: { kind: 'kg', value: 60 } }, undefined),
    ).toBe(60)
  })
})

describe('units and dates', () => {
  test('time formatting and parsing', () => {
    expect(plain(formatTime(7.12))).toBe('7.12 s')
    expect(plain(formatTime(65.3))).toBe('1:05.3')
    expect(plain(formatTime(3725, false))).toBe('1:02:05')
    expect(parseTime('1:05.3')).toBeCloseTo(65.3)
    expect(parseTime('12,4')).toBeCloseTo(12.4)
    expect(parseTime('abc')).toBeUndefined()
    expect(parseTime('')).toBeUndefined()
  })

  test('weights and distances', () => {
    expect(plain(formatWeight(100, 'kg'))).toBe('100 kg')
    expect(plain(formatWeight(100, 'lb'))).toBe('220.5 lb')
    expect(fromDisplayWeight(220.462262, 'lb')).toBeCloseTo(100, 5)
    expect(plain(formatDistance(1500, 'm'))).toBe('1,500 m')
    expect(plain(formatDistance(100, 'yd'))).toBe('109 yd')
    expect(plain(formatDistance(12_000, 'm'))).toBe('12 km')
  })

  test('calendar days', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    expect(startOfWeek('2026-10-16', 1)).toBe('2026-10-12')
    expect(startOfWeek('2026-10-16', 0)).toBe('2026-10-11')
  })

  test('fixture sanity', () => {
    expect(entry('dip', [set()]).sets[0]?.done).toBe(true)
  })
})
