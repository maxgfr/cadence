# Programming for hypertrophy: evidence summary

A baseline for designing gym programs aimed at muscle growth, researched in November 2026. Refresh it with a web search
before designing a program: newer meta-analyses may move these numbers. Each claim links to its source.

## Weekly volume

- Hypertrophy keeps rising with weekly sets, with diminishing returns. Past about **31 fractional sets per muscle per
  week** no further advantage is detectable
  ([Pelland et al., Sports Med, doi 10.1007/s40279-025-02344-w](https://www.researchgate.net/publication/384628335)).
- **Fractional counting**: a set that trains the muscle directly counts 1, an indirect set counts 0.5 (rows count half
  for the biceps) ([Pelland et al.](https://www.researchgate.net/publication/384628335)).
- The median study in that analysis used about 10.5 sets per week, 2 sessions per week, 10 reps and about 1.75 min of
  rest ([Pelland et al.](https://www.researchgate.net/publication/384628335)).
- Strength gains little from more than about 5 sets per week
  ([Pelland et al.](https://www.researchgate.net/publication/384628335)).

## Volume per session

- About **11 fractional sets per muscle per session** is the point past which no extra hypertrophy is detectable
  ([Remmert, Pelland et al., SportRxiv preprint](https://sportrxiv.org/index.php/server/preprint/view/537)). For
  strength the plateau comes at about 2 direct sets per session (same source).
- Data above about 6 fractional sets per session is sparse, so the threshold is uncertain. It is a plateau, not harm:
  extra sets stop adding, they do not take away (same source).
- An older analysis put the useful ceiling at about 6–8 hard sets per muscle per session, with long rests
  ([Krieger, Weightology](https://weightology.net/the-members-area/evidence-based-guides/set-volume-for-muscle-size-the-ultimate-evidence-based-bible/)).

## Frequency

- Once weekly volume is equated, frequency shows no consistent effect on hypertrophy
  ([Pelland et al.](https://www.researchgate.net/publication/384628335);
  [Remmert, Pelland et al.](https://sportrxiv.org/index.php/server/preprint/view/537)).
- With each muscle trained once a week (a push/pull/legs done once a week), weekly volume equals session volume, so the
  per-session ceiling is the limit that binds. Aim for about **8–11 fractional sets per main muscle per session**. A
  session can then hold 20–25 working sets, because it covers 3–4 muscle groups.
- Spread small muscles that tolerate it (side delts) over two days, to get more weekly volume under the per-session
  ceiling.

## Proximity to failure

- Hypertrophy improves as sets end closer to failure; strength barely depends on it
  ([Robinson et al. 2024, Sports Med 54:2209–2231](https://link.springer.com/article/10.1007/s40279-024-02069-2)).
- Practical range for hypertrophy: 0–5 reps in reserve (RIR). Keep most working sets at 1–3 RIR (about RPE 7–9);
  isolation and machine exercises can go to 0–1 RIR (RPE 9–10)
  ([Robinson et al.](https://link.springer.com/article/10.1007/s40279-024-02069-2)).
- Warm-up and ramping sets end far from failure and barely count: do not plan or log them as working sets.

## Rest between sets

- Resting more than 60 s gives a small benefit; beyond about 90 s no appreciable difference shows
  ([Singer et al. 2024, Front Sports Act Living](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1429789/full)).
- Practical: 2–3 min on big compound lifts, to keep performance and volume load up; 60–90 s on isolation exercises.

## Machines and free weights

- Machines and free weights give the same hypertrophy; strength gains are specific to the equipment trained
  ([Haugen et al. 2023](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10426227/)). A machines-only plan is fine for
  hypertrophy.

## Exercise selection: lengthened positions

- Overhead cable triceps extensions grew the triceps about 1.4 times more than pushdowns
  ([Maeo et al.](https://www.tandfonline.com/doi/full/10.1080/17461391.2022.2100279)).
- Seated leg curls grew the hamstrings more than lying leg curls (Maeo et al. 2021, Med Sci Sports Exerc, per the
  authors' [2023 paper](https://www.tandfonline.com/doi/full/10.1080/17461391.2022.2100279)).
- Partial reps at long muscle lengths may match or beat full range of motion, but the evidence is mixed
  ([Wolf et al., SportRxiv](https://sportrxiv.org/index.php/server/preprint/view/423)).
- Practical: prefer exercises that load the muscle while stretched: seated leg curl, overhead triceps extension, deep
  calf raises with a pause at the bottom, a full stretch on flyes and pulldowns.

## Progression

- Use double progression within a rep range: keep the load while the reps climb to the top of the range, then add the
  smallest load step once every set reaches the top.
- A Cadence block holds one `reps` value: set it to the bottom of the range and write the range and the rule in the
  block's notes (for example "8–12 reps. Once every set reaches 12, add the smallest load step."). The app's preset
  program `gym-machines-ppl` does this.

## Reading a Cadence history

Signs of junk volume in `summary`:

- Many sets on one exercise with the load rising set after set at the same high rep count: ramping sets logged as
  working sets.
- No RPE logged on sets or sessions: proximity to failure is unknown, so effort cannot be checked.
- 30 or more sets in a session lasting 80 minutes or more: past the per-session ceiling for the muscles trained, with
  short or uneven rests.

Setting starting loads from `summary`:

- Take the last session's working sets on the exercise, the ones near the target rep range, and start from that load.
- If every one of those sets reached the top of the range, start one load step higher.
- For an exercise the athlete has not done yet, give an RPE intensity (`{ "kind": "rpe", "value": 8 }`) instead of kg.
