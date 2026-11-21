import { describe, expect, test } from 'bun:test'
import { programAdherence, sessionAdherence } from '../stats/trends.ts'
import { exportBackup, parseBackup } from '../storage/backup.ts'
import { memoryStore } from '../storage/store.ts'
import { IDX, must } from '../testkit.test.ts'
import {
  addOfferedBlock,
  completedDays,
  isOptional,
  nextDay,
  offeredBlocks,
  requiredBlocks,
  sessionFromDay,
  weekTodo,
} from './program.ts'
import { BACKUP_VERSION, type Block, type Program, type Session } from './schemas.ts'

/** Blocks planned in case there is time: offered beside the session, part of it only once added. */

const T = '2026-10-01T00:00:00.000Z'
const squat: Block = { id: 'squat', exerciseId: 'back-squat', sets: 3, reps: 5, intensity: { kind: 'rpe', value: 8 } }
const bench: Block = { id: 'bench', exerciseId: 'bench-press', sets: 3, reps: 8 }
const pullUp: Block = { id: 'pull', exerciseId: 'pull-up', sets: 2, reps: 10, rest: 60, optional: true }
const dip: Block = { id: 'dip', exerciseId: 'dip', sets: 2, reps: 12, optional: true }

const program = (blocks: Block[]): Program => ({
  id: 'p',
  name: 'Full body',
  goal: '',
  layout: 'sessions',
  weeks: [
    {
      id: 'w',
      days: [
        { id: 'a', name: 'A', blocks },
        { id: 'b', name: 'B', blocks: [squat] },
      ],
    },
  ],
  source: 'manual',
  createdAt: T,
  updatedAt: T,
})

const withOptional = program([squat, bench, pullUp, dip])
const ref = { programId: 'p', week: 0, day: 0 }
const start = (p: Program = withOptional) => sessionFromDay(p, ref, IDX, () => 100, '2026-10-16', new Date(T))
const tickAll = (s: Session): Session => ({
  ...s,
  status: 'done',
  entries: s.entries.map((e) => ({ ...e, sets: e.sets.map((x) => ({ ...x, done: true })) })),
})

describe('optional blocks', () => {
  test('absent or false is required', () => {
    expect([squat, { ...bench, optional: false }, pullUp].map(isOptional)).toEqual([false, false, true])
    expect(requiredBlocks(must(withOptional.weeks[0]?.days[0])).map((b) => b.id)).toEqual(['squat', 'bench'])
  })

  test('a session from a day starts with the required blocks only, as it would without the optional ones', () => {
    const s = start()
    expect(s.entries.map((e) => e.planned?.id)).toEqual(['squat', 'bench'])
    const without = start(program([squat, bench]))
    expect(s.entries.map(({ id: _id, ...e }) => e)).toEqual(without.entries.map(({ id: _id, ...e }) => e))
    // Nothing of the optional blocks is stored with the session.
    expect(JSON.stringify(s)).not.toContain('pull-up')
  })

  test('the logging screen offers the optional blocks not added yet, in the day order', () => {
    const s = start()
    expect(offeredBlocks(s, [withOptional]).map((b) => b.id)).toEqual(['pull', 'dip'])
    // A session of another day, of no program, or of a program gone, is offered nothing.
    expect(offeredBlocks({ ...s, programRef: { ...ref, day: 1, dayId: 'b' } }, [withOptional])).toEqual([])
    const { programRef: _ref, ...free } = s
    expect(offeredBlocks(free, [withOptional])).toEqual([])
    expect(offeredBlocks(s, [])).toEqual([])
  })

  test('an optional block added is an entry like a required one, and leaves the offer', () => {
    const s = start()
    const added = addOfferedBlock(s, pullUp, IDX, () => 100)
    const entry = must(added.entries[2])
    expect(entry.exerciseId).toBe('pull-up')
    expect(entry.planned).toEqual(pullUp)
    expect(entry.sets).toEqual([
      { reps: 10, done: false },
      { reps: 10, done: false },
    ])
    // Pre-filled exactly as the same block would be when required.
    const required = must(start(program([{ ...pullUp, optional: false }])).entries[0])
    expect(entry.sets).toEqual(required.sets)
    expect(offeredBlocks(added, [withOptional]).map((b) => b.id)).toEqual(['dip'])
    // Removed again, it is offered again.
    const removed = { ...added, entries: added.entries.filter((e) => e.id !== entry.id) }
    expect(offeredBlocks(removed, [withOptional]).map((b) => b.id)).toEqual(['pull', 'dip'])
  })

  test('adherence counts an optional block only once it is added', () => {
    const s = tickAll(start())
    expect(sessionAdherence(s)).toBe(1)
    // Added and half done: its two planned sets count, one of them ticked.
    const added = addOfferedBlock(start(), pullUp, IDX, () => 100)
    const half: Session = {
      ...tickAll(added),
      entries: tickAll(added).entries.map((e, i) =>
        i === 2 ? { ...e, sets: e.sets.map((x, j) => ({ ...x, done: j === 0 })) } : e,
      ),
    }
    expect(sessionAdherence(half)).toBeCloseTo(7 / 8)
    expect(programAdherence([s, half], 'p')).toBeCloseTo((1 + 7 / 8) / 2)
  })

  test('the program progress and its next day do not depend on optional blocks', () => {
    const done = tickAll(start())
    const plain = program([squat, bench])
    expect(nextDay(withOptional, [done])).toEqual(nextDay(plain, [done]))
    expect(completedDays(withOptional, [done])).toBe(completedDays(plain, [done]))
    expect(weekTodo(withOptional, [done], '2026-10-12')?.left).toBe(weekTodo(plain, [done], '2026-10-12')?.left)
  })
})

describe('a version 12 backup', () => {
  test('reads as version 13 with the same meaning: every block required', async () => {
    const store = memoryStore()
    await store.put('programs', program([squat, bench]))
    await store.put('sessions', start(program([squat, bench])))
    const v12 = { ...(await exportBackup(store, new Date(T))), version: 12 }
    const b = parseBackup(JSON.stringify(v12))
    expect(b.version).toBe(BACKUP_VERSION)
    expect(BACKUP_VERSION).toBe(13)
    expect(b.programs).toEqual(v12.programs)
    expect(b.sessions).toEqual(v12.sessions)
    const blocks = b.programs.flatMap((p) => p.weeks.flatMap((w) => w.days.flatMap((d) => d.blocks)))
    expect(blocks.some(isOptional)).toBe(false)
  })

  test('a version 13 backup keeps its optional blocks', async () => {
    const store = memoryStore()
    await store.put('programs', withOptional)
    const b = parseBackup(JSON.stringify(await exportBackup(store, new Date(T))))
    expect(b.programs[0]?.weeks[0]?.days[0]?.blocks.filter(isOptional).map((x) => x.id)).toEqual(['pull', 'dip'])
  })
})
