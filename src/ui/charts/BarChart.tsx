import { useState } from 'react'
import styles from './Chart.module.css'
import { compact, linear, niceTicks, useWidth } from './scale.ts'

export interface Bar {
  key: string
  label: string
  value: number
  /** Shown lighter: a period still running. */
  partial?: boolean
}

export interface BarChartProps {
  label: string
  bars: readonly Bar[]
  format: (v: number) => string
  height?: number
}

const PAD = { top: 20, right: 8, bottom: 28, left: 44 }

/** Columns from one baseline: capped at 24px, rounded at the data end only, value of the hovered one in a tooltip. */
export function BarChart({ label, bars, format, height = 180 }: BarChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(0, ...bars.map((b) => b.value))
  const ticks = niceTicks(0, max || 1, 3)
  const top = ticks[ticks.length - 1] ?? 1
  const w = Math.max(width, 200)
  const band = (w - PAD.left - PAD.right) / Math.max(1, bars.length)
  const bw = Math.min(24, band * 0.6)
  const y = linear(0, top, height - PAD.bottom, PAD.top)
  const labelEvery = Math.ceil(bars.length / Math.max(1, Math.floor((w - PAD.left) / 44)))
  const a = active !== null ? bars[active] : undefined
  const r = 4
  return (
    <div ref={ref} className={styles.chart}>
      {width > 0 && (
        <svg
          width={w}
          height={height}
          role="img"
          aria-label={label}
          className={styles.svg}
          onPointerMove={(e) => {
            const i = Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left - PAD.left) / band)
            setActive(i >= 0 && i < bars.length ? i : null)
          }}
          onPointerLeave={() => setActive(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={w - PAD.right}
                y1={y(t)}
                y2={y(t)}
                className={t === 0 ? styles.baseline : styles.grid}
              />
              <text x={PAD.left - 8} y={y(t)} className={styles.tick} textAnchor="end" dominantBaseline="middle">
                {compact(t)}
              </text>
            </g>
          ))}
          {bars.map((b, i) => {
            const cx = PAD.left + band * i + band / 2
            const h = Math.max(0, y(0) - y(b.value))
            const x0 = cx - bw / 2
            const yTop = y(b.value)
            const rr = Math.min(r, h, bw / 2)
            const d =
              h <= 0
                ? ''
                : `M${x0},${y(0)}V${yTop + rr}Q${x0},${yTop} ${x0 + rr},${yTop}H${x0 + bw - rr}Q${x0 + bw},${yTop} ${x0 + bw},${yTop + rr}V${y(0)}Z`
            return (
              <g key={b.key}>
                {d && (
                  <path
                    d={d}
                    className={b.partial ? styles.barPartial : styles.bar}
                    opacity={active === null || active === i ? 1 : 0.55}
                  />
                )}
                {i % labelEvery === 0 && (
                  <text x={cx} y={height - 8} className={styles.tick} textAnchor="middle">
                    {b.label}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      )}
      {a && active !== null && (
        <div
          className={styles.tooltip}
          style={{
            left: Math.min(Math.max(PAD.left + band * active + band / 2, 70), w - 70),
            top: Math.max(0, y(a.value) - 64),
          }}
          role="status"
        >
          <span className={styles.tooltipValue}>{format(a.value)}</span>
          <span className={styles.tooltipLabel}>
            Week of {a.label}
            {a.partial ? ' (so far)' : ''}
          </span>
        </div>
      )}
    </div>
  )
}
