---
name: cadence-coach
description: Use when an athlete shares a Cadence training backup (a cadence-backup-*.json file exported from the Cadence app) and wants it read or changed - a summary of their training history (sessions, best sets, last sets, weekly sets per muscle), moving their own exercises onto the app's preset exercises so they can erase the app and import a clean backup, or designing and optimising a training program from the preset exercises and adding it to the backup to import.
---

# Cadence coach

Cadence is a local-first training tracker (gym, swimming, running). Its backup is one JSON file; this skill reads it,
maps the athlete's exercises to the app's presets, and writes a new backup for the athlete to import. It never changes
the athlete's file: every command that writes takes an `-o` path and refuses to write over its inputs.

References:

- `references/backup-format.md`: the backup's shape (version 12) and how to restore a backup in the app.
- `references/presets.json`: every preset exercise (slug, id, sport, metric, muscles, names in English, French and
  German), the preset disciplines and the app's preset programs. Generated from the app's source.
- `references/programming.md`: an evidence summary for designing hypertrophy programs (volume, per-session ceiling,
  proximity to failure, rest, exercise selection, progression) and how to read a Cadence history against it.
- `references/examples/`: a worked example, a Push Pull Legs on machines done once a week (a spec for `program`), with
  how it was built from an athlete's sessions and what `volume` says about it.

## Tools

One script, plain Node 18 or later, no install: `node <skill-dir>/scripts/cadence.mjs <command>`. It prints its usage
when run without a command, and exits with code 1 and a message on stderr when anything is wrong.

### summary

```sh
node <skill-dir>/scripts/cadence.mjs summary <backup.json> [--json]
```

Per session: date, title, exercises, ticked sets, duration (min), RPE. Per exercise: name, id, preset or custom,
sessions, ticked sets, sets per session, best estimated 1RM (Epley, from sets of 1 to 12 reps, as the app computes it),
heaviest set, best reps, hold, time or pace for exercises not measured by load, and the last session's sets. Sets per
muscle per ISO week: a crude count where a set counts once for every muscle its exercise lists. Only ticked sets count.
On assisted machines the weight is the assistance, never a load: they get no 1RM.

### presets

```sh
node <skill-dir>/scripts/cadence.mjs presets [--sport gym|swim|running] [--muscle <muscle>] [--json]
```

Lists preset exercises: slug, id, sport and metric, muscles, names in English, French and German.

### match

```sh
node <skill-dir>/scripts/cadence.mjs match <backup.json> [--json]
```

For every exercise that is not a preset: where it is used (sessions, programs, goals, or unused) and its preset
candidates. `sure`: its name is a preset's name in one of the three languages, compared as the app compares names.
`ambiguous`: up to three candidates by shared words (with a small French, English and German synonym table), with a
score. `none`: no candidate. Ends with a mapping to edit, `{ "<exerciseId>": "<slug>" | null }`, filled for `sure`
matches only.

### remap

```sh
node <skill-dir>/scripts/cadence.mjs remap <backup.json> <mapping.json> -o <out.json> [--drop-programs] [--keep-unused]
```

The mapping is `{ "<exerciseId>": "<slug>" }`; a slug can also be given as `preset-<slug>`, and `null` means no preset.
Moves every session entry, program block and goal onto the mapped presets; two exercises mapped to one preset become
one. Fails, listing them, while an exercise that sessions or programs use has no preset. `--drop-programs` drops every
program instead (sessions then lose their link to it). The output holds only `preset-*` exercises: those already in the
backup as they are, and the presets mapped to that it lacked, named in `settings.exerciseLanguage`, in the backup's
matching discipline, with the notes, description, photo and rest of the athlete's exercise. Custom exercises are
dropped, unless `--keep-unused` keeps those nothing maps or uses. Goals on an exercise left without a preset are
dropped. The file is a whole backup (no `parts`, no deletion records), meant to be imported after erasing the app's
data; see `references/backup-format.md`.

### program

```sh
node <skill-dir>/scripts/cadence.mjs program <spec.json> --into <backup.json> -o <out.json>
```

Adds a program to a backup. The spec:

```json
{
  "name": "Upper lower",
  "goal": "Get stronger on the main lifts",
  "days": [
    {
      "name": "Upper",
      "notes": "optional",
      "blocks": [
        { "slug": "barbell-bench-press", "sets": 4, "reps": 6, "intensity": { "kind": "rpe", "value": 8 }, "rest": 150 },
        { "slug": "plank", "sets": 3, "duration": 45, "rest": 60, "notes": "optional" }
      ]
    }
  ]
}
```

