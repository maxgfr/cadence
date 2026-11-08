import { describe, expect, test } from 'bun:test'
import { weekTodo } from '../model/program.ts'
import {
  BACKUP_VERSION,
  type Backup,
  type Day,
  DEFAULT_SETTINGS,
  type Discipline,
  type Exercise,
  type Program,
  type Session,
} from '../model/schemas.ts'
import { exportBackup } from '../storage/backup.ts'
import { memoryStore } from '../storage/store.ts'
import { newPairingKey, open, seal } from './crypto.ts'
import { mergeSnapshots, total } from './merge.ts'
import {
  type AiSecrets,
  type Channel,
  newerAi,
  newPairing,
  openPayload,
  pairingLink,
  parsePairing,
  runSync,
  SyncError,
  sealPayload,
} from './protocol.ts'

const snapshot = (p: Partial<Backup> = {}): Backup => ({
  app: 'cadence',
  version: BACKUP_VERSION,
  exportedAt: '2026-11-06T10:00:00.000Z',
  settings: { ...DEFAULT_SETTINGS, onboarded: true },
  disciplines: [],
  exercises: [],
  programs: [],
  sessions: [],
  goals: [],
  notes: [],
  deleted: [],
  ...p,
})

const ex = (id: string, name: string, updatedAt?: string): Exercise => ({
  id,
  name,
  metric: 'weight_reps',
  ...(updatedAt ? { updatedAt } : {}),
})

const session = (id: string, updatedAt: string): Session => ({
  id,
  date: '2026-11-06',
  title: id,
  entries: [],
  status: 'done',
  updatedAt,
})

const T1 = '2026-11-06T10:00:00.000Z'
const T2 = '2026-11-06T11:00:00.000Z'
const T3 = '2026-11-06T12:00:00.000Z'

const strip = (b: Backup) => ({ ...b, exportedAt: '' })

describe('merging two devices', () => {
  test('the newest version of each record wins; records only one side has join', () => {
    const pc = snapshot({ exercises: [ex('a', 'Squat (PC)', T2), ex('b', 'Bench', T1)], sessions: [session('s1', T1)] })
    const phone = snapshot({
      exercises: [ex('a', 'Squat (phone)', T1), ex('c', 'Row', T1)],
      sessions: [session('s2', T3)],
    })
    const { merged, received, sent } = mergeSnapshots(pc, phone)
    expect(merged.exercises.map((e) => e.name)).toEqual(['Squat (PC)', 'Bench', 'Row'])
    expect(merged.sessions.map((s) => s.id)).toEqual(['s1', 's2'])
    expect(received).toMatchObject({ exercises: 1, sessions: 1 })
    expect(sent).toMatchObject({ exercises: 2, sessions: 1 })
  })

  test('a deletion wins over older versions, not over a change made after it', () => {
    const pc = snapshot({
      exercises: [ex('a', 'Squat', T1), ex('b', 'Bench', T3)],
      deleted: [],
    })
    const phone = snapshot({
      deleted: [
        { collection: 'exercises', id: 'a', deletedAt: T2 },
        { collection: 'exercises', id: 'b', deletedAt: T2 },
      ],
    })
    const { merged, received, sent } = mergeSnapshots(pc, phone)
    expect(merged.exercises.map((e) => e.id)).toEqual(['b'])
    expect(merged.deleted).toEqual([{ collection: 'exercises', id: 'a', deletedAt: T2 }])
    expect(received.exercises).toBe(1)
    expect(sent.exercises).toBe(1)
  })

  test('records from before version 6 (no date) lose to any dated version', () => {
    const { merged } = mergeSnapshots(
      snapshot({ exercises: [ex('a', 'Old')] }),
      snapshot({ exercises: [ex('a', 'New', T1)] }),
    )
    expect(merged.exercises[0]?.name).toBe('New')
  })

  test('symmetric, deterministic on ties, and idempotent', () => {
    const a = snapshot({
      exercises: [ex('x', 'Left', T1), ex('y', 'Only A', T2)],
      settings: { ...DEFAULT_SETTINGS, weightUnit: 'lb', updatedAt: T2, onboarded: true },
    })
    const b = snapshot({
      exercises: [ex('x', 'Right', T1)],
      settings: { ...DEFAULT_SETTINGS, weightUnit: 'kg', updatedAt: T1, onboarded: false },
      deleted: [{ collection: 'sessions', id: 'gone', deletedAt: T1 }],
    })
    const ab = mergeSnapshots(a, b)
    const ba = mergeSnapshots(b, a)
    expect(strip(ab.merged)).toEqual(strip(ba.merged))
    expect(ab.received).toEqual(ba.sent)
    expect(ab.merged.settings.weightUnit).toBe('lb')
    expect(ab.merged.settings.onboarded).toBe(true)
    const again = mergeSnapshots(ab.merged, ab.merged)
    expect(total(again.received) + total(again.sent)).toBe(0)
    expect(strip(again.merged)).toEqual(strip(ab.merged))
  })
})

