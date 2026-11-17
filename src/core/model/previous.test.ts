import { describe, expect, test } from 'bun:test'
import { lastPerformance } from '../stats/metrics.ts'
import { entry, GYM, IDX, must, SWIM, session, set } from '../testkit.test.ts'
import { entriesFromSession, previousSessionFor } from './program.ts'

const squat = must(IDX.get('back-squat'))
const bench = must(IDX.get('bench-press'))
const now = { date: '2026-11-10', startedAt: '2026-11-10T18:00:00.000Z' }

describe('a free session from the last one', () => {
  const push = session('2026-11-08', [entry(bench.id, [set({ weight: 60, reps: 8 })])], { title: 'Push' })
  const legs = session('2026-11-09', [entry(squat.id, [set({ weight: 100, reps: 5 })])], { title: 'Legs' })
  const swim = session('2026-11-09', [entry('freestyle', [set({ distance: 400, time: 480 })])], {
    disciplineId: SWIM,
    startedAt: '2026-11-09T20:00:00.000Z',
  })
  const active = session('2026-11-10', [entry(squat.id, [set()])], { status: 'active' })
  const empty = session('2026-11-09', [], { startedAt: '2026-11-09T21:00:00.000Z' })
  const later = session('2026-11-11', [entry(bench.id, [set({ weight: 70, reps: 5 })])])
  const sessions = [push, legs, swim, active, empty, later]

  test('is the latest finished one of the same discipline before it, with exercises', () => {
    expect(previousSessionFor(sessions, GYM, now)?.id).toBe(legs.id)
    expect(previousSessionFor(sessions, SWIM, now)?.id).toBe(swim.id)
    expect(previousSessionFor(sessions, GYM, { date: '2026-11-09' })?.id).toBe(push.id)
    expect(previousSessionFor(sessions, undefined, now)).toBeUndefined()
    const none = session('2026-11-07', [entry(squat.id, [set()])], { disciplineId: undefined })
    expect(previousSessionFor([...sessions, none], undefined, now)?.id).toBe(none.id)
  })

  test('gives its exercises still in the library, in order, once each, with last time’s sets and no plan', () => {
    const past = session('2026-11-09', [
      entry(squat.id, [set({ weight: 100, reps: 5 })]),
      entry('gone', [set({ reps: 5 })]),
      entry(bench.id, [set({ weight: 60, reps: 8 })]),
      entry(squat.id, [set({ weight: 80, reps: 8 })]),
    ])
    const entries = entriesFromSession(past, IDX, (id) => lastPerformance([past], id, now))
    expect(entries.map((e) => e.exerciseId)).toEqual([squat.id, bench.id])
    expect(entries.every((e) => e.planned === undefined)).toBe(true)
    expect(entries[0]?.sets).toEqual([
      { done: false, weight: 100, reps: 5 },
      { done: false, weight: 80, reps: 8 },
    ])
    expect(entries[1]?.sets).toEqual([{ done: false, weight: 60, reps: 8 }])
    expect(new Set(entries.map((e) => e.id)).size).toBe(2)
  })
})
