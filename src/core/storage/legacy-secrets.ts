import { openDB } from 'idb'

/**
 * Secrets as earlier versions stored them, in the `secrets` store of the app's database: clear text (the first
 * versions), then `{ v: 1, iv, data }` sealed under a CryptoKey kept in the database `<name>-keys`. Read-only: they
 * are moved to the sealed store (`llm-connect`'s `sealedStore`) and nothing is written in this layout any more.
 */
export interface LegacySealed {
  v: 1
  iv: Uint8Array
  data: ArrayBuffer
}

export function isLegacySealed(value: unknown): value is LegacySealed {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Partial<LegacySealed>
  return v.v === 1 && v.iv instanceof Uint8Array && v.data instanceof ArrayBuffer
}

const KEY_STORE = 'keys'
const KEY_ID = 'secrets'

/** The earlier key, or undefined when its database or the key is gone. Never creates either. */
async function legacyKey(keysDb: string): Promise<CryptoKey | undefined> {
  // Opening a database that does not exist would create it: look it up first where the browser can.
  const names = indexedDB.databases ? await indexedDB.databases().catch(() => undefined) : undefined
  if (names && !names.some((d) => d.name === keysDb)) return undefined
  const db = await openDB(keysDb)
  try {
    if (!db.objectStoreNames.contains(KEY_STORE)) return undefined
    return (await db.get(KEY_STORE, KEY_ID)) as CryptoKey | undefined
  } finally {
    db.close()
  }
}

/**
 * Opens one record of the earlier layout: its text, or undefined when it can never be read again (its key is gone,
 * or it was altered). Rejects when the key database could not be read this time, so the record is kept.
 */
export async function openLegacy(value: unknown, keysDb: string): Promise<string | undefined> {
  if (typeof value === 'string') return value
  if (!isLegacySealed(value)) return undefined
  const key = await legacyKey(keysDb)
  if (!key) return undefined
  try {
    const iv = value.iv as Uint8Array<ArrayBuffer>
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, value.data))
  } catch {
    // Sealed under another key (site data partly cleared): it has to be entered again.
    return undefined
  }
}

/** Removes the earlier key database. Its name is this app's own, so nothing else uses it. */
export function dropLegacyKeys(keysDb: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(keysDb)
      request.onsuccess = request.onerror = request.onblocked = () => resolve()
    } catch {
      resolve()
    }
  })
}
