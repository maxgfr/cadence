import { expect, type Page, test } from '@playwright/test'

/** A local OpenAI-compatible server, answered by the test with `answer` as the model's JSON. */
async function mockModel(page: Page, answer: unknown) {
  await page.route('http://127.0.0.1:9/v1/chat/completions', (route) =>
    route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        id: 'mock',
        object: 'chat.completion',
        created: 0,
        model: 'mock',
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(answer) } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    }),
  )
}

async function useMockEndpoint(page: Page) {
  await page.goto('./#/settings/ai')
  await page.getByLabel('Provider').selectOption({ label: 'Custom endpoint (OpenAI-compatible)' })
  await page.getByLabel('Endpoint address').fill('http://127.0.0.1:9/v1')
  await page.getByLabel('Model').fill('mock')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
}

test('AI proposes goals from the training, picked before they are added', async ({ page }) => {
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
  await mockModel(page, {
    goals: [
      goal({ exercise: 'back-squat', target: 140, why: 'Your squat is moving: 140 kg is within reach.' }),
      goal({ kind: 'frequency', discipline: 'Gym', target: 4 }),
    ],
  })
  await page.goto('./')
  await page.getByRole('checkbox', { name: /^Gym/ }).check()
  await page.getByRole('button', { name: 'Start with the demo' }).click()
  await expect(page.getByRole('heading', { name: 'New session' })).toBeVisible()
  await useMockEndpoint(page)

  await page.goto('./#/progress')
  await page.getByRole('button', { name: 'Suggest with AI' }).click()
  const sheet = page.getByRole('dialog', { name: 'Goals from your training' })
  await sheet.getByLabel('Focus (optional)').fill('squat')
  await sheet.getByRole('button', { name: 'Propose goals' }).click()
  await expect(sheet.getByText('Your squat is moving: 140 kg is within reach.')).toBeVisible()
  await sheet.getByRole('checkbox', { name: /sessions a week/ }).uncheck()
  await sheet.getByRole('button', { name: 'Add 1 goal' }).click()
  await expect(page.getByText('1 goal added')).toBeVisible()
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
