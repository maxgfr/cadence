import { type DBSchema, openDB } from 'idb'

/**
 * Voice notes recorded without a network (the gym's basement): kept on this device until they can be sent, in a
 * database of their own. Never exported, never synced; deleted once sent or discarded.
 */
export interface PendingNote {
  id: string
  blob: Blob
  createdAt: string
  /** Where it was said: the coach, or the logging screen of a session. */
  sessionId?: string
}

interface VoiceDB extends DBSchema {
  notes: { key: string; value: PendingNote }
}

const db = () =>
  openDB<VoiceDB>('cadence-voice', 1, {
    upgrade(d) {
      d.createObjectStore('notes', { keyPath: 'id' })
    },
  })

export async function keepNote(note: PendingNote): Promise<void> {
  await (await db()).put('notes', note)
}

export async function pendingNotes(): Promise<PendingNote[]> {
  try {
    const all = await (await db()).getAll('notes')
    return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  } catch {
    return []
  }
}

export async function dropNote(id: string): Promise<void> {
  await (await db()).delete('notes', id)
}

/** A failure that means "no network": the note is kept rather than lost. */
export function isOffline(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const msg = e instanceof Error ? e.message : String(e)
  return /failed to fetch|network|load failed|offline/i.test(msg)
}
