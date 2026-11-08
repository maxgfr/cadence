import { expect, type Page, test } from '@playwright/test'
import { answerWith, closeCoach, coachAnswer, connectMockModel, docked, isCoach, openCoach, said } from './mockModel.ts'

async function setUp(page: Page) {
  await page.goto('./')
  await page.getByRole('checkbox', { name: /^Gym/ }).check()
  await page.getByRole('button', { name: 'Start with the demo' }).click()
  await expect(page.getByRole('heading', { name: 'New session' })).toBeVisible()
  await connectMockModel(page)
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
  const session = page.url()

  await answerWith(page, () =>
    coachAnswer({
      reply: 'Three sets of squat at 100 kg: nice.',
      logSets: [{ exercise: 'back-squat', sets: [said(100, 5), said(100, 5), said(100, 5)] }],
    }),
  )
  await page.goto('./')
  let coach = await openCoach(page)
  await coach.getByLabel('Message the coach…').fill('Squat, three sets of five at 100')
  await coach.getByRole('button', { name: 'Send' }).click()
  await expect(coach.getByText('Three sets of squat at 100 kg: nice.')).toBeVisible()
  await expect(coach.getByRole('heading', { name: 'Log 3 sets of Back squat' })).toBeVisible()

  // Nothing is written before Apply. (Moving within the app: the conversation is in memory, a reload ends it.)
  await closeCoach(page)
  await page.goto(session)
  await expect(squatKg).toHaveValue('')
  await page.goto('./#/')
  coach = await openCoach(page)
  await coach.getByRole('button', { name: 'Apply' }).click()
  await expect(coach.getByRole('article').getByRole('status')).toHaveText('Applied')

  await closeCoach(page)
  await page.goto(session)
  await expect(squatKg).toHaveValue('100')
  await expect(page.getByRole('button', { name: 'Back squat, set 3 done' })).toHaveAttribute('aria-pressed', 'true')
})

test('the coach writes an exercise description, read and edited before it is saved', async ({ page }) => {
  await setUp(page)
  await answerWith(page, () =>
    coachAnswer({
      reply: 'Here it is.',
      describeExercise: [{ exercise: 'back-squat', description: 'Brace, then sit between the hips.' }],
    }),
  )
  await page.goto('./#/exercises')
  await page.getByRole('button', { name: /^Back squat/ }).click()
  await page.getByRole('button', { name: 'Ask the coach to write the description' }).click()

  // The form makes way, and the request waits in the coach, ready to send or edit.
  const coach = docked(page)
    ? page.getByRole('complementary', { name: 'Coach' })
    : page.getByRole('dialog', { name: 'Coach' })
  await expect(coach.getByLabel('Message the coach…')).toHaveValue(/detailed description of Back squat/)
  await coach.getByRole('button', { name: 'Send' }).click()
  await expect(coach.getByRole('heading', { name: 'Description of Back squat' })).toBeVisible()

  await coach.getByRole('button', { name: 'Review' }).click()
  const description = page.getByRole('dialog').getByLabel('Description')
  await expect(description).toHaveValue('Brace, then sit between the hips.')

  // Closing without saving keeps nothing.
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: /^Back squat/ }).click()
  await expect(description).toHaveValue('')

  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
  await page.reload()
  await page.getByRole('button', { name: /^Back squat/ }).click()
  await description.fill('Brace, then sit between the hips. Knees out.')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('button', { name: /^Back squat/ }).click()
  await expect(description).toHaveValue('Brace, then sit between the hips. Knees out.')
})

test('asked from a program, the coach reads the week on show and answers over the editor', async ({ page }) => {
  await setUp(page)
  let asked = ''
  await answerWith(page, (body) => {
    asked = body
    return coachAnswer({ reply: 'Adjust it: Monday already has two squat patterns.' })
  })
  await page.goto('./#/programs')
  await page
    .getByRole('link', { name: /^Beginner full body/ })
    .first()
    .click()
  const editor = page.getByRole('heading', { name: 'Beginner full body', level: 1 })
  await expect(editor).toBeVisible()
  const coach = await openCoach(page)
  await coach.getByRole('button', { name: 'Is this week balanced?' }).click()
  await expect(coach.getByLabel('Message the coach…')).toHaveValue('Is this week balanced?')
  await coach.getByRole('button', { name: 'Send' }).click()
  await expect(coach.getByText('Adjust it: Monday already has two squat patterns.')).toBeVisible()
  expect(asked).toContain('editing their program \\"Beginner full body\\"')
  expect(asked).toContain('Back squat')
  await closeCoach(page)
  await expect(editor).toBeVisible()
})

