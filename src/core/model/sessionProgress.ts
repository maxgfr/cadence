import type { Entry, Session } from './schemas.ts'
import { formatTime } from './units.ts'

/**
 * Past this, a session still open was left open (opened again from the history, days later), not one under way: its
 * clock is not shown.
 */
export const CLOCK_LIMIT_MS = 6 * 3600 * 1000

/** A clock a little ahead of this device's (another device's, through sync) still reads as just started. */
const CLOCK_SKEW_MS = 60 * 1000

/** The time a session in progress has been running, as the logging screen's bar shows it. */
export interface SessionClock {
  /** Whole seconds since the start. */
  seconds: number
  /** Whole minutes since the start, for the spoken label. */
  minutes: number
  /** "m:ss", "h:mm:ss" past an hour. */
  text: string
}

/**
 * The running time of a session at `now` (ms since epoch), or undefined when no clock makes sense: the session is
 * done, has no start, or its start is too far away to be the session under way.
 */
export function sessionClock(session: Pick<Session, 'status' | 'startedAt'>, now: number): SessionClock | undefined {
  if (session.status !== 'active' || !session.startedAt) return undefined
  const start = Date.parse(session.startedAt)
  if (!Number.isFinite(start)) return undefined
  const ms = now - start
  if (ms < -CLOCK_SKEW_MS || ms >= CLOCK_LIMIT_MS) return undefined
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return { seconds, minutes: Math.floor(seconds / 60), text: formatTime(seconds, false) }
}

/**
 * Where the athlete is in a session: the exercise they are on (`index` counted from 1), all of them done, or nothing
 * to say yet.
 */
export type SessionPosition =
  | { kind: 'at'; index: number; total: number; entryId: string }
  | { kind: 'done'; total: number }
  | { kind: 'none' }

/**
 * The exercise the athlete is on: the first one with a set still to tick. Every set ticked is "done"; no exercise, or
 * no set at all, says nothing.
 */
export function sessionPosition(entries: readonly Pick<Entry, 'id' | 'sets'>[]): SessionPosition {
  const at = entries.findIndex((e) => e.sets.some((s) => !s.done))
  const current = entries[at]
  if (current) return { kind: 'at', index: at + 1, total: entries.length, entryId: current.id }
  if (entries.some((e) => e.sets.length > 0)) return { kind: 'done', total: entries.length }
  return { kind: 'none' }
}
