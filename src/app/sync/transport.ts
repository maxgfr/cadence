import type { Channel, Pairing } from '../../core/sync/protocol.ts'

/**
 * The link between the two devices: WebRTC, found through public Nostr relays (Trystero). The relays only carry the
 * connection offer, itself encrypted with the pairing key; the data then goes device to device, and is sealed with
 * that key before it leaves (see `core/sync/crypto.ts`). Loaded only by the sync screen.
 */

export interface Link {
  channel: Channel
  close(): Promise<void>
}

/** A test can put its own transport here (two browser contexts relayed by the test runner). */
interface TestTransport {
  connect(room: string): Promise<Channel>
}
declare global {
  var __cadenceSyncTransport: TestTransport | undefined
}

/** Bytes waiting for `receive`, or `receive` waiting for bytes. */
function mailbox() {
  const inbox: Uint8Array[] = []
  const waiting: ((b: Uint8Array) => void)[] = []
  return {
    push(b: Uint8Array) {
      const w = waiting.shift()
      if (w) w(b)
      else inbox.push(b)
    },
    receive: () =>
      new Promise<Uint8Array>((resolve) => {
        const b = inbox.shift()
        if (b) resolve(b)
        else waiting.push(resolve)
      }),
  }
}

/** Joins the pairing's room and resolves once the other device is there; rejects on `signal`. */
export async function connect(p: Pairing, signal: AbortSignal): Promise<Link> {
  const test = globalThis.__cadenceSyncTransport
  if (test) return { channel: await test.connect(p.room), close: async () => {} }

  const { joinRoom } = await import('trystero/nostr')
  const room = joinRoom({ appId: 'cadence-sync-1', password: p.key }, p.room)
  const box = mailbox()
  const action = room.makeAction<Uint8Array>('snapshot')
  let peer: string | undefined
  action.onMessage = (data, { peerId }) => {
    // The first device to show up is the one we sync with; a message can come before its join is seen here.
    peer ??= peerId
    if (peerId === peer) box.push(data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer))
  }
  const close = () => room.leave()
  try {
    peer = await new Promise<string>((resolve, reject) => {
      if (signal.aborted) reject(signal.reason)
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      room.onPeerJoin = (id) => resolve(peer ?? id)
    })
  } catch (e) {
    await close()
    throw e
  }
  const target = peer
  return {
    channel: {
      send: (bytes) => {
        action.send(bytes, { target })
      },
      receive: box.receive,
    },
    close,
  }
}
