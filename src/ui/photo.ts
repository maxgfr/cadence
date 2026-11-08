import { EXERCISE_PHOTO_MAX } from '../core/model/schemas.ts'

const SIDES = [1024, 800, 640, 480]
const QUALITIES = [0.7, 0.5]

/**
 * A picked image as the small JPEG an exercise stores: redrawn smaller until it fits, which also drops what the file
 * says beyond its pixels (where and when it was taken). Rejects when the browser cannot read the image.
 */
export async function compressPhoto(file: Blob): Promise<string> {
  const image = await createImageBitmap(file)
  try {
    for (const side of SIDES) {
      const scale = Math.min(1, side / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('no canvas')
      // A JPEG has no transparency: what was transparent turns white rather than black.
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      for (const quality of QUALITIES) {
        const url = canvas.toDataURL('image/jpeg', quality)
        if (url.length <= EXERCISE_PHOTO_MAX) return url
      }
    }
    throw new Error('too large')
  } finally {
    image.close()
  }
}
