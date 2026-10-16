import { useData } from '../../app/data.tsx'
import { choosableDays, dayAt, isSessionSet, nextDay } from '../../core/model/program.ts'
import type { Program, ProgramRef } from '../../core/model/schemas.ts'
import { DisciplineDot } from '../../ui/components/Discipline.tsx'
import { ListGroup, ListRow } from '../../ui/components/List.tsx'

/** Every session that can be started now, program by program (the current one first). */
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

const same = (a: ProgramRef | undefined, b: ProgramRef) =>
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
  return groups.map(({ program, current, refs, next }) => (
    <ListGroup key={program.id} title={current ? `${program.name} (current)` : program.name}>
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
              same(activeRef, ref) ? 'in progress' : same(next, ref) ? 'next up' : '',
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
