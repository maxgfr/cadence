import { ClipboardList, NotebookPen, Play, Plus, Target } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'wouter'
import { useStartSession } from '../../app/actions.ts'
import { useAi } from '../../app/ai.tsx'
import { useCoach, useCoachScreen } from '../../app/coach.tsx'
import { useData } from '../../app/data.tsx'
import { useT } from '../../app/i18n.tsx'
import { formatDay, startOfWeek } from '../../core/model/dates.ts'
import { currentRef, dayToStart, programsUnderWay } from '../../core/model/program.ts'
import type { Program, ProgramRef } from '../../core/model/schemas.ts'
import { goalProgress } from '../../core/stats/trends.ts'
import { Button, buttonClass } from '../../ui/components/Button.tsx'
import { DisciplineDot } from '../../ui/components/Discipline.tsx'
import { EmptyState } from '../../ui/components/EmptyState.tsx'
import { ListGroup, ListRow } from '../../ui/components/List.tsx'
import { Sheet } from '../../ui/components/Sheet.tsx'
import { Screen } from '../../ui/shell/Screen.tsx'
import { GoalLine } from '../Progress/Goals.tsx'
import { SessionList, sameRef, useChoosableSessions } from './SessionChooser.tsx'
import styles from './Today.module.css'
import { WeekStrip } from './WeekStrip.tsx'
import { WeekTodoCard } from './WeekTodo.tsx'

