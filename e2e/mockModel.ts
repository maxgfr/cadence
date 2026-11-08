import { expect, type Page } from '@playwright/test'

const URL = 'http://127.0.0.1:9/v1/chat/completions'

/** A local OpenAI-compatible server: each request is answered with `answer(body)` as the model's JSON. */
export async function answerWith(page: Page, answer: (body: string) => unknown) {
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
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: { role: 'assistant', content: JSON.stringify(answer(route.request().postData() ?? '')) },
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    }),
  )
}

/** The request is the coach's turn (not one of the designers it hands a program, exercises or goals to). */
export const isCoach = (body: string) => body.includes('You are the coach inside Cadence')

/** A coach turn: nothing proposed but what is given. */
export const coachAnswer = (p: Record<string, unknown>) => ({
  reply: 'Done.',
  logSets: [],
  createProgram: [],
  adjustWeek: [],
  addExercises: [],
  addGoals: [],
  updateSettings: [],
  setRest: [],
  describeExercise: [],
  ...p,
})

export const said = (weight: number, reps: number) => ({ reps, weight, timeSeconds: 0, distance: 0, rpe: 0 })

/** Settings › AI: the local server above as a custom endpoint. */
export async function connectMockModel(page: Page) {
  await page.goto('./#/settings/ai')
  await page.getByLabel('Provider').selectOption({ label: 'Custom endpoint (OpenAI-compatible)' })
  await page.getByLabel('Endpoint address').fill('http://127.0.0.1:9/v1')
  await page.getByLabel('Model').fill('mock')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
}

/** A computer's window: the coach is a column beside the app rather than a bubble. */
export const docked = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1200

/** The coach, on whatever screen is shown: its column on a computer, else the conversation its bubble opens. */
export async function openCoach(page: Page) {
  if (docked(page)) {
    const dock = page.getByRole('complementary', { name: 'Coach' })
    await expect(dock).toBeVisible()
    return dock
  }
  await page.getByRole('button', { name: 'Coach', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Coach' })
  await expect(sheet).toBeVisible()
  return sheet
}

/** Back to the screen: the conversation over it closes (a computer's column stays). */
export async function closeCoach(page: Page) {
  if (!docked(page)) await page.getByRole('dialog', { name: 'Coach' }).getByRole('button', { name: 'Close' }).click()
}