describe('training on the phone, editing programs on the computer', () => {
  const day = (id: string, name: string): Day => ({
    id,
    name,
    blocks: [{ id: `${id}-b`, exerciseId: 'a', sets: 3, reps: 8 }],
  })
  const program = (name: string, updatedAt: string, days: Day[] = [day('d1', 'Push'), day('d2', 'Pull')]): Program => ({
    id: 'p',
    name,
    goal: '',
    source: 'manual',
    weeks: [{ id: 'w', days }],
    createdAt: T1,
    updatedAt,
  })
  const onDay = (id: string, dayIndex: number, dayId: string, at: string): Session => ({
    ...session(id, at),
    date: '2026-11-03',
    startedAt: at,
    programRef: { programId: 'p', week: 0, day: dayIndex, dayId },
  })
  const LAST_SYNC = '2026-11-06T09:00:00.000Z'

  test('a session logged on one side and a program edited on the other are both kept', () => {
    const beforeSync = '2026-11-06T08:00:00.000Z'
    const phone = snapshot({ programs: [program('Plan', beforeSync)], sessions: [onDay('s', 1, 'd2', T2)] })
    const pc = snapshot({ programs: [program('Plan, reworked', T3)] })
    const { merged } = mergeSnapshots(phone, pc, new Date(), { local: LAST_SYNC, remote: LAST_SYNC })
    expect(merged.programs.map((p) => p.name)).toEqual(['Plan, reworked'])
    expect(merged.sessions.map((s) => s.id)).toEqual(['s'])
  })

  test('a day deleted on the computer does not shift what the phone logged', () => {
    const phone = snapshot({ programs: [program('Plan', T1)], sessions: [onDay('s', 1, 'd2', T2)] })
    const pc = snapshot({ programs: [program('Plan', T3, [day('d2', 'Pull')])] })
    const { merged } = mergeSnapshots(phone, pc)
    const todo = weekTodo(merged.programs[0] as Program, merged.sessions, '2026-11-02')
    expect(todo?.days.map((d) => [d.day.name, d.done?.id])).toEqual([['Pull', 's']])
  })

  test('an exercise deleted on one side stays while the other still uses it, and goes when nothing does', () => {
    const used: Session = {
      ...session('s', T1),
      entries: [{ id: 'e', exerciseId: 'a', sets: [{ done: true, reps: 5 }] }],
    }
    const pc = snapshot({ deleted: [{ collection: 'exercises', id: 'a', deletedAt: T3 }] })
    const phone = snapshot({ exercises: [ex('a', 'Squat', T1)], sessions: [used] })
    const kept = mergeSnapshots(pc, phone).merged
    expect(kept.exercises.map((e) => e.id)).toEqual(['a'])
    expect(kept.deleted).toEqual([])
    expect(strip(mergeSnapshots(phone, pc).merged)).toEqual(strip(kept))

    const gone = mergeSnapshots(pc, snapshot({ exercises: [ex('a', 'Squat', T1)] })).merged
    expect(gone.exercises).toEqual([])
  })

  test('a discipline deleted on one side stays while an exercise kept by the merge uses it', () => {
    const swim: Discipline = { id: 'swim', name: 'Swim', color: 'blue', updatedAt: T1 }
    const pc = snapshot({ deleted: [{ collection: 'disciplines', id: 'swim', deletedAt: T3 }] })
    const phone = snapshot({ disciplines: [swim], exercises: [{ ...ex('a', 'Free', T1), disciplineId: 'swim' }] })
    expect(mergeSnapshots(pc, phone).merged.disciplines.map((d) => d.id)).toEqual(['swim'])
  })

  describe('a program changed on both devices since they last synced', () => {
    const phone = snapshot({ programs: [program('Phone version', T2)] })
    const pc = snapshot({ programs: [program('PC version', T3)] })
    const since = { local: LAST_SYNC, remote: LAST_SYNC }

    test('the newest stays and the other is kept as a dated copy, the same on both devices', () => {
      const ab = mergeSnapshots(phone, pc, new Date(), since)
      const ba = mergeSnapshots(pc, phone, new Date(), since)
      expect(ab.merged.programs.map((p) => p.name)).toEqual(['PC version', 'Phone version · 2026-11-06'])
      expect(strip(ab.merged)).toEqual(strip(ba.merged))
      expect(ab.received.programs).toBe(ba.sent.programs)
    })

    test('merging again changes nothing', () => {
      const once = mergeSnapshots(phone, pc, new Date(), since).merged
      const again = mergeSnapshots(once, once, new Date(), since)
      expect(total(again.received) + total(again.sent)).toBe(0)
      expect(again.merged.programs).toHaveLength(2)
    })

    test('no copy when only one side changed since, or before a first sync', () => {
      const older = { local: T3, remote: LAST_SYNC }
      expect(mergeSnapshots(phone, pc, new Date(), older).merged.programs.map((p) => p.name)).toEqual(['PC version'])
      expect(mergeSnapshots(phone, pc).merged.programs.map((p) => p.name)).toEqual(['PC version'])
    })

    test('a sync carries when each device last synced', async () => {
      const key = newPairingKey()
      const sealed = await sealPayload(key, { backup: phone, syncedAt: LAST_SYNC })
      expect((await openPayload(key, sealed)).syncedAt).toBe(LAST_SYNC)
    })
  })

  test('notes written on two devices all stay', () => {
    const note = (id: string, updatedAt: string) => ({ id, text: id, createdAt: T1, updatedAt })
    const { merged } = mergeSnapshots(
      snapshot({ notes: [note('phone', T2)] }),
      snapshot({ notes: [note('pc', T3)], deleted: [{ collection: 'notes', id: 'old', deletedAt: T1 }] }),
    )
    expect(merged.notes.map((n) => n.id)).toEqual(['pc', 'phone'])
    expect(merged.deleted.map((d) => d.id)).toEqual(['old'])
  })
})

