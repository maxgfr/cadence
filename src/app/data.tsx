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
  type Program,
  type Session,
  Settings,
} from '../core/model/schemas.ts'
import { idbStore } from '../core/storage/idb.ts'
import { migrateGoals, migrateV1, needsGoalMigration, needsMigration } from '../core/storage/migrate.ts'
import { type CollectionName, type Collections, memoryStore, type Store } from '../core/storage/store.ts'

export interface Data {
  store: Store
  /** False when IndexedDB was unavailable and data lives in memory only (lost on reload). */
  persistent: boolean
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
  /** Today's date, refreshed when the app comes back to the foreground. */
  today: string
  put<C extends CollectionName>(name: C, value: Collections[C]): Promise<void>
  remove(name: CollectionName, id: string): Promise<void>
  updateSettings(patch: Partial<Settings>): Promise<void>
  replaceAll(backup: Backup): Promise<void>
  /** Adds the demo for these sports; what already exists (edited demo records included) is left as it is. */
  loadDemo(sports: readonly DemoSport[], withSessions: boolean): Promise<void>
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
}

type ListKey = 'disciplines' | 'exercises' | 'programs' | 'sessions' | 'goals'

async function open(): Promise<{ store: Store; persistent: boolean }> {
  try {
    return { store: await idbStore(), persistent: true }
  } catch {
    return { store: memoryStore(), persistent: false }
  }
}

async function load(): Promise<Loaded> {
  const { store, persistent } = await open()
  const [stored, disciplines, exercises, programs, sessions, goals] = await Promise.all([
    store.getSettings(),
    store.all('disciplines'),
    store.all('exercises'),
    store.all('programs'),
    store.all('sessions'),
    store.all('goals'),
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
    await store.replaceAll({ ...lists, settings })
  }
  return { store, persistent, settings, ...lists }
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
    async <C extends CollectionName>(name: C, value: Collections[C]) => {
      const loaded = current.current
      if (!loaded) return
      await loaded.store.put(name, value)
      setLoaded((l) => {
        if (!l) return l
        const list = l[name as ListKey] as unknown as { id: string }[]
        const i = list.findIndex((x) => x.id === value.id)
        const next = i < 0 ? [...list, value] : list.map((x, j) => (j === i ? value : x))
        return { ...l, [name]: next }
      })
    },
    [setLoaded],
  )

  const remove = useCallback(
    async (name: CollectionName, id: string) => {
      const loaded = current.current
      if (!loaded) return
      await loaded.store.remove(name, id)
      setLoaded((l) =>
        l ? { ...l, [name]: (l[name as ListKey] as unknown as { id: string }[]).filter((x) => x.id !== id) } : l,
      )
    },
    [setLoaded],
  )

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const loaded = current.current
      if (!loaded) return
      const next = Settings.parse({ ...loaded.settings, ...patch })
      await loaded.store.putSettings(next)
      setLoaded((l) => (l ? { ...l, settings: next } : l))
    },
    [setLoaded],
  )

  const replaceAll = useCallback(
    async (backup: Backup) => {
      const loaded = current.current
      if (!loaded) return
      const settings = Settings.parse({ ...backup.settings, onboarded: true })
      await loaded.store.replaceAll({ ...backup, settings })
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
            }
          : l,
      )
    },
    [setLoaded],
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
        for (const x of fresh) await loaded.store.put(key, x as never)
        ;(next as Record<ListKey, unknown[]>)[key] = [...loaded[key], ...fresh]
      }
      // The first demo program becomes the current one when there is none.
      const settings = Settings.parse({
        ...loaded.settings,
        onboarded: true,
        ...(!loaded.settings.activeProgramId && demo.programs[0] ? { activeProgramId: demo.programs[0].id } : {}),
      })
      await loaded.store.putSettings(settings)
      setLoaded({ ...next, settings })
    },
    [setLoaded],
  )

  const removeDemo = useCallback(async () => {
    const loaded = current.current
    if (!loaded) return
    const gone = demoRemoval(loaded)
    const next = { ...loaded }
    for (const key of ['disciplines', 'exercises', 'programs', 'sessions', 'goals'] as const) {
      const ids = new Set(gone[key])
      for (const id of ids) await loaded.store.remove(key, id)
      ;(next as Record<ListKey, unknown[]>)[key] = (loaded[key] as { id: string }[]).filter((x) => !ids.has(x.id))
    }
    const active = loaded.settings.activeProgramId
    const settings =
      active && gone.programs.includes(active) ? { ...loaded.settings, activeProgramId: undefined } : loaded.settings
    if (settings !== loaded.settings) await loaded.store.putSettings(settings)
    setLoaded({ ...next, settings })
  }, [setLoaded])

  const value = useMemo<Data | null>(() => {
    if (!state) return null
    const exercises = sortedExercises(state.exercises)
    return {
      ...state,
      exercises,
      index: indexExercises(exercises),
      disciplineIndex: new Map(state.disciplines.map((d) => [d.id, d])),
      today,
      put,
      remove,
      updateSettings,
      replaceAll,
      loadDemo,
      removeDemo,
    }
  }, [state, today, put, remove, updateSettings, replaceAll, loadDemo, removeDemo])

  if (!value) return <>{fallback}</>
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
