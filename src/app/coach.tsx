import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { CoachProposal } from '../core/ai/coach.ts'

/** One message of the conversation; the coach's carry the changes it proposes and what became of each. */
export interface CoachEntry {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** The athlete spoke rather than typed. */
  voice?: boolean
  proposals?: CoachProposal[]
  /** Proposal id → what the athlete did with it. */
  outcome?: Record<string, 'applied' | 'dismissed'>
}

/** What the screen on show tells the coach: where the athlete is, and what they are likely to ask there. */
export interface CoachScreen {
  /** Where they are, for the model: in English, like every prompt ("logging the session …"). */
  where: string
  /** Requests that fit this screen, in the interface language, offered before the first message. */
  starters?: string[]
  /** The microphone comes first: the bubble records as it opens (logging a session). */
  voiceFirst?: boolean
  /** Something sits at the bottom of the screen (the rest timer): the bubble moves above it. */
  raised?: boolean
}

interface Coach {
  entries: CoachEntry[]
  setEntries(fn: (entries: CoachEntry[]) => CoachEntry[]): void
  /** Text waiting in the composer (a question asked from a screen). */
  draft: string
  setDraft(text: string): void
  /** The conversation is open, over the current screen. */
  open: boolean
  /** Opens it; `text` waits in the composer, ready to send or edit; `record` starts a voice note. */
  show(options?: { text?: string; record?: boolean }): void
  hide(): void
  /** A voice note to start as the conversation opens (taken once). */
  takeRecord(): boolean
  clear(): void
  screen: CoachScreen | undefined
  setScreen(screen: CoachScreen | undefined): void
}

const CoachContext = createContext<Coach | null>(null)

export function useCoach(): Coach {
  const c = useContext(CoachContext)
  if (!c) throw new Error('useCoach outside CoachProvider')
  return c
}

/**
 * Tells the coach where the athlete is while this screen is shown: what it reads in its prompt, the starters it
 * offers, whether the microphone comes first.
 */
export function useCoachScreen(screen: CoachScreen | undefined): void {
  const { setScreen } = useCoach()
  const key = screen ? JSON.stringify(screen) : ''
  useEffect(() => {
    setScreen(key ? (JSON.parse(key) as CoachScreen) : undefined)
    return () => setScreen(undefined)
  }, [key, setScreen])
}

/** The conversation lives in memory only: never stored, never exported, gone on reload. */
export function CoachProvider({ children }: { children: ReactNode }) {
  const [entries, setEntriesState] = useState<CoachEntry[]>([])
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const [record, setRecord] = useState(false)
  const [screen, setScreen] = useState<CoachScreen>()
  const setEntries = useCallback((fn: (e: CoachEntry[]) => CoachEntry[]) => setEntriesState(fn), [])
  const show = useCallback((options: { text?: string; record?: boolean } = {}) => {
    if (options.text) setDraft(options.text)
    setRecord(options.record === true)
    setOpen(true)
  }, [])
  const hide = useCallback(() => setOpen(false), [])
  const takeRecord = useCallback(() => {
    if (!record) return false
    setRecord(false)
    return true
  }, [record])
  const clear = useCallback(() => {
    setEntriesState([])
    setDraft('')
  }, [])
  const value = useMemo(
    () => ({ entries, setEntries, draft, setDraft, open, show, hide, takeRecord, clear, screen, setScreen }),
    [entries, setEntries, draft, open, show, hide, takeRecord, clear, screen],
  )
  return <CoachContext.Provider value={value}>{children}</CoachContext.Provider>
}
