/** Calendar-day helpers on `YYYY-MM-DD` strings, in local time. Pure: the clock is always passed in. */

const pad = (n: number) => String(n).padStart(2, '0')

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fromIsoDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

export function todayIso(now: Date = new Date()): string {
  return toIsoDate(now)
}

export function addDays(date: string, days: number): string {
  const d = fromIsoDate(date)
  d.setDate(d.getDate() + days)
  return toIsoDate(d)
}

/** Whole days from `a` to `b` (positive when `b` is later). DST-safe: computed on UTC midnights. */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  const ua = Date.UTC(ay ?? 1970, (am ?? 1) - 1, ad ?? 1)
  const ub = Date.UTC(by ?? 1970, (bm ?? 1) - 1, bd ?? 1)
  return Math.round((ub - ua) / 86_400_000)
}

/** The first day of the week holding `date`; `weekStart` 1 = Monday, 0 = Sunday. */
export function startOfWeek(date: string, weekStart: 0 | 1): string {
  const dow = fromIsoDate(date).getDay()
  const back = (dow - weekStart + 7) % 7
  return addDays(date, -back)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "Mon 14 Oct" (year added when it is not `currentYear`). */
export function formatDay(date: string, currentYear?: number): string {
  const d = fromIsoDate(date)
  const base = `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
  return currentYear !== undefined && d.getFullYear() !== currentYear ? `${base} ${d.getFullYear()}` : base
}

/** "14 Oct" — for axis ticks. */
export function formatShortDay(date: string): string {
  const d = fromIsoDate(date)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export function monthLabel(date: string): string {
  return MONTHS[fromIsoDate(date).getMonth()] ?? ''
}
