#!/usr/bin/env node
// Reads and writes Cadence backups (version 12) for the cadence-coach skill. Plain Node (18 or later), no dependencies.
// Run `node cadence.mjs` for the list of commands. The preset reference is ../references/presets.json.

import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const BACKUP_VERSION = 12
const BACKUP_PARTS = ['history', 'exercises', 'programs', 'goals', 'notes', 'settings']
const INTENSITY_KINDS = ['kg', 'pct1rm', 'rpe', 'pace', 'pctmax']
const LOCALES = ['en', 'fr', 'de']

const USAGE = `Usage: node cadence.mjs <command> [options]

Commands:
  summary <backup.json> [--json]
      Sessions, exercises (best sets, last session) and sets per muscle per ISO week.
  presets [--sport gym|swim|running] [--muscle <muscle>] [--json]
      The app's preset exercises: slug, id, metric, muscles, names in English, French and German.
  match <backup.json> [--json]
      Preset candidates for every exercise that is not a preset, and a mapping to edit.
  remap <backup.json> <mapping.json> -o <out.json> [--drop-programs] [--keep-unused]
      A backup whose exercises are all presets, sessions and programs moved onto them.
  program <spec.json> --into <backup.json> -o <out.json>
      Adds a program, built from preset exercises, to a backup.
  volume <spec.json> [--json] [--ceiling 11] [--floor 6]
  volume <backup.json> --program <name or id> [--week 1] [--json] [--ceiling 11] [--floor 6]
      Fractional sets per muscle per day and per week of a program, with what to look at.
`

/** A failure to report as is: printed to stderr, exit code 1. */
class CliError extends Error {}

const fail = (message) => {
  throw new CliError(message)
}

// ---------------------------------------------------------------------------------------------------------------
// Files.

/** @param {string} path */
function readJson(path, what) {
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    fail(`cannot read ${what} ${path}`)
  }
  try {
    return JSON.parse(text)
  } catch (err) {
    return fail(`${what} ${path} is not valid JSON (${err instanceof Error ? err.message : String(err)})`)
  }
}

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')

let presetsCache
/** The preset reference generated from the app (`bun run skill:presets`). */
function presets() {
  presetsCache ??= readJson(resolve(SKILL_DIR, 'references', 'presets.json'), 'preset reference')
  return presetsCache
}

let presetIndex
/** Preset exercises by slug. */
function presetBySlug() {
  presetIndex ??= new Map(presets().exercises.map((p) => [p.slug, p]))
  return presetIndex
}

/** The preset an exercise id names (`preset-<slug>`), if any. */
function presetOfId(id) {
  return typeof id === 'string' && id.startsWith('preset-') ? presetBySlug().get(id.slice(7)) : undefined
}

/** A slug given as `bench-press` or `preset-bench-press`, checked against the reference. */
function toSlug(value) {
  if (typeof value !== 'string') return undefined
  if (presetBySlug().has(value)) return value
  if (value.startsWith('preset-') && presetBySlug().has(value.slice(7))) return value.slice(7)
  return undefined
}

/**
 * Reads a backup and checks what this script relies on. Writing commands need version 12, what the app exports
 * today; older files are read by the app on import, so export them again from it first.
 */
function readBackup(path, { write }) {
  const b = readJson(path, 'backup')
  if (typeof b !== 'object' || b === null || b.app !== 'cadence') fail(`${path} is not a Cadence backup`)
  if (b.version !== BACKUP_VERSION) {
    const msg = `${path} is a version ${b.version} backup; this script handles version ${BACKUP_VERSION}. Import it in the app and export it again.`
    if (write) fail(msg)
    process.stderr.write(`warning: ${msg}\n`)
  }
  for (const key of ['disciplines', 'exercises', 'programs', 'sessions', 'goals']) {
    if (!Array.isArray(b[key])) fail(`${path}: "${key}" is missing or not a list`)
  }
  b.notes ??= []
  b.deleted ??= []
  return b
}

