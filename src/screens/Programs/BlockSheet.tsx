import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useData } from '../../app/data.tsx'
import { useT } from '../../app/i18n.tsx'
import { formatDecimal } from '../../core/i18n/locale.ts'
import type { Block, IntensityKind } from '../../core/model/schemas.ts'
import {
  formatTime,
  fromDisplayDistance,
  fromDisplayWeight,
  NBSP,
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
  const t = useT()
  return (
    <Sheet open={block !== null} title={t.programs.block.title} onClose={onClose}>
      {block && <BlockForm key={block.id} block={block} onSave={onSave} onDelete={onDelete} />}
    </Sheet>
  )
}

const num = (t: string) => {
  const v = Number.parseFloat(t.replace(',', '.'))
  return Number.isFinite(v) && v > 0 ? v : undefined
}
const str = (v: number | undefined, digits = 1) =>
  v === undefined ? '' : formatDecimal(Math.round(v * 10 ** digits) / 10 ** digits, digits)
const clock = (v: number | undefined) => (v === undefined ? '' : formatTime(v, v < 60).replace(`${NBSP}s`, ''))

function BlockForm({ block, onSave, onDelete }: { block: Block; onSave: (b: Block) => void; onDelete: () => void }) {
  const data = useData()
  const units = useUnits()
  const t = useT()
  const m = t.programs.block
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
    <>
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
          <span className={styles.muted}>{t.common.exercise}</span>
          <button type="button" className={styles.exerciseButton} onClick={() => setPicking(true)}>
            {ex?.name ?? m.chooseExercise}
            <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.pair}>
          <Field
            label={metric === 'distance_time' || metric === 'time' ? m.repetitions : t.common.sets}
            inputMode="numeric"
            value={sets}
            onChange={(e) => setSets(e.target.value)}
          />
          {showReps && (
            <Field label={m.repsPerSet} inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} />
          )}
          {showDistance && (
            <Field
              label={m.distanceIn(units.distanceUnit)}
              inputMode="decimal"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
            />
          )}
          {showDuration && (
            <Field
              label={m.timePerSet}
              inputMode="decimal"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          )}
        </div>
        {ex?.metric === 'distance_time' && (
          <Field
            label={m.sendOff}
            hint={m.sendOffHint}
            inputMode="decimal"
            value={interval}
            onChange={(e) => setSendOff(e.target.value)}
          />
        )}
        {advanced && (
          <>
            <div className={styles.pair}>
              <SelectField
                label={m.intensity}
                value={kind}
                options={[
                  { value: '', label: m.intensityNone },
                  { value: 'pct1rm', label: m.pct1rm },
                  { value: 'rpe', label: m.rpe },
                  { value: 'kg', label: m.loadIn(units.weightUnit) },
                  { value: 'pctmax', label: m.pctmax },
                  { value: 'pace', label: m.pace },
                ]}
                onChange={(e) => setKind(e.target.value as IntensityKind | '')}
              />
              {kind && (
                <Field
                  label={
                    kind === 'pace'
                      ? m.paceValue
                      : kind === 'rpe'
                        ? m.rpeValue
                        : kind === 'kg'
                          ? units.weightUnit
                          : m.percent
                  }
                  inputMode="decimal"
                  value={intensity}
                  onChange={(e) => setIntensity(e.target.value)}
                />
              )}
            </div>
            <div className={styles.pair}>
              <Field label={m.rest} inputMode="decimal" value={rest} onChange={(e) => setRest(e.target.value)} />
              {metric === 'weight_reps' && (
                <Field label={m.tempo} placeholder="3-1-1-0" value={tempo} onChange={(e) => setTempo(e.target.value)} />
              )}
            </div>
          </>
        )}
        <Field label={t.common.notes} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />
        <Button type="submit" variant="primary" size="large" full>
          {t.common.done}
        </Button>
        <Button variant="danger" full onClick={onDelete}>
          {m.removeFromPlan}
        </Button>
      </form>
      {/* Outside the form: creating an exercise here has a form of its own, whose submit would reach this one. */}
      <ExercisePicker
        open={picking}
        disciplineId={ex?.disciplineId}
        title={m.changeExercise}
        onClose={() => setPicking(false)}
        onPick={(e) => {
          setExerciseId(e.id)
          setPicking(false)
        }}
      />
    </>
  )
}
