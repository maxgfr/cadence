import { encode } from 'uqr'

/**
 * A QR code as SVG: dark modules on white, with its quiet zone, whatever the theme (scanners need the contrast).
 * Drawn from the module grid, no HTML injected.
 */
export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const { data, size } = encode(value, { ecc: 'M', border: 4 })
  let d = ''
  data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) d += `M${x} ${y}h1v1h-1z`
    })
  })
  return (
    <svg
      className={className}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      style={{ background: '#fff' }}
    >
      <path d={d} fill="#000" />
    </svg>
  )
}
