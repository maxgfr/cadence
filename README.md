# Cadence

Cadence is a training tracker that runs entirely in the browser, for whatever you train: you create your own
disciplines (Gym, Swimming, Climbing…) and exercises, write programs, start today's session pre-filled from them, log
sets, and follow records, goals and progress charts. It works offline, keeps its data on the device,
and needs no account. The app starts empty; a demo (Gym, Swimming, Track and field, any combination) gives a solid
starting point. AI, to design programs and propose exercises, is optional and uses your own model and key.

- App: <https://maxgfr.github.io/cadence/>
- Interface language: English.

## Features

- **Your disciplines and exercises**: create the sports you train (name and colour) and their exercises, measured by
  load × reps, bodyweight reps, time held, or distance and time (with a fixed distance for events such as a 60 m
  sprint, and pace per 100 m or per km). Nothing is chosen for you: an exercise, a day or a session has a discipline
  only if you pick one. Exercises can be created from the picker, in the middle of a session, or proposed by AI.
- **Demo**: on the welcome screen or in *Settings › Demo*, pick Gym, Swimming, Track and field, or several: each brings
  its discipline, exercises (main lifts and accessories; strokes and drills; sprints, runs, drills and plyometrics) and
  programs (beginner full body, 5/3/1-style strength, push/pull/legs as a set of sessions, 1500 m swim build,
  100 m sprinter block). Ten weeks of example
  sessions and a goal per sport can be added to see the charts. Everything stays editable, and *Remove the demo* takes
  it away again, keeping what your own records use.
