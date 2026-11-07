import { ArrowUp, Mic, RotateCcw, Square, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useCoach } from '../../app/coach.tsx'
import { useT } from '../../app/i18n.tsx'
import { useToast } from '../../app/toast.tsx'
import { canRecord } from '../../app/voice.ts'
import type { CoachProposal } from '../../core/ai/coach.ts'
import { Button } from '../../ui/components/Button.tsx'
import { IconButton } from '../../ui/components/IconButton.tsx'
import { Sheet } from '../../ui/components/Sheet.tsx'
import { cx } from '../../ui/cx.ts'
import { useApplyProposal } from './apply.ts'
import styles from './Coach.module.css'
import { ProposalCard } from './ProposalCard.tsx'
import { type SenderStatus, useCoachSender } from './useCoachSender.ts'
import { useRecorder } from './useRecorder.ts'

function StatusLine({ status }: { status: SenderStatus }) {
  const t = useT()
  if (status.kind === 'idle') return null
  const text =
    status.kind === 'thinking'
      ? t.coach.thinking
      : status.kind === 'building'
        ? t.coach.building
        : status.ratio !== undefined && status.ratio < 1
          ? t.coach.downloading(Math.round(status.ratio * 100))
          : t.coach.transcribing
  return (
    <p className={styles.status} role="status">
      <span className={styles.dot} aria-hidden="true" />
      {text}
    </p>
  )
}

/**
 * The coach, over whatever screen the athlete is on: a conversation by text or voice that logs sets, sets the app up
 * and gives advice, knowing where they are. Each change it proposes is a card applied only when they say so. The
 * conversation stays in memory. Loaded with the AI code, the first time the bubble opens it.
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

function Conversation() {
  const t = useT()
  const toast = useToast()
  const coach = useCoach()
  const apply = useApplyProposal()
  const sender = useCoachSender()
  const recorder = useRecorder((e) => sender.setError(sender.describe(e)))
  const [text, setText] = useState(coach.draft)
  const input = useRef<HTMLTextAreaElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const busy = sender.status.kind !== 'idle'

  // A question asked from a screen lands in the composer, ready to send or edit; the logging screen's bubble records.
  useEffect(() => {
    if (coach.draft) {
      setText(coach.draft)
      coach.setDraft('')
      input.current?.focus()
    }
    if (coach.takeRecord() && canRecord()) recorder.start()
  }, [coach, recorder])
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
    // A draft opens on its screen, the conversation steps aside; anything else is done here.
    if (p.kind === 'program' || p.kind === 'add_exercises') coach.hide()
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
        <p className={styles.headTitle} aria-hidden="true">
          {t.coach.title}
        </p>
        {coach.entries.length > 0 && (
          <IconButton icon={RotateCcw} label={t.coach.newConversation} onClick={coach.clear} disabled={busy} />
        )}
        <IconButton icon={X} label={t.common.close} onClick={coach.hide} />
      </header>

      <div className={styles.thread}>
        {sender.pending.length > 0 && (
          <div className={styles.pending}>
            <p>{t.coach.pending(sender.pending.length)}</p>
            <Button variant="secondary" onClick={sender.sendPending} disabled={busy}>
              {t.coach.sendPending}
            </Button>
          </div>
        )}

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
                {e.voice && (
                  <Mic className={styles.voiceIcon} size={14} strokeWidth={2} aria-label={t.coach.voiceNote} />
                )}
                {e.text}
              </p>
              {e.proposals?.map((p) => (
                <ProposalCard
                  key={p.id}
                  proposal={p}
                  outcome={e.outcome?.[p.id]}
                  onApply={(picked) => onApply(e.id, picked)}
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
        {recorder.recording ? (
          <>
            <IconButton icon={X} label={t.coach.cancel} onClick={recorder.cancel} />
            <p className={styles.listening} role="status">
              <span className={styles.dot} aria-hidden="true" />
              {t.coach.listening}
            </p>
            <Button
              variant="primary"
              size="large"
              icon={<Square size={18} strokeWidth={2} aria-hidden="true" />}
              onClick={async () => {
                const blob = await recorder.stop()
                if (blob) await sender.sendVoice(blob)
              }}
            >
              {t.coach.stop}
            </Button>
          </>
        ) : (
          <>
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
            {text.trim() || !canRecord() ? (
              <button type="submit" className={styles.round} aria-label={t.coach.send} disabled={busy || !text.trim()}>
                <ArrowUp size={22} strokeWidth={2.25} aria-hidden="true" />
              </button>
            ) : (
              <button
                type="button"
                className={styles.round}
                aria-label={t.coach.record}
                disabled={busy}
                onClick={recorder.start}
              >
                <Mic size={22} strokeWidth={2} aria-hidden="true" />
              </button>
            )}
            {busy && <IconButton icon={X} label={t.coach.cancel} onClick={sender.stop} />}
          </>
        )}
      </form>
    </>
  )
}
