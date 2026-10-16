import { formatDay, fromIsoDate, monthLabel } from '../../core/model/dates.ts'
import type { HeatDay } from '../../core/stats/trends.ts'
import styles from './Chart.module.css'
import { useWidth } from './scale.ts'

const ROWS = 7
const GAP = 3

/** Training days as a calendar: one column per week, one cell per day, darker for longer days. */
export function Heatmap({ days, weekStart }: { days: readonly HeatDay[]; weekStart: 0 | 1 }) {
  const [ref, available] = useWidth<HTMLDivElement>()
  const weeks = Math.ceil(days.length / ROWS)
  const left = 28
  // Cells grow with the room (a phone gets the 12px floor, a desk up to 24px).
  const cell = Math.max(12, Math.min(24, Math.floor((available - left) / weeks - GAP)))
  const topPad = 16
  const width = left + weeks * (cell + GAP)
  const height = topPad + ROWS * (cell + GAP)
  const dayNames = weekStart === 1 ? ['Mon', '', 'Wed', '', 'Fri', '', ''] : ['', 'Mon', '', 'Wed', '', 'Fri', '']
  let lastMonth = ''
  const trained = days.filter((d) => d.sessions > 0).length
  return (
    <div ref={ref} className={styles.heatWrap}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={styles.heat}
        role="img"
        aria-label={`${trained} training days in the last ${weeks} weeks`}
      >
        {dayNames.map((n, r) =>
          n ? (
            <text key={n} x={0} y={topPad + r * (cell + GAP) + cell - 3} className={styles.tick}>
              {n}
            </text>
          ) : null,
        )}
        {days.map((d, i) => {
          const col = Math.floor(i / ROWS)
          const row = i % ROWS
          const m = monthLabel(d.date)
          const showMonth = row === 0 && m !== lastMonth && fromIsoDate(d.date).getDate() <= 7
          if (row === 0 && showMonth) lastMonth = m
          return (
            <g key={d.date}>
              {showMonth && (
                <text x={left + col * (cell + GAP)} y={10} className={styles.tick}>
                  {m}
                </text>
              )}
              <rect
                x={left + col * (cell + GAP)}
                y={topPad + row * (cell + GAP)}
                width={cell}
                height={cell}
                rx={3}
                className={styles[`heat${d.level}`]}
              >
                <title>
                  {formatDay(d.date)}:{' '}
                  {d.sessions === 0
                    ? 'rest'
                    : `${d.sessions} ${d.sessions === 1 ? 'session' : 'sessions'}, ${d.minutes} min`}
                </title>
              </rect>
            </g>
          )
        })}
      </svg>
      <p className={styles.legend} aria-hidden="true">
        Rest
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={`${styles.legendCell} ${styles[`heat${l}`]}`} />
        ))}
        Long day
      </p>
    </div>
  )
}
