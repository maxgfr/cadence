import { useStartSession } from '../../app/actions.ts'
import { useData } from '../../app/data.tsx'
import { choosableDays, dayAt, isSessionSet, nextDay } from '../../core/model/program.ts'
import { DisciplineDot } from '../../ui/components/Discipline.tsx'
import { ListGroup, ListRow } from '../../ui/components/List.tsx'
import { Sheet } from '../../ui/components/Sheet.tsx'

/** Every session that can be started now, program by program (the current one first): pick one to run it. */
export function useChoosableSessions() {
  const data = useData()
  const current = data.programs.find((p) => p.id === data.settings.activeProgramId)
  const others = data.programs
    .filter((p) => p.id !== current?.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return (current ? [current, ...others] : others)
    .map((program) => ({
      program,
      current: program.id === current?.id,
      refs: choosableDays(program, data.sessions),
      next: nextDay(program, data.sessions),
    }))
    .filter((g) => g.refs.length > 0)
}

export function SessionChooser({ open, onClose }: { open: boolean; onClose: () => void }) {
  const groups = useChoosableSessions()
  const start = useStartSession()
  return (
    <Sheet open={open} title="Choose a session" onClose={onClose}>
      {groups.map(({ program, current, refs, next }) => (
        <ListGroup key={program.id} title={current ? `${program.name} (current)` : program.name}>
          {refs.map((ref) => {
            const day = dayAt(program, ref)
            if (!day) return null
            const isNext = next?.week === ref.week && next.day === ref.day
            return (
              <ListRow
                key={day.id}
                leading={<DisciplineDot disciplineId={day.disciplineId} />}
                title={day.name}
                subtitle={[
                  isSessionSet(program) ? '' : (program.weeks[ref.week]?.name ?? `Week ${ref.week + 1}`),
                  `${day.blocks.length} ${day.blocks.length === 1 ? 'exercise' : 'exercises'}`,
                  isNext ? 'next up' : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                onClick={() => {
                  onClose()
                  start.fromDay(program, ref)
                }}
                chevron
              />
            )
          })}
        </ListGroup>
      ))}
    </Sheet>
  )
}
