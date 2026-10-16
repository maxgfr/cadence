import { addDays } from '../model/dates.ts'
import type { Discipline, Exercise, Goal, Program, Session, SetLog } from '../model/schemas.ts'
import { DEMO_DISCIPLINES, DEMO_EXERCISE_IDS, DEMO_EXERCISES, type DemoSport, demoExercise } from './catalog.ts'
import { instantiate, TEMPLATES } from './programs.ts'

export interface DemoData {
  disciplines: Discipline[]
  exercises: Exercise[]
  programs: Program[]
  sessions: Session[]
  goals: Goal[]
}

export interface DemoOptions {
  sports: readonly DemoSport[]
  /** Ten weeks of example sessions and a goal per sport, to see the charts at work. */
  withSessions: boolean
  today: string
  now?: Date
}

/** A small deterministic wobble, so example data looks logged by a person without being random between loads. */
const wobble = (n: number) => Math.sin(n * 12.9898) * 0.5

/**
 * The demo for the chosen sports: their disciplines, exercises and programs, and optionally example sessions and
 * goals. An exercise a chosen program needs from a sport not chosen comes along, in the program's own discipline.
 */
export function buildDemo({ sports, withSessions, today, now = new Date() }: DemoOptions): DemoData {
  const chosen = new Set(sports)
  const disciplines = [...chosen].map((s) => DEMO_DISCIPLINES[s])
  const programs = TEMPLATES.filter((t) => chosen.has(t.sport)).map((t) => instantiate(t, chosen, now))
  const exercises = new Map<string, Exercise>()
  for (const e of DEMO_EXERCISES) {
    if (chosen.has(e.sport)) exercises.set(e.id, demoExercise(e.id, DEMO_DISCIPLINES[e.sport].id) as Exercise)
  }
  for (const p of programs) {
    for (const w of p.weeks)
      for (const d of w.days)
        for (const b of d.blocks)
          if (!exercises.has(b.exerciseId))
            exercises.set(b.exerciseId, demoExercise(b.exerciseId, d.disciplineId) as Exercise)
  }
  const data: DemoData = { disciplines, exercises: [...exercises.values()], programs, sessions: [], goals: [] }
  if (withSessions) addHistory(data, chosen, today, now)
  return data
}

function addHistory(data: DemoData, sports: ReadonlySet<DemoSport>, today: string, now: Date): void {
  const done = (p: Omit<SetLog, 'done'>): SetLog => ({ ...p, done: true })
  const session = (
    id: string,
    date: string,
    title: string,
    sport: DemoSport,
    entries: Session['entries'],
    extra: Partial<Session>,
  ) =>
    data.sessions.push({ id, date, title, disciplineId: DEMO_DISCIPLINES[sport].id, entries, status: 'done', ...extra })
  for (let w = 10; w >= 1; w--) {
    const monday = addDays(today, -7 * w)
    if (sports.has('gym')) {
      const squat = 90 + (10 - w) * 2.5 - (w === 4 ? 5 : 0)
      session(
        `demo-session-gym-${w}`,
        monday,
        'Full body A',
        'gym',
        [
          {
            id: `demo-e-gym-${w}-1`,
            exerciseId: 'back-squat',
            sets: [1, 2, 3].map(() => done({ weight: squat, reps: 5, rpe: 8 })),
          },
          {
            id: `demo-e-gym-${w}-2`,
            exerciseId: 'bench-press',
            sets: [1, 2, 3].map(() => done({ weight: 60 + (10 - w), reps: 5, rpe: 7.5 })),
          },
          {
            id: `demo-e-gym-${w}-3`,
            exerciseId: 'pull-up',
            sets: [1, 2, 3].map((i) => done({ reps: 6 + Math.floor((10 - w) / 3) - (i === 3 ? 1 : 0) })),
          },
        ],
        { duration: 60, rpe: 7 },
      )
    }
    if (sports.has('swim')) {
      session(
        `demo-session-swim-${w}`,
        addDays(monday, 2),
        'Aerobic base',
        'swim',
        [
          {
            id: `demo-e-swim-${w}-1`,
            exerciseId: 'swim-free',
            sets: [done({ distance: 400, time: 440 - (10 - w) * 4 })],
          },
          {
            id: `demo-e-swim-${w}-2`,
            exerciseId: 'swim-free',
            sets: Array.from({ length: 8 }, (_, i) =>
              done({ distance: 100, time: 102 - (10 - w) * 0.8 + wobble(w * 8 + i) * 3 }),
            ),
          },
          {
            id: `demo-e-swim-${w}-3`,
            exerciseId: 'swim-kick',
            sets: Array.from({ length: 4 }, () => done({ distance: 50, time: 62 })),
          },
        ],
        { duration: 50, rpe: 6 },
      )
    }
    if (sports.has('track') && w % 2 === 0) {
      session(
        `demo-session-track-${w}`,
        addDays(monday, 4),
        'Max velocity',
        'track',
        [
          {
            id: `demo-e-track-${w}-1`,
            exerciseId: 'sprint-60',
            sets: [1, 2, 3].map((i) => done({ time: 8.1 - (10 - w) * 0.04 + wobble(w * 3 + i) * 0.1 })),
          },
          {
            id: `demo-e-track-${w}-2`,
            exerciseId: 'sprint-100',
            sets: [done({ time: 13.2 - (10 - w) * 0.07 + wobble(w) * 0.1 })],
          },
        ],
        { duration: 70, rpe: 8 },
      )
    }
  }
  const created = new Date(now.getTime() - 70 * 86_400_000).toISOString()
  const deadline = addDays(today, 60)
  if (sports.has('gym'))
    data.goals.push({
      id: 'demo-goal-gym',
      kind: 'exercise',
      exerciseId: 'back-squat',
      target: 140,
      deadline,
      createdAt: created,
    })
  if (sports.has('swim'))
    data.goals.push({
      id: 'demo-goal-swim',
      kind: 'exercise',
      exerciseId: 'swim-free',
      target: 90,
      deadline,
      createdAt: created,
    })
  if (sports.has('track'))
    data.goals.push({
      id: 'demo-goal-track',
      kind: 'exercise',
      exerciseId: 'sprint-100',
      target: 12.4,
      deadline,
      createdAt: created,
    })
}

