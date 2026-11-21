import { describe, expect, test } from 'bun:test'
import { checkForUpdate, UPDATE_TIMEOUT_MS, type UpdateHost, type UpdateRegistration } from './update.ts'

interface Fake {
  host: UpdateHost
  statuses: string[]
  reloads: () => number
  messages: unknown[]
  slept: number[]
}

/** A browser whose service worker answers as asked; `found` is the worker `update()` turns up, if any. */
function fake(opts: {
  registration?: 'none' | 'throws'
  update?: 'ok' | 'offline'
  online?: boolean
  found?: 'installing' | 'waiting'
  replaced?: boolean
  takesControl?: boolean
  timesOut?: boolean
}): Fake {
  const statuses: string[] = []
  const messages: unknown[] = []
  const slept: number[] = []
  let reloads = 0
  let takeControl = () => {}
  const controlled = new Promise<void>((resolve) => {
    takeControl = resolve
  })
  const registration: UpdateRegistration & { installing: unknown; waiting: UpdateRegistration['waiting'] } = {
    installing: null,
    waiting: null,
    async update() {
      if (opts.update === 'offline') throw new TypeError('Failed to fetch')
      if (opts.found === 'installing') registration.installing = {}
      if (opts.found === 'waiting') registration.waiting = { postMessage: (m) => messages.push(m) }
      if (opts.takesControl) queueMicrotask(takeControl)
    },
  }
  const host: UpdateHost = {
    async registration() {
      if (opts.registration === 'throws') throw new Error('SecurityError')
      return opts.registration === 'none' ? undefined : registration
    },
    online: () => opts.online ?? true,
    replacedSinceLoad: () => opts.replaced ?? false,
    controllerChange: () => controlled,
    sleep: (ms) => {
      slept.push(ms)
      return opts.timesOut ? Promise.resolve() : new Promise(() => {})
    },
    reload: () => {
      reloads++
    },
  }
  return { host, statuses, reloads: () => reloads, messages, slept }
}

async function run(f: Fake) {
  return checkForUpdate(f.host, (s) => f.statuses.push(s))
}

describe('checking for a new version', () => {
  test('nothing new: checking, then up to date, no reload', async () => {
    const f = fake({})
    expect(await run(f)).toBe('upToDate')
    expect(f.statuses).toEqual(['checking', 'upToDate'])
    expect(f.reloads()).toBe(0)
  })

  test('no service worker (development, no support) or none reachable: could not check', async () => {
    for (const registration of ['none', 'throws'] as const) {
      const f = fake({ registration })
      expect(await run(f)).toBe('failed')
      expect(f.statuses).toEqual(['checking', 'failed'])
      expect(f.reloads()).toBe(0)
    }
  })

  test('offline: known to the device, or the update check rejects, could not check', async () => {
    for (const f of [fake({ online: false }), fake({ update: 'offline' })]) {
      expect(await run(f)).toBe('failed')
      expect(f.statuses).toEqual(['checking', 'failed'])
      expect(f.reloads()).toBe(0)
    }
  })

  test('a new worker installing: updating, and the page reloads once it takes control', async () => {
    const f = fake({ found: 'installing', takesControl: true })
    expect(await run(f)).toBe('updating')
    expect(f.statuses).toEqual(['checking', 'updating'])
    expect(f.reloads()).toBe(1)
  })

  test('a new worker waiting is told to skip waiting, then the page reloads on it', async () => {
    const f = fake({ found: 'waiting', takesControl: true })
    expect(await run(f)).toBe('updating')
    expect(f.messages).toEqual([{ type: 'SKIP_WAITING' }])
    expect(f.reloads()).toBe(1)
  })

  test('a new worker that never takes control: could not check, after the timeout, no reload', async () => {
    const f = fake({ found: 'installing', timesOut: true })
    expect(await run(f)).toBe('failed')
    expect(f.statuses).toEqual(['checking', 'updating', 'failed'])
    expect(f.slept).toEqual([UPDATE_TIMEOUT_MS])
    expect(f.reloads()).toBe(0)
  })

  test('a newer worker already took control since the page loaded: reload on it without checking, even offline', async () => {
    const f = fake({ replaced: true, online: false })
    expect(await run(f)).toBe('updating')
    expect(f.statuses).toEqual(['checking', 'updating'])
    expect(f.reloads()).toBe(1)
  })
})
