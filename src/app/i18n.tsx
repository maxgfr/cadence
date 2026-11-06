import { createContext, type ReactNode, useContext, useEffect, useMemo } from 'react'
import { type Locale, type Messages, messagesFor, resolveLocale, setDisplayLocale } from '../core/i18n/index.ts'
import { useData } from './data.tsx'

interface I18n {
  locale: Locale
  t: Messages
}

const I18nContext = createContext<I18n>({ locale: 'en', t: messagesFor('en') })

const systemLanguages = () => (typeof navigator === 'undefined' ? [] : navigator.languages)

/** The interface language: the one picked in Settings, or the system's. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const { settings } = useData()
  const locale = resolveLocale(settings.language, systemLanguages())
  // Set before the tree renders, so numbers and dates written by the core read in the same language.
  setDisplayLocale(locale)
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])
  const value = useMemo(() => ({ locale, t: messagesFor(locale) }), [locale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/** The messages of the current language: `t.today.title`, `t.log.sets(3)`. */
export function useT(): Messages {
  return useContext(I18nContext).t
}

export function useLocale(): Locale {
  return useContext(I18nContext).locale
}
