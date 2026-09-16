/**
 * Turns the rendered badge canvas into the 1-bit rows a NIIMBOT expects.
 *
 * A NIIMBOT print head is narrow (384 dots ≈ 50 mm on a B1/B21, 96 dots ≈ 12 mm
 * on a D11), so an 80 mm badge has to be turned sideways: the badge's long edge
 * runs along the feed direction and its short edge across the head.
 */

export type Rotation = 'auto' | 'none' | '90'

export interface PreparedImage {
  /** Packed rows, MSB first, 1 = black. Each row is exactly ceil(width/8) bytes. */
  rows: Uint8Array[]
  width: number
  height: number
  /** The canvas actually sent, for previewing what the printer will do. */
  canvas: HTMLCanvasElement
}

function rotate90(source: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = source.height
  out.height = source.width
  const ctx = out.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, out.width, out.height)
  // Clockwise: the badge's left edge ends up at the top of the strip.
  ctx.translate(out.width, 0)
  ctx.rotate(Math.PI / 2)
  ctx.drawImage(source, 0, 0)
  return out
}

/**
 * Fits [source] to the print head: rotates when the badge is wider than the
 * head, scales down if it still doesn't fit, then centres it on a head-wide
 * white canvas so the print lands where the label is.
 */
export function prepareForNiimbot(
  source: HTMLCanvasElement,
  headWidth: number,
  rotation: Rotation = 'auto',
): PreparedImage {
  let img = source
  const shouldRotate = rotation === '90' || (rotation === 'auto' && source.width > headWidth)
  if (shouldRotate) img = rotate90(source)

  const scale = Math.min(1, headWidth / img.width)
  const drawW = Math.max(1, Math.round(img.width * scale))
  const drawH = Math.max(1, Math.round(img.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = headWidth
  canvas.height = drawH
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingEnabled = scale < 1
  ctx.drawImage(img, Math.floor((headWidth - drawW) / 2), 0, drawW, drawH)

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const rowBytes = (canvas.width + 7) >> 3
  const rows: Uint8Array[] = []

  for (let y = 0; y < canvas.height; y++) {
    const row = new Uint8Array(rowBytes)
    const base = y * canvas.width * 4
    for (let x = 0; x < canvas.width; x++) {
      const i = base + x * 4
      const lum = (data[i] * 30 + data[i + 1] * 59 + data[i + 2] * 11) / 100
      if (lum < 128) row[x >> 3] |= 0x80 >> (x & 7)
    }
    rows.push(row)
  }

  return { rows, width: canvas.width, height: canvas.height, canvas }
}

/** True when a packed row has no black dots — those can be sent as empty rows. */
export const isBlankRow = (row: Uint8Array): boolean => row.every((b) => b === 0)
