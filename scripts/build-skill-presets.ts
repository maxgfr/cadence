// The preset reference the cadence-coach skill reads: every preset exercise, discipline and program of the app with
// its names in every language, as skills/cadence-coach/references/presets.json. Run `bun run skill:presets` after a
// change to the catalog or its messages; a test fails while the file is stale. The file is then formatted by Biome,
// like every JSON file of the repository.
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { displayLocale, LOCALES, type Locale, messagesFor, setDisplayLocale } from '../src/core/i18n/index.ts'
import { BACKUP_VERSION, type Block, type Day, MUSCLES, type Muscle } from '../src/core/model/schemas.ts'
import {
  ASSISTED_PRESETS,
  PRESET_COLORS,
  PRESET_EXERCISES,
  PRESET_SPORTS,
  type PresetSlug,
} from '../src/core/presets/catalog.ts'
import { PRESET_PROGRAMS } from '../src/core/presets/presets.ts'

const OUT = new URL('../skills/cadence-coach/references/presets.json', import.meta.url)

type Names = Record<Locale, string>

const names = (read: (l: Locale) => string): Names => ({ en: read('en'), fr: read('fr'), de: read('de') })

/** A preset block as the skill reads it: the exercise's slug, and its notes in every language. */
type SkillBlock = Omit<Block, 'id' | 'exerciseId' | 'notes'> & { slug: string; notes?: Names }

/** The days of a preset program, built once per language (day names and notes follow the displayed language). */
function programDays(build: (typeof PRESET_PROGRAMS)[number]['build']) {
  const before = displayLocale()
  const byLocale = new Map<Locale, Day[]>()
  try {
    for (const l of LOCALES) {
      setDisplayLocale(l)
      byLocale.set(
        l,
        build(
          (slug, sets, spec = {}) => ({ id: '', exerciseId: slug, sets, ...spec }),
          (name, blocks) => ({ id: '', name, blocks }),
        ),
      )
    }
  } finally {
    setDisplayLocale(before)
  }
  const read = (l: Locale) => byLocale.get(l) ?? []
  return read('en').map((day, d) => ({
    names: names((l) => read(l)[d]?.name ?? day.name),
    blocks: day.blocks.map((block, i): SkillBlock => {
      const { id: _id, exerciseId, notes, ...spec } = block
      return {
        slug: exerciseId,
        ...spec,
        ...(notes === undefined ? {} : { notes: names((l) => read(l)[d]?.blocks[i]?.notes ?? notes) }),
      }
    }),
  }))
}

/** The whole reference, in a stable order. */
export function buildSkillPresets() {
  const searchWords = (l: Locale, slug: PresetSlug) =>
    (messagesFor(l).presets.searchWords as Partial<Record<PresetSlug, string>>)[slug]
  return {
    app: 'cadence',
    backupVersion: BACKUP_VERSION,
    locales: [...LOCALES],
    muscles: Object.fromEntries(
      MUSCLES.map((m: Muscle) => [m, names((l) => messagesFor(l).labels.muscle[m])]),
    ) as Record<Muscle, Names>,
    disciplines: Object.fromEntries(
      PRESET_SPORTS.map((s) => [
        s,
        { id: `preset-${s}`, color: PRESET_COLORS[s], names: names((l) => messagesFor(l).presets.disciplines[s]) },
      ]),
    ),
    exercises: PRESET_EXERCISES.map((e) => {
      const words = Object.fromEntries(
        LOCALES.flatMap((l) => {
          const w = searchWords(l, e.slug)
          return w === undefined ? [] : [[l, w]]
        }),
      )
      return {
        slug: e.slug,
        id: `preset-${e.slug}`,
        sport: e.sport,
        metric: e.metric,
        ...(e.muscles === undefined ? {} : { muscles: e.muscles }),
        ...(e.pace === undefined ? {} : { pace: e.pace }),
        ...(e.distance === undefined ? {} : { distance: e.distance }),
        ...(e.stroke === undefined ? {} : { stroke: e.stroke }),
        assisted: ASSISTED_PRESETS.has(e.slug),
        names: names((l) => messagesFor(l).presets.exercises[e.slug]),
        ...(Object.keys(words).length === 0 ? {} : { words }),
      }
    }),
    programs: PRESET_PROGRAMS.map((p) => ({
      id: `preset-program-${p.id}`,
      templateId: p.id,
      sport: p.sport,
      names: names((l) => messagesFor(l).presets.programs[p.id].name),
      goals: names((l) => messagesFor(l).presets.programs[p.id].goal),
      days: programDays(p.build),
    })),
  }
}

/** The file's text before formatting: two-space indent and a final newline. */
export function skillPresetsText(): string {
  return `${JSON.stringify(buildSkillPresets(), null, 2)}\n`
}

if (import.meta.main) {
  const path = fileURLToPath(OUT)
  await writeFile(path, skillPresetsText())
  const format = Bun.spawnSync(['bunx', 'biome', 'format', '--write', path], { stdout: 'ignore', stderr: 'inherit' })
  if (format.exitCode !== 0) throw new Error(`biome could not format ${path}`)
  const { exercises, programs } = buildSkillPresets()
  console.log(`presets.json: ${exercises.length} exercises, ${programs.length} programs`)
}
