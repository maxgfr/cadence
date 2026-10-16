import { useSyncExternalStore } from 'react'

/*
 * Hash routing with the query inside the hash (`#/progress/sessions/abc?saved=1`). wouter's own hash hook writes the query
 * to `location.search`, outside the hash, where it outlives the screen that set it.
 */

const subscribe = (cb: () => void) => {
  addEventListener('hashchange', cb)
  return () => removeEventListener('hashchange', cb)
}

const hash = () => location.hash.replace(/^#?\/?/, '')
const currentPath = () => `/${hash().split('?')[0] ?? ''}`
const currentSearch = () => hash().split('?')[1] ?? ''

/** The tab a path belongs to: its first segment ("/programs/abc" → "/programs", "/" → "/"). */
export function sectionOf(path: string): string {
  return `/${path.split('?')[0]?.split('/')[1] ?? ''}`
}

/**
 * The in-app location this history entry was opened from (path and query), kept in the entry's state: pushing a
 * screen records where it came from, replacing it keeps that. Undefined for an entry opened from outside the app.
 */
export function cameFrom(): string | undefined {
  const from = (history.state as { from?: unknown } | null)?.from
  return typeof from === 'string' ? from : undefined
}

export function navigate(to: string, { replace = false }: { replace?: boolean; state?: unknown } = {}): void {
  const oldURL = location.href
  const url = new URL(oldURL)
  url.hash = to.startsWith('/') ? to : `/${to}`
  const here = `/${hash()}`
  const from = replace ? cameFrom() : here
  history[replace ? 'replaceState' : 'pushState'](from !== undefined ? { from } : null, '', url.href)
  dispatchEvent(new HashChangeEvent('hashchange', { oldURL, newURL: url.href }))
}

export function useHashLocation(): [string, typeof navigate] {
  return [useSyncExternalStore(subscribe, currentPath, () => '/'), navigate]
}
useHashLocation.hrefs = (href: string) => `#${href}`

export function useHashSearch(): string {
  return useSyncExternalStore(subscribe, currentSearch, () => '')
}
