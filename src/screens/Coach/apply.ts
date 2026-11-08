import { useCallback } from 'react'
import { useLocation } from 'wouter'
import { useData } from '../../app/data.tsx'
import { useDraft } from '../../app/drafts.tsx'
import type { CoachProposal } from '../../core/ai/coach.ts'
import { applyLoggedSets, freeSession } from '../../core/model/program.ts'

/**
 * Applies one proposal the athlete confirmed: the only place the coach's work reaches their data. A program opens as
 * a draft in the editor, exercises in their review, a description in the exercise's form, saved only from there.
 */
export function useApplyProposal() {
  const data = useData()
  const { setDraft, setExercises, setDescription } = useDraft()
  const [, navigate] = useLocation()
  return useCallback(
    async (p: CoachProposal) => {
      switch (p.kind) {
        case 'log_sets': {
          if (p.isNew) await data.put('exercises', p.exercise)
          const discipline = p.exercise.disciplineId ? data.disciplineIndex.get(p.exercise.disciplineId) : undefined
          const session = data.sessions.find((s) => s.status === 'active') ?? freeSession(discipline, data.today)
          await data.put('sessions', applyLoggedSets(session, p.exercise.id, p.sets))
          return
        }
        case 'add_exercises':
          setExercises(p.draft)
          navigate('/exercises/review')
          return
        case 'exercise_description':
          setDescription({ exerciseId: p.exercise.id, text: p.description })
          navigate('/exercises')
          return
        case 'program':
          setDraft({ ...p.draft, origin: p.origin })
          navigate('/programs/draft')
          return
        case 'add_goals':
          for (const g of p.goals) await data.put('goals', g.goal)
          return
        case 'settings':
          await data.updateSettings(p.patch)
          return
        case 'rest':
          if ('exercise' in p.target) await data.put('exercises', { ...p.target.exercise, rest: p.seconds })
          else await data.put('disciplines', { ...p.target.discipline, rest: p.seconds })
          return
      }
    },
    [data, setDraft, setExercises, setDescription, navigate],
  )
}
