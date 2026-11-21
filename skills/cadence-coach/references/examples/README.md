# Worked example: Push Pull Legs on machines, once a week

`ppl-machines-1x-week.json` is a program spec for the `program` command: three sessions (Push, Pull, Legs), each done
once a week, on machines and cables. Intensities are RPE only, with no personal loads, so it fits any athlete; each
block's notes give its rep range and the double progression rule, and `reps` is the bottom of the range.

The app's four gym preset programs, all on machines and cables (Push Pull Legs once a week, full body three or two times
a week, upper/lower four times a week), are in `../presets.json`.

It was built with an athlete from their own last Push, Pull and Legs sessions:

- Their exercises were kept, reordered with the compound movements first (chest press, lat pulldown, leg press).
- Ramping sets they logged as working sets became two warm-up sets (not logged) and 3–4 hard sets.
- On Pull, the machine lateral raise became the cable lateral raise, for variety beside the machine one on Push.
- A leg extension was added, because the leg press was their only quadriceps exercise.
- The machine high row was dropped: it overlapped the lat pulldown and the machine row, and back was above the
  per-session ceiling.
- An ab crunch machine was added on Push, because nothing in the program trained the core.
- A cable curl was added on Pull, for more biceps work.

## Volume

`node scripts/cadence.mjs volume references/examples/ppl-machines-1x-week.json` prints:

```text
Push Pull Legs — machines (1×/week): 3 days
Each day is one session of the week: the week is the program's days summed.
Fractional sets: a set counts 1 for the first muscle its exercise lists (direct) and 0.5 for each other one (indirect).

Push: 23 sets, 7 exercises
  chest 11.5, triceps 8, shoulders 5.5, core 3

Pull: 23 sets, 6 exercises
  biceps 11, back 10, shoulders 8

Legs: 23 sets, 7 exercises
  hamstrings 7, quads 7, glutes 5, calves 3
  not counted (no muscles): Hip adduction machine 3

Per week
  shoulders 13.5, chest 11.5, biceps 11, back 10, triceps 8, hamstrings 7, quads 7, glutes 5, calves 3, core 3
  not counted (no muscles): 3 sets

Flags (advice: ceiling 11 per muscle per session, floor 6 per muscle per week)
  above ceiling: chest 11.5 on Push
  below floor: calves 3
  below floor: core 3
  below floor: glutes 5
```

## What it leaves out

- **Core**: 3 sets a week, from the ab crunch machine alone.
- **Calves**: 3 sets a week, from the standing calf raise alone.
- **Glutes**: 5 fractional sets a week, 3 of them from the hip abduction machine and 2 counted indirectly from the leg
  press.
- **Hip adduction**: its 3 sets are not counted, because the preset lists no muscle for it.
- **Above the ceiling**: chest (11.5 on Push) passes the 11 fractional sets per session past which no extra hypertrophy
  is detectable, by 0.5. With each muscle trained once a week, the extra sets add little rather than harm (see
  `../programming.md`).
