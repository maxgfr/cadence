import { currentMessages } from '../i18n/index.ts'
import { type ExerciseIndex, normalizeName } from '../library/exercises.ts'
import {
  BACKUP_VERSION,
  Backup,
  BackupPart,
  DEFAULT_SETTINGS,
  type Discipline,
  type Exercise,
  type Goal,
  type Note,
  type Program,
  type Session,
  Settings,
} from '../model/schemas.ts'
import { newer, usedIds } from '../sync/merge.ts'
import { migrateGoals, migrateV1 } from './migrate.ts'
import { COLLECTIONS, type CollectionName, type Collections, type Store } from './store.ts'

/** Every part of a backup, in the order they are offered. */
export const BACKUP_PARTS: readonly BackupPart[] = BackupPart.options

/** The collections each part is made of; settings are not a collection. */
const PART_COLLECTIONS: Record<BackupPart, readonly CollectionName[]> = {
  history: ['sessions'],
  exercises: ['exercises', 'disciplines'],
  programs: ['programs'],
  goals: ['goals'],
  notes: ['notes'],
  settings: [],
}

/** The parts a backup holds: all of them unless it says otherwise. */
export function partsOf(backup: Backup): BackupPart[] {
  return backup.parts ? BACKUP_PARTS.filter((p) => backup.parts?.includes(p)) : [...BACKUP_PARTS]
}

/** True when every part is chosen. */
export const isWhole = (parts: readonly BackupPart[]) => BACKUP_PARTS.every((p) => parts.includes(p))

type Lists = { [C in CollectionName]: Collections[C][] }

/**
 * Everything but secrets, as one JSON document; or only some parts, with the exercises and disciplines they use so the
 * file still names them. Only a whole backup carries what was deleted.
 */
export async function exportBackup(
  store: Store,
  now: Date = new Date(),
  parts: readonly BackupPart[] = BACKUP_PARTS,
): Promise<Backup> {
  const [disciplines, exercises, programs, sessions, goals, notes, settings, deleted] = await Promise.all([
    store.all('disciplines'),
    store.all('exercises'),
    store.all('programs'),
    store.all('sessions'),
    store.all('goals'),
    store.all('notes'),
    store.getSettings(),
    store.tombstones(),
  ])
  const head: Pick<Backup, 'app' | 'version' | 'exportedAt'> = {
    app: 'cadence',
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
  }
  if (isWhole(parts))
    return {
      ...head,
      settings: settings ?? DEFAULT_SETTINGS,
      disciplines,
      exercises,
      programs,
      sessions,
      goals,
      notes,
      deleted,
    }
  const has = (p: BackupPart) => parts.includes(p)
  const out: Lists = {
    disciplines: [],
    exercises: [],
    programs: has('programs') ? programs : [],
    sessions: has('history') ? sessions : [],
    goals: has('goals') ? goals : [],
    notes: has('notes') ? notes : [],
  }
  const usedExercises = usedIds('exercises', out)
  out.exercises = has('exercises') ? exercises : exercises.filter((e) => usedExercises.has(e.id))
  const usedDisciplines = usedIds('disciplines', out)
  out.disciplines = has('exercises') ? disciplines : disciplines.filter((d) => usedDisciplines.has(d.id))
  return {
    ...head,
    // The schema needs settings; they only count when the part is chosen.
    settings: has('settings') ? (settings ?? DEFAULT_SETTINGS) : DEFAULT_SETTINGS,
    ...out,
    deleted: [],
    parts: BACKUP_PARTS.filter(has),
  }
}

export class BackupError extends Error {}

/** Validates a backup file's text; throws `BackupError` with a readable reason. */
export function parseBackup(text: string): Backup {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupError(currentMessages().core.backup.notJson)
  }
  if (typeof raw !== 'object' || raw === null || (raw as { app?: unknown }).app !== 'cadence')
    throw new BackupError(currentMessages().core.backup.notCadence)
  const version = (raw as { version?: unknown }).version
  if (
    version !== BACKUP_VERSION &&
    version !== 11 &&
    version !== 10 &&
    version !== 9 &&
    version !== 8 &&
    version !== 7 &&
    version !== 6 &&
    version !== 5 &&
    version !== 4 &&
    version !== 3 &&
    version !== 2 &&
    version !== 1
  )
    throw new BackupError(currentMessages().core.backup.version(String(version)))
  // Version 1: fixed disciplines and built-in exercises, read into today's shape.
  // Versions 2 to 4 differ by what they cannot hold (program layouts, the language) and the names of exercise
  // goals; the language they lack reads as the system's.
  // Before version 6, records have no date and nothing deleted was kept: they read as such.
  // Before version 8, no notes, no exercise description, and sessions name their program day by position.
  // Before version 9, exercises have no photo. Before version 10, programs have no resets.
  // Before version 11, blocks have the same sets throughout and exercise names read as English.
  // Before version 12, a backup holds every part.
  if (
    version === 2 ||
    version === 3 ||
    version === 4 ||
    version === 5 ||
    version === 6 ||
    version === 7 ||
    version === 8 ||
    version === 9 ||
    version === 10 ||
    version === 11
  )
    raw = { ...(raw as object), version: BACKUP_VERSION }
  if (version === 1) {
    try {
      raw = { ...(raw as object), version: BACKUP_VERSION, ...migrateV1(raw as Record<string, unknown[]>) }
    } catch {
      throw new BackupError(currentMessages().core.backup.damagedV1)
    }
  }
  const goals = (raw as { goals?: unknown }).goals
  if (Array.isArray(goals)) raw = { ...(raw as object), goals: migrateGoals(goals) }
  const parsed = Backup.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new BackupError(
      currentMessages().core.backup.damaged(issue ? `${issue.path.join('.')}: ${issue.message}` : ''),
    )
  }
  return parsed.data
}

