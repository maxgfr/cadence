# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated, confirmed in the approved plan: the stack and conventions of the author's `cursus` app. Bun 1.4 (package manager, scripts, `bun test`), Vite 8 + vite-plugin-pwa 2, React 19, TypeScript 7 strict, wouter, native CSS (custom-property tokens + CSS Modules), Biome 2, zod 4, IndexedDB through `idb`. Charts are hand-written SVG, no charting library. Static hosting on GitHub Pages under `/cadence/`; no server of any kind.

## Users

Any athlete who trains on their own, in whatever sports they choose (the demo covers gym, swimming and track and field). No assumption about level: a beginner starting from a demo program and an experienced athlete writing their own blocks use the same app. Two moments of use:
- at the gym, the pool or the track, on a phone, between sets, with sweaty hands, little attention and often no network;
- at a desk (laptop or tablet), planning a program, reviewing history and progress.

## Product Purpose

Cadence plans and logs training sessions and shows what the training produced. A user creates their disciplines and exercises (or loads a demo sport), picks or writes a program (weeks, days, planned blocks such as "5×5 @80%", "8×50 m free @1:00", "6×60 m @95%, rest 3'"), starts today's session pre-filled from it, logs what was actually done set by set, and sees personal records, goals and progress over time. Success: the user opens the app at the gym, sees today's session, logs it without friction, and trusts the numbers they see afterwards.

## Positioning

Local-first and account-free: data lives on the device, exports to open JSON/CSV, nothing is sent anywhere. One log covers every sport the user defines in the same model (sets of weight×reps, reps, time, distance) instead of one app per sport. Everything works without AI; AI program design is optional, uses the user's own key and model (from the `llm-models` catalog, or a local OpenAI-compatible server), and always produces an editable draft that is saved only on confirmation.

## Operating Context

- Ritual: open Today, start the planned session, any other session of a program, or a free session; log sets (no clock runs; a rest timer only when the athlete starts it from an exercise), finish with session RPE and notes.
- Starting: the app is empty. The user creates disciplines and exercises (also from the exercise picker, mid-session), or loads demo sports (Gym, Swimming, Track and field, any combination) with their exercises and programs (beginner full-body, 5/3/1-style strength, 1500 m swim build, 100 m sprinter block), optionally with example sessions; the demo can be removed again.
- Planning: edit a demo program, write one from scratch, or generate one with AI from a questionnaire or from the user's own history, PRs and goals. The demo is loaded and removed from Settings only.
- Library: create exercises by hand, or have AI propose a library for chosen sports (picked from and edited before it is added).
- Programs are a set of sessions done in any order and repeated (Leg day, Bodyweight…), or a week-by-week plan to an end (user request).
- Goals start from what is logged: the current best or recent average, with a suggested target the user can change (user request).
- Review (Progress, with History as its second view): history list, progress charts (e1RM, weekly volume per discipline, pace per 100 m or per km, best times), PRs, goals with a projection to their deadline, consistency and adherence (planned vs. done).
- Backups are manual: JSON export/import, CSV export of sessions.

## Capabilities and Constraints

- Local-first PWA: IndexedDB is the source of truth; works fully offline once installed.
- Interface in English only.
- Disciplines are the user's own (name and colour); none exists by default and nothing is pre-selected: exercises, program days and sessions have a discipline only when the user picks one (user request).
- Defaults: metric (kg, m), week starts Monday; switchable to lb and yd in Settings. Stored values are always metric.
- Effort scale: RPE 1–10, per set and per session, for every discipline.
- Two modes, chosen at first run and switchable in Settings (user request): **Normal** shows the essentials (sets, reps, load or time or distance, session RPE, the main charts, a short AI questionnaire); **Advanced** adds per-set RPE, intensity prescriptions (%1RM, RPE, pace, % of max), rest and tempo in plans, extra stats (tonnage per muscle group, adherence) and the full AI questionnaire. The mode only hides or shows fields; the data model is the same, so switching never loses data.
- Intensity in plans: kg, %1RM, RPE, pace, or % of max.
- AI is BYOK, called directly from the browser; keys and base URL stay on the device and are excluded from exports. AI never writes data without confirmation.
- No account, no sync service, no analytics.

## Brand Commitments

- Name: cadence (lowercase in the repo; "Cadence" as the app title).
- Direction set in the approved plan: sober and athletic, built on dense, legible data; one accent colour; light and dark; tabular figures for times and loads; mobile-first with large touch targets on the logging screen.
- No logo or brand colour imposed beyond that.

## Evidence on Hand

None: no users, testimonials, metrics or assets. Do not fabricate any. Example data in templates is generic training content, not user data.

## Product Principles

1. Logging beats everything: the fewest taps between "start" and "set saved", usable one-handed mid-workout.
2. Truthful numbers: stats derive only from logged sets; projections are labelled as projections.
3. Plan and done side by side: every session shows what was planned and what happened.
4. The user owns the data: open export formats, no lock-in, no account.
5. AI is an assistant, never an author of record: drafts only, always editable, never required.

## Accessibility & Inclusion

- WCAG 2.2 AA target; checked with axe in the Playwright smoke test.
- Touch targets of at least 44px, larger on the logging screen; works with keyboard on desktop; respects reduced motion and system dark mode.
- Units and number formats must not assume the metric system once the user switches.
