import type { ExerciseIndex } from '../library/exercises.ts'
import { BACKUP_VERSION, Backup, DEFAULT_SETTINGS, Settings } from '../model/schemas.ts'
import { migrateGoals, migrateV1 } from './migrate.ts'
import type { Store } from './store.ts'

/** Everything but secrets, as one JSON document. */
export async function exportBackup(store: Store, now: Date = new Date()): Promise<Backup> {
  const [disciplines, exercises, programs, sessions, goals, settings] = await Promise.all([
    store.all('disciplines'),
    store.all('exercises'),
    store.all('programs'),
    store.all('sessions'),
    store.all('goals'),
    store.getSettings(),
  ])
  return {
    app: 'cadence',
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    settings: settings ?? DEFAULT_SETTINGS,
    disciplines,
    exercises,
    programs,
    sessions,
    goals,
  }
}

export class BackupError extends Error {}

/** Validates a backup file's text; throws `BackupError` with a readable reason. */
export function parseBackup(text: string): Backup {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupError('This file is not JSON.')
  }
  if (typeof raw !== 'object' || raw === null || (raw as { app?: unknown }).app !== 'cadence')
    throw new BackupError('This file is not a Cadence backup.')
  const version = (raw as { version?: unknown }).version
  if (version !== BACKUP_VERSION && version !== 3 && version !== 2 && version !== 1)
    throw new BackupError(
      `This backup uses format version ${String(version)}, which this version of Cadence cannot read.`,
    )
  // Version 1: fixed disciplines and built-in exercises, read into today's shape.
  // Versions 2 and 3 differ by what they cannot hold (program layouts) and the names of exercise goals.
  if (version === 2 || version === 3) raw = { ...(raw as object), version: BACKUP_VERSION }
  if (version === 1) {
    try {
      raw = { ...(raw as object), version: BACKUP_VERSION, ...migrateV1(raw as Record<string, unknown[]>) }
    } catch {
      throw new BackupError('The backup is damaged (its version 1 records could not be read).')
    }
  }
  const goals = (raw as { goals?: unknown }).goals
  if (Array.isArray(goals)) raw = { ...(raw as object), goals: migrateGoals(goals) }
  const parsed = Backup.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new BackupError(`The backup is damaged${issue ? ` (${issue.path.join('.')}: ${issue.message})` : ''}.`)
  }
  return parsed.data
}

/** Replaces the device's data with a backup. Secrets on the device are kept. */
export async function importBackup(store: Store, backup: Backup): Promise<void> {
  await store.replaceAll({ ...backup, settings: Settings.parse({ ...backup.settings, onboarded: true }) })
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
