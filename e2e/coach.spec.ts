import { expect, type Page, test } from '@playwright/test'
import { answerWith, coachAnswer, connectMockModel, isCoach, openCoach, said } from './mockModel.ts'

async function setUp(page: Page) {
  await page.goto('./')
  await page.getByRole('checkbox', { name: /^Gym/ }).check()
  await page.getByRole('button', { name: 'Start with the demo' }).click()
  await expect(page.getByRole('heading', { name: 'New session' })).toBeVisible()
  await connectMockModel(page)
}

/** A microphone that records silence: what the browser under test lacks. */
async function fakeMicrophone(page: Page) {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const audio = new AudioContext()
      const out = audio.createMediaStreamDestination()
      audio.createOscillator().connect(out)
      return out.stream
    }
  })
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
  await coach.getByRole('button', { name: 'Close' }).click()
  await page.goto(session)
  await expect(squatKg).toHaveValue('')
  await page.goto('./#/')
  coach = await openCoach(page)
  await coach.getByRole('button', { name: 'Apply' }).click()
  await expect(coach.getByRole('article').getByRole('status')).toHaveText('Applied')

  await coach.getByRole('button', { name: 'Close' }).click()
  await page.goto(session)
  await expect(squatKg).toHaveValue('100')
  await expect(page.getByRole('button', { name: 'Back squat, set 3 done' })).toHaveAttribute('aria-pressed', 'true')
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
  await coach.getByRole('button', { name: 'Close' }).click()
  await expect(editor).toBeVisible()
})

test('on the logging screen the bubble is a microphone; what is said shows in the session at once', async ({
  page,
}) => {
  await fakeMicrophone(page)
  await setUp(page)
  await page.goto('./')
  await page
    .getByRole('button', { name: /^Full body A/ })
    .first()
    .click()
  await answerWith(page, () =>
    coachAnswer({ reply: 'Logged.', logSets: [{ exercise: 'back-squat', sets: [said(90, 5), said(95, 5)] }] }),
  )
  // Resting is when the sets are said: the bubble stays above the rest timer.
  await page.getByRole('button', { name: /^Rest .* after Back squat$/ }).click()
  const bubble = page.getByRole('button', { name: 'Say what you did' })
  const rest = page.getByRole('region', { name: 'Rest timer' })
  await expect(rest).toBeVisible()
  // Measured once the bar has risen into place.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))))
  const [b, r] = [await bubble.boundingBox(), await rest.boundingBox()]
  expect(b && r && b.y + b.height <= r.y).toBe(true)

  const coach = await openCoach(page, 'Say what you did')
  // It records as it opens; typing is there too.
  await expect(coach.getByRole('status').filter({ hasText: 'Listening…' })).toBeVisible()
  await coach.getByRole('button', { name: 'Cancel' }).click()
  await coach.getByLabel('Message the coach…').fill('squat 90 then 95, five each')
  await coach.getByRole('button', { name: 'Send' }).click()
  await coach.getByRole('button', { name: 'Apply' }).click()
  await expect(coach.getByRole('article').getByRole('status')).toHaveText('Applied')
  await coach.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByLabel('Back squat, set 1, kg')).toHaveValue('90')
  await expect(page.getByLabel('Back squat, set 2, kg')).toHaveValue('95')
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