Limits, from the app's schema: name 1–80 characters, goal up to 300, day name 1–60, day notes up to 500; each day has at
least one block. Block: `sets` 1–50, `reps` 1–500 (whole numbers), `duration` and `distance` above 0 (s, m), `rest`
0 or more (s), `interval` above 0 (s), `tempo` up to 20 characters, `notes` up to 300. `intensity.kind`: `kg`, `pct1rm`,
`rpe` (1–10), `pace`, `pctmax`, with a value above 0. `perSet`: up to 50 `{ reps?, value? }` for sets that differ,
`value` in the block's intensity kind. Unknown fields are refused. Every slug must be a preset (see `presets`).

The program is a set of sessions done in turn (`layout: "sessions"`, one week), marked as written by AI. Its days go in
the discipline of their exercises' sport (the backup's own, found as the app finds it, else a new preset discipline).
Preset exercises the backup lacks are added; an exercise the athlete already has under a preset's name in any language
is used as it is.

### volume

```sh
node <skill-dir>/scripts/cadence.mjs volume <spec.json> [--json] [--ceiling 11] [--floor 6]
node <skill-dir>/scripts/cadence.mjs volume <backup.json> --program <name or id> [--week 1] [--json] [--ceiling 11] [--floor 6]
```

Counts a program's sets per muscle, from a spec (as `program` reads it) or from a program in a backup (by id, or by
name as the app compares names; `--week` picks the week of a program that has several). Fractional counting, as in
`references/programming.md`: each set counts 1 for the first muscle its exercise lists and 0.5 for each other one. Sets
on exercises that list no muscle (hip adduction, wrist curl, tibialis raise) are shown apart, not counted. Per day:
sets, exercises, fractional sets per muscle. Per week: the days summed, since each day is taken as one session of the
week, sorted from the most. Flags, advice only (the exit code stays 0): `above ceiling`, a muscle above `--ceiling`
fractional sets in one session; `below floor`, a muscle under `--floor` fractional sets in the week, `no work` at 0
(`full_body` is never flagged); `repeated`, an exercise on more than one day, where another exercise for the same
muscle gives variety.

## Workflow

1. **Find the backup.** Use the newest `cadence-backup-*.json` the athlete points to (often in their Downloads folder).
   If its `parts` field lacks `history`, the export holds no sessions: ask the athlete to export again from Settings →
   Your data → **Export backup**, with every part ticked under **What to export** (History, Exercises, Programs, Goals,
   Notes, Settings). Never modify the athlete's file; write outputs next to it, or where the athlete asks.
2. **Read the history.** Run `summary` (add `--json` when you need the numbers) and read it against
   `references/programming.md`: sets per session, ramping sets logged as working sets, whether RPE is logged, session
   length.
3. **Map the exercises.** Run `match`. Accept the `sure` rows after a glance. Ask the athlete about every `ambiguous`
   or `none` row that sessions use (with the AskUserQuestion tool when it is available), giving the loads and reps they
   logged on it to help them recall the machine. Custom exercises nothing uses can be dropped (`null`). Write the
   mapping to `mapping.json` in a scratch or temporary directory.
4. **Research.** Before designing, refresh the evidence with a web search: weekly volume, the per-session ceiling,
   proximity to failure, rest, exercise selection. Note anything that changes `references/programming.md`, and cite
   the sources in your report.
5. **Design.** Ask for or confirm the constraints: equipment (machines only, for example), sessions per week, session
   length, goals. Then:
   - Use preset slugs only (`presets --sport gym --muscle <muscle>`).
   - Count fractional sets per muscle per session, and per week (`volume` does it).
   - Starting loads come from the history (`kg`); for an exercise the athlete has not done, use an `rpe` intensity.
   - Put each block's rep range and progression rule in its notes; `reps` is the bottom of the range.
   - Write program and day names and notes in the language the athlete asks for (English by default). Exercise names
     come from `settings.exerciseLanguage`.
   - Keep the exercises the athlete says they like; put compound movements first.
   - Run `volume` on the draft spec and fix what it flags before building, or tell the athlete why a flag is accepted.
   - The app's preset program `gym-machines-ppl` (`src/core/presets/presets.ts` in the Cadence repository, also in
     `references/presets.json`) and `references/examples/` are worked examples.
6. **Build.** Run `remap`, usually with `--drop-programs` when the old programs use exercises that are dropped, then
   `program` on its output, writing `cadence-import-<date>.json`. Check the counts the commands print: every session
   kept; run `summary` on the result and compare the ticked sets with the original's.
7. **Hand over.** Tell the athlete how to restore (erase, then import the whole file, every part ticked: see
   `references/backup-format.md`), what changed and why, the sets per session and per muscle, the starting loads and
   the progression rule. The data stays on the athlete's device: they erase and import on the device themselves.
8. **Later runs.** With a newer backup, run the same steps against the program: adherence (ticked over planned sets),
   exercises where every set reached the top of the range (raise the load), then write an updated program. A program
   added to a backup of the device's current data is imported with **Add**, without erasing; the athlete can then
   delete the old program in the app.
