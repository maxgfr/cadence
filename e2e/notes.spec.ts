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
  await page.getByLabel('Description').fill('Brace, then sit between the hips.\nhttps://example.com/squat-rack')
  await expect(page.getByRole('dialog').getByRole('link', { name: 'https://example.com/squat-rack' })).toBeVisible()
  await page.getByLabel('My notes').fill('Wider stance feels better')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Exercise saved')).toBeVisible()

  await page.goto('./')
  await page
    .getByRole('button', { name: /^Full body A/ })
    .first()
    .click()
  await page.getByText('Details').first().click()
  await expect(page.getByText('Brace, then sit between the hips.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'https://example.com/squat-rack' })).toHaveAttribute(
    'href',
    'https://example.com/squat-rack',
  )
  await expect(page.getByText('Wider stance feels better')).toBeVisible()
})

/** A red pixel. */
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='

test('an exercise keeps a photo of its machine, made small, and shows it while training', async ({ page }) => {
  await startWithGym(page)
  await page.goto('./#/exercises')
  await page.getByRole('button', { name: /^Back squat/ }).click()
  const dialog = page.getByRole('dialog')

  // What is not an image says so, and nothing is kept.
  await dialog
    .getByLabel('Add a photo')
    .setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') })
  await expect(dialog.getByRole('alert')).toHaveText('This image could not be read. Try a JPEG or a PNG.')

  await dialog
    .getByLabel('Add a photo')
    .setInputFiles({ name: 'machine.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') })
  const preview = dialog.getByRole('img', { name: 'Photo of Back squat' })
  await expect(preview).toHaveAttribute('src', /^data:image\/jpeg;base64,/)
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Exercise saved')).toBeVisible()

  // It survives a reload, and is there during the session.
  await page.reload()
  await page.goto('./')
  await page
    .getByRole('button', { name: /^Full body A/ })
    .first()
    .click()
  await page.getByText('Details').first().click()
  await expect(page.getByRole('img', { name: 'Photo of Back squat' })).toBeVisible()

  // Removing it holds once saved.
  await page.goto('./#/exercises')
  await page.getByRole('button', { name: /^Back squat/ }).click()
  await page.getByRole('button', { name: 'Remove the photo' }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('button', { name: /^Back squat/ }).click()
  await expect(page.getByRole('dialog').getByRole('img', { name: 'Photo of Back squat' })).toHaveCount(0)
})
