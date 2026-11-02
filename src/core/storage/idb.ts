import { type DBSchema, type IDBPDatabase, openDB } from 'idb'
import type { Discipline, Exercise, Goal, Program, Session, Settings } from '../model/schemas.ts'
import { isSealed, openSealer, type Sealed, type Sealer } from './sealed.ts'
import { COLLECTIONS, type Store } from './store.ts'

interface CadenceDB extends DBSchema {
  disciplines: { key: string; value: Discipline }
  exercises: { key: string; value: Exercise }
  programs: { key: string; value: Program }
  sessions: { key: string; value: Session; indexes: { date: string } }
  goals: { key: string; value: Goal }
  meta: { key: string; value: Settings }
  /** Sealed (encrypted) values; a string is clear text left by an earlier version, sealed on open. */
  secrets: { key: string; value: Sealed | string }
}

/** 2: the user's own disciplines (records of version 1 are migrated when the app loads them). */
const DB_VERSION = 2

/** `keysDb`: where the secrets' encryption key lives, apart from the data. */
export async function idbStore(name = 'cadence', keysDb = `${name}-keys`): Promise<Store> {
  const db: IDBPDatabase<CadenceDB> = await openDB<CadenceDB>(name, DB_VERSION, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        d.createObjectStore('exercises', { keyPath: 'id' })
        d.createObjectStore('programs', { keyPath: 'id' })
        d.createObjectStore('sessions', { keyPath: 'id' }).createIndex('date', 'date')
        d.createObjectStore('goals', { keyPath: 'id' })
        d.createObjectStore('meta')
        d.createObjectStore('secrets')
      }
      if (oldVersion < 2) d.createObjectStore('disciplines', { keyPath: 'id' })
    },
  })
  let sealer: Promise<Sealer> | undefined
  const getSealer = () =>
    (sealer ??= openSealer(keysDb).catch((e: unknown) => {
      sealer = undefined
      throw e
    }))
  // Each `put` replaces the clear value in one write: the clear copy is gone only once the sealed one is stored.
  const seal = async (key: string, value: string) => db.put('secrets', await (await getSealer()).seal(value), key)

  // Keys saved in clear text by earlier versions are sealed now; on failure they stay readable and are retried next time.
  try {
    for (const key of await db.getAllKeys('secrets')) {
      const value = await db.get('secrets', key)
      if (typeof value === 'string') await seal(key, value)
    }
  } catch {
    // WebCrypto or the key database unavailable: nothing changed.
  }

  return {
    all: (collection) => db.getAll(collection) as never,
    async put(collection, value) {
      await db.put(collection, value as never)
    },
    async remove(collection, id) {
      await db.delete(collection, id)
    },
    async replaceAll(next) {
      const tx = db.transaction(['disciplines', 'exercises', 'programs', 'sessions', 'goals', 'meta'], 'readwrite')
      for (const c of COLLECTIONS) {
        // One store type for all five: the values were validated against their own schema by the caller.
        const store = tx.objectStore(c as 'goals')
        await store.clear()
        for (const v of next[c]) await store.put(v as Goal)
      }
      await tx.objectStore('meta').put(next.settings, 'settings')
      await tx.done
    },
    getSettings: () => db.get('meta', 'settings'),
    async putSettings(s) {
      await db.put('meta', s, 'settings')
    },
    async getSecret(key) {
      const value = await db.get('secrets', key)
      if (typeof value === 'string' || value === undefined) return value
      if (!isSealed(value)) return undefined
      try {
        return await (await getSealer()).open(value)
      } catch {
        // Sealed with a key that is gone (site data partly cleared): it has to be entered again.
        return undefined
      }
    },
    /** Rejects when the value could not be encrypted and stored: it is never written in clear text. */
    async putSecret(key, value) {
      if (value === undefined || value === '') await db.delete('secrets', key)
      else await seal(key, value)
    },
  }
}
