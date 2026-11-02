import { describe, expect, test } from 'bun:test'
import { openDB } from 'idb'
import { instantiate, TEMPLATES } from '../demo/programs.ts'
import { DEFAULT_SETTINGS } from '../model/schemas.ts'
import { entry, IDX, must, session, set } from '../testkit.test.ts'
import { BackupError, exportBackup, importBackup, parseBackup, sessionsCsv } from './backup.ts'
import { idbStore } from './idb.ts'
import { needsGoalMigration } from './migrate.ts'
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
      const p = instantiate(must(TEMPLATES[0]), new Set(['gym'] as const))
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
      const program = instantiate(must(TEMPLATES[2]), new Set(['track'] as const))
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
      await a.put('disciplines', { id: 'climb', name: 'Climbing', color: 'orange' })
      await a.put('exercises', { id: 'my-ex', name: 'Sled push', disciplineId: 'climb', metric: 'time' })
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
      expect((await b.all('disciplines'))[0]?.name).toBe('Climbing')
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

  test('goals of version 3 on a lift or a time are read as exercise goals', async () => {
    const v3 = { ...(await exportBackup(memoryStore())), version: 3 }
    const goal = (kind: string) => ({
      id: kind,
      kind,
      exerciseId: 'back-squat',
      target: 120,
      deadline: '2026-12-01',
      createdAt: 'x',
    })
    const b = parseBackup(JSON.stringify({ ...v3, goals: [goal('e1rm'), goal('best_time')] }))
    expect(b.goals.map((g) => g.kind)).toEqual(['exercise', 'exercise'])
    expect(needsGoalMigration([goal('e1rm')])).toBe(true)
    expect(needsGoalMigration(b.goals)).toBe(false)
  })

  test('a version 2 backup reads as it is, its programs laid out in weeks', async () => {
    const store = memoryStore()
    await store.put('programs', instantiate(must(TEMPLATES[0]), new Set(['gym'] as const)))
    const b = parseBackup(JSON.stringify({ ...(await exportBackup(store)), version: 2 }))
    expect(b.programs).toHaveLength(1)
    expect(b.version).toBe(4)
    expect(b.programs.every((p) => p.layout === undefined)).toBe(true)
  })
})

describe('version 1 backups', () => {
  test("fixed disciplines become the user's own, built-in exercises join the library", () => {
    const v1 = {
      app: 'cadence',
      version: 1,
      exportedAt: '2026-10-16T00:00:00Z',
      settings: { mode: 'normal', onboarded: true },
      exercises: [{ id: 'my-run', name: 'Hill run', discipline: 'run', metric: 'distance_time' }],
      programs: [
        {
          id: 'p',
          name: 'Mine',
          goal: '',
          disciplines: ['strength'],
          source: 'manual',
          createdAt: 'x',
          updatedAt: 'x',
          weeks: [
            {
              id: 'w',
              days: [
                {
                  id: 'd',
                  name: 'Legs',
                  discipline: 'strength',
                  blocks: [{ id: 'b', exerciseId: 'back-squat', sets: 3 }],
                },
              ],
            },
          ],
        },
      ],
      sessions: [
        {
          id: 's',
          date: '2026-10-10',
          title: 'Swim',
          discipline: 'swim',
          status: 'done',
          entries: [{ id: 'e', exerciseId: 'swim-free', sets: [] }],
        },
        { id: 't', date: '2026-10-11', title: 'Other', discipline: 'other', status: 'done', entries: [] },
      ],
      goals: [
        { id: 'g', kind: 'weekly_volume', discipline: 'swim', target: 5000, deadline: '2026-12-01', createdAt: 'x' },
      ],
    }
    const b = parseBackup(JSON.stringify(v1))
    expect(b.version).toBe(4)
    expect(b.disciplines.map((d) => d.name).sort()).toEqual(['Gym', 'Swimming', 'Track and field'])
    expect(b.exercises.find((e) => e.id === 'my-run')).toMatchObject({ disciplineId: 'demo-track', pace: 'km' })
    expect(b.exercises.find((e) => e.id === 'back-squat')?.disciplineId).toBe('demo-gym')
    expect(b.exercises.find((e) => e.id === 'swim-free')?.disciplineId).toBe('demo-swim')
    expect(b.programs[0]?.weeks[0]?.days[0]?.disciplineId).toBe('demo-gym')
    expect(b.sessions.map((s) => s.disciplineId)).toEqual(['demo-swim', undefined])
    expect(b.goals[0]).toMatchObject({ disciplineId: 'demo-swim', volume: 'distance' })
  })
})

describe('CSV', () => {
  test('one row per set, quoted where needed', () => {
    const csv = sessionsCsv(
      [session('2026-10-10', [entry('back-squat', [set({ weight: 100, reps: 5, rpe: 8 })])], { title: 'Legs, heavy' })],
      IDX,
      new Map([['demo-gym', { name: 'Gym' }]]),
    )
    const lines = csv.trim().split('\n')
    expect(lines[0]).toStartWith('date,session,discipline,exercise,set,reps,weight_kg')
    expect(lines[1]).toBe('2026-10-10,"Legs, heavy",Gym,Back squat,1,5,100,,,8,yes,,')
  })
})

