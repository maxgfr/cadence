import { type InputHTMLAttributes, useEffect, useRef, useState } from 'react'

export interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number | undefined
  onChange: (value: number | undefined) => void
  /** Text shown for a value (defaults to the number, trailing zeros trimmed). */
  format?: (value: number) => string
  /** Reads typed text; undefined when it is not a value yet. Defaults to a decimal number. */
  parse?: (text: string) => number | undefined
}

const defaultParse = (t: string) => {
  const v = Number.parseFloat(t.replace(',', '.'))
  return Number.isFinite(v) ? v : undefined
}
const defaultFormat = (v: number) => String(Math.round(v * 100) / 100)

/**
 * A numeric field that keeps what is being typed ("1:0", "82.") while reporting values as they become valid.
 * Decimal keypad on phones.
 */
export function NumberInput({
  value,
  onChange,
  format = defaultFormat,
  parse = defaultParse,
  ...rest
}: NumberInputProps) {
  const [text, setText] = useState(value === undefined ? '' : format(value))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(value === undefined ? '' : format(value))
  }, [value, format])
  return (
    <input
      inputMode="decimal"
      autoComplete="off"
      {...rest}
      type="text"
      value={text}
      onFocus={(e) => {
        focused.current = true
        e.currentTarget.select()
        rest.onFocus?.(e)
      }}
      onBlur={(e) => {
        focused.current = false
        setText(value === undefined ? '' : format(value))
        rest.onBlur?.(e)
      }}
      onChange={(e) => {
        const t = e.target.value
        setText(t)
        if (t.trim() === '') onChange(undefined)
        else {
          const v = parse(t)
          if (v !== undefined && v >= 0) onChange(v)
        }
      }}
    />
  )
}
