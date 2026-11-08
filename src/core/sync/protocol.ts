import { z } from 'zod'
import { BACKUP_VERSION, type Backup } from '../model/schemas.ts'
import { parseBackup } from '../storage/backup.ts'
import { isPairingKey, open, randomToken, seal } from './crypto.ts'
import { type MergeResult, mergeSnapshots } from './merge.ts'

/**
 * A sync between two devices. Each sends its whole snapshot, sealed with the pairing key; each merges the other's
 * into its own (the merge is symmetric, so both end with the same data) and applies it. The AI settings travel only
 * when the sender includes them, and are taken only by a device that has none.
 */

export const SYNC_PROTOCOL = 1

/**
 * The device's AI settings as they are stored (device-only secrets), sent only end-to-end encrypted. `savedAt` dates
 * them: the most recently saved win, like every record (none, from an older app, is the oldest).
 */
export const AiSecrets = z.object({ config: z.string(), key: z.string(), savedAt: z.string().optional() })
export type AiSecrets = z.infer<typeof AiSecrets>

const Envelope = z.object({
  app: z.literal('cadence-sync'),
  protocol: z.number(),
  backupVersion: z.number(),
  backup: z.unknown(),
  ai: AiSecrets.optional(),
  syncedAt: z.string().optional(),
})

export interface SyncPayload {
  backup: Backup
  ai?: AiSecrets
  /** When the sender last completed a sync: what it changed after that is new to the other device. */
  syncedAt?: string
}

export class SyncError extends Error {
  constructor(readonly code: 'version' | 'damaged' | 'timeout' | 'closed') {
    super(code)
  }
}

export async function sealPayload(key: string, p: SyncPayload): Promise<Uint8Array> {
  const envelope = {
    app: 'cadence-sync',
    protocol: SYNC_PROTOCOL,
    backupVersion: BACKUP_VERSION,
    backup: p.backup,
    ...(p.ai ? { ai: p.ai } : {}),
    ...(p.syncedAt ? { syncedAt: p.syncedAt } : {}),
  }
  return seal(key, new TextEncoder().encode(JSON.stringify(envelope)))
}

export async function openPayload(key: string, bytes: Uint8Array): Promise<SyncPayload> {
  let raw: unknown
  try {
    raw = JSON.parse(new TextDecoder().decode(await open(key, bytes)))
  } catch {
    throw new SyncError('damaged')
  }
  const e = Envelope.safeParse(raw)
  if (!e.success) throw new SyncError('damaged')
  if (e.data.protocol !== SYNC_PROTOCOL || e.data.backupVersion !== BACKUP_VERSION) throw new SyncError('version')
  try {
    const backup = parseBackup(JSON.stringify(e.data.backup))
    return {
      backup,
      ...(e.data.ai ? { ai: e.data.ai } : {}),
      ...(e.data.syncedAt ? { syncedAt: e.data.syncedAt } : {}),
    }
  } catch {
    throw new SyncError('damaged')
  }
}

// ——— Pairing ———

export interface Pairing {
  /** Where the two devices meet: random, used once. */
  room: string
  /** The end-to-end key; it never leaves the QR code and the two devices. */
  key: string
}

export const newPairing = (key: string): Pairing => ({ room: randomToken(16), key })

/** The link the QR code holds: opening it on the other device starts the sync there. */
export function pairingLink(appUrl: string, p: Pairing): string {
  return `${appUrl.split('#')[0]}#/sync?r=${p.room}&k=${p.key}`
}

/** A pairing from a scanned or pasted link (or its query alone); undefined when it is not one. */
export function parsePairing(text: string): Pairing | undefined {
  const query = text.trim().split('?')[1]
  if (!query) return undefined
  const params = new URLSearchParams(query)
  const room = params.get('r') ?? ''
  const key = params.get('k') ?? ''
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(room) || !isPairingKey(key)) return undefined
  return { room, key }
}

// ——— The exchange ———

/** What carries bytes between the two devices (WebRTC in the app, memory in tests). */
export interface Channel {
  send(bytes: Uint8Array): void
  /** Resolves with the other device's bytes. */
  receive(): Promise<Uint8Array>
}

export interface SyncSide {
  /** This device's snapshot, read when the other device is there. */
  snapshot(): Promise<SyncPayload>
  /** Writes the merged data (and the other device's AI settings, when this one takes them). */
  apply(merged: Backup, ai: AiSecrets | undefined): Promise<void>
}

export interface SyncOutcome extends MergeResult {
  /** The other device's AI settings were taken. */
  tookAi: boolean
}

/** The AI settings this device takes: the other's, when it has none or theirs were saved later. */
export function newerAi(mine: AiSecrets | undefined, theirs: AiSecrets | undefined): AiSecrets | undefined {
  if (!theirs) return undefined
  if (!mine) return theirs
  return (theirs.savedAt ?? '') > (mine.savedAt ?? '') ? theirs : undefined
}

/** One sync over a channel: send ours, receive theirs, merge, apply: everything, the AI settings included. */
export async function runSync(channel: Channel, key: string, side: SyncSide, now = new Date()): Promise<SyncOutcome> {
  const mine = await side.snapshot()
  channel.send(await sealPayload(key, mine))
  const theirs = await openPayload(key, await channel.receive())
  const result = mergeSnapshots(mine.backup, theirs.backup, now, { local: mine.syncedAt, remote: theirs.syncedAt })
  const ai = newerAi(mine.ai, theirs.ai)
  await side.apply(result.merged, ai)
  return { ...result, tookAi: ai !== undefined }
}
