import { LOCALES, messagesFor } from '../i18n/index.ts'
import { type Exercise, type ExerciseLanguage, MUSCLES, type Muscle } from '../model/schemas.ts'
import { PRESET_EXERCISES, type PresetSlug, type PresetSport } from '../presets/catalog.ts'
import { normalizeName } from './exercises.ts'

/** Lower case, accents and punctuation dropped, words split: what a typed search is compared with. */
export const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

const words = (s: string) => fold(s).split(' ').filter(Boolean)

let presetNames: ReadonlyMap<PresetSlug, readonly string[]> | undefined
/** Every language's name of every preset exercise. */
function namesOfPresets(): ReadonlyMap<PresetSlug, readonly string[]> {
  presetNames ??= new Map(
    PRESET_EXERCISES.map((e) => [e.slug, LOCALES.map((l) => messagesFor(l).presets.exercises[e.slug])]),
  )
  return presetNames
}

let presetText: ReadonlyMap<PresetSlug, readonly string[]> | undefined
/** What a preset is searched by: its names, and the words a gym also calls it by ("adductor", "inner thigh"). */
function searchTextOfPresets(): ReadonlyMap<PresetSlug, readonly string[]> {
  presetText ??= new Map(
    [...namesOfPresets()].map(([slug, names]) => {
      const more = LOCALES.map((l) => (messagesFor(l).presets.searchWords as Partial<Record<PresetSlug, string>>)[slug])
      return [slug, words([...names, ...more.filter((w) => w !== undefined)].join(' '))]
    }),
  )
  return presetText
}

let presetByName: ReadonlyMap<string, PresetSlug> | undefined
/**
 * The preset an exercise is, by its id (`preset-<slug>`) or, for one the athlete made, by its name in any language:
 * how its illustration and its other languages' names are found.
 */
export function presetSlugOf(exercise: Pick<Exercise, 'id' | 'name'>): PresetSlug | undefined {
  const names = namesOfPresets()
  if (exercise.id.startsWith('preset-')) {
    const slug = exercise.id.slice('preset-'.length) as PresetSlug
    if (names.has(slug)) return slug
  }
  presetByName ??= new Map(
    [...names.entries()].flatMap(([slug, all]) => all.map((n) => [normalizeName(n), slug] as const)),
  )
  return presetByName.get(normalizeName(exercise.name))
}

let muscleWords: ReadonlyMap<Muscle, readonly string[]> | undefined
/** The words naming each muscle group, in every language ("dos", "Rücken", "back"). */
function namesOfMuscles(): ReadonlyMap<Muscle, readonly string[]> {
  muscleWords ??= new Map(
    MUSCLES.map((m) => [m, [...new Set(LOCALES.flatMap((l) => words(messagesFor(l).labels.muscle[m])))]]),
  )
  return muscleWords
}

/** A typed word and its singular: "crunches", "tractions", "pull ups". */
const forms = (q: string): string[] =>
  q.length >= 3 && q.endsWith('s')
    ? [q, q.slice(0, -1), ...(q.length >= 5 && q.endsWith('es') ? [q.slice(0, -2)] : [])]
    : [q]

/**
 * Every typed word, or its singular, is the start of a word of the text, or, from five letters, inside it (German joins
 * words: "ziehen" finds "Latziehen"; shorter, "velo" would find "développé"). A singular of two letters is a whole word:
 * "abs" is "ab", not "abduction".
 */
function matches(query: readonly string[], text: readonly string[]): boolean {
  const joined = text.join(' ')
  return query.every((q) =>
    forms(q).some(
      (f) =>
        text.some((w) => (f.length < 3 && f !== q ? w === f : w.startsWith(f))) ||
        (f.length >= 5 && joined.includes(f)),
    ),
  )
}

export interface PresetHit {
  slug: PresetSlug
  sport: PresetSport
  /** In the language exercise names are written in. */
  name: string
}

export interface ExerciseSearch {
  /** Exercises whose name, in any language for a preset, has every word typed. */
  matches: Exercise[]
  /** Not found by name but close: the muscle typed, or the movement and muscles of what was found. */
  related: Exercise[]
  /** Presets that match and that the athlete does not have yet. */
  presets: PresetHit[]
}

