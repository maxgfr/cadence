import { useCallback, useRef, useState } from 'react'
import { useAi } from '../../app/ai.tsx'
import { useCoach } from '../../app/coach.tsx'
import { useData } from '../../app/data.tsx'
import { describeAiError } from '../../core/ai/client.ts'
import type { CoachContext, CoachMessage, CoachTurn } from '../../core/ai/coach.ts'
import { generateCoachTurn } from '../../core/ai/features.ts'
import { summarizeContext } from '../../core/ai/program.ts'
import { newId } from '../../core/model/ids.ts'
import { sessionInFocus } from '../../core/model/program.ts'

export type SenderStatus =
  | { kind: 'idle' }
  | { kind: 'thinking' }
  /** Designing what the coach was asked to build: a program, a week, exercises, goals. */
  | { kind: 'building' }

/** Turns a message into a coach turn: the AI code and the conversation's context, in one place. */
export function useCoachTurn() {
  const data = useData()
  const ai = useAi()
  const { screen } = useCoach()
  const [status, setStatus] = useState<SenderStatus>({ kind: 'idle' })
  const abort = useRef<AbortController | null>(null)

  const context = useCallback(
    (): CoachContext => ({
      library: { exercises: data.exercises, disciplines: data.disciplines },
      index: data.index,
      programs: data.programs,
      goals: data.goals,
      active: sessionInFocus(data.sessions, screen?.sessionId),
      settings: data.settings,
      today: data.today,
      trained: data.sessions.some((s) => s.status === 'done'),
      ...(screen ? { screen: screen.where } : {}),
    }),
    [data, screen],
  )

  const turn = useCallback(
    async (history: readonly CoachMessage[], text: string): Promise<CoachTurn> => {
      const ctrl = new AbortController()
      abort.current = ctrl
      setStatus({ kind: 'thinking' })
      try {
        const history_ = summarizeContext({
          sessions: data.sessions,
          goals: data.goals,
          programs: data.programs,
          exercises: data.index,
          disciplines: data.disciplines,
          today: data.today,
          weekStart: data.settings.weekStart,
        })
        return await generateCoachTurn(
          await ai.model(),
          { context: context(), history: history_ },
          history,
          { text },
          ctrl.signal,
          () => setStatus({ kind: 'building' }),
        )
      } finally {
        abort.current = null
        setStatus({ kind: 'idle' })
      }
    },
    [ai, context, data],
  )

  return { status, turn, stop: () => abort.current?.abort() }
}

/** The coach's sending: each message and its answer join the conversation. */
export function useCoachSender() {
  const { entries, setEntries } = useCoach()
  const { status, turn, stop } = useCoachTurn()
  const [error, setError] = useState<string>()

  const sendText = useCallback(
    async (text: string) => {
      setError(undefined)
      const past = entries.map((e): CoachMessage => ({ role: e.role, text: e.text }))
      setEntries((all) => [...all, { id: newId(), role: 'user', text }])
      try {
        const reply = await turn(past, text)
        setEntries((all) => [
          ...all,
          { id: newId(), role: 'assistant', text: reply.reply, proposals: reply.proposals, outcome: {} },
        ])
        // Something it was asked to build could not be: said under its reply, which stands.
        if (reply.failed !== undefined) setError(describeAiError(reply.failed))
        return true
      } catch (e) {
        // The message was not answered: it goes back to the composer, out of the thread.
        setEntries((all) => all.slice(0, -1))
        setError(describeAiError(e))
        return false
      }
    },
    [entries, setEntries, turn],
  )

  return { status, error, sendText, stop }
}
