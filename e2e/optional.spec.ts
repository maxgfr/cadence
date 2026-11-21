import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'

/** No serious or critical accessibility violation on the current screen. */
async function accessible(page: Page, screen: string) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY)
        .map((a) => a.finished.catch(() => undefined)),
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

test('optional exercises are offered beside the session, and one added becomes an entry', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Start empty' }).click()
  await page.goto('./#/settings/presets')
  await page.getByRole('checkbox', { name: /^Gym/ }).check()
  await page.getByRole('button', { name: 'Add to my library' }).click()
  await expect(page.getByText(/exercises and 4 programs added/)).toBeVisible()

  // The program marks its optional exercises, in their place at the end of the day.
  await page.goto('./#/programs')
  await page.getByRole('link', { name: /^Push Pull Legs/ }).click()
  const shrug = page.getByRole('button', { name: /^Shrug\s*Optional/ })
  await expect(shrug).toBeVisible()
  await expect(page.getByRole('button', { name: /^Overhead triceps extension\s*Optional/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Leg press\s*Optional/ })).toHaveCount(0)
  await accessible(page, 'program with optional blocks')

  // The Pull session starts with its required exercises; the optional ones are offered after them.
  await page
    .locator('li')
    .filter({ has: shrug })
    .getByRole('button', { name: /^Start/ })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Pull' })).toBeVisible()
  await expect(page.getByText('0 of 23 sets')).toBeVisible()
  await expect(page.getByRole('article', { name: 'Shrug' })).toHaveCount(0)
  const offered = page.getByRole('region', { name: 'Optional' })
  await expect(offered.getByText('Shrug', { exact: true })).toBeVisible()
  await expect(offered.getByText('2×10').first()).toBeVisible()
  await expect(offered.getByRole('button', { name: /to the session$/ })).toHaveCount(3)
  await accessible(page, 'log with optional exercises')

  // One tap: the shrug is an entry, pre-filled from its plan, and leaves the offer.
  await offered.getByRole('button', { name: 'Add Shrug to the session' }).click()
  const entry = page.getByRole('article', { name: 'Shrug' })
  await expect(entry).toBeVisible()
  await expect(entry.getByText('Plan 2×10')).toBeVisible()
  await expect(page.getByText('0 of 25 sets')).toBeVisible()
  await expect(offered.getByText('Shrug', { exact: true })).toHaveCount(0)
  await expect(offered.getByRole('button', { name: /to the session$/ })).toHaveCount(2)

  // It is stored with the session; the others still wait.
  await page.reload()
  await expect(page.getByRole('article', { name: 'Shrug' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Optional' }).getByText('Hammer curl', { exact: true })).toBeVisible()
})

test('a planned exercise can be made optional in the editor', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Start empty' }).click()
  await page.goto('./#/settings/presets')
  await page.getByRole('checkbox', { name: /^Gym/ }).check()
  await page.getByRole('button', { name: 'Add to my library' }).click()
  await expect(page.getByText(/exercises and 4 programs added/)).toBeVisible()

  await page.goto('./#/programs')
  await page.getByRole('link', { name: /^Push Pull Legs/ }).click()
  await page.getByRole('button', { name: /^Cable curl/ }).click()
  const sheet = page.getByRole('dialog')
  const optional = sheet.getByRole('checkbox', { name: /^Optional/ })
  await expect(optional).not.toBeChecked()
  await optional.check()
  await sheet.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Cable curl\s*Optional/ })).toBeVisible()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Program saved')).toBeVisible()
})
