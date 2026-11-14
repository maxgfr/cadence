import type { Muscle } from '../../core/model/schemas.ts'

/**
 * A small drawing kit for exercise illustrations: a figure posed by the angles of its joints (forward kinematics), the
 * equipment around it, and the muscles the exercise trains drawn over the figure. Every drawing is in a 120 × 90 box,
 * the ground at y = 86, the figure facing right. Angles are in degrees: 0 points right, 90 down, -90 up.
 */

export type Pt = readonly [number, number]
export type Tone = 'body' | 'far' | 'gear' | 'ground' | 'water' | 'hi'

export type Shape =
  | { k: 'line'; a: Pt; b: Pt; w: number; tone: Tone; dash?: boolean }
  | { k: 'circle'; c: Pt; r: number; tone: Tone; fill?: boolean; w?: number }
  | { k: 'rect'; x: number; y: number; w: number; h: number; tone: Tone }
  | { k: 'path'; d: string; w: number; tone: Tone; fill?: boolean }

export const GROUND = 86
const TORSO = 26
const NECK = 10
const HEAD = 6
const UPPER_ARM = 15
const FOREARM = 14
const THIGH = 19
const SHIN = 18
const FOOT = 6

const LIMB = 5
const TRUNK = 8

export const at = (p: Pt, angle: number, length: number): Pt => {
  const r = (angle * Math.PI) / 180
  return [round(p[0] + length * Math.cos(r)), round(p[1] + length * Math.sin(r))]
}
const round = (n: number) => Math.round(n * 10) / 10
export const mid = (a: Pt, b: Pt, t = 0.5): Pt => [round(a[0] + (b[0] - a[0]) * t), round(a[1] + (b[1] - a[1]) * t)]
export const add = (p: Pt, dx: number, dy: number): Pt => [round(p[0] + dx), round(p[1] + dy)]

/** Upper arm then forearm; thigh then shin. */
export type Limb = readonly [number, number]

export interface Pose {
  /** The pelvis: where the torso and the legs start. */
  hip: Pt
  /** From the hip to the shoulders. */
  torso: number
  /** From the shoulders to the head; follows the torso by default. */
  head?: number
  arm: Limb
  /** The far arm; the near one's angles by default. */
  arm2?: Limb
  leg: Limb
  leg2?: Limb
  /** From the ankle to the toes; flat ahead by default. */
  foot?: number
  foot2?: number
  /** Seen from the front: both sides alike, the far ones mirrored. */
  front?: boolean
}

export interface Joints {
  hip: Pt
  shoulder: Pt
  chest: Pt
  head: Pt
  elbow: Pt
  hand: Pt
  elbow2: Pt
  hand2: Pt
  knee: Pt
  ankle: Pt
  toe: Pt
  knee2: Pt
  ankle2: Pt
  toe2: Pt
}

export interface Figure {
  joints: Joints
  /** Drawn behind the equipment: the far arm and leg. */
  back: Shape[]
  /** The torso, the near limbs, the head and the trained muscles. */
  front: Shape[]
}

const mirror = (a: number) => 180 - a

