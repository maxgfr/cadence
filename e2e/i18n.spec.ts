import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import { type Locale, messagesFor } from '../src/core/i18n/index.ts'

/** No serious or critical accessibility violation, and nothing wider than the screen or cut in the tab bar. */
async function check(page: Page, screen: string) {
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
  expect(bad.map((v) => `${screen}: ${v.id} ${v.nodes.map((n) => n.target.join(' ')).join('; ')}`)).toEqual([])
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow, `${screen}: horizontal scroll`).toBeLessThanOrEqual(0)
  // Labels of controls stay whole: a tab, button or segment whose text is wider than its box is cut.
  const cut = await page.evaluate(() =>
    [...document.querySelectorAll('nav a span, button, [role="radio"] + span, label')]
      .filter(
        (el) =>
          el instanceof HTMLElement &&
          el.offsetParent !== null &&
          !el.classList.contains('sr-only') &&
          el.scrollWidth > el.clientWidth + 1,
      )
      .map((el) => el.textContent?.trim()),
  )
  expect(cut, `${screen}: cut labels`).toEqual([])
  // Tab labels stay on one line (they would break, hyphenated, rather than overflow).
  const wrapped = await page.evaluate(() =>
    [...document.querySelectorAll('nav a span')]
      .filter((el) => el instanceof HTMLElement && el.offsetParent !== null)
      .filter((el) => el.getBoundingClientRect().height > Number.parseFloat(getComputedStyle(el).lineHeight) * 1.5)
      .map((el) => el.textContent?.trim()),
  )
  expect(wrapped, `${screen}: tab labels on two lines`).toEqual([])
}

for (const locale of ['fr', 'de'] as const satisfies readonly Locale[]) {
  test.describe(`${locale} interface`, () => {
    test.use({ locale: locale === 'fr' ? 'fr-FR' : 'de-DE' })
    const t = messagesFor(locale)

    test('follows the system language, from the demo to a logged set', async ({ page, isMobile }) => {
      // The narrowest phones in use.
      if (isMobile) await page.setViewportSize({ width: 360, height: 740 })
      await page.goto('./')
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      await check(page, 'welcome')
      await page.getByRole('checkbox', { name: new RegExp(`^${t.demo.disciplines.gym}`) }).check()
      await page.getByRole('button', { name: t.welcome.startDemo }).click()

      await expect(page.getByRole('heading', { name: t.today.newSession })).toBeVisible()
      await check(page, 'today')
      for (const path of ['programs', 'progress', 'exercises', 'settings']) {
        await page.goto(`./#/${path}`)
        await check(page, path)
      }

      // Logging: the demo's exercises in the language, and decimals with a comma.
      await page.goto('./')
      await page
        .getByRole('button', { name: new RegExp(`^${t.demo.days.fullBodyA}`) })
        .first()
        .click()
      const squat = t.demo.exercises['back-squat']
      const weight = page.getByLabel(t.log.setField(squat, 1, 'kg'))
      await weight.fill('82,5')
      await weight.blur()
      await expect(weight).toHaveValue('82,5')
      await check(page, 'log')
    })

    test('the language can be changed in Settings, and back to the system one', async ({ page }) => {
      await page.goto('./')
      await page.getByRole('button', { name: t.welcome.startEmpty }).click()
      await page.goto('./#/settings')
      const en = messagesFor('en')
      await page.getByRole('combobox', { name: t.settings.language }).selectOption({ label: 'English' })
      await expect(page.getByRole('heading', { name: en.settings.title, level: 1 })).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('lang', 'en')
      await page
        .getByRole('combobox', { name: en.settings.language })
        .selectOption({ label: en.settings.languageSystem })
      await expect(page.getByRole('heading', { name: t.settings.title, level: 1 })).toBeVisible()
    })
  })
}
