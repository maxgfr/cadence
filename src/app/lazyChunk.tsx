import { Component, type ComponentType, lazy, type ReactNode } from 'react'

const RELOADED = 'cadence:chunk-reload'

/**
 * A lazily loaded screen. After a new version is deployed, a page opened before it asks for chunk files that no
 * longer exist: the first such failure reloads the page onto the new version, once.
 */
export function lazyChunk<T extends ComponentType<object>>(load: () => Promise<T>) {
  return lazy(async () => {
    try {
      const c = await load()
      sessionStorage.removeItem(RELOADED)
      return { default: c }
    } catch (e) {
      let reloaded = true
      try {
        reloaded = sessionStorage.getItem(RELOADED) !== null
        if (!reloaded) sessionStorage.setItem(RELOADED, '1')
      } catch {
        // No storage: never risk a reload loop.
      }
      if (!reloaded) location.reload()
      throw e
    }
  })
}

/** Shows a way out instead of a blank page when a screen fails to render. */
export class ScreenBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div
        role="alert"
        style={{ display: 'grid', gap: '1rem', maxWidth: '30rem', margin: '4rem auto', padding: '0 1rem' }}
      >
        <h1 style={{ fontSize: 'var(--text-headline)' }}>This screen could not load</h1>
        <p style={{ color: 'var(--ink-2)' }}>
          Cadence may have just been updated, or the network dropped while it loaded. Your data is safe on this device.
        </p>
        <button
          type="button"
          onClick={() => location.reload()}
          style={{
            justifySelf: 'start',
            minHeight: '2.75rem',
            padding: '0 1rem',
            border: 0,
            borderRadius: 'var(--radius-control)',
            background: 'var(--accent)',
            color: 'var(--on-accent)',
            fontWeight: 600,
          }}
        >
          Reload
        </button>
      </div>
    )
  }
}
