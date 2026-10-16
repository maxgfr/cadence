import { defineConfig, devices } from '@playwright/test'

// E2E_PORT: another port when 4173 is taken by something else.
const port = Number(process.env.E2E_PORT ?? 4173)
const base = process.env.VITE_BASE ?? '/cadence/'

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: { baseURL: `http://localhost:${port}${base}` },
  webServer: {
    command: `bunx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}${base}`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium-phone', use: { ...devices['Pixel 7'] } },
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } } },
  ],
})
