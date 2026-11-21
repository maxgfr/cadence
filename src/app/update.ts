import type { UpdateHost } from '../core/update/update.ts'

const sw = typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker : undefined

/**
 * The worker controlling the page when the app started. The service worker skips waiting by itself
 * (`registerType: 'autoUpdate'`), so a newer one can take over in the background while the page keeps its old code.
 */
const controllerAtLoad = sw?.controller ?? null

/** The browser's service worker, for `checkForUpdate`. */
export const browserUpdateHost: UpdateHost = {
  registration: async () => (sw ? await sw.getRegistration() : undefined),
  online: () => navigator.onLine,
  replacedSinceLoad: () => controllerAtLoad !== null && sw?.controller != null && sw.controller !== controllerAtLoad,
  controllerChange: () =>
    new Promise<void>((resolve) => sw?.addEventListener('controllerchange', () => resolve(), { once: true })),
  sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  reload: () => window.location.reload(),
}
