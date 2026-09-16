import type { Label } from '../label'

/**
 * Turns the rendered badge canvas into the 1-bit rows a NIIMBOT expects.
 *
 * NIIMBOT rolls are named width × length, where width runs **across** the print
 * head and length runs **along** the feed ("50×30" = 50 mm across, 30 mm long).
 * The badge design is always landscape, so:
 *   - a landscape roll (width ≥ length) prints the badge upright, as-is;
 *   - a portrait roll (width < length) prints it turned 90°, its long edge
 *     running along the feed.
 * Either way the badge is drawn at the roll's real size, never an 80×50 Zebra
 * badge shrunk to fit.
 */

/** 'auto' picks from the roll's shape; the rest force a clockwise turn. */
export type Rotation = 'auto' | '0' | '90' | '180' | '270'

export const ROTATIONS: Rotation[] = ['auto', '0', '90', '180', '270']

export interface RollSize {
  /** Across the print head. */
  widthMm: number
  /** Along the feed direction. */
  lengthMm: number
}

export interface NiimbotLayout {
  /** The size to render the badge at — always landscape, the design's native shape. */
  label: Label
  /** Clockwise turn applied to the rendered badge before it is sent. */
  degrees: 0 | 90 | 180 | 270
}

/** Pure geometry, so it can be tested without a DOM. */
export function niimbotLayout(roll: RollSize, rotation: Rotation, dpi = 203): NiimbotLayout {
  const portraitRoll = roll.lengthMm > roll.widthMm
  const label: Label = portraitRoll
    ? { widthMm: roll.lengthMm, heightMm: roll.widthMm, dpi }
    : { widthMm: roll.widthMm, heightMm: roll.lengthMm, dpi }
  const degrees = (rotation === 'auto' ? (portraitRoll ? 90 : 0) : Number(rotation)) as NiimbotLayout['degrees']
  return { label, degrees }
}

export interface PreparedImage {
  /** Packed rows, MSB first, 1 = black. Each row is exactly ceil(width/8) bytes. */
  rows: Uint8Array[]
  width: number
  height: number
  /** The canvas actually sent, for previewing what the printer will do. */
  canvas: HTMLCanvasElement
}

function rotate(source: HTMLCanvasElement, degrees: NiimbotLayout['degrees']): HTMLCanvasElement {
  if (degrees === 0) return source
  const quarter = degrees === 90 || degrees === 270
  const out = document.createElement('canvas')
  out.width = quarter ? source.height : source.width
  out.height = quarter ? source.width : source.height
  const ctx = out.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.translate(out.width / 2, out.height / 2)
  ctx.rotate((degrees * Math.PI) / 180)
  ctx.drawImage(source, -source.width / 2, -source.height / 2)
  return out
}

/**
 * Turns the badge, scales it down only if it still can't fit the head, then
 * centres it on a head-wide white canvas — the roll guides centre the label
 * under the head, so the print lands on it.
 */
export function prepareForNiimbot(
  source: HTMLCanvasElement,
  headWidth: number,
  degrees: NiimbotLayout['degrees'],
): PreparedImage {
  const img = rotate(source, degrees)

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
