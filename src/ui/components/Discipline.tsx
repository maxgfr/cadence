import type { Discipline } from '../../core/model/schemas.ts'
import styles from './Discipline.module.css'

export const DISCIPLINE_LABEL: Record<Discipline, string> = {
  strength: 'Gym',
  swim: 'Swim',
  run: 'Track',
  other: 'Other',
}

/** The discipline's identity dot. Always next to a text label: colour never carries meaning alone. */
export function DisciplineDot({ discipline }: { discipline: Discipline }) {
  return <span className={styles.dot} data-discipline={discipline} aria-hidden="true" />
}

/** Dot plus name, for lists and chips. */
export function DisciplineTag({ discipline }: { discipline: Discipline }) {
  return (
    <span className={styles.tag}>
      <DisciplineDot discipline={discipline} />
      {DISCIPLINE_LABEL[discipline]}
    </span>
  )
}
