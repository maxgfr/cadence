import { expect, test } from '@playwright/test'

test('the rest is set per sport and per exercise, no longer in Settings', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('checkbox', { name: /^Gym/ }).check()
  await page.getByRole('button', { name: 'Start with the demo' }).click()
  await expect(page.getByRole('heading', { name: 'New session' })).toBeVisible()

  await page.goto('./#/settings')
  await expect(page.getByLabel('Rest timer')).toHaveCount(0)

  // Gym rests 2:00 between sets.
  await page.goto('./#/exercises')
  await page.getByRole('button', { name: /^Gym/ }).first().click()
  await page.getByLabel('Rest between sets').selectOption({ label: '2:00' })
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Gym.*Rest 2:00/ })).toBeVisible()

  // An exercise added mid-session, with no plan, rests as its sport.
  await page.goto('./')
  await page
    .getByRole('button', { name: /^Full body A/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Pull-up/ })
    .click()
  await expect(page.getByRole('button', { name: 'Rest 2:00 after Pull-up' })).toBeVisible()
  // A planned rest still wins.
  await expect(page.getByRole('button', { name: /^Rest 3:00 after Back squat$/ })).toBeVisible()

  // The exercise's own rest wins over its sport's.
  const session = page.url()
  await page.goto('./#/exercises')
  await page.getByRole('button', { name: /^Pull-up/ }).click()
  await page.getByLabel('Rest between sets').selectOption({ label: '0:45' })
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.goto(session)
  await expect(page.getByRole('button', { name: 'Rest 0:45 after Pull-up' })).toBeVisible()
})
