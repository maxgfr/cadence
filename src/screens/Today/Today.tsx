import { ClipboardList, ListChecks, Play, Plus, Sparkles, Target } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'wouter'
import { useStartSession } from '../../app/actions.ts'
import { useAi } from '../../app/ai.tsx'
import { useData } from '../../app/data.tsx'
import { formatDay } from '../../core/model/dates.ts'
import { completedDays, describeBlock, isSessionSet, nextDay, totalDays } from '../../core/model/program.ts'
import { goalProgress } from '../../core/stats/trends.ts'
import { Button, buttonClass } from '../../ui/components/Button.tsx'
import { DisciplineDot, DisciplineTag } from '../../ui/components/Discipline.tsx'
import { EmptyState } from '../../ui/components/EmptyState.tsx'
import { Screen } from '../../ui/shell/Screen.tsx'
import { useUnits } from '../../ui/units.ts'
import { GoalLine } from '../Progress/Goals.tsx'
import { SessionChooser, useChoosableSessions } from './SessionChooser.tsx'
import styles from './Today.module.css'
import { WeekStrip } from './WeekStrip.tsx'

export function Today() {
  const data = useData()
  const ai = useAi()
  const units = useUnits()
  const start = useStartSession()
  const detail = data.settings.mode === 'advanced'
  const active = data.sessions.find((s) => s.status === 'active')
  const program = data.programs.find((p) => p.id === data.settings.activeProgramId)
  const next = program ? nextDay(program, data.sessions) : undefined
  const day = program && next ? program.weeks[next.week]?.days[next.day] : undefined
  const set = program ? isSessionSet(program) : false
  const choices = useChoosableSessions()
  const [choosing, setChoosing] = useState(false)
  const goal = data.goals
    .filter((g) => !g.achievedAt && g.deadline >= data.today)
    .sort((a, b) => a.deadline.localeCompare(b.deadline))[0]

  return (
    <Screen title="Today" subtitle={formatDay(data.today)}>
      {active ? (
        <section className={styles.hero} aria-labelledby="active-title">
          <h2 id="active-title" className={styles.heroTitle}>
            {active.title}
          </h2>
          <p className={styles.meta}>
            <span className={styles.live} aria-hidden="true" />
            In progress · {active.entries.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0)} of{' '}
            {active.entries.reduce((n, e) => n + e.sets.length, 0)} sets done
          </p>
          <Link href={`/log/${active.id}`} className={buttonClass({ variant: 'primary', size: 'large', full: true })}>
            <Play size={20} strokeWidth={2} aria-hidden="true" />
            Resume session
          </Link>
        </section>
      ) : program && next && day ? (
        <section className={styles.hero} aria-labelledby="next-title">
          <p className={styles.meta}>
            <span>{program.name}</span>
            <span aria-hidden="true">·</span>
            <span>
              {set
                ? `session ${next.day + 1} of ${program.weeks[0]?.days.length ?? 0}, in any order`
                : `${program.weeks[next.week]?.name ?? `Week ${next.week + 1}`} · day ${next.day + 1} of ${program.weeks[next.week]?.days.length ?? 0}`}
            </span>
          </p>
          <h2 id="next-title" className={styles.heroTitle}>
            {day.name}
          </h2>
          {day.disciplineId && <DisciplineTag disciplineId={day.disciplineId} />}
          <ol className={styles.blocks}>
            {day.blocks.map((b) => {
              const ex = data.index.get(b.exerciseId)
              return (
                <li key={b.id} className={styles.block}>
                  <span className={styles.blockName}>{ex?.name ?? 'Unknown exercise'}</span>
                  <span className={styles.blockPlan}>{describeBlock(b, ex, units, detail)}</span>
                </li>
              )
            })}
          </ol>
          {day.notes && <p className={styles.notes}>{day.notes}</p>}
          <Button
            variant="primary"
            size="large"
            full
            icon={<Play size={20} strokeWidth={2} aria-hidden="true" />}
            onClick={() => start.fromDay(program, next)}
          >
            Start session
          </Button>
          <Button variant="plain" full onClick={() => setChoosing(true)}>
            Choose another session
          </Button>
          <p className={styles.progressLine}>
            {set
              ? `${completedDays(program, data.sessions)} ${completedDays(program, data.sessions) === 1 ? 'session' : 'sessions'} done`
              : `${completedDays(program, data.sessions)} of ${totalDays(program)} sessions done`}{' '}
            · <Link href={`/programs/${program.id}`}>See program</Link>
          </p>
        </section>
      ) : program ? (
        <EmptyState
          icon={ClipboardList}
          title={`${program.name} is complete`}
          body="Every session of the program is logged. Pick the next one, or log sessions freely for a while."
          action={
            <Link href="/programs" className={buttonClass({ variant: 'primary' })}>
              Choose a program
            </Link>
          }
        />
      ) : data.exercises.length === 0 ? (
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
      ) : (
        <EmptyState
          icon={ClipboardList}
          title="No program yet"
          body="Write a program and Today will show your next session, pre-filled. Or just log a session as you go."
          action={
            <div className={styles.actions}>
              <Link href="/programs" className={buttonClass({ variant: 'primary' })}>
                {data.programs.length > 0 ? 'Choose a program' : 'Write a program'}
              </Link>
              {ai.ready && (
                <Link href="/programs/generate" className={buttonClass({ variant: 'secondary' })}>
                  <Sparkles size={18} strokeWidth={1.75} aria-hidden="true" />
                  Design one with AI
                </Link>
              )}
            </div>
          }
        />
      )}

      {!active && (
        <section className={styles.free} aria-labelledby="free-title">
          <h2 id="free-title" className={styles.sectionTitle}>
            {program && next ? 'Or log something else' : 'Log a session'}
          </h2>
          <div className={styles.freeButtons}>
            {!(program && next) && choices.length > 0 && (
              <button type="button" className={styles.freeButton} onClick={() => setChoosing(true)}>
                <ListChecks size={18} strokeWidth={1.75} aria-hidden="true" />
                <span className={styles.freeName}>From a program</span>
                <Plus className={styles.freePlus} size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            )}
            {data.disciplines.map((d) => (
              <button key={d.id} type="button" className={styles.freeButton} onClick={() => start.free(d.id)}>
                <DisciplineDot disciplineId={d.id} />
                <span className={styles.freeName}>{d.name}</span>
                <Plus className={styles.freePlus} size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            ))}
            <button type="button" className={styles.freeButton} onClick={() => start.free(undefined)}>
              <span className={styles.freeName}>{data.disciplines.length > 0 ? 'Other' : 'Start a session'}</span>
              <Plus className={styles.freePlus} size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        </section>
      )}

      <SessionChooser open={choosing} onClose={() => setChoosing(false)} />

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
