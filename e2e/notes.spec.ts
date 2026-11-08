import { expect, type Page, test } from '@playwright/test'

async function startWithGym(page: Page) {
  await page.goto('./')
  await page.getByRole('checkbox', { name: /^Gym/ }).check()
  await page.getByRole('button', { name: 'Start with the demo' }).click()
  await expect(page.getByRole('heading', { name: 'New session' })).toBeVisible()
}

test('notes are written, changed and deleted, from Today', async ({ page }) => {
  await startWithGym(page)
  await page
    .getByRole('link', { name: /^Notes/ })
    .last()
    .click()
  await expect(page.getByRole('heading', { name: 'Notes' })).toBeVisible()

  await page.getByLabel('New note').fill('Leg press seat at 4')
  await page.getByRole('button', { name: 'Add note' }).click()
  const note = page.getByRole('button', { name: /^Leg press seat at 4/ })
  await expect(note).toBeVisible()
  await expect(page.getByLabel('New note')).toHaveValue('')

  // It is kept across a reload, and Today shows the latest.
  await page.reload()
  await note.click()
  await page.getByRole('dialog').getByLabel('Note').fill('Leg press seat at 5')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Leg press seat at 5/ })).toBeVisible()
  await page.goto('./#/')
  await expect(page.getByRole('link', { name: /Leg press seat at 5/ })).toBeVisible()

  await page.goto('./#/notes')
  await page.getByRole('button', { name: /^Leg press seat at 5/ }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Leg press seat at 5/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('button', { name: /^Leg press seat at 5/ })).toBeVisible()
})

test('an exercise has its own description and notes, read while training', async ({ page }) => {
  await startWithGym(page)
  await page.goto('./#/exercises')
  await page.getByRole('button', { name: /^Back squat/ }).click()
  await page.getByLabel('Description').fill('Brace, then sit between the hips.')
  await page.getByLabel('My notes').fill('Wider stance feels better')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Exercise saved')).toBeVisible()

  await page.goto('./')
  await page
    .getByRole('button', { name: /^Full body A/ })
    .first()
    .click()
  await page.getByText('Description and notes').first().click()
  await expect(page.getByText('Brace, then sit between the hips.')).toBeVisible()
  await expect(page.getByText('Wider stance feels better')).toBeVisible()
})
