import type { VitePWAOptions } from 'vite-plugin-pwa'

/**
 * Service worker, precache and manifest. Only the app's own files are cached, never an API response: the precache,
 * plus the speech runtime when first used.
 */
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
      globIgnores: ['**/apple-splash-*.png', '**/transcribe.worker-*.js'],
      maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      navigateFallback: 'index.html',
      cleanupOutdatedCaches: true,
      // The on-device speech model's runtime (onnxruntime WebAssembly, an app file of ~30 MB): too big to precache
      // for everyone, so it is kept the first time a voice note is transcribed on the device, then works offline.
      runtimeCaching: [
        {
          urlPattern: ({ url, sameOrigin }) =>
            sameOrigin && /\/assets\/(ort-wasm[^/]*\.wasm|transcribe\.worker-[^/]*\.js)$/.test(url.pathname),
          handler: 'CacheFirst',
          options: { cacheName: 'cadence-speech-runtime', expiration: { maxEntries: 4 } },
        },
      ],
    },
  }
}
