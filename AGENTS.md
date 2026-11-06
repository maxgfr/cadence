# Cadence

Local-first training tracker PWA for gym, swimming and sprint (TypeScript, Bun, Vite, React), hosted on GitHub Pages
under `/cadence/`, no server.

## Commands

- `bun run dev` / `bun run build` / `bun run preview`
- `bun run typecheck`, `bun run lint`, `bun run test` (`bun test` on `src/core`)
- `bun run test:e2e` (Playwright + axe smoke test, phone and desktop; needs `bun run build` first; `E2E_PORT=…` when port 4173 is taken)
- `bun run catalog` (rebuild `src/core/ai/catalog.json` from `llm-models`, with a CORS probe per provider)
- `bun run check` = typecheck + lint + test + build

## Rules

- `src/core/**` is pure TypeScript: no React, no DOM. Tested with `bun test`; the UI is tested with Playwright.
- The UI is in English, French and German. Every visible string comes from `src/core/i18n/messages` (one namespace per
  file, `namespace(en, fr, de)`): English is the source, French and German must be complete (the type check and
  `i18n.test.ts` fail otherwise). Components read them with `useT()`; core code with `currentMessages()`. Numbers and
  dates go through `core/model/units.ts`, `core/model/dates.ts` and `core/i18n/locale.ts`, never `toFixed` or
  `toLocaleString` in a component.
- Every stored value is metric (kg, m, s); units are a display concern (`core/model/units.ts`).
- Data shapes live in `src/core/model/schemas.ts` (zod). A change to a stored shape needs a new `BACKUP_VERSION` and a
  migration; never change what an existing backup means.
- Normal and Advanced modes only show or hide fields: the data model is the same, and switching never drops data.
- Disciplines are user data: nothing in the app may assume a sport. Demo content lives in `src/core/demo` (stable
  `demo-*` ids so it can be removed), never in defaults. Stored data of an older shape is migrated in
  `core/storage/migrate.ts`, both on load and on backup import.
- AI is optional and never writes data: every AI result is a draft the user edits and saves. Keys and the endpoint live
  in `llm-connect`'s `sealedStore` (database `cadence-sealed`), encrypted at rest, never in clear text, and never appear in exports. The Anthropic browser header goes to Anthropic's own host only.
- AI and provider SDK code is loaded lazily (AI screens only); keep it out of the main chunk.
- Models are built through `llm-connect` (`createModel` in `core/ai/client.ts` maps our catalog to its settings);
  errors are read with its `describeError`. Prompts stay in English and end with `languageRule()`, so the model writes
  in the interface language.
- The coach (`core/ai/coach.ts`) only proposes: a model's actions become `CoachProposal`s, applied one by one by
  `screens/Coach/apply.ts` after the user confirms. Its conversation lives in memory; voice notes recorded offline wait
  in their own database (`cadence-voice`), never exported. The on-device speech runtime (onnxruntime, in
  `app/transcribe.worker.ts`) is cached on first use, never precached.
- Charts are hand-written SVG (`src/ui/charts`), following the dataviz rules in `DESIGN.md`. No charting library.
- Visual rules are in `DESIGN.md`, product truth in `PRODUCT.md`. `.impeccable/` is local working output, never committed.
- Gates are frozen: never skip, weaken or delete a test, no suppression comments.
- Docs are in English, factual, without tool or assistant attribution.
