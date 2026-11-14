import { describe, expect, test } from 'bun:test'
import type { Exercise } from '../model/schemas.ts'
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

  test('an exercise they made is known as the preset of the same name', () => {
    expect(presetSlugOf({ id: 'mine', name: 'Tirage vertical' })).toBe('lat-pulldown')
    expect(presetSlugOf({ id: 'preset-pec-deck', name: 'Renamed' })).toBe('pec-deck')
    expect(presetSlugOf({ id: 'mine', name: 'Something else' })).toBeUndefined()
  })

  test('an empty search lists everything and suggests nothing', () => {
    const all = searchExercises('  ', library, 'en')
    expect(all.matches).toHaveLength(library.length)
    expect(all.related).toEqual([])
    expect(all.presets).toEqual([])
  })
})
