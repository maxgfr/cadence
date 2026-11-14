import type { PresetSlug } from '../../core/presets/catalog.ts'
import {
  add,
  at,
  bench,
  box,
  cable,
  curve,
  dumbbell,
  GROUND,
  handle,
  type Joints,
  kettlebell,
  lane,
  lever,
  type Pose,
  type Pt,
  pad,
  plate,
  post,
  pullUpBar,
  roller,
  type Shape,
  stack,
  water,
} from './figure.ts'

/** One exercise's illustration: a pose, what is around the figure (`under`) and what it holds (`over`). */
export interface Scene {
  pose: Pose
  under?: (j: Joints) => Shape[]
  over?: (j: Joints) => Shape[]
  /** No ground line: swimming. */
  floating?: boolean
}

// Poses the scenes start from.

const STAND: Pose = { hip: [58, 47], torso: -90, arm: [92, 88], arm2: [86, 92], leg: [88, 92], leg2: [96, 86] }
const SEAT: Pose = { hip: [46, 66], torso: -90, arm: [80, 60], leg: [0, 90], leg2: [4, 92] }
const LYING: Pose = { hip: [64, 60], torso: 180, arm: [-90, -90], leg: [22, 90], leg2: [30, 84] }
const HINGE: Pose = { hip: [48, 50], torso: -18, head: -12, arm: [90, 90], leg: [84, 96], leg2: [92, 92] }
const SQUAT: Pose = { hip: [46, 63], torso: -62, head: -75, arm: [0, 0], leg: [8, 108], leg2: [14, 104] }
const RUN: Pose = {
  hip: [58, 48],
  torso: -80,
  head: -84,
  arm: [70, -40],
  arm2: [125, 60],
  leg: [52, 104],
  leg2: [118, -166],
  foot2: 120,
}
const SWIM: Pose = {
  hip: [52, 47],
  torso: 0,
  head: 2,
  arm: [0, 0],
  arm2: [180, 180],
  leg: [178, 182],
  leg2: [186, 176],
  foot: 180,
  foot2: 180,
}

const pose = (base: Pose, over: Partial<Pose>): Pose => ({ ...base, ...over })

// The machine around a seated figure: its seat, backrest, frame and weight stack.
const seat = (j: Joints, back = true): Shape[] => [
  pad(add(j.hip, -10, 5), add(j.hip, 12, 5)),
  post(j.hip[0], j.hip[1] + 7, GROUND, 2),
  ...(back ? [pad(add(j.hip, -6, 4), add(j.shoulder, -6, -2))] : []),
]
const machine = (x = 100): Shape[] => [post(x - 6, 6), ...stack(x)]

const legsOnBench = (torso: number): Pick<Pose, 'leg' | 'leg2'> =>
  torso === 180
    ? { leg: [16, 96], leg2: [10, 100] }
    : torso < 180
      ? { leg: [30, 100], leg2: [24, 104] }
      : { leg: [4, 92], leg2: [0, 96] }

// Bench pressing family: lying on a bench, the bar or dumbbells over the chest.
const press = (torso: number, hip: Pt, tool: 'bar' | 'db' | 'smith', arm: Pose['arm'] = [-88, -92]): Scene => ({
  pose: pose(LYING, { hip, torso, arm, ...legsOnBench(torso) }),
  under: (j) => [
    ...bench(add(j.hip, 6, 6), at(add(j.shoulder, 0, 6), torso, 8)),
    ...(tool === 'smith' ? [post(j.hand[0] - 10, 6, GROUND, 1.5), post(j.hand[0] + 10, 6, GROUND, 1.5)] : []),
  ],
  over: (j) => (tool === 'db' ? dumbbell(j.hand) : plate(j.hand)),
})

// Curls: standing, the forearm coming up.
const curl = (tool: 'bar' | 'db' | 'hammer' | 'cable'): Scene => ({
  pose: pose(STAND, { arm: [88, -40], arm2: [92, -30] }),
  under: (j) => (tool === 'cable' ? [post(104, 6), ...cable([100, 80], j.hand)] : []),
  over: (j) =>
    tool === 'bar' ? plate(j.hand, 6.5) : tool === 'cable' ? [] : dumbbell(j.hand, tool === 'hammer' ? 90 : 0),
})

// Running: the runner, and the ground they run on.
const runner = (ground: (j: Joints) => Shape[], lean = -80): Scene => ({
  pose: pose(RUN, { torso: lean, head: lean - 4 }),
  under: ground,
})
const track = (): Shape[] => [lane(80), lane(74)]
const road = (): Shape[] => []

// Swimming: the swimmer at the surface.
const swimmer = (over: Partial<Pose>, extra: (j: Joints) => Shape[] = () => []): Scene => ({
  pose: pose(SWIM, over),
  under: (j) => [water(42), ...extra(j)],
  floating: true,
})
const poolEnd = (): Shape[] => [post(112, 30, 80, 2.5), lane(62, 6, 108)]

