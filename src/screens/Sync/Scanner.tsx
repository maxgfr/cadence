import { useEffect, useRef } from 'react'

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>
}
declare global {
  var BarcodeDetector: (new (options: { formats: string[] }) => Detector) | undefined
}

/**
 * The back camera, read for a QR code: the browser's own detector where it has one (Chrome on Android), jsQR on the
 * frames otherwise (Safari). Calls `onFound` with each text read until unmounted; `onUnavailable` when there is no
 * camera or it is refused.
 */
export function Scanner({
  onFound,
  onUnavailable,
  label,
  className,
}: {
  onFound: (text: string) => void
  onUnavailable: () => void
  label: string
  className?: string
}) {
  const video = useRef<HTMLVideoElement>(null)
  const found = useRef(onFound)
  found.current = onFound
  const unavailable = useRef(onUnavailable)
  unavailable.current = onUnavailable

  useEffect(() => {
    let stream: MediaStream | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let live = true
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      } catch {
        unavailable.current()
        return
      }
      const v = video.current
      if (!live || !v) return
      v.srcObject = stream
      await v.play().catch(() => {})
      const native = globalThis.BarcodeDetector ? new globalThis.BarcodeDetector({ formats: ['qr_code'] }) : undefined
      const jsQR = native ? undefined : (await import('jsqr')).default
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      const tick = async () => {
        if (!live) return
        try {
          if (v.readyState >= 2) {
            if (native) {
              for (const code of await native.detect(v)) found.current(code.rawValue)
            } else if (jsQR && ctx) {
              canvas.width = v.videoWidth
              canvas.height = v.videoHeight
              ctx.drawImage(v, 0, 0)
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
              const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
              if (code) found.current(code.data)
            }
          }
        } catch {
          // A frame that cannot be read: the next one may.
        }
        timer = setTimeout(tick, 250)
      }
      tick()
    }
    if (typeof navigator.mediaDevices?.getUserMedia === 'function') start()
    else unavailable.current()
    return () => {
      live = false
      if (timer) clearTimeout(timer)
      for (const t of stream?.getTracks() ?? []) t.stop()
    }
  }, [])

  return <video ref={video} className={className} aria-label={label} muted playsInline />
}