export function figure(pose: Pose, muscles: readonly Muscle[]): Figure {
  const { hip, front: facing = false } = pose
  const arm2 = pose.arm2 ?? pose.arm
  const leg2 = pose.leg2 ?? pose.leg
  const neck = at(hip, pose.torso, TORSO)
  const head = at(neck, pose.head ?? pose.torso, NECK)
  // Seen from the front, the shoulders and hips sit apart and the far limbs mirror the near ones.
  const shoulder = facing ? add(neck, 9, 3) : neck
  const shoulder2 = facing ? add(neck, -9, 3) : neck
  const hipNear = facing ? add(hip, 5, 0) : hip
  const hipFar = facing ? add(hip, -5, 0) : hip
  const a2 = facing ? ([mirror(arm2[0]), mirror(arm2[1])] as const) : arm2
  const l2 = facing ? ([mirror(leg2[0]), mirror(leg2[1])] as const) : leg2
  const elbow = at(shoulder, pose.arm[0], UPPER_ARM)
  const hand = at(elbow, pose.arm[1], FOREARM)
  const elbow2 = at(shoulder2, a2[0], UPPER_ARM)
  const hand2 = at(elbow2, a2[1], FOREARM)
  const knee = at(hipNear, pose.leg[0], THIGH)
  const ankle = at(knee, pose.leg[1], SHIN)
  const toe = at(ankle, pose.foot ?? 0, FOOT)
  const knee2 = at(hipFar, l2[0], THIGH)
  const ankle2 = at(knee2, l2[1], SHIN)
  const toe2 = at(ankle2, facing ? mirror(pose.foot2 ?? pose.foot ?? 0) : (pose.foot2 ?? pose.foot ?? 0), FOOT)
  const chest = mid(hip, neck, 0.62)
  const joints: Joints = {
    hip,
    shoulder,
    chest,
    head,
    elbow,
    hand,
    elbow2,
    hand2,
    knee,
    ankle,
    toe,
    knee2,
    ankle2,
    toe2,
  }

  const farTone: Tone = facing ? 'body' : 'far'
  const limb = (a: Pt, b: Pt, tone: Tone, w = LIMB): Shape => ({ k: 'line', a, b, w, tone })
  const back: Shape[] = [
    limb(hipFar, knee2, farTone),
    limb(knee2, ankle2, farTone),
    limb(ankle2, toe2, farTone, 4),
    limb(shoulder2, elbow2, farTone),
    limb(elbow2, hand2, farTone),
  ]
  const torsoTop = facing ? add(neck, 0, 4) : neck
  const torsoBottom = facing ? add(hip, 0, -3) : hip
  const trunkW = facing ? 14 : TRUNK
  const front: Shape[] = [
    limb(torsoBottom, torsoTop, 'body', trunkW),
    ...(facing ? [limb(shoulder2, shoulder, 'body', LIMB + 1)] : []),
    limb(hipNear, knee, 'body'),
    limb(knee, ankle, 'body'),
    limb(ankle, toe, 'body', 4),
    limb(shoulder, elbow, 'body'),
    limb(elbow, hand, 'body'),
    { k: 'circle', c: head, r: HEAD, tone: 'body', fill: true },
  ]

  // The trained muscles, over the figure.
  const trained = new Set<Muscle>(
    muscles.includes('full_body') ? ['chest', 'core', 'shoulders', 'biceps', 'quads', 'glutes', 'calves'] : muscles,
  )
  const hi: Shape[] = []
  const upper = mid(torsoBottom, torsoTop, 0.5)
  if (trained.has('chest') || trained.has('back')) hi.push(limb(upper, torsoTop, 'hi', trunkW))
  if (trained.has('core')) hi.push(limb(torsoBottom, upper, 'hi', trunkW))
  if (trained.has('biceps') || trained.has('triceps'))
    hi.push(limb(shoulder, elbow, 'hi'), ...(facing ? [limb(shoulder2, elbow2, 'hi')] : []))
  if (trained.has('quads') || trained.has('hamstrings'))
    hi.push(limb(hipNear, knee, 'hi'), ...(facing ? [limb(hipFar, knee2, 'hi')] : []))
  if (trained.has('calves')) hi.push(limb(knee, ankle, 'hi'), ...(facing ? [limb(knee2, ankle2, 'hi')] : []))
  if (trained.has('glutes')) hi.push({ k: 'circle', c: hip, r: facing ? 5.5 : 4.5, tone: 'hi', fill: true })
  if (trained.has('shoulders'))
    hi.push(
      { k: 'circle', c: shoulder, r: 4, tone: 'hi', fill: true },
      ...(facing ? [{ k: 'circle' as const, c: shoulder2, r: 4, tone: 'hi' as const, fill: true }] : []),
    )
  return { joints, back, front: [...front, ...hi] }
}

// Equipment.

const gear = (a: Pt, b: Pt, w = 2): Shape => ({ k: 'line', a, b, w, tone: 'gear' })

export const ground = (x1 = 6, x2 = 114, y = GROUND): Shape => ({
  k: 'line',
  a: [x1, y],
  b: [x2, y],
  w: 1.5,
  tone: 'ground',
})

/** A barbell seen end on: its plate. */
export const plate = (c: Pt, r = 8): Shape[] => [
  { k: 'circle', c, r, tone: 'gear', fill: true, w: 2 },
  { k: 'circle', c, r: 1.6, tone: 'gear', fill: false, w: 1.5 },
]

