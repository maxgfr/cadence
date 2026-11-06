import { useMemo, useRef, useState } from 'react'
import { useAi } from '../../app/ai.tsx'
import { useData } from '../../app/data.tsx'
import { useT } from '../../app/i18n.tsx'
import { useToast } from '../../app/toast.tsx'
import { describeAiError } from '../../core/ai/client.ts'
import { generateGoalsDraft } from '../../core/ai/features.ts'
import { type GoalProposal, goalsPrompt } from '../../core/ai/goals.ts'
import { summarizeContext } from '../../core/ai/program.ts'
import { Button } from '../../ui/components/Button.tsx'
import { Field } from '../../ui/components/Field.tsx'
import { useUnits } from '../../ui/units.ts'
import styles from './GoalSuggestions.module.css'
import { goalTitle } from './goalText.ts'

/**
 * Goals proposed by the user's model from their own training: a short question, then a list to pick from. Nothing is
 * stored until "Add". Loaded only when opened (it carries the AI code).
 */
export function GoalSuggestions({ onDone }: { onDone: () => void }) {
  const data = useData()
  const ai = useAi()
  const t = useT()
  const s = t.progress.suggest
  const units = useUnits()
  const toast = useToast()
  const [focus, setFocus] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [proposals, setProposals] = useState<GoalProposal[] | null>(null)
  const [left, setLeft] = useState<ReadonlySet<string>>(new Set())
  const abort = useRef<AbortController | null>(null)

  const library = useMemo(
    () => ({ exercises: data.exercises, disciplines: data.disciplines }),
    [data.exercises, data.disciplines],
  )

  async function propose() {
    setError(undefined)
    setBusy(true)
    const ctrl = new AbortController()
    abort.current = ctrl
    try {
      const context = summarizeContext({
        sessions: data.sessions,
        goals: data.goals,
        programs: data.programs,
        exercises: data.index,
        disciplines: data.disciplines,
        today: data.today,
        weekStart: data.settings.weekStart,
      })
      const model = await ai.model()
      const out = await generateGoalsDraft(
        model,
        goalsPrompt({ focus }, context, library),
        library,
        data.goals,
        data.today,
        ctrl.signal,
      )
      setProposals(out)
      setLeft(new Set())
    } catch (e) {
      setError(describeAiError(e))
    } finally {
      setBusy(false)
      abort.current = null
    }
  }

  const chosen = proposals?.filter((p) => !left.has(p.goal.id)) ?? []
  const name = (id: string | undefined) => (id ? data.disciplineIndex.get(id)?.name : undefined)

  if (proposals && proposals.length > 0)
    return (
      <div className={styles.form}>
        <ul className={styles.list}>
          {proposals.map((p) => (
            <li key={p.goal.id}>
              <label className={styles.item}>
                <input
                  type="checkbox"
                  checked={!left.has(p.goal.id)}
                  onChange={(e) => {
                    const next = new Set(left)
                    if (e.target.checked) next.delete(p.goal.id)
                    else next.add(p.goal.id)
                    setLeft(next)
                  }}
                />
                <span>
                  <span className={styles.title}>{goalTitle(p.goal, data.index, units, name)}</span>
                  {p.why && <span className={styles.why}>{p.why}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <Button
          variant="primary"
          size="large"
          full
          disabled={chosen.length === 0}
          onClick={async () => {
            for (const p of chosen) await data.put('goals', p.goal)
            toast(s.added(chosen.length))
            onDone()
          }}
        >
          {s.add(chosen.length)}
        </Button>
      </div>
    )

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault()
        if (!busy) propose()
      }}
    >
      <p className={styles.lead}>{s.lead}</p>
      <Field
        label={s.focus}
        placeholder={s.focusPlaceholder}
        value={focus}
        onChange={(e) => setFocus(e.target.value)}
      />
      {proposals?.length === 0 && <p className={styles.lead}>{s.none}</p>}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" size="large" full loading={busy}>
        {s.propose}
      </Button>
      {busy && (
        <Button variant="plain" full onClick={() => abort.current?.abort()}>
          {t.common.cancel}
        </Button>
      )}
    </form>
  )
}
