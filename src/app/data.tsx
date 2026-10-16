import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { type ExerciseIndex, indexExercises, library } from '../core/library/exercises.ts'
import { todayIso } from '../core/model/dates.ts'
import {
  type Backup,
  DEFAULT_SETTINGS,
  type Exercise,
  type Goal,
  type Program,
  type Session,
  Settings,
} from '../core/model/schemas.ts'
import { idbStore } from '../core/storage/idb.ts'
import { type CollectionName, type Collections, memoryStore, type Store } from '../core/storage/store.ts'

export interface Data {
  store: Store
  /** False when IndexedDB was unavailable and data lives in memory only (lost on reload). */
  persistent: boolean
  settings: Settings
  /** The user's own exercises. */
  custom: Exercise[]
  /** Built-ins, then the user's own. */
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
  custom: Exercise[]
  programs: Program[]
  sessions: Session[]
  goals: Goal[]
}

const KEY: Record<CollectionName, keyof Loaded> = {
  exercises: 'custom',
  programs: 'programs',
  sessions: 'sessions',
  goals: 'goals',
}

async function open(): Promise<{ store: Store; persistent: boolean }> {
  try {
    return { store: await idbStore(), persistent: true }
  } catch {
    return { store: memoryStore(), persistent: false }
  }
}

async function load(): Promise<Loaded> {
  const { store, persistent } = await open()
  const [settings, custom, programs, sessions, goals] = await Promise.all([
    store.getSettings(),
    store.all('exercises'),
    store.all('programs'),
    store.all('sessions'),
    store.all('goals'),
  ])
  return {
    store,
    persistent,
    settings: Settings.parse({ ...DEFAULT_SETTINGS, ...settings }),
    custom,
    programs,
    sessions,
    goals,
  }
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
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const today = useToday()

  useEffect(() => {
    let live = true
    load().then((l) => {
      if (live) setLoaded(l)
    })
    return () => {
      live = false
    }
  }, [])

  const put = useCallback(
    async <C extends CollectionName>(name: C, value: Collections[C]) => {
      if (!loaded) return
      await loaded.store.put(name, value)
      setLoaded((l) => {
        if (!l) return l
        const key = KEY[name]
        const list = l[key] as unknown as { id: string }[]
        const i = list.findIndex((x) => x.id === value.id)
        const next = i < 0 ? [...list, value] : list.map((x, j) => (j === i ? value : x))
        return { ...l, [key]: next }
      })
    },
    [loaded],
  )

  const remove = useCallback(
    async (name: CollectionName, id: string) => {
      if (!loaded) return
      await loaded.store.remove(name, id)
      setLoaded((l) => {
        if (!l) return l
        const key = KEY[name]
        return { ...l, [key]: (l[key] as unknown as { id: string }[]).filter((x) => x.id !== id) }
      })
    },
    [loaded],
  )

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      if (!loaded) return
      const next = Settings.parse({ ...loaded.settings, ...patch })
      await loaded.store.putSettings(next)
      setLoaded((l) => (l ? { ...l, settings: next } : l))
    },
    [loaded],
  )

  const replaceAll = useCallback(
    async (backup: Backup) => {
      if (!loaded) return
      const settings = Settings.parse({ ...backup.settings, onboarded: true })
      await loaded.store.replaceAll({ ...backup, settings })
      setLoaded((l) =>
        l
          ? {
              ...l,
              settings,
              custom: backup.exercises,
              programs: backup.programs,
              sessions: backup.sessions,
              goals: backup.goals,
            }
          : l,
      )
    },
    [loaded],
  )

  const value = useMemo<Data | null>(() => {
    if (!loaded) return null
    const exercises = library(loaded.custom)
    return {
      ...loaded,
      exercises,
      index: indexExercises(exercises),
      today,
      put,
      remove,
      updateSettings,
      replaceAll,
    }
  }, [loaded, today, put, remove, updateSettings, replaceAll])

  if (!value) return <>{fallback}</>
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
