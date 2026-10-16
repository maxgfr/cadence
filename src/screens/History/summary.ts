import type { ExerciseIndex } from '../../core/library/exercises.ts'
import type { UnitPrefs } from '../../core/model/program.ts'
import type { Session } from '../../core/model/schemas.ts'
import { formatDistance, formatTonnage, NBSP } from '../../core/model/units.ts'
import { doneSets } from '../../core/stats/metrics.ts'

/** "12 sets · 4.2 t · 45 min": what a session amounted to, in one line. */
export function sessionSummary(s: Session, index: ExerciseIndex, units: UnitPrefs): string {
  let sets = 0
  let tonnage = 0
  let meters = 0
  for (const e of s.entries) {
    const ex = index.get(e.exerciseId)
    for (const set of doneSets(e)) {
      sets++
      if (ex?.metric === 'weight_reps' && set.weight !== undefined && set.reps !== undefined)
        tonnage += set.weight * set.reps
      if (ex?.metric === 'distance_time') meters += set.distance ?? ex.distance ?? 0
    }
  }
  const parts = [`${sets}${NBSP}${sets === 1 ? 'set' : 'sets'}`]
  if (tonnage > 0) parts.push(formatTonnage(tonnage, units.weightUnit))
  if (meters > 0) parts.push(formatDistance(meters, units.distanceUnit))
  if (s.duration) parts.push(`${s.duration}${NBSP}min`)
  if (s.rpe) parts.push(`RPE${NBSP}${s.rpe}`)
  return parts.join(' · ')
}
