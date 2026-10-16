import { newId } from '../model/ids.ts'
import type { Block, Day, Program, ProgramLayout, Week } from '../model/schemas.ts'
import { DEMO_DISCIPLINES, type DemoSport } from './catalog.ts'

/** The demo's programs, one or two per sport. Days carry their sport; `instantiate` maps it to a discipline. */

export interface Template {
  id: string
  name: string
  summary: string
  level: 'beginner' | 'intermediate'
  sport: DemoSport
  goal: string
  /** `sessions`: a set of sessions done in any order, kept as the days of one week. */
  layout?: ProgramLayout
  build: () => Week[]
}

type BlockSpec = Omit<Block, 'id' | 'exerciseId' | 'sets'>

const b = (exerciseId: string, sets: number, spec: BlockSpec = {}): Block => ({
  id: newId(),
  exerciseId,
  sets,
  ...spec,
})
const day = (name: string, sport: DemoSport, blocks: Block[], notes?: string): Day => ({
  id: newId(),
  name,
  disciplineId: DEMO_DISCIPLINES[sport].id,
  blocks,
  ...(notes ? { notes } : {}),
})
const week = (name: string, days: Day[]): Week => ({ id: newId(), name, days })

const pct = (value: number) => ({ kind: 'pct1rm' as const, value })
const rpe = (value: number) => ({ kind: 'rpe' as const, value })
const pctmax = (value: number) => ({ kind: 'pctmax' as const, value })

function beginnerFullBody(): Week[] {
  const effort = [7, 7.5, 8, 8.5]
  return effort.map((e, i) =>
    week(`Week ${i + 1}`, [
      day('Full body A', 'gym', [
        b('back-squat', 3, { reps: 5, intensity: rpe(e), rest: 180 }),
        b('bench-press', 3, { reps: 5, intensity: rpe(e), rest: 180 }),
        b('barbell-row', 3, { reps: 8, intensity: rpe(e), rest: 120 }),
        b('plank', 3, { duration: 30 + i * 10, rest: 60 }),
      ]),
      day('Full body B', 'gym', [
        b('deadlift', 2, { reps: 5, intensity: rpe(e), rest: 180 }),
        b('overhead-press', 3, { reps: 5, intensity: rpe(e), rest: 150 }),
        b('lat-pulldown', 3, { reps: 10, intensity: rpe(e), rest: 90 }),
        b('walking-lunge', 3, { reps: 10, rest: 90 }),
      ]),
      day('Full body A', 'gym', [
        b('back-squat', 3, { reps: 5, intensity: rpe(e), rest: 180 }),
        b('bench-press', 3, { reps: 5, intensity: rpe(e), rest: 180 }),
        b('dumbbell-row', 3, { reps: 10, intensity: rpe(e), rest: 90 }),
        b('hanging-leg-raise', 3, { reps: 10, rest: 60 }),
      ]),
    ]),
  )
}

/** 5/3/1-style waves on a training max (90% of the 1RM); week 4 deloads. */
function fiveThreeOne(): Week[] {
  const waves: { name: string; sets: [number, number][] }[] = [
    {
      name: 'Week 1 · 5s',
      sets: [
        [65, 5],
        [75, 5],
        [85, 5],
      ],
    },
    {
      name: 'Week 2 · 3s',
      sets: [
        [70, 3],
        [80, 3],
        [90, 3],
      ],
    },
    {
      name: 'Week 3 · 5/3/1',
      sets: [
        [75, 5],
        [85, 3],
        [95, 1],
      ],
    },
    {
      name: 'Week 4 · Deload',
      sets: [
        [40, 5],
        [50, 5],
        [60, 5],
      ],
    },
  ]
  const main = (exerciseId: string, w: (typeof waves)[number]) =>
    w.sets.map(([p, reps], i) =>
      b(exerciseId, 1, {
        reps,
        intensity: pct(Math.round(p * 0.9)),
        rest: 180,
        ...(i === 2 && w.name !== 'Week 4 · Deload' ? { notes: 'Last set: as many reps as possible' } : {}),
      }),
    )
  return waves.map((w) =>
    week(w.name, [
      day('Press', 'gym', [
        ...main('overhead-press', w),
        b('overhead-press', 5, { reps: 10, intensity: pct(45), rest: 90 }),
        b('pull-up', 5, { reps: 8, rest: 90 }),
      ]),
      day('Deadlift', 'gym', [
        ...main('deadlift', w),
        b('deadlift', 5, { reps: 10, intensity: pct(45), rest: 90 }),
        b('hanging-leg-raise', 4, { reps: 12, rest: 60 }),
      ]),
      day('Bench', 'gym', [
        ...main('bench-press', w),
        b('bench-press', 5, { reps: 10, intensity: pct(45), rest: 90 }),
        b('dumbbell-row', 5, { reps: 10, rest: 90 }),
      ]),
      day('Squat', 'gym', [
        ...main('back-squat', w),
        b('back-squat', 5, { reps: 10, intensity: pct(45), rest: 90 }),
        b('leg-curl', 4, { reps: 12, rest: 60 }),
      ]),
    ]),
  )
}

