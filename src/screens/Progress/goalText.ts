import { currentMessages } from '../../core/i18n/index.ts'
import { formatDecimal } from '../../core/i18n/locale.ts'
import type { ExerciseIndex } from '../../core/library/exercises.ts'
import { formatDay } from '../../core/model/dates.ts'
import type { UnitPrefs } from '../../core/model/program.ts'
import type { Goal } from '../../core/model/schemas.ts'
import { formatDistance, formatTonnage, formatWeight } from '../../core/model/units.ts'
import { measureOf } from '../../core/stats/metrics.ts'
import { formatMeasure } from '../../ui/units.ts'

/** How a goal's values read: kilograms, a time or pace, metres or kilograms a week, sessions a week. */
export function goalFormatter(goal: Goal, index: ExerciseIndex, units: UnitPrefs): (v: number) => string {
  const ex = goal.exerciseId ? index.get(goal.exerciseId) : undefined
  switch (goal.kind) {
    case 'exercise':
      return ex ? (v) => formatMeasure(measureOf(ex), v, units, ex) : (v) => formatWeight(v, units.weightUnit)
    case 'weekly_volume':
      return goal.volume === 'distance'
        ? (v) => formatDistance(v, units.distanceUnit)
        : (v) => formatTonnage(v, units.weightUnit)
    case 'frequency':
      return (v) => currentMessages().progress.perWeek(formatDecimal(v, 1))
  }
}

/** "Squat: estimated 1RM 120 kg by Mon 14 Dec", in the displayed language. */
export function goalTitle(
  goal: Goal,
  index: ExerciseIndex,
  units: UnitPrefs,
  disciplineName: (id: string | undefined) => string | undefined,
): string {
  const t = currentMessages()
  const ex = goal.exerciseId ? index.get(goal.exerciseId) : undefined
  const f = goalFormatter(goal, index, units)
  const date = formatDay(goal.deadline, new Date().getFullYear())
  const scope = disciplineName(goal.disciplineId)
  switch (goal.kind) {
    case 'exercise': {
      const name = ex?.name ?? t.common.exercise
      const target = f(goal.target)
      switch (ex ? measureOf(ex) : 'e1rm') {
        case 'e1rm':
          return t.progress.goalE1rm(name, target, date)
        case 'reps':
          return t.progress.goalReps(name, target, date)
        case 'hold':
          return t.progress.goalHold(name, target, date)
        default:
          return t.progress.goalFaster(name, target, date)
      }
    }
    case 'weekly_volume':
      return scope ? t.progress.goalVolumeIn(scope, f(goal.target), date) : t.progress.goalVolume(f(goal.target), date)
    case 'frequency': {
      const n = Math.round(goal.target)
      return scope ? t.progress.goalFrequencyIn(scope, n, date) : t.progress.goalFrequency(n, date)
    }
  }
}
