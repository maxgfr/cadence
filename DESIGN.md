---
name: Cadence
description: Sober, athletic, data-dense training log for gym, pool and track. Phone first.
colors:
  accent: "#c43d16"
  accent-hover: "#ab3311"
  accent-soft: "#fbeae3"
  accent-ink: "#a5320f"
  ground: "#f3f4f5"
  sidebar: "#eaecee"
  surface: "#ffffff"
  surface-pressed: "#eef0f2"
  ink: "#121417"
  ink-secondary: "#474c54"
  ink-tertiary: "#5b616a"
  hairline: "#e2e5e8"
  danger: "#b4232a"
  warning: "#8a4b00"
  success: "#12704a"
  discipline-blue: "#2a78d6"
  discipline-aqua: "#1baf7a"
  discipline-violet: "#6250d6"
  discipline-orange: "#eb6834"
  discipline-magenta: "#e87ba4"
  discipline-green: "#008300"
  discipline-yellow: "#eda100"
  discipline-red: "#e34948"
  chart-series: "#2a78d6"
  dark-ground: "#0e0f11"
  dark-surface: "#181a1d"
  dark-surface-raised: "#353a41"
  dark-ink: "#f1f2f4"
  dark-accent: "#ff7d52"
  dark-on-accent: "#1f0a03"
  dark-discipline-blue: "#3987e5"
  dark-discipline-aqua: "#199e70"
  dark-discipline-violet: "#9085e9"
typography:
  large-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "2.125rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline:
    fontSize: "1.5rem"
    fontWeight: 700
    letterSpacing: "-0.015em"
  title:
    fontSize: "1.25rem"
    fontWeight: 700
  body:
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  footnote:
    fontSize: "0.9375rem"
    fontWeight: 600
  caption:
    fontSize: "0.8125rem"
    fontWeight: 600
  log-cell:
    fontSize: "1.25rem"
    fontWeight: 600
    fontFeature: "tnum"
rounded:
  small: "4px"
  control: "10px"
  surface: "12px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
sizes:
  hit: "44px"
  hit-large: "52px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.control}"
  log-cell:
    backgroundColor: "{colors.ground}"
    rounded: "{rounded.control}"
    height: "{sizes.hit-large}"
    typography: "{typography.log-cell}"
  set-tick:
    rounded: "{rounded.pill}"
    size: "{sizes.hit-large}"
  set-tick-done:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
  rest-bar:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
  list-group:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.surface}"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    rounded: "{rounded.surface}"
---

# Design System: Cadence

## Overview

**Creative North Star: "The Coach's Card"**

Cadence reads like a training card a coach hands over at the start of a session: the plan written in the sport's own shorthand ("5×5 @80%", "8×50 m @1:50", "6×60 m @95% max · rest 3:00"), set in tabular figures, with room to write down what actually happened next to it. Neutral graphite surfaces, deep ink, and one track-orange accent that marks the next action and the sets already done.

It is used in bright places (gym lights, pool decks, outdoor tracks) with sweaty hands and a few seconds of attention between sets, so the logging screen is the loudest part of the system: thumb-sized cells, a big tick per set, a rest bar that rises from the bottom. Planning and review screens are calmer and denser. Dark mode is designed on its own: near-black ground, lifted graphite surfaces, a lighter orange carrying dark ink.

**Key characteristics:**
- One accent (track orange) for the primary action, the current place, a ticked set and a record point. Never decoration.
- The user's disciplines each take one of eight palette colours, shown as 10px dots, always beside a text label; a hollow ring means "no discipline".
- Plans and values in tabular figures, joined to their units with no-break spaces so "800 m" never splits.
- Bottom tab bar (Today, History, Programs, Progress, Settings) under 1000px; a 260px sidebar from 1000px, which adds Exercises.
- Logging is a focus route: no tab bar, a sticky bar with Back, the session clock and Finish.

## Colors

Restrained: tinted neutrals plus one accent; light and dark are separate token sets in `src/ui/tokens.css` (system preference, overridable by `data-theme`).

### Primary
- **Track Orange** (accent `#c43d16`, 5.2:1 with white): Start session, Save, Finish, the ticked set, the current tab, record points on charts, focus ring. In dark mode it becomes `#ff7d52` with dark ink (`#1f0a03`, 7.5:1).

### Neutral
- **Graphite Paper** (ground) and **Sidebar** (one step darker): the two neutral layers.
- **Surface** / **Surface Pressed**: cards, list groups, hover and pressed rows, logged cells.
- **Ink**, **Ink 2**, **Ink 3** (≥ 4.5:1 on every ground in both themes): text hierarchy.
- **Hairline** / **Hairline Strong**: separators and field borders.

### Disciplines
`--c-blue … --c-red`: the dataviz reference palette's eight categorical slots, in its validated order, each stepped for dark mode. A new discipline takes the first colour not in use (the demo's Gym, Swimming, Track and field take blue, aqua and violet). Several slots sit below 3:1 on white and orange neighbours the accent, so a discipline colour never stands alone: dots always carry their label, and the colour is identity, never an action.

### Charts
Single series in `--chart-series` (the strength blue), area washes at 10%, hairline grid, records marked with the accent. The training calendar uses a five-step blue ramp (`--heat-0` … `--heat-4`), reversed in dark mode so longer days stay brighter.

### Status
Danger, warning and success each pair a strong tone with a soft ground, used in banners, the discard confirmation and the "done" check on a finished exercise.

