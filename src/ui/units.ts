import { useData } from '../app/data.tsx'
import { currentMessages } from '../core/i18n/index.ts'
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
      return currentMessages().forms.repsValue(Math.round(value))
    case 'hold':
      return formatTime(value, false)
    case 'best_time':
      return formatTime(value)
    case 'pace':
      if (exercise?.pace === 'km') return `${formatTime(value * 10, false)}${NBSP}/km`
      return formatPace100(value, units.distanceUnit)
  }
}