function sprinter100(): Week[] {
  // Volume rises for three weeks, then drops for a test week.
  const v = [1, 1.25, 1.5, 0.75]
  return v.map((k, i) => {
    const n = (base: number) => Math.max(1, Math.round(base * k))
    const test = i === 3
    return week(test ? `Week ${i + 1} · Test` : `Week ${i + 1}`, [
      day('Acceleration', 'track', [
        b('a-skip', 4, { distance: 20, rest: 60 }),
        b('block-start', n(4), { intensity: pctmax(100), rest: 120 }),
        b('sprint-30', n(4), { intensity: pctmax(95), rest: 180 }),
        b('box-jump', 4, { reps: 3, rest: 90 }),
      ]),
      day('Strength', 'gym', [
        b('back-squat', 4, { reps: 4, intensity: pct(80), rest: 180 }),
        b('hip-thrust', 3, { reps: 6, intensity: pct(75), rest: 120 }),
        b('nordic-curl', 3, { reps: 5, rest: 120 }),
        b('calf-raise', 3, { reps: 12, rest: 60 }),
      ]),
      day('Max velocity', 'track', [
        b('a-skip', 4, { distance: 20, rest: 60 }),
        b('flying-30', n(3), { intensity: pctmax(98), rest: 240 }),
        b('sprint-60', n(2), { intensity: pctmax(95), rest: 300 }),
        b('bounding', 3, { distance: 30, rest: 120 }),
      ]),
      test
        ? day('Time trial', 'track', [
            b('sprint-60', 2, { intensity: pctmax(90), rest: 300, notes: 'Build-ups' }),
            b('sprint-100', 1, { intensity: pctmax(100), notes: 'Timed 100 m from blocks' }),
          ])
        : day('Speed endurance', 'track', [
            b('sprint-200', n(2), { intensity: pctmax(90), rest: 480 }),
            b('sprint-100', n(2), { intensity: pctmax(92), rest: 360 }),
          ]),
    ])
  })
}

function swim1500(): Week[] {
  const reps = [8, 10, 12, 6]
  return reps.map((r, i) => {
    const test = i === 3
    return week(test ? `Week ${i + 1} · Test` : `Week ${i + 1}`, [
      day('Aerobic base', 'swim', [
        b('swim-free', 1, { distance: 400, notes: 'Warm-up, easy' }),
        b('drill-catch-up', 4, { distance: 50, rest: 20 }),
        b('swim-free', r, { distance: 100, interval: 110, intensity: rpe(6) }),
        b('swim-kick', 4, { distance: 50, rest: 20 }),
        b('swim-back', 1, { distance: 200, notes: 'Cool-down' }),
      ]),
      day('Threshold', 'swim', [
        b('swim-free', 1, { distance: 300, notes: 'Warm-up' }),
        b('drill-single-arm', 4, { distance: 50, rest: 20 }),
        b('swim-free', Math.max(4, r - 2), { distance: 200, interval: 210, intensity: rpe(7.5) }),
        b('swim-pull', 4, { distance: 100, rest: 20 }),
        b('swim-free', 1, { distance: 200, notes: 'Cool-down' }),
      ]),
      test
        ? day('1500 m time trial', 'swim', [
            b('swim-free', 1, { distance: 400, notes: 'Warm-up' }),
            b('swim-free', 1, { distance: 1500, intensity: rpe(9), notes: 'Timed, even splits' }),
            b('swim-free', 1, { distance: 200, notes: 'Cool-down' }),
          ])
        : day('Long swim', 'swim', [
            b('swim-free', 1, { distance: 300, notes: 'Warm-up' }),
            b('swim-free', 1, { distance: 800 + i * 200, intensity: rpe(6.5), notes: 'Continuous, steady' }),
            b('swim-im', 4, { distance: 50, rest: 30 }),
          ]),
    ])
  })
}