/** A dumbbell, its handle along `angle`. */
export const dumbbell = (c: Pt, angle = 0): Shape[] => {
  const a = at(c, angle, 5)
  const b = at(c, angle + 180, 5)
  return [
    gear(a, b, 2.2),
    { k: 'line', a: at(a, angle + 90, 3.5), b: at(a, angle - 90, 3.5), w: 3.5, tone: 'gear' },
    { k: 'line', a: at(b, angle + 90, 3.5), b: at(b, angle - 90, 3.5), w: 3.5, tone: 'gear' },
  ]
}

export const kettlebell = (hand: Pt): Shape[] => [
  {
    k: 'path',
    d: `M${hand[0] - 3} ${hand[1] + 3} Q${hand[0]} ${hand[1] - 2} ${hand[0] + 3} ${hand[1] + 3}`,
    w: 1.8,
    tone: 'gear',
  },
  { k: 'circle', c: add(hand, 0, 7.5), r: 5, tone: 'gear', fill: true, w: 2 },
]

/** A cable from its pulley to a handle. */
export const cable = (pulley: Pt, handle: Pt): Shape[] => [
  { k: 'line', a: pulley, b: handle, w: 1, tone: 'gear' },
  { k: 'circle', c: pulley, r: 2.6, tone: 'gear', fill: true, w: 1.5 },
  { k: 'circle', c: handle, r: 1.8, tone: 'gear', fill: true, w: 1.5 },
]

/** An upright: a cable tower, a rack, a machine's frame. */
export const post = (x: number, y1 = 6, y2 = GROUND, w = 2.5): Shape => gear([x, y1], [x, y2], w)

/** A machine's weight stack. */
export const stack = (x: number, y = 50): Shape[] => [
  { k: 'rect', x, y, w: 11, h: GROUND - y, tone: 'gear' },
  ...[0.25, 0.5, 0.75].map(
    (t): Shape => ({
      k: 'line',
      a: [x + 1.5, y + (GROUND - y) * t],
      b: [x + 9.5, y + (GROUND - y) * t],
      w: 1,
      tone: 'gear',
    }),
  ),
]

/** A pad or bench top between two points. */
export const pad = (a: Pt, b: Pt, w = 4.5): Shape => ({ k: 'line', a, b, w, tone: 'gear' })

/** A bench: its top, and its legs down to the ground. */
export const bench = (a: Pt, b: Pt): Shape[] => [
  pad(a, b),
  gear(add(a, a[0] < b[0] ? 4 : -4, 2), [a[0] + (a[0] < b[0] ? 4 : -4), GROUND], 2),
  gear(add(b, a[0] < b[0] ? -4 : 4, 2), [b[0] + (a[0] < b[0] ? -4 : 4), GROUND], 2),
]

/** A roller pad (a leg curl's, an extension's). */
export const roller = (c: Pt, r = 3.5): Shape => ({ k: 'circle', c, r, tone: 'gear', fill: true, w: 2 })

export const handle = (c: Pt): Shape => ({ k: 'circle', c, r: 2, tone: 'gear', fill: true, w: 1.5 })

export const lever = (a: Pt, b: Pt): Shape => gear(a, b, 2.5)

/** A bar to hang from, on two uprights. */
export const pullUpBar = (y: number, x1 = 34, x2 = 92): Shape[] => [
  gear([x1, y], [x2, y], 2.5),
  post(x1, y, GROUND, 2),
  post(x2, y, GROUND, 2),
]

export const box = (x: number, w: number, h: number): Shape => ({ k: 'rect', x, y: GROUND - h, w, h, tone: 'gear' })

/** The water's surface, gently waved. */
export const water = (y: number): Shape => {
  let d = `M4 ${y}`
  for (let x = 4; x < 116; x += 12) d += ` q3 -2.2 6 0 t6 0`
  return { k: 'path', d, w: 1.5, tone: 'water' }
}

/** A lane rope or a track's lane line. */
export const lane = (y: number, x1 = 6, x2 = 114): Shape => ({
  k: 'line',
  a: [x1, y],
  b: [x2, y],
  w: 1.2,
  tone: 'ground',
  dash: true,
})

export const curve = (d: string, w = 1.5, tone: Tone = 'gear'): Shape => ({ k: 'path', d, w, tone })
