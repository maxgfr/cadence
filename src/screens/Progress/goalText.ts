import type { ExerciseIndex } from '../../core/library/exercises.ts'
import { formatDay } from '../../core/model/dates.ts'
import type { UnitPrefs } from '../../core/model/program.ts'
import type { Goal } from '../../core/model/schemas.ts'
import { formatDistance, formatTime, formatTonnage, formatWeight } from '../../core/model/units.ts'
import { measureOf } from '../../core/stats/metrics.ts'
import { formatMeasure } from '../../ui/units.ts'

/** How a goal's values read: kilograms, a time or pace, metres or kilograms a week, sessions a week. */
export function goalFormatter(goal: Goal, index: ExerciseIndex, units: UnitPrefs): (v: number) => string {
  const ex = goal.exerciseId ? index.get(goal.exerciseId) : undefined
  switch (goal.kind) {
    case 'e1rm':
      return (v) => formatWeight(v, units.weightUnit)
    case 'best_time':
      return ex ? (v) => formatMeasure(measureOf(ex), v, units, ex) : (v) => formatTime(v)
    case 'weekly_volume':
      return goal.volume === 'distance'
        ? (v) => formatDistance(v, units.distanceUnit)
        : (v) => formatTonnage(v, units.weightUnit)
    case 'frequency':
      return (v) => `${Math.round(v * 10) / 10} / week`
  }
}

export function goalTitle(
  goal: Goal,
  index: ExerciseIndex,
  units: UnitPrefs,
  disciplineName: (id: string | undefined) => string | undefined,
): string {
  const ex = goal.exerciseId ? index.get(goal.exerciseId) : undefined
  const f = goalFormatter(goal, index, units)
  const by = `by ${formatDay(goal.deadline, new Date().getFullYear())}`
  const scope = disciplineName(goal.disciplineId)
  switch (goal.kind) {
    case 'e1rm':
      return `${ex?.name ?? 'Lift'}: estimated 1RM ${f(goal.target)} ${by}`
    case 'best_time':
      return `${ex?.name ?? 'Effort'}: ${f(goal.target)} or faster ${by}`
    case 'weekly_volume':
      return `${scope ? `${scope}: ` : ''}${f(goal.target)} a week ${by}`
    case 'frequency':
      return `${Math.round(goal.target)} ${scope ? `${scope} ` : ''}sessions a week ${by}`
  }
}
