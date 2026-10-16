import { useState } from 'react'
import { daysBetween, formatShortDay } from '../../core/model/dates.ts'
import styles from './Chart.module.css'
import { linear, niceTicks, useWidth } from './scale.ts'

export interface LinePoint {
  date: string
  value: number
  /** Drawn as a record marker. */
  record?: boolean
}

export interface LineChartProps {
  label: string
  points: readonly LinePoint[]
  format: (v: number) => string
  /** A horizontal reference line (a goal's target). */
  target?: { value: number; label: string }
  /** The trend carried to a date, drawn dashed from the last point. */
  projection?: { date: string; value: number }
  height?: number
}

const PAD = { top: 16, right: 16, bottom: 28, left: 52 }

/** One series over time: 2px line, ringed markers, records filled larger, a crosshair tooltip on hover (the values are also in each chart's table view). */
export function LineChart({ label, points, format, target, projection, height = 220 }: LineChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  if (points.length === 0) return null
  const first = points[0]?.date ?? ''
  const lastDate = projection?.date ?? points[points.length - 1]?.date ?? first
  const spanDays = Math.max(1, daysBetween(first, lastDate))
  const values = [
    ...points.map((p) => p.value),
    ...(target ? [target.value] : []),
    ...(projection ? [projection.value] : []),
  ]
  const ticks = niceTicks(Math.min(...values), Math.max(...values))
  const y0 = ticks[0] ?? 0
  const y1 = ticks[ticks.length - 1] ?? 1
  const w = Math.max(width, 200)
  const x = linear(0, spanDays, PAD.left, w - PAD.right)
  const y = linear(y0, y1, height - PAD.bottom, PAD.top)
  const px = (d: string) => x(points.length === 1 && !projection ? spanDays / 2 : daysBetween(first, d))
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join('')
  const last = points[points.length - 1]
  const xTicks = [first, lastDate].filter((d, i, a) => a.indexOf(d) === i)
  const hit = (clientX: number, rect: DOMRect) => {
    const mx = clientX - rect.left
    let best = 0
    let dist = Number.POSITIVE_INFINITY
    points.forEach((p, i) => {
      const d = Math.abs(px(p.date) - mx)
      if (d < dist) {
        dist = d
        best = i
      }
    })
    return best
  }
  const a = active !== null ? points[active] : undefined

  return (
    <div ref={ref} className={styles.chart}>
      {width > 0 && (
        <svg
          width={w}
          height={height}
          role="img"
          aria-label={`${label}: ${points.length} values from ${format(points[0]?.value ?? 0)} to ${format(last?.value ?? 0)}`}
          className={styles.svg}
          onPointerMove={(e) => setActive(hit(e.clientX, e.currentTarget.getBoundingClientRect()))}
          onPointerLeave={() => setActive(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={w - PAD.right} y1={y(t)} y2={y(t)} className={styles.grid} />
              <text x={PAD.left - 8} y={y(t)} className={styles.tick} textAnchor="end" dominantBaseline="middle">
                {format(t)}
              </text>
            </g>
          ))}
          {xTicks.map((d, i) => (
            <text
              key={d}
              x={px(d)}
              y={height - 8}
              className={styles.tick}
              textAnchor={xTicks.length === 1 ? 'middle' : i === 0 ? 'start' : 'end'}
            >
              {formatShortDay(d)}
            </text>
          ))}
          {target && (
            <g>
              <line
                x1={PAD.left}
                x2={w - PAD.right}
                y1={y(target.value)}
                y2={y(target.value)}
                className={styles.target}
              />
              <text x={w - PAD.right} y={y(target.value) - 6} className={styles.targetLabel} textAnchor="end">
                {target.label}
              </text>
            </g>
          )}
          {projection && last && (
            <line
              x1={px(last.date)}
              y1={y(last.value)}
              x2={px(projection.date)}
              y2={y(projection.value)}
              className={styles.projection}
            />
          )}
          <path d={path} className={styles.line} />
          {points.map((p) => (
            <circle
              key={`${p.date}-${p.value}`}
              cx={px(p.date)}
              cy={y(p.value)}
              r={p.record ? 5 : 3.5}
              className={p.record ? styles.record : styles.dot}
            />
          ))}
          {a && (
            <g>
              <line
                x1={px(a.date)}
                x2={px(a.date)}
                y1={PAD.top}
                y2={height - PAD.bottom}
                className={styles.crosshair}
              />
              <circle cx={px(a.date)} cy={y(a.value)} r={6} className={styles.activeDot} />
            </g>
          )}
        </svg>
      )}
      {a && (
        <div
          className={styles.tooltip}
          style={{ left: Math.min(Math.max(px(a.date), 70), w - 70), top: Math.max(0, y(a.value) - 64) }}
          role="status"
        >
          <span className={styles.tooltipValue}>{format(a.value)}</span>
          <span className={styles.tooltipLabel}>
            {formatShortDay(a.date)}
            {a.record ? ' · record' : ''}
          </span>
        </div>
      )}
    </div>
  )
}
