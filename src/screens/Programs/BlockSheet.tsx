import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useData } from '../../app/data.tsx'
import type { Block, IntensityKind } from '../../core/model/schemas.ts'
import {
  formatTime,
  fromDisplayDistance,
  fromDisplayWeight,
  parseTime,
  toDisplayDistance,
  toDisplayWeight,
} from '../../core/model/units.ts'
import { Button } from '../../ui/components/Button.tsx'
import { Field } from '../../ui/components/Field.tsx'
import { SelectField } from '../../ui/components/SelectField.tsx'
import { Sheet } from '../../ui/components/Sheet.tsx'
import { ExercisePicker } from '../../ui/ExercisePicker.tsx'
import { useUnits } from '../../ui/units.ts'
import styles from './Programs.module.css'

interface BlockSheetProps {
  block: Block | null
  onClose: () => void
  onSave: (block: Block) => void
  onDelete: () => void
}

/** Edits one planned block. Normal mode shows volume only; Advanced adds intensity, rest, interval and tempo. */
export function BlockSheet({ block, onClose, onSave, onDelete }: BlockSheetProps) {
  return (
    <Sheet open={block !== null} title="Planned exercise" onClose={onClose}>
      {block && <BlockForm key={block.id} block={block} onSave={onSave} onDelete={onDelete} />}
    </Sheet>
  )
}

const num = (t: string) => {
  const v = Number.parseFloat(t.replace(',', '.'))
  return Number.isFinite(v) && v > 0 ? v : undefined
}
const str = (v: number | undefined, digits = 1) =>
  v === undefined ? '' : String(Math.round(v * 10 ** digits) / 10 ** digits)
const clock = (v: number | undefined) => (v === undefined ? '' : formatTime(v, v < 60).replace(' s', ''))