### Named Rules
**The One Voice Rule.** Orange means "act here", "you are here" or "done/record". Never a background flourish.
**The Labelled Dot Rule.** A discipline colour is never the only carrier of meaning.

## Typography

**Font:** the system stack (-apple-system, SF Pro, Segoe UI, system-ui). One family; weight steps do the work.

### Hierarchy
- **Large Title** (700, 2.125rem, -0.02em): one per screen.
- **Headline** (700, 1.5rem): Today's session name, the logging screen's title, the current program, the rest countdown.
- **Title** (700, 1.25rem): section headings, exercise names in the log, figure values.
- **Body** (400, 1.0625rem, 1.45).
- **Footnote** (0.9375rem): plan lines, context lines, subtitles; 600 for small headings.
- **Caption** (0.8125rem, 600): tab labels, column heads, chart ticks (11px in SVG).
- **Log cell** (600, 1.25rem): the numbers typed mid-workout.

### Named Rules
**The Tabular Rule.** All figures are tabular (`font-variant-numeric: tabular-nums` on body and every plan line).
**The 16px Floor.** Inputs never go below 16px so iOS never zooms.
**The No-Eyebrow Rule.** No label above a heading: context goes on the line below it ("Current program · 4 weeks…").

## Layout

4px rhythm. Screens are one column capped at 720px with a gutter of max(16px, safe-area insets). Under 1000px a fixed bottom tab bar of five items (hidden on the logging screen); from 1000px a sidebar. Sections are separated by 32px; a heading sits 12px above its content. The logging screen keeps 7rem free at the bottom for the rest bar.

## Elevation & Depth

Flat and tonal. Surfaces separate from the ground by colour plus one 1px lift (`0 1px 2px rgb(18 20 23 / 0.07)` light, `0 1px 0 rgb(0 0 0 / 0.4)` dark). Sheets add a scrim. The rest bar is the one inverted surface (ink ground).

## Shapes

Four radii, one job each: small (4px) for chart bar tops and cells in the calendar; control (10px) for buttons, fields, log cells, rows; surface (12px) for cards, groups, sheets, toasts; pill for the set tick, week chips, record badges and discipline dots. Icons are Lucide at 1.75 stroke (2.25 for the active tab, 2.5 inside the tick).

## Components

### Buttons
Control radius, min height 44px (50px large). Primary orange; secondary soft orange with orange ink; plain text-only; danger soft red. Press scales to 0.98; loading shows a spinner and `aria-busy`.

### Set row (signature)
`Set # | value cells | (RPE in Advanced) | tick`. Cells are 52px, centred, tabular, on the ground colour; the plan pre-fills them so logging is mostly confirming. The tick is a 52px ring; pressing it fills it orange with a 200ms pop and starts the rest timer. A ticked row's cells flatten to Surface Pressed. When every set of an exercise is ticked, its name gains a green check.

### Rest bar (signature)
Pinned to the bottom of the logging screen, ink ground, a 4px orange band draining left to right, the countdown in Headline, then −15, +15 and Skip as 44px outlined buttons. It buzzes (where vibration exists) when the rest ends, says "Rest over, go", and leaves after four seconds.

### Coach's card
On Today and in the program editor: exercise name left (600), the prescription right in Footnote tabular figures, hairline between lines. Today's card ends with the full-width Start button and a progress line ("3 of 16 sessions done · See program").

### Week strip
Seven equal day tiles; today outlined in orange, future days hollow, a discipline dot per session logged. A tile with one session links to it.

### Charts
Hand-written SVG following the dataviz method: line (2px, ringed 3.5px points, records 5px orange, dashed trend projection, target as a hairline with label), columns (≤ 24px, 4px rounded data end, square at the baseline, the running week at 45%), calendar heatmap (cells 12 to 24px, gap 3px), goal meter (pill track in the chart wash, fill in the series colour, a tick where the trend lands). Hover shows an ink tooltip; every chart has its values in a table or list beside it.

### Lists, fields, segmented control, sheet, toast, empty state
Grouped inset lists; 44px fields with a 1px strong hairline that turns orange with a 2px ring on focus; native-radio segmented control; native `<dialog>` sheets (bottom sheet under 600px); ink toasts with Undo for reversible deletes; empty states with an icon tile, a title, one teaching sentence and the next action.

### Mode cards
Normal and Advanced are radio cards with a sentence each; the chosen one takes the soft-orange ground and an orange border.

## Motion

200ms exponential ease-out. Authored moments: the tick pop, the rest bar rising, the live dot pulsing beside a session in progress. Reduced motion drops the pop and the pulse.

## Do's and Don'ts

### Do:
- **Do** write plans in the sport's shorthand, in tabular figures.
- **Do** keep logging controls at 52px and inputs at 16px or more.
- **Do** pair every discipline dot with its name, and every chart with a table view.
- **Do** design both themes when adding a token.
- **Do** offer Undo after a reversible delete instead of a confirmation.

### Don't:
- **Don't** use orange for anything that is not an action, the current place, a done set or a record.
- **Don't** add streak pressure, confetti or badges; a record is a fact on a chart, not a celebration.
- **Don't** put an eyebrow or kicker above a heading.
- **Don't** add shadows beyond the 1px lift, gradients or glass as decoration.
- **Don't** show Advanced fields (per-set RPE, intensity, rest, tempo, muscle tables, adherence) in Normal mode; switching mode never deletes them.
