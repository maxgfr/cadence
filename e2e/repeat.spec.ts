import { expect, type Page, test } from '@playwright/test'

async function startWithGym(page: Page) {
  await page.goto('./')
  await page.getByRole('checkbox', { name: /^Gym/ }).check()
  await page.getByRole('button', { name: 'Start with the demo' }).click()
  await expect(page.getByRole('heading', { name: 'New session' })).toBeVisible()
}

/** Starts Full body A, lifts `kg` on the first set of squat, and finishes. */
async function doFullBodyA(page: Page, kg: string) {
  await page
    .getByRole('button', { name: /^Full body A/ })
    .first()
    .click()
  await page.getByLabel('Back squat, set 1, kg').fill(kg)
  await page.getByRole('button', { name: 'Back squat, set 1 done' }).click()
  await page.getByRole('button', { name: 'Finish', exact: true }).click()
  await page.getByRole('button', { name: 'Save session' }).click()
  await expect(page.getByText('Session saved.')).toBeVisible()
  await page.goto('./#/')
}

test('a session done this week can be done again, starting from what was lifted', async ({ page }) => {
  await startWithGym(page)
  await doFullBodyA(page, '82.5')

  const done = page.getByRole('button', { name: /^Full body A.*Done/ })
  await expect(done).toBeVisible()
  await done.click()

  await expect(page.getByLabel('Back squat, set 1, kg')).toHaveValue('82.5')
  await expect(page.getByText(/Last time .*1×5 · 82\.5.kg/).first()).toBeVisible()
  // An exercise with no history says nothing.
  await expect(page.getByRole('article', { name: 'Bench press' }).getByText(/Last time/)).toHaveCount(0)

  // Back on Today it shows as in progress, and coming back opens the same session.
  const session = page.url()
  await page.goto('./#/')
  const running = page.getByRole('button', { name: /^Full body A.*In progress/ }).first()
  await expect(running).toBeVisible()
  await running.click()
  await expect(page).toHaveURL(session)
})

test('several sessions run at once, and each is restarted or discarded with undo', async ({ page }) => {
  await startWithGym(page)
  await doFullBodyA(page, '82.5')

  // Two sessions in progress, the first keeping what was ticked.
  await page
    .getByRole('button', { name: /^Full body A/ })
    .first()
    .click()
  await page.getByLabel('Back squat, set 1, kg').fill('90')
  const first = page.url()
  await page.getByRole('button', { name: 'Back squat, set 1 done' }).click()
  await page.goto('./#/')
  await page
    .getByRole('button', { name: /^Full body B/ })
    .first()
    .click()
  await expect(page.getByRole('heading', { name: /^Full body B/, level: 1 })).toBeVisible()
  await page.goto('./#/')
  const resume = page.getByRole('link', { name: 'Resume session' })
  await expect(resume).toHaveCount(2)
  await expect(page.getByRole('button', { name: /^Full body A.*In progress/ }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /^Full body B.*In progress/ }).first()).toBeVisible()

  // Coming back to one keeps it as it was left, then starting over brings it back to what was last lifted.
  await page.goto(first)
  await expect(page.getByLabel('Back squat, set 1, kg')).toHaveValue('90')
  await page.getByRole('button', { name: 'Restart session' }).click()
  await expect(page.getByLabel('Back squat, set 1, kg')).toHaveValue('82.5')
  await expect(page.getByRole('button', { name: 'Back squat, set 1 done' })).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByLabel('Back squat, set 1, kg')).toHaveValue('90')

  // Discarding from Today takes that session only, and comes back on undo.
  await page.goto('./#/')
  await page.getByRole('button', { name: /^Discard session: Full body B/ }).click()
  await expect(resume).toHaveCount(1)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(resume).toHaveCount(2)

  // Discarding from the session itself goes back to Today; what was finished is kept.
  await page.goto(first)
  await page.getByRole('button', { name: 'Discard session' }).click()
  await expect(page).toHaveURL(/#\/$/)
  await expect(resume).toHaveCount(1)
  await expect(page.getByRole('button', { name: /^Full body A.*Done/ })).toBeVisible()
})

test('an exercise is replaced in the session, undone, or carried into the program', async ({ page }) => {
  await startWithGym(page)
  await page
    .getByRole('button', { name: /^Full body A/ })
    .first()
    .click()

  const pick = async () => {
    await page.getByRole('button', { name: 'Replace Back squat' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Front squat', exact: true }).click()
    await expect(page.getByRole('article', { name: 'Front squat' })).toBeVisible()
  }

  await pick()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('article', { name: 'Back squat' })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Front squat' })).toHaveCount(0)

  // In the session only, the program keeps its exercise.
  const session = page.url()
  await pick()
  await page.goto('./#/programs')
  await page
    .getByRole('link', { name: /^Beginner full body/ })
    .first()
    .click()
  await expect(page.getByRole('button', { name: /^Back squat/ }).first()).toBeVisible()

  await page.goto(session)
  await page.getByRole('button', { name: 'Replace Front squat' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Back squat', exact: true }).click()
  await page.getByRole('button', { name: 'Replace Back squat' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Front squat', exact: true }).click()
  await page.getByRole('button', { name: 'Also in the program' }).click()
  await expect(page.getByText('Program updated')).toBeVisible()

  await page.goto('./#/programs')
  await page
    .getByRole('link', { name: /^Beginner full body/ })
    .first()
    .click()
  await expect(page.getByRole('button', { name: /^Front squat/ }).first()).toBeVisible()
})

test('a planned exercise is changed for another, the block staying open until Done', async ({ page }) => {
  await startWithGym(page)
  await page.goto('./#/programs')
  await page
    .getByRole('link', { name: /^Beginner full body/ })
    .first()
    .click()
  await page
    .getByRole('button', { name: /^Back squat/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Back squat', exact: true }).click()
  await page.getByRole('button', { name: 'Front squat', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Front squat', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Front squat/ }).first()).toBeVisible()
})

test('an exercise created while changing a planned one becomes the new choice', async ({ page }) => {
  await startWithGym(page)
  await page.goto('./#/programs')
  await page
    .getByRole('link', { name: /^Beginner full body/ })
    .first()
    .click()
  await page
    .getByRole('button', { name: /^Back squat/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Back squat', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Search exercises' }).fill('Zercher squat')
  await page.getByRole('button', { name: 'Create “Zercher squat”' }).click()
  await page.getByRole('dialog', { name: 'New exercise' }).getByRole('button', { name: 'Add exercise' }).click()
  // Still on the block, which now shows the new exercise: creating it did not save the block behind it.
  await expect(page.getByRole('button', { name: 'Zercher squat', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Zercher squat/ }).first()).toBeVisible()
})
