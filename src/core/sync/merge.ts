import { type Backup, COLLECTION_NAMES, type Deleted, Settings } from '../model/schemas.ts'

/**
 * Two devices' data as one: each record keeps its newest version (`updatedAt`), a deletion wins over any version
 * that is not newer than it, settings keep the newest. Symmetric and deterministic: both devices compute the same
 * result from the same two snapshots, whichever is "local".
 */

type Collection = (typeof COLLECTION_NAMES)[number]
type Rec = { id: string; updatedAt?: string }

/** How many records each side gets from the other, per collection. */
export type Counts = Record<Collection, number>

export interface MergeResult {
  merged: Backup
  /** Records this device gets from the other one (new, newer, or deleted there). */
  received: Counts
  /** Records the other device gets from this one. */
  sent: Counts
}

const zero = (): Counts => ({ disciplines: 0, exercises: 0, programs: 0, sessions: 0, goals: 0 })

/** A stable text of a record, so two versions with the same date are ordered the same on both devices. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`
  return JSON.stringify(v)
}

const stamp = (r: Rec | undefined) => r?.updatedAt ?? ''

/** The newer of two versions of a record; with the same date, the same one on both devices. */
function newer<T extends Rec>(a: T, b: T): T {
  const sa = stamp(a)
  const sb = stamp(b)
  if (sa !== sb) return sa > sb ? a : b
  return canonical(a) >= canonical(b) ? a : b
}

const same = (a: unknown, b: unknown) => canonical(a) === canonical(b)

export function mergeSnapshots(local: Backup, remote: Backup, now: Date = new Date()): MergeResult {
  const received = zero()
  const sent = zero()
  const deleted: Deleted[] = []
  const out: Record<Collection, Rec[]> = { disciplines: [], exercises: [], programs: [], sessions: [], goals: [] }

  for (const c of COLLECTION_NAMES) {
    const mine = new Map((local[c] as Rec[]).map((r) => [r.id, r]))
    const theirs = new Map((remote[c] as Rec[]).map((r) => [r.id, r]))
    const tombs = new Map<string, Deleted>()
    for (const d of [...local.deleted, ...remote.deleted]) {
      if (d.collection !== c) continue
      const had = tombs.get(d.id)
      if (!had || d.deletedAt > had.deletedAt) tombs.set(d.id, d)
    }
    const ids = [...new Set([...mine.keys(), ...theirs.keys(), ...tombs.keys()])].sort()
    for (const id of ids) {
      const a = mine.get(id)
      const b = theirs.get(id)
      const winner = a && b ? newer(a, b) : (a ?? b)
      const tomb = tombs.get(id)
      // A deletion wins over every version not changed after it.
      const kept = winner && !(tomb && tomb.deletedAt >= stamp(winner)) ? winner : undefined
      if (kept) out[c].push(kept)
      else if (tomb) deleted.push(tomb)
      if (!same(a, kept)) received[c]++
      if (!same(b, kept)) sent[c]++
    }
  }

  const ls = local.settings
  const rs = remote.settings
  const settings = Settings.parse({
    ...((rs.updatedAt ?? '') > (ls.updatedAt ?? '') ? rs : ls),
    onboarded: ls.onboarded || rs.onboarded,
  })

  return {
    merged: {
      app: 'cadence',
      version: local.version,
      exportedAt: now.toISOString(),
      settings,
      disciplines: out.disciplines as Backup['disciplines'],
      exercises: out.exercises as Backup['exercises'],
      programs: out.programs as Backup['programs'],
      sessions: out.sessions as Backup['sessions'],
      goals: out.goals as Backup['goals'],
      deleted,
    },
    received,
    sent,
  }
}

export const total = (c: Counts) => Object.values(c).reduce((n, v) => n + v, 0)
