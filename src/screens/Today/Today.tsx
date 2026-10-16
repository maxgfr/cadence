import { ClipboardList, Play, Plus, Sparkles, Target } from 'lucide-react'
import { Link } from 'wouter'
import { useStartSession } from '../../app/actions.ts'
import { useAi } from '../../app/ai.tsx'
import { useData } from '../../app/data.tsx'
import { formatDay } from '../../core/model/dates.ts'
import { completedDays, describeBlock, nextDay, totalDays } from '../../core/model/program.ts'
import type { Discipline } from '../../core/model/schemas.ts'
import { goalProgress } from '../../core/stats/trends.ts'
import { Button, buttonClass } from '../../ui/components/Button.tsx'
import { DISCIPLINE_LABEL, DisciplineDot, DisciplineTag } from '../../ui/components/Discipline.tsx'
import { EmptyState } from '../../ui/components/EmptyState.tsx'
import { Screen } from '../../ui/shell/Screen.tsx'
import { useUnits } from '../../ui/units.ts'
import { GoalLine } from '../Progress/Goals.tsx'
import styles from './Today.module.css'
import { WeekStrip } from './WeekStrip.tsx'

const FREE: readonly Discipline[] = ['strength', 'swim', 'run']

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
              {program.weeks[next.week]?.name ?? `Week ${next.week + 1}`} · day {next.day + 1} of{' '}
              {program.weeks[next.week]?.days.length}
            </span>
          </p>
          <h2 id="next-title" className={styles.heroTitle}>
            {day.name}
          </h2>
          {day.discipline && <DisciplineTag discipline={day.discipline} />}
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
          <p className={styles.progressLine}>
            {completedDays(program, data.sessions)} of {totalDays(program)} sessions done ·{' '}
            <Link href={`/programs/${program.id}`}>See program</Link>
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
      ) : (
        <EmptyState
          icon={ClipboardList}
          title="No program yet"
          body="Pick a ready-made program and Today will show your next session, pre-filled. Or just log a session as you go."
          action={
            <div className={styles.actions}>
              <Link href="/programs/templates" className={buttonClass({ variant: 'primary' })}>
                Choose a program
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
            {FREE.map((d) => (
              <button key={d} type="button" className={styles.freeButton} onClick={() => start.free(d)}>
                <DisciplineDot discipline={d} />
                <span>{DISCIPLINE_LABEL[d]}</span>
                <Plus className={styles.freePlus} size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      )}

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