- **Today**: *Resume session* when one is in progress; *This week* (Monday to Sunday by default): the sessions
  logged each day, then, for each program under way, its todo for the week (the days of its week under way, or each
  session of a set once), ticked off as they are done, with what is left to finish the program; *New session*: every
  session of every program, each pre-filled from its plan ("5×5 @80%", "8×50 m @1:50", "6×60 m @95% max · rest
  3:00"), and a free session per discipline; the next goals. There is no "current" program: switch between programs
  during the week as you like. Starting a session while one is in progress asks whether to save or discard it.
- **Logging**: one card per exercise, one row per set with large touch targets, values pre-filled from the plan, a
  tick per set. No clock runs: a rest timer starts only when you tap *Rest* on an exercise (its planned rest, or the
  length set in Settings; −15 s, +15 s, skip, vibration at the end). Finish with the duration, an effort rating
  (RPE 1–10) and notes.
- **Programs**: every program you have, and two ways to write one: *a set of sessions* done in any order, again and
  again (Leg day, Upper body, Bodyweight…), or *a week-by-week plan* that progresses to an end. A full editor
  (sessions or weeks and days, their discipline, exercises, sets, reps, distances, intensity, rest, send-off interval,
  tempo), and optional AI design. The demo's programs are loaded from *Settings › Demo*.
- **Progress**: two views. *Overview*: goals, a training calendar, the best value per session of any exercise
  (estimated 1RM, best time, best pace, most reps, longest hold) with its records, and weekly volume per discipline
  (kilograms lifted, distance covered). *History*: every finished session by month, with what was planned next to
  what was done and the records it set; log a session on any date, edit its details (name, date, discipline,
  duration, effort, notes) or its sets, delete it with undo, and export all as CSV.
- **Goals**: a target and a deadline. Pick a sport, then any of its exercises: the goal is on what that exercise is
  measured by (estimated 1RM, most reps in a set, longest set, best time or pace). Or a goal on a sport (or all
  training): sessions a week, or weekly volume in Advanced. The form shows where you are (your best, or your average
  of the last four weeks) and suggests a target that stretches it within reach, which you change as you like. A goal
  can be started from any exercise's chart, and shows a trend projected to its deadline.
- **Two modes**: *Normal* shows the essentials. *Advanced* adds effort per set, intensity targets (%1RM, RPE, pace,
  % of best effort), rest and tempo in plans, sets per muscle group, adherence to the plan, goal charts and the
  full AI questionnaire. Switching never loses data.
- **Units**: kilograms or pounds, metres or yards, week starting Monday or Sunday, light and dark themes.
- **Installable and offline**: a PWA; once installed it works without a network.

## Training data model

All values are stored in metric units (kilograms, metres, seconds); units only change what is displayed and typed.

| Entity | Fields |
|---|---|
| Discipline | name, colour (one of eight palette slots) |
| Exercise | name, discipline (optional), metric (`weight_reps`, `reps`, `time`, `distance_time`), pace unit (`100m`, `km`), muscles, stroke, fixed distance |
| Program | name, goal, layout (`weeks`, or `sessions`: a set done in any order), weeks → days (each with an optional discipline) → blocks, source (`manual`, `template`, `ai`) |
| Block | exercise, sets, reps, distance, duration, intensity (`kg`, `pct1rm`, `rpe`, `pace`, `pctmax`), rest, send-off interval, tempo, notes |
| Session | date, title, discipline (optional), program day, entries → sets (reps, weight, time, distance, RPE, done), duration, RPE, notes |
| Goal | an exercise's best in what it is measured by (estimated 1RM, reps, time held, best time or pace), or weekly kilograms or distance, or sessions per week (in one discipline or all); target and deadline |

How the numbers are derived:

- **Estimated 1RM**: Epley, `weight × (1 + reps / 30)`, for sets of 1 to 12 reps.
- **Records**: a session's best on an exercise that beats every earlier session; lower is better for times and paces.
- **Swim and run pace**: seconds per 100 m over sets of 25 m or more.
- **Weekly volume**: weight × reps on loaded lifts and distance on distance sets, per discipline (an exercise's own,
  else its session's); only ticked sets count.
- **Adherence**: ticked sets over planned sets, per session and per program.
- **Goal projection**: a least-squares line through the last ten values (or eight full weeks) carried to the deadline.
- **Program progress**: the next day is the one after the furthest day completed, so a missed weekday never leaves you
  behind.

A backup is one JSON document (`app: "cadence"`, `version: 2`) validated on import; version 1 backups (fixed
disciplines, built-in exercises) are converted on import, and data stored by version 1 is converted when the app
opens. The CSV export has one row per set.

## AI (optional, your own key)

Cadence works fully without AI. With a model set up under *Settings › AI* it can:

- **Design a program** from a short questionnaire (disciplines, level, a set of sessions with no days or weeks to
  give, or days per week and weeks; goal; Advanced adds
  session length, equipment, target date, limitations and intensity style) for your disciplines or sports you name,
  or **from your own history** (recent
  sessions, records, goals and the programs under way, summarised; the exact text sent is shown before sending).
- **Adjust a week** of a program from what you actually logged.
- **Propose exercises** for your disciplines or sports you name (level, essentials or a complete library, equipment),
  each with its discipline, how it is measured, a fixed distance or a pace unit, and the muscles worked. Exercises you
  already have are left out; you untick and edit the list before adding it to your library.

Programs are checked against the program schema and open as a draft in the editor; nothing is saved until you save
it. Exercises and disciplines the model names that you do not have yet are added only when you save.

Providers and models come from [`llm-models`](https://github.com/maxgfr/llm-models): `bun run catalog` lists every
provider and model and keeps only the providers a web page can call directly (checked with a real CORS preflight from
the app's origin). *Refresh models* in the settings reloads the model lists in the browser through
`llm-models/browser`. A custom OpenAI-compatible endpoint covers Ollama, LM Studio or a proxy; local servers work from
a browser on the same computer. Ollama only answers pages it trusts: start it with
`OLLAMA_ORIGINS=https://maxgfr.github.io ollama serve` to use it from the deployed app, then enter
`http://localhost:11434/v1` and the model's name (for example `qwen2.5:7b`). Small local models may need a retry or
two to return a complete program.

## Privacy

- No account, no server, no analytics. Training data lives in IndexedDB in this browser.
- AI requests go straight from the device to the provider you chose, only when you ask for them.
- The API key and endpoint are stored on the device, apart from training data, and never included in backups.
- `maxgfr.github.io` is shared by every site the author publishes on GitHub Pages. If you rely on Cadence, deploy your
  own fork on your own domain, and export a backup now and then.

## Development

Requirements: [Bun](https://bun.sh).

```sh
bun install
bun run dev          # Vite dev server
bun run build        # production build
bun run preview      # serve the build
```

| Command | What it runs |
|---|---|
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` | Biome |
| `bun run test` | unit tests of `src/core` (stats, schemas, templates, storage and backup round trip, AI parsing with a mock model) |
| `bun run test:e2e` | Playwright smoke tests with axe on a phone and a desktop viewport, including offline use (run `bun run build` first) |
| `bun run catalog` | rebuild the bundled AI model catalog |
| `bun run check` | typecheck, lint, test, build |

`src/core` is plain TypeScript without React or the DOM. Product context is in [PRODUCT.md](PRODUCT.md) and the
design system in [DESIGN.md](DESIGN.md).

### Releases

Every push to `main` runs CI; when it is green, [semantic-release](https://semantic-release.gitbook.io) reads the
commits since the last tag ([Conventional Commits](https://www.conventionalcommits.org): `fix:` → patch, `feat:` →
minor, `BREAKING CHANGE:` → major), tags `vX.Y.Z`, publishes a GitHub release and deploys that version to GitHub
Pages. *Settings › About* shows the version and commit. A weekly workflow refreshes the AI model catalog through a pull
request.

## License

[MIT](LICENSE)
