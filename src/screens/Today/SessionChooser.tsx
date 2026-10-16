import { useData } from '../../app/data.tsx'
import { startOfWeek } from '../../core/model/dates.ts'
import { choosableDays, dayAt, isSessionSet, nextDay, programsUnderWay } from '../../core/model/program.ts'
import type { Program, ProgramRef } from '../../core/model/schemas.ts'
import { DisciplineDot } from '../../ui/components/Discipline.tsx'
import { ListGroup, ListRow } from '../../ui/components/List.tsx'

/** Every session that can be started now, program by program: those under way first, then the latest edited. */
export function useChoosableSessions() {
  const data = useData()
  const underWay = programsUnderWay(data.programs, data.sessions, startOfWeek(data.today, data.settings.weekStart)).map(
    (t) => t.program,
  )
  const others = data.programs
    .filter((p) => !underWay.includes(p))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return [...underWay, ...others]
    .map((program) => ({
      program,
      refs: choosableDays(program, data.sessions, startOfWeek(data.today, data.settings.weekStart)),
      // The next day only means something once a program is under way.
      next: underWay.includes(program) ? nextDay(program, data.sessions) : undefined,
    }))
    .filter((g) => g.refs.length > 0)
}

export const sameRef = (a: ProgramRef | undefined, b: ProgramRef) =>
  a !== undefined && a.programId === b.programId && a.week === b.week && a.day === b.day

/** The sessions of every program, to start any of them (or come back to the one in progress). */
export function SessionList({
  activeRef,
  onPick,
}: {
  activeRef: ProgramRef | undefined
  onPick: (program: Program, ref: ProgramRef) => void
}) {
  const groups = useChoosableSessions()
  return groups.map(({ program, refs, next }) => (
    <ListGroup key={program.id} title={program.name}>
      {refs.map((ref) => {
        const day = dayAt(program, ref)
        if (!day) return null
        return (
          <ListRow
            key={day.id}
            leading={<DisciplineDot disciplineId={day.disciplineId} />}
            title={day.name}
            subtitle={[
              isSessionSet(program) ? '' : (program.weeks[ref.week]?.name ?? `Week ${ref.week + 1}`),
              `${day.blocks.length} ${day.blocks.length === 1 ? 'exercise' : 'exercises'}`,
              sameRef(activeRef, ref) ? 'in progress' : sameRef(next, ref) ? 'next up' : '',
            ]
              .filter(Boolean)
              .join(' · ')}
            onClick={() => onPick(program, ref)}
            chevron
          />
        )
      })}
    </ListGroup>
  ))
}
