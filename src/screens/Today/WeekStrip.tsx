import { Link } from 'wouter'
import { useData } from '../../app/data.tsx'
import { addDays, fromIsoDate, startOfWeek } from '../../core/model/dates.ts'
import { weekStreak } from '../../core/stats/trends.ts'
import { DisciplineDot } from '../../ui/components/Discipline.tsx'
import { cx } from '../../ui/cx.ts'
import styles from './Today.module.css'

const LETTERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** This week as a training diary line: one column per day, a dot per session logged. */
export function WeekStrip() {
  const { sessions, today, settings } = useData()
  const first = startOfWeek(today, settings.weekStart)
  const days = Array.from({ length: 7 }, (_, i) => addDays(first, i))
  const done = sessions.filter((s) => s.status === 'done')
  const count = done.filter((s) => s.date >= first && s.date <= addDays(first, 6)).length
  const streak = weekStreak(sessions, today, settings.weekStart)
  return (
    <section aria-labelledby="week-title" className={styles.week}>
      <div className={styles.weekHead}>
        <h2 id="week-title" className={styles.sectionTitle}>
          This week
        </h2>
        <p className={styles.weekSummary}>
          {count} {count === 1 ? 'session' : 'sessions'}
          {streak > 1 && ` · ${streak} weeks in a row`}
        </p>
      </div>
      <ol className={styles.strip}>
        {days.map((d) => {
          const day = done.filter((s) => s.date === d)
          const label = `${LETTERS[fromIsoDate(d).getDay()]} ${fromIsoDate(d).getDate()}`
          const body = (
            <>
              <span className={styles.dayName}>{LETTERS[fromIsoDate(d).getDay()]?.slice(0, 1)}</span>
              <span className={styles.dayNumber}>{fromIsoDate(d).getDate()}</span>
              <span className={styles.dayDots}>
                {day.slice(0, 3).map((s) => (
                  <DisciplineDot key={s.id} disciplineId={s.disciplineId} />
                ))}
              </span>
            </>
          )
          const cls = cx(styles.day, d === today && styles.today, d > today && styles.future)
          const sr = `${label}: ${day.length === 0 ? 'no session' : day.map((s) => s.title).join(', ')}`
          return (
            <li key={d}>
              {day.length === 1 && day[0] ? (
                <Link href={`/history/${day[0].id}`} className={cls} aria-label={sr}>
                  {body}
                </Link>
              ) : (
                <span className={cls} role="img" aria-label={sr}>
                  {body}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
