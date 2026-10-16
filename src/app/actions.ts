import { useLocation } from 'wouter'
import { freeSession, sessionFromDay } from '../core/model/program.ts'
import type { Program, ProgramRef } from '../core/model/schemas.ts'
import { currentE1rm } from '../core/stats/metrics.ts'
import { useData } from './data.tsx'

/** Starting a session: from a program day, pre-filled, or free. Opens the logging screen. */
export function useStartSession() {
  const data = useData()
  const [, navigate] = useLocation()
  const e1rmOf = (exerciseId: string) => {
    const ex = data.index.get(exerciseId)
    return ex ? currentE1rm(data.sessions, ex, data.today) : undefined
  }
  return {
    async fromDay(program: Program, ref: ProgramRef) {
      const s = sessionFromDay(program, ref, data.index, e1rmOf, data.today)
      await data.put('sessions', s)
      navigate(`/log/${s.id}`)
    },
    async free(disciplineId: string | undefined, date: string = data.today) {
      const s = freeSession(disciplineId ? data.disciplineIndex.get(disciplineId) : undefined, date)
      await data.put('sessions', s)
      navigate(`/log/${s.id}`)
    },
  }
}