const RELATED_MAX = 8
const PRESETS_MAX = 6

/**
 * Searches the athlete's exercises as they type when adding one: what it is called, then what is related to it (same
 * movement, same muscles, or the muscle group typed), then the presets they could add.
 */
export function searchExercises(
  query: string,
  library: readonly Exercise[],
  exerciseLanguage: ExerciseLanguage,
): ExerciseSearch {
  const q = words(query)
  if (q.length === 0) return { matches: [...library], related: [], presets: [] }
  const presetText = searchTextOfPresets()
  const textOf = (e: Exercise) => {
    const slug = presetSlugOf(e)
    return [...words(e.name), ...(slug ? (presetText.get(slug) ?? []) : [])]
  }

  const found = new Set<string>()
  const matched: Exercise[] = []
  for (const e of library)
    if (matches(q, textOf(e))) {
      matched.push(e)
      found.add(e.id)
    }

  // A muscle group is named from three letters: "a" alone is not "abdominale".
  const mentioned = new Set(
    [...namesOfMuscles()]
      .filter(([, ws]) => q.some((t) => t.length >= 3 && ws.some((w) => w.startsWith(t))))
      .map(([m]) => m),
  )
  // The muscle what was found mostly trains: an upright row among rows does not make shoulder work related.
  const counts = new Map<Muscle, number>()
  for (const e of matched) {
    const m = e.muscles?.[0]
    if (m) counts.set(m, (counts.get(m) ?? 0) + 1)
  }
  const mostly = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const firstMuscles = new Set(mostly ? [mostly] : [])
  const movement = new Set(
    matched.flatMap((e) => words(e.name)).filter((w) => w.length >= 3 && !q.some((t) => w.startsWith(t))),
  )
  // The words typed that name the movement itself ("row" in "high row"), not its equipment or variant.
  const typed = new Set(q.filter((t) => t.length >= 3))
  const score = (e: Exercise): number => {
    const muscles = e.muscles ?? []
    const own = words(e.name)
    let s = 0
    if (muscles.some((m) => mentioned.has(m))) s += muscles[0] && mentioned.has(muscles[0]) ? 4 : 2
    if (muscles[0] && firstMuscles.has(muscles[0])) s += 2
    if (own.some((w) => [...typed].some((t) => w.startsWith(t)))) s += 2
    if (own.some((w) => movement.has(w))) s += 1
    if (matched.length > 0 && matched.every((m) => m.metric !== e.metric)) s -= 2
    return s
  }
  const related = library
    .filter((e) => !found.has(e.id))
    .map((e) => ({ e, s: score(e) }))
    .filter((x) => x.s >= 2)
    .sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name))
    .slice(0, RELATED_MAX)
    .map((x) => x.e)

  const have = new Set(library.map(presetSlugOf).filter((s) => s !== undefined))
  const missing = PRESET_EXERCISES.filter((p) => !have.has(p.slug))
  const presetMatches = (query: readonly string[]) =>
    missing.filter((p) => matches(query, presetText.get(p.slug) ?? []))
  // Nothing has every word ("hack press"): those that have one of the longer words, a rare word worth more than a
  // common one ("hack" than "press").
  const close = () => {
    const hits = new Map(
      q.filter((t) => t.length >= 4).map((t) => [t, missing.filter((p) => matches([t], presetText.get(p.slug) ?? []))]),
    )
    return missing
      .map((p) => ({ p, n: [...hits.values()].reduce((n, ps) => n + (ps.includes(p) ? 1 / ps.length : 0), 0) }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .map((x) => x.p)
  }
  // A muscle group typed ("quadriceps", "ischio"): the presets that mostly train it.
  const forMuscle = () => missing.filter((p) => p.muscles?.[0] !== undefined && mentioned.has(p.muscles[0]))
  const exact = presetMatches(q)
  const fallback = () => {
    const muscle = forMuscle()
    return muscle.length > 0 ? muscle : close()
  }
  const presets = (exact.length > 0 || matched.length > 0 ? exact : fallback())
    .slice(0, PRESETS_MAX)
    .map((p) => ({ slug: p.slug, sport: p.sport, name: messagesFor(exerciseLanguage).presets.exercises[p.slug] }))

  return { matches: matched, related, presets }
}
