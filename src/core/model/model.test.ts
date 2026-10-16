import { describe, expect, test } from 'bun:test'
import { instantiate, TEMPLATES } from '../library/templates.ts'
import { entry, IDX, LIB, must, session, set } from '../testkit.test.ts'
import { addDays, daysBetween, startOfWeek } from './dates.ts'
import { describeBlock, nextDay, sessionFromDay, suggestedWeight, totalDays } from './program.ts'
import { Exercise, Program } from './schemas.ts'
import { formatDistance, formatTime, formatWeight, fromDisplayWeight, parseTime } from './units.ts'

const metric = { weightUnit: 'kg', distanceUnit: 'm' } as const
/** Formatted values join numbers and units with no-break spaces; compare them as plain text. */
const plain = (s: string) => s.replaceAll('\u00a0', ' ')

describe('library and templates', () => {
  test('every built-in exercise is valid and ids are unique', () => {
    for (const e of LIB) expect(Exercise.safeParse(e).success).toBe(true)
    expect(new Set(LIB.map((e) => e.id)).size).toBe(LIB.length)
  })

  test('every template builds a valid program that only uses library exercises', () => {
    for (const t of TEMPLATES) {
      const p = instantiate(t, new Date('2026-10-16T08:00:00Z'))
      expect(Program.safeParse(p).success).toBe(true)
      for (const w of p.weeks)
        for (const d of w.days) for (const b of d.blocks) expect(IDX.has(b.exerciseId)).toBe(true)
    }
  })

  test('two instantiations never share ids', () => {
    const t = must(TEMPLATES[0])
    const a = instantiate(t)
    const b = instantiate(t)
    expect(a.id).not.toBe(b.id)
    expect(a.weeks[0]?.days[0]?.blocks[0]?.id).not.toBe(b.weeks[0]?.days[0]?.blocks[0]?.id)
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
  const program = instantiate(must(TEMPLATES[0]))

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
