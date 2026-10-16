import { Check } from 'lucide-react'
import type { UnitPrefs } from '../../core/model/program.ts'
import type { Block, Exercise, SetLog } from '../../core/model/schemas.ts'
import {
  fromDisplayDistance,
  fromDisplayWeight,
  parseTime,
  toDisplayDistance,
  toDisplayWeight,
} from '../../core/model/units.ts'
import { NumberInput } from '../../ui/components/NumberInput.tsx'
import { cx } from '../../ui/cx.ts'
import { useUnits } from '../../ui/units.ts'
import styles from './Log.module.css'

export type SetField = 'weight' | 'reps' | 'distance' | 'time' | 'rpe'

export interface Columns {
  fields: SetField[]
  template: string
  label: (f: SetField, units: UnitPrefs) => string
}

/** Which inputs a set row has: what the exercise is measured by, plus effort per set in Advanced mode. */
export function setColumns(exercise: Exercise | undefined, advanced: boolean): Columns {
  const metric = exercise?.metric ?? 'weight_reps'
  const fields: SetField[] =
    metric === 'weight_reps'
      ? ['weight', 'reps']
      : metric === 'reps'
        ? ['reps']
        : metric === 'time'
          ? ['time']
          : exercise?.distance !== undefined
            ? ['time']
            : ['distance', 'time']
  if (advanced) fields.push('rpe')
  return {
    fields,
    template: `2rem ${fields.map((f) => (f === 'rpe' ? 'minmax(3.5rem, 0.7fr)' : 'minmax(4rem, 1fr)')).join(' ')} var(--hit-large)`,
    label: (f, units) =>
      ({
        weight: units.weightUnit,
        reps: 'Reps',
        distance: units.distanceUnit === 'm' ? 'Metres' : 'Yards',
        time: 'Time',
        rpe: 'RPE',
      })[f],
  }
}

const trimNum = (v: number, digits = 1) => String(Math.round(v * 10 ** digits) / 10 ** digits)
/** Seconds as typed back: "7.12", "1:05.3", "12:30". */
const clock = (v: number) => {
  if (v < 60) return trimNum(v, 2)
  const h = Math.floor(v / 3600)
  const m = Math.floor((v % 3600) / 60)
  const s = v % 60
  const ss = s % 1 === 0 ? String(s).padStart(2, '0') : s.toFixed(1).padStart(4, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

interface SetRowProps {
  index: number
  set: SetLog
  exercise: Exercise | undefined
  columns: Columns
  planned: Block | undefined
  onChange: (next: SetLog) => void
}

export function SetRow({ index, set, exercise, columns, planned, onChange }: SetRowProps) {
  const units = useUnits()
  const name = exercise?.name ?? 'Exercise'
  const field = (f: SetField) => {
    const label = `${name}, set ${index + 1}, ${columns.label(f, units)}`
    const common = { className: styles.cell, 'aria-label': label }
    switch (f) {
      case 'weight':
        return (
          <NumberInput
            {...common}
            value={set.weight === undefined ? undefined : toDisplayWeight(set.weight, units.weightUnit)}
            onChange={(v) =>
              onChange(patch(set, 'weight', v === undefined ? undefined : fromDisplayWeight(v, units.weightUnit)))
            }
            format={(v) => trimNum(v, units.weightUnit === 'kg' ? 2 : 1)}
            placeholder="–"
          />
        )
      case 'reps':
        return (
          <NumberInput
            {...common}
            inputMode="numeric"
            value={set.reps}
            onChange={(v) => onChange(patch(set, 'reps', v === undefined ? undefined : Math.round(v)))}
            placeholder={planned?.reps !== undefined ? String(planned.reps) : '–'}
          />
        )
      case 'distance':
        return (
          <NumberInput
            {...common}
            value={set.distance === undefined ? undefined : toDisplayDistance(set.distance, units.distanceUnit)}
            onChange={(v) =>
              onChange(patch(set, 'distance', v === undefined ? undefined : fromDisplayDistance(v, units.distanceUnit)))
            }
            format={(v) => trimNum(v, 0)}
            placeholder="–"
          />
        )
      case 'time':
        return (
          <NumberInput
            {...common}
            value={set.time}
            onChange={(v) => onChange(patch(set, 'time', v))}
            format={clock}
            parse={parseTime}
            placeholder={planned?.duration !== undefined ? clock(planned.duration) : 'm:ss'}
          />
        )
      case 'rpe':
        return (
          <NumberInput
            {...common}
            value={set.rpe}
            onChange={(v) => onChange(patch(set, 'rpe', v === undefined ? undefined : Math.min(10, Math.max(1, v))))}
            placeholder="–"
          />
        )
    }
  }
  return (
    <div className={cx(styles.row, set.done && styles.rowDone)} style={{ gridTemplateColumns: columns.template }}>
      <span className={styles.setNumber}>{index + 1}</span>
      {columns.fields.map((f) => (
        <span key={f}>{field(f)}</span>
      ))}
      <span>
        <button
          type="button"
          className={styles.tick}
          aria-pressed={set.done}
          aria-label={`${name}, set ${index + 1} done`}
          onClick={() => onChange({ ...set, done: !set.done })}
        >
          <Check size={22} strokeWidth={2.5} aria-hidden="true" />
        </button>
      </span>
    </div>
  )
}

function patch<K extends keyof SetLog>(set: SetLog, key: K, value: SetLog[K] | undefined): SetLog {
  const next = { ...set }
  if (value === undefined) delete next[key]
  else next[key] = value
  return next
}