test('on the logging screen, what the coach is told shows in the session at once, the rest timer in view', async ({
  page,
}) => {
  await setUp(page)
  await page.goto('./')
  await page
    .getByRole('button', { name: /^Full body A/ })
    .first()
    .click()
  await answerWith(page, () =>
    coachAnswer({ reply: 'Logged.', logSets: [{ exercise: 'back-squat', sets: [said(90, 5), said(95, 5)] }] }),
  )
  // Resting is when the sets are told: the coach stays clear of the rest timer.
  await page.getByRole('button', { name: /^Rest .* after Back squat$/ }).click()
  const rest = page.getByRole('region', { name: 'Rest timer' })
  await expect(rest).toBeVisible()
  // Measured once the bar has risen into place.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))))
  const r = await rest.boundingBox()
  if (docked(page)) {
    // A computer: the bar stops at the coach's column.
    const d = await page.getByRole('complementary', { name: 'Coach' }).boundingBox()
    expect(r && d && r.x + r.width <= d.x).toBe(true)
  } else {
    const b = await page.getByRole('button', { name: 'Coach', exact: true }).boundingBox()
    expect(b && r && b.y + b.height <= r.y).toBe(true)
  }

  const coach = await openCoach(page)
  await coach.getByLabel('Message the coach…').fill('squat 90 then 95, five each')
  await coach.getByRole('button', { name: 'Send' }).click()
  await coach.getByRole('button', { name: 'Apply' }).click()
  await expect(coach.getByRole('article').getByRole('status')).toHaveText('Applied')
  await closeCoach(page)
  await expect(page.getByLabel('Back squat, set 1, kg')).toHaveValue('90')
  await expect(page.getByLabel('Back squat, set 2, kg')).toHaveValue('95')
})

test('on a computer the coach is always beside the app; the conversation carries on from screen to screen', async ({
  page,
}) => {
  test.skip(!docked(page), 'a computer only')
  await setUp(page)
  await answerWith(page, () => coachAnswer({ reply: 'Your week looks balanced.' }))
  await page.goto('./#/programs')
  const coach = await openCoach(page)
  await coach.getByLabel('Message the coach…').fill('Is my week balanced?')
  await coach.getByRole('button', { name: 'Send' }).click()
  await expect(coach.getByText('Your week looks balanced.')).toBeVisible()
  await page.goto('./#/progress')
  await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible()
  await expect(coach.getByText('Your week looks balanced.')).toBeVisible()
  // No bubble and nothing over the app: the column is beside it.
  await expect(page.getByRole('button', { name: 'Coach', exact: true })).toHaveCount(0)
  const [main, dock] = [await page.locator('#main').boundingBox(), await coach.boundingBox()]
  expect(main && dock && main.x + main.width <= dock.x + 1).toBe(true)
})

test('asked for a program, the coach describes it and the designer builds it: a draft to edit', async ({ page }) => {
  await setUp(page)
  const block = (exercise: string) => ({
    exercise,
    newExercise: null,
    sets: 3,
    reps: 10,
    distanceMeters: null,
    durationSeconds: null,
    intensity: null,
    restSeconds: 90,
    intervalSeconds: null,
    tempo: null,
    notes: null,
  })
  const prompts: string[] = []
  await answerWith(page, (body) => {
    prompts.push(body)
    return isCoach(body)
      ? coachAnswer({
          reply: 'I am designing your push, pull, legs.',
          createProgram: [
            {
              brief: 'Push, pull, legs; abs and shoulders on leg day; 7 exercises per session; machines and weights',
              layout: 'sessions',
              weeks: 0,
              daysPerWeek: 0,
              sessions: 3,
              sports: ['Gym'],
              level: 'beginner',
            },
          ],
        })
      : {
          name: 'Push Pull Legs',
          goal: 'Simple machine work',
          weeks: [
            {
              name: 'Sessions',
              days: ['Push', 'Pull', 'Legs'].map((name) => ({
                name,
                discipline: 'Gym',
                notes: null,
                blocks: [block('back-squat')],
              })),
            },
          ],
        }
  })
  await page.goto('./#/programs')
  const coach = await openCoach(page)
  await coach.getByLabel('Message the coach…').fill('PPL, 7 exercises per session, machines')
  await coach.getByRole('button', { name: 'Send' }).click()
  await expect(coach.getByText('I am designing your push, pull, legs.')).toBeVisible()
  await expect(coach.getByRole('heading', { name: 'Program draft: Push Pull Legs' })).toBeVisible()
  expect(prompts).toHaveLength(2)
  expect(prompts[1]).toContain('7 exercises per session; machines and weights')
  await coach.getByRole('button', { name: 'Open the draft' }).click()
  await expect(page.getByRole('dialog', { name: 'Coach' })).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Push Pull Legs', level: 1 })).toBeVisible()
})
