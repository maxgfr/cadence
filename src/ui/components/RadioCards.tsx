import { useId } from 'react'
import styles from './RadioCards.module.css'

export interface RadioCardsProps<V extends string> {
  label: string
  options: readonly { value: V; title: string; body: string }[]
  value: V
  onChange: (value: V) => void
  hideLabel?: boolean
}

/** A choice between a few options that each need a sentence: native radios, arrow keys move the selection. */
export function RadioCards<V extends string>({
  label,
  options,
  value,
  onChange,
  hideLabel = false,
}: RadioCardsProps<V>) {
  const name = useId()
  return (
    <fieldset className={styles.group}>
      <legend className={hideLabel ? 'sr-only' : styles.legend}>{label}</legend>
      <div className={styles.cards}>
        {options.map((o) => {
          const id = `${name}-${o.value}`
          return (
            <label key={o.value} htmlFor={id} className={styles.card}>
              <input
                id={id}
                className={styles.input}
                type="radio"
                name={name}
                value={o.value}
                checked={o.value === value}
                onChange={() => onChange(o.value)}
              />
              <span className={styles.text}>
                <span className={styles.title}>{o.title}</span>
                <span className={styles.body}>{o.body}</span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
