import { ClipboardList, Play, Plus, Target } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'wouter'
import { useStartSession } from '../../app/actions.ts'
import { useAi } from '../../app/ai.tsx'
import { useData } from '../../app/data.tsx'
import { formatDay } from '../../core/model/dates.ts'
import { goalProgress } from '../../core/stats/trends.ts'
import { Button, buttonClass } from '../../ui/components/Button.tsx'
import { DisciplineDot } from '../../ui/components/Discipline.tsx'
import { EmptyState } from '../../ui/components/EmptyState.tsx'
import { Sheet } from '../../ui/components/Sheet.tsx'
import { Screen } from '../../ui/shell/Screen.tsx'
import { GoalLine } from '../Progress/Goals.tsx'
import { SessionList, useChoosableSessions } from './SessionChooser.tsx'
import styles from './Today.module.css'
import { WeekStrip } from './WeekStrip.tsx'

export function Today() {
  const data = useData()
  const ai = useAi()
  const start = useStartSession()
  const active = data.sessions.find((s) => s.status === 'active')
  const choices = useChoosableSessions()
  const [, navigate] = useLocation()
  // A session to start while another is in progress, waiting for what to do with that one.
  const [pending, setPending] = useState<{ title: string; go: () => Promise<void> } | null>(null)
  const doneSets = active ? active.entries.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0) : 0
  /** Starts a session; one in progress with nothing ticked gives way, otherwise the athlete decides. */
  const switchTo = (title: string, go: () => Promise<void>) => {
    if (!active) return go()
    if (doneSets === 0) return data.remove('sessions', active.id).then(go)
    setPending({ title, go })
    return Promise.resolve()
  }
  const goal = data.goals
    .filter((g) => !g.achievedAt && g.deadline >= data.today)
    .sort((a, b) => a.deadline.localeCompare(b.deadline))[0]

  return (
    <Screen title="Today" subtitle={formatDay(data.today)}>
      {active && (
        <section className={styles.hero} aria-labelledby="active-title">
          <h2 id="active-title" className={styles.heroTitle}>
            {active.title}
          </h2>
          <p className={styles.meta}>
            <span className={styles.live} aria-hidden="true" />
            In progress · {doneSets} of {active.entries.reduce((n, e) => n + e.sets.length, 0)} sets done
          </p>
          <Link href={`/log/${active.id}`} className={buttonClass({ variant: 'primary', size: 'large', full: true })}>
            <Play size={20} strokeWidth={2} aria-hidden="true" />
            Resume session
          </Link>
        </section>
      )}

      {data.exercises.length === 0 && !active && (
        <EmptyState
          icon={ClipboardList}
          title="Start your training log"
          body="Create the disciplines and exercises you train, or start from a demo sport: Gym, Swimming, Track and field, with their programs."
          action={
            <div className={styles.actions}>
              <Link href="/settings/demo" className={buttonClass({ variant: 'primary' })}>
                Load a demo sport
              </Link>
              <Link href="/exercises" className={buttonClass({ variant: 'secondary' })}>
                Create exercises
              </Link>
            </div>
          }
        />
      )}

      <section className={styles.sessions} aria-labelledby="new-title">
        <h2 id="new-title" className={styles.sectionTitle}>
          New session
        </h2>
        {choices.length > 0 ? (
          <SessionList
            activeRef={active?.programRef}
            onPick={(p, ref) => {
              const r = active?.programRef
              if (active && r && r.programId === ref.programId && r.week === ref.week && r.day === ref.day)
                navigate(`/log/${active.id}`)
              else switchTo(p.weeks[ref.week]?.days[ref.day]?.name ?? p.name, () => start.fromDay(p, ref))
            }}
          />
        ) : (
          data.exercises.length > 0 && (
            <p className={styles.nudge}>
              <ClipboardList size={16} strokeWidth={1.75} aria-hidden="true" />
              <span>
                The sessions of your programs appear here, ready to start. <Link href="/programs">Write one</Link>
                {ai.ready && (
                  <>
                    {' '}
                    or <Link href="/programs/generate">design one with AI</Link>
                  </>
                )}
                .
              </span>
            </p>
          )
        )}
        <h3 className={styles.subTitle}>Free session</h3>
        <div className={styles.freeButtons}>
          {data.disciplines.map((d) => (
            <button
              key={d.id}
              type="button"
              className={styles.freeButton}
              onClick={() => switchTo(`${d.name} session`, () => start.free(d.id))}
            >
              <DisciplineDot disciplineId={d.id} />
              <span className={styles.freeName}>{d.name}</span>
              <Plus className={styles.freePlus} size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          ))}
          <button
            type="button"
            className={styles.freeButton}
            onClick={() => switchTo('a free session', () => start.free(undefined))}
          >
            <span className={styles.freeName}>{data.disciplines.length > 0 ? 'Other' : 'Start a session'}</span>
            <Plus className={styles.freePlus} size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </section>

      <Sheet open={pending !== null} title="Switch session?" onClose={() => setPending(null)}>
        {active && pending && (
          <div className={styles.switch}>
            <p>
              {active.title} is in progress with {doneSets} {doneSets === 1 ? 'set' : 'sets'} done. Keep what you did
              before starting {pending.title}?
            </p>
            <Button
              variant="primary"
              size="large"
              full
              onClick={async () => {
                const go = pending.go
                setPending(null)
                await data.put('sessions', { ...active, status: 'done' })
                await go()
              }}
            >
              Save it and switch
            </Button>
            <Button
              variant="danger"
              full
              onClick={async () => {
                const go = pending.go
                setPending(null)
                await data.remove('sessions', active.id)
                await go()
              }}
            >
              Discard it and switch
            </Button>
            <Button variant="plain" full onClick={() => setPending(null)}>
              Keep going with {active.title}
            </Button>
          </div>
        )}
      </Sheet>

      <WeekStrip />

      <section aria-labelledby="goal-title" className={styles.goal}>
        <h2 id="goal-title" className={styles.sectionTitle}>
          Next goal
        </h2>
        {goal ? (
          <GoalLine
            goal={goal}
            progress={goalProgress(goal, data.sessions, data.index, data.today, data.settings.weekStart)}
          />
        ) : (
          <p className={styles.nudge}>
            <Target size={16} strokeWidth={1.75} aria-hidden="true" />
            No goal yet · <Link href="/progress?goal=new">Set a goal</Link>
          </p>
        )}
      </section>
    </Screen>
  )
}
