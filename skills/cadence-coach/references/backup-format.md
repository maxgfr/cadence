# Cadence backup format (version 13)

A backup is one JSON document, written by Settings → Export backup. The source of truth is
`src/core/model/schemas.ts` in the Cadence repository (zod schemas); this page describes what `cadence.mjs` reads and
writes.

## Units and ids

- Every stored value is metric: weights in kg, distances in m, times and rests in s. Session `duration` is in minutes.
  Pounds and yards are a display setting only.
- Dates are local calendar days, `YYYY-MM-DD`. Instants (`exportedAt`, `createdAt`, `updatedAt`, `startedAt`) are ISO
  8601 strings.
- Ids are strings. Records the athlete makes get a ULID (26 characters, Crockford base 32, time first). Presets have
  stable ids: `preset-<slug>` for exercises, `preset-gym`, `preset-swim`, `preset-running` for disciplines,
  `preset-program-<id>` for programs. The demo uses `demo-*` ids and readable exercise ids (`back-squat`).
- `updatedAt` dates each record's last change; a sync between two devices keeps the newer record.

## Top level

| Key           | Content                                                                              |
| ------------- | ------------------------------------------------------------------------------------ |
| `app`         | always `"cadence"`                                                                   |
| `version`     | `13`                                                                                 |
| `exportedAt`  | when the file was written                                                            |
| `settings`    | mode, `language`, `exerciseLanguage` (`en`, `fr`, `de`), units, week start, theme…   |
| `disciplines` | `{ id, name (1–40), color, rest?, updatedAt? }`                                      |
| `exercises`   | see below                                                                            |
| `programs`    | see below                                                                            |
| `sessions`    | see below                                                                            |
| `goals`       | `{ id, kind: exercise or weekly_volume or frequency, exerciseId?, disciplineId?, … }` |
| `notes`       | free notes `{ id, text, createdAt, updatedAt? }`                                     |
| `deleted`     | tombstones `{ collection, id, deletedAt }` for sync                                  |
| `parts`       | absent in a whole backup; a partial export lists the parts it holds                  |

Older versions (1 to 12) are migrated by the app on import. `cadence.mjs` writes only version 13. It reads version 12
as 13, since 13 only added optional blocks (a version 12 block is required); for an older file, export again from the
app to bring it up to date.

## Exercise

`{ id, name (1–80), disciplineId?, metric, pace?, muscles?, stroke?, distance?, notes? (≤500), description? (≤4000),
photo?, rest?, updatedAt? }`

- `metric`: `weight_reps` (load × reps), `reps` (bodyweight reps), `time` (holds), `distance_time` (a distance in a
  time).
- `muscles`: any of `quads`, `hamstrings`, `glutes`, `calves`, `chest`, `back`, `shoulders`, `biceps`, `triceps`,
  `core`, `full_body`.
- `pace`: `100m` or `km`, for open-distance exercises. `distance`: a fixed distance in m (a 50 m event), so a logged set
  only needs a time.
- Assisted machines (`preset-assisted-pull-up`, `preset-assisted-dip`) are counted in reps; the weight logged with them
  is the counterweight that helps, never a load.
- A preset exercise added by the app is named in `settings.exerciseLanguage`; `references/presets.json` holds every
  preset's name in English, French and German.

## Session, entry, set

- Session: `{ id, date, title (≤80), disciplineId?, programRef?, entries, status: active or done, startedAt?,
  duration? (min), rpe? (1–10), notes? (≤1000), updatedAt? }`.
- `programRef`: `{ programId, week, day, dayId? }`, the program day the session was started from.
- Entry: `{ id, exerciseId, sets, planned?, notes? (≤300) }`. `planned` is a copy of the program block the entry came
  from. One session can hold several entries on the same exercise.
- Set: `{ reps? (0–1000), weight? (kg), time? (s), distance? (m), rpe? (1–10), done }`. Only sets with `done: true`
  were ticked; the summary counts those only.

## Program, week, day, block

- Program: `{ id, name (1–80), goal (≤300), layout?, weeks (at least one), source: manual or template or ai,
  templateId?, resets?, createdAt, updatedAt }`.
- `layout`: `weeks` (followed week by week; the default when absent) or `sessions` (a set of sessions done in turn,
  kept as the days of its only week).
- Week: `{ id, name? (≤60), days }`. Day: `{ id, name (1–60), disciplineId?, blocks, notes? (≤500) }`.
- Block: `{ id, exerciseId, sets (1–50), reps? (1–500), perSet?, distance? (m), duration? (s), intensity?, rest? (s),
  interval? (s), tempo? (≤20), notes? (≤300), optional? }`.
- `intensity`: `{ kind, value }`, value above 0. Kinds: `kg` (a load), `pct1rm` (share of the one-rep max), `rpe` (1–10),
  `pace` (seconds per repetition), `pctmax` (share of the athlete's best).
- `perSet`: up to 50 `{ reps?, value? }`, set by set in order when sets differ (a pyramid); `value` is in the block's
  intensity kind, and what a set leaves out is the block's.
- `optional`: `true` for a block planned in case there is time. The app offers it beside the session, and it becomes
  part of the session only when the athlete adds it. Absent or `false` is a required block, as every block before
  version 13.

## Restoring a backup in the app

A backup written by `remap` replaces the athlete's library: it is meant for a device whose data was erased first.

1. Keep the original export: it is the only way back.
2. In Cadence, open Settings. Under Erase, choose **Erase all training data…**, then **Erase everything**. This deletes
   every program, session, goal and exercise on the device; settings stay.
3. Still in Settings, under Your data, choose **Import backup** and pick the new file.
4. In the **Import a backup** sheet, keep every part ticked under **What to import** (History, Exercises, Programs,
   Goals, Notes, Settings). Either **Add** or **Replace** works on an empty device. Choose **Import**.

On import, an exercise or discipline of the file whose name matches one already on the device (case and punctuation
ignored) is merged into it. Erase and import leave no deletion records, so a device synced with this one keeps its own
records, and what this device no longer has comes back at the next sync: erase every synced device first.

A backup written by `program` into a backup of the device's current data only adds a program: import it with **Add**,
without erasing. Ticking Programs is enough: the exercises and disciplines the program uses come with it when missing.