describe('secrets at rest', () => {
  const records = async (dbName: string, storeName: string) => {
    const db = await openDB(dbName)
    const out: unknown[] = db.objectStoreNames.contains(storeName) ? await db.getAll(storeName) : []
    db.close()
    return out
  }
  const legacy = async (name: string, key: string) => {
    const db = await openDB(name)
    const value: unknown = await db.get('secrets', key)
    db.close()
    return value
  }
  const sealedRecord = async (name: string, key: string) => {
    const db = await openDB(`${name}-sealed`)
    const value = (await db.get('kv', key)) as { iv: Uint8Array; ciphertext: ArrayBuffer } | undefined
    db.close()
    return value
  }
  const holdsClearText = (values: unknown[], text: string) =>
    values.some(
      (value) =>
        typeof value === 'string' ||
        (value instanceof Object &&
          'ciphertext' in value &&
          new TextDecoder().decode(value.ciphertext as ArrayBuffer).includes(text)) ||
        JSON.stringify(value ?? null).includes(text),
    )
  const databases = async () => (await indexedDB.databases()).map((d) => d.name)
  /** A secret as the earlier wrapper sealed it: `{ v: 1, iv, data }` under a key kept in `<name>-keys`. */
  const putEarlierSealed = async (name: string, key: string, text: string) => {
    const cryptoKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    const keys = await openDB(`${name}-keys`, 1, { upgrade: (d) => d.createObjectStore('keys') })
    await keys.put('keys', cryptoKey, 'secrets')
    keys.close()
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, new TextEncoder().encode(text))
    const db = await openDB(name)
    await db.put('secrets', { v: 1, iv, data }, key)
    db.close()
  }

  test('are stored encrypted, apart from the data, and read back', async () => {
    const name = `cadence-test-${n++}`
    const s = await idbStore(name)
    await s.putSecret('ai.key', 'sk-live-123')
    const stored = await sealedRecord(name, 'ai.key')
    expect(stored?.ciphertext).toBeInstanceOf(ArrayBuffer)
    expect(holdsClearText(await records(`${name}-sealed`, 'kv'), 'sk-live-123')).toBe(false)
    expect(await legacy(name, 'ai.key')).toBeUndefined()
    expect(await s.getSecret('ai.key')).toBe('sk-live-123')
    // A fresh IV on every write.
    await s.putSecret('ai.key', 'sk-live-123')
    expect(await sealedRecord(name, 'ai.key')).not.toEqual(stored)
    await s.putSecret('ai.key', '')
    expect(await sealedRecord(name, 'ai.key')).toBeUndefined()
  })

  test('saved in clear text by an earlier version move to the sealed store on open', async () => {
    const name = `cadence-test-${n++}`
    await idbStore(name)
    const db = await openDB(name)
    await db.put('secrets', 'sk-old', 'ai.key')
    db.close()
    const s = await idbStore(name)
    expect(await legacy(name, 'ai.key')).toBeUndefined()
    expect(holdsClearText(await records(`${name}-sealed`, 'kv'), 'sk-old')).toBe(false)
    expect(await s.getSecret('ai.key')).toBe('sk-old')
  })

  test('sealed by the earlier wrapper move to the sealed store, and its key database goes', async () => {
    const name = `cadence-test-${n++}`
    await idbStore(name)
    await putEarlierSealed(name, 'ai.key', 'sk-earlier')
    const s = await idbStore(name)
    expect(await legacy(name, 'ai.key')).toBeUndefined()
    expect(await sealedRecord(name, 'ai.key')).toBeDefined()
    expect(await s.getSecret('ai.key')).toBe('sk-earlier')
    expect(await databases()).not.toContain(`${name}-keys`)
    // Idempotent: opening again changes nothing.
    expect(await (await idbStore(name)).getSecret('ai.key')).toBe('sk-earlier')
  })

  test('a newer sealed value wins over a leftover of the earlier layout', async () => {
    const name = `cadence-test-${n++}`
    const s = await idbStore(name)
    await s.putSecret('ai.key', 'sk-new')
    const db = await openDB(name)
    await db.put('secrets', 'sk-stale', 'ai.key')
    db.close()
    const again = await idbStore(name)
    expect(await legacy(name, 'ai.key')).toBeUndefined()
    expect(await again.getSecret('ai.key')).toBe('sk-new')
  })

  test('stay where they were, and readable, when the sealed store refuses them', async () => {
    const name = `cadence-test-${n++}`
    await idbStore(name)
    await putEarlierSealed(name, 'ai.key', 'sk-earlier')
    // A sealed database of a newer version cannot be opened: no key, nothing can be stored there.
    ;(await openDB(`${name}-sealed`, 5)).close()
    const s = await idbStore(name)
    expect(await legacy(name, 'ai.key')).toBeDefined()
    expect(await databases()).toContain(`${name}-keys`)
    expect(await s.getSecret('ai.key')).toBe('sk-earlier')
  })

  test('are never written in clear text when encryption is unavailable', async () => {
    const name = `cadence-test-${n++}`
    ;(await openDB(`${name}-sealed`, 5)).close()
    const s = await idbStore(name)
    await expect(s.putSecret('ai.key', 'sk-live-123')).rejects.toThrow()
    expect(await legacy(name, 'ai.key')).toBeUndefined()
    expect(holdsClearText(await records(`${name}-sealed`, 'kv'), 'sk-live-123')).toBe(false)
  })

  test('sealed with a key that is gone read as missing', async () => {
    const name = `cadence-test-${n++}`
    await (await idbStore(name)).putSecret('ai.key', 'sk-live-123')
    const db = await openDB(`${name}-sealed`)
    await db.delete('kv', 'crypto-key')
    db.close()
    expect(await (await idbStore(name)).getSecret('ai.key')).toBeUndefined()
  })
})
