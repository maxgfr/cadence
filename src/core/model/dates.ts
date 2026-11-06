import { displayLocale, LOCALE_TAGS } from '../i18n/locale.ts'

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

const formats = new Map<string, Intl.DateTimeFormat>()
/** French and German read through `Intl`; English keeps its own short names ("Sep", not "Sept"). */
function intl(options: Intl.DateTimeFormatOptions, key: string): Intl.DateTimeFormat {
  const locale = displayLocale()
  const k = `${locale}:${key}`
  let f = formats.get(k)
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALE_TAGS[locale], options)
    formats.set(k, f)
  }
  return f
}

/** "Mon 14 Oct", "lun. 14 oct.", "Mo. 14. Okt." (year added when it is not `currentYear`). */
export function formatDay(date: string, currentYear?: number): string {
  const d = fromIsoDate(date)
  const withYear = currentYear !== undefined && d.getFullYear() !== currentYear
  if (displayLocale() !== 'en')
    return withYear
      ? intl({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }, 'dayYear').format(d)
      : intl({ weekday: 'short', day: 'numeric', month: 'short' }, 'day').format(d)
  const base = `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
  return withYear ? `${base} ${d.getFullYear()}` : base
}

/** "14 Oct" — for axis ticks. */
export function formatShortDay(date: string): string {
  const d = fromIsoDate(date)
  if (displayLocale() !== 'en') return intl({ day: 'numeric', month: 'short' }, 'short').format(d)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** A weekday's short name, 0 = Sunday: "Mon", "lun.", "Mo". */
export function weekdayShort(dow: number): string {
  if (displayLocale() !== 'en') return intl({ weekday: 'short' }, 'weekday').format(new Date(2024, 0, 7 + dow))
  return WEEKDAYS[dow] ?? ''
}

export function monthLabel(date: string): string {
  if (displayLocale() !== 'en') return intl({ month: 'short' }, 'month').format(fromIsoDate(date))
  return MONTHS[fromIsoDate(date).getMonth()] ?? ''
}
