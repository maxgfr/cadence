import { readFile } from 'node:fs/promises'
import { expect, type Page, test } from '@playwright/test'

/**
 * Two devices (two browser contexts: separate storage) synced through the app's own screens. The test runner carries
 * the bytes between them in place of WebRTC: what the app sends is already sealed with the pairing key.
 */
function relay(a: Page, b: Page) {
  let ready = 0
  let release: () => void = () => {}
  const both = new Promise<void>((r) => {
    release = r
  })
  const wire = async (from: Page, to: Page) => {
    await from.exposeFunction('__syncReady', async () => {
      ready++
      if (ready === 2) release()
      await both
    })
    await from.exposeFunction('__syncSend', async (b64: string) => {
      await to.evaluate((x) => (window as unknown as { __syncPush: (s: string) => void }).__syncPush(x), b64)
    })
    await from.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>
      const inbox: Uint8Array[] = []
      const waiting: ((b: Uint8Array) => void)[] = []
      w.__syncPush = (b64: string) => {
        const bin = atob(b64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        const next = waiting.shift()
        if (next) next(bytes)
        else inbox.push(bytes)
      }
      w.__cadenceSyncTransport = {
        connect: async () => {
          await (w.__syncReady as () => Promise<void>)()
          return {
            send: (bytes: Uint8Array) => {
              let bin = ''
              for (const x of bytes) bin += String.fromCharCode(x)
              ;(w.__syncSend as (s: string) => Promise<void>)(btoa(bin))
            },
            receive: () =>
              new Promise<Uint8Array>((resolve) => {
                const b = inbox.shift()
                if (b) resolve(b)
                else waiting.push(resolve)
              }),
          }
        },
      }
    })
  }
  return Promise.all([wire(a, b), wire(b, a)])
}

async function startWithDemo(page: Page, sport: RegExp) {
  await page.goto('./')
  await page.getByRole('checkbox', { name: sport }).check()
  await page.getByRole('button', { name: 'Start with the demo' }).click()
  await expect(page.getByRole('heading', { name: 'New session' })).toBeVisible()
}

test('two devices end with the same data, the AI settings included, never into a backup', async ({
  page: pc,
  browser,
  context,
}, testInfo) => {
  const phoneContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL })
  const phone = await phoneContext.newPage()
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await relay(pc, phone)

  // The PC: Gym, and AI set up with a key. The phone: Swimming, no AI.
  await startWithDemo(pc, /^Gym/)
  await pc.goto('./#/settings/ai')
  await pc.getByLabel('Provider').selectOption({ label: 'Custom endpoint (OpenAI-compatible)' })
  await pc.getByLabel('Endpoint address').fill('http://127.0.0.1:9/v1')
  await pc.getByLabel('Model').fill('mock')
  await pc.getByLabel('API key (optional)').fill('sk-sync-secret')
  await pc.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(pc.getByText('Saved.')).toBeVisible()
  await startWithDemo(phone, /^Swimming/)

  // The PC shows a code; the phone opens its link (as the camera would).
  await pc.goto('./#/settings')
  await pc.getByRole('link', { name: /^Sync with another device/ }).click()
  // Everything goes: nothing to tick.
  await expect(pc.getByRole('checkbox')).toHaveCount(0)
  await pc.getByRole('button', { name: /^Show a code/ }).click()
  await expect(pc.getByRole('img', { name: /^Pairing code/ })).toBeVisible()
  await expect(pc.getByText('Waiting for the other device…')).toBeVisible()
  await pc.getByRole('button', { name: 'Copy link' }).click()
  const link = await pc.evaluate(() => navigator.clipboard.readText())
  expect(link).toMatch(/#\/sync\?r=[\w-]+&k=[\w-]{43}$/)
  await phone.goto(`./#/sync?${link.split('?')[1]}`)

  for (const device of [pc, phone]) {
    await expect(device.getByText('Up to date')).toBeVisible()
  }
  await expect(phone.getByText('AI settings received from the other device.')).toBeVisible()

  // Both have both sports.
  for (const device of [pc, phone]) {
    await device.goto('./#/exercises')
    await expect(device.getByRole('button', { name: /^Back squat/ })).toBeVisible()
    await expect(device.getByRole('button', { name: /^Freestyle|^Free/ }).first()).toBeVisible()
  }

  // The phone now has the AI settings; its backup holds neither the key nor the endpoint.
  await phone.goto('./#/settings')
  await expect(phone.getByRole('link', { name: /AI program design.*mock/ })).toBeVisible()
  const downloading = phone.waitForEvent('download')
  await phone.getByRole('button', { name: /Export backup/ }).click()
  const backup = await readFile((await (await downloading).path()) ?? '', 'utf8')
  expect(backup).toContain('"version": 7')
  expect(backup).not.toContain('sk-sync-secret')
  expect(backup).not.toContain('127.0.0.1:9')
  await phoneContext.close()
})

/** The PC (Gym demo, AI set up) shows a code; its link, as the phone's camera would read it. */
async function showCode(pc: Page) {
  await startWithDemo(pc, /^Gym/)
  await pc.goto('./#/settings/ai')
  await pc.getByLabel('Provider').selectOption({ label: 'Custom endpoint (OpenAI-compatible)' })
  await pc.getByLabel('Endpoint address').fill('http://127.0.0.1:9/v1')
  await pc.getByLabel('Model').fill('mock')
  await pc.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(pc.getByText('Saved.')).toBeVisible()
  await pc.goto('./#/settings/sync')
  await pc.getByRole('button', { name: /^Show a code/ }).click()
  await pc.getByRole('button', { name: 'Copy link' }).click()
  return pc.evaluate(() => navigator.clipboard.readText())
}

test('a phone never set up opens the code from its camera: it syncs, then opens on the data', async ({
  page: pc,
  browser,
  context,
}, testInfo) => {
  const phoneContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL })
  const phone = await phoneContext.newPage()
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await relay(pc, phone)
  const link = await showCode(pc)

  // No welcome screen in the way: the link syncs right away.
  await phone.goto(`./#/sync?${link.split('?')[1]}`)
  await expect(phone.getByText('Up to date')).toBeVisible()
  await expect(phone.getByText('AI settings received from the other device.')).toBeVisible()
  await phone.getByRole('button', { name: 'Done' }).click()
  await expect(phone.getByRole('heading', { name: 'Today' })).toBeVisible()
  await phone.goto('./#/exercises')
  await expect(phone.getByRole('button', { name: /^Back squat/ })).toBeVisible()
  // The coach came with the AI settings.
  await expect(phone.getByRole('button', { name: 'Coach', exact: true })).toBeVisible()
  await phoneContext.close()
})

test('a device never set up can sync from the welcome screen instead', async ({
  page: pc,
  browser,
  context,
}, testInfo) => {
  const phoneContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL })
  const phone = await phoneContext.newPage()
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await relay(pc, phone)
  const link = await showCode(pc)

  await phone.goto('./')
  await phone.getByRole('button', { name: 'Already use Cadence on another device? Sync from it' }).click()
  await phone.getByRole('button', { name: /^Scan a code/ }).click()
  await phone.getByLabel(/link/i).fill(link)
  await phone.getByRole('button', { name: 'Sync', exact: true }).click()
  await expect(phone.getByText('Up to date')).toBeVisible()
  await phone.getByRole('button', { name: 'Done' }).click()
  await expect(phone.getByRole('heading', { name: 'Today' })).toBeVisible()
  await expect(phone.getByRole('heading', { name: 'Cadence' })).toHaveCount(0)
  await phoneContext.close()
})
