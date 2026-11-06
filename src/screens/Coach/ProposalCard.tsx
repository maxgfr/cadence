import { Check } from 'lucide-react'
import { useData } from '../../app/data.tsx'
import { useT } from '../../app/i18n.tsx'
import type { CoachProposal } from '../../core/ai/coach.ts'
import { LANGUAGE_NAMES } from '../../core/i18n/locale.ts'
import type { UnitPrefs } from '../../core/model/program.ts'
import type { SetLog } from '../../core/model/schemas.ts'
import { formatDistance, formatTime, formatWeight, NBSP } from '../../core/model/units.ts'
import { Button } from '../../ui/components/Button.tsx'
import { useUnits } from '../../ui/units.ts'
import { goalTitle } from '../Progress/goalText.ts'
import styles from './Coach.module.css'

/** A set as it reads in a line: "82.5 kg × 8 · RPE 9", "50 m in 0:41". */
export function setText(s: SetLog, units: UnitPrefs): string {
  const parts: string[] = []
  if (s.weight !== undefined) parts.push(formatWeight(s.weight, units.weightUnit))
  if (s.reps !== undefined) parts.push(parts.length > 0 ? `×${NBSP}${s.reps}` : `${s.reps}${NBSP}×`)
  if (s.distance !== undefined) parts.push(formatDistance(s.distance, units.distanceUnit))
  if (s.time !== undefined) parts.push(formatTime(s.time))
  if (s.rpe !== undefined) parts.push(`RPE${NBSP}${s.rpe}`)
  return parts.join(' ')
}

/** What a proposal does, in a title and the lines under it. */
export function useProposalText(p: CoachProposal): { title: string; lines: string[] } {
  const data = useData()
  const t = useT()
  const units = useUnits()
  const x = t.coach.proposal
  switch (p.kind) {
    case 'log_sets':
      return {
        title: x.logSets(p.sets.length, p.exercise.name),
        lines: [p.sets.map((s) => setText(s, units)).join(' · '), ...(p.isNew ? [x.newExercise(p.exercise.name)] : [])],
      }
    case 'add_exercises':
      return {
        title: x.addExercises(p.draft.exercises.length),
        lines: [p.draft.exercises.map((e) => e.name).join(', ')],
      }
    case 'program':
      return {
        title:
          p.origin === 'adjust' && p.week !== undefined
            ? x.adjustWeek(p.draft.program.name, p.week)
            : x.program(p.draft.program.name),
        lines: p.draft.program.goal ? [p.draft.program.goal] : [],
      }
    case 'add_goals':
      return {
        title: x.addGoals(p.goals.length),
        lines: p.goals.map((g) =>
          goalTitle(g.goal, data.index, units, (id) => (id ? data.disciplineIndex.get(id)?.name : undefined)),
        ),
      }
    case 'settings': {
      const s = p.patch
      const parts = [
        s.weightUnit && x.weightUnit(s.weightUnit),
        s.distanceUnit && x.distanceUnit(s.distanceUnit),
        s.weekStart !== undefined && x.weekStart(s.weekStart === 1),
        s.defaultRest !== undefined && x.rest(formatTime(s.defaultRest, false)),
        s.mode && x.mode(s.mode === 'advanced' ? t.welcome.advancedTitle : t.welcome.normalTitle),
        s.language && x.language(s.language === 'system' ? t.settings.languageSystem : LANGUAGE_NAMES[s.language]),
      ].filter((v): v is string => typeof v === 'string')
      return { title: x.settings, lines: [parts.join(', ')] }
    }
  }
}

/** One proposal of the coach: what it does, and Apply or Dismiss. Nothing happens before Apply. */
export function ProposalCard({
  proposal,
  outcome,
  onApply,
  onDismiss,
}: {
  proposal: CoachProposal
  outcome: 'applied' | 'dismissed' | undefined
  onApply: () => void
  onDismiss: () => void
}) {
  const t = useT()
  const { title, lines } = useProposalText(proposal)
  const opensDraft = proposal.kind === 'program'
  return (
    <article className={styles.card} data-outcome={outcome}>
      <h3 className={styles.cardTitle}>{title}</h3>
      {lines.filter(Boolean).map((l) => (
        <p key={l} className={styles.cardLine}>
          {l}
        </p>
      ))}
      {outcome ? (
        <p className={styles.outcome} role="status">
          {outcome === 'applied' && <Check size={16} strokeWidth={2.25} aria-hidden="true" />}
          {outcome === 'applied' ? t.coach.applied : t.coach.dismissed}
        </p>
      ) : (
        <div className={styles.cardActions}>
          <Button variant="primary" onClick={onApply}>
            {opensDraft ? t.coach.openDraft : t.coach.apply}
          </Button>
          <Button variant="plain" onClick={onDismiss}>
            {t.coach.dismiss}
          </Button>
        </div>
      )}
    </article>
  )
}
