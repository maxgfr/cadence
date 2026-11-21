import { useLocation } from 'wouter'
import { addOfferedBlock, freeSession, restartSession, sessionFromDay } from '../core/model/program.ts'
import type { Block, Program, ProgramRef, Session } from '../core/model/schemas.ts'
import { currentE1rm, lastPerformance } from '../core/stats/metrics.ts'
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
    /** The session started over, as it would start now. Not stored: the logging screen writes it. */
    restarted(session: Session): Session {
      const now = new Date()
      const before = { date: session.date, startedAt: now.toISOString() }
      return restartSession(
        session,
        data.index,
        e1rmOf,
        (exerciseId) => lastPerformance(data.sessions, exerciseId, before),
        now,
      )
    },
    /** The session with one of its day's optional blocks added, pre-filled as a planned one. Not stored either. */
    withOffered(session: Session, block: Block): Session {
      return addOfferedBlock(session, block, data.index, e1rmOf, (exerciseId) =>
        lastPerformance(data.sessions, exerciseId, session),
      )
    },
    async fromDay(program: Program, ref: ProgramRef) {
      const now = new Date()
      const before = { date: data.today, startedAt: now.toISOString() }
      const s = sessionFromDay(program, ref, data.index, e1rmOf, data.today, now, (exerciseId) =>
        lastPerformance(data.sessions, exerciseId, before),
      )
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
