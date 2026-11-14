import type { Muscle } from '../../core/model/schemas.ts'
import type { PresetSlug } from '../../core/presets/catalog.ts'
import { compose } from './compose.ts'
import styles from './ExerciseArt.module.css'

export interface DrawingProps {
  slug: PresetSlug
  muscles: readonly Muscle[]
  className: string | undefined
  /** Names the drawing; without one it is decoration beside the exercise's name. */
  label?: string | undefined
}

/** An exercise's illustration as inline SVG, coloured by the theme's tokens. Loaded with the first one shown. */
export default function Drawing({ slug, muscles, className, label }: DrawingProps) {
  const drawing = compose(slug, muscles)
  if (!drawing) return null
  const shapes = <Shapes shapes={drawing.shapes} />
  return label ? (
    <svg className={className} viewBox={drawing.viewBox} role="img" aria-label={label}>
      {shapes}
    </svg>
  ) : (
    <svg className={className} viewBox={drawing.viewBox} aria-hidden="true">
      {shapes}
    </svg>
  )
}

function Shapes({ shapes }: { shapes: NonNullable<ReturnType<typeof compose>>['shapes'] }) {
  return (
    <>
      {shapes.map((s) => {
        const tone = styles[s.tone]
        switch (s.k) {
          case 'line':
            return (
              <line
                key={s.key}
                className={`${tone} ${s.dash ? styles.dash : ''}`}
                x1={s.a[0]}
                y1={s.a[1]}
                x2={s.b[0]}
                y2={s.b[1]}
                strokeWidth={s.w}
              />
            )
          case 'circle':
            return (
              <circle
                key={s.key}
                className={`${tone} ${s.fill ? styles.filled : styles.hollow}`}
                cx={s.c[0]}
                cy={s.c[1]}
                r={s.r}
                strokeWidth={s.w ?? 0}
              />
            )
          case 'rect':
            return (
              <rect
                key={s.key}
                className={`${tone} ${styles.filled}`}
                x={s.x}
                y={s.y}
                width={s.w}
                height={s.h}
                rx={1.5}
                strokeWidth={1.5}
              />
            )
          default:
            return (
              <path
                key={s.key}
                className={`${tone} ${s.fill ? styles.filled : styles.hollow}`}
                d={s.d}
                strokeWidth={s.w}
              />
            )
        }
      })}
    </>
  )
}
