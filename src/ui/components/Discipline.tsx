import { useData } from '../../app/data.tsx'
import type { DisciplineColor } from '../../core/model/schemas.ts'
import styles from './Discipline.module.css'

export const COLOR_LABEL: Record<DisciplineColor, string> = {
  blue: 'Blue',
  aqua: 'Aqua',
  violet: 'Violet',
  orange: 'Orange',
  magenta: 'Magenta',
  green: 'Green',
  yellow: 'Yellow',
  red: 'Red',
}

/** A colour's dot, for pickers. */
export function ColorDot({ color }: { color: DisciplineColor | undefined }) {
  return <span className={styles.dot} data-color={color} aria-hidden="true" />
}

/** The discipline's identity dot (hollow without one). Always next to a text label: colour never carries meaning alone. */
export function DisciplineDot({ disciplineId }: { disciplineId: string | undefined }) {
  const { disciplineIndex } = useData()
  return <ColorDot color={disciplineId ? disciplineIndex.get(disciplineId)?.color : undefined} />
}

export function useDisciplineName(): (id: string | undefined) => string {
  const { disciplineIndex } = useData()
  return (id) => (id ? (disciplineIndex.get(id)?.name ?? 'Deleted discipline') : 'No discipline')
}

/** Dot plus name, for lists and chips. */
export function DisciplineTag({ disciplineId }: { disciplineId: string | undefined }) {
  const name = useDisciplineName()
  return (
    <span className={styles.tag}>
      <DisciplineDot disciplineId={disciplineId} />
      {name(disciplineId)}
    </span>
  )
}