function BlockForm({ block, onSave, onDelete }: { block: Block; onSave: (b: Block) => void; onDelete: () => void }) {
  const data = useData()
  const units = useUnits()
  const advanced = data.settings.mode === 'advanced'
  const [exerciseId, setExerciseId] = useState(block.exerciseId)
  const [picking, setPicking] = useState(false)
  const ex = data.index.get(exerciseId)
  const metric = ex?.metric ?? 'weight_reps'
  const [sets, setSets] = useState(String(block.sets))
  const [reps, setReps] = useState(str(block.reps, 0))
  const [distance, setDistance] = useState(
    str(block.distance === undefined ? undefined : toDisplayDistance(block.distance, units.distanceUnit), 0),
  )
  const [duration, setDuration] = useState(clock(block.duration))
  const [kind, setKind] = useState<IntensityKind | ''>(block.intensity?.kind ?? '')
  const [intensity, setIntensity] = useState(() => {
    const i = block.intensity
    if (!i) return ''
    if (i.kind === 'kg') return str(toDisplayWeight(i.value, units.weightUnit))
    if (i.kind === 'pace') return clock(i.value)
    return str(i.value)
  })
  const [rest, setRest] = useState(clock(block.rest))
  const [interval, setSendOff] = useState(clock(block.interval))
  const [tempo, setTempo] = useState(block.tempo ?? '')
  const [notes, setNotes] = useState(block.notes ?? '')

  const showReps = metric === 'weight_reps' || metric === 'reps'
  const showDistance = metric === 'distance_time' && ex?.distance === undefined
  const showDuration = metric === 'time'

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault()
        const next: Block = { id: block.id, exerciseId, sets: Math.min(50, Math.max(1, Math.round(num(sets) ?? 1))) }
        const r = num(reps)
        if (showReps && r !== undefined) next.reps = Math.round(r)
        const d = num(distance)
        if (showDistance && d !== undefined) next.distance = fromDisplayDistance(d, units.distanceUnit)
        const du = parseTime(duration)
        if (showDuration && du !== undefined && du > 0) next.duration = du
        if (kind) {
          const v = kind === 'pace' ? parseTime(intensity) : num(intensity)
          if (v !== undefined && v > 0)
            next.intensity = { kind, value: kind === 'kg' ? fromDisplayWeight(v, units.weightUnit) : v }
        }
        const rs = parseTime(rest)
        if (rs !== undefined && rs > 0) next.rest = Math.round(rs)
        const iv = parseTime(interval)
        if (iv !== undefined && iv > 0) next.interval = Math.round(iv)
        if (tempo.trim()) next.tempo = tempo.trim().slice(0, 20)
        if (notes.trim()) next.notes = notes.trim().slice(0, 300)
        // Normal mode never shows these fields: keep what Advanced mode set.
        if (!advanced) {
          if (block.intensity && !next.intensity) next.intensity = block.intensity
          if (block.rest !== undefined && next.rest === undefined) next.rest = block.rest
          if (block.tempo && !next.tempo) next.tempo = block.tempo
        }
        onSave(next)
      }}
    >
      <div className={styles.exerciseField}>
        <span className={styles.muted}>Exercise</span>
        <button type="button" className={styles.exerciseButton} onClick={() => setPicking(true)}>
          {ex?.name ?? 'Choose an exercise'}
          <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
      <div className={styles.pair}>
        <Field
          label={metric === 'distance_time' || metric === 'time' ? 'Repetitions' : 'Sets'}
          inputMode="numeric"
          value={sets}
          onChange={(e) => setSets(e.target.value)}
        />
        {showReps && (
          <Field label="Reps per set" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} />
        )}
        {showDistance && (
          <Field
            label={`Distance (${units.distanceUnit})`}
            inputMode="decimal"
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
          />
        )}
        {showDuration && (
          <Field
            label="Time per set (s or m:ss)"
            inputMode="decimal"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        )}
      </div>
      {ex?.discipline === 'swim' && (
        <Field
          label="Send-off interval (m:ss)"
          hint="Start each repetition on this clock, rest included."
          inputMode="decimal"
          value={interval}
          onChange={(e) => setSendOff(e.target.value)}
        />
      )}
      {advanced && (
        <>
          <div className={styles.pair}>
            <SelectField
              label="Intensity"
              value={kind}
              options={[
                { value: '', label: 'None' },
                { value: 'pct1rm', label: '% of 1RM' },
                { value: 'rpe', label: 'RPE' },
                { value: 'kg', label: `Load (${units.weightUnit})` },
                { value: 'pctmax', label: '% of best effort' },
                { value: 'pace', label: 'Time per repetition' },
              ]}
              onChange={(e) => setKind(e.target.value as IntensityKind | '')}
            />
            {kind && (
              <Field
                label={
                  kind === 'pace'
                    ? 'Time (m:ss)'
                    : kind === 'rpe'
                      ? 'RPE (1–10)'
                      : kind === 'kg'
                        ? units.weightUnit
                        : 'Percent'
                }
                inputMode="decimal"
                value={intensity}
                onChange={(e) => setIntensity(e.target.value)}
              />
            )}
          </div>
          <div className={styles.pair}>
            <Field label="Rest (m:ss)" inputMode="decimal" value={rest} onChange={(e) => setRest(e.target.value)} />
            {metric === 'weight_reps' && (
              <Field label="Tempo" placeholder="3-1-1-0" value={tempo} onChange={(e) => setTempo(e.target.value)} />
            )}
          </div>
        </>
      )}
      <Field label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />
      <Button type="submit" variant="primary" size="large" full>
        Done
      </Button>
      <Button variant="danger" full onClick={onDelete}>
        Remove from day
      </Button>
      <ExercisePicker
        open={picking}
        {...(ex ? { discipline: ex.discipline } : {})}
        title="Change exercise"
        onClose={() => setPicking(false)}
        onPick={(e) => {
          setExerciseId(e.id)
          setPicking(false)
        }}
      />
    </form>
  )
}
