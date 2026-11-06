import { useT } from '../app/i18n.tsx'
import { formatTime } from '../core/model/units.ts'
import { SelectField } from './components/SelectField.tsx'

/** The rests offered, in seconds. */
export const REST_SECONDS = [30, 45, 60, 90, 120, 150, 180, 240, 300] as const

const INHERIT = 'inherit'

/**
 * The rest between sets of a discipline or an exercise: inherited (from the discipline, or the default) unless set,
 * or none (the timer then only for planned rests).
 */
export function RestField({
  value,
  inherited,
  from,
  onChange,
}: {
  value: number | undefined
  /** The rest it gets when not set here. */
  inherited: number
  /** Where `inherited` comes from (a discipline's name), or nothing for the default. */
  from?: string | undefined
  onChange: (rest: number | undefined) => void
}) {
  const t = useT()
  const r = t.forms.rest
  const time = (s: number) => (s === 0 ? r.none : formatTime(s, false))
  return (
    <SelectField
      label={r.label}
      value={value === undefined ? INHERIT : String(value)}
      options={[
        { value: INHERIT, label: from ? r.inheritFrom(from, time(inherited)) : r.inherit(time(inherited)) },
        { value: '0', label: r.none },
        ...REST_SECONDS.map((s) => ({ value: String(s), label: formatTime(s, false) })),
      ]}
      hint={r.hint}
      onChange={(e) => onChange(e.target.value === INHERIT ? undefined : Number(e.target.value))}
    />
  )
}
