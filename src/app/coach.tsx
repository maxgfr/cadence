import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import type { CoachProposal } from '../core/ai/coach.ts'

/** One message of the conversation; the coach's carry the changes it proposes and what became of each. */
export interface CoachEntry {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** The athlete spoke rather than typed. */
  voice?: boolean
  proposals?: CoachProposal[]
  /** Proposal id → what the athlete did with it. */
  outcome?: Record<string, 'applied' | 'dismissed'>
}

interface Coach {
  entries: CoachEntry[]
  setEntries(fn: (entries: CoachEntry[]) => CoachEntry[]): void
  /** Text waiting in the composer (a question asked from another screen). */
  draft: string
  setDraft(text: string): void
  /** Opens the coach with a question ready to send. */
  ask(text: string): void
  clear(): void
}

const CoachContext = createContext<Coach | null>(null)

export function useCoach(): Coach {
  const c = useContext(CoachContext)
  if (!c) throw new Error('useCoach outside CoachProvider')
  return c
}

/** The conversation lives in memory only: never stored, never exported, gone on reload. */
export function CoachProvider({ children }: { children: ReactNode }) {
  const [entries, setEntriesState] = useState<CoachEntry[]>([])
  const [draft, setDraft] = useState('')
  const [, navigate] = useLocation()
  const setEntries = useCallback((fn: (e: CoachEntry[]) => CoachEntry[]) => setEntriesState(fn), [])
  const ask = useCallback(
    (text: string) => {
      setDraft(text)
      navigate('/coach')
    },
    [navigate],
  )
  const clear = useCallback(() => {
    setEntriesState([])
    setDraft('')
  }, [])
  const value = useMemo(
    () => ({ entries, setEntries, draft, setDraft, ask, clear }),
    [entries, setEntries, draft, ask, clear],
  )
  return <CoachContext.Provider value={value}>{children}</CoachContext.Provider>
}