/** Writes a file next to its target, then moves it there; never onto one of the inputs. */
function writeOutput(out, data, inputs) {
  if (!out) fail('missing -o <out.json>')
  const target = resolve(out)
  const same = (a, b) => {
    if (a === b) return true
    try {
      return existsSync(a) && existsSync(b) && realpathSync(a) === realpathSync(b)
    } catch {
      return false
    }
  }
  for (const input of inputs) if (same(target, resolve(input))) fail(`refusing to overwrite the input ${input}`)
  const tmp = resolve(dirname(target), `.${basename(target)}.${process.pid}.tmp`)
  try {
    writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`)
    renameSync(tmp, target)
  } catch (err) {
    try {
      unlinkSync(tmp)
    } catch {
      // Nothing was written.
    }
    fail(`cannot write ${out} (${err instanceof Error ? err.message : String(err)})`)
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Arguments.

const VALUE_FLAGS = new Set([
  '-o',
  '--out',
  '--into',
  '--sport',
  '--muscle',
  '--program',
  '--week',
  '--ceiling',
  '--floor',
])
const BOOLEAN_FLAGS = new Set(['--json', '--drop-programs', '--keep-unused', '--help', '-h'])

function parseArgs(argv) {
  const positional = []
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (VALUE_FLAGS.has(a)) {
      const v = argv[i + 1]
      if (v === undefined || v.startsWith('-')) fail(`${a} needs a value`)
      flags[a === '--out' ? '-o' : a] = v
      i++
    } else if (BOOLEAN_FLAGS.has(a)) flags[a === '-h' ? '--help' : a] = true
    else if (a.startsWith('-') && a !== '-') fail(`unknown option ${a}`)
    else positional.push(a)
  }
  return { positional, flags }
}

// ---------------------------------------------------------------------------------------------------------------
// Names.

/** The app's `normalizeName` (src/core/library/exercises.ts), exactly: what two names are compared by. */
const normalizeName = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Lower case, accents and punctuation dropped (the app's search `fold`). */
const fold = (s) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/** Words that say nothing about the movement. */
const STOP_WORDS = new Set(
  'a an the with on of at to and or ou oder for in de du des la le les l d au aux a en et sur avec un une mit der die das den dem am an im auf und zur zum'.split(
    ' ',
  ),
)

/** Words gyms use for the same thing, in the three languages, read as one. */
const SYNONYMS = new Map(
  Object.entries({
    db: 'dumbbell',
    dumbbells: 'dumbbell',
    haltere: 'dumbbell',
    halteres: 'dumbbell',
    kurzhantel: 'dumbbell',
    kurzhanteln: 'dumbbell',
    bb: 'barbell',
    barre: 'barbell',
    langhantel: 'barbell',
    poulie: 'cable',
    cables: 'cable',
    kabel: 'cable',
    kabelzug: 'cable',
    machines: 'machine',
    maschine: 'machine',
    guidee: 'machine',
    developpe: 'press',
    presse: 'press',
    drucken: 'press',
    couche: 'bench',
    bank: 'bench',
    banc: 'bench',
    incline: 'incline',
    inclinee: 'incline',
    schrag: 'incline',
    schragbank: 'incline',
    decline: 'decline',
    declinee: 'decline',
    militaire: 'overhead',
    tirage: 'pull',
    rowing: 'row',
    rudern: 'row',
    traction: 'pull',
    tractions: 'pull',
    klimmzug: 'pull',
    klimmzuge: 'pull',
    pompe: 'push',
    pompes: 'push',
    liegestutz: 'push',
    souleve: 'deadlift',
    kreuzheben: 'deadlift',
    terre: 'deadlift',
    jambes: 'leg',
    jambe: 'leg',
    bein: 'leg',
    beine: 'leg',
    legs: 'leg',
    mollets: 'calf',
    mollet: 'calf',
    waden: 'calf',
    calves: 'calf',
    epaules: 'shoulder',
    epaule: 'shoulder',
    schulter: 'shoulder',
    shoulders: 'shoulder',
    pectoraux: 'chest',
    pecs: 'chest',
    brust: 'chest',
    elevation: 'raise',
    elevations: 'raise',
    heben: 'raise',
    laterales: 'lateral',
    laterale: 'lateral',
    seitheben: 'lateral',
    flexion: 'curl',
    biceps: 'biceps',
    bizeps: 'biceps',
    triceps: 'triceps',
    trizeps: 'triceps',
    gainage: 'plank',
    planche: 'plank',
    visage: 'face',
    haussement: 'shrug',
    haussements: 'shrug',
    unterarmstutz: 'plank',
    abdos: 'crunch',
    fessiers: 'glute',
    fessier: 'glute',
    glutes: 'glute',
    hanches: 'hip',
    hanche: 'hip',
    hufte: 'hip',
    hufheben: 'hip',
    assis: 'seated',
    sitzend: 'seated',
    debout: 'standing',
    stehend: 'standing',
    allonge: 'lying',
    liegend: 'lying',
    nage: 'swim',
    crawl: 'freestyle',
    kraul: 'freestyle',
    dos: 'back',
    rucken: 'back',
    course: 'run',
    laufen: 'run',
    lauf: 'run',
    footing: 'run',
  }),
)

/** A name's words, folded, singular, without stop words, synonyms read as one. */
function tokens(name) {
  const out = new Set()
  for (const raw of fold(name).split(' ')) {
    if (!raw || STOP_WORDS.has(raw)) continue
    let w = SYNONYMS.get(raw) ?? raw
    if (!SYNONYMS.has(raw) && w.length > 4 && w.endsWith('s') && !w.endsWith('ss'))
      w = SYNONYMS.get(w.slice(0, -1)) ?? w.slice(0, -1)
    out.add(w)
  }
  return out
}

/** One edit apart at most (a letter added, dropped or changed): "buterfly" is "butterfly". */
function oneEdit(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  // A letter changed near the start is another word: "abduction" is not "adduction".
  if (a.length === b.length) return i >= 3 && a.slice(i + 1) === b.slice(i + 1)
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1)
}

/** Two words are the same: equal, one the start of the other from five letters, or one typo apart from five. */
const sameWord = (a, b) =>
  a === b || (Math.min(a.length, b.length) >= 5 && (a.startsWith(b) || b.startsWith(a) || oneEdit(a, b)))

/** How many of `a`'s words `b` has. */
function shared(a, b) {
  let n = 0
  for (const w of a)
    for (const v of b)
      if (sameWord(w, v)) {
        n++
        break
      }
  return n
}

/** How alike two names are, 0 to 1 (Dice, on words). */
function overlap(a, b) {
  if (a.size === 0 || b.size === 0) return 0
  return (2 * shared(a, b)) / (a.size + b.size)
}

/** How much of a name the other words gyms call a preset hold: at least two of its words, or its only one (worth less). */
function containment(a, b) {
  if (a.size === 0 || b.size === 0) return 0
  const n = shared(a, b)
  if (n >= 2) return n / a.size
  return n === 1 && a.size === 1 ? 0.6 : 0
}

/** Every language's name of every preset, normalized as the app does, to its slug. */
let exactIndex
function presetByName() {
  if (!exactIndex) {
    exactIndex = new Map()
    for (const p of presets().exercises)
      for (const l of LOCALES)
        if (!exactIndex.has(normalizeName(p.names[l]))) exactIndex.set(normalizeName(p.names[l]), p.slug)
  }
  return exactIndex
}

const CANDIDATE_MIN = 0.4
const CANDIDATES_MAX = 3

/**
 * What a non-preset exercise is among the presets: `sure` when its name is one's in any language (as the app reads
 * it), else up to three `ambiguous` candidates by shared words, else `none`.
 */
function matchExercise(exercise) {
  const exact = presetByName().get(normalizeName(String(exercise.name ?? '')))
  if (exact) return { status: 'sure', candidates: [{ slug: exact, score: 1 }] }
  const mine = tokens(String(exercise.name ?? ''))
  const scored = []
  for (const p of presets().exercises) {
    let s = 0
    for (const l of LOCALES) s = Math.max(s, overlap(mine, tokens(p.names[l])))
    if (p.words) {
      for (const l of LOCALES)
        if (p.words[l]) s = Math.max(s, 0.8 * containment(mine, tokens(`${p.names[l]} ${p.words[l]}`)))
    }
    if (s === 0) continue
    if (exercise.metric && exercise.metric === p.metric) s += 0.05
    if (Array.isArray(exercise.muscles) && p.muscles && exercise.muscles[0] && p.muscles[0] === exercise.muscles[0])
      s += 0.05
    scored.push({ slug: p.slug, score: Math.round(Math.min(s, 0.99) * 100) / 100 })
  }
  const candidates = scored
    .filter((c) => c.score >= CANDIDATE_MIN)
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug))
    .slice(0, CANDIDATES_MAX)
  return candidates.length > 0 ? { status: 'ambiguous', candidates } : { status: 'none', candidates: [] }
}

// ---------------------------------------------------------------------------------------------------------------
// Backup helpers.

const isPresetId = (id) => typeof id === 'string' && id.startsWith('preset-')

/** Where each exercise is used: sessions (by session), program blocks, goals. */
function usage(backup) {
  const use = new Map()
  const of = (id) => {
    let u = use.get(id)
    if (!u) {
      u = { sessions: new Set(), programs: new Set(), goals: 0 }
      use.set(id, u)
    }
    return u
  }
  for (const s of backup.sessions)
    for (const e of s.entries ?? []) {
      of(e.exerciseId).sessions.add(s.id)
      if (e.planned?.exerciseId) of(e.planned.exerciseId).sessions.add(s.id)
    }
  for (const p of backup.programs)
    for (const w of p.weeks ?? [])
      for (const d of w.days ?? []) for (const b of d.blocks ?? []) of(b.exerciseId).programs.add(p.id)
  for (const g of backup.goals) if (g.exerciseId) of(g.exerciseId).goals++
  return use
}

/** The language a preset's other text (a discipline's name) is written in: the interface's, else the exercises'. */
function interfaceLanguage(settings) {
  if (LOCALES.includes(settings?.language)) return settings.language
  return exerciseLanguage(settings)
}

const exerciseLanguage = (settings) => (LOCALES.includes(settings?.exerciseLanguage) ? settings.exerciseLanguage : 'en')

/**
 * Finds or makes the discipline a preset sport's exercises go in, as the app's presets do: one with the preset's id
 * or its name in any language; else the one the backup's own exercises of that sport (`hints`) are in; else a new
 * `preset-<sport>` discipline, added to `out`.
 */
function disciplineFor(sport, out, hints, now) {
  const ref = presets().disciplines[sport]
  if (!ref) return undefined
  const names = new Set(LOCALES.map((l) => normalizeName(ref.names[l])))
  const mine = out.disciplines.find((d) => d.id === ref.id || names.has(normalizeName(String(d.name ?? ''))))
  if (mine) return mine.id
  const known = new Set(out.disciplines.map((d) => d.id))
  const counts = new Map()
  for (const h of hints) if (h && known.has(h)) counts.set(h, (counts.get(h) ?? 0) + 1)
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  if (best) return best[0]
  out.disciplines.push({
    id: ref.id,
    name: ref.names[interfaceLanguage(out.settings)],
    color: ref.color,
    updatedAt: now,
  })
  return ref.id
}

/** A preset exercise record as the app's presets write it, named in the exercise language. */
function presetExercise(slug, disciplineId, settings, now) {
  const p = presetBySlug().get(slug)
  return {
    id: p.id,
    name: p.names[exerciseLanguage(settings)],
    ...(disciplineId ? { disciplineId } : {}),
    metric: p.metric,
    ...(p.muscles ? { muscles: [...p.muscles] } : {}),
    ...(p.pace ? { pace: p.pace } : {}),
    ...(p.distance !== undefined ? { distance: p.distance } : {}),
    ...(p.stroke ? { stroke: p.stroke } : {}),
    updatedAt: now,
  }
}

/** The disciplines exercises of a sport are already in: what a new preset of that sport joins. */
function sportHints(backup, sport) {
  return backup.exercises.filter((e) => presetOfId(e.id)?.sport === sport).map((e) => e.disciplineId)
}

/** Every discipline id something in the backup still points at. */
function usedDisciplines(b) {
  const used = new Set()
  for (const e of b.exercises) if (e.disciplineId) used.add(e.disciplineId)
  for (const s of b.sessions) if (s.disciplineId) used.add(s.disciplineId)
  for (const p of b.programs)
    for (const w of p.weeks ?? []) for (const d of w.days ?? []) if (d.disciplineId) used.add(d.disciplineId)
  for (const g of b.goals) if (g.disciplineId) used.add(g.disciplineId)
  return used
}

// ---------------------------------------------------------------------------------------------------------------
// ULIDs, as the app's `newId` (the `ulid` package): 48 bits of milliseconds and 80 random bits, Crockford base 32.

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** A new id in the app's format: 26 characters, time first. */
function newId(now = Date.now()) {
  let time = ''
  let t = now
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time
    t = Math.floor(t / 32)
  }
  const bytes = randomBytes(16)
  let random = ''
  for (let i = 0; i < 16; i++) random += CROCKFORD[(bytes[i] ?? 0) % 32]
  return time + random
}

// ---------------------------------------------------------------------------------------------------------------
// summary

const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d

/** The app's Epley estimate: past 12 reps none; one rep is the weight itself. */
function epley(weight, reps) {
  if (!(weight > 0) || !(reps >= 1) || reps > 12) return undefined
  return reps === 1 ? weight : weight * (1 + reps / 30)
}

/** The ISO week of a `YYYY-MM-DD` day, as `2026-W07`. */
function isoWeek(day) {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const dow = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dow)
  const year = date.getUTCFullYear()
  const week = Math.ceil(((date.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7)
  return `${year}-W${String(week).padStart(2, '0')}`
}

const ticked = (sets) => (Array.isArray(sets) ? sets.filter((s) => s && s.done !== false) : [])

/** One set as read: `80 kg × 5 @8`, `12 reps (assistance 20 kg)`, `100 m in 1:42`. */
function describeSet(set, exercise) {
  const parts = []
  const assisted = presetOfId(exercise?.id)?.assisted === true
  if (set.weight !== undefined && set.reps !== undefined && !assisted)
    parts.push(`${round(set.weight, 2)} kg × ${set.reps}`)
  else {
    if (set.reps !== undefined) parts.push(`${set.reps} reps`)
    if (set.weight !== undefined)
      parts.push(assisted ? `(assistance ${round(set.weight, 2)} kg)` : `${round(set.weight, 2)} kg`)
  }
  if (set.distance !== undefined) parts.push(`${round(set.distance, 1)} m`)
  if (set.time !== undefined) parts.push(set.distance !== undefined ? `in ${clock(set.time)}` : clock(set.time))
  if (set.rpe !== undefined) parts.push(`@${set.rpe}`)
  return parts.join(' ') || 'ticked'
}

const clock = (seconds) => {
  const s = round(seconds, 1)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  return `${m}:${String(round(s - m * 60, 1)).padStart(2, '0')}`
}

function summarize(backup) {
  const exercises = new Map(backup.exercises.map((e) => [e.id, e]))
  const sessions = [...backup.sessions].sort(
    (a, b) =>
      String(a.date).localeCompare(String(b.date)) ||
      String(a.startedAt ?? '').localeCompare(String(b.startedAt ?? '')),
  )
  const perExercise = new Map()
  const perWeek = new Map()
  const sessionRows = []
  for (const s of sessions) {
    let setsInSession = 0
    const ids = new Set()
    for (const entry of s.entries ?? []) {
      const sets = ticked(entry.sets)
      ids.add(entry.exerciseId)
      setsInSession += sets.length
      const ex = exercises.get(entry.exerciseId)
      let row = perExercise.get(entry.exerciseId)
      if (!row) {
        row = {
          id: entry.exerciseId,
          exercise: ex,
          sessions: new Set(),
          sets: 0,
          best: undefined,
          heaviest: undefined,
          top: undefined,
          last: undefined,
        }
        perExercise.set(entry.exerciseId, row)
      }
      if (sets.length > 0) row.sessions.add(s.id)
      row.sets += sets.length
      const assisted = presetOfId(entry.exerciseId)?.assisted === true
      for (const set of sets) {
        if (!assisted && (ex?.metric ?? 'weight_reps') === 'weight_reps' && set.weight > 0 && set.reps >= 1) {
          const e1rm = epley(set.weight, set.reps)
          if (e1rm !== undefined && (!row.best || e1rm > row.best.e1rm))
            row.best = { date: s.date, weight: set.weight, reps: set.reps, e1rm: round(e1rm) }
          if (
            !row.heaviest ||
            set.weight > row.heaviest.weight ||
            (set.weight === row.heaviest.weight && set.reps > row.heaviest.reps)
          )
            row.heaviest = { date: s.date, weight: set.weight, reps: set.reps }
        } else {
          const value = topValue(set, ex)
          if (value && (!row.top || better(value, row.top))) row.top = { date: s.date, ...value }
        }
      }
      if (sets.length > 0) {
        if (!row.last || row.last.date !== s.date || row.last.sessionId !== s.id)
          row.last = { date: s.date, sessionId: s.id, sets: [] }
        row.last.sets.push(...sets.map((set) => describeSet(set, ex ?? { id: entry.exerciseId })))
      }
      const muscles = musclesOf(entry.exerciseId, ex)
      if (sets.length > 0) {
        const week = isoWeek(s.date)
        let w = perWeek.get(week)
        if (!w) {
          w = { sets: {}, withoutMuscles: 0 }
          perWeek.set(week, w)
        }
        for (const m of muscles) w.sets[m] = (w.sets[m] ?? 0) + sets.length
        if (muscles.length === 0) w.withoutMuscles += sets.length
      }
    }
    sessionRows.push({
      id: s.id,
      date: s.date,
      title: s.title ?? '',
      status: s.status,
      exercises: ids.size,
      sets: setsInSession,
      ...(s.duration !== undefined ? { durationMin: s.duration } : {}),
      ...(s.rpe !== undefined ? { rpe: s.rpe } : {}),
    })
  }
  const exerciseRows = [...perExercise.values()]
    .map((r) => ({
      id: r.id,
      name: r.exercise?.name ?? `(missing exercise ${r.id})`,
      kind: isPresetId(r.id) ? 'preset' : 'custom',
      metric: r.exercise?.metric,
      ...(presetOfId(r.id)?.assisted ? { assisted: true } : {}),
      sessions: r.sessions.size,
      sets: r.sets,
      setsPerSession: r.sessions.size > 0 ? round(r.sets / r.sessions.size) : 0,
      ...(r.best ? { bestE1rm: r.best } : {}),
      ...(r.heaviest ? { heaviest: r.heaviest } : {}),
      ...(r.top ? { best: r.top } : {}),
      ...(r.last ? { last: { date: r.last.date, sets: r.last.sets } } : {}),
    }))
    .sort((a, b) => b.sets - a.sets || a.name.localeCompare(b.name))
  const weeks = [...perWeek.keys()].sort().map((week) => {
    const w = perWeek.get(week)
    return { week, sets: sortedMuscles(w.sets), withoutMuscles: w.withoutMuscles }
  })
  const used = new Set(perExercise.keys())
  return {
    exportedAt: backup.exportedAt,
    totals: {
      sessions: sessionRows.length,
      sets: sessionRows.reduce((n, s) => n + s.sets, 0),
      exercisesUsed: used.size,
      exercisesInLibrary: backup.exercises.length,
      presetExercises: backup.exercises.filter((e) => isPresetId(e.id)).length,
      programs: backup.programs.length,
      first: sessionRows[0]?.date,
      last: sessionRows.at(-1)?.date,
    },
    programs: backup.programs.map((p) => ({
      id: p.id,
      name: p.name,
      layout: p.layout ?? 'weeks',
      weeks: p.weeks?.length ?? 0,
      days: (p.weeks ?? []).reduce((n, w) => n + (w.days?.length ?? 0), 0),
    })),
    sessions: sessionRows,
    exercises: exerciseRows,
    muscleSetsPerWeek: {
      note: "Crude count: each ticked set counts once for every muscle its exercise lists (its own muscles, else its preset's by id or by name); withoutMuscles counts the sets of exercises with none.",
      weeks,
    },
  }
}

/** The muscles an exercise works: its own, else its preset's (by id, or by a name that is a preset's). */
function musclesOf(id, ex) {
  if (Array.isArray(ex?.muscles) && ex.muscles.length > 0) return ex.muscles
  const preset =
    presetOfId(id) ?? (ex ? presetBySlug().get(presetByName().get(normalizeName(String(ex.name ?? '')))) : undefined)
  return preset?.muscles ?? []
}

function sortedMuscles(w) {
  return Object.fromEntries(Object.entries(w).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])))
}

/** What a set reaches on an exercise not measured by load: most reps, longest hold, best time or pace. */
function topValue(set, ex) {
  const metric = ex?.metric
  if (metric === 'time' && set.time > 0) return { kind: 'longest', time: set.time }
  if (metric === 'distance_time' && set.time > 0) {
    if (ex.distance !== undefined) {
      const d = set.distance ?? ex.distance
      return d === ex.distance ? { kind: 'fastest', distance: d, time: set.time } : undefined
    }
    if (set.distance >= 25) {
      const per = ex.pace === 'km' ? 1000 : 100
      return {
        kind: 'pace',
        distance: set.distance,
        time: set.time,
        pace: round((set.time / set.distance) * per),
        per: ex.pace === 'km' ? 'km' : '100m',
      }
    }
    return undefined
  }
  if (set.reps > 0) return { kind: 'most', reps: set.reps, ...(set.weight !== undefined ? { weight: set.weight } : {}) }
  return undefined
}

function better(a, b) {
  if (a.kind === 'fastest') return a.time < b.time
  if (a.kind === 'pace') return a.pace < b.pace
  if (a.kind === 'longest') return a.time > b.time
  return a.reps > b.reps
}

function printSummary(s) {
  const out = []
  const t = s.totals
  out.push(`Backup exported ${s.exportedAt}`)
  out.push(
    `${t.sessions} sessions (${t.first ?? '-'} to ${t.last ?? '-'}), ${t.sets} ticked sets, ${t.exercisesUsed} exercises used of ${t.exercisesInLibrary} in the library (${t.presetExercises} presets), ${t.programs} programs`,
  )
  if (s.programs.length > 0) {
    out.push('', 'Programs')
    for (const p of s.programs) out.push(`  ${p.name} [${p.id}]: ${p.layout}, ${p.weeks} weeks, ${p.days} days`)
  }
  out.push('', 'Sessions')
  for (const r of s.sessions)
    out.push(
      `  ${r.date}  ${r.title || '(untitled)'}: ${r.exercises} exercises, ${r.sets} sets${r.durationMin !== undefined ? `, ${r.durationMin} min` : ''}${r.rpe !== undefined ? `, RPE ${r.rpe}` : ''}${r.status === 'active' ? ' (active)' : ''}`,
    )
  out.push('', 'Exercises')
  for (const e of s.exercises) {
    out.push(
      `  ${e.name} [${e.id}] ${e.kind}${e.assisted ? ', assisted (weight is assistance)' : ''}: ${e.sessions} sessions, ${e.sets} sets, ${e.setsPerSession} sets per session`,
    )
    if (e.bestE1rm)
      out.push(`    best e1RM ${e.bestE1rm.e1rm} kg (${e.bestE1rm.weight} kg × ${e.bestE1rm.reps}, ${e.bestE1rm.date})`)
    if (e.heaviest && (!e.bestE1rm || e.heaviest.weight !== e.bestE1rm.weight || e.heaviest.reps !== e.bestE1rm.reps))
      out.push(`    heaviest ${e.heaviest.weight} kg × ${e.heaviest.reps} (${e.heaviest.date})`)
    if (e.best) out.push(`    best ${describeTop(e.best)} (${e.best.date})`)
    if (e.last) out.push(`    last ${e.last.date}: ${e.last.sets.join(', ')}`)
  }
  out.push('', `Sets per muscle per ISO week (${s.muscleSetsPerWeek.note})`)
  for (const w of s.muscleSetsPerWeek.weeks)
    out.push(
      `  ${w.week}  ${
        Object.entries(w.sets)
          .map(([m, n]) => `${m} ${n}`)
          .join(', ') || '-'
      }${w.withoutMuscles > 0 ? `; ${w.withoutMuscles} sets on exercises without muscles` : ''}`,
    )
  return `${out.join('\n')}\n`
}

function describeTop(b) {
  if (b.kind === 'fastest') return `${b.distance} m in ${clock(b.time)}`
  if (b.kind === 'pace') return `pace ${clock(b.pace)} per ${b.per} (${b.distance} m in ${clock(b.time)})`
  if (b.kind === 'longest') return `hold ${clock(b.time)}`
  return `${b.reps} reps${b.weight !== undefined ? ` (${b.weight} kg)` : ''}`
}

// ---------------------------------------------------------------------------------------------------------------
// presets

function listPresets({ sport, muscle }) {
  const sports = Object.keys(presets().disciplines)
  if (sport !== undefined && !sports.includes(sport)) fail(`unknown sport "${sport}" (one of ${sports.join(', ')})`)
  const muscles = Object.keys(presets().muscles)
  if (muscle !== undefined && !muscles.includes(muscle))
    fail(`unknown muscle "${muscle}" (one of ${muscles.join(', ')})`)
  return presets().exercises.filter(
    (p) => (sport === undefined || p.sport === sport) && (muscle === undefined || p.muscles?.includes(muscle)),
  )
}

function printPresets(list) {
  return `${list
    .map(
      (p) =>
        `${p.slug}  ${p.id}  ${p.sport}/${p.metric}${p.assisted ? ' (assisted)' : ''}  ${(p.muscles ?? []).join(',') || '-'}  ${LOCALES.map((l) => p.names[l]).join(' | ')}`,
    )
    .join('\n')}\n`
}

// ---------------------------------------------------------------------------------------------------------------
// match

function matchBackup(backup) {
  const use = usage(backup)
  const rows = []
  const mapping = {}
  for (const e of backup.exercises) {
    if (presetOfId(e.id)) continue
    const u = use.get(e.id)
    const m = matchExercise(e)
    const used = { sessions: u?.sessions.size ?? 0, programs: u?.programs.size ?? 0, goals: u?.goals ?? 0 }
    rows.push({
      id: e.id,
      name: e.name,
      metric: e.metric,
      used,
      unused: used.sessions + used.programs + used.goals === 0,
      status: m.status,
      candidates: m.candidates.map((c) => ({ ...c, id: `preset-${c.slug}`, names: presetBySlug().get(c.slug).names })),
    })
    mapping[e.id] = m.status === 'sure' ? m.candidates[0].slug : null
  }
  const order = { sure: 0, ambiguous: 1, none: 2 }
  rows.sort(
    (a, b) => Number(a.unused) - Number(b.unused) || order[a.status] - order[b.status] || a.name.localeCompare(b.name),
  )
  return { exercises: rows, mapping }
}

function printMatch(r) {
  const out = []
  const count = (s) => r.exercises.filter((x) => x.status === s).length
  out.push(
    `${r.exercises.length} exercises are not presets: ${count('sure')} sure, ${count('ambiguous')} ambiguous, ${count('none')} without a candidate; ${r.exercises.filter((x) => x.unused).length} unused`,
  )
  for (const x of r.exercises) {
    const where = x.unused
      ? 'unused'
      : `${x.used.sessions} sessions, ${x.used.programs} programs${x.used.goals ? `, ${x.used.goals} goals` : ''}`
    out.push('', `${x.name} [${x.id}] ${x.metric}, ${where}: ${x.status}`)
    for (const c of x.candidates)
      out.push(`  ${c.score.toFixed(2)}  ${c.slug}  (${LOCALES.map((l) => c.names[l]).join(' | ')})`)
  }
  out.push(
    '',
    'Mapping to edit (null: no preset; a used exercise needs one before remap):',
    JSON.stringify(r.mapping, null, 2),
  )
  return `${out.join('\n')}\n`
}

// ---------------------------------------------------------------------------------------------------------------
// remap

function remap(backup, mappingRaw, { dropPrograms, keepUnused, now }) {
  if (typeof mappingRaw !== 'object' || mappingRaw === null || Array.isArray(mappingRaw))
    fail('the mapping must be a JSON object { "<exerciseId>": "<slug>" }')
  const byId = new Map(backup.exercises.map((e) => [e.id, e]))
  const mapping = new Map()
  const errors = []
  for (const [id, value] of Object.entries(mappingRaw)) {
    if (!byId.has(id)) errors.push(`mapping: no exercise "${id}" in the backup`)
    else if (isPresetId(id)) errors.push(`mapping: "${id}" is already a preset exercise`)
    else if (value === null) continue
    else {
      const slug = toSlug(value)
      if (!slug)
        errors.push(`mapping: "${id}" → ${JSON.stringify(value)} is not a preset slug (see the presets command)`)
      else mapping.set(id, slug)
    }
  }
  if (errors.length > 0) fail(errors.join('\n'))

  const use = usage({ ...backup, goals: [] })
  const missing = []
  for (const e of backup.exercises) {
    if (isPresetId(e.id) || mapping.has(e.id)) continue
    const u = use.get(e.id)
    const sessions = u?.sessions.size ?? 0
    const programs = dropPrograms ? 0 : (u?.programs.size ?? 0)
    if (sessions + programs > 0) missing.push(`  ${e.id} "${e.name}": ${sessions} sessions, ${programs} programs`)
  }
  // References to exercises the backup does not hold: nothing to map them from.
  const unknown = new Set()
  for (const [id, u] of use)
    if (!byId.has(id) && !isPresetId(id) && (u.sessions.size > 0 || (!dropPrograms && u.programs.size > 0)))
      unknown.add(id)
  for (const id of unknown) missing.push(`  ${id}: used but not in the backup's exercises`)
  if (missing.length > 0)
    fail(
      `these used exercises have no preset in the mapping${dropPrograms ? '' : ' (pass --drop-programs to drop every program instead of mapping what only programs use)'}:\n${missing.join('\n')}`,
    )

  const to = (id) => (mapping.has(id) ? `preset-${mapping.get(id)}` : id)
  const out = {
    app: 'cadence',
    version: BACKUP_VERSION,
    exportedAt: now,
    settings: backup.settings,
    disciplines: [...backup.disciplines],
    exercises: [],
    programs: [],
    sessions: [],
    goals: [],
    notes: backup.notes,
    deleted: [],
  }
  const droppedPrograms = dropPrograms ? backup.programs.length : 0
  const keptPrograms = dropPrograms ? [] : backup.programs
  const programIds = new Set(keptPrograms.map((p) => p.id))
  let sessionsMoved = 0
  for (const s of backup.sessions) {
    let changed = false
    const entries = (s.entries ?? []).map((e) => {
      const exerciseId = to(e.exerciseId)
      const planned = e.planned ? { ...e.planned, exerciseId: to(e.planned.exerciseId) } : undefined
      if (exerciseId !== e.exerciseId || (planned && planned.exerciseId !== e.planned.exerciseId)) changed = true
      return { ...e, exerciseId, ...(planned ? { planned } : {}) }
    })
    const { programRef, ...rest } = s
    const keepRef = programRef && programIds.has(programRef.programId)
    if (programRef && !keepRef) changed = true
    if (changed) sessionsMoved++
    out.sessions.push({ ...rest, ...(keepRef ? { programRef } : {}), entries, ...(changed ? { updatedAt: now } : {}) })
  }
  let programsMoved = 0
  for (const p of keptPrograms) {
    let changed = false
    const weeks = p.weeks.map((w) => ({
      ...w,
      days: w.days.map((d) => ({
        ...d,
        blocks: d.blocks.map((b) => {
          const exerciseId = to(b.exerciseId)
          if (exerciseId !== b.exerciseId) changed = true
          return { ...b, exerciseId }
        }),
      })),
    }))
    if (changed) programsMoved++
    out.programs.push({ ...p, weeks, ...(changed ? { updatedAt: now } : {}) })
  }
  const droppedGoals = []
  for (const g of backup.goals) {
    if (g.exerciseId === undefined || isPresetId(g.exerciseId)) out.goals.push(g)
    else if (mapping.has(g.exerciseId)) out.goals.push({ ...g, exerciseId: to(g.exerciseId), updatedAt: now })
    else if (keepUnused && byId.has(g.exerciseId)) out.goals.push(g)
    else droppedGoals.push(g.id)
  }

  // Exercises: the presets the backup holds, the ones mapped to that it lacks, and with --keep-unused the rest.
  const added = []
  for (const e of backup.exercises) if (isPresetId(e.id)) out.exercises.push(e)
  const have = new Set(out.exercises.map((e) => e.id))
  const customsOf = new Map()
  for (const e of backup.exercises) {
    const slug = mapping.get(e.id)
    if (slug === undefined) continue
    customsOf.set(slug, [...(customsOf.get(slug) ?? []), e])
  }
  for (const [slug, customs] of customsOf) {
    if (have.has(`preset-${slug}`)) continue
    const sport = presetBySlug().get(slug).sport
    const disciplineId = disciplineFor(
      sport,
      out,
      [...customs.map((c) => c.disciplineId), ...sportHints(backup, sport)],
      now,
    )
    const record = presetExercise(slug, disciplineId, out.settings, now)
    // What the athlete wrote about the exercise stays with it: the first of their records that has each.
    for (const key of ['notes', 'description', 'photo', 'rest']) {
      const from = customs.find((c) => c[key] !== undefined)
      if (from) record[key] = from[key]
    }
    out.exercises.push(record)
    have.add(record.id)
    added.push(slug)
  }
  const keptCustom = []
  if (keepUnused) {
    for (const e of backup.exercises)
      if (!isPresetId(e.id) && !mapping.has(e.id)) {
        out.exercises.push(e)
        keptCustom.push(e.id)
      }
  }
  const used = usedDisciplines(out)
  const droppedDisciplines = out.disciplines.filter((d) => !used.has(d.id)).map((d) => d.id)
  out.disciplines = out.disciplines.filter((d) => used.has(d.id))

  const report = {
    sessions: out.sessions.length,
    sessionsRewritten: sessionsMoved,
    exercisesRemapped: mapping.size,
    presetExercisesAdded: added,
    customExercisesDropped: backup.exercises.filter((e) => !isPresetId(e.id) && !keptCustom.includes(e.id)).length,
    customExercisesKept: keptCustom.length,
    programsKept: out.programs.length,
    programsRewritten: programsMoved,
    programsDropped: droppedPrograms,
    goalsDropped: droppedGoals,
    disciplinesDropped: droppedDisciplines,
    wasPartial: Array.isArray(backup.parts),
  }
  return { out, report }
}

function printRemap(r, path) {
  const lines = [
    `Wrote ${path}`,
    `  sessions kept: ${r.sessions} (${r.sessionsRewritten} rewritten)`,
    `  exercises remapped: ${r.exercisesRemapped}; preset exercises added: ${r.presetExercisesAdded.length}${r.presetExercisesAdded.length ? ` (${r.presetExercisesAdded.join(', ')})` : ''}`,
    `  custom exercises dropped: ${r.customExercisesDropped}${r.customExercisesKept ? `, kept (--keep-unused): ${r.customExercisesKept}` : ''}`,
    `  programs kept: ${r.programsKept} (${r.programsRewritten} rewritten), dropped: ${r.programsDropped}`,
  ]
  if (r.goalsDropped.length) lines.push(`  goals dropped (their exercise has no preset): ${r.goalsDropped.length}`)
  if (r.disciplinesDropped.length) lines.push(`  disciplines no longer used, dropped: ${r.disciplinesDropped.length}`)
  if (r.wasPartial) lines.push('  note: the input held only some parts; the output is written as a whole backup')
  lines.push('  Restore: Settings → Erase all training data…, then Settings → Import backup with every part ticked.')
  return `${lines.join('\n')}\n`
}

// ---------------------------------------------------------------------------------------------------------------
// program

const SPEC_KEYS = new Set(['name', 'goal', 'days'])
const DAY_KEYS = new Set(['name', 'notes', 'blocks'])
const BLOCK_KEYS = new Set([
  'slug',
  'sets',
  'reps',
  'perSet',
  'distance',
  'duration',
  'intensity',
  'rest',
  'interval',
  'tempo',
  'notes',
])

const isInt = (v) => Number.isInteger(v)
const isPositive = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0
const isNonNegative = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0

/** Checks a program spec against the app's schema (src/core/model/schemas.ts); every problem at once. */
function checkSpec(spec) {
  const errors = []
  const err = (path, msg) => errors.push(`${path}: ${msg}`)
  const unknownKeys = (obj, keys, path) => {
    for (const k of Object.keys(obj))
      if (!keys.has(k)) err(path, `unknown field "${k}" (expected ${[...keys].join(', ')})`)
  }
  const text = (v, path, { min = 0, max, required = false }) => {
    if (v === undefined) {
      if (required) err(path, 'is required')
      return
    }
    if (typeof v !== 'string') return err(path, 'must be a string')
    if (v.trim().length < min) err(path, min === 1 ? 'must not be empty' : `must have at least ${min} characters`)
    if ((min > 0 ? v.trim() : v).length > max) err(path, `must be at most ${max} characters (has ${v.length})`)
  }
  if (typeof spec !== 'object' || spec === null || Array.isArray(spec)) return ['spec: must be a JSON object']
  unknownKeys(spec, SPEC_KEYS, 'spec')
  text(spec.name, 'name', { min: 1, max: 80, required: true })
  text(spec.goal, 'goal', { max: 300 })
  if (!Array.isArray(spec.days) || spec.days.length === 0) {
    err('days', 'must be a non-empty list')
    return errors
  }
  for (const [d, day] of spec.days.entries()) {
    const dp = `days[${d}]`
    if (typeof day !== 'object' || day === null || Array.isArray(day)) {
      err(dp, 'must be an object')
      continue
    }
    unknownKeys(day, DAY_KEYS, dp)
    text(day.name, `${dp}.name`, { min: 1, max: 60, required: true })
    text(day.notes, `${dp}.notes`, { max: 500 })
    if (!Array.isArray(day.blocks) || day.blocks.length === 0) {
      err(`${dp}.blocks`, 'must be a non-empty list')
      continue
    }
    for (const [i, b] of day.blocks.entries()) {
      const bp = `${dp}.blocks[${i}]`
      if (typeof b !== 'object' || b === null || Array.isArray(b)) {
        err(bp, 'must be an object')
        continue
      }
      unknownKeys(b, BLOCK_KEYS, bp)
      if (!toSlug(b.slug)) err(`${bp}.slug`, `${JSON.stringify(b.slug)} is not a preset slug (see the presets command)`)
      if (!isInt(b.sets) || b.sets < 1 || b.sets > 50) err(`${bp}.sets`, 'must be a whole number from 1 to 50')
      if (b.reps !== undefined && (!isInt(b.reps) || b.reps < 1 || b.reps > 500))
        err(`${bp}.reps`, 'must be a whole number from 1 to 500')
      for (const k of ['distance', 'duration', 'interval'])
        if (b[k] !== undefined && !isPositive(b[k])) err(`${bp}.${k}`, 'must be a number above 0')
      if (b.rest !== undefined && !isNonNegative(b.rest)) err(`${bp}.rest`, 'must be a number of seconds, 0 or more')
      text(b.tempo, `${bp}.tempo`, { max: 20 })
      text(b.notes, `${bp}.notes`, { max: 300 })
      if (b.intensity !== undefined) {
        const it = b.intensity
        if (typeof it !== 'object' || it === null || Array.isArray(it))
          err(`${bp}.intensity`, 'must be { kind, value }')
        else {
          unknownKeys(it, new Set(['kind', 'value']), `${bp}.intensity`)
          if (!INTENSITY_KINDS.includes(it.kind))
            err(`${bp}.intensity.kind`, `must be one of ${INTENSITY_KINDS.join(', ')}`)
          if (!isPositive(it.value)) err(`${bp}.intensity.value`, 'must be a number above 0')
          else if (it.kind === 'rpe' && (it.value < 1 || it.value > 10))
            err(`${bp}.intensity.value`, 'an RPE goes from 1 to 10')
        }
      }
      if (b.perSet !== undefined) {
        if (!Array.isArray(b.perSet) || b.perSet.length > 50)
          err(`${bp}.perSet`, 'must be a list of at most 50 { reps?, value? }')
        else
          for (const [j, t] of b.perSet.entries()) {
            const tp = `${bp}.perSet[${j}]`
            if (typeof t !== 'object' || t === null || Array.isArray(t)) {
              err(tp, 'must be an object')
              continue
            }
            unknownKeys(t, new Set(['reps', 'value']), tp)
            if (t.reps !== undefined && (!isInt(t.reps) || t.reps < 1 || t.reps > 500))
              err(`${tp}.reps`, 'must be a whole number from 1 to 500')
            if (t.value !== undefined && !isPositive(t.value)) err(`${tp}.value`, 'must be a number above 0')
            if (t.value !== undefined && b.intensity === undefined)
              err(`${tp}.value`, "needs the block's intensity (its kind)")
          }
      }
    }
  }
  return errors
}

function addProgram(backup, spec, { now }) {
  const errors = checkSpec(spec)
  if (errors.length > 0) fail(`invalid program spec:\n  ${errors.join('\n  ')}`)
  const at = Date.parse(now)
  const out = { ...backup, exportedAt: now, disciplines: [...backup.disciplines], exercises: [...backup.exercises] }
  const byName = new Map()
  for (const e of out.exercises)
    if (!byName.has(normalizeName(String(e.name ?? '')))) byName.set(normalizeName(String(e.name ?? '')), e.id)
  const added = []
  /** The athlete's record of a preset: its own id, else one named as it in any language, else a new record. */
  const exerciseFor = (slug, disciplineId) => {
    const p = presetBySlug().get(slug)
    if (out.exercises.some((e) => e.id === p.id)) return p.id
    for (const l of LOCALES) {
      const id = byName.get(normalizeName(p.names[l]))
      if (id) return id
    }
    const record = presetExercise(slug, disciplineId, out.settings, now)
    out.exercises.push(record)
    added.push(slug)
    return record.id
  }
  const disciplines = new Map()
  const disciplineOf = (sport) => {
    if (!disciplines.has(sport)) disciplines.set(sport, disciplineFor(sport, out, sportHints(backup, sport), now))
    return disciplines.get(sport)
  }
  const days = spec.days.map((day) => {
    const slugs = day.blocks.map((b) => toSlug(b.slug))
    const sport = presetBySlug().get(slugs[0]).sport
    const disciplineId = disciplineOf(sport)
    return {
      id: newId(at),
      name: day.name.trim(),
      ...(disciplineId ? { disciplineId } : {}),
      blocks: day.blocks.map((b, i) => {
        const slug = slugs[i]
        const own =
          presetBySlug().get(slug).sport === sport ? disciplineId : disciplineOf(presetBySlug().get(slug).sport)
        const { slug: _slug, intensity, perSet, ...rest } = b
        return {
          id: newId(at),
          exerciseId: exerciseFor(slug, own),
          ...rest,
          ...(intensity ? { intensity: { kind: intensity.kind, value: intensity.value } } : {}),
          ...(perSet ? { perSet: perSet.map((t) => ({ ...t })) } : {}),
        }
      }),
      ...(day.notes ? { notes: day.notes } : {}),
    }
  })
  const program = {
    id: newId(at),
    name: spec.name.trim(),
    goal: spec.goal ?? '',
    layout: 'sessions',
    weeks: [{ id: newId(at), days }],
    source: 'ai',
    createdAt: now,
    updatedAt: now,
  }
  out.programs = [...backup.programs, program]
  if (Array.isArray(out.parts)) {
    const parts = new Set([...out.parts, 'programs', 'exercises'])
    out.parts = BACKUP_PARTS.filter((p) => parts.has(p))
  }
  const sameName = backup.programs.some((p) => normalizeName(String(p.name ?? '')) === normalizeName(program.name))
  return { out, program, added, sameName }
}

// ---------------------------------------------------------------------------------------------------------------
// volume

const VOLUME_ASSUMPTION = "Each day is one session of the week: the week is the program's days summed."
const VOLUME_COUNTING =
  'Fractional sets: a set counts 1 for the first muscle its exercise lists (direct) and 0.5 for each other one (indirect).'
const REPEATED_HINT = 'Another exercise for the same muscle gives variety (machine vs cable, for example).'

/** The days of a program spec, each block resolved to its preset: key, name, sets, muscles. */
function specDays(spec) {
  const errors = checkSpec(spec)
  if (errors.length > 0) fail(`invalid program spec:\n  ${errors.join('\n  ')}`)
  return {
    name: spec.name.trim(),
    days: spec.days.map((day) => ({
      name: day.name.trim(),
      blocks: day.blocks.map((b) => {
        const p = presetBySlug().get(toSlug(b.slug))
        return { key: p.slug, name: p.names.en, sets: b.sets, muscles: p.muscles ?? [] }
      }),
    })),
  }
}

/**
 * The days of one week of a backup's program, found by id or by name (as the app compares names), each block
 * resolved through the backup's exercise record, else its preset by id.
 */
function backupDays(backup, which, weekNumber) {
  const byId = backup.programs.find((p) => p.id === which)
  const byName = backup.programs.filter((p) => normalizeName(String(p.name ?? '')) === normalizeName(which))
  const list = () => backup.programs.map((p) => `  ${p.name} [${p.id}]`).join('\n') || '  (none)'
  if (!byId && byName.length > 1)
    fail(
      `${byName.length} programs are named "${which}"; give one's id:\n${byName.map((p) => `  ${p.name} [${p.id}]`).join('\n')}`,
    )
  const program = byId ?? byName[0]
  if (!program) fail(`no program "${which}" in the backup; its programs:\n${list()}`)
  const weeks = Array.isArray(program.weeks) ? program.weeks : []
  if (weekNumber > weeks.length)
    fail(`program "${program.name}" has ${weeks.length} week${weeks.length === 1 ? '' : 's'}, no week ${weekNumber}`)
  const exercises = new Map(backup.exercises.map((e) => [e.id, e]))
  const days = (weeks[weekNumber - 1].days ?? []).map((d) => ({
    name: String(d.name ?? ''),
    blocks: (d.blocks ?? []).map((b) => {
      const ex = exercises.get(b.exerciseId)
      const preset = presetOfId(b.exerciseId)
      return {
        key: b.exerciseId,
        name: ex?.name ?? preset?.names[exerciseLanguage(backup.settings)] ?? `(missing exercise ${b.exerciseId})`,
        sets: isInt(b.sets) && b.sets > 0 ? b.sets : 0,
        muscles: musclesOf(b.exerciseId, ex),
      }
    }),
  }))
  return { name: String(program.name ?? ''), id: program.id, weeks: weeks.length, week: weekNumber, days }
}

/** Fractional sets per muscle per day and per week, and the flags: above the ceiling, below the floor, repeated. */
function volume(program, { ceiling, floor }) {
  const week = {}
  let weekNotCounted = 0
  const seen = new Map()
  const flags = []
  const days = program.days.map((day) => {
    const muscles = {}
    const notCounted = []
    for (const b of day.blocks) {
      const list = [...new Set(b.muscles)]
      if (list.length === 0) notCounted.push({ exercise: b.key, name: b.name, sets: b.sets })
      for (const [i, m] of list.entries()) muscles[m] = (muscles[m] ?? 0) + (i === 0 ? b.sets : b.sets * 0.5)
      let where = seen.get(b.key)
      if (!where) {
        where = { name: b.name, days: [] }
        seen.set(b.key, where)
      }
      if (!where.days.includes(day.name)) where.days.push(day.name)
    }
    for (const [m, n] of Object.entries(muscles)) week[m] = (week[m] ?? 0) + n
    for (const [m, n] of Object.entries(muscles))
      if (n > ceiling) flags.push({ flag: 'above ceiling', day: day.name, muscle: m, sets: round(n), ceiling })
    weekNotCounted += notCounted.reduce((n, x) => n + x.sets, 0)
    return {
      name: day.name,
      sets: day.blocks.reduce((n, b) => n + b.sets, 0),
      exercises: day.blocks.length,
      muscles: sortedMuscles(Object.fromEntries(Object.entries(muscles).map(([m, n]) => [m, round(n)]))),
      notCounted,
    }
  })
  const low = Object.keys(presets().muscles)
    .filter((m) => m !== 'full_body' && (week[m] ?? 0) < floor)
    .map((m) => ({
      flag: 'below floor',
      muscle: m,
      sets: round(week[m] ?? 0),
      floor,
      ...(week[m] ? {} : { noWork: true }),
    }))
    .sort((a, b) => a.sets - b.sets || a.muscle.localeCompare(b.muscle))
  flags.push(...low)
  for (const [key, where] of seen)
    if (where.days.length > 1)
      flags.push({ flag: 'repeated', exercise: key, name: where.name, days: where.days, hint: REPEATED_HINT })
  return {
    program: program.name,
    ...(program.id ? { id: program.id, week: program.week, weeks: program.weeks } : {}),
    assumption: VOLUME_ASSUMPTION,
    counting: VOLUME_COUNTING,
    ceiling,
    floor,
    days,
    perWeek: {
      muscles: sortedMuscles(Object.fromEntries(Object.entries(week).map(([m, n]) => [m, round(n)]))),
      notCounted: weekNotCounted,
    },
    flags,
  }
}

function printVolume(v) {
  const muscles = (o) =>
    Object.entries(o)
      .map(([m, n]) => `${m} ${n}`)
      .join(', ') || '-'
  const out = [`${v.program}: ${v.days.length} days`]
  if (v.weeks > 1) out.push(`Week ${v.week} of ${v.weeks} (--week to choose another).`)
  out.push(v.assumption, v.counting)
  for (const d of v.days) {
    out.push('', `${d.name}: ${d.sets} sets, ${d.exercises} exercises`, `  ${muscles(d.muscles)}`)
    if (d.notCounted.length > 0)
      out.push(`  not counted (no muscles): ${d.notCounted.map((x) => `${x.name} ${x.sets}`).join(', ')}`)
  }
  out.push('', 'Per week', `  ${muscles(v.perWeek.muscles)}`)
  if (v.perWeek.notCounted > 0) out.push(`  not counted (no muscles): ${v.perWeek.notCounted} sets`)
  out.push('', `Flags (advice: ceiling ${v.ceiling} per muscle per session, floor ${v.floor} per muscle per week)`)
  if (v.flags.length === 0) out.push('  none')
  for (const f of v.flags) {
    if (f.flag === 'above ceiling') out.push(`  above ceiling: ${f.muscle} ${f.sets} on ${f.day}`)
    else if (f.flag === 'below floor') out.push(`  below floor: ${f.muscle} ${f.sets}${f.noWork ? ' (no work)' : ''}`)
    else out.push(`  repeated: ${f.name} on ${f.days.join(', ')}. ${f.hint}`)
  }
  return `${out.join('\n')}\n`
}

/** A `--ceiling`, `--floor` or `--week` value: a number, above 0 unless `zero` allows it, whole if `whole`. */
function numberFlag(flags, name, fallback, { zero = false, whole = false } = {}) {
  const raw = flags[name]
  if (raw === undefined) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0 || (!zero && n === 0) || (whole && !isInt(n)))
    fail(`${name} must be ${whole ? 'a whole number' : 'a number'} ${zero ? '0 or more' : 'above 0'} (got ${raw})`)
  return n
}

