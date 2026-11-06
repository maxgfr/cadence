/**
 * End-to-end encryption of a sync: AES-GCM under a 256-bit key that only exists in the pairing QR code, over the
 * gzipped payload. Whatever carries the bytes (a relay, the WebRTC link) sees only ciphertext.
 */

const IV_BYTES = 12

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')

function fromB64url(text: string): Uint8Array {
  const b64 = text.replaceAll('-', '+').replaceAll('_', '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

/** Random bytes as base64url: a pairing key (32 bytes) or a room id (16). */
export function randomToken(bytes: number): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)))
}

export const newPairingKey = () => randomToken(32)

/** Whether a text is a key `newPairingKey` could have made. */
export function isPairingKey(text: string): boolean {
  try {
    return /^[A-Za-z0-9_-]{43}$/.test(text) && fromB64url(text).length === 32
  } catch {
    return false
  }
}

const importKey = (key: string) =>
  crypto.subtle.importKey('raw', fromB64url(key) as Uint8Array<ArrayBuffer>, 'AES-GCM', false, ['encrypt', 'decrypt'])

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

/** Gzips, then encrypts: IV followed by the ciphertext. */
export async function seal(key: string, plain: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const packed = await pipe(plain, new CompressionStream('gzip'))
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await importKey(key), packed as Uint8Array<ArrayBuffer>),
  )
  const out = new Uint8Array(IV_BYTES + cipher.length)
  out.set(iv)
  out.set(cipher, IV_BYTES)
  return out
}

/** Decrypts and gunzips; throws when the key is wrong or the bytes were changed on the way. */
export async function open(key: string, sealed: Uint8Array): Promise<Uint8Array> {
  const iv = sealed.slice(0, IV_BYTES)
  const packed = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await importKey(key), sealed.slice(IV_BYTES)),
  )
  return pipe(packed, new DecompressionStream('gzip'))
}
