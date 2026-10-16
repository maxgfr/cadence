import { useEffect, useRef, useState } from 'react'

/** Round tick values covering [min, max]: 1, 2, 2.5 or 5 × a power of ten. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0]
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1
    min -= pad
    max += pad
  }
  const raw = (max - min) / count
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow
  const start = Math.floor(min / step) * step
  const out: number[] = []
  for (let v = start; v <= max + step * 0.5; v += step) out.push(Math.round(v * 1e6) / 1e6)
  if (out[out.length - 1] !== undefined && (out[out.length - 1] as number) < max)
    out.push((out[out.length - 1] as number) + step)
  return out
}

export function linear(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  const span = d1 - d0 || 1
  return (v) => r0 + ((v - d0) / span) * (r1 - r0)
}

/** "1.2K", "12K" from 1,000 up. */
export function compact(v: number): string {
  const a = Math.abs(v)
  if (a >= 1_000_000) return `${Math.round(v / 100_000) / 10}M`
  if (a >= 1000) return `${Math.round(v / 100) / 10}K`
  return String(Math.round(v * 10) / 10)
}

/** The width of an element, followed as it resizes. */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(([e]) => {
      if (e) setWidth(Math.round(e.contentRect.width))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}
