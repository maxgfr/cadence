import { type SelectHTMLAttributes, useId } from 'react'
import { cx } from '../cx.ts'
import styles from './Field.module.css'

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  hint?: string
  hideLabel?: boolean
  options: readonly { value: string; label: string }[]
}

/** Labelled native select: the platform's own picker on phones. */
export function SelectField({
  label,
  hint,
  hideLabel = false,
  options,
  id: given,
  className,
  ...rest
}: SelectFieldProps) {
  const auto = useId()
  const id = given ?? auto
  const hintId = hint ? `${id}-hint` : undefined
  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={id} className={cx(styles.label, hideLabel && 'sr-only')}>
        {label}
      </label>
      <select id={id} className={cx(styles.input, styles.select)} aria-describedby={hintId} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  )
}
