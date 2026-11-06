import { afterEach, describe, expect, test } from 'bun:test'
import { formatDay, formatShortDay, monthLabel, weekdayShort } from '../model/dates.ts'
import { describeBlock } from '../model/program.ts'
import { formatDistance, formatTime, formatWeight } from '../model/units.ts'
import { pluralFr } from './define.ts'
import { LOCALES, messagesFor, resolveLocale, setDisplayLocale } from './index.ts'
import { namespaces } from './messages/index.ts'

afterEach(() => setDisplayLocale('en'))

/** Every leaf of a namespace, with its path, so translations can be compared with English. */
function leaves(v: unknown, path = ''): [string, unknown][] {
  if (typeof v === 'string' || typeof v === 'function') return [[path, v]]
  return Object.entries(v as Record<string, unknown>).flatMap(([k, c]) => leaves(c, path ? `${path}.${k}` : k))
}

/** Sample arguments for a message function: numbers for counts, words for the rest. */
const sample = (fn: (...a: never[]) => string) =>
  (fn as (...a: unknown[]) => string)(...Array.from({ length: fn.length }, (_, i) => (i === 0 ? 3 : 'x')))

describe('messages', () => {
  for (const [name, ns] of Object.entries(namespaces)) {
    test(`${name}: French and German have every English message, none empty`, () => {
      const en = leaves(ns.en)
      for (const locale of ['fr', 'de'] as const) {
        const other = new Map(leaves(ns[locale]))
        expect([...other.keys()].sort()).toEqual(en.map(([k]) => k).sort())
        for (const [key, value] of en) {
          const v = other.get(key)
          expect(typeof v).toBe(typeof value)
          if (typeof v === 'string') expect(v.trim().length, `${locale}.${name}.${key}`).toBeGreaterThan(0)
          if (typeof v === 'function') {
            expect(v.length, `${locale}.${name}.${key} takes the same arguments`).toBe((value as () => string).length)
            expect(sample(v as () => string).trim().length).toBeGreaterThan(0)
          }
        }
      }
    })
  }

  test('one object per language, built once', () => {
    for (const l of LOCALES) expect(messagesFor(l)).toBe(messagesFor(l))
    expect(messagesFor('fr').common.save).toBe('Enregistrer')
  })

  test('French plurals take the singular for 0 and 1', () => {
    expect(pluralFr(0, 'série', 'séries')).toBe('série')
    expect(pluralFr(1, 'série', 'séries')).toBe('série')
    expect(pluralFr(2, 'série', 'séries')).toBe('séries')
  })
})

describe('resolveLocale', () => {
  test('a pick wins; otherwise the first system language we have; otherwise English', () => {
    expect(resolveLocale('de', ['fr-FR'])).toBe('de')
    expect(resolveLocale('system', ['es-ES', 'fr-CA', 'de'])).toBe('fr')
    expect(resolveLocale('system', ['DE-at'])).toBe('de')
    expect(resolveLocale('system', ['es-ES'])).toBe('en')
    expect(resolveLocale(undefined, [])).toBe('en')
  })
})

describe('numbers and dates follow the displayed language', () => {
  test('English is unchanged', () => {
    expect(formatWeight(82.5, 'kg')).toBe('82.5 kg')
    expect(formatDistance(1500, 'm')).toBe('1,500 m')
    expect(formatTime(65.3)).toBe('1:05.3')
    expect(formatDay('2026-10-12')).toBe('Mon 12 Oct')
    expect(formatShortDay('2026-09-01')).toBe('1 Sep')
    expect(weekdayShort(1)).toBe('Mon')
  })

  test('French: decimal comma, French dates and words', () => {
    setDisplayLocale('fr')
    expect(formatWeight(82.5, 'kg')).toBe('82,5 kg')
    expect(formatTime(7.12)).toBe('7,12 s')
    expect(formatTime(65.3)).toBe('1:05,3')
    expect(formatDistance(1500, 'm')).toMatch(/^1\s500 m$/u)
    expect(formatDay('2026-10-12')).toBe('lun. 12 oct.')
    expect(monthLabel('2026-10-12')).toBe('oct.')
    expect(
      describeBlock({ id: 'b', exerciseId: 'e', sets: 3, reps: 5, rest: 120 }, undefined, {
        weightUnit: 'kg',
        distanceUnit: 'm',
      }),
    ).toBe('3×5 · récup 2:00')
  })

  test('German: decimal comma, German dates', () => {
    setDisplayLocale('de')
    expect(formatWeight(82.5, 'kg')).toBe('82,5 kg')
    expect(formatDistance(1500, 'm')).toBe('1.500 m')
    // ICU versions differ on the comma after the weekday.
    expect(formatDay('2026-10-12')).toMatch(/^Mo\.,? 12\. Okt\.$/)
    expect(weekdayShort(1)).toBe('Mo')
  })
})
