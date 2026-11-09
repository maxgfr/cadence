import { describe, expect, test } from 'bun:test'
import { LOCALES, messagesFor } from '../i18n/index.ts'
import { Discipline, Exercise, Program } from '../model/schemas.ts'
import { PRESET_EXERCISES, PRESET_SPORTS } from './catalog.ts'
import { buildPreset, PRESET_PROGRAMS } from './presets.ts'

const empty = { exercises: [], disciplines: [] }
const all = (over: Partial<Parameters<typeof buildPreset>[0]> = {}) =>
  buildPreset({ sports: PRESET_SPORTS, withPrograms: true, library: empty, exerciseLanguage: 'en', ...over })

describe('presets', () => {
  test('every record is valid, with a stable id', () => {
    const { disciplines, exercises, programs } = all()
    for (const d of disciplines) expect(Discipline.parse(d).id).toStartWith('preset-')
    for (const e of exercises) expect(Exercise.parse(e).id).toStartWith('preset-')
    for (const p of programs) expect(Program.parse(p).id).toStartWith('preset-program-')
    expect(new Set(exercises.map((e) => e.id)).size).toBe(PRESET_EXERCISES.length)
  })

  test('gym, swimming and running each bring a library and programs', () => {
    for (const sport of PRESET_SPORTS) {
      expect(PRESET_EXERCISES.filter((e) => e.sport === sport).length).toBeGreaterThan(10)
      expect(PRESET_PROGRAMS.some((p) => p.sport === sport)).toBe(true)
    }
  })

  test('every program uses exercises of the library, and a fixed-distance exercise is not given another', () => {
    const { exercises, programs } = all()
    const byId = new Map(exercises.map((e) => [e.id, e]))
    for (const p of programs)
      for (const w of p.weeks)
        for (const d of w.days)
          for (const b of d.blocks) {
            const e = byId.get(b.exerciseId)
            expect(e).toBeDefined()
            if (e?.distance !== undefined) expect(b.distance).toBeUndefined()
          }
  })

  test('names are English by default and follow the language chosen, without losing a sport', () => {
    const name = (language: 'en' | 'fr' | 'de') =>
      buildPreset({ sports: ['gym'], withPrograms: false, library: empty, exerciseLanguage: language }).exercises.find(
        (e) => e.id === 'preset-barbell-bench-press',
      )?.name
    expect(name('en')).toBe('Barbell bench press')
    expect(name('fr')).toBe('Développé couché barre')
    expect(name('de')).toBe('Bankdrücken mit Langhantel')
  })

  test('every language names every exercise', () => {
    for (const l of LOCALES)
      for (const e of PRESET_EXERCISES) expect(messagesFor(l).presets.exercises[e.slug].length).toBeGreaterThan(0)
  })

  test('an exercise or discipline they already have is used, under any language', () => {
    const mine: Exercise = { id: 'mine', name: 'Développé couché barre', metric: 'weight_reps' }
    const sport: Discipline = { id: 'my-gym', name: 'Musculation', color: 'red' }
    const { exercises, disciplines, programs } = all({
      sports: ['gym'],
      library: { exercises: [mine], disciplines: [sport] },
    })
    expect(exercises.some((e) => e.id === 'preset-barbell-bench-press')).toBe(false)
    expect(exercises.every((e) => e.disciplineId === 'my-gym')).toBe(true)
    expect(disciplines).toEqual([])
    const ids = programs.flatMap((p) =>
      p.weeks.flatMap((w) => w.days.flatMap((d) => d.blocks.map((b) => b.exerciseId))),
    )
    expect(ids).toContain('mine')
    expect(ids).not.toContain('preset-barbell-bench-press')
  })

  test('adding twice brings nothing new', () => {
    const first = all()
    const again = all({ library: first })
    expect(again.exercises).toEqual([])
    expect(again.disciplines).toEqual([])
    expect(again.programs.map((p) => p.id)).toEqual(first.programs.map((p) => p.id))
  })

  test('programs can be left out', () => {
    expect(all({ withPrograms: false }).programs).toEqual([])
  })
})
