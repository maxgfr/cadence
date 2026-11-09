import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useData } from '../../app/data.tsx'
import { useT } from '../../app/i18n.tsx'
import { formatDecimal } from '../../core/i18n/locale.ts'
import type { Block, IntensityKind, SetTarget } from '../../core/model/schemas.ts'
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
import picker from '../../ui/DemoPicker.module.css'
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
  // How an intensity value reads in a field, and what a field's text stores.
  const shownValue = (k: IntensityKind | '', v: number | undefined) =>
    k === 'kg' && v !== undefined ? str(toDisplayWeight(v, units.weightUnit)) : k === 'pace' ? clock(v) : str(v)
  const storedValue = (k: IntensityKind | '', text: string) => {
    const v = k === 'pace' ? parseTime(text) : num(text)
    if (!k || v === undefined || v <= 0) return undefined
    return k === 'kg' ? fromDisplayWeight(v, units.weightUnit) : v
  }
  const [varied, setVaried] = useState(Boolean(block.perSet?.length))
  const [rows, setRows] = useState(() =>
    (block.perSet ?? []).map((s) => ({ reps: str(s.reps ?? block.reps, 0), value: shownValue(kind, s.value) })),
  )
  const [rest, setRest] = useState(clock(block.rest))
  const [interval, setSendOff] = useState(clock(block.interval))
  const [tempo, setTempo] = useState(block.tempo ?? '')
  const [notes, setNotes] = useState(block.notes ?? '')

  const showReps = metric === 'weight_reps' || metric === 'reps'
  const showDistance = metric === 'distance_time' && ex?.distance === undefined
  const showDuration = metric === 'time'
  const setCount = Math.min(50, Math.max(1, Math.round(num(sets) ?? 1)))
  const canVary = showReps && setCount > 1
  const perSetOn = varied && canVary
  const setTargets = Array.from({ length: perSetOn ? setCount : 0 }, (_, i) => ({
    n: i + 1,
    ...(rows[i] ?? rows[rows.length - 1] ?? { reps, value: intensity }),
  }))
  const editRow = (n: number, patch: Partial<{ reps: string; value: string }>) =>
    setRows(setTargets.map(({ n: at, ...r }) => (at === n ? { ...r, ...patch } : r)))
  const valueLabel =
    kind === 'pace' ? m.paceValue : kind === 'rpe' ? m.rpeValue : kind === 'kg' ? units.weightUnit : m.percent

  return (
    <>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault()
          const next: Block = { id: block.id, exerciseId, sets: setCount }
          const r = num(reps)
          if (showReps && r !== undefined) next.reps = Math.round(r)
          const d = num(distance)
          if (showDistance && d !== undefined) next.distance = fromDisplayDistance(d, units.distanceUnit)
          const du = parseTime(duration)
          if (showDuration && du !== undefined && du > 0) next.duration = du
          if (kind) {
            const v = storedValue(kind, intensity)
            if (v !== undefined) next.intensity = { kind, value: v }
          }
          if (perSetOn) {
            const targets = setTargets.map((row): SetTarget => {
              const rowReps = num(row.reps)
              const value = storedValue(kind, row.value)
              return {
                ...(rowReps !== undefined ? { reps: Math.min(500, Math.round(rowReps)) } : {}),
                ...(value !== undefined ? { value } : {}),
              }
            })
            const first = targets[0]
            if (first?.reps !== undefined) next.reps = first.reps
            if (kind && first?.value !== undefined) next.intensity = { kind, value: first.value }
            if (targets.some((s) => s.reps !== first?.reps || s.value !== first?.value)) next.perSet = targets
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
          {showReps && !perSetOn && (
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
        {canVary && (
          <label className={picker.toggle}>
            <input type="checkbox" checked={varied} onChange={(e) => setVaried(e.target.checked)} />
            <span>{m.differentSets}</span>
          </label>
        )}
        {setTargets.map((row) => (
          <div key={row.n} className={styles.pair}>
            <Field
              label={m.setNumber(row.n)}
              inputMode="numeric"
              value={row.reps}
              onChange={(e) => editRow(row.n, { reps: e.target.value })}
            />
            {advanced && kind && (
              <Field
                label={valueLabel}
                inputMode="decimal"
                value={row.value}
                onChange={(e) => editRow(row.n, { value: e.target.value })}
              />
            )}
          </div>
        ))}
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
              {kind && !perSetOn && (
                <Field
                  label={valueLabel}
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
