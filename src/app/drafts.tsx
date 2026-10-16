import { createContext, type ReactNode, useContext, useMemo, useState } from 'react'
import type { Discipline, Exercise, Program } from '../core/model/schemas.ts'

/** A program not saved yet: from a template, from AI, or new. It lives only until saved or discarded. */
export interface ProgramDraft {
  program: Program
  newExercises: Exercise[]
  newDisciplines: Discipline[]
  notes: string[]
  origin: 'new' | 'template' | 'ai' | 'adjust'
}

interface Drafts {
  draft: ProgramDraft | null
  setDraft(d: ProgramDraft | null): void
}

const DraftContext = createContext<Drafts>({ draft: null, setDraft: () => {} })

export function useDraft(): Drafts {
  return useContext(DraftContext)
}

export function DraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<ProgramDraft | null>(null)
  const value = useMemo(() => ({ draft, setDraft }), [draft])
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>
}
