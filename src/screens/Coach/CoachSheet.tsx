import { ArrowUp, RotateCcw, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useCoach } from '../../app/coach.tsx'
import { useT } from '../../app/i18n.tsx'
import { useToast } from '../../app/toast.tsx'
import type { CoachProposal } from '../../core/ai/coach.ts'
import { IconButton } from '../../ui/components/IconButton.tsx'
import { Sheet } from '../../ui/components/Sheet.tsx'
import { cx } from '../../ui/cx.ts'
import { useApplyProposal } from './apply.ts'
import styles from './Coach.module.css'
import { ProposalCard } from './ProposalCard.tsx'
import { type SenderStatus, useCoachSender } from './useCoachSender.ts'

function StatusLine({ status }: { status: SenderStatus }) {
  const t = useT()
  if (status.kind === 'idle') return null
  return (
    <p className={styles.status} role="status">
      <span className={styles.dot} aria-hidden="true" />
      {status.kind === 'building' ? t.coach.building : t.coach.thinking}
    </p>
  )
}

/**
 * The coach over whatever screen the athlete is on (phones and tablets, from the bubble). Loaded with the AI code,
 * the first time the bubble opens it.
 */
export function CoachSheet() {
  const t = useT()
  const coach = useCoach()
  return (
    <Sheet open={coach.open} title={t.coach.title} onClose={coach.hide} fill>
      {coach.open && <Conversation />}
    </Sheet>
  )
}

/** The coach beside the app, always there on a computer: the conversation carries on from screen to screen. */
export function CoachDock() {
  const t = useT()
  return (
    <aside className={styles.dock} aria-label={t.coach.title} data-coach-dock="">
      <Conversation docked />
    </aside>
  )
}

/**
 * The conversation: it logs sets, sets the app up and gives advice, knowing where the athlete is. Each change it
 * proposes is a card applied only when they say so. It stays in memory.
 */
function Conversation({ docked = false }: { docked?: boolean }) {
  const t = useT()
  const toast = useToast()
  const coach = useCoach()
  const apply = useApplyProposal()
  const sender = useCoachSender()
  const [text, setText] = useState(coach.draft)
  const input = useRef<HTMLTextAreaElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const busy = sender.status.kind !== 'idle'

  // A question asked from a screen lands in the composer, ready to send or edit.
  useEffect(() => {
    if (coach.draft) {
      setText(coach.draft)
      coach.setDraft('')
      input.current?.focus()
    }
  }, [coach])
  useEffect(() => {
    if (coach.entries.length > 0 || busy) end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [coach.entries.length, busy])

  const send = async () => {
    const message = text.trim()
    if (!message || busy) return
    setText('')
    if (!(await sender.sendText(message))) setText(message)
  }

  const outcome = (entryId: string, proposalId: string, value: 'applied' | 'dismissed') =>
    coach.setEntries((all) =>
      all.map((e) => (e.id === entryId ? { ...e, outcome: { ...e.outcome, [proposalId]: value } } : e)),
    )

  const onApply = async (entryId: string, p: CoachProposal) => {
    await apply(p)
    outcome(entryId, p.id, 'applied')
    // A draft opens on its screen, and the conversation over it steps aside; anything else is done here.
    if (p.kind === 'program' || p.kind === 'add_exercises' || p.kind === 'exercise_description') coach.hide()
    else toast(t.coach.appliedToast)
  }

  const starters = coach.screen?.starters ?? [
    t.coach.starters.log,
    t.coach.starters.advice,
    t.coach.starters.program,
    t.coach.starters.goals,
  ]

  return (
    <>
      <header className={styles.head}>
        <p className={styles.headTitle} aria-hidden={docked ? undefined : 'true'}>
          {t.coach.title}
        </p>
        {coach.entries.length > 0 && (
          <IconButton icon={RotateCcw} label={t.coach.newConversation} onClick={coach.clear} disabled={busy} />
        )}
        {!docked && <IconButton icon={X} label={t.common.close} onClick={coach.hide} />}
      </header>

      <div className={styles.thread}>
        {coach.entries.length === 0 && (
          <>
            <p className={styles.lead}>{t.coach.subtitle}</p>
            <ul className={styles.starters}>
              {starters.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    className={styles.starter}
                    onClick={() => {
                      setText(s)
                      input.current?.focus()
                    }}
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <ol className={styles.messages}>
          {coach.entries.map((e) => (
            <li key={e.id} className={cx(styles.message, e.role === 'user' ? styles.mine : styles.theirs)}>
              <p className={styles.bubble}>
                <span className="sr-only">{e.role === 'user' ? t.coach.you : t.coach.title}: </span>
                {e.text}
              </p>
              {e.proposals?.map((p) => (
                <ProposalCard
                  key={p.id}
                  proposal={p}
                  outcome={e.outcome?.[p.id]}
                  onApply={(applied) => onApply(e.id, applied)}
                  onDismiss={() => outcome(e.id, p.id, 'dismissed')}
                />
              ))}
            </li>
          ))}
        </ol>

        <StatusLine status={sender.status} />
        {sender.error && (
          <p className={styles.error} role="alert">
            {sender.error}
          </p>
        )}
        <div ref={end} />
      </div>

      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <textarea
          ref={input}
          className={styles.input}
          rows={1}
          aria-label={t.coach.placeholder}
          placeholder={t.coach.placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send()
            }
          }}
        />
        {busy ? (
          <IconButton icon={X} label={t.coach.cancel} onClick={sender.stop} />
        ) : (
          <button type="submit" className={styles.round} aria-label={t.coach.send} disabled={!text.trim()}>
            <ArrowUp size={22} strokeWidth={2.25} aria-hidden="true" />
          </button>
        )}
      </form>
    </>
  )
}
