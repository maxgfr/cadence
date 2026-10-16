import { describe, expect, test } from 'bun:test'
import { Program } from '../model/schemas.ts'
import { DEMO_DISCIPLINES } from './catalog.ts'
import { buildDemo, demoRemoval } from './demo.ts'

const today = '2026-10-16'
const now = new Date('2026-10-16T08:00:00Z')

describe('demo', () => {
  test('one sport brings its discipline, exercises and programs, nothing else', () => {
    const d = buildDemo({ sports: ['swim'], withSessions: false, today, now })
    expect(d.disciplines).toEqual([DEMO_DISCIPLINES.swim])
    expect(d.programs.map((p) => p.name)).toEqual(['1500 m swim build'])
    expect(d.exercises.every((e) => e.disciplineId === 'demo-swim')).toBe(true)
    expect(d.sessions).toEqual([])
    expect(d.goals).toEqual([])
  })

  test("a program's exercises from a sport not chosen come along, in the program's discipline", () => {
    const d = buildDemo({ sports: ['track'], withSessions: false, today, now })
    const squat = d.exercises.find((e) => e.id === 'back-squat')
    expect(squat?.disciplineId).toBe('demo-track')
    const sprint = d.programs[0]
    for (const w of sprint?.weeks ?? []) for (const day of w.days) expect(day.disciplineId).toBe('demo-track')
    const ids = new Set(d.exercises.map((e) => e.id))
    for (const w of sprint?.weeks ?? [])
      for (const day of w.days) for (const b of day.blocks) expect(ids.has(b.exerciseId)).toBe(true)
  })

  test('all three sports: every program is valid and keeps its own disciplines; sessions and goals on request', () => {
    const d = buildDemo({ sports: ['gym', 'swim', 'track'], withSessions: true, today, now })
    expect(d.disciplines).toHaveLength(3)
    expect(d.programs).toHaveLength(4)
    for (const p of d.programs) expect(Program.safeParse(p).success).toBe(true)
    const strengthDay = d.programs.find((p) => p.templateId === 'sprinter-100')?.weeks[0]?.days[1]
    expect(strengthDay?.disciplineId).toBe('demo-gym')
    expect(d.sessions.length).toBe(25)
    expect(d.sessions.every((s) => s.date < today && s.status === 'done')).toBe(true)
    expect(d.goals.map((g) => g.id)).toEqual(['demo-goal-gym', 'demo-goal-swim', 'demo-goal-track'])
    // Same input, same demo.
    expect(buildDemo({ sports: ['gym', 'swim', 'track'], withSessions: true, today, now }).sessions).toEqual(d.sessions)
  })

  test('removal takes the demo away but keeps what the user built on it', () => {
    const d = buildDemo({ sports: ['gym', 'swim'], withSessions: true, today, now })
    const own = {
      id: 'mine',
      date: today,
      title: 'My swim',
      disciplineId: 'demo-swim',
      entries: [{ id: 'x', exerciseId: 'swim-free', sets: [{ done: true, distance: 100, time: 95 }] }],
      status: 'done' as const,
    }
    const r = demoRemoval({ ...d, sessions: [...d.sessions, own] })
    expect(r.sessions).toHaveLength(d.sessions.length)
    expect(r.programs).toHaveLength(d.programs.length)
    expect(r.goals).toHaveLength(2)
    expect(r.exercises).not.toContain('swim-free')
    expect(r.exercises).toContain('back-squat')
    expect(r.disciplines).toEqual(['demo-gym'])
  })
})
