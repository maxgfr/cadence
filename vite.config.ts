import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { pwaOptions } from './pwa.config.ts'

const base = process.env.VITE_BASE ?? '/cadence/'

/** Runs a git command; null where git or the answer is unavailable (a source tarball, a shallow clone). */
function git(args: string): string | null {
  try {
    const out = execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
    return out || null
  } catch {
    return null
  }
}

/** The release built: CI's `APP_VERSION` (from the semantic-release tag), else the latest tag, else `0.0.0-dev`. */
const version = process.env.APP_VERSION || git('describe --tags --abbrev=0')?.replace(/^v/, '') || '0.0.0-dev'
/** The short commit built: CI's `GITHUB_SHA`, else git's HEAD, else `dev`. */
const commit = process.env.GITHUB_SHA?.slice(0, 7) || git('rev-parse --short HEAD') || 'dev'

export default defineConfig({
  base,
  // What Settings › About shows as this build (src/app/buildInfo.ts).
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(commit),
  },
  plugins: [react(), VitePWA(pwaOptions(base))],
  build: { target: 'es2022' },
})
