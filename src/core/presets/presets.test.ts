import { afterEach, describe, expect, test } from 'bun:test'
import { LOCALES, messagesFor, setDisplayLocale } from '../i18n/index.ts'
import { isOptional, requiredBlocks } from '../model/program.ts'
import { Discipline, Exercise, Program } from '../model/schemas.ts'
import { PRESET_EXERCISES, PRESET_SPORTS } from './catalog.ts'
import { buildPreset, PRESET_PROGRAMS } from './presets.ts'

afterEach(() => setDisplayLocale('en'))

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
    const mine: Exercise = { id: 'mine', name: 'Développé assis à la machine', metric: 'weight_reps' }
    const sport: Discipline = { id: 'my-gym', name: 'Musculation', color: 'red' }
    const { exercises, disciplines, programs } = all({
      sports: ['gym'],
      library: { exercises: [mine], disciplines: [sport] },
    })
    expect(exercises.some((e) => e.id === 'preset-machine-chest-press')).toBe(false)
    expect(exercises.every((e) => e.disciplineId === 'my-gym')).toBe(true)
    expect(disciplines).toEqual([])
    const ids = programs.flatMap((p) =>
      p.weeks.flatMap((w) => w.days.flatMap((d) => d.blocks.map((b) => b.exerciseId))),
    )
    expect(ids).toContain('mine')
    expect(ids).not.toContain('preset-machine-chest-press')
  })

  test('adding twice brings nothing new', () => {
    const first = all()
    const again = all({ library: first })
    expect(again.exercises).toEqual([])
    expect(again.disciplines).toEqual([])
    expect(again.programs.map((p) => p.id)).toEqual(first.programs.map((p) => p.id))
  })

  test('assistance is not a load, and no exercise counts for a muscle it does not train', () => {
    const metric = (slug: string) => PRESET_EXERCISES.find((e) => e.slug === slug)?.metric
    expect(metric('assisted-pull-up')).toBe('reps')
    expect(metric('assisted-dip')).toBe('reps')
    expect(PRESET_EXERCISES.find((e) => e.slug === 'hip-adduction-machine')?.muscles).toBeUndefined()
  })

  test('a lift few know the max of is planned by effort, set by set', () => {
    const upperLower = all({ sports: ['gym'] }).programs.find((p) => p.id === 'preset-program-gym-machines-upper-lower')
    const press = upperLower?.weeks[0]?.days[0]?.blocks[0]
    expect(press?.intensity?.kind).toBe('rpe')
    expect(press?.perSet?.map((s) => s.reps)).toEqual([6, 8, 10])
  })

  test('the Push Pull Legs offers a few exercises in case there is time, at the end of every day', () => {
    const ppl = all({ sports: ['gym'] }).programs.find((p) => p.id === 'preset-program-gym-machines-ppl')
    const days = ppl?.weeks[0]?.days ?? []
    expect(days.map((d) => d.blocks.filter(isOptional).map((b) => [b.exerciseId, b.sets]))).toEqual([
      [
        ['preset-overhead-triceps-extension', 3],
        ['preset-ab-crunch-machine', 3],
      ],
      [
        ['preset-lower-back-machine', 3],
        ['preset-machine-high-row', 3],
        ['preset-hammer-curl', 3],
      ],
      [['preset-ab-crunch-machine', 3]],
    ])
    const hammer = days[1]?.blocks.find((b) => b.exerciseId === 'preset-hammer-curl')
    expect(hammer?.notes).toStartWith('On a cable with a rope.')
    expect(hammer?.intensity).toEqual({ kind: 'rpe', value: 9 })
    expect(hammer?.rest).toBe(60)
  })

  test('the Push Pull Legs Push day has 23 sets without the abs, the ab crunch only if there is time', () => {
    const ppl = all({ sports: ['gym'] }).programs.find((p) => p.id === 'preset-program-gym-machines-ppl')
    const push = ppl?.weeks[0]?.days[0]?.blocks ?? []
    expect(push.map((b) => [b.exerciseId, b.sets, b.optional ?? false])).toEqual([
      ['preset-machine-chest-press', 4, false],
      ['preset-incline-machine-press', 4, false],
      ['preset-seated-dip-machine', 3, false],
      ['preset-pec-deck', 4, false],
      ['preset-machine-lateral-raise', 4, false],
      ['preset-triceps-pushdown', 4, false],
      ['preset-overhead-triceps-extension', 3, true],
      ['preset-ab-crunch-machine', 3, true],
    ])
  })

  test('the Push Pull Legs Pull day has one biceps curl and the shrug, the high row and the hammer curl only if there is time', () => {
    const ppl = all({ sports: ['gym'] }).programs.find((p) => p.id === 'preset-program-gym-machines-ppl')
    const pull = ppl?.weeks[0]?.days[1]?.blocks ?? []
    expect(pull.map((b) => [b.exerciseId, b.sets, b.optional ?? false])).toEqual([
      ['preset-lat-pulldown', 4, false],
      ['preset-machine-row', 4, false],
      ['preset-reverse-pec-deck', 4, false],
      ['preset-machine-lateral-raise', 4, false],
      ['preset-machine-biceps-curl', 4, false],
      ['preset-shrug', 3, false],
      ['preset-lower-back-machine', 3, true],
      ['preset-machine-high-row', 3, true],
      ['preset-hammer-curl', 3, true],
    ])
  })

  test('the Push Pull Legs trains the hamstrings on a lying leg curl, the gym it was built in having no seated one', () => {
    const ppl = all({ sports: ['gym'] }).programs.find((p) => p.id === 'preset-program-gym-machines-ppl')
    const legs = ppl?.weeks[0]?.days[2]?.blocks ?? []
    expect(legs.map((b) => [b.exerciseId, b.sets, b.optional ?? false])).toEqual([
      ['preset-leg-press', 4, false],
      ['preset-hip-thrust-machine', 3, false],
      ['preset-lying-leg-curl', 4, false],
      ['preset-leg-extension', 3, false],
      ['preset-hip-adduction-machine', 3, false],
      ['preset-hip-abduction-machine', 3, false],
      ['preset-standing-calf-raise', 5, false],
      ['preset-ab-crunch-machine', 3, true],
    ])
  })

  test('every gym program uses gym exercises only, with few blocks and sets a day, in every language', () => {
    const gym = new Set(PRESET_EXERCISES.filter((e) => e.sport === 'gym').map((e) => `preset-${e.slug}`))
    const gymPrograms = PRESET_PROGRAMS.filter((p) => p.sport === 'gym').map((p) => `preset-program-${p.id}`)
    expect(gymPrograms[0]).toBe('preset-program-gym-machines-ppl')
    const dayCounts = {
      'preset-program-gym-machines-ppl': 3,
      'preset-program-gym-machines-full-body': 3,
      'preset-program-gym-machines-upper-lower': 4,
      'preset-program-gym-machines-full-body-2x': 2,
    }
    expect(gymPrograms).toEqual(Object.keys(dayCounts))
    for (const l of LOCALES) {
      setDisplayLocale(l)
      const { exercises, programs } = all({ sports: ['gym'] })
      const ids = new Set(exercises.map((e) => e.id))
      expect(programs.map((p) => p.id)).toEqual(gymPrograms)
      for (const program of programs) {
        const days = Program.parse(program).weeks[0]?.days ?? []
        expect(days.length).toBe(dayCounts[program.id as keyof typeof dayCounts])
        for (const [index, d] of days.entries()) {
          // The limits hold for the session as it starts: optional blocks are only offered.
          const required = requiredBlocks(d)
          const ppl = program.id === 'preset-program-gym-machines-ppl'
          expect(required.length).toBeLessThanOrEqual(ppl ? 7 : 8)
          // The Push Pull Legs' Legs day trains four counted muscle groups and the adductors in one weekly session.
          expect(required.reduce((n, b) => n + b.sets, 0)).toBeLessThanOrEqual(ppl && index === 2 ? 26 : 23)
          // Optional blocks come last, a few at most.
          const optional = d.blocks.filter(isOptional)
          expect(optional.length).toBeLessThanOrEqual(3)
          expect(d.blocks.slice(required.length)).toEqual(optional)
          for (const b of d.blocks) {
            expect(gym.has(b.exerciseId)).toBe(true)
            expect(ids.has(b.exerciseId)).toBe(true)
            expect(b.notes?.length).toBeGreaterThan(0)
          }
        }
      }
    }
  })

  test('one exercise can be added on its own, with its sport only when it is missing', () => {
    const alone = all({ sports: ['gym'], withPrograms: false, only: ['machine-high-row'] })
    expect(alone.exercises.map((e) => e.id)).toEqual(['preset-machine-high-row'])
    expect(alone.disciplines.map((d) => d.id)).toEqual(['preset-gym'])
    const again = all({ sports: ['gym'], withPrograms: false, only: ['machine-high-row'], library: alone })
    expect(again.exercises).toEqual([])
    expect(again.disciplines).toEqual([])
  })

  test('programs can be left out', () => {
    expect(all({ withPrograms: false }).programs).toEqual([])
  })
})
