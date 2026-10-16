import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'

/** No serious or critical accessibility violation on the current screen. */
async function accessible(page: Page, screen: string) {
  // Colours are measured once entrances (toasts, sheets) have finished fading in.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY)
        .map((a) => a.finished),
    ),
  )
  const { violations } = await new AxeBuilder({ page }).analyze()
  const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(
    bad.map(
      (v) => `${screen}: ${v.id} ${v.nodes.map((n) => `${n.target.join(' ')} ${n.failureSummary ?? ''}`).join('; ')}`,
    ),
  ).toEqual([])
}

test('template → logged session → record and chart → backup round trip', async ({ page, isMobile }) => {
  await page.goto('./')

  // First run: mode and units.
  await expect(page.getByRole('heading', { name: 'Cadence' })).toBeVisible()
  await accessible(page, 'welcome')
  await page.getByRole('button', { name: 'Start training' }).click()

  // Today without a program teaches the next step.
  await expect(page.getByRole('heading', { name: 'No program yet' })).toBeVisible()
  await accessible(page, 'today (empty)')
  await page.getByRole('link', { name: 'Choose a program' }).click()

  // A template opens as a draft; saving makes it the current program.
  await page.getByRole('button', { name: /Beginner full body/ }).click()
  await expect(page.getByText('A copy of the template')).toBeVisible()
  await accessible(page, 'program draft')
  await page.getByRole('button', { name: 'Save program' }).click()
  await expect(page.getByText('saved and set as current')).toBeVisible()

  // Today shows the next session, pre-filled from the plan.
  await page.goto('./#/')
  await expect(page.getByRole('heading', { name: 'Full body A' })).toBeVisible()
  await accessible(page, 'today')
  await page.getByRole('button', { name: 'Start session' }).click()

  // Log two sets of squats.
  await expect(page.getByRole('heading', { name: 'Full body A · Week 1' })).toBeVisible()
  for (const [set, kg] of [
    [1, '80'],
    [2, '85'],
  ] as const) {
    await page.getByLabel(`Back squat, set ${set}, kg`).fill(kg)
    await page.getByRole('button', { name: `Back squat, set ${set} done` }).click()
  }
  await expect(page.getByRole('region', { name: 'Rest timer' })).toBeVisible()
  await accessible(page, 'log')
  await page.getByRole('button', { name: 'Skip rest' }).click()
  await page.getByRole('button', { name: 'Finish' }).click()
  await page.getByLabel('Duration (minutes)').fill('55')
  await page.getByRole('button', { name: /RPE 8/ }).click()
  await page.getByRole('button', { name: 'Save session' }).click()

  // The summary shows the record (85 kg × 5 → e1RM 99.2 kg).
  await expect(page.getByText('Session saved')).toBeVisible()
  await expect(page.getByRole('link', { name: /Back squat.*99\.2\skg/ })).toBeVisible()
  await accessible(page, 'session')

  // Progress: calendar, the exercise, the record.
  await page.goto('./#/progress')
  await expect(page.getByRole('img', { name: '1 training days in the last 16 weeks' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Records' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Back squat.*99\.2\skg/ })).toBeVisible()
  await accessible(page, 'progress')

  // Backup: export, erase, import, and the session is back.
  await page.goto('./#/settings')
  await accessible(page, 'settings')
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: /Export backup/ }).click()
  const file = await (await downloading).path()
  await page.getByRole('button', { name: 'Erase all training data…' }).click()
  await page.getByRole('button', { name: 'Erase everything' }).click()
  await expect(page.getByText('All training data erased')).toBeVisible()
  await page.goto('./#/history')
  await expect(page.getByRole('heading', { name: 'No session logged yet' })).toBeVisible()
  await page.goto('./#/settings')
  await page.getByLabel('Backup file').setInputFiles(file)
  await expect(page.getByText('Backup imported: 1 sessions, 1 programs')).toBeVisible()
  await page.goto('./#/history')
  await expect(page.getByRole('link', { name: /Full body A · Week 1/ })).toBeVisible()

  if (isMobile) {
    // Phones: the tab bar, no horizontal scroll.
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  }
})

test('advanced mode shows per-set effort; AI stays out of the way until set up', async ({ page }) => {
  await page.goto('./')
  await page.getByText('Advanced', { exact: true }).click()
  await page.getByRole('button', { name: 'Start training' }).click()
  await page.getByRole('button', { name: /Gym/ }).click()
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await page.getByRole('searchbox', { name: 'Search exercises' }).fill('bench')
  await page.getByRole('button', { name: 'Bench press' }).click()
  await expect(page.getByLabel('Bench press, set 1, RPE')).toBeVisible()
  await page.goto('./#/programs')
  await expect(page.getByRole('link', { name: /Design with AI \(optional\)/ })).toBeVisible()
  await page.goto('./#/programs/generate')
  await expect(page.getByRole('heading', { name: 'No AI model set up' })).toBeVisible()
})

test('once loaded, the app opens offline', async ({ page, context }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Start training' }).click()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  // The service worker precaches the shell on first visit.
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller)
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }))
    return reg.active?.state
  })
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  await page.goto('./#/progress')
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible()
  await context.setOffline(false)
})