/** Replaces the device's data with a backup. Secrets on the device are kept. */
export async function importBackup(store: Store, backup: Backup): Promise<void> {
  await store.replaceAll({ ...backup, settings: Settings.parse({ ...backup.settings, onboarded: true }) })
}

/** How an import meets what is on the device: added to it (the newer of each record kept), or in place of it. */
export type ImportMode = 'add' | 'replace'

/** What an import writes: records to put and to remove per collection, the settings when chosen, and how many. */
export interface ImportPlan {
  /** The device's records once imported. */
  data: Lists
  puts: Lists
  removes: { [C in CollectionName]: string[] }
  settings?: Settings
  /** Records taken from the file, per collection. */
  counts: Record<CollectionName, number>
}

/** Sets one collection of a set of lists. */
const setList = <C extends CollectionName>(lists: Lists, c: C, records: Collections[C][]) => {
  ;(lists as Record<C, Collections[C][]>)[c] = records
}

const empty = <T>(make: () => T): { [C in CollectionName]: T } => ({
  disciplines: make(),
  exercises: make(),
  programs: make(),
  sessions: make(),
  goals: make(),
  notes: make(),
})

/** Moves a record's references to other exercises and disciplines (ids not in a map stay). */
function remapper(
  ex: ReadonlyMap<string, string>,
  di: ReadonlyMap<string, string>,
): { [C in CollectionName]: (x: Collections[C]) => Collections[C] } {
  const e = (id: string) => ex.get(id) ?? id
  const d = (id: string | undefined) => (id === undefined ? {} : { disciplineId: di.get(id) ?? id })
  return {
    disciplines: (x: Discipline): Discipline => ({ ...x, id: di.get(x.id) ?? x.id }),
    exercises: (x: Exercise): Exercise => ({ ...x, id: e(x.id), ...d(x.disciplineId) }),
    sessions: (x: Session): Session => ({
      ...x,
      ...d(x.disciplineId),
      entries: x.entries.map((y) => ({
        ...y,
        exerciseId: e(y.exerciseId),
        ...(y.planned ? { planned: { ...y.planned, exerciseId: e(y.planned.exerciseId) } } : {}),
      })),
    }),
    programs: (x: Program): Program => ({
      ...x,
      weeks: x.weeks.map((w) => ({
        ...w,
        days: w.days.map((day) => ({
          ...day,
          ...d(day.disciplineId),
          blocks: day.blocks.map((b) => ({ ...b, exerciseId: e(b.exerciseId) })),
        })),
      })),
    }),
    goals: (x: Goal): Goal => ({
      ...x,
      ...(x.exerciseId === undefined ? {} : { exerciseId: e(x.exerciseId) }),
      ...d(x.disciplineId),
    }),
    notes: (x: Note): Note => x,
  }
}

/** The file's ids named as one of the device's records under another id, mapped to the device's id. */
function sameNames(mine: readonly { id: string; name: string }[], theirs: readonly { id: string; name: string }[]) {
  const ids = new Set(mine.map((x) => x.id))
  const byName = new Map(mine.map((x) => [normalizeName(x.name), x.id]))
  const out = new Map<string, string>()
  for (const x of theirs) {
    const local = byName.get(normalizeName(x.name))
    if (local !== undefined && !ids.has(x.id)) out.set(x.id, local)
  }
  return out
}

/**
 * What importing these parts of a file does to the device's data, as records to write. An exercise or discipline
 * named as one of the device's is that one, and what the file points at it follows. `add` keeps the newer of each
 * record and deletes nothing; `replace` puts the file's records in place of the chosen collections, keeping the
 * device's exercises and disciplines still used by what stays. Without the Exercises part, only the exercises and
 * disciplines the imported records use come, when missing. Records moved to the device's ids, or deleted here since
 * the file's version, are dated `now` so a sync carries them. Nothing is kept as deleted.
 */
