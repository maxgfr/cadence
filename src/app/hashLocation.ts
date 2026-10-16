import { useSyncExternalStore } from 'react'

/*
 * Hash routing with the query inside the hash (`#/history/abc?saved=1`). wouter's own hash hook writes the query
 * to `location.search`, outside the hash, where it outlives the screen that set it.
 */

const subscribe = (cb: () => void) => {
  addEventListener('hashchange', cb)
  return () => removeEventListener('hashchange', cb)
}

const hash = () => location.hash.replace(/^#?\/?/, '')
const currentPath = () => `/${hash().split('?')[0] ?? ''}`
const currentSearch = () => hash().split('?')[1] ?? ''

export function navigate(
  to: string,
  { replace = false, state = null }: { replace?: boolean; state?: unknown } = {},
): void {
  const oldURL = location.href
  const url = new URL(oldURL)
  url.hash = to.startsWith('/') ? to : `/${to}`
  history[replace ? 'replaceState' : 'pushState'](state, '', url.href)
  dispatchEvent(new HashChangeEvent('hashchange', { oldURL, newURL: url.href }))
}

export function useHashLocation(): [string, typeof navigate] {
  return [useSyncExternalStore(subscribe, currentPath, () => '/'), navigate]
}
useHashLocation.hrefs = (href: string) => `#${href}`

export function useHashSearch(): string {
  return useSyncExternalStore(subscribe, currentSearch, () => '')
}
