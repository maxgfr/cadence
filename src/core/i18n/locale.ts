/** Interface languages, and the one the app currently displays numbers and dates in. */

export const LOCALES = ['en', 'fr', 'de'] as const
export type Locale = (typeof LOCALES)[number]

/** What the user picked in Settings: a language, or whatever the system prefers. */
export type LanguagePref = 'system' | Locale

/** Each language named in itself, for the picker. */
export const LANGUAGE_NAMES: Record<Locale, string> = { en: 'English', fr: 'Français', de: 'Deutsch' }

/** The tag `Intl` formats with: British English keeps day-month order and the week starting on Monday. */
export const LOCALE_TAGS: Record<Locale, string> = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE' }

const isLocale = (v: string): v is Locale => (LOCALES as readonly string[]).includes(v)

/** The language to show: the user's pick, else the first system language we have, else English. */
export function resolveLocale(pref: LanguagePref | undefined, systemLanguages: readonly string[] = []): Locale {
  if (pref && pref !== 'system') return pref
  for (const tag of systemLanguages) {
    const base = tag.toLowerCase().split('-')[0] ?? ''
    if (isLocale(base)) return base
  }
  return 'en'
}

let current: Locale = 'en'

/**
 * The language numbers, dates and core texts are written in. Set once by the interface when the language changes;
 * English until then (and in tests).
 */
export function displayLocale(): Locale {
  return current
}

export function setDisplayLocale(locale: Locale): void {
  current = locale
}

/** A number with at most `digits` decimals, trailing zeros dropped, no grouping: "82.5", "82,5". */
export function formatDecimal(n: number, digits: number, locale: Locale = current): string {
  const s = n.toFixed(digits)
  const trimmed = s.includes('.') ? s.replace(/\.?0+$/, '') : s
  return locale === 'en' ? trimmed : trimmed.replace('.', decimalSeparator(locale))
}

/** A whole number with the language's grouping: "1,500", "1 500", "1.500". */
export function formatInteger(n: number, locale: Locale = current): string {
  return Math.round(n).toLocaleString(LOCALE_TAGS[locale])
}

/** The language's decimal separator. */
export function decimalSeparator(locale: Locale = current): string {
  return locale === 'en' ? '.' : ','
}
