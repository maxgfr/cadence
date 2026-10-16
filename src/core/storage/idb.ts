import { type DBSchema, type IDBPDatabase, openDB } from 'idb'
import type { Exercise, Goal, Program, Session, Settings } from '../model/schemas.ts'
import { COLLECTIONS, type Store } from './store.ts'

interface CadenceDB extends DBSchema {
  exercises: { key: string; value: Exercise }
  programs: { key: string; value: Program }
  sessions: { key: string; value: Session; indexes: { date: string } }
  goals: { key: string; value: Goal }
  meta: { key: string; value: Settings }
  secrets: { key: string; value: string }
}

const DB_VERSION = 1

export async function idbStore(name = 'cadence'): Promise<Store> {
  const db: IDBPDatabase<CadenceDB> = await openDB<CadenceDB>(name, DB_VERSION, {
    upgrade(d) {
      d.createObjectStore('exercises', { keyPath: 'id' })
      d.createObjectStore('programs', { keyPath: 'id' })
      d.createObjectStore('sessions', { keyPath: 'id' }).createIndex('date', 'date')
      d.createObjectStore('goals', { keyPath: 'id' })
      d.createObjectStore('meta')
      d.createObjectStore('secrets')
    },
  })
  return {
    all: (collection) => db.getAll(collection) as never,
    async put(collection, value) {
      await db.put(collection, value as never)
    },
    async remove(collection, id) {
      await db.delete(collection, id)
    },
    async replaceAll(next) {
      const tx = db.transaction(['exercises', 'programs', 'sessions', 'goals', 'meta'], 'readwrite')
      for (const c of COLLECTIONS) {
        // One store type for all four: the values were validated against their own schema by the caller.
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
    getSecret: (key) => db.get('secrets', key),
    async putSecret(key, value) {
      if (value === undefined || value === '') await db.delete('secrets', key)
      else await db.put('secrets', value, key)
    },
  }
}
