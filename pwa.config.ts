import type { VitePWAOptions } from 'vite-plugin-pwa'

/** Service worker, precache and manifest. Nothing from the network is cached at runtime: no API responses. */
export function pwaOptions(base: string): Partial<VitePWAOptions> {
  return {
    registerType: 'autoUpdate',
    injectRegister: 'auto',
    base,
    pwaAssets: { config: true, overrideManifestIcons: true },
    manifest: {
      id: './',
      name: 'Cadence',
      short_name: 'Cadence',
      description: 'Plan and log gym, swim and sprint training. Local-first.',
      start_url: './',
      scope: './',
      display: 'standalone',
      theme_color: '#f4f4f2',
      background_color: '#f4f4f2',
      launch_handler: { client_mode: 'focus-existing' },
      shortcuts: [
        { name: 'Today', url: './#/' },
        { name: 'Log a session', url: './#/log' },
        { name: 'Progress', url: './#/progress' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,json}'],
      globIgnores: ['**/apple-splash-*.png'],
      maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      navigateFallback: 'index.html',
      cleanupOutdatedCaches: true,
      runtimeCaching: [],
    },
  }
}
