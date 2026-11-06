import { type InputHTMLAttributes, useEffect, useRef, useState } from 'react'
import { useLocale } from '../../app/i18n.tsx'
import { formatDecimal, type Locale } from '../../core/i18n/index.ts'

export interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number | undefined
  onChange: (value: number | undefined) => void
  /** Text shown for a value (defaults to the number in the displayed language, trailing zeros trimmed). */
  format?: (value: number) => string
  /** Reads typed text; undefined when it is not a value yet. Defaults to a decimal number. */
  parse?: (text: string) => number | undefined
}

const defaultParse = (t: string) => {
  const v = Number.parseFloat(t.replace(',', '.'))
  return Number.isFinite(v) ? v : undefined
}
/** One stable formatter per language, so a field shows "82,5" in French and German. */
const defaultFormats: Record<Locale, (v: number) => string> = {
  en: (v) => formatDecimal(v, 2, 'en'),
  fr: (v) => formatDecimal(v, 2, 'fr'),
  de: (v) => formatDecimal(v, 2, 'de'),
}

/**
 * A numeric field that keeps what is being typed ("1:0", "82.") while reporting values as they become valid.
 * Decimal keypad on phones.
 */
export function NumberInput({ value, onChange, format: given, parse = defaultParse, ...rest }: NumberInputProps) {
  const locale = useLocale()
  const format = given ?? defaultFormats[locale]
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