export const SCENES: Readonly<Record<PresetSlug, Scene>> = {
  // Chest.
  'barbell-bench-press': press(180, [66, 60], 'bar'),
  'incline-barbell-bench-press': press(-145, [66, 64], 'bar', [-96, -92]),
  'decline-bench-press': press(165, [70, 54], 'bar', [-84, -88]),
  'dumbbell-bench-press': press(180, [66, 60], 'db'),
  'incline-dumbbell-press': press(-145, [66, 64], 'db', [-96, -92]),
  'dumbbell-fly': press(180, [66, 60], 'db', [-60, -40]),
  'cable-crossover': {
    pose: pose(STAND, { front: true, arm: [40, 70], arm2: [40, 70] }),
    under: (j) => [post(12, 6), post(108, 6), ...cable([108, 10], j.hand), ...cable([12, 10], j.hand2)],
  },
  'machine-chest-press': {
    pose: pose(SEAT, { arm: [8, 0] }),
    under: (j) => [...seat(j), ...machine(), lever(j.hand, [86, 14]), handle(j.hand)],
  },
  'pec-deck': {
    pose: pose(SEAT, { front: true, hip: [60, 64], arm: [-10, -80], leg: [70, 90] }),
    under: (j) => [
      pad(add(j.hip, -12, 6), add(j.hip, 12, 6)),
      post(60, 70, GROUND),
      post(60, 10, 40, 3),
      pad(add(j.elbow, 0, -12), add(j.elbow, 0, 4), 5),
      pad(add(j.elbow2, 0, -12), add(j.elbow2, 0, 4), 5),
    ],
  },
  'push-up': {
    pose: { hip: [52, 70], torso: -12, head: -8, arm: [90, 90], leg: [168, 168], foot: 105, foot2: 105 },
  },
  'chest-dip': {
    pose: pose(STAND, { hip: [56, 40], torso: -76, arm: [120, 75], arm2: [116, 78], leg: [100, 160], leg2: [96, 150] }),
    under: (j) => [pad(add(j.hand, -12, 1), add(j.hand, 12, 1), 3), post(j.hand[0] + 8, j.hand[1], GROUND, 2)],
  },
  // Back.
  deadlift: {
    pose: pose(HINGE, { hip: [46, 52], torso: -34, head: -30, leg: [58, 102], leg2: [64, 98] }),
    over: (j) => plate(add(j.hand, 0, 6)),
  },
  'barbell-row': {
    pose: pose(HINGE, { arm: [108, 30] }),
    over: (j) => plate(j.hand),
  },
  'dumbbell-row': {
    pose: pose(HINGE, {
      hip: [44, 50],
      torso: -14,
      head: -10,
      arm: [-170, 80],
      arm2: [90, 90],
      leg: [115, 85],
      leg2: [90, 180],
      foot2: 180,
    }),
    under: (j) => bench([j.ankle2[0] - 4, j.knee2[1] + 5], [j.hand2[0] + 6, j.knee2[1] + 5]),
    over: (j) => dumbbell(j.hand, 90),
  },
  't-bar-row': {
    pose: pose(HINGE, { torso: -26, arm: [100, 60] }),
    under: (j) => [lever(j.hand, [104, GROUND - 2])],
    over: (j) => plate(at(j.hand, 50, 8), 6),
  },
  'trap-bar-deadlift': {
    pose: pose(HINGE, { hip: [48, 54], torso: -50, head: -45, leg: [48, 104], leg2: [54, 100] }),
    over: (j) => [
      curve(`M${j.hand[0] - 9} ${j.hand[1] + 2} l5 -5 h8 l5 5 l-5 5 h-8 z`, 2),
      ...plate(add(j.hand, 0, 6), 6),
    ],
  },
  'good-morning': {
    pose: pose(HINGE, { torso: -8, head: -4, arm: [150, -70], arm2: [150, -70] }),
    over: (j) => plate(add(j.shoulder, -2, -6), 7),
  },
  'seated-cable-row': {
    pose: pose(SEAT, { hip: [40, 74], torso: -84, arm: [170, 10], leg: [-6, 6], leg2: [-2, 4], foot: -80 }),
    under: (j) => [pad([28, 79], [56, 79]), post(108, 50), ...cable([106, 72], j.hand), pad([82, 74], [82, 86], 3)],
  },
  'machine-row': {
    pose: pose(SEAT, { torso: -86, arm: [160, 14] }),
    under: (j) => [
      ...seat(j, false),
      pad(add(j.chest, 8, -8), add(j.chest, 8, 8)),
      ...machine(),
      lever(j.hand, [86, 70]),
      handle(j.hand),
    ],
  },
  'lat-pulldown': {
    pose: pose(SEAT, { arm: [-60, -100] }),
    under: (j) => [
      ...seat(j, false),
      roller(add(j.knee, 0, -6)),
      ...machine(),
      post(58, 4, 12, 0),
      ...cable([62, 4], add(j.hand, 0, -1)),
      pad(add(j.hand, -10, -1), add(j.hand, 12, -1), 2),
    ],
  },
  'straight-arm-pulldown': {
    pose: pose(STAND, { torso: -76, arm: [20, 20], arm2: [24, 24] }),
    under: (j) => [post(106, 6), ...cable([102, 10], j.hand)],
  },
  'pull-up': {
    pose: pose(STAND, { hip: [62, 62], torso: -90, arm: [-58, -122], leg: [100, 135], leg2: [96, 128] }),
    under: (j) => pullUpBar(j.hand[1]),
  },
  'chin-up': {
    pose: pose(STAND, { hip: [62, 56], torso: -88, arm: [-20, -130], leg: [104, 140], leg2: [98, 132] }),
    under: (j) => pullUpBar(j.hand[1]),
  },
  'inverted-row': {
    pose: { hip: [54, 66], torso: -20, head: -16, arm: [-70, -110], leg: [168, 168], foot: 100 },
    under: (j) => [pad(add(j.hand, -6, 0), add(j.hand, 6, 0), 3), post(j.hand[0], j.hand[1], GROUND, 2)],
  },
  'back-extension': {
    pose: { hip: [56, 56], torso: -40, head: -36, arm: [150, -70], leg: [140, 140], foot: 60 },
    under: (j) => [
      pad(add(j.hip, 4, 6), add(j.hip, -8, -4), 6),
      post(j.hip[0], j.hip[1] + 8, GROUND, 2),
      roller(add(j.ankle, 0, 5)),
      lever(add(j.ankle, 0, 8), [j.hip[0], GROUND - 6]),
    ],
  },
  shrug: {
    pose: pose(STAND, { arm: [92, 90], arm2: [90, 92] }),
    over: (j) => plate(add(j.hand, 1, 2), 7),
  },
  // Shoulders.
  'overhead-press': {
    pose: pose(STAND, { arm: [-80, -94], arm2: [-84, -92] }),
    over: (j) => plate(j.hand),
  },
  'push-press': {
    pose: pose(STAND, { hip: [56, 50], torso: -88, arm: [-80, -94], leg: [72, 108], leg2: [78, 104] }),
    over: (j) => plate(j.hand),
  },
  'seated-dumbbell-press': {
    pose: pose(SEAT, { arm: [-10, -84], arm2: [-20, -88] }),
    under: (j) => seat(j),
    over: (j) => dumbbell(j.hand),
  },
  'arnold-press': {
    pose: pose(SEAT, { arm: [-80, -90], arm2: [30, -80] }),
    under: (j) => seat(j),
    over: (j) => [...dumbbell(j.hand), ...dumbbell(j.hand2, 90)],
  },
  'machine-shoulder-press': {
    pose: pose(SEAT, { arm: [-30, -84] }),
    under: (j) => [...seat(j), ...machine(), lever(j.hand, [90, 30]), handle(j.hand)],
  },
  'lateral-raise': {
    pose: pose(STAND, { front: true, arm: [-6, 6], arm2: [-6, 6] }),
    over: (j) => [...dumbbell(j.hand, 90), ...dumbbell(j.hand2, 90)],
  },
  'cable-lateral-raise': {
    pose: pose(STAND, { front: true, arm: [-10, 0], arm2: [70, 90] }),
    under: (j) => [post(14, 6), ...cable([16, 82], j.hand)],
  },
  'front-raise': {
    pose: pose(STAND, { arm: [-4, -4], arm2: [88, 92] }),
    over: (j) => dumbbell(j.hand, 90),
  },
  'rear-delt-fly': {
    pose: pose(HINGE, { front: true, hip: [60, 50], torso: -90, arm: [20, 30], leg: [82, 96] }),
    over: (j) => [...dumbbell(j.hand, 90), ...dumbbell(j.hand2, 90)],
  },
  'reverse-pec-deck': {
    pose: pose(SEAT, { front: true, hip: [60, 64], arm: [-4, 0], leg: [70, 90] }),
    under: (j) => [
      pad(add(j.hip, -12, 6), add(j.hip, 12, 6)),
      post(60, 70, GROUND),
      post(60, 10, 40, 3),
      lever(j.hand, [60, 12]),
      lever(j.hand2, [60, 12]),
      handle(j.hand),
      handle(j.hand2),
    ],
  },
  'face-pull': {
    pose: pose(STAND, { arm: [-14, -170], arm2: [-10, -160] }),
    under: (j) => [post(108, 6), ...cable([104, 18], j.hand)],
  },
  'upright-row': {
    pose: pose(STAND, { arm: [-12, 140], arm2: [-8, 136] }),
    over: (j) => plate(j.hand, 6.5),
  },
  // Arms.
  'barbell-curl': curl('bar'),
  'dumbbell-curl': curl('db'),
  'incline-dumbbell-curl': {
    pose: pose(SEAT, { hip: [56, 66], torso: -125, head: -110, arm: [96, 92], arm2: [100, 40] }),
    under: (j) => [
      pad(add(j.hip, -6, 5), add(j.hip, 12, 5)),
      post(j.hip[0], j.hip[1] + 7, GROUND, 2),
      pad(add(j.hip, -5, 3), add(j.shoulder, -6, -2)),
      post(j.shoulder[0] - 4, j.shoulder[1] + 4, GROUND, 2),
    ],
    over: (j) => [...dumbbell(j.hand), ...dumbbell(j.hand2)],
  },
  'reverse-curl': {
    pose: pose(STAND, { arm: [88, -8], arm2: [92, -4] }),
    over: (j) => plate(j.hand, 6.5),
  },
  'hammer-curl': curl('hammer'),
  'preacher-curl': {
    pose: pose(SEAT, { torso: -80, arm: [40, -40] }),
    under: (j) => [
      ...seat(j, false),
      pad(add(j.shoulder, 6, 4), add(j.elbow, 3, 6), 6),
      post(j.elbow[0], j.elbow[1] + 8, GROUND, 2),
    ],
    over: (j) => plate(j.hand, 6),
  },
  'cable-curl': curl('cable'),
  'concentration-curl': {
    pose: pose(SEAT, { torso: -60, head: -40, arm: [80, -70], leg: [-4, 96] }),
    under: (j) => [pad(add(j.hip, -12, 5), add(j.hip, 6, 5)), post(j.hip[0] - 3, j.hip[1] + 7, GROUND, 2)],
    over: (j) => dumbbell(j.hand),
  },
  'triceps-pushdown': {
    pose: pose(STAND, { arm: [94, 70], arm2: [90, 74] }),
    under: (j) => [post(96, 6), ...cable([92, 10], j.hand)],
  },
  'overhead-triceps-extension': {
    pose: pose(STAND, { arm: [-100, 120], arm2: [-96, 124] }),
    over: (j) => dumbbell(j.hand, 90),
  },
  'skull-crusher': press(180, [66, 60], 'bar', [-110, 170]),
  'close-grip-bench-press': press(180, [66, 60], 'bar', [-94, -90]),
  // Legs and glutes.
  'back-squat': {
    pose: pose(SQUAT, { arm: [150, -70], arm2: [146, -66] }),
    over: (j) => plate(add(j.shoulder, -7, 1)),
  },
  'front-squat': {
    pose: pose(SQUAT, { torso: -76, head: -84, arm: [10, -150] }),
    over: (j) => plate(add(j.shoulder, 6, -3)),
  },
  'goblet-squat': {
    pose: pose(SQUAT, { torso: -72, head: -82, arm: [60, -70] }),
    over: (j) => dumbbell(add(j.hand, 1, 0), 90),
  },
  'hack-squat': {
    pose: pose(SQUAT, { hip: [46, 62], torso: -60, head: -64, arm: [-60, 160] }),
    under: (j) => [
      pad(add(j.hip, -4, 6), add(j.shoulder, -5, 2), 5),
      lever([28, GROUND - 2], [86, 10]),
      pad(add(j.ankle, -2, 4), add(j.toe, 6, 4), 4),
    ],
  },
  'smith-machine-squat': {
    pose: pose(SQUAT, { arm: [150, -70], arm2: [146, -66] }),
    under: (j) => [post(j.shoulder[0] - 14, 6, GROUND, 1.5), post(j.shoulder[0] + 6, 6, GROUND, 1.5)],
    over: (j) => plate(add(j.shoulder, -3, -5)),
  },
  'leg-press': {
    pose: { hip: [36, 66], torso: -150, head: -140, arm: [60, 0], leg: [-40, 4], leg2: [-34, 8], foot: -50 },
    under: (j) => [
      pad(add(j.hip, -6, 6), add(j.shoulder, 4, 6)),
      post(j.hip[0], j.hip[1] + 8, GROUND, 2),
      lever([58, GROUND - 4], [112, 26]),
      pad(at(j.ankle, 45, 6), at(j.ankle, -135, 8), 4),
    ],
  },
  'leg-extension': {
    pose: pose(SEAT, { leg: [0, -8], leg2: [2, 30] }),
    under: (j) => [...seat(j), ...machine(), roller(add(j.ankle, 0, 4)), lever(add(j.ankle, 0, 4), add(j.knee, 0, 8))],
  },
  'lying-leg-curl': {
    pose: { hip: [54, 58], torso: 180, head: 176, arm: [96, 80], leg: [2, -70], leg2: [4, -40], foot: -150 },
    under: (j) => [...bench(add(j.shoulder, -6, 6), add(j.knee, 6, 6)), roller(add(j.ankle, 4, -2))],
  },
  'seated-leg-curl': {
    pose: pose(SEAT, { leg: [0, 110], leg2: [4, 96], foot: 30 }),
    under: (j) => [...seat(j), ...machine(), roller(add(j.ankle, 2, -4)), roller(add(j.knee, -4, -6))],
  },
  'romanian-deadlift': {
    pose: pose(HINGE, { torso: -30, head: -26, leg: [86, 94], leg2: [90, 92] }),
    over: (j) => plate(j.hand),
  },
  'sumo-deadlift': {
    pose: pose(HINGE, { hip: [50, 56], torso: -48, head: -40, leg: [40, 110], leg2: [70, 96] }),
    over: (j) => plate(add(j.hand, 0, 6)),
  },
  'bulgarian-split-squat': {
    pose: pose(STAND, { hip: [56, 56], leg: [20, 104], leg2: [128, 190], foot2: 180 }),
    under: (j) => bench(add(j.ankle2, -12, 2), add(j.ankle2, 6, 2)),
    over: (j) => dumbbell(j.hand, 90),
  },
  'walking-lunge': {
    pose: pose(STAND, { hip: [56, 56], leg: [26, 98], leg2: [124, 176], foot2: 100 }),
    over: (j) => dumbbell(j.hand, 90),
  },
  'step-up': {
    pose: pose(STAND, { hip: [54, 42], leg: [20, 100], leg2: [96, 92] }),
    under: () => [box(58, 28, 16)],
    over: (j) => dumbbell(j.hand, 90),
  },
  'hip-thrust': {
    pose: { hip: [60, 60], torso: 182, head: 200, arm: [-30, 10], leg: [-8, 92], leg2: [-2, 88] },
    under: (j) => bench(add(j.shoulder, -14, 6), add(j.shoulder, 4, 6)),
    over: (j) => plate(add(j.hip, 0, -7), 7),
  },
  'glute-bridge': {
    pose: { hip: [56, 70], torso: 164, head: 180, arm: [10, 0], leg: [-20, 96], leg2: [-14, 92] },
  },
  'cable-kickback': {
    pose: pose(STAND, { torso: -70, head: -64, arm: [60, 40], leg: [140, 156], leg2: [92, 90] }),
    under: (j) => [post(10, 30), ...cable([12, 82], j.ankle), post(104, 30), pad([96, 32], [104, 32], 3)],
  },
  'hip-abduction-machine': {
    pose: pose(SEAT, { front: true, hip: [60, 60], arm: [100, 90], leg: [40, 90], foot: 0 }),
    under: (j) => [
      pad(add(j.hip, -12, 6), add(j.hip, 12, 6)),
      post(60, 66, GROUND),
      pad(add(j.knee, 4, -4), add(j.knee, 4, 8), 4),
      pad(add(j.knee2, -4, -4), add(j.knee2, -4, 8), 4),
    ],
  },
  'hip-adduction-machine': {
    pose: pose(SEAT, { front: true, hip: [60, 60], arm: [100, 90], leg: [30, 90], foot: 0 }),
    under: (j) => [
      pad(add(j.hip, -12, 6), add(j.hip, 12, 6)),
      post(60, 66, GROUND),
      pad(add(j.knee, -4, -4), add(j.knee, -4, 8), 4),
      pad(add(j.knee2, 4, -4), add(j.knee2, 4, 8), 4),
    ],
  },
  'standing-calf-raise': {
    pose: pose(STAND, { hip: [58, 43], arm: [-60, -120], leg: [90, 90], leg2: [92, 90], foot: 40, foot2: 40 }),
    under: (j) => [
      box(56, 18, 5),
      pad(add(j.shoulder, -6, -4), add(j.shoulder, 8, -4), 5),
      lever(add(j.shoulder, 8, -4), [94, 10]),
      ...machine(),
    ],
  },
  'seated-calf-raise': {
    pose: pose(SEAT, { arm: [60, 10], leg: [0, 90], foot: 30 }),
    under: (j) => [
      ...seat(j, false),
      box(64, 16, 5),
      pad(add(j.knee, -6, -5), add(j.knee, 8, -5), 5),
      lever(add(j.knee, 8, -5), [96, 40]),
    ],
  },
  'nordic-curl': {
    pose: { hip: [52, 66], torso: -40, head: -36, arm: [60, 20], leg: [130, 180], foot: 180 },
    under: (j) => [roller(add(j.ankle, -4, -4)), pad(add(j.knee, -16, 4), add(j.knee, 6, 4), 3)],
  },
  // Core and whole body.
  plank: {
    pose: { hip: [54, 70], torso: -8, head: -6, arm: [90, 0], leg: [172, 172], foot: 100, foot2: 100 },
  },
  'side-plank': {
    pose: {
      hip: [54, 68],
      torso: -14,
      head: -12,
      arm: [90, 0],
      arm2: [-90, -90],
      leg: [168, 168],
      foot: 150,
      foot2: 150,
    },
  },
  crunch: {
    pose: { hip: [60, 80], torso: 210, head: 214, arm: [-40, 200], leg: [-55, 70], leg2: [-50, 74] },
  },
  'cable-crunch': {
    pose: { hip: [50, 62], torso: 14, head: 40, arm: [-60, 120], leg: [90, 180], leg2: [92, 182], foot: 180 },
    under: (j) => [post(108, 6), ...cable([104, 10], j.hand)],
  },
  'hanging-leg-raise': {
    pose: pose(STAND, { hip: [60, 58], arm: [-90, -90], leg: [0, 0], leg2: [6, 6] }),
    under: (j) => pullUpBar(j.hand[1]),
  },
  'russian-twist': {
    pose: { hip: [54, 80], torso: -120, head: -110, arm: [40, -20], leg: [-40, 14], leg2: [-34, 18] },
    over: (j) => plate(j.hand, 6),
  },
  'ab-wheel-rollout': {
    pose: { hip: [48, 62], torso: -10, head: -6, arm: [30, 30], leg: [100, 180], foot: 180 },
    over: (j) => [{ k: 'circle', c: add(j.hand, 0, 2), r: 5, tone: 'gear', fill: true, w: 2 }],
  },
  'power-clean': {
    pose: pose(SQUAT, { hip: [52, 54], torso: -84, head: -88, arm: [20, -150], leg: [44, 116], leg2: [50, 112] }),
    over: (j) => plate(add(j.shoulder, 10, 0)),
  },
  'kettlebell-swing': {
    pose: pose(STAND, { hip: [54, 49], torso: -74, head: -76, arm: [-4, 0], arm2: [0, 0], leg: [80, 98] }),
    over: (j) => kettlebell(j.hand),
  },
  'farmers-carry': {
    pose: pose(STAND, { arm: [90, 90], leg: [80, 100], leg2: [104, 80] }),
    over: (j) => [...dumbbell(add(j.hand, 0, 3), 0), ...dumbbell(add(j.hand2, 0, 3), 0)],
  },
  // Machines and cable stations.
  'pendulum-squat': {
    pose: pose(SQUAT, { torso: -66, head: -70, arm: [-50, 170] }),
    under: (j) => [
      pad(add(j.hip, -4, 6), add(j.shoulder, -5, 2), 5),
      lever(add(j.shoulder, -4, -4), [70, 8]),
      post(76, 8, GROUND),
      pad(add(j.ankle, -2, 4), add(j.toe, 8, 4), 4),
    ],
  },
  'belt-squat': {
    pose: pose(SQUAT, { torso: -80, head: -84, arm: [10, 0] }),
    under: (j) => [
      lever(j.hip, add(j.hip, 6, 18)),
      box(30, 56, 4),
      pad(add(j.hand, 0, -4), add(j.hand, 0, 6), 3),
      post(j.hand[0], j.hand[1] + 6, GROUND, 2),
    ],
  },
  'hip-thrust-machine': {
    pose: { hip: [60, 60], torso: 182, head: 200, arm: [-30, 10], leg: [-8, 92], leg2: [-2, 88] },
    under: (j) => [
      ...bench(add(j.shoulder, -14, 6), add(j.shoulder, 4, 6)),
      lever(add(j.hip, 0, -6), [24, 20]),
      post(22, 20, GROUND),
    ],
    over: (j) => [pad(add(j.hip, -8, -6), add(j.hip, 8, -6), 5)],
  },
  'glute-ham-raise': {
    pose: { hip: [50, 54], torso: 0, head: 0, arm: [100, 80], leg: [180, 150], foot: 180 },
    under: (j) => [
      pad(add(j.hip, -10, 6), add(j.hip, 8, 6), 6),
      post(j.hip[0], j.hip[1] + 8, GROUND, 2),
      roller(add(j.ankle, 0, -5)),
      pad(add(j.ankle, -2, 4), add(j.ankle, 4, 4), 3),
    ],
  },
  'incline-machine-press': {
    pose: pose(SEAT, { torso: -110, head: -100, arm: [-40, -50] }),
    under: (j) => [...seat(j), ...machine(), lever(j.hand, [88, 8]), handle(j.hand)],
  },
  'machine-lateral-raise': {
    pose: pose(SEAT, { front: true, hip: [60, 64], arm: [-4, 80], leg: [70, 90] }),
    under: (j) => [
      pad(add(j.hip, -12, 6), add(j.hip, 12, 6)),
      post(60, 70, GROUND),
      pad(add(j.elbow, -4, -3), add(j.elbow, 6, -3), 5),
      pad(add(j.elbow2, 4, -3), add(j.elbow2, -6, -3), 5),
    ],
  },
  'assisted-pull-up': {
    pose: pose(STAND, { hip: [60, 52], arm: [-58, -122], leg: [90, 180], leg2: [92, 182], foot: 180 }),
    under: (j) => [
      ...pullUpBar(j.hand[1]),
      pad(add(j.knee, -14, 4), add(j.knee, 4, 4), 5),
      post(j.knee[0] - 4, j.knee[1] + 6, GROUND, 2),
      ...stack(100),
    ],
  },
  'assisted-dip': {
    pose: pose(STAND, { hip: [56, 44], torso: -80, arm: [118, 76], leg: [92, 180], leg2: [94, 182], foot: 180 }),
    under: (j) => [
      pad(add(j.hand, -12, 1), add(j.hand, 12, 1), 3),
      pad(add(j.knee, -14, 4), add(j.knee, 4, 4), 5),
      post(j.knee[0] - 4, j.knee[1] + 6, GROUND, 2),
      ...stack(100),
    ],
  },
  'machine-biceps-curl': {
    pose: pose(SEAT, { torso: -84, arm: [40, -50] }),
    under: (j) => [
      ...seat(j, false),
      pad(add(j.shoulder, 6, 6), add(j.elbow, 6, 6), 6),
      post(j.elbow[0] + 2, j.elbow[1] + 9, GROUND, 2),
      ...machine(),
      handle(j.hand),
    ],
  },
  'machine-triceps-extension': {
    pose: pose(SEAT, { torso: -84, arm: [30, 80] }),
    under: (j) => [
      ...seat(j, false),
      pad(add(j.shoulder, 6, 6), add(j.elbow, 6, 6), 6),
      post(j.elbow[0] + 2, j.elbow[1] + 9, GROUND, 2),
      ...machine(),
      handle(j.hand),
    ],
  },
  'ab-crunch-machine': {
    pose: pose(SEAT, { torso: -56, head: -30, arm: [10, -110] }),
    under: (j) => [
      ...seat(j, false),
      pad(add(j.hip, -8, 4), add(j.hip, -10, -24), 5),
      ...machine(),
      lever(j.hand, [90, 20]),
      handle(j.hand),
    ],
  },
  'dumbbell-pullover': {
    pose: { hip: [70, 64], torso: 186, head: 186, arm: [-170, -170], leg: [40, 90], leg2: [46, 86] },
    under: (j) => bench(add(j.shoulder, -4, 6), add(j.shoulder, 14, 6)),
    over: (j) => dumbbell(j.hand, 90),
  },
  'cable-pull-through': {
    pose: pose(HINGE, { hip: [62, 50], torso: -30, head: -26, arm: [100, 120], leg: [96, 90], leg2: [76, 96] }),
    under: (j) => [post(12, 40), ...cable([14, 80], j.hand)],
  },
  'cable-wood-chop': {
    pose: pose(STAND, { torso: -86, arm: [-40, -40], arm2: [-36, -36], leg: [80, 96] }),
    under: (j) => [post(108, 6), ...cable([104, 10], j.hand)],
  },
  'machine-high-row': {
    pose: pose(SEAT, { arm: [116, -20], arm2: [120, -30] }),
    under: (j) => [
      ...seat(j, false),
      roller(add(j.knee, -2, -6)),
      lever(j.hand, [90, 14]),
      post(96, 10, GROUND),
      handle(j.hand),
    ],
  },
  'pullover-machine': {
    pose: pose(SEAT, { arm: [-100, -60] }),
    under: (j) => [
      ...seat(j),
      pad(add(j.elbow, -2, -6), add(j.elbow, 4, 4), 5),
      lever(j.elbow, [56, 20]),
      ...machine(),
    ],
  },
  'decline-machine-press': {
    pose: pose(SEAT, { torso: -96, arm: [30, 20] }),
    under: (j) => [...seat(j), ...machine(), lever(j.hand, [84, 20]), handle(j.hand)],
  },
  'seated-dip-machine': {
    pose: pose(SEAT, { arm: [110, 80] }),
    under: (j) => [...seat(j), ...machine(), lever(j.hand, [86, 50]), handle(j.hand)],
  },
  'smith-machine-bench-press': press(180, [66, 60], 'smith'),
  'lower-back-machine': {
    pose: pose(SEAT, { torso: -108, head: -96, arm: [50, -50] }),
    under: (j) => [
      ...seat(j, false),
      pad(add(j.shoulder, -6, -2), add(j.shoulder, -2, 12), 5),
      lever(add(j.shoulder, -2, 12), [j.hip[0] + 2, j.hip[1] + 4]),
      ...machine(),
    ],
  },
  'rotary-torso-machine': {
    pose: pose(SEAT, { torso: -88, arm: [30, -40] }),
    under: (j) => [
      ...seat(j, false),
      pad(add(j.hand, 2, -8), add(j.hand, 2, 8), 5),
      lever(add(j.hand, 2, 8), [j.hip[0] + 6, j.hip[1] + 5]),
      ...machine(),
    ],
  },
  'glute-kick-machine': {
    pose: {
      hip: [52, 50],
      torso: -4,
      head: 0,
      arm: [90, 86],
      arm2: [92, 88],
      leg: [166, -150],
      leg2: [92, 180],
      foot2: 180,
    },
    under: (j) => [
      pad(add(j.knee2, -8, 4), add(j.knee2, 6, 4), 5),
      pad(add(j.chest, -6, 6), add(j.chest, 10, 6), 5),
      post(j.chest[0], j.chest[1] + 8, GROUND, 2),
      roller(add(j.ankle, -2, 2)),
    ],
  },
  'standing-leg-curl': {
    pose: pose(STAND, { arm: [10, 60], leg: [100, -150], foot: -120 }),
    under: (j) => [
      roller(add(j.ankle, 2, -2)),
      pad(add(j.knee, 6, -4), add(j.knee, 6, 6), 5),
      post(80, 34, GROUND),
      handle(j.hand),
    ],
  },
  'sissy-squat': {
    pose: { hip: [58, 58], torso: -112, head: -100, arm: [-10, -10], leg: [42, 118], leg2: [46, 114], foot: 30 },
    under: (j) => [
      roller(add(j.knee, 4, 2)),
      roller(add(j.ankle, 2, 4), 2.6),
      post(j.knee[0] + 6, j.knee[1] + 4, GROUND, 2),
    ],
  },
  'donkey-calf-raise': {
    pose: { hip: [40, 44], torso: 0, head: 0, arm: [90, 90], leg: [90, 90], leg2: [92, 90], foot: 40, foot2: 40 },
    under: (j) => [
      box(32, 18, 5),
      pad(add(j.hip, -4, -6), add(j.hip, 12, -6), 5),
      pad(add(j.hand, -6, 2), add(j.hand, 6, 2), 3),
      post(j.hand[0], j.hand[1] + 2, GROUND, 2),
    ],
  },
  'calf-press': {
    pose: { hip: [36, 66], torso: -150, head: -140, arm: [60, 0], leg: [-32, -30], leg2: [-28, -26], foot: -80 },
    under: (j) => [
      pad(add(j.hip, -6, 6), add(j.shoulder, 4, 6)),
      post(j.hip[0], j.hip[1] + 8, GROUND, 2),
      lever([58, GROUND - 4], [112, 26]),
      pad(at(j.toe, 45, 6), at(j.toe, -135, 8), 4),
    ],
  },
  'wrist-curl': {
    pose: pose(SEAT, { torso: -70, head: -64, arm: [76, -6], leg: [0, 90] }),
    under: (j) => seat(j, false),
    over: (j) => dumbbell(add(j.hand, 2, -2), 90),
  },
  'tibialis-raise': {
    pose: pose(SEAT, { arm: [80, 10], leg: [0, 90], foot: -30 }),
    under: (j) => [...seat(j), roller(add(j.toe, -1, -3), 3)],
  },
  // Swimming.
  'swim-freestyle': swimmer({ arm: [0, 0], arm2: [-120, -50] }),
  'swim-backstroke': swimmer({ torso: 0, head: -6, arm: [-110, -110], arm2: [176, 176] }),
  'swim-breaststroke': swimmer({ arm: [-4, 4], arm2: [4, -4], leg: [160, 220], leg2: [166, 214], foot: 120 }),
  'swim-butterfly': swimmer({
    torso: -8,
    head: -2,
    arm: [-150, -170],
    arm2: [-140, -160],
    leg: [172, 196],
    leg2: [176, 200],
  }),
  'swim-medley': swimmer({ arm: [-4, 4], arm2: [-120, -50] }, () => [lane(62)]),
  'swim-kick': swimmer({ arm: [0, 0], arm2: [4, -4], leg: [170, 194], leg2: [190, 170] }, (j) => [
    { k: 'rect', x: j.hand[0] - 2, y: j.hand[1] - 2, w: 14, h: 4, tone: 'gear' },
  ]),
  'swim-pull': swimmer({ arm: [0, 0], arm2: [-120, -50] }, (j) => [
    { k: 'circle', c: at(j.hip, 180, 9), r: 4, tone: 'gear', fill: true, w: 1.5 },
  ]),
  'drill-catch-up': swimmer({ arm: [0, 0], arm2: [2, -2] }),
  'drill-fingertip-drag': swimmer({ arm: [0, 0], arm2: [-110, 60] }),
  'drill-single-arm': swimmer({ arm: [0, 0], arm2: [170, 170] }),
  'drill-sculling': swimmer({ arm: [10, -20], arm2: [-6, 24] }),
  'drill-closed-fist': swimmer({ arm: [0, 0], arm2: [-120, -50] }, (j) => [
    { k: 'circle', c: j.hand, r: 3, tone: 'body', fill: true },
  ]),
  'drill-side-kick': swimmer({ torso: 0, arm: [0, 0], arm2: [176, 176], leg: [170, 194], leg2: [190, 170] }),
  'swim-50-free': swimmer({ arm: [0, 0], arm2: [-120, -50] }, poolEnd),
  'swim-100-free': swimmer({ arm: [0, 0], arm2: [-120, -50] }, poolEnd),
  'swim-400-free': swimmer({ arm: [0, 0], arm2: [-120, -50] }, poolEnd),
  // Running.
  'run-easy': runner(road, -84),
  'run-long': runner(() => [curve('M70 86 Q92 78 118 80', 1.2, 'ground')], -84),
  'run-tempo': runner(road, -76),
  'run-fartlek': runner(() => [curve('M6 82 Q30 76 54 82 T114 80', 1.2, 'ground')], -78),
  'run-hills': {
    pose: pose(RUN, { hip: [58, 42], torso: -70, head: -72, leg: [36, 96], leg2: [116, -170] }),
    under: () => [curve(`M6 ${GROUND} L114 52`, 1.5, 'ground')],
  },
  'run-strides': runner(() => [...road(), lane(30, 8, 22), lane(40, 4, 22), lane(50, 10, 22)], -74),
  'run-progression': runner(() => [...road(), curve('M78 34 l6 0 l0 -6 l6 0 l0 -6 l6 0', 1.5, 'ground')], -78),
  'run-200': runner(track, -74),
  'run-400': runner(track, -74),
  'run-800': runner(track, -76),
  'run-1000': runner(track, -76),
  'run-5k': runner(road, -78),
  'run-10k': runner(road, -78),
  'run-half': runner(road, -80),
  'run-marathon': runner(road, -82),
}
