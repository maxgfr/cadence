import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { DemoSport } from '../core/demo/catalog.ts'
import { buildDemo, demoRemoval } from '../core/demo/demo.ts'
import { type ExerciseIndex, indexExercises, sortedExercises } from '../core/library/exercises.ts'
import { todayIso } from '../core/model/dates.ts'
import {
  type Backup,
  DEFAULT_SETTINGS,
  type Discipline,
  type Exercise,
  type Goal,
  type Note,
  type Program,
  type Session,
  Settings,
} from '../core/model/schemas.ts'
import type { PresetSport } from '../core/presets/catalog.ts'
import { buildPreset } from '../core/presets/presets.ts'
import { idbStore } from '../core/storage/idb.ts'
import { migrateGoals, migrateV1, needsGoalMigration, needsMigration } from '../core/storage/migrate.ts'
import { type CollectionName, type Collections, memoryStore, type Store } from '../core/storage/store.ts'

export interface Data {
  store: Store
  /** False when IndexedDB was unavailable and data lives in memory only (lost on reload). */
  persistent: boolean
  /** Counts writes the browser refused (storage full): those changes live in memory only. */
  saveFailures: number
  settings: Settings
  /** The user's disciplines, in the order created. */
  disciplines: Discipline[]
  disciplineIndex: ReadonlyMap<string, Discipline>
  /** The user's exercises, sorted by name. */
  exercises: Exercise[]
  index: ExerciseIndex
  programs: Program[]
  sessions: Session[]
  goals: Goal[]
  /** Free notes, in no order. */
  notes: Note[]
  /** Today's date, refreshed when the app comes back to the foreground. */
  today: string
  put<C extends CollectionName>(name: C, value: Collections[C]): Promise<void>
  remove(name: CollectionName, id: string): Promise<void>
  updateSettings(patch: Partial<Settings>): Promise<void>
  replaceAll(backup: Backup): Promise<void>
  /** Adds the demo for these sports; what already exists (edited demo records included) is left as it is. */
  loadDemo(sports: readonly DemoSport[], withSessions: boolean): Promise<void>
  /** Adds these sports' presets, dated so a sync carries them; returns how many records were new. */
  loadPreset(sports: readonly PresetSport[], withPrograms: boolean): Promise<{ exercises: number; programs: number }>
  /** Removes what the demo added, except what the user's own records still use. */
  removeDemo(): Promise<void>
}

const DataContext = createContext<Data | null>(null)

export function useData(): Data {
  const d = useContext(DataContext)
  if (!d) throw new Error('useData outside DataProvider')
  return d
}

interface Loaded {
  store: Store
  persistent: boolean
  settings: Settings
  disciplines: Discipline[]
  exercises: Exercise[]
  programs: Program[]
  sessions: Session[]
  goals: Goal[]
  notes: Note[]
}

type ListKey = 'disciplines' | 'exercises' | 'programs' | 'sessions' | 'goals' | 'notes'

async function open(): Promise<{ store: Store; persistent: boolean }> {
  try {
    return { store: await idbStore(), persistent: true }
  } catch {
    return { store: memoryStore(), persistent: false }
  }
}

async function load(): Promise<Loaded> {
  const opened = await open()
  try {
    return await loadFrom(opened.store, opened.persistent)
  } catch {
    // Unreadable storage must not leave a blank page: start in memory, as when IndexedDB is missing.
    return loadFrom(memoryStore(), false)
  }
}

