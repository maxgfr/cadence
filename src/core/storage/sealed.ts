import { openDB } from 'idb'

/**
 * Secrets at rest: AES-GCM under a non-extractable CryptoKey, with a fresh IV on every write.
 *
 * The key lives in its own IndexedDB database and cannot be read out of the browser, so a dump of the site's
 * storage (or of the disk) holds only opaque bytes. maxgfr.github.io is one origin shared by many apps, and code
 * running on it can still ask the browser to decrypt: this keeps keys out of clear text, not out of reach of the
 * origin.
 */
export interface Sealed {
  v: 1
  iv: Uint8Array
  data: ArrayBuffer
}

export interface Sealer {
  seal(text: string): Promise<Sealed>
  /** Throws when the value was not sealed by this key (or was altered). */
  open(sealed: Sealed): Promise<string>
}

export function isSealed(value: unknown): value is Sealed {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Partial<Sealed>
  return v.v === 1 && v.iv instanceof Uint8Array && v.data instanceof ArrayBuffer
}

const KEY_STORE = 'keys'
const KEY_ID = 'secrets'

/** Opens (or creates, once) the key kept in the database `dbName`. */
export async function openSealer(dbName: string): Promise<Sealer> {
  const db = await openDB(dbName, 1, {
    upgrade(d) {
      d.createObjectStore(KEY_STORE)
    },
  })
  let key = (await db.get(KEY_STORE, KEY_ID)) as CryptoKey | undefined
  if (!key) {
    const created = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    try {
      // `add`, not `put`: when two tabs race, the first key stored is the one both keep.
      await db.add(KEY_STORE, created, KEY_ID)
      key = created
    } catch {
      key = (await db.get(KEY_STORE, KEY_ID)) as CryptoKey | undefined
      if (!key) throw new Error('The encryption key could not be stored.')
    }
  }
  const k = key
  return {
    async seal(text) {
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(text))
      return { v: 1, iv, data }
    },
    async open(sealed) {
      const iv = sealed.iv as Uint8Array<ArrayBuffer>
      return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, k, sealed.data))
    },
  }
}
