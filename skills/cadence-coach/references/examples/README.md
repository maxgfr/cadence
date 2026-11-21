# Worked example: Push Pull Legs on machines, once a week

`ppl-machines-1x-week.json` is a program spec for the `program` command: three sessions (Push, Pull, Legs), each done
once a week, on machines and cables. Intensities are RPE only, with no personal loads, so it fits any athlete; each
block's notes give its rep range and the double progression rule, and `reps` is the bottom of the range. Every day
ends with optional blocks (`"optional": true`), done in case there is time. Its blocks are those of the app's preset
`gym-machines-ppl`.

The app's four gym preset programs, all on machines and cables (Push Pull Legs once a week, full body three or two times
a week, upper/lower four times a week), are in `../presets.json`.

It was built with an athlete from their own last Push, Pull and Legs sessions:

- Their exercises were kept, reordered with the compound movements first (chest press, lat pulldown, leg press).
- Ramping sets they logged as working sets became two warm-up sets (not logged) and 3–4 hard sets.
- On Pull, they had tried the cable lateral raise for variety and went back to the machine lateral raise: side delts
  are trained on both days, with the same 4 sets.
- A leg extension was added, because the leg press was their only quadriceps exercise.
- Their gym has a leg extension and a lying leg curl only, no seated leg curl: the seated leg curl (4 sets) left the
  Legs day, the lying leg curl took its place with 5 sets (from 3), and the leg extension went from 3 to 4 sets.
- On Legs, the hip abduction machine went from 3 to 4 sets and the standing calf raise from 3 to 5, which brings
  glutes to the weekly floor and calves closer to it.
- The machine high row was dropped: it overlapped the lat pulldown and the machine row, and back was above the
  per-session ceiling.
- An ab crunch machine was added on Push, because nothing in the program trained the core.
- A cable curl was added on Pull, for more biceps work.
- Four optional blocks of 3 sets were added at the end of the days, for sessions with time to spare: an overhead
  triceps extension on a cable on Push; a shrug and a hammer curl on a cable with a rope on Pull; an ab crunch machine
  on Legs. The required sessions hold 23 sets on Push and Pull and 25 on Legs, and the flags are computed without
  them.

## Volume

`node scripts/cadence.mjs volume references/examples/ppl-machines-1x-week.json` prints:

```text
Push Pull Legs — machines (1×/week): 3 days
Each day is one session of the week: the week is the program's days summed.
Fractional sets: a set counts 1 for the first muscle its exercise lists (direct) and 0.5 for each other one (indirect).
Optional blocks (in case there is time) are left out of the counts and the flags; "with optional blocks" adds them.

Push: 23 sets, 7 exercises
  chest 11.5, triceps 8, shoulders 5.5, core 3
  with optional blocks (+Overhead triceps extension 3): 26 sets, 8 exercises
    chest 11.5, triceps 11, shoulders 5.5, core 3

Pull: 23 sets, 6 exercises
  biceps 11, back 10, shoulders 8
  with optional blocks (+Shrug 3, Hammer curl 3): 29 sets, 8 exercises
    biceps 14, back 13, shoulders 8

Legs: 25 sets, 6 exercises
  quads 8, glutes 6, calves 5, hamstrings 5
  not counted (no muscles): Hip adduction machine 3
  with optional blocks (+Ab crunch machine 3): 28 sets, 7 exercises
    quads 8, glutes 6, calves 5, hamstrings 5, core 3
    not counted (no muscles): Hip adduction machine 3

Per week
  shoulders 13.5, chest 11.5, biceps 11, back 10, quads 8, triceps 8, glutes 6, calves 5, hamstrings 5, core 3
  not counted (no muscles): 3 sets
  with optional blocks: biceps 14, shoulders 13.5, back 13, chest 11.5, triceps 11, quads 8, core 6, glutes 6, calves 5, hamstrings 5

Flags (advice: ceiling 11 per muscle per session, floor 6 per muscle per week)
  above ceiling: chest 11.5 on Push
  below floor: core 3
  below floor: calves 5
  below floor: hamstrings 5
  repeated: Machine lateral raise on Push, Pull. Another exercise for the same muscle gives variety (machine vs cable, for example).

With every optional block done, the flags would change:
  + above ceiling: back 13 on Pull
  + above ceiling: biceps 14 on Pull
  + repeated: Ab crunch machine on Push, Legs. Another exercise for the same muscle gives variety (machine vs cable, for example).
  - below floor: core 3, 6 with optional blocks
```

## What it leaves out

- **Hamstrings**: 5 sets a week, from the lying leg curl alone, one below the floor. The gym has no seated leg curl,
  and the leg press counts no hamstrings.
- **Core**: 3 sets a week, from the ab crunch machine on Push alone; 6 with the optional ab crunch machine on Legs,
  which reaches the floor.
- **Calves**: 5 sets a week, from the standing calf raise alone, one below the floor.
- **Glutes**: 6 fractional sets a week, at the floor: 4 from the hip abduction machine and 2 counted indirectly from
  the leg press.
- **Hip adduction**: its 3 sets are not counted, because the preset lists no muscle for it.
- **Above the ceiling**: chest (11.5 on Push) passes the 11 fractional sets per session past which no extra hypertrophy
  is detectable, by 0.5. With chest trained once a week, the extra sets add little rather than harm (see
  `../programming.md`).
- **Repeated exercise**: the machine lateral raise is on Push and on Pull. That is intended: side delts are trained twice
  a week, on the machine the athlete went back to after trying the cable.
- **Optional blocks on Pull**: both done take back to 13 and biceps to 14 fractional sets in the session, past the
  ceiling, where the required session stays within it. The extra sets add little there; they are the first to skip when
  time is short.
- **Optional block on Push**: the overhead triceps extension takes triceps to 11 fractional sets in the session, at the
  ceiling and not past it.
- **Optional block on Legs**: the ab crunch machine repeats the one on Push. That is intended: it is the second core
  session of the week, the one that brings core to the floor.
