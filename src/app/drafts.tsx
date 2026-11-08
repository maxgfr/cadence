import { createContext, type ReactNode, useContext, useMemo, useState } from 'react'
import type { ExercisesDraft } from '../core/ai/exercises.ts'
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
  /** Exercises the coach proposed, picked and edited before they reach the library. */
  exercises: ExercisesDraft | null
  setExercises(d: ExercisesDraft | null): void
  /** A description the coach wrote for an exercise, read and edited in its form before it is saved. */
  description: ExerciseDescriptionDraft | null
  setDescription(d: ExerciseDescriptionDraft | null): void
}

export interface ExerciseDescriptionDraft {
  exerciseId: string
  text: string
}

const DraftContext = createContext<Drafts>({
  draft: null,
  setDraft: () => {},
  exercises: null,
  setExercises: () => {},
  description: null,
  setDescription: () => {},
})

export function useDraft(): Drafts {
  return useContext(DraftContext)
}

export function DraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<ProgramDraft | null>(null)
  const [exercises, setExercises] = useState<ExercisesDraft | null>(null)
  const [description, setDescription] = useState<ExerciseDescriptionDraft | null>(null)
  const value = useMemo(
    () => ({ draft, setDraft, exercises, setExercises, description, setDescription }),
    [draft, exercises, description],
  )
  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>
}
