import type { Settings } from './schemas.ts'

/** Display conversions. Storage is always kg and metres; only what the user reads and types changes. */

export const LB_PER_KG = 2.204_622_62
export const YD_PER_M = 1.093_613_3

export type WeightUnit = Settings['weightUnit']
export type DistanceUnit = Settings['distanceUnit']

const round = (n: number, step: number) => Math.round(n / step) * step

export function toDisplayWeight(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kg * LB_PER_KG
}

export function fromDisplayWeight(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : value / LB_PER_KG
}

export function toDisplayDistance(m: number, unit: DistanceUnit): number {
  return unit === 'm' ? m : m * YD_PER_M
}

export function fromDisplayDistance(value: number, unit: DistanceUnit): number {
  return unit === 'm' ? value : value / YD_PER_M
}

/** Joins a value to its unit so a line never breaks between them. */
export const NBSP = '\u00a0'

const trim = (n: number, digits: number) => {
  const s = n.toFixed(digits)
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s
}

/** "82.5 kg", "182 lb". */
export function formatWeight(kg: number, unit: WeightUnit, withUnit = true): string {
  const v = toDisplayWeight(kg, unit)
  const s = unit === 'kg' ? trim(round(v, 0.1), 1) : trim(round(v, 0.5), 1)
  return withUnit ? `${s}${NBSP}${unit}` : s
}

/** "1,500 m", "4.2 km", "1,640 yd". */
export function formatDistance(m: number, unit: DistanceUnit): string {
  const v = toDisplayDistance(m, unit)
  if (unit === 'm' && v >= 10_000) return `${trim(v / 1000, 1)}${NBSP}km`
  return `${Math.round(v).toLocaleString('en-US')}${NBSP}${unit}`
}

/** A tonnage: "12.4 t", "8,450 kg", or pounds. */
export function formatTonnage(kg: number, unit: WeightUnit): string {
  if (unit === 'kg')
    return kg >= 10_000 ? `${trim(kg / 1000, 1)}${NBSP}t` : `${Math.round(kg).toLocaleString('en-US')}${NBSP}kg`
  const lb = toDisplayWeight(kg, unit)
  return lb >= 10_000 ? `${trim(lb / 1000, 1)}k${NBSP}lb` : `${Math.round(lb).toLocaleString('en-US')}${NBSP}lb`
}

/**
 * A duration in seconds: sprint precision under a minute ("7.12 s"), clock form above ("1:05.3", "12:30",
 * "1:02:05").
 */
export function formatTime(seconds: number, precise = true): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '–'
  if (seconds < 60 && precise) return `${trim(seconds, 2)}${NBSP}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const ss = precise && s % 1 !== 0 ? s.toFixed(1).padStart(4, '0') : String(Math.round(s)).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** Parses "7.12", "1:05.3", "12:30", "1:02:05" into seconds; undefined when it is not a time. */
export function parseTime(text: string): number | undefined {
  const t = text.trim().replace(',', '.')
  if (t === '') return undefined
  if (!/^\d+(?::\d{1,2})*(?:\.\d+)?$/.test(t)) return undefined
  const parts = t.split(':').map(Number)
  if (parts.some((p) => !Number.isFinite(p))) return undefined
  let total = 0
  for (const p of parts) total = total * 60 + p
  return total
}

/** Pace per 100 of the display unit: "1:32 /100 m". */
export function formatPace100(secondsPer100m: number, unit: DistanceUnit): string {
  const per100 = unit === 'm' ? secondsPer100m : secondsPer100m / YD_PER_M
  return `${formatTime(per100, false)}${NBSP}/100${NBSP}${unit}`
}
