import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'

/** No serious or critical accessibility violation on the current screen. */
async function accessible(page: Page, screen: string) {
  // Colours are measured once entrances (toasts, sheets) have finished fading in.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY)
        // A cancelled animation (a sheet closed mid-way) rejects: it is finished all the same.
        .map((a) => a.finished.catch(() => undefined)),
    ),
  )
  const { violations } = await new AxeBuilder({ page }).analyze()
  const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(
    bad.map(
      (v) => `${screen}: ${v.id} ${v.nodes.map((n) => `${n.target.join(' ')} ${n.failureSummary ?? ''}`).join('; ')}`,
    ),
  ).toEqual([])
}

test('demo sport → logged session → record and chart → backup round trip', async ({ page, isMobile }) => {
  await page.goto('./')

  // First run: mode, units, and a demo sport to start from.
  await expect(page.getByRole('heading', { name: 'Cadence' })).toBeVisible()
  await accessible(page, 'welcome')
  await page.getByRole('checkbox', { name: /^Gym/ }).check()
  await page.getByRole('button', { name: 'Start with the demo' }).click()

  // The demo's first program is current: Today shows its next session, pre-filled.
  await expect(page.getByRole('heading', { name: 'Full body A' })).toBeVisible()
  await accessible(page, 'today')
  await page.getByRole('button', { name: 'Start session' }).click()

  // Log two sets of squats.
  await expect(page.getByRole('heading', { name: 'Full body A · Week 1' })).toBeVisible()
  for (const [set, kg] of [
    [1, '80'],
    [2, '85'],
  ] as const) {
    await page.getByLabel(`Back squat, set ${set}, kg`).fill(kg)
    await page.getByRole('button', { name: `Back squat, set ${set} done` }).click()
  }
  // No clock runs and ticking a set starts nothing: the rest is started by hand.
  await expect(page.getByRole('timer')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Rest timer' })).toHaveCount(0)
  await page.getByRole('button', { name: /^Rest .* after Back squat$/ }).click()
  await expect(page.getByRole('region', { name: 'Rest timer' })).toBeVisible()
  await accessible(page, 'log')
  await page.getByRole('button', { name: 'Skip rest' }).click()
  await page.getByRole('button', { name: 'Finish' }).click()
  await page.getByLabel('Duration (minutes)').fill('55')
  await page.getByRole('button', { name: /RPE 8/ }).click()
  await page.getByRole('button', { name: 'Save session' }).click()

  // The summary shows the record (85 kg × 5 → e1RM 99.2 kg).
  await expect(page.getByText('Session saved')).toBeVisible()
  await expect(page.getByRole('link', { name: /Back squat.*99\.2\skg/ })).toBeVisible()
  await accessible(page, 'session')

  // Progress: calendar, the exercise, the record.
  await page.goto('./#/progress')
  await expect(page.getByRole('img', { name: '1 training days in the last 16 weeks' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Records' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Back squat.*99\.2\skg/ })).toBeVisible()
  await accessible(page, 'progress')

  // A goal starts from the record, with a target suggested from it.
  await page.getByRole('link', { name: 'Set a goal on Back squat' }).click()
  await expect(page.getByText(/^Now 99\.2\skg, your best estimated 1RM$/)).toBeVisible()
  await expect(page.getByLabel('Target (kg)')).not.toHaveValue('')
  await accessible(page, 'new goal')
  await page.getByRole('button', { name: 'Set goal' }).click()
  await expect(page.getByText('Goal set')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Back squat: estimated 1RM/ })).toBeVisible()

  // Backup: export, erase, import, and the session is back.
  await page.goto('./#/settings')
  await accessible(page, 'settings')
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: /Export backup/ }).click()
  const file = await (await downloading).path()
  await page.getByRole('button', { name: 'Erase all training data…' }).click()
  await page.getByRole('button', { name: 'Erase everything' }).click()
  await expect(page.getByText('All training data erased')).toBeVisible()
  await page.goto('./#/progress?view=history')
  await expect(page.getByRole('heading', { name: 'No session logged yet' })).toBeVisible()
  await page.goto('./#/settings')
  await page.getByLabel('Backup file').setInputFiles(file)
  await expect(page.getByText('Backup imported: 1 sessions, 2 programs')).toBeVisible()
  // History is a view of Progress; old links still lead there.
  await page.goto('./#/history')
  await expect(page.getByRole('radio', { name: 'History' })).toBeChecked()
  await expect(page.getByRole('link', { name: /Full body A · Week 1/ })).toBeVisible()

  if (isMobile) {
    // Phones: the tab bar, no horizontal scroll.
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  }
})

test('starting empty: create a discipline and an exercise from the picker, mid-session', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Start empty' }).click()
  await expect(page.getByRole('heading', { name: 'Start your training log' })).toBeVisible()
  await page.getByRole('button', { name: 'Start a session' }).click()
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await page.getByRole('searchbox', { name: 'Search exercises' }).fill('Campus board')
  await page.getByRole('button', { name: 'Create “Campus board”' }).click()
  await expect(page.getByLabel('Name')).toHaveValue('Campus board')
  // No discipline is chosen for you.
  await expect(page.getByLabel('Discipline')).toHaveValue('')
  await page.getByLabel('Discipline').selectOption({ label: 'New discipline…' })
  await page.getByLabel('New discipline').fill('Climbing')
  await page.getByLabel('Measured by').selectOption({ label: 'Reps (bodyweight)' })
  await accessible(page, 'new exercise')
  await page.getByRole('button', { name: 'Add exercise' }).last().click()
  // Picked straight into the session.
  await expect(page.getByRole('heading', { name: 'Campus board' })).toBeVisible()
  await page.goto('./#/exercises')
  await expect(page.getByRole('button', { name: /Climbing/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Campus board/ })).toBeVisible()
  await accessible(page, 'exercises')
})

