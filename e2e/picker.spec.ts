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

test('while the picker is open, the page behind it does not scroll', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('checkbox', { name: /^Gym/ }).check()
  await page.getByRole('button', { name: 'Start with the demo' }).click()
  await page.getByRole('button', { name: /^Gym/ }).click()
  await page.getByRole('heading', { name: 'Add your first exercise' }).waitFor()
  // A page long enough to scroll, and the wheel scrolls it before the sheet opens.
  await page.evaluate(() => {
    const room = document.createElement('div')
    room.style.height = '3000px'
    document.body.append(room)
  })
  const scrolled = () => page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)
  const viewport = page.viewportSize() ?? { width: 400, height: 800 }
  await page.mouse.move(viewport.width / 2, viewport.height / 2)
  await page.mouse.wheel(0, 200)
  await expect.poll(scrolled).toBeGreaterThan(0)
  await page.evaluate(() => document.scrollingElement?.scrollTo(0, 0))

  await page.getByRole('button', { name: 'Add exercise' }).first().click()
  const sheet = page.getByRole('dialog', { name: 'Add exercise' })
  await sheet.evaluate((d) => Promise.all(d.getAnimations().map((a) => a.finished)))
  const box = await sheet.boundingBox()
  if (!box) throw new Error('the sheet has no box')
  // Over the sheet, past the end of its results, then over the dimmed page around it.
  for (const [x, y] of [
    [box.x + box.width / 2, box.y + box.height / 2],
    [8, 8],
  ] as const) {
    await page.mouse.move(x, y)
    for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 800)
  }
  await page.waitForTimeout(300)
  expect(await scrolled()).toBe(0)
})