describe('end-to-end encryption', () => {
  test('round trip; another key or a changed byte is refused', async () => {
    const key = newPairingKey()
    const plain = new TextEncoder().encode('{"hello":"gym"}'.repeat(200))
    const sealed = await seal(key, plain)
    expect(sealed.length).toBeLessThan(plain.length)
    expect(new TextDecoder().decode(await open(key, sealed))).toBe(new TextDecoder().decode(plain))
    await expect(open(newPairingKey(), sealed)).rejects.toThrow()
    const tampered = sealed.slice()
    tampered[20] = (tampered[20] ?? 0) ^ 1
    await expect(open(key, tampered)).rejects.toThrow()
  })
})

describe('pairing', () => {
  test('the QR link carries a room and the key, and reads back; anything else is not a pairing', () => {
    const p = newPairing(newPairingKey())
    const link = pairingLink('https://maxgfr.github.io/cadence/#/settings', p)
    expect(link).toStartWith('https://maxgfr.github.io/cadence/#/sync?r=')
    expect(parsePairing(link)).toEqual(p)
    expect(parsePairing('https://example.com/?r=abc&k=short')).toBeUndefined()
    expect(parsePairing('hello')).toBeUndefined()
  })
})

/** Two ends of a channel in memory. */
function channelPair(): [Channel, Channel] {
  const make = () => {
    const inbox: Uint8Array[] = []
    const waiting: ((b: Uint8Array) => void)[] = []
    return {
      push(b: Uint8Array) {
        const w = waiting.shift()
        if (w) w(b)
        else inbox.push(b)
      },
      receive: () =>
        new Promise<Uint8Array>((resolve) => {
          const b = inbox.shift()
          if (b) resolve(b)
          else waiting.push(resolve)
        }),
    }
  }
  const a = make()
  const b = make()
  return [
    { send: (x) => b.push(x), receive: a.receive },
    { send: (x) => a.push(x), receive: b.receive },
  ]
}

