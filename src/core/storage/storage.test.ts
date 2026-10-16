import { describe, expect, test } from 'bun:test'
import { instantiate, TEMPLATES } from '../library/templates.ts'
import { DEFAULT_SETTINGS } from '../model/schemas.ts'
import { entry, IDX, must, session, set } from '../testkit.test.ts'
import { BackupError, exportBackup, importBackup, parseBackup, sessionsCsv } from './backup.ts'
import { idbStore } from './idb.ts'
import { memoryStore, type Store } from './store.ts'

let n = 0
const stores: [string, () => Promise<Store>][] = [
  ['memory', async () => memoryStore()],
  ['indexeddb', () => idbStore(`cadence-test-${n++}`)],
]

for (const [name, make] of stores) {
  describe(`${name} store`, () => {
    test('put, list, remove', async () => {
      const s = await make()
      const p = instantiate(must(TEMPLATES[0]))
      await s.put('programs', p)
      expect((await s.all('programs')).map((x) => x.id)).toEqual([p.id])
      await s.put('programs', { ...p, name: 'Renamed' })
      expect((await s.all('programs'))[0]?.name).toBe('Renamed')
      await s.remove('programs', p.id)
      expect(await s.all('programs')).toEqual([])
    })

    test('settings and secrets', async () => {
      const s = await make()
      expect(await s.getSettings()).toBeUndefined()
      await s.putSettings({ ...DEFAULT_SETTINGS, mode: 'advanced' })
      expect((await s.getSettings())?.mode).toBe('advanced')
      await s.putSecret('ai.key', 'sk-test')
      expect(await s.getSecret('ai.key')).toBe('sk-test')
      await s.putSecret('ai.key', '')
      expect(await s.getSecret('ai.key')).toBeUndefined()
    })

    test('export → import round trip leaves secrets out and on the device', async () => {
      const a = await make()
      const program = instantiate(must(TEMPLATES[2]))
      const sess = session('2026-10-10', [entry('back-squat', [set({ weight: 100, reps: 5 })])])
      await a.put('programs', program)
      await a.put('sessions', sess)
      await a.put('goals', {
        id: 'g',
        kind: 'frequency',
        target: 3,
        deadline: '2026-12-01',
        createdAt: '2026-10-01T00:00:00Z',
      })
      await a.put('exercises', { id: 'my-ex', name: 'Sled push', discipline: 'strength', metric: 'time' })
      await a.putSettings({ ...DEFAULT_SETTINGS, weightUnit: 'lb', onboarded: true })
      await a.putSecret('ai.key', 'sk-secret')

      const backup = await exportBackup(a, new Date('2026-10-16T00:00:00Z'))
      const text = JSON.stringify(backup)
      expect(text).not.toContain('sk-secret')

      const b = await make()
      await b.putSecret('ai.key', 'sk-other')
      await importBackup(b, parseBackup(text))
      expect(await b.all('programs')).toEqual([program])
      expect(await b.all('sessions')).toEqual([sess])
      expect((await b.all('exercises'))[0]?.name).toBe('Sled push')
      expect((await b.getSettings())?.weightUnit).toBe('lb')
      expect(await b.getSecret('ai.key')).toBe('sk-other')
      expect(await exportBackup(b, new Date('2026-10-16T00:00:00Z'))).toEqual(backup)
    })
  })
}

describe('parseBackup', () => {
  test('refuses what is not a valid backup, saying why', () => {
    expect(() => parseBackup('nope')).toThrow(BackupError)
    expect(() => parseBackup('{"app":"other"}')).toThrow('not a Cadence backup')
    expect(() => parseBackup('{"app":"cadence","version":9}')).toThrow('format version 9')
    expect(() =>
      parseBackup(
        JSON.stringify({
          app: 'cadence',
          version: 1,
          exportedAt: 'x',
          settings: {},
          exercises: [],
          programs: [],
          sessions: [{ id: 1 }],
          goals: [],
        }),
      ),
    ).toThrow('damaged')
  })
})

describe('CSV', () => {
  test('one row per set, quoted where needed', () => {
    const csv = sessionsCsv(
      [session('2026-10-10', [entry('back-squat', [set({ weight: 100, reps: 5, rpe: 8 })])], { title: 'Legs, heavy' })],
      IDX,
    )
    const lines = csv.trim().split('\n')
    expect(lines[0]).toStartWith('date,session,discipline,exercise,set,reps,weight_kg')
    expect(lines[1]).toBe('2026-10-10,"Legs, heavy",strength,Back squat,1,5,100,,,8,yes,,')
  })
})
