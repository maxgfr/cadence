import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('adding an exercise finds related ones and presets, each with its illustration; only the results scroll', async ({
  page,
}) => {
  await page.goto('./')
  await page.getByRole('checkbox', { name: /^Gym/ }).check()
  await page.getByRole('button', { name: 'Start with the demo' }).click()
  await page.getByRole('button', { name: /^Gym/ }).click()
  await page.getByRole('button', { name: 'Add exercise' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add exercise' })
  const search = sheet.getByRole('searchbox', { name: 'Search exercises' })

  // A muscle group, typed in another language, brings what trains it.
  await search.fill('dos')
  const related = sheet.getByRole('region', { name: 'Related' })
  await expect(related.getByRole('button').first()).toBeVisible()

  // Nothing of theirs matches: the presets are open, ready to add with their drawing.
  await search.fill('high row')
  const presets = sheet.locator('details', { hasText: 'From the presets' })
  await expect(presets).toHaveAttribute('open', '')
  const highRow = presets.getByRole('button', { name: /^Machine high row/ })
  await expect(highRow.locator('svg[viewBox]').first()).toBeVisible()
  // Colours are measured once the sheet has finished fading in.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))))
  const { violations } = await new AxeBuilder({ page }).include('dialog').analyze()
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([])
  await highRow.click()
  await expect(page.getByRole('heading', { name: 'Machine high row' })).toBeVisible()
  await page.getByText('Details', { exact: true }).click()
  await expect(page.getByRole('img', { name: 'Illustration of Machine high row' })).toBeVisible()

  // The sheet keeps its height as the results narrow, and the search stays in place while they scroll.
  await page.getByRole('button', { name: 'Add exercise' }).first().click()
  await sheet.evaluate((d) => Promise.all(d.getAnimations().map((a) => a.finished)))
  const box = await sheet.boundingBox()
  await search.fill('zzz')
  expect((await sheet.boundingBox())?.height).toBe(box?.height)
  await search.fill('')
  const top = (await search.boundingBox())?.y
  await sheet.locator('[class*="results"]').evaluate((el) => el.scrollTo(0, el.scrollHeight))
  expect((await search.boundingBox())?.y).toBe(top)
})
