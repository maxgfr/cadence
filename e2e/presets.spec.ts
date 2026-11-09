import { expect, test } from '@playwright/test'

test('presets add real libraries, named in English even in French, and a block can differ set by set', async ({
  page,
}) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Start empty' }).click()

  await page.goto('./#/settings')
  await expect(page.getByLabel('Exercise and machine names')).toHaveValue('en')
  await page.getByRole('region', { name: 'Language' }).getByLabel('Language').selectOption('fr')

  await page.goto('./#/settings/presets')
  await page.getByRole('checkbox', { name: /^Musculation/ }).check()
  await page.getByRole('checkbox', { name: /^Course à pied/ }).check()
  await page.getByRole('button', { name: 'Ajouter à ma bibliothèque' }).click()
  await expect(page.getByText(/exercices ajoutés et 3 programmes/)).toBeVisible()

  await page.goto('./#/exercises')
  await expect(page.getByRole('button', { name: /^Leg press/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Presse à cuisses/ })).toHaveCount(0)

  await page.goto('./#/programs')
  await page.getByRole('link', { name: /^Push Pull Legs/ }).click()
  await expect(page.getByText('1×15, 1×10, 1×8, 1×6').first()).toBeVisible()

  await page
    .getByRole('button', { name: /^Lateral raise/ })
    .first()
    .click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('checkbox', { name: 'Reps ou charge différentes par série' }).check()
  await sheet.getByLabel('Série 1 : rép.').fill('15')
  await sheet.getByLabel('Série 2 : rép.').fill('10')
  await sheet.getByLabel('Série 3 : rép.').fill('6')
  await sheet.getByRole('button', { name: 'Terminé', exact: true }).click()
  await expect(page.getByText('1×15, 1×10, 1×6')).toBeVisible()
})
