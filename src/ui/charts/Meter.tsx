import styles from './Chart.module.css'

/** A goal's way from its start to its target, with the trend's projected end as a tick. */
export function Meter({ fraction, projected, label }: { fraction: number; projected?: number; label: string }) {
  const pct = Math.round(fraction * 100)
  return (
    <div className={styles.meter}>
      <div className={styles.meterFill} style={{ width: `${pct}%` }} />
      {projected !== undefined && projected > fraction && (
        <div className={styles.meterProjection} style={{ left: `${Math.min(100, projected * 100)}%` }} />
      )}
      <span className="sr-only">{label}</span>
    </div>
  )
}
