import type { Deleted, Discipline, Exercise, Goal, Note, Program, Session, Settings } from '../model/schemas.ts'

/** Collections kept on the device. Each record is keyed by its `id`. */
export interface Collections {
  disciplines: Discipline
  exercises: Exercise
  programs: Program
  sessions: Session
  goals: Goal
  notes: Note
}
export type CollectionName = keyof Collections
export const COLLECTIONS: readonly CollectionName[] = [
  'disciplines',
  'exercises',
  'programs',
  'sessions',
  'goals',
  'notes',
]

/**
 * Device-only values (API keys, the AI endpoint). Kept apart from training data so they can never leave in an
 * export, and encrypted at rest in IndexedDB (`llm-connect`'s `sealedStore`, see `idb.ts`).
 */
export type Secrets = Record<string, string>

export interface Store {
  all<C extends CollectionName>(name: C): Promise<Collections[C][]>
  put<C extends CollectionName>(name: C, value: Collections[C]): Promise<void>
  remove(name: CollectionName, id: string): Promise<void>
  /** Replaces every collection and the settings at once (an import, a sync); the tombstones too when given. */
  replaceAll(
    data: { [C in CollectionName]: Collections[C][] } & { settings: Settings; deleted?: readonly Deleted[] },
  ): Promise<void>
  /** Records deleted on this device, kept so a sync deletes them on the other one. */
  tombstones(): Promise<Deleted[]>
  putTombstone(d: Deleted): Promise<void>
  getSettings(): Promise<Settings | undefined>
  putSettings(settings: Settings): Promise<void>
  getSecret(key: string): Promise<string | undefined>
  putSecret(key: string, value: string | undefined): Promise<void>
}

/** A store in memory, for tests and as a fallback when IndexedDB is unavailable (some private modes). */
export function memoryStore(): Store {
  const data: { [C in CollectionName]: Map<string, Collections[C]> } = {
    disciplines: new Map(),
    exercises: new Map(),
    programs: new Map(),
    sessions: new Map(),
    goals: new Map(),
    notes: new Map(),
  }
  let settings: Settings | undefined
  const secrets = new Map<string, string>()
  const deleted = new Map<string, Deleted>()
  const tomb = (d: Pick<Deleted, 'collection' | 'id'>) => `${d.collection}:${d.id}`
  const copy = <T>(v: T): T => structuredClone(v)
  return {
    async all(name) {
      return [...data[name].values()].map(copy)
    },
    async put(name, value) {
      ;(data[name] as Map<string, typeof value>).set(value.id, copy(value))
    },
    async remove(name, id) {
      data[name].delete(id)
    },
    async replaceAll(next) {
      for (const name of COLLECTIONS) {
        const m = data[name] as Map<string, { id: string }>
        m.clear()
        for (const v of next[name]) m.set(v.id, copy(v))
      }
      settings = copy(next.settings)
      if (next.deleted) {
        deleted.clear()
        for (const d of next.deleted) deleted.set(tomb(d), copy(d))
      }
    },
    async tombstones() {
      return [...deleted.values()].map(copy)
    },
    async putTombstone(d) {
      deleted.set(tomb(d), copy(d))
    },
    async getSettings() {
      return settings ? copy(settings) : undefined
    },
    async putSettings(s) {
      settings = copy(s)
    },
    async getSecret(key) {
      return secrets.get(key)
    },
    async putSecret(key, value) {
      if (value === undefined || value === '') secrets.delete(key)
      else secrets.set(key, value)
    },
  }
}
