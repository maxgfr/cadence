import { useData } from '../app/data.tsx'
import type { UnitPrefs } from '../core/model/program.ts'
import type { Exercise } from '../core/model/schemas.ts'
import { formatPace100, formatTime, formatWeight, NBSP } from '../core/model/units.ts'
import type { MeasureKind } from '../core/stats/metrics.ts'

export function useUnits(): UnitPrefs {
  const { settings } = useData()
  return { weightUnit: settings.weightUnit, distanceUnit: settings.distanceUnit }
}

/** A measure's value as the athlete reads it: "121.5 kg", "7.92 s", "1:32 /100 m", "12 reps". */
export function formatMeasure(kind: MeasureKind, value: number, units: UnitPrefs, exercise?: Exercise): string {
  switch (kind) {
    case 'e1rm':
      return formatWeight(value, units.weightUnit)
    case 'reps':
      return `${Math.round(value)}${NBSP}reps`
    case 'hold':
      return formatTime(value, false)
    case 'best_time':
      return formatTime(value)
    case 'pace':
      if (exercise?.discipline === 'run') return `${formatTime(value * 10, false)}${NBSP}/km`
      return formatPace100(value, units.distanceUnit)
  }
}

export const MEASURE_LABEL: Record<MeasureKind, string> = {
  e1rm: 'Estimated 1RM',
  reps: 'Most reps',
  hold: 'Longest hold',
  best_time: 'Best time',
  pace: 'Best pace',
}