test('advanced mode shows per-set effort; AI stays out of the way until set up', async ({ page }) => {
  await page.goto('./')
  await page.getByText('Advanced', { exact: true }).click()
  await page.getByRole('checkbox', { name: /^Gym/ }).check()
  await page.getByRole('button', { name: 'Start with the demo' }).click()
  await page.getByRole('button', { name: /^Gym/ }).click()
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await page.getByRole('searchbox', { name: 'Search exercises' }).fill('bench')
  await page.getByRole('button', { name: 'Bench press' }).click()
  await expect(page.getByLabel('Bench press, set 1, RPE')).toBeVisible()
  await page.goto('./#/programs')
  await expect(page.getByRole('link', { name: /Design with AI \(optional\)/ })).toBeVisible()
  // The demo is managed from Settings only.
  await expect(page.getByRole('link', { name: /Demo programs/ })).toHaveCount(0)
  await page.goto('./#/programs/generate')
  await expect(page.getByRole('heading', { name: 'No AI model set up' })).toBeVisible()
})

test('a set of sessions: written once, then Today runs the next one or any other', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('checkbox', { name: /^Gym/ }).check()
  await page.getByRole('button', { name: 'Start with the demo' }).click()
  await expect(page.getByRole('heading', { name: 'Full body A' })).toBeVisible()
  await page.goto('./#/programs')
  await page.getByRole('button', { name: /A set of sessions/ }).click()
  await page.getByLabel('Name', { exact: true }).fill('My split')
  await page.getByRole('textbox', { name: 'Session 1', exact: true }).fill('Leg day')
  await page.getByRole('button', { name: 'Add exercise' }).click()
  await page.getByRole('searchbox', { name: 'Search exercises' }).fill('squat')
  await page.getByRole('button', { name: 'Back squat' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Add session' }).click()
  await page.getByRole('textbox', { name: 'Session 2', exact: true }).fill('Bodyweight')
  await page.getByRole('button', { name: 'Add exercise' }).last().click()
  await page.getByRole('searchbox', { name: 'Search exercises' }).fill('push')
  await page.getByRole('button', { name: 'Push-up' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('radio', { name: 'Week by week' })).not.toBeChecked()
  await accessible(page, 'set of sessions')
  await page.getByRole('button', { name: 'Save program' }).click()
  await page.getByRole('button', { name: 'Make current' }).click()
  await expect(page.getByText('2 sessions, in any order · current program')).toBeVisible()

  await page.getByRole('link', { name: 'Today' }).click()
  await expect(page.getByRole('heading', { name: 'Leg day' })).toBeVisible()
  await expect(page.getByText('session 1 of 2, in any order')).toBeVisible()
  await page.getByRole('button', { name: 'Choose another session' }).click()
  await expect(page.getByRole('heading', { name: 'My split (current)' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Beginner full body' })).toBeVisible()
  await accessible(page, 'choose a session')
  await page.getByRole('button', { name: /^Bodyweight/ }).click()
  await expect(page.getByRole('heading', { name: 'Bodyweight', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Push-up' })).toBeVisible()
})

test('AI proposes exercises, picked and edited before they reach the library', async ({ page }) => {
  const proposal = {
    exercises: [
      ['Campus board', 'reps'],
      ['Dead hang', 'time'],
      ['Hangboard repeaters', 'time'],
    ].map(([name, metric]) => ({
      name,
      discipline: 'Climbing',
      metric,
      distanceMeters: null,
      pace: null,
      muscles: null,
      notes: null,
    })),
  }
  // A local OpenAI-compatible server, answered by the test.
  await page.route('http://127.0.0.1:9/v1/chat/completions', (route) =>
    route.fulfill({
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        id: 'mock',
        object: 'chat.completion',
        created: 0,
        model: 'mock',
        choices: [
          { index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(proposal) } },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    }),
  )
  await page.goto('./')
  await page.getByRole('button', { name: 'Start empty' }).click()
  await page.goto('./#/settings/ai')
  await page.getByLabel('Provider').selectOption({ label: 'Custom endpoint (OpenAI-compatible)' })
  await page.getByLabel('Endpoint address').fill('http://127.0.0.1:9/v1')
  await page.getByLabel('Model').fill('mock')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Saved.')).toBeVisible()

  await page.goto('./#/exercises')
  await page.getByRole('link', { name: 'With AI' }).click()
  await page.getByLabel('Sports').fill('Climbing')
  await page.getByText('Essentials', { exact: true }).click()
  await accessible(page, 'exercises with AI')
  await page.getByRole('button', { name: 'Propose exercises' }).click()
  await expect(page.getByRole('heading', { name: 'Proposed exercises' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Climbing (new discipline)' })).toBeVisible()
  await accessible(page, 'proposed exercises')
  await page.getByRole('checkbox', { name: 'Add Dead hang' }).uncheck()
  await page.getByRole('button', { name: 'Edit Campus board' }).click()
  await page.getByLabel('Name').fill('Campus board ladders')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('button', { name: 'Add 2 exercises' }).click()

  await expect(page.getByRole('heading', { name: 'Exercises', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Climbing.*2 exercises/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Campus board ladders/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Hangboard repeaters/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Dead hang/ })).toHaveCount(0)
})

test('once loaded, the app opens offline', async ({ page, context }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Start empty' }).click()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  // The service worker precaches the shell on first visit.
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller)
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }))
    return reg.active?.state
  })
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  await page.goto('./#/progress')
  await expect(page.getByRole('heading', { name: 'Progress' })).toBeVisible()
  await context.setOffline(false)
})