export function Today() {
  const data = useData()
  const t = useT()
  const ai = useAi()
  const coach = useCoach()
  useCoachScreen({ where: 'Today: their week, and the sessions they can start' })
  const start = useStartSession()
  const active = data.sessions.find((s) => s.status === 'active')
  // Where the day in progress is now: the program may have been edited on another device since it started.
  const activeRef = currentRef(data.programs, active?.programRef)
  const latestNote = data.notes.reduce<(typeof data.notes)[number] | undefined>(
    (latest, n) => (!latest || (n.updatedAt ?? n.createdAt) > (latest.updatedAt ?? latest.createdAt) ? n : latest),
    undefined,
  )
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
  const goals = data.goals
    .filter((g) => !g.achievedAt && g.deadline >= data.today)
    .sort((a, b) => a.deadline.localeCompare(b.deadline))
    .slice(0, 3)
  // What each program under way asks of this week (Monday to Sunday by default).
  const todos = programsUnderWay(data.programs, data.sessions, startOfWeek(data.today, data.settings.weekStart))
  const pick = (program: Program, picked: ProgramRef) => {
    const ref = dayToStart(
      todos.find((todo) => todo.program.id === program.id),
      picked,
    )
    if (active && sameRef(activeRef, ref)) navigate(`/log/${active.id}`)
    else switchTo(program.weeks[ref.week]?.days[ref.day]?.name ?? program.name, () => start.fromDay(program, ref))
  }

  return (
    <Screen title={t.today.title} subtitle={formatDay(data.today)}>
      {active && (
        <section className={styles.hero} aria-labelledby="active-title">
          <h2 id="active-title" className={styles.heroTitle}>
            {active.title}
          </h2>
          <p className={styles.meta}>
            <span className={styles.live} aria-hidden="true" />
            {t.today.heroMeta(
              doneSets,
              active.entries.reduce((n, e) => n + e.sets.length, 0),
            )}
          </p>
          <Link href={`/log/${active.id}`} className={buttonClass({ variant: 'primary', size: 'large', full: true })}>
            <Play size={20} strokeWidth={2} aria-hidden="true" />
            {t.today.resume}
          </Link>
        </section>
      )}

      {data.exercises.length === 0 && !active && (
        <EmptyState
          icon={ClipboardList}
          title={t.today.emptyTitle}
          body={t.today.emptyBody}
          action={
            <div className={styles.actions}>
              <Link href="/settings/demo" className={buttonClass({ variant: 'primary' })}>
                {t.today.loadDemo}
              </Link>
              {ai.ready ? (
                <Button variant="secondary" onClick={() => coach.show({ text: t.coach.starters.setUp })}>
                  {t.coach.setUpWithCoach}
                </Button>
              ) : (
                <Link href="/settings/ai" className={buttonClass({ variant: 'secondary' })}>
                  {t.coach.setUpWithCoach}
                </Link>
              )}
              <Link href="/exercises" className={buttonClass({ variant: 'secondary' })}>
                {t.today.createExercises}
              </Link>
            </div>
          }
        />
      )}

      {data.exercises.length > 0 && (
        <WeekStrip>
          {todos.length > 0 ? (
            todos.map((todo) => (
              <WeekTodoCard
                key={todo.program.id}
                todo={todo}
                activeRef={activeRef}
                onStart={(ref) => pick(todo.program, ref)}
              />
            ))
          ) : (
            <p className={styles.nudge}>
              <ClipboardList size={16} strokeWidth={1.75} aria-hidden="true" />
              {t.today.weekNudge}
            </p>
          )}
        </WeekStrip>
      )}

      <section className={styles.sessions} aria-labelledby="new-title">
        <h2 id="new-title" className={styles.sectionTitle}>
          {t.today.newSession}
        </h2>
        {choices.length > 0 ? (
          <SessionList activeRef={activeRef} onPick={pick} />
        ) : (
          data.exercises.length > 0 && (
            <p className={styles.nudge}>
              <ClipboardList size={16} strokeWidth={1.75} aria-hidden="true" />
              <span>
                {t.today.programsNudge} <Link href="/programs">{t.today.writeOne}</Link>.
              </span>
            </p>
          )
        )}
        <h3 className={styles.subTitle}>{t.today.freeSession}</h3>
        <div className={styles.freeButtons}>
          {data.disciplines.map((d) => (
            <button
              key={d.id}
              type="button"
              className={styles.freeButton}
              onClick={() => switchTo(t.today.disciplineSession(d.name), () => start.free(d.id))}
            >
              <DisciplineDot disciplineId={d.id} />
              <span className={styles.freeName}>{d.name}</span>
              <Plus className={styles.freePlus} size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          ))}
          <button
            type="button"
            className={styles.freeButton}
            onClick={() => switchTo(t.today.aFreeSession, () => start.free(undefined))}
          >
            <span className={styles.freeName}>
              {data.disciplines.length > 0 ? t.today.other : t.today.startSession}
            </span>
            <Plus className={styles.freePlus} size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </section>

      <Sheet open={pending !== null} title={t.today.switchTitle} onClose={() => setPending(null)}>
        {active && pending && (
          <div className={styles.switch}>
            <p>{t.today.switchBody(active.title, doneSets, pending.title)}</p>
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
              {t.today.saveAndSwitch}
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
              {t.today.discardAndSwitch}
            </Button>
            <Button variant="plain" full onClick={() => setPending(null)}>
              {t.today.keepGoing(active.title)}
            </Button>
          </div>
        )}
      </Sheet>

      <section aria-labelledby="goal-title" className={styles.goal}>
        <h2 id="goal-title" className={styles.sectionTitle}>
          {t.today.nextGoals}
        </h2>
        {goals.length > 0 ? (
          goals.map((g) => (
            <GoalLine
              key={g.id}
              goal={g}
              progress={goalProgress(g, data.sessions, data.index, data.today, data.settings.weekStart)}
            />
          ))
        ) : (
          <p className={styles.nudge}>
            <Target size={16} strokeWidth={1.75} aria-hidden="true" />
            {t.today.noGoal} · <Link href="/progress?goal=new">{t.today.setGoal}</Link>
          </p>
        )}
      </section>

      <ListGroup>
        <ListRow
          leading={<NotebookPen size={20} strokeWidth={1.75} />}
          title={t.notes.title}
          subtitle={latestNote ? latestNote.text.slice(0, 80) : t.notes.todayHint}
          href="/notes"
          chevron
        />
      </ListGroup>
    </Screen>
  )
}
