/** Where a check for a new version of the app stands, as Settings › About shows it. */
export type UpdateStatus = 'idle' | 'checking' | 'updating' | 'upToDate' | 'failed'

/** The parts of a service worker registration a check uses. */
export interface UpdateRegistration {
  /** A new worker being installed, after `update()` found one. */
  readonly installing: unknown
  /** A new worker installed and waiting for the old one to let go. */
  readonly waiting: { postMessage(message: unknown): void } | null
  /** Fetches the service worker again; rejects when it cannot (offline). */
  update(): Promise<unknown>
}

/** What a check needs from the browser, injected so the steps can be tested without one. */
export interface UpdateHost {
  /** The service worker registration of this page, or undefined when there is none (development, no support). */
  registration(): Promise<UpdateRegistration | undefined>
  /** False when the device knows it has no network: there is nothing to check against. */
  online(): boolean
  /** True when a newer worker already took control of this page since it loaded: the page runs the old code. */
  replacedSinceLoad(): boolean
  /** Resolves when another worker takes control of this page. */
  controllerChange(): Promise<void>
  sleep(ms: number): Promise<void>
  reload(): void
}

/** How long a new worker may take to install and take control before the check gives up. */
export const UPDATE_TIMEOUT_MS = 30_000

/**
 * Checks for a new version and, when there is one, lets it take control and reloads the page on it.
 * `onStatus` is told every step; the result is the last one. 'updating' ends in a reload.
 */
export async function checkForUpdate(
  host: UpdateHost,
  onStatus: (status: UpdateStatus) => void = () => {},
): Promise<UpdateStatus> {
  const done = (status: UpdateStatus): UpdateStatus => {
    onStatus(status)
    return status
  }
  onStatus('checking')
  let registration: UpdateRegistration | undefined
  try {
    registration = await host.registration()
  } catch {
    return done('failed')
  }
  if (!registration) return done('failed')
  // The new version is already on the device: reloading needs no network.
  if (host.replacedSinceLoad()) {
    onStatus('updating')
    host.reload()
    return 'updating'
  }
  if (!host.online()) return done('failed')
  // Listened to before the check: the new worker skips waiting and may take control as soon as it is installed.
  const changed = host.controllerChange().then(() => true)
  try {
    await registration.update()
  } catch {
    return done('failed')
  }
  if (!registration.installing && !registration.waiting) return done('upToDate')
  onStatus('updating')
  registration.waiting?.postMessage({ type: 'SKIP_WAITING' })
  const tookControl = await Promise.race([changed, host.sleep(UPDATE_TIMEOUT_MS).then(() => false)])
  if (!tookControl) return done('failed')
  host.reload()
  return 'updating'
}
