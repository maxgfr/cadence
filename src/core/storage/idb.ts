import { type DBSchema, type IDBPDatabase, openDB } from 'idb'
import { sealedStore } from 'llm-connect'
import { currentMessages } from '../i18n/index.ts'
import type { Discipline, Exercise, Goal, Program, Session, Settings } from '../model/schemas.ts'
import { dropLegacyKeys, type LegacySealed, openLegacy } from './legacy-secrets.ts'
import { COLLECTIONS, type Store } from './store.ts'

interface CadenceDB extends DBSchema {
  disciplines: { key: string; value: Discipline }
  exercises: { key: string; value: Exercise }
  programs: { key: string; value: Program }
  sessions: { key: string; value: Session; indexes: { date: string } }
  goals: { key: string; value: Goal }
  meta: { key: string; value: Settings }
  /** Secrets as earlier versions stored them, moved to the sealed store on open (see `legacy-secrets.ts`). */
  secrets: { key: string; value: LegacySealed | string }
}

/** 2: the user's own disciplines (records of version 1 are migrated when the app loads them). */
const DB_VERSION = 2

/**
 * Secrets live in `sealedDb` (`llm-connect`'s `sealedStore`: AES-GCM under a non-extractable key, the name bound to
 * each value), apart from the data; `legacyKeysDb` held the key of the earlier layout.
 */
export async function idbStore(
  name = 'cadence',
  sealedDb = `${name}-sealed`,
  legacyKeysDb = `${name}-keys`,
): Promise<Store> {
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
  const sealed = sealedStore({ dbName: sealedDb })

  // Secrets of the earlier layout move to the sealed store. A record is removed only once its value is stored there
  // (or a newer one already is); when that fails it stays readable and is retried next time. Records that can never
  // open again (their key is gone) already read as missing and are dropped.
  try {
    for (const key of await db.getAllKeys('secrets')) {
      const text = await openLegacy(await db.get('secrets', key), legacyKeysDb)
      if (text === undefined || (await sealed.get(key)) !== null || (await sealed.set(key, text)))
        await db.delete('secrets', key)
    }
    if ((await db.count('secrets')) === 0) await dropLegacyKeys(legacyKeysDb)
  } catch {
    // IndexedDB refused: nothing was lost, the move is retried on the next open.
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
      const value = await sealed.get(key)
      if (value !== null) return value
      // Not moved yet (the sealed store refused it on open): still readable where it was.
      try {
        const legacy = await db.get('secrets', key)
        return legacy === undefined ? undefined : await openLegacy(legacy, legacyKeysDb)
      } catch {
        return undefined
      }
    },
    /** Rejects when the value could not be encrypted and stored: it is never written in clear text. */
    async putSecret(key, value) {
      if (value === undefined || value === '') await sealed.delete(key)
      else if (!(await sealed.set(key, value))) throw new Error(currentMessages().core.secretNotStored)
      await db.delete('secrets', key)
    },
  }
}
