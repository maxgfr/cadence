import type { ReactNode } from 'react'
import { Link } from 'wouter'
import { useData } from '../../app/data.tsx'
import { useT } from '../../app/i18n.tsx'
import { addDays, fromIsoDate, startOfWeek, weekdayShort } from '../../core/model/dates.ts'
import { weekStreak } from '../../core/stats/trends.ts'
import { DisciplineDot } from '../../ui/components/Discipline.tsx'
import { cx } from '../../ui/cx.ts'
import styles from './Today.module.css'

/** This week as a training diary line (one column per day, a dot per session logged), then what is left of it. */
export function WeekStrip({ children }: { children?: ReactNode }) {
  const { sessions, today, settings } = useData()
  const t = useT()
  const first = startOfWeek(today, settings.weekStart)
  const days = Array.from({ length: 7 }, (_, i) => addDays(first, i))
  const done = sessions.filter((s) => s.status === 'done')
  const count = done.filter((s) => s.date >= first && s.date <= addDays(first, 6)).length
  const streak = weekStreak(sessions, today, settings.weekStart)
  return (
    <section aria-labelledby="week-title" className={styles.week}>
      <div className={styles.weekHead}>
        <h2 id="week-title" className={styles.sectionTitle}>
          {t.today.thisWeek}
        </h2>
        <p className={styles.weekSummary}>
          {t.today.sessions(count)}
          {streak > 1 && ` · ${t.today.streak(streak)}`}
        </p>
      </div>
      <ol className={styles.strip}>
        {days.map((d) => {
          const day = done.filter((s) => s.date === d)
          const weekday = weekdayShort(fromIsoDate(d).getDay())
          const label = `${weekday} ${fromIsoDate(d).getDate()}`
          const body = (
            <>
              <span className={styles.dayName}>{weekday.slice(0, 1).toUpperCase()}</span>
              <span className={styles.dayNumber}>{fromIsoDate(d).getDate()}</span>
              <span className={styles.dayDots}>
                {day.slice(0, 3).map((s) => (
                  <DisciplineDot key={s.id} disciplineId={s.disciplineId} />
                ))}
              </span>
            </>
          )
          const cls = cx(styles.day, d === today && styles.today, d > today && styles.future)
          const sr = t.today.dayStatus(label, day.length === 0 ? t.today.noSession : day.map((s) => s.title).join(', '))
          return (
            <li key={d}>
              {day.length === 1 && day[0] ? (
                <Link href={`/progress/sessions/${day[0].id}`} className={cls} aria-label={sr}>
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
      {children}
    </section>
  )
}
