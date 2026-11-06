import type { Shape } from './define.ts'
import { displayLocale, type Locale } from './locale.ts'
import { namespaces } from './messages/index.ts'

export * from './locale.ts'

type Namespaces = typeof namespaces

/** Every message of the interface, in one language. */
export type Messages = { [K in keyof Namespaces]: Namespaces[K]['en'] }

function build(locale: Locale): Messages {
  const out: Record<string, unknown> = {}
  for (const [key, ns] of Object.entries(namespaces)) out[key] = ns[locale]
  return out as Messages
}

const cache = new Map<Locale, Messages>()

export function messagesFor(locale: Locale): Messages {
  let m = cache.get(locale)
  if (!m) {
    m = build(locale)
    cache.set(locale, m)
  }
  return m
}

/** Messages in the language currently displayed (core code that writes text reads them here). */
export function currentMessages(): Messages {
  return messagesFor(displayLocale())
}

export type { Shape }