export function applyImport(
  current: Backup,
  file: Backup,
  parts: readonly BackupPart[],
  mode: ImportMode,
  now: Date = new Date(),
): ImportPlan {
  const held = partsOf(file)
  const chosen = BACKUP_PARTS.filter((p) => parts.includes(p) && held.includes(p))
  const collections = new Set(chosen.flatMap((p) => PART_COLLECTIONS[p]))
  const ex = sameNames(current.exercises, file.exercises)
  const di = sameNames(current.disciplines, file.disciplines)
  const remap = remapper(ex, di)
  const tombs = new Map(current.deleted.map((d) => [`${d.collection}:${d.id}`, d.deletedAt]))
  // Records whose references moved: dated now when written.
  const moved = new WeakSet<object>()
  const incoming = <C extends CollectionName>(c: C): Collections[C][] =>
    (file[c] as Collections[C][]).map((x) => {
      if (ex.size === 0 && di.size === 0) return x
      const y = remap[c](x)
      if (JSON.stringify(y) !== JSON.stringify(x)) moved.add(y)
      return y
    })

  const puts: Lists = empty(() => [])
  const removes: ImportPlan['removes'] = empty((): string[] => [])
  // The device's data as the import leaves it, so what is still used is known.
  const result: Lists = {
    disciplines: current.disciplines,
    exercises: current.exercises,
    programs: current.programs,
    sessions: current.sessions,
    goals: current.goals,
    notes: current.notes,
  }

  const take = <C extends CollectionName>(c: C, records: readonly Collections[C][], how: ImportMode | 'missing') => {
    const mine = new Map((current[c] as Collections[C][]).map((x) => [x.id, x]))
    // Two of the file's records can meet on one id (two names of one exercise): the newer stays.
    const theirs = new Map<string, Collections[C]>()
    for (const x of records) {
      const had = theirs.get(x.id)
      theirs.set(x.id, had ? newer(had, x) : x)
    }
    const write: Collections[C][] = []
    for (const x of theirs.values()) {
      const local = mine.get(x.id)
      if (local && (how === 'missing' || (how === 'add' && newer(local, x) === local))) continue
      const deletedAt = tombs.get(`${c}:${x.id}`)
      const stale = deletedAt !== undefined && deletedAt >= (x.updatedAt ?? '')
      write.push(moved.has(x) || stale ? { ...x, updatedAt: now.toISOString() } : x)
    }
    setList(puts, c, write)
    const written = new Map(write.map((x) => [x.id, x]))
    let kept = (current[c] as Collections[C][]).map((x) => written.get(x.id) ?? x)
    if (how === 'replace') {
      const used = c === 'exercises' || c === 'disciplines' ? usedIds(c, result) : new Set<string>()
      const gone = new Set([...mine.keys()].filter((id) => !theirs.has(id) && !used.has(id)))
      removes[c] = [...gone]
      kept = kept.filter((x) => !gone.has(x.id))
    }
    setList(result, c, [...kept, ...write.filter((x) => !mine.has(x.id))])
  }

  // What uses exercises and disciplines first, then exercises, then disciplines.
  for (const c of ['programs', 'sessions', 'goals', 'notes'] as const)
    if (collections.has(c)) take(c, incoming(c), mode)
  for (const c of ['exercises', 'disciplines'] as const) {
    if (collections.has(c)) take(c, incoming(c), mode)
    else {
      const used = usedIds(c, puts)
      take(
        c,
        incoming(c).filter((x) => used.has(x.id)),
        'missing',
      )
    }
  }

  return {
    data: result,
    puts,
    removes,
    ...(chosen.includes('settings') ? { settings: Settings.parse({ ...file.settings, onboarded: true }) } : {}),
    counts: Object.fromEntries(COLLECTIONS.map((c) => [c, puts[c].length])) as ImportPlan['counts'],
  }
}

const csvCell = (v: string | number | undefined) => {
  if (v === undefined) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

/** One row per logged set, metric units, for spreadsheets. */
export function sessionsCsv(
  sessions: Backup['sessions'],
  exercises: ExerciseIndex,
  disciplines: ReadonlyMap<string, { name: string }> = new Map(),
): string {
  const header = [
    'date',
    'session',
    'discipline',
    'exercise',
    'set',
    'reps',
    'weight_kg',
    'distance_m',
    'time_s',
    'rpe',
    'done',
    'session_rpe',
    'duration_min',
  ]
  const rows = [header.join(',')]
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date))
  for (const s of sorted) {
    for (const e of s.entries) {
      e.sets.forEach((set, i) => {
        rows.push(
          [
            s.date,
            s.title,
            s.disciplineId ? (disciplines.get(s.disciplineId)?.name ?? '') : '',
            exercises.get(e.exerciseId)?.name ?? e.exerciseId,
            i + 1,
            set.reps,
            set.weight,
            set.distance,
            set.time,
            set.rpe,
            set.done ? 'yes' : 'no',
            s.rpe,
            s.duration,
          ]
            .map(csvCell)
            .join(','),
        )
      })
    }
  }
  return `${rows.join('\n')}\n`
}
