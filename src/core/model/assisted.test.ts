import { describe, expect, test } from 'bun:test'
import { isAssisted } from '../library/search.ts'
import { IDX, must, set } from '../testkit.test.ts'
import { describeSets, plannedSets, setsFromLast, swapEntryExercise } from './program.ts'
import type { Entry, Exercise } from './schemas.ts'

const metric = { weightUnit: 'kg', distanceUnit: 'm' } as const
const plain = (s: string) => s.replaceAll('\u00a0', ' ')
const assistedDip: Exercise = { id: 'preset-assisted-dip', name: 'Assisted dip machine', metric: 'reps' }
const pullUp = must(IDX.get('pull-up'))
const last = { date: 'x', sets: [set({ weight: 20, reps: 8 }), set({ weight: 15, reps: 6 })] }

describe('an assisted machine', () => {
  test('is known by its preset id or by its name in any language, when counted in reps', () => {
    expect(isAssisted(assistedDip)).toBe(true)
    expect(isAssisted({ id: 'mine', name: 'Traction assistée à la machine', metric: 'reps' })).toBe(true)
    expect(isAssisted({ ...assistedDip, metric: 'time' })).toBe(false)
    expect(isAssisted(pullUp)).toBe(false)
  })

  test('carries its counterweight to the next time; a plain reps exercise drops it', () => {
    expect(setsFromLast(assistedDip, last)).toEqual([
      { done: false, weight: 20, reps: 8 },
      { done: false, weight: 15, reps: 6 },
    ])
    expect(setsFromLast(pullUp, last)).toEqual([
      { done: false, reps: 8 },
      { done: false, reps: 6 },
    ])
  })

  test('a planned day takes the counterweight of last time', () => {
    const sets = plannedSets({ id: 'b', exerciseId: assistedDip.id, sets: 2, reps: 8 }, assistedDip, undefined, last)
    expect(sets.map((s) => s.weight)).toEqual([20, 15])
    const plainSets = plannedSets({ id: 'b', exerciseId: pullUp.id, sets: 2, reps: 8 }, pullUp, undefined, last)
    expect(plainSets.map((s) => s.weight)).toEqual([undefined, undefined])
  })

  test('its sets read with the assistance', () => {
    const sets = [set({ weight: 20, reps: 8 }), set({ weight: 20, reps: 8 })]
    expect(plain(describeSets(sets, assistedDip, metric))).toBe('2×8 · 20 kg assist')
    expect(describeSets([set({ weight: 20, reps: 8 })], pullUp, metric)).toBe('1×8')
  })

  test('replaced by an assisted machine, the sets take its counterweight; back to a plain one, it goes', () => {
    const entry: Entry = { id: 'e', exerciseId: pullUp.id, sets: [set({ reps: 8, done: false })] }
    const onMachine = swapEntryExercise(entry, pullUp, assistedDip, last)
    expect(onMachine.sets).toEqual([{ done: false, reps: 8, weight: 20 }])
    expect(swapEntryExercise(onMachine, assistedDip, pullUp, undefined).sets).toEqual([{ done: false, reps: 8 }])
  })
})
