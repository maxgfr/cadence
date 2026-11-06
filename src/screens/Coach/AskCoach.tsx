import { MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { useCoach } from '../../app/coach.tsx'
import { useT } from '../../app/i18n.tsx'
import { newId } from '../../core/model/ids.ts'
import { Button } from '../../ui/components/Button.tsx'
import styles from './Coach.module.css'
import { useCoachTurn } from './useCoachSender.ts'

/**
 * "Is this a good idea?", asked where the athlete is (a program day being edited) without leaving it: the coach's
 * verdict shows here, and the exchange joins the conversation to carry on in the coach later. Loaded only when shown.
 */
export function AskCoach({ question }: { question: string }) {
  const t = useT()
  const coach = useCoach()
  const { status, turn, describe } = useCoachTurn()
  const [reply, setReply] = useState<string>()
  const [error, setError] = useState<string>()
  const busy = status.kind !== 'idle'
  return (
    <div className={styles.ask} aria-live="polite">
      <Button
        variant="plain"
        loading={busy}
        icon={<MessageCircle size={18} strokeWidth={2} aria-hidden="true" />}
        onClick={async () => {
          setError(undefined)
          try {
            const past = coach.entries.map((e) => ({ role: e.role, text: e.text }))
            const answer = await turn(past, { text: question })
            setReply(answer.reply)
            coach.setEntries((all) => [
              ...all,
              { id: newId(), role: 'user', text: question },
              { id: newId(), role: 'assistant', text: answer.reply, proposals: answer.proposals, outcome: {} },
            ])
          } catch (e) {
            setError(describe(e))
          }
        }}
      >
        {t.coach.ask.link}
      </Button>
      {reply && <p className={styles.askReply}>{reply}</p>}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
