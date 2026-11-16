import { describe, expect, test } from 'bun:test'
import type { Exercise } from '../model/schemas.ts'
import type { PresetSlug } from '../presets/catalog.ts'
import { buildPreset } from '../presets/presets.ts'
import { fold, presetSlugOf, searchExercises } from './search.ts'

const library: Exercise[] = buildPreset({
  sports: ['gym', 'swim'],
  withPrograms: false,
  library: { exercises: [], disciplines: [] },
  exerciseLanguage: 'en',
  only: [
    'lat-pulldown',
    'machine-row',
    'seated-cable-row',
    'barbell-curl',
    'hammer-curl',
    'pec-deck',
    'swim-freestyle',
  ],
}).exercises
const names = (list: readonly { name: string }[]) => list.map((e) => e.name)
const presetsFor = (query: string) => searchExercises(query, library, 'en').presets.map((p) => p.slug)

describe('exercise search', () => {
  test('accents, case and punctuation do not matter', () => {
    expect(fold('Développé  couché-barre')).toBe('developpe couche barre')
    const mine: Exercise = { id: 'x', name: 'Développé couché', metric: 'weight_reps' }
    expect(names(searchExercises('developpe', [mine], 'en').matches)).toEqual(['Développé couché'])
  })

  test('a preset is found under any language’s name', () => {
    expect(names(searchExercises('butterfly', library, 'en').matches)).toEqual(['Pec deck'])
    expect(names(searchExercises('tirage vertical', library, 'en').matches)).toEqual(['Lat pulldown'])
    expect(names(searchExercises('latzieh', library, 'en').matches)).toEqual(['Lat pulldown'])
  })

  test('related exercises follow the movement and the muscles of what was found', () => {
    const { matches, related } = searchExercises('machine row', library, 'en')
    expect(names(matches)).toEqual(['Machine row'])
    expect(names(related)).toContain('Seated cable row')
    expect(names(related)).toContain('Lat pulldown')
    expect(names(related)).not.toContain('Freestyle')
  })

  test('a muscle typed in any language brings its exercises', () => {
    expect(names(searchExercises('dos', library, 'en').related)).toContain('Lat pulldown')
    expect(names(searchExercises('biceps', library, 'en').related)).toEqual(
      expect.arrayContaining(['Barbell curl', 'Hammer curl']),
    )
  })

  test('presets they do not have are offered, named in their exercise language', () => {
    const { presets } = searchExercises('high row', library, 'fr')
    expect(presets.map((p) => p.slug)).toEqual(['machine-high-row'])
    expect(presets[0]?.name).toBe('Tirage haut à la machine')
    expect(searchExercises('lat pulldown', library, 'en').presets).toEqual([])
  })

  test('a machine is also found by what a gym calls it', () => {
    const slugs = (query: string) => searchExercises(query, library, 'en').presets.map((p) => p.slug)
    const thighs: PresetSlug[] = ['hip-abduction-machine', 'hip-adduction-machine']
    // One machine closes and opens the thighs: either name brings both movements.
    expect(slugs('adduction')).toEqual(thighs)
    expect(slugs('abductor')).toEqual(thighs)
    expect(slugs('fermer cuisses')).toEqual(thighs)
    expect(slugs('neck press')).toEqual(['neck-press-machine'])
    const mine = buildPreset({
      sports: ['gym'],
      withPrograms: false,
      library: { exercises: [], disciplines: [] },
      exerciseLanguage: 'en',
      only: ['hip-adduction-machine'],
    }).exercises
    expect(names(searchExercises('abduction', mine, 'en').matches)).toEqual(['Hip adduction machine'])
  })

  test('with no preset having every word typed, those close to it are offered, a rare word first', () => {
    const slugs = searchExercises('lateral adduction', library, 'en').presets.map((p) => p.slug)
    expect(slugs).toContain('hip-adduction-machine')
    expect(slugs).toContain('lateral-raise')
    expect(searchExercises('hack press', library, 'en').presets[0]?.slug).toBe('hack-squat')
  })

  test('the names a gym uses, and plurals', () => {
    expect(names(searchExercises('chest fly', library, 'en').matches)).toEqual(['Pec deck'])
    expect(presetsFor('military press')).toEqual(['overhead-press'])
    expect(presetsFor('rdl')).toEqual(['romanian-deadlift'])
    expect(presetsFor('hyperextension')).toEqual(['back-extension'])
    expect(presetsFor('crunches')).toEqual(['crunch', 'cable-crunch', 'ab-crunch-machine'])
    expect(presetsFor('pull ups')).toEqual(['pull-up', 'assisted-pull-up'])
    expect(presetsFor('tractions')).toContain('pull-up')
    expect(presetsFor('élévations latérales')).toContain('lateral-raise')
    expect(presetsFor('abs')).not.toContain('hip-abduction-machine')
  })

  test('a word is found inside another from five letters only', () => {
    expect(presetsFor('velo')).toEqual([])
    expect(names(searchExercises('latziehen', library, 'en').matches)).toEqual(['Lat pulldown'])
  })

  test('a muscle group typed offers the presets that mostly train it', () => {
    const slugs = searchExercises('ischio', library, 'en').presets.map((p) => p.slug)
    expect(slugs).toContain('lying-leg-curl')
    expect(slugs).not.toContain('back-squat')
  })

  test('an exercise they made is known as the preset of the same name', () => {
    expect(presetSlugOf({ id: 'mine', name: 'Tirage vertical' })).toBe('lat-pulldown')
    expect(presetSlugOf({ id: 'preset-pec-deck', name: 'Renamed' })).toBe('pec-deck')
    expect(presetSlugOf({ id: 'mine', name: 'Something else' })).toBeUndefined()
  })

  test('a letter or two names no muscle group', () => {
    const mine: Exercise[] = [
      { id: 'p', name: 'Plank hold', metric: 'time', muscles: ['core'] },
      { id: 'h', name: 'Hammer grip', metric: 'weight_reps', muscles: ['biceps'] },
    ]
    expect(searchExercises('a', mine, 'en').related).toEqual([])
    expect(searchExercises('bi', mine, 'en').related).toEqual([])
    expect(names(searchExercises('bic', mine, 'en').related)).toEqual(['Hammer grip'])
  })

  test('an empty search lists everything and suggests nothing', () => {
    const all = searchExercises('  ', library, 'en')
    expect(all.matches).toHaveLength(library.length)
    expect(all.related).toEqual([])
    expect(all.presets).toEqual([])
  })
})