describe('a sync between two devices', () => {
  test('both end with the same data; the AI settings go to the device that has none', async () => {
    const pc = memoryStore()
    const phone = memoryStore()
    await pc.put('exercises', ex('a', 'Squat', T1))
    await pc.putSettings({ ...DEFAULT_SETTINGS, onboarded: true })
    await phone.put('sessions', session('s', T2))
    await phone.putTombstone({ collection: 'exercises', id: 'old', deletedAt: T1 })
    const key = newPairingKey()
    const [c1, c2] = channelPair()
    const ai: AiSecrets = { config: '{"providerId":"anthropic"}', key: 'sk-test' }
    const taken: (AiSecrets | undefined)[] = []
    const side = (store: typeof pc, mine: AiSecrets | undefined) => ({
      snapshot: async () => ({ backup: await exportBackup(store), ...(mine ? { ai: mine } : {}) }),
      apply: async (merged: Backup, theirs: AiSecrets | undefined) => {
        await store.replaceAll(merged)
        taken.push(theirs)
      },
    })
    const [r1, r2] = await Promise.all([runSync(c1, key, side(pc, ai)), runSync(c2, key, side(phone, undefined))])
    const [b1, b2] = await Promise.all([exportBackup(pc), exportBackup(phone)])
    expect(strip(b1)).toEqual(strip(b2))
    expect(b1.exercises.map((e) => e.id)).toEqual(['a'])
    expect(b1.sessions.map((s) => s.id)).toEqual(['s'])
    expect(b1.deleted.map((d) => d.id)).toEqual(['old'])
    expect(r1.tookAi).toBe(false)
    expect(r2.tookAi).toBe(true)
    expect(taken).toContainEqual(ai)
    expect(r1.received.sessions).toBe(1)
    expect(r2.received.exercises).toBe(1)
  })

  test('both devices with AI settings: the most recently saved win on both, the key with them', () => {
    const older: AiSecrets = { config: '{"providerId":"openai"}', key: 'sk-old', savedAt: '2026-11-01T10:00:00.000Z' }
    const newer: AiSecrets = {
      config: '{"providerId":"anthropic"}',
      key: 'sk-new',
      savedAt: '2026-11-06T10:00:00.000Z',
    }
    // Each side takes the other's only when it is newer: both end with the newer.
    expect(newerAi(older, newer)).toBe(newer)
    expect(newerAi(newer, older)).toBeUndefined()
    expect(newerAi(undefined, older)).toBe(older)
    expect(newerAi(newer, undefined)).toBeUndefined()
    // Settings from an older app carry no date: any dated ones win over them.
    const undated: AiSecrets = { config: '{"providerId":"mistral"}', key: 'sk-x' }
    expect(newerAi(undated, older)).toBe(older)
    expect(newerAi(older, undated)).toBeUndefined()
  })

  test('another version of the app is refused, with nothing applied', async () => {
    const key = newPairingKey()
    const bytes = await sealPayload(key, { backup: snapshot() })
    const json = JSON.parse(new TextDecoder().decode(await open(key, bytes)))
    const older = await seal(key, new TextEncoder().encode(JSON.stringify({ ...json, protocol: 0 })))
    await expect(openPayload(key, older)).rejects.toBeInstanceOf(SyncError)
    await expect(openPayload(newPairingKey(), bytes)).rejects.toThrow('damaged')
  })
})