function pushPullLegs(): Week[] {
  return [
    week('Sessions', [
      day('Push', 'gym', [
        b('bench-press', 4, { reps: 6, intensity: rpe(7.5), rest: 150 }),
        b('overhead-press', 3, { reps: 8, intensity: rpe(7.5), rest: 120 }),
        b('dip', 3, { reps: 10, rest: 90 }),
        b('lateral-raise', 3, { reps: 12, rest: 60 }),
        b('triceps-extension', 3, { reps: 12, rest: 60 }),
      ]),
      day('Pull', 'gym', [
        b('barbell-row', 4, { reps: 6, intensity: rpe(7.5), rest: 150 }),
        b('pull-up', 3, { reps: 8, rest: 120 }),
        b('lat-pulldown', 3, { reps: 10, intensity: rpe(7.5), rest: 90 }),
        b('face-pull', 3, { reps: 15, rest: 60 }),
        b('biceps-curl', 3, { reps: 12, rest: 60 }),
      ]),
      day('Legs', 'gym', [
        b('back-squat', 4, { reps: 6, intensity: rpe(7.5), rest: 180 }),
        b('romanian-deadlift', 3, { reps: 8, intensity: rpe(7.5), rest: 150 }),
        b('bulgarian-split-squat', 3, { reps: 10, rest: 90 }),
        b('calf-raise', 3, { reps: 15, rest: 60 }),
        b('plank', 3, { duration: 45, rest: 60 }),
      ]),
    ]),
  ]
}

export const TEMPLATES: readonly Template[] = [
  {
    id: 'beginner-full-body',
    name: 'Beginner full body',
    summary: '3 days a week, 4 weeks. Squat, hinge, press and pull every session, effort rising week to week.',
    level: 'beginner',
    sport: 'gym',
    goal: 'Learn the main lifts and build general strength.',
    build: beginnerFullBody,
  },
  {
    id: 'five-three-one',
    name: '5/3/1-style strength',
    summary: '4 days a week, one 4-week wave on a 90% training max, with 5×10 supplemental work.',
    level: 'intermediate',
    sport: 'gym',
    goal: 'Raise the one-rep max on squat, bench, deadlift and press.',
    build: fiveThreeOne,
  },
  {
    id: 'push-pull-legs',
    name: 'Push, pull, legs',
    summary: 'Three sessions with no weeks: done in any order, as often as you train.',
    level: 'intermediate',
    sport: 'gym',
    goal: 'Train every muscle group across three sessions.',
    layout: 'sessions',
    build: pushPullLegs,
  },
  {
    id: 'sprinter-100',
    name: '100 m sprinter block',
    summary: '4 days a week, 4 weeks: acceleration, max velocity, speed endurance and gym, ending with a 100 m test.',
    level: 'intermediate',
    sport: 'track',
    goal: 'Run a faster 100 m.',
    build: sprinter100,
  },
  {
    id: 'swim-1500',
    name: '1500 m swim build',
    summary: '3 pool days a week, 4 weeks of rising aerobic and threshold volume, ending with a 1500 m time trial.',
    level: 'beginner',
    sport: 'swim',
    goal: 'Swim 1500 m continuously, then faster.',
    build: swim1500,
  },
]

/** The demo copy of a template. Days of a sport not loaded join the template's own sport. */
export function instantiate(template: Template, sports: ReadonlySet<DemoSport>, now: Date = new Date()): Program {
  const at = now.toISOString()
  const own = DEMO_DISCIPLINES[template.sport].id
  const loaded = new Set([...sports].map((s) => DEMO_DISCIPLINES[s].id))
  const weeks = template.build().map((w) => ({
    ...w,
    days: w.days.map((d) => (d.disciplineId && !loaded.has(d.disciplineId) ? { ...d, disciplineId: own } : d)),
  }))
  return {
    id: `demo-program-${template.id}`,
    name: template.name,
    goal: template.goal,
    ...(template.layout ? { layout: template.layout } : {}),
    weeks,
    source: 'template',
    templateId: template.id,
    createdAt: at,
    updatedAt: at,
  }
}
