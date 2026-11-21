import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSkillPresets } from '../../../scripts/build-skill-presets.ts'
import { buildDemo } from '../demo/demo.ts'
import { messagesFor } from '../i18n/index.ts'
import { newId } from '../model/ids.ts'
import { BACKUP_VERSION, Backup, DEFAULT_SETTINGS, MUSCLES } from '../model/schemas.ts'
import { parseBackup } from '../storage/backup.ts'

/** The cadence-coach skill: its preset reference and its backup script, run as an athlete's agent would. */

const skill = (path: string) => fileURLToPath(new URL(`../../../skills/cadence-coach/${path}`, import.meta.url))
const SCRIPT = skill('scripts/cadence.mjs')
// The script is plain Node; Bun runs it the same where Node is missing.
const RUNTIME = Bun.which('node') ?? process.execPath
const dir = mkdtempSync(join(tmpdir(), 'cadence-skill-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const file = (name: string, data: unknown) => {
  const path = join(dir, name)
  writeFileSync(path, typeof data === 'string' ? data : JSON.stringify(data))
  return path
}

function run(...args: string[]) {
  const r = Bun.spawnSync([RUNTIME, SCRIPT, ...args], { stdout: 'pipe', stderr: 'pipe' })
  return { code: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() }
}

/** What `volume --json` prints. */
interface Volume {
  assumption: string
  ceiling: number
  floor: number
  days: {
    name: string
    sets: number
    exercises: number
    muscles: Record<string, number>
    notCounted: { exercise: string; name: string; sets: number }[]
    optional?: { sets: number; exercises: number; blocks: { exercise: string; name: string; sets: number }[] }
    withOptional?: {
      sets: number
      exercises: number
      muscles: Record<string, number>
      notCounted: { exercise: string; name: string; sets: number }[]
    }
  }[]
  perWeek: {
    muscles: Record<string, number>
    notCounted: number
    withOptional?: { muscles: Record<string, number>; notCounted: number }
  }
  flags: VolumeFlag[]
  optionalFlags?: (VolumeFlag & { change: 'appears' | 'disappears'; withOptional?: number })[]
}

interface VolumeFlag {
  flag: string
  day?: string
  muscle?: string
  sets?: number
  noWork?: boolean
  ceiling?: number
  floor?: number
  exercise?: string
  name?: string
  days?: string[]
  hint?: string
}

const fr = messagesFor('fr').presets.exercises
const SQUAT = newId()
const BENCH = newId()

/**
 * The demo's gym and swim data as an athlete's own: its exercises are not presets, the squat is named in French as
 * the preset is, and the bench press has a name of its own.
 */
function fixture(): Backup {
  const now = new Date('2026-10-16T08:00:00Z')
  const demo = buildDemo({ sports: ['gym', 'swim'], withSessions: true, today: '2026-10-16', now })
  const ids = new Map([
    ['back-squat', SQUAT],
    ['bench-press', BENCH],
  ])
  const to = (id: string) => ids.get(id) ?? id
  return Backup.parse({
    app: 'cadence',
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    settings: DEFAULT_SETTINGS,
    disciplines: demo.disciplines,
    exercises: demo.exercises.map((e) => {
      if (e.id === 'back-squat') return { ...e, id: SQUAT, name: fr['back-squat'] }
      if (e.id === 'bench-press') return { ...e, id: BENCH, name: 'Banc du mardi soir', notes: 'Pause on the chest' }
      return e
    }),
    programs: demo.programs.map((p) => ({
      ...p,
      weeks: p.weeks.map((w) => ({
        ...w,
        days: w.days.map((d) => ({ ...d, blocks: d.blocks.map((b) => ({ ...b, exerciseId: to(b.exerciseId) })) })),
      })),
    })),
    sessions: demo.sessions.map((s) => ({
      ...s,
      entries: s.entries.map((e) => ({ ...e, exerciseId: to(e.exerciseId) })),
    })),
    goals: demo.goals.map((g) => (g.exerciseId ? { ...g, exerciseId: to(g.exerciseId) } : g)),
    notes: [],
    deleted: [],
  })
}

const backup = fixture()
const input = file('backup.json', backup)
/** Every exercise the sessions use, onto a preset; the swim pull buoy joins freestyle, which the sessions use too. */
const mapping = {
  [SQUAT]: 'back-squat',
  [BENCH]: 'preset-barbell-bench-press',
  'pull-up': 'pull-up',
  'swim-free': 'swim-freestyle',
  'swim-pull': 'swim-freestyle',
  'swim-kick': 'swim-kick',
}

describe('cadence-coach skill', () => {
  test('presets.json is what the generator writes from the catalog and its messages (bun run skill:presets)', () => {
    const onDisk = JSON.parse(readFileSync(skill('references/presets.json'), 'utf8'))
    expect(JSON.stringify(onDisk)).toBe(JSON.stringify(buildSkillPresets()))
  })

  test('match: a name that is a preset in French is sure; one of its own is not', () => {
    const r = run('match', input, '--json')
    expect(r.code).toBe(0)
    const out = JSON.parse(r.stdout) as {
      exercises: { id: string; status: string; unused: boolean; candidates: { slug: string }[] }[]
      mapping: Record<string, string | null>
    }
    const squat = out.exercises.find((e) => e.id === SQUAT)
    expect(squat?.status).toBe('sure')
    expect(squat?.candidates[0]?.slug).toBe('back-squat')
    expect(out.mapping[SQUAT]).toBe('back-squat')
    expect(out.exercises.find((e) => e.id === BENCH)?.status).not.toBe('sure')
    expect(out.mapping[BENCH]).toBeNull()
    expect(out.exercises.every((e) => !e.id.startsWith('preset-'))).toBe(true)
  })

  test('remap: every exercise becomes a preset, sessions and their sets unchanged', () => {
    const out = join(dir, 'remapped.json')
    const r = run('remap', input, file('mapping.json', mapping), '-o', out, '--drop-programs')
    expect(r.stderr).toBe('')
    expect(r.code).toBe(0)
    const result = parseBackup(readFileSync(out, 'utf8'))
    expect(result.exercises.length).toBeGreaterThan(0)
    expect(result.exercises.every((e) => e.id.startsWith('preset-'))).toBe(true)
    // Two of the athlete's exercises on one preset: one record.
    expect(result.exercises.filter((e) => e.id === 'preset-swim-freestyle')).toHaveLength(1)
    // What the athlete wrote about an exercise stays with it.
    expect(result.exercises.find((e) => e.id === 'preset-barbell-bench-press')?.notes).toBe('Pause on the chest')
    expect(result.sessions).toHaveLength(backup.sessions.length)
    for (const s of backup.sessions) {
      const after = result.sessions.find((x) => x.id === s.id)
      expect(after?.entries.map((e) => e.sets.length)).toEqual(s.entries.map((e) => e.sets.length))
      expect(after?.entries.every((e) => e.exerciseId.startsWith('preset-'))).toBe(true)
    }
    const ids = new Set(result.exercises.map((e) => e.id))
    for (const s of result.sessions) for (const e of s.entries) expect(ids.has(e.exerciseId)).toBe(true)
    expect(result.programs).toEqual([])
    expect(result.goals.find((g) => g.id === 'demo-goal-gym')?.exerciseId).toBe('preset-back-squat')
    expect(result.deleted).toEqual([])
    expect(result.parts).toBeUndefined()
    const disciplines = new Set(result.disciplines.map((d) => d.id))
    for (const e of result.exercises) if (e.disciplineId) expect(disciplines.has(e.disciplineId)).toBe(true)
  })

  test('remap fails, naming them, while a used exercise has no preset; and never writes over its input', () => {
    const { 'swim-kick': _kick, ...partial } = mapping
    const missing = run('remap', input, file('partial.json', partial), '-o', join(dir, 'never.json'), '--drop-programs')
    expect(missing.code).not.toBe(0)
    expect(missing.stderr).toContain('swim-kick')
    // The programs use exercises the mapping leaves out.
    const programs = run('remap', input, file('mapping2.json', mapping), '-o', join(dir, 'never.json'))
    expect(programs.code).not.toBe(0)
    expect(programs.stderr).toContain('--drop-programs')
    const unknown = run(
      'remap',
      input,
      file('bad.json', { ...mapping, 'pull-up': 'not-a-preset' }),
      '-o',
      join(dir, 'x'),
    )
    expect(unknown.code).not.toBe(0)
    expect(unknown.stderr).toContain('not-a-preset')
    const over = run('remap', input, file('mapping3.json', mapping), '-o', input, '--drop-programs')
    expect(over.code).not.toBe(0)
    expect(readFileSync(input, 'utf8')).toBe(JSON.stringify(backup))
  })

  test('program: added to the backup as the app would hold it, with the preset exercises it needs', () => {
    const into = join(dir, 'remapped.json')
    if (run('remap', input, file('mapping4.json', mapping), '-o', into, '--drop-programs').code !== 0)
      throw new Error('remap failed')
    const spec = {
      name: 'Upper lower',
      goal: 'Get stronger on the main lifts',
      days: [
        {
          name: 'Upper',
          blocks: [
            { slug: 'barbell-bench-press', sets: 4, reps: 6, intensity: { kind: 'rpe', value: 8 }, rest: 150 },
            { slug: 'preset-lat-pulldown', sets: 3, reps: 10, notes: 'Full stretch at the top' },
          ],
        },
        {
          name: 'Lower',
          blocks: [
            { slug: 'back-squat', sets: 4, reps: 5, intensity: { kind: 'pct1rm', value: 80 }, rest: 180 },
            { slug: 'plank', sets: 3, duration: 45, rest: 60 },
          ],
        },
      ],
    }
    const out = join(dir, 'with-program.json')
    const r = run('program', file('spec.json', spec), '--into', into, '-o', out)
    expect(r.stderr).toBe('')
    expect(r.code).toBe(0)
    const result = parseBackup(readFileSync(out, 'utf8'))
    const program = result.programs.find((p) => p.name === 'Upper lower')
    expect(program?.layout).toBe('sessions')
    expect(program?.source).toBe('ai')
    expect(program?.weeks).toHaveLength(1)
    const blocks = program?.weeks.flatMap((w) => w.days.flatMap((d) => d.blocks)) ?? []
    expect(blocks).toHaveLength(4)
    const ulid = /^[0-9A-HJKMNP-TV-Z]{26}$/
    expect(program?.id).toMatch(ulid)
    for (const b of blocks) expect(b.id).toMatch(ulid)
    const ids = new Set(result.exercises.map((e) => e.id))
    for (const b of blocks) expect(ids.has(b.exerciseId)).toBe(true)
    expect(ids.has('preset-lat-pulldown')).toBe(true)
    expect(ids.has('preset-plank')).toBe(true)
    const disciplines = new Set(result.disciplines.map((d) => d.id))
    for (const d of program?.weeks[0]?.days ?? []) expect(disciplines.has(d.disciplineId ?? '')).toBe(true)

    const unknown = run(
      'program',
      file('bad-spec.json', { ...spec, days: [{ name: 'X', blocks: [{ slug: 'moon-press', sets: 3 }] }] }),
      '--into',
      into,
      '-o',
      join(dir, 'never.json'),
    )
    expect(unknown.code).not.toBe(0)
    expect(unknown.stderr).toContain('moon-press')
    const reps = run(
      'program',
      file('bad-reps.json', { ...spec, days: [{ name: 'X', blocks: [{ slug: 'plank', sets: 3, reps: 0 }] }] }),
      '--into',
      into,
      '-o',
      join(dir, 'never.json'),
    )
    expect(reps.code).not.toBe(0)
    expect(reps.stderr).toContain('reps')
  })

  test('program: an optional block is written as optional, a required one without the field', () => {
    const into = join(dir, 'optional-remapped.json')
    if (run('remap', input, file('optional-mapping.json', mapping), '-o', into, '--drop-programs').code !== 0)
      throw new Error('remap failed')
    const spec = {
      name: 'With extras',
      days: [
        {
          name: 'Upper',
          blocks: [
            { slug: 'barbell-bench-press', sets: 4, reps: 6 },
            { slug: 'lat-pulldown', sets: 3, reps: 10, optional: false },
            { slug: 'cable-crunch', sets: 2, reps: 10, optional: true },
          ],
        },
      ],
    }
    const out = join(dir, 'optional-with-program.json')
    const r = run('program', file('optional-spec.json', spec), '--into', into, '-o', out)
    expect(r.stderr).toBe('')
    expect(r.code).toBe(0)
    const raw = JSON.parse(readFileSync(out, 'utf8')) as { version: number }
    expect(raw.version).toBe(BACKUP_VERSION)
    const result = parseBackup(readFileSync(out, 'utf8'))
    const blocks = result.programs.find((p) => p.name === 'With extras')?.weeks[0]?.days[0]?.blocks ?? []
    expect(blocks.map((b) => b.optional)).toEqual([undefined, undefined, true])
    expect(blocks.map((b) => 'optional' in b)).toEqual([false, false, true])

    const bad = run(
      'program',
      file('optional-bad.json', {
        ...spec,
        days: [{ name: 'X', blocks: [{ slug: 'plank', sets: 3, optional: 'yes' }] }],
      }),
      '--into',
      into,
      '-o',
      join(dir, 'never.json'),
    )
    expect(bad.code).not.toBe(0)
    expect(bad.stderr).toContain('days[0].blocks[0].optional')
  })

  test('a version 12 backup reads as the current version; older ones still fail to write', () => {
    const into = join(dir, 'v12-remapped.json')
    if (run('remap', input, file('v12-mapping.json', mapping), '-o', into, '--drop-programs').code !== 0)
      throw new Error('remap failed')
    const v12 = file('v12.json', { ...JSON.parse(readFileSync(into, 'utf8')), version: 12 })
    const spec = file('v12-spec.json', { name: 'From 12', days: [{ name: 'A', blocks: [{ slug: 'plank', sets: 3 }] }] })
    const out = join(dir, 'v12-with-program.json')
    const r = run('program', spec, '--into', v12, '-o', out)
    expect(r.stderr).toBe('')
    expect(r.code).toBe(0)
    expect((JSON.parse(readFileSync(out, 'utf8')) as { version: number }).version).toBe(BACKUP_VERSION)
    expect(parseBackup(readFileSync(out, 'utf8')).programs.map((p) => p.name)).toContain('From 12')
    const summary = run('summary', v12)
    expect(summary.stderr).toBe('')
    expect(summary.code).toBe(0)

    const v11 = file('v11.json', { ...JSON.parse(readFileSync(into, 'utf8')), version: 11 })
    const old = run('program', spec, '--into', v11, '-o', join(dir, 'never.json'))
    expect(old.code).not.toBe(0)
    expect(old.stderr).toContain('version 11')
    expect(run('summary', v11).stderr).toContain('warning')
  })

  test('volume: direct sets count 1 for the first muscle, 0.5 for the others; no muscle is not counted', () => {
    const spec = {
      name: 'Small',
      days: [
        {
          name: 'A',
          blocks: [
            { slug: 'machine-chest-press', sets: 4, reps: 8 },
            { slug: 'triceps-pushdown', sets: 3, reps: 10 },
            { slug: 'hip-adduction-machine', sets: 2, reps: 12 },
            { slug: 'assisted-pull-up', sets: 3, reps: 8 },
          ],
        },
        { name: 'B', blocks: [{ slug: 'leg-press', sets: 5, reps: 10 }] },
      ],
    }
    const r = run('volume', file('volume-small.json', spec), '--json')
    expect(r.stderr).toBe('')
    expect(r.code).toBe(0)
    const v = JSON.parse(r.stdout) as Volume
    const [a, b] = v.days
    expect(a?.sets).toBe(12)
    expect(a?.exercises).toBe(4)
    // Chest press: chest, triceps. Pushdown: triceps. Assisted pull-up: back, biceps (assisted machines count).
    expect(a?.muscles).toEqual({ chest: 4, triceps: 5, back: 3, biceps: 1.5 })
    expect(a?.notCounted).toEqual([{ exercise: 'hip-adduction-machine', name: 'Hip adduction machine', sets: 2 }])
    expect(b?.muscles).toEqual({ quads: 5, glutes: 2.5 })
    expect(v.perWeek.muscles).toEqual({ quads: 5, triceps: 5, chest: 4, back: 3, glutes: 2.5, biceps: 1.5 })
    expect(Object.keys(v.perWeek.muscles)).toEqual(['quads', 'triceps', 'chest', 'back', 'glutes', 'biceps'])
    expect(v.perWeek.notCounted).toBe(2)
    expect(v.assumption).toContain('one session of the week')
    expect(v.flags.filter((f) => f.flag === 'above ceiling')).toEqual([])

    const text = run('volume', file('volume-small.json', spec))
    expect(text.code).toBe(0)
    expect(text.stdout).toContain('one session of the week')
    expect(text.stdout).toContain('A: 12 sets, 4 exercises\n  triceps 5, chest 4, back 3, biceps 1.5')
    expect(text.stdout).toContain('not counted (no muscles): Hip adduction machine 2')
  })

  test('volume: above the ceiling in a session, below the floor in the week, an exercise on two days', () => {
    const spec = {
      name: 'Flags',
      days: [
        {
          name: 'Chest day',
          blocks: [
            { slug: 'pec-deck', sets: 12, reps: 10 },
            { slug: 'triceps-pushdown', sets: 6, reps: 10 },
          ],
        },
        { name: 'Arms day', blocks: [{ slug: 'triceps-pushdown', sets: 6, reps: 10 }] },
      ],
    }
    const path = file('volume-flags.json', spec)
    const v = JSON.parse(run('volume', path, '--json').stdout) as Volume
    expect(v.ceiling).toBe(11)
    expect(v.floor).toBe(6)
    expect(v.flags.filter((f) => f.flag === 'above ceiling')).toEqual([
      { flag: 'above ceiling', day: 'Chest day', muscle: 'chest', sets: 12, ceiling: 11 },
    ])
    const low = v.flags.filter((f) => f.flag === 'below floor')
    // Every muscle of the app's enum but the trained ones, at 0, and never full_body.
    expect(low.map((f) => f.muscle).sort()).toEqual(
      MUSCLES.filter((m) => !['chest', 'triceps', 'full_body'].includes(m)).sort(),
    )
    expect(low.every((f) => f.sets === 0 && f.noWork === true)).toBe(true)
    expect(v.flags.filter((f) => f.flag === 'repeated')).toEqual([
      {
        flag: 'repeated',
        exercise: 'triceps-pushdown',
        name: 'Triceps pushdown',
        days: ['Chest day', 'Arms day'],
        hint: expect.stringContaining('variety'),
      },
    ])

    // Thresholds: the ceiling is strict (6 triceps sets on a day is not above 6), the floor too (12 is not below 12).
    const tuned = JSON.parse(run('volume', path, '--json', '--ceiling', '6', '--floor', '12').stdout) as Volume
    expect(tuned.flags.filter((f) => f.flag === 'above ceiling').map((f) => `${f.day}:${f.muscle}`)).toEqual([
      'Chest day:chest',
    ])
    expect(tuned.flags.find((f) => f.flag === 'below floor' && f.muscle === 'triceps')).toBeUndefined()
    expect(tuned.flags.find((f) => f.flag === 'below floor' && f.muscle === 'chest')).toBeUndefined()
    const lower = JSON.parse(run('volume', path, '--json', '--floor', '13').stdout) as Volume
    expect(lower.flags.find((f) => f.flag === 'below floor' && f.muscle === 'chest')).toEqual({
      flag: 'below floor',
      muscle: 'chest',
      sets: 12,
      floor: 13,
    })

    const text = run('volume', path).stdout
    expect(text).toContain('above ceiling: chest 12 on Chest day')
    expect(text).toContain('below floor: core 0 (no work)')
    expect(text).toContain('repeated: Triceps pushdown on Chest day, Arms day')

    expect(run('volume', path, '--ceiling', 'many').code).toBe(1)
    expect(run('volume', file('volume-bad.json', { name: 'X', days: [] })).code).toBe(1)
    expect(run('volume', join(dir, 'nowhere.json')).code).toBe(1)
  })

  test('volume: a program in a backup, by name or id, counts as its spec does', () => {
    const into = join(dir, 'volume-remapped.json')
    if (run('remap', input, file('volume-mapping.json', mapping), '-o', into, '--drop-programs').code !== 0)
      throw new Error('remap failed')
    const spec = {
      name: 'Upper lower volume',
      days: [
        {
          name: 'Upper',
          blocks: [
            { slug: 'barbell-bench-press', sets: 4, reps: 6 },
            { slug: 'lat-pulldown', sets: 3, reps: 10 },
            { slug: 'wrist-curl', sets: 2, reps: 15 },
          ],
        },
        { name: 'Lower', blocks: [{ slug: 'back-squat', sets: 4, reps: 5 }] },
      ],
    }
    const specPath = file('volume-spec.json', spec)
    const out = join(dir, 'volume-with-program.json')
    expect(run('program', specPath, '--into', into, '-o', out).code).toBe(0)
    const fromSpec = JSON.parse(run('volume', specPath, '--json').stdout) as Volume
    const byName = run('volume', out, '--program', 'upper lower VOLUME', '--json')
    expect(byName.stderr).toBe('')
    expect(byName.code).toBe(0)
    const v = JSON.parse(byName.stdout) as Volume
    expect(v.days.map((d) => d.muscles)).toEqual(fromSpec.days.map((d) => d.muscles))
    expect(v.perWeek).toEqual(fromSpec.perWeek)
    expect(v.days[0]?.notCounted.map((x) => x.sets)).toEqual([2])
    const id = parseBackup(readFileSync(out, 'utf8')).programs.find((p) => p.name === spec.name)?.id ?? ''
    const byId = JSON.parse(run('volume', out, '--program', id, '--json').stdout) as Volume
    expect(byId.perWeek).toEqual(fromSpec.perWeek)

    expect(run('volume', out).code).toBe(1)
    const missing = run('volume', out, '--program', 'No such program')
    expect(missing.code).toBe(1)
    expect(missing.stderr).toContain(spec.name)
    expect(run('volume', specPath, '--program', 'Upper lower volume').code).toBe(1)
  })

  test('volume: optional blocks are counted apart, with the flags they would change', () => {
    const required = {
      A: [
        { slug: 'pec-deck', sets: 8, reps: 10 },
        { slug: 'triceps-pushdown', sets: 3, reps: 10 },
      ],
      B: [{ slug: 'leg-press', sets: 5, reps: 10 }],
    }
    const plainSpec = {
      name: 'Extras',
      days: [
        { name: 'A', blocks: required.A },
        { name: 'B', blocks: required.B },
      ],
    }
    const spec = {
      name: 'Extras',
      days: [
        {
          name: 'A',
          blocks: [
            ...required.A,
            { slug: 'machine-chest-press', sets: 4, reps: 10, optional: true },
            { slug: 'cable-crunch', sets: 3, reps: 10, optional: true },
          ],
        },
        { name: 'B', blocks: [...required.B, { slug: 'ab-crunch-machine', sets: 3, reps: 10, optional: true }] },
      ],
    }
    const plainPath = file('volume-plain.json', plainSpec)
    const specPath = file('volume-optional.json', spec)
    const plain = JSON.parse(run('volume', plainPath, '--json').stdout) as Volume
    const r = run('volume', specPath, '--json')
    expect(r.stderr).toBe('')
    expect(r.code).toBe(0)
    const v = JSON.parse(r.stdout) as Volume

    // The required blocks count exactly as the same program without the optional ones.
    expect(v.days.map(({ optional: _o, withOptional: _w, ...d }) => d)).toEqual(plain.days)
    expect(v.perWeek.muscles).toEqual(plain.perWeek.muscles)
    expect(v.perWeek.notCounted).toBe(plain.perWeek.notCounted)
    expect(v.flags).toEqual(plain.flags)
    expect(plain.days.every((d) => d.optional === undefined && d.withOptional === undefined)).toBe(true)
    expect(plain.perWeek.withOptional).toBeUndefined()
    expect(plain.optionalFlags).toBeUndefined()

    const [a, b] = v.days
    expect(a?.sets).toBe(11)
    expect(a?.optional).toEqual({
      sets: 7,
      exercises: 2,
      blocks: [
        { exercise: 'machine-chest-press', name: 'Seated chest press', sets: 4 },
        { exercise: 'cable-crunch', name: 'Cable crunch', sets: 3 },
      ],
    })
    // Machine chest press: chest, triceps.
    expect(a?.withOptional).toEqual({
      sets: 18,
      exercises: 4,
      muscles: { chest: 12, triceps: 5, core: 3 },
      notCounted: [],
    })
    expect(b?.withOptional?.muscles).toEqual({ quads: 5, core: 3, glutes: 2.5 })
    expect(v.perWeek.withOptional).toEqual({
      muscles: { chest: 12, core: 6, quads: 5, triceps: 5, glutes: 2.5 },
      notCounted: 0,
    })
    expect(Object.keys(v.perWeek.withOptional?.muscles ?? {})).toEqual(['chest', 'core', 'quads', 'triceps', 'glutes'])
    // Chest passes the ceiling on A with the chest press; core reaches the floor with both crunches.
    expect(v.optionalFlags).toEqual([
      { change: 'appears', flag: 'above ceiling', day: 'A', muscle: 'chest', sets: 12, ceiling: 11 },
      { change: 'disappears', flag: 'below floor', muscle: 'core', sets: 0, floor: 6, noWork: true, withOptional: 6 },
    ])

    const text = run('volume', specPath).stdout
    expect(text).toContain(
      'A: 11 sets, 2 exercises\n  chest 8, triceps 3\n  with optional blocks (+Seated chest press 4, Cable crunch 3): 18 sets, 4 exercises\n    chest 12, triceps 5, core 3',
    )
    expect(text).toContain('\n  with optional blocks: chest 12, core 6, quads 5, triceps 5, glutes 2.5\n')
    expect(text).toContain(
      'With every optional block done, the flags would change:\n  + above ceiling: chest 12 on A\n  - below floor: core 0 (no work), 6 with optional blocks\n',
    )
    expect(run('volume', plainPath).stdout).not.toContain('optional')

    // From a backup, the blocks read their optional flag as the spec gives it.
    const into = join(dir, 'volume-optional-remapped.json')
    if (run('remap', input, file('volume-optional-mapping.json', mapping), '-o', into, '--drop-programs').code !== 0)
      throw new Error('remap failed')
    const out = join(dir, 'volume-optional-with-program.json')
    expect(run('program', specPath, '--into', into, '-o', out).code).toBe(0)
    const fromBackup = JSON.parse(run('volume', out, '--program', 'Extras', '--json').stdout) as Volume
    expect(fromBackup.days.map((d) => d.withOptional?.muscles)).toEqual(v.days.map((d) => d.withOptional?.muscles))
    expect(fromBackup.perWeek).toEqual(v.perWeek)
    expect(fromBackup.optionalFlags).toEqual(v.optionalFlags)

    // The summary counts a program's optional blocks.
    const summary = JSON.parse(run('summary', out, '--json').stdout) as {
      programs: { name: string; optionalBlocks: number }[]
    }
    expect(summary.programs.find((p) => p.name === 'Extras')?.optionalBlocks).toBe(3)
    expect(run('summary', out).stdout).toMatch(
      / {2}Extras \[[0-9A-Z]{26}\]: sessions, 1 weeks, 2 days, 3 optional blocks\n/,
    )
  })

  test('the worked example builds into a backup the app accepts, and volume reads it', () => {
    const example = skill('references/examples/ppl-machines-1x-week.json')
    const into = join(dir, 'example-remapped.json')
    if (run('remap', input, file('example-mapping.json', mapping), '-o', into, '--drop-programs').code !== 0)
      throw new Error('remap failed')
    const out = join(dir, 'example-with-program.json')
    const r = run('program', example, '--into', into, '-o', out)
    expect(r.stderr).toBe('')
    expect(r.code).toBe(0)
    const result = parseBackup(readFileSync(out, 'utf8'))
    const program = result.programs.find((p) => p.name === 'Push Pull Legs — machines (1×/week)')
    expect(program?.weeks[0]?.days.map((d) => d.name)).toEqual(['Push', 'Pull', 'Legs'])
    const blocks = program?.weeks[0]?.days.flatMap((d) => d.blocks) ?? []
    expect(blocks.every((b) => b.intensity?.kind === 'rpe')).toBe(true)
    expect(blocks.filter((b) => b.optional).map((b) => b.exerciseId)).toEqual([
      'preset-overhead-triceps-extension',
      'preset-shrug',
      'preset-hammer-curl',
      'preset-ab-crunch-machine',
    ])

    const v = run('volume', example, '--json')
    expect(v.code).toBe(0)
    const volume = JSON.parse(v.stdout) as Volume
    expect(volume.perWeek.muscles).toEqual({
      shoulders: 13.5,
      chest: 11.5,
      biceps: 11,
      back: 10,
      triceps: 8,
      hamstrings: 7,
      quads: 7,
      glutes: 5,
      calves: 3,
      core: 3,
    })
    const readme = readFileSync(skill('references/examples/README.md'), 'utf8')
    expect(readme).toContain(run('volume', example).stdout.trim())
  })

  test('summary reads the history; an unknown command fails with the usage', () => {
    const r = run('summary', input, '--json')
    expect(r.code).toBe(0)
    const s = JSON.parse(r.stdout) as { totals: { sessions: number }; exercises: { id: string; bestE1rm?: unknown }[] }
    expect(s.totals.sessions).toBe(backup.sessions.length)
    expect(s.exercises.find((e) => e.id === SQUAT)?.bestE1rm).toBeDefined()
    const bad = run('nope')
    expect(bad.code).toBe(1)
    expect(bad.stderr).toContain('Usage')
  })
})
