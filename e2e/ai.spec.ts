import { expect, test } from '@playwright/test'
import { answerWith, closeCoach, coachAnswer, connectMockModel, isCoach, openCoach } from './mockModel.ts'

test('asked for goals, the coach proposes them from the training, ticked one by one before they are added', async ({
  page,
}) => {
  const goal = (p: Record<string, unknown>) => ({
    kind: 'exercise',
    exercise: null,
    discipline: null,
    volume: null,
    target: 1,
    weeks: 8,
    why: null,
    ...p,
  })
  const prompts: string[] = []
  await answerWith(page, (body) => {
    prompts.push(body)
    return isCoach(body)
      ? coachAnswer({ reply: 'Here are goals from your training.', addGoals: [{ focus: 'squat' }] })
      : {
          goals: [
            goal({ exercise: 'back-squat', target: 140, why: 'Your squat is moving: 140 kg is within reach.' }),
            goal({ kind: 'frequency', discipline: 'Gym', target: 4 }),
          ],
        }
  })
  await page.goto('./')
  await page.getByRole('checkbox', { name: /^Gym/ }).check()
  await page.getByRole('button', { name: 'Start with the demo' }).click()
  await expect(page.getByRole('heading', { name: 'New session' })).toBeVisible()
  await connectMockModel(page)

  await page.goto('./#/progress')
  const coach = await openCoach(page)
  await coach.getByRole('button', { name: 'Suggest goals from my training' }).click()
  await coach.getByRole('button', { name: 'Send' }).click()
  await expect(coach.getByText('Your squat is moving: 140 kg is within reach.')).toBeVisible()
  // The goal designer gets the focus the coach heard, and the training.
  expect(prompts[1]).toContain('Focus: squat')
  await coach.getByRole('checkbox', { name: /sessions a week/ }).uncheck()
  await coach.getByRole('button', { name: 'Add 1 goal' }).click()
  await expect(coach.getByRole('article').getByRole('status')).toHaveText('Applied')
  await closeCoach(page)
  await expect(page.getByRole('button', { name: /^Back squat: estimated 1RM 140\skg/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /sessions a week/ })).toHaveCount(0)
})

test('a model missing from the list is typed in and kept; the address is an Advanced setting', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Start empty' }).click()
  await page.goto('./#/settings/ai')
  await page.getByLabel('Provider').selectOption({ label: 'Anthropic' })
  await expect(page.getByLabel('Address (optional)')).toHaveCount(0)
  await page.getByRole('button', { name: 'Model not listed? Enter its id' }).click()
  await page.getByLabel('Model id').fill('claude-from-the-future')
  await page.getByLabel('API key').fill('sk-test')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Saved.')).toBeVisible()

  await page.reload()
  await expect(page.getByLabel('Model id')).toHaveValue('claude-from-the-future')

  await page.goto('./#/settings')
  await page.getByText('Advanced', { exact: true }).click()
  await page.goto('./#/settings/ai')
  await expect(page.getByLabel('Address (optional)')).toBeVisible()
})
