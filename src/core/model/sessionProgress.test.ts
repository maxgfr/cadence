import { describe, expect, test } from 'bun:test'
import { entry, set } from '../testkit.test.ts'
import { CLOCK_LIMIT_MS, sessionClock, sessionPosition } from './sessionProgress.ts'

const startedAt = '2026-03-02T18:00:00.000Z'
const start = Date.parse(startedAt)
const at = (ms: number) => sessionClock({ status: 'active', startedAt }, start + ms)

describe('the running time of a session', () => {
  test('counts up in m:ss, then h:mm:ss past an hour', () => {
    expect(at(0)?.text).toBe('0:00')
    expect(at(999)?.text).toBe('0:00')
    expect(at(65_400)).toEqual({ seconds: 65, minutes: 1, text: '1:05' })
    expect(at(23 * 60_000 + 4_000)?.text).toBe('23:04')
    expect(at(3600_000 + 2 * 60_000 + 3_000)).toEqual({ seconds: 3723, minutes: 62, text: '1:02:03' })
  })

  test('runs only for a session under way', () => {
    expect(sessionClock({ status: 'done', startedAt }, start + 60_000)).toBeUndefined()
    expect(sessionClock({ status: 'active' }, start)).toBeUndefined()
    expect(sessionClock({ status: 'active', startedAt: 'not a date' }, start)).toBeUndefined()
  })

  test('a session left open and opened again days later shows no clock', () => {
    expect(at(CLOCK_LIMIT_MS - 1000)?.text).toBe('5:59:59')
    expect(at(CLOCK_LIMIT_MS)).toBeUndefined()
    expect(at(73 * 3600_000 + 12 * 60_000)).toBeUndefined()
  })

  test('a start a little ahead of this clock reads as just started; far ahead, as no clock', () => {
    expect(at(-20_000)?.text).toBe('0:00')
    expect(at(-3600_000)).toBeUndefined()
  })
})

describe('where the athlete is in a session', () => {
  test('on the first exercise with a set still to tick', () => {
    const a = entry('a', [set(), set()])
    const b = entry('b', [set(), set({ done: false })])
    const c = entry('c', [set({ done: false })])
    expect(sessionPosition([a, b, c])).toEqual({ kind: 'at', index: 2, total: 3, entryId: b.id })
    expect(sessionPosition([c, a, b])).toEqual({ kind: 'at', index: 1, total: 3, entryId: c.id })
  })

  test('an exercise with no set is passed over', () => {
    const empty = entry('a', [])
    const b = entry('b', [set({ done: false })])
    expect(sessionPosition([empty, b])).toEqual({ kind: 'at', index: 2, total: 2, entryId: b.id })
  })

  test('every set ticked is done; no exercise or no set says nothing', () => {
    expect(sessionPosition([entry('a', [set()]), entry('b', [set()])])).toEqual({ kind: 'done', total: 2 })
    expect(sessionPosition([])).toEqual({ kind: 'none' })
    expect(sessionPosition([entry('a', [])])).toEqual({ kind: 'none' })
  })
})
