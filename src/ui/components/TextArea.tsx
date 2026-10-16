import { type TextareaHTMLAttributes, useId } from 'react'
import { cx } from '../cx.ts'
import styles from './Field.module.css'

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  hint?: string
}

export function TextArea({ label, hint, id: given, className, ...rest }: TextAreaProps) {
  const auto = useId()
  const id = given ?? auto
  const hintId = hint ? `${id}-hint` : undefined
  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <textarea id={id} className={styles.input} aria-describedby={hintId} {...rest} />
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  )
}
