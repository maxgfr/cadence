import { expect, type Page, test } from '@playwright/test'

const URL = 'http://127.0.0.1:9/v1/chat/completions'

/** The local OpenAI-compatible server answers with `answer` as the coach's JSON. */
async function answerWith(page: Page, answer: unknown) {
  await page.unroute(URL)
  await page.route(URL, (route) =>
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

const action = (p: Record<string, unknown>) => ({
  type: 'log_sets',
  exercise: null,
  sets: null,
  exercises: null,
  program: null,
  layout: null,
  programId: null,
  weekNumber: null,
  week: null,
  goals: null,
  settings: null,
  ...p,
})
const set = (weight: number, reps: number) => ({ reps, weight, timeSeconds: null, distance: null, rpe: null })

async function setUp(page: Page) {
  await page.goto('./')
  await page.getByRole('checkbox', { name: /^Gym/ }).check()
  await page.getByRole('button', { name: 'Start with the demo' }).click()
  await expect(page.getByRole('heading', { name: 'New session' })).toBeVisible()
  await page.goto('./#/settings/ai')
  await page.getByLabel('Provider').selectOption({ label: 'Custom endpoint (OpenAI-compatible)' })
  await page.getByLabel('Endpoint address').fill('http://127.0.0.1:9/v1')
  await page.getByLabel('Model').fill('mock')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
}

test('the coach logs what was said, only once applied', async ({ page }) => {
  await setUp(page)
  await page.goto('./')
  await page
    .getByRole('button', { name: /^Full body A/ })
    .first()
    .click()
  const squatKg = page.getByLabel('Back squat, set 1, kg')
  await expect(squatKg).toHaveValue('')

  await answerWith(page, {
    reply: 'Three sets of squat at 100 kg: nice.',
    actions: [action({ exercise: 'back-squat', sets: [set(100, 5), set(100, 5), set(100, 5)] })],
  })
  await page.goto('./#/coach')
  await expect(page.getByRole('heading', { name: 'Coach', level: 1 })).toBeVisible()
  await page.getByLabel('Message the coach…').fill('Squat, three sets of five at 100')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Three sets of squat at 100 kg: nice.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Log 3 sets of Back squat' })).toBeVisible()

  // Nothing is written before Apply.
  await page.goBack()
  await expect(squatKg).toHaveValue('')
  await page.goForward()
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByRole('article').getByRole('status')).toHaveText('Applied')

  await page.goBack()
  await expect(squatKg).toHaveValue('100')
  await expect(page.getByRole('button', { name: 'Back squat, set 3 done' })).toHaveAttribute('aria-pressed', 'true')
})

test('asked from a program day, the coach answers in place, without leaving the editor', async ({ page }) => {
  await setUp(page)
  await answerWith(page, { reply: 'Adjust it: Monday already has two squat patterns.', actions: [] })
  await page.goto('./#/programs')
  await page
    .getByRole('link', { name: /^Beginner full body/ })
    .first()
    .click()
  await page
    .getByRole('button', { name: /^Back squat/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Ask the coach' }).click()
  await expect(page.getByText('Adjust it: Monday already has two squat patterns.')).toBeVisible()
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('on the logging screen, what is said becomes sets to add', async ({ page }) => {
  await setUp(page)
  await page.goto('./')
  await page
    .getByRole('button', { name: /^Full body A/ })
    .first()
    .click()
  await answerWith(page, {
    reply: 'Logged.',
    actions: [action({ exercise: 'back-squat', sets: [set(90, 5), set(95, 5)] })],
  })
  await page.getByRole('button', { name: 'Say what you did' }).click()
  const sheet = page.getByRole('dialog', { name: 'Say what you did' })
  await sheet.getByLabel('Or type it').fill('squat 90 then 95, five each')
  await sheet.getByRole('button', { name: 'Send' }).click()
  await sheet.getByRole('button', { name: 'Add 2 sets' }).click()
  await expect(page.getByLabel('Back squat, set 1, kg')).toHaveValue('90')
  await expect(page.getByLabel('Back squat, set 2, kg')).toHaveValue('95')
})
