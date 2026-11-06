import { CheckCircle2, Circle, Play } from 'lucide-react'
import { useT } from '../../app/i18n.tsx'
import { formatShortDay } from '../../core/model/dates.ts'
import type { WeekTodo } from '../../core/model/program.ts'
import type { ProgramRef } from '../../core/model/schemas.ts'
import { ListGroup, ListRow } from '../../ui/components/List.tsx'
import { sameRef } from './SessionChooser.tsx'
import styles from './Today.module.css'

/** One program's week: its sessions to do, those done (with the day), and a tap to start the rest. */
export function WeekTodoCard({
  todo,
  activeRef,
  onStart,
}: {
  todo: WeekTodo
  activeRef: ProgramRef | undefined
  onStart: (ref: ProgramRef) => void
}) {
  const t = useT()
  const { program, week, days, left, programLeft } = todo
  const summary = [
    week !== undefined ? (program.weeks[week]?.name ?? t.today.week(week + 1)) : t.today.eachSessionOnce,
    left === 0 ? t.today.allDoneThisWeek : t.today.doneOf(days.length - left, days.length),
    programLeft !== undefined && programLeft > 0 ? t.today.toFinishProgram(programLeft) : '',
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <ListGroup title={program.name} footer={summary}>
      {days.map(({ ref, day, done }) => {
        const running = sameRef(activeRef, ref)
        return (
          <ListRow
            key={day.id}
            leading={
              done ? (
                <CheckCircle2 className={styles.done} size={22} strokeWidth={2} />
              ) : running ? (
                <Play className={styles.running} size={20} strokeWidth={2} />
              ) : (
                <Circle className={styles.todo} size={22} strokeWidth={1.75} />
              )
            }
            title={day.name}
            subtitle={
              done
                ? t.today.doneOn(formatShortDay(done.date))
                : running
                  ? t.today.inProgress
                  : t.today.toDo(day.blocks.length)
            }
            {...(done ? {} : { onClick: () => onStart(ref), chevron: true })}
          />
        )
      })}
    </ListGroup>
  )
}