async function loadFrom(store: Store, persistent: boolean): Promise<Loaded> {
  const [stored, disciplines, exercises, programs, sessions, goals, notes] = await Promise.all([
    store.getSettings(),
    store.all('disciplines'),
    store.all('exercises'),
    store.all('programs'),
    store.all('sessions'),
    store.all('goals'),
    store.all('notes'),
  ])
  const settings = Settings.parse({ ...DEFAULT_SETTINGS, ...stored })
  let lists = { disciplines, exercises, programs, sessions, goals }
  // Data written by version 1 (fixed disciplines, built-in exercises) is moved to today's shape once.
  // Older data is moved to today's shape once: version 1 (fixed disciplines, built-in exercises), then goals of
  // versions 1 to 3 (`e1rm`, `best_time`).
  const v1 = needsMigration(lists)
  if (v1) lists = migrateV1(lists)
  if (v1 || needsGoalMigration(lists.goals)) {
    lists = { ...lists, goals: migrateGoals(lists.goals) }
    // Migrated in memory either way; a refused write is retried on the next load.
    await store.replaceAll({ ...lists, notes, settings }).catch(() => {})
  }
  return { store, persistent, settings, ...lists, notes }
}

function useToday(): string {
  const [today, setToday] = useState(() => todayIso())
  useEffect(() => {
    const refresh = () => setToday(todayIso())
    document.addEventListener('visibilitychange', refresh)
    const t = setInterval(refresh, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      clearInterval(t)
    }
  }, [])
  return today
}

