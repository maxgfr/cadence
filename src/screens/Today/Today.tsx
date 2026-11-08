import { ClipboardList, NotebookPen, Play, Plus, Target } from 'lucide-react'
import { Link, useLocation } from 'wouter'
import { useStartSession } from '../../app/actions.ts'
import { useAi } from '../../app/ai.tsx'
import { useCoach, useCoachScreen } from '../../app/coach.tsx'
import { useData } from '../../app/data.tsx'
import { useT } from '../../app/i18n.tsx'
import { useToast } from '../../app/toast.tsx'
import { formatDay, startOfWeek } from '../../core/model/dates.ts'
import { activeSessions, currentRef, dayToStart, programsUnderWay } from '../../core/model/program.ts'
import type { Program, ProgramRef, Session } from '../../core/model/schemas.ts'
import { goalProgress } from '../../core/stats/trends.ts'
import { Button, buttonClass } from '../../ui/components/Button.tsx'
import { DisciplineDot } from '../../ui/components/Discipline.tsx'
import { EmptyState } from '../../ui/components/EmptyState.tsx'
import { ListGroup, ListRow } from '../../ui/components/List.tsx'
import { Screen } from '../../ui/shell/Screen.tsx'
import { GoalLine } from '../Progress/Goals.tsx'
import { SessionList, sameRef, useChoosableSessions } from './SessionChooser.tsx'
import styles from './Today.module.css'
import { WeekStrip } from './WeekStrip.tsx'
import { WeekTodoCard } from './WeekTodo.tsx'

/** A session in progress: back to it, or discard it, which can be undone. */
function ActiveSession({ session }: { session: Session }) {
  const data = useData()
  const t = useT()
  const toast = useToast()
  const sets = session.entries.flatMap((e) => e.sets)
  const titleId = `active-${session.id}`
  return (
    <section className={styles.hero} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.heroTitle}>
        {session.title}
      </h2>
      <p className={styles.meta}>
        <span className={styles.live} aria-hidden="true" />
        {t.today.heroMeta(sets.filter((s) => s.done).length, sets.length)}
      </p>
      <Link href={`/log/${session.id}`} className={buttonClass({ variant: 'primary', size: 'large', full: true })}>
        <Play size={20} strokeWidth={2} aria-hidden="true" />
        {t.today.resume}
      </Link>
      <Button
        variant="plain"
        full
        aria-label={t.today.discardNamed(session.title)}
        onClick={async () => {
          await data.remove('sessions', session.id)
          toast(t.log.discarded, [{ label: t.log.undo, onClick: () => data.put('sessions', session) }])
        }}
      >
        {t.log.discardSession}
      </Button>
    </section>
  )
}

export function Today() {
  const data = useData()
  const t = useT()
  const ai = useAi()
  const coach = useCoach()
  useCoachScreen({ where: 'Today: their week, and the sessions they can start' })
  const start = useStartSession()
  const actives = activeSessions(data.sessions)
  // Where each day in progress is now: the program may have been edited on another device since it started.
  const runningAt = (ref: ProgramRef) => actives.find((s) => sameRef(currentRef(data.programs, s.programRef), ref))
  const isRunning = (ref: ProgramRef) => runningAt(ref) !== undefined
  const latestNote = data.notes.reduce<(typeof data.notes)[number] | undefined>(
    (latest, n) => (!latest || (n.updatedAt ?? n.createdAt) > (latest.updatedAt ?? latest.createdAt) ? n : latest),
    undefined,
  )
  const choices = useChoosableSessions()
  const [, navigate] = useLocation()
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
    const running = runningAt(ref)
    if (running) navigate(`/log/${running.id}`)
    else start.fromDay(program, ref)
  }
  /** A free session of this sport still empty is opened again rather than left behind. */
  const startFree = (disciplineId: string | undefined) => {
    const idle = actives.find((s) => !s.programRef && s.entries.length === 0 && s.disciplineId === disciplineId)
    if (idle) navigate(`/log/${idle.id}`)
    else start.free(disciplineId)
  }

  return (
    <Screen title={t.today.title} subtitle={formatDay(data.today)}>
      {actives.map((session) => (
        <ActiveSession key={session.id} session={session} />
      ))}

      {data.exercises.length === 0 && actives.length === 0 && (
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
                isRunning={isRunning}
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
          <SessionList isRunning={isRunning} onPick={pick} />
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
            <button key={d.id} type="button" className={styles.freeButton} onClick={() => startFree(d.id)}>
              <DisciplineDot disciplineId={d.id} />
              <span className={styles.freeName}>{d.name}</span>
              <Plus className={styles.freePlus} size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          ))}
          <button type="button" className={styles.freeButton} onClick={() => startFree(undefined)}>
            <span className={styles.freeName}>
              {data.disciplines.length > 0 ? t.today.other : t.today.startSession}
            </span>
            <Plus className={styles.freePlus} size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </section>

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
