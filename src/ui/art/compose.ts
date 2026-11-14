import type { Muscle } from '../../core/model/schemas.ts'
import type { PresetSlug } from '../../core/presets/catalog.ts'
import { figure, GROUND, ground, type Shape } from './figure.ts'
import { SCENES } from './scenes.ts'

export interface Drawing {
  /** `x y width height`, framing the scene at 4:3. */
  viewBox: string
  /** Back to front, each with a key of its own for rendering. */
  shapes: (Shape & { key: string })[]
}

const RATIO = 4 / 3
const MARGIN = 4

function bounds(shapes: readonly Shape[]): [number, number, number, number] {
  let [x1, y1, x2, y2] = [Infinity, Infinity, -Infinity, -Infinity]
  const take = (x: number, y: number, r: number) => {
    x1 = Math.min(x1, x - r)
    y1 = Math.min(y1, y - r)
    x2 = Math.max(x2, x + r)
    y2 = Math.max(y2, y + r)
  }
  for (const s of shapes) {
    if (s.k === 'line') {
      take(s.a[0], s.a[1], s.w / 2)
      take(s.b[0], s.b[1], s.w / 2)
    } else if (s.k === 'circle') take(s.c[0], s.c[1], s.r + (s.w ?? 0) / 2)
    else if (s.k === 'rect') {
      take(s.x, s.y, 1)
      take(s.x + s.w, s.y + s.h, 1)
    } else {
      // Paths are the water, the terrain and small details: their start is enough, the rest may be cropped.
      const [x = 0, y = 0] = s.d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
      take(x, y, s.w)
    }
  }
  return [x1, y1, x2, y2]
}

/**
 * An exercise's illustration, back to front, framed to fit; undefined for one without. The ground runs the whole width.
 */
export function compose(slug: PresetSlug, muscles: readonly Muscle[]): Drawing | undefined {
  const scene = SCENES[slug]
  if (!scene) return undefined
  const f = figure(scene.pose, muscles)
  const shapes = [...f.back, ...(scene.under?.(f.joints) ?? []), ...f.front, ...(scene.over?.(f.joints) ?? [])]
  let [x1, y1, x2, y2] = bounds(shapes)
  if (!scene.floating) y2 = Math.max(y2, GROUND + 2)
  x1 -= MARGIN
  y1 -= MARGIN
  x2 += MARGIN
  y2 += MARGIN
  let w = x2 - x1
  let h = y2 - y1
  // Widen or heighten around the centre to 4:3; the ground stays at the bottom.
  if (w / h < RATIO) {
    const extra = h * RATIO - w
    x1 -= extra / 2
    w = h * RATIO
  } else {
    const extra = w / RATIO - h
    y1 -= scene.floating ? extra / 2 : extra
    h = w / RATIO
  }
  const r = (n: number) => Math.round(n * 10) / 10
  return {
    viewBox: `${r(x1)} ${r(y1)} ${r(w)} ${r(h)}`,
    shapes: [...(scene.floating ? [] : [ground(x1, x1 + w)]), ...shapes].map((s, n) => ({ ...s, key: `${s.k}${n}` })),
  }
}