export function DataProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [state, setLoadedState] = useState<Loaded | null>(null)
  // Actions read the latest state from here: two actions in a row (load the demo, then save settings) must not
  // overwrite each other with the copy they were created with.
  const current = useRef<Loaded | null>(null)
  const setLoaded = useCallback((next: Loaded | null | ((l: Loaded | null) => Loaded | null)) => {
    const value = typeof next === 'function' ? next(current.current) : next
    current.current = value
    setLoadedState(value)
  }, [])
  const today = useToday()
  const [saveFailures, setSaveFailures] = useState(0)
  /**
   * Runs one write. maxgfr.github.io is a single origin shared by many sites, so its storage can be full: a refused
   * write keeps the change in memory and is counted (and reported to the user) instead of thrown.
   */
  const write = useCallback(async (op: () => Promise<void>) => {
    try {
      await op()
    } catch {
      setSaveFailures((n) => n + 1)
    }
  }, [])

  useEffect(() => {
    let live = true
    load().then((l) => {
      if (live) setLoaded(l)
    })
    return () => {
      live = false
    }
  }, [setLoaded])

  const put = useCallback(
    async <C extends CollectionName>(name: C, given: Collections[C]) => {
      const loaded = current.current
      if (!loaded) return
      // Every change is dated: a sync keeps the newest of each record.
      const value = { ...given, updatedAt: new Date().toISOString() }
      await write(() => loaded.store.put(name, value))
      setLoaded((l) => {
        if (!l) return l
        const list = l[name as ListKey] as unknown as { id: string }[]
        const i = list.findIndex((x) => x.id === value.id)
        const next = i < 0 ? [...list, value] : list.map((x, j) => (j === i ? value : x))
        return { ...l, [name]: next }
      })
    },
    [setLoaded, write],
  )

  const remove = useCallback(
    async (name: CollectionName, id: string) => {
      const loaded = current.current
      if (!loaded) return
      await write(() => loaded.store.remove(name, id))
      // Kept as deleted, so a sync deletes it on the other device too (unless changed there since).
      await write(() => loaded.store.putTombstone({ collection: name, id, deletedAt: new Date().toISOString() }))
      setLoaded((l) =>
        l ? { ...l, [name]: (l[name as ListKey] as unknown as { id: string }[]).filter((x) => x.id !== id) } : l,
      )
    },
    [setLoaded, write],
  )

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const loaded = current.current
      if (!loaded) return
      const next = Settings.parse({ ...loaded.settings, ...patch, updatedAt: new Date().toISOString() })
      await write(() => loaded.store.putSettings(next))
      setLoaded((l) => (l ? { ...l, settings: next } : l))
    },
    [setLoaded, write],
  )

  const replaceAll = useCallback(
    async (backup: Backup) => {
      const loaded = current.current
      if (!loaded) return
      const settings = Settings.parse({ ...backup.settings, onboarded: true })
      await write(() => loaded.store.replaceAll({ ...backup, settings }))
      setLoaded((l) =>
        l
          ? {
              ...l,
              settings,
              disciplines: backup.disciplines,
              exercises: backup.exercises,
              programs: backup.programs,
              sessions: backup.sessions,
              goals: backup.goals,
              notes: backup.notes,
            }
          : l,
      )
    },
    [setLoaded, write],
  )

  const loadDemo = useCallback(
    async (sports: readonly DemoSport[], withSessions: boolean) => {
      const loaded = current.current
      if (!loaded) return
      const demo = buildDemo({ sports, withSessions, today: todayIso() })
      const next = { ...loaded }
      for (const key of ['disciplines', 'exercises', 'programs', 'sessions', 'goals'] as const) {
        const have = new Set((loaded[key] as { id: string }[]).map((x) => x.id))
        const fresh = (demo[key] as { id: string }[]).filter((x) => !have.has(x.id))
        for (const x of fresh) await write(() => loaded.store.put(key, x as never))
        ;(next as Record<ListKey, unknown[]>)[key] = [...loaded[key], ...fresh]
      }
      const settings = Settings.parse({ ...loaded.settings, onboarded: true })
      await write(() => loaded.store.putSettings(settings))
      setLoaded({ ...next, settings })
    },
    [setLoaded, write],
  )

  const loadPreset = useCallback(
    async (sports: readonly PresetSport[], withPrograms: boolean) => {
      const loaded = current.current
      if (!loaded) return { exercises: 0, programs: 0 }
      const preset = buildPreset({
        sports,
        withPrograms,
        library: loaded,
        exerciseLanguage: loaded.settings.exerciseLanguage,
      })
      const updatedAt = new Date().toISOString()
      const next = { ...loaded }
      const added = { exercises: 0, programs: 0 }
      for (const key of ['disciplines', 'exercises', 'programs'] as const) {
        const have = new Set(loaded[key].map((x) => x.id))
        const fresh = (preset[key] as { id: string }[]).filter((x) => !have.has(x.id)).map((x) => ({ ...x, updatedAt }))
        for (const x of fresh) await write(() => loaded.store.put(key, x as never))
        ;(next as Record<ListKey, unknown[]>)[key] = [...loaded[key], ...fresh]
        if (key !== 'disciplines') added[key] = fresh.length
      }
      setLoaded({ ...next })
      return added
    },
    [setLoaded, write],
  )

  const removeDemo = useCallback(async () => {
    const loaded = current.current
    if (!loaded) return
    const gone = demoRemoval(loaded)
    const next = { ...loaded }
    for (const key of ['disciplines', 'exercises', 'programs', 'sessions', 'goals'] as const) {
      const ids = new Set(gone[key])
      const deletedAt = new Date().toISOString()
      for (const id of ids) {
        await write(() => loaded.store.remove(key, id))
        await write(() => loaded.store.putTombstone({ collection: key, id, deletedAt }))
      }
      ;(next as Record<ListKey, unknown[]>)[key] = (loaded[key] as { id: string }[]).filter((x) => !ids.has(x.id))
    }
    setLoaded(next)
  }, [setLoaded, write])

  const value = useMemo<Data | null>(() => {
    if (!state) return null
    const exercises = sortedExercises(state.exercises)
    return {
      ...state,
      saveFailures,
      exercises,
      index: indexExercises(exercises),
      disciplineIndex: new Map(state.disciplines.map((d) => [d.id, d])),
      today,
      put,
      remove,
      updateSettings,
      replaceAll,
      loadDemo,
      loadPreset,
      removeDemo,
    }
  }, [state, saveFailures, today, put, remove, updateSettings, replaceAll, loadDemo, loadPreset, removeDemo])

  if (!value) return <>{fallback}</>
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
