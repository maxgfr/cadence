import { useCallback, useEffect, useRef, useState } from 'react'
import { useAi } from '../../app/ai.tsx'
import { useCoach } from '../../app/coach.tsx'
import { useData } from '../../app/data.tsx'
import { useLocale, useT } from '../../app/i18n.tsx'
import { useToast } from '../../app/toast.tsx'
import { VoiceError, voiceInput } from '../../app/voice.ts'
import { dropNote, isOffline, keepNote, type PendingNote, pendingNotes } from '../../app/voiceQueue.ts'
import { describeAiError } from '../../core/ai/client.ts'
import type { CoachContext, CoachInput, CoachMessage, CoachTurn } from '../../core/ai/coach.ts'
import { generateCoachTurn } from '../../core/ai/features.ts'
import { summarizeContext } from '../../core/ai/program.ts'
import { newId } from '../../core/model/ids.ts'

export type SenderStatus =
  | { kind: 'idle' }
  | { kind: 'transcribing'; ratio?: number }
  | { kind: 'thinking' }
  /** Designing what the coach was asked to build: a program, a week, exercises, goals. */
  | { kind: 'building' }

/** Turns text or a recording into a coach turn: the AI code and the conversation's context, in one place. */
export function useCoachTurn() {
  const data = useData()
  const ai = useAi()
  const { screen } = useCoach()
  const locale = useLocale()
  const t = useT()
  const [status, setStatus] = useState<SenderStatus>({ kind: 'idle' })
  const abort = useRef<AbortController | null>(null)

  const context = useCallback(
    (): CoachContext => ({
      library: { exercises: data.exercises, disciplines: data.disciplines },
      index: data.index,
      programs: data.programs,
      goals: data.goals,
      active: data.sessions.find((s) => s.status === 'active'),
      settings: data.settings,
      today: data.today,
      trained: data.sessions.some((s) => s.status === 'done'),
      ...(screen ? { screen: screen.where } : {}),
    }),
    [data, screen],
  )

  /** Words from a recording, or the recording itself when the model hears audio. */
  const fromVoice = useCallback(
    async (blob: Blob): Promise<CoachInput> => {
      setStatus({ kind: 'transcribing' })
      return voiceInput(blob, await ai.modelRef(), ai.config.voice, locale, (ratio) =>
        setStatus({ kind: 'transcribing', ratio }),
      )
    },
    [ai, locale],
  )

  const turn = useCallback(
    async (history: readonly CoachMessage[], input: CoachInput): Promise<CoachTurn> => {
      const ctrl = new AbortController()
      abort.current = ctrl
      setStatus({ kind: 'thinking' })
      try {
        const c = context()
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
          { context: c, history: history_ },
          history,
          input,
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

  /** A sentence for any failure: the microphone, the transcription, or the call. */
  const describe = useCallback(
    (e: unknown) => {
      if (e instanceof VoiceError) {
        const v = t.coach.voiceErrors
        return {
          unsupported: v.unsupported,
          denied: v.denied,
          'no-transcription': v.noTranscription,
          'device-failed': v.deviceFailed,
        }[e.code]
      }
      return describeAiError(e)
    },
    [t],
  )

  return { status, setStatus, turn, fromVoice, describe, stop: () => abort.current?.abort() }
}

/** The coach's sending: each message and its answer join the conversation; offline notes wait on the device. */
export function useCoachSender() {
  const { entries, setEntries } = useCoach()
  const { status, setStatus, turn, fromVoice, describe, stop } = useCoachTurn()
  const t = useT()
  const toast = useToast()
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState<PendingNote[]>([])

  const refreshPending = useCallback(() => {
    pendingNotes().then((all) => setPending(all.filter((n) => n.sessionId === undefined)))
  }, [])
  useEffect(refreshPending, [refreshPending])

  const history = (): CoachMessage[] => entries.map((e) => ({ role: e.role, text: e.text }))

  const answer = useCallback(
    async (input: CoachInput, shown: string, voice: boolean) => {
      const past = entries.map((e): CoachMessage => ({ role: e.role, text: e.text }))
      setEntries((all) => [...all, { id: newId(), role: 'user', text: shown, ...(voice ? { voice } : {}) }])
      const reply = await turn(past, input)
      setEntries((all) => [
        ...all,
        { id: newId(), role: 'assistant', text: reply.reply, proposals: reply.proposals, outcome: {} },
      ])
      // Something it was asked to build could not be: said under its reply, which stands.
      if (reply.failed !== undefined) setError(describe(reply.failed))
    },
    [entries, setEntries, turn, describe],
  )

  const sendText = useCallback(
    async (text: string) => {
      setError(undefined)
      try {
        await answer({ text }, text, false)
        return true
      } catch (e) {
        setError(describe(e))
        return false
      }
    },
    [answer, describe],
  )

  const sendVoice = useCallback(
    async (blob: Blob, keptId?: string) => {
      setError(undefined)
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        if (!keptId) await keepNote({ id: newId(), blob, createdAt: new Date().toISOString() })
        toast(t.coach.offline)
        refreshPending()
        return
      }
      try {
        const input = await fromVoice(blob)
        await answer(input, input.text ?? t.coach.voiceNote, true)
        if (keptId) await dropNote(keptId)
      } catch (e) {
        setStatus({ kind: 'idle' })
        if (isOffline(e)) {
          if (!keptId) await keepNote({ id: newId(), blob, createdAt: new Date().toISOString() })
          toast(t.coach.offline)
        } else setError(describe(e))
      } finally {
        refreshPending()
      }
    },
    [answer, describe, fromVoice, refreshPending, setStatus, t, toast],
  )

  const sendPending = useCallback(async () => {
    for (const note of pending) await sendVoice(note.blob, note.id)
  }, [pending, sendVoice])

  return { status, error, setError, describe, sendText, sendVoice, pending, sendPending, stop, history }
}