/** Whether a record came from the demo. */
export function isDemoId(kind: 'disciplines' | 'exercises' | 'programs' | 'sessions' | 'goals', id: string): boolean {
  return kind === 'exercises' ? DEMO_EXERCISE_IDS.has(id) : id.startsWith('demo-')
}

/**
 * What removing the demo deletes: its programs, sessions and goals, then its exercises and disciplines unless
 * something of the user's still uses them.
 */
export function demoRemoval(data: DemoData): { [K in keyof DemoData]: string[] } {
  const programs = data.programs.filter((p) => isDemoId('programs', p.id)).map((p) => p.id)
  const sessions = data.sessions.filter((s) => isDemoId('sessions', s.id)).map((s) => s.id)
  const goals = data.goals.filter((g) => isDemoId('goals', g.id)).map((g) => g.id)
  const keptPrograms = data.programs.filter((p) => !programs.includes(p.id))
  const keptSessions = data.sessions.filter((s) => !sessions.includes(s.id))
  const keptGoals = data.goals.filter((g) => !goals.includes(g.id))
  const usedExercises = new Set<string>([
    ...keptSessions.flatMap((s) => s.entries.map((e) => e.exerciseId)),
    ...keptPrograms.flatMap((p) => p.weeks.flatMap((w) => w.days.flatMap((d) => d.blocks.map((b) => b.exerciseId)))),
    ...keptGoals.flatMap((g) => (g.exerciseId ? [g.exerciseId] : [])),
  ])
  const exercises = data.exercises
    .filter((e) => isDemoId('exercises', e.id) && !usedExercises.has(e.id))
    .map((e) => e.id)
  const keptExercises = data.exercises.filter((e) => !exercises.includes(e.id))
  const usedDisciplines = new Set<string>(
    [
      ...keptExercises.map((e) => e.disciplineId),
      ...keptSessions.map((s) => s.disciplineId),
      ...keptPrograms.flatMap((p) => p.weeks.flatMap((w) => w.days.map((d) => d.disciplineId))),
      ...keptGoals.map((g) => g.disciplineId),
    ].filter((x): x is string => x !== undefined),
  )
  const disciplines = data.disciplines
    .filter((d) => isDemoId('disciplines', d.id) && !usedDisciplines.has(d.id))
    .map((d) => d.id)
  return { disciplines, exercises, programs, sessions, goals }
}