// ---------------------------------------------------------------------------------------------------------------
// Main.

function main(argv) {
  const [command, ...rest] = argv
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    process.stdout.write(USAGE)
    return command ? 0 : 1
  }
  const { positional, flags } = parseArgs(rest)
  if (flags['--help']) {
    process.stdout.write(USAGE)
    return 0
  }
  const now = new Date().toISOString()
  const need = (n, usage) => {
    if (positional.length !== n) fail(`usage: node cadence.mjs ${usage}`)
  }
  switch (command) {
    case 'summary': {
      need(1, 'summary <backup.json> [--json]')
      const s = summarize(readBackup(positional[0], { write: false }))
      process.stdout.write(flags['--json'] ? `${JSON.stringify(s, null, 2)}\n` : printSummary(s))
      return 0
    }
    case 'presets': {
      need(0, 'presets [--sport gym|swim|running] [--muscle <muscle>] [--json]')
      const list = listPresets({ sport: flags['--sport'], muscle: flags['--muscle'] })
      process.stdout.write(flags['--json'] ? `${JSON.stringify(list, null, 2)}\n` : printPresets(list))
      return 0
    }
    case 'match': {
      need(1, 'match <backup.json> [--json]')
      const r = matchBackup(readBackup(positional[0], { write: false }))
      process.stdout.write(flags['--json'] ? `${JSON.stringify(r, null, 2)}\n` : printMatch(r))
      return 0
    }
    case 'remap': {
      need(2, 'remap <backup.json> <mapping.json> -o <out.json> [--drop-programs] [--keep-unused]')
      const [input, mappingPath] = positional
      if (!flags['-o']) fail('missing -o <out.json>')
      const backup = readBackup(input, { write: true })
      const { out, report } = remap(backup, readJson(mappingPath, 'mapping'), {
        dropPrograms: flags['--drop-programs'] === true,
        keepUnused: flags['--keep-unused'] === true,
        now,
      })
      writeOutput(flags['-o'], out, [input, mappingPath])
      process.stdout.write(flags['--json'] ? `${JSON.stringify(report, null, 2)}\n` : printRemap(report, flags['-o']))
      return 0
    }
    case 'program': {
      need(1, 'program <spec.json> --into <backup.json> -o <out.json>')
      const specPath = positional[0]
      if (!flags['--into']) fail('missing --into <backup.json>')
      if (!flags['-o']) fail('missing -o <out.json>')
      const backup = readBackup(flags['--into'], { write: true })
      const { out, program, added, sameName } = addProgram(backup, readJson(specPath, 'program spec'), { now })
      writeOutput(flags['-o'], out, [flags['--into'], specPath])
      const blocks = program.weeks[0].days.reduce((n, d) => n + d.blocks.length, 0)
      const lines = [
        `Wrote ${flags['-o']}`,
        `  program "${program.name}" [${program.id}]: ${program.weeks[0].days.length} days, ${blocks} blocks`,
        `  preset exercises added: ${added.length}${added.length ? ` (${added.join(', ')})` : ''}`,
      ]
      if (sameName) lines.push('  note: the backup already had a program with this name; both are kept')
      process.stdout.write(`${lines.join('\n')}\n`)
      return 0
    }
    case 'volume': {
      need(
        1,
        'volume <spec.json | backup.json> [--program <name or id>] [--week 1] [--json] [--ceiling 11] [--floor 6]',
      )
      const path = positional[0]
      const ceiling = numberFlag(flags, '--ceiling', 11)
      const floor = numberFlag(flags, '--floor', 6, { zero: true })
      const raw = readJson(path, 'program spec or backup')
      const isBackup = typeof raw === 'object' && raw !== null && raw.app === 'cadence'
      let program
      if (isBackup) {
        if (!flags['--program']) fail(`${path} is a backup: add --program <name or id>`)
        program = backupDays(
          readBackup(path, { write: false }),
          flags['--program'],
          numberFlag(flags, '--week', 1, { whole: true }),
        )
      } else {
        if (flags['--program']) fail(`--program reads a backup, and ${path} is not one`)
        if (flags['--week']) fail(`--week reads a backup's program, and ${path} is not a backup`)
        program = specDays(raw)
      }
      const v = volume(program, { ceiling, floor })
      process.stdout.write(flags['--json'] ? `${JSON.stringify(v, null, 2)}\n` : printVolume(v))
      return 0
    }
    default:
      process.stderr.write(`cadence: unknown command "${command}"\n\n${USAGE}`)
      return 1
  }
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (err) {
  if (err instanceof CliError) {
    process.stderr.write(`cadence: ${err.message}\n`)
    process.exitCode = 1
  } else throw err
}
