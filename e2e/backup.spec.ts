import { readFile } from 'node:fs/promises'
import { expect, type Page, test } from '@playwright/test'

async function startWithGymHistory(page: Page) {
  await page.goto('./')
  await page.getByRole('checkbox', { name: /^Gym/ }).check()
  await page.getByRole('checkbox', { name: /example sessions/ }).check()
  await page.getByRole('button', { name: 'Start with the demo' }).click()
  await expect(page.getByRole('heading', { name: 'New session' })).toBeVisible()
}

test('history alone comes back from a backup, without the programs', async ({ page }) => {
  await startWithGymHistory(page)

  // Export the history only: its sessions and the exercises they use, no program.
  await page.goto('./#/settings')
  await page.getByRole('button', { name: /Export backup/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Export a backup' })
  for (const part of ['Exercises', 'Programs', 'Goals', 'Notes', 'Settings'])
    await sheet.getByRole('checkbox', { name: new RegExp(`^${part}`) }).uncheck()
  const downloading = page.waitForEvent('download')
  await sheet.getByRole('button', { name: 'Export', exact: true }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toMatch(/^cadence-history-\d{4}-\d{2}-\d{2}\.json$/)
  const path = (await download.path()) ?? ''
  const backup = JSON.parse(await readFile(path, 'utf8'))
  expect(backup.version).toBe(12)
  expect(backup.parts).toEqual(['history'])
  expect(backup.programs).toEqual([])
  expect(backup.sessions.length).toBeGreaterThan(0)
  expect(backup.exercises.length).toBeGreaterThan(0)
  const sessions = backup.sessions.length

  await page.getByRole('button', { name: 'Erase all training data…' }).click()
  await page.getByRole('button', { name: 'Erase everything' }).click()
  await expect(page.getByText('All training data erased')).toBeVisible()

  // The file holds the history only; added to the device, it comes back alone.
  await page.getByLabel('Backup file').setInputFiles(path)
  const importing = page.getByRole('dialog', { name: 'Import a backup' })
  await expect(importing.getByRole('checkbox', { name: /^History/ })).toBeChecked()
  await expect(importing.getByRole('checkbox', { name: /^Programs/ })).toBeDisabled()
  await expect(importing.getByRole('radio', { name: 'Add' })).toBeChecked()
  await importing.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(page.getByText(new RegExp(`^Backup imported: ${sessions} sessions`))).toBeVisible()

  await page.getByRole('button', { name: /Export backup/ }).click()
  const after = page.getByRole('dialog', { name: 'Export a backup' })
  await expect(after.getByRole('checkbox', { name: new RegExp(`^History\\s*${sessions} sessions`) })).toBeVisible()
  await expect(after.getByRole('checkbox', { name: /^Programs\s*0 programs/ })).toBeVisible()
  await after.getByRole('button', { name: 'Close' }).click()

  await page.goto('./#/progress?view=history')
  await expect(page.getByRole('heading', { name: 'No session logged yet' })).toHaveCount(0)
})
