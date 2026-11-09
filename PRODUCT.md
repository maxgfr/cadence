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

Local-first and account-free: data lives on the device, exports to open JSON/CSV, and goes only to the user's other device during a sync they start (QR code pairing, direct and end-to-end encrypted). One log covers every sport the user defines in the same model (sets of weight×reps, reps, time, distance) instead of one app per sport. Everything works without AI; AI program design is optional, uses the user's own key and model (from the `llm-models` catalog, or a local OpenAI-compatible server), and always produces an editable draft that is saved only on confirmation.

## Operating Context

- Home (user request): resume any session in progress, see this week (Monday to Sunday by default) with each program's todo and what is done, start any session of any program, and see the next goals. No program is "current": athletes switch between programs during the week.
- Back never changes tab: it returns within the tab, or is not shown (user request).
- Ritual: open Today, resume a session in progress or start a new one: any session of a program (the next one marked) or a free session. Several can be in progress at once, each restarted or discarded on its own, with undo (user request). A program's week can be reset from Today and a whole program restarted from its editor (user request): the sessions stay in the history and the stats, they just stop ticking its progress; log sets (no clock runs; a rest timer only when the athlete starts it from an exercise, its length from the plan, else the exercise, else its sport: set per discipline and exercise, not in global settings, user request), finish with session RPE and notes. A session done this week can be done again as often as wanted (user request). Each exercise shows what was done on it last time, and its sets start from the load really lifted then, over the plan's (user request; the plan stays on its own line). An exercise can be replaced during a session: for that session, with an offer to carry it into the program, for that session of the program only (user request).
- Starting: the app is empty. The user creates disciplines and exercises (also from the exercise picker, mid-session), or loads demo sports (Gym, Swimming, Track and field, any combination) with their exercises and programs (beginner full-body, 5/3/1-style strength, push/pull/legs as a set of sessions, 1500 m swim build, 100 m sprinter block), optionally with example sessions; the demo can be removed again.
- Planning: edit a demo program, write one from scratch, or have the coach design one (from what the user tells it, and their own history, PRs and goals). The demo is loaded and removed from Settings only. Presets (gym, swimming, running) add real exercise libraries and programs, apart from the demo's example data. A planned exercise can differ set by set (15 light, then 6 heavy).
- Library: create exercises by hand, or have AI propose a library for chosen sports (picked from and edited before it is added). Each exercise has a description (written by hand, or drafted by the coach and edited before it is saved) and the athlete's own notes, kept apart and readable during a session, and can hold a photo to recognise the machine, made small on the device (user request).
- Notes (user request): free notes, one record each, reached from Today and the sidebar; they sync like everything else.
- Programs are a set of sessions done in any order and repeated (Leg day, Bodyweight…), or a week-by-week plan to an end (user request).
- Goals are generic (user request): on any exercise, picked by sport, in what that exercise is measured by; or sessions or volume a week for a sport. They start from what is logged (the current best or recent average) with a suggested target the user can change.
- Review (Progress, with History as its second view): history list, progress charts (e1RM, weekly volume per discipline, pace per 100 m or per km, best times), PRs, goals with a projection to their deadline, consistency and adherence (planned vs. done).
- Backups are manual: JSON export/import, CSV export of sessions.

## Capabilities and Constraints

- Local-first PWA: IndexedDB is the source of truth; works fully offline once installed.
- Interface in English, French and German: the system's language by default, switchable in Settings. Dates and numbers follow the language (decimal comma in French and German); the demo is loaded in it. Stored values and the CSV export do not change with the language.
- Disciplines are the user's own (name and colour); none exists by default and nothing is pre-selected: exercises, program days and sessions have a discipline only when the user picks one (user request).
- Defaults: metric (kg, m), week starts Monday; switchable to lb and yd in Settings. Stored values are always metric.
- Effort scale: RPE 1–10, per set and per session, for every discipline.
- Two modes, chosen at first run and switchable in Settings (user request): **Normal** shows the essentials (sets, reps, load or time or distance, session RPE, the main charts); **Advanced** adds per-set RPE, intensity prescriptions (%1RM, RPE, pace, % of max), rest and tempo in plans, extra stats (tonnage per muscle group, adherence). The mode only hides or shows fields; the data model is the same, so switching never loses data.
- Intensity in plans: kg, %1RM, RPE, pace, or % of max.
- AI is BYOK, called directly from the browser; keys and base URL stay on the device and are excluded from exports. AI never writes data without confirmation.
- Coach (user request): a typed conversation that logs the sets the athlete tells it, sets the app up (exercises, programs, goals, settings) and gives advice ("is this exercise a good idea for me?"); each change is a card applied only on confirmation. It is the only way to AI in the interface (user request: "AI everywhere" was too much): on a computer a column always beside the app (user request), elsewhere one bubble on every screen (above the rest timer while logging); the screen tells the coach where the athlete is and offers requests that fit. No voice (user request: the models they use do not take audio). On a model with the provider's own web search, a description it is asked for is checked on the web and followed by its sources as links (user request); the photo stays the athlete's to add, a page offering no way to import one without a server. The conversation is never stored or exported.
- No account, no sync server, no analytics. Device-to-device sync (user request): a QR code pairs two devices, public relays only introduce them, the data is end-to-end encrypted and merged both ways (newest change wins, deletions carry over). Training on one device and editing programs on another is the expected use (user request): a session stays on its program day when days are deleted elsewhere, a deletion never takes away an exercise or discipline still used, and a program changed on both devices since they last synced keeps the older version as a dated copy. Everything syncs, the AI settings and key included (user request: "sync everything"); a device not set up yet can sync from the link or the welcome screen.

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
