import { heightDots, widthDots, type Label } from './label'

/**
 * Converts a rendered badge canvas into a complete ZPL label that prints the
 * image 1:1 via ^GFA (ASCII-hex graphic field). Any pixel darker than mid-grey
 * becomes a black dot, so the printed badge is exactly the on-screen canvas —
 * including the Geist font.
 */
export function badgeZpl(canvas: HTMLCanvasElement, label: Label): string {
  const w = canvas.width
  const h = canvas.height
  const rowBytes = (w + 7) >> 3
  const total = rowBytes * h

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  const { data } = ctx.getImageData(0, 0, w, h)

  const digits = '0123456789ABCDEF'
  const hex: string[] = new Array(total * 2)
  let out = 0

  for (let y = 0; y < h; y++) {
    const rowOffset = y * w * 4
    let bit = 0
    let acc = 0
    for (let xi = 0; xi < w; xi++) {
      const i = rowOffset + xi * 4
      // luminance (ignore alpha; the canvas background is opaque white)
      const lum = ((data[i] * 30 + data[i + 1] * 59 + data[i + 2] * 11) / 100) | 0
      acc = (acc << 1) | (lum < 128 ? 1 : 0)
      bit++
      if (bit === 8) {
        hex[out++] = digits[(acc >> 4) & 0xf]
        hex[out++] = digits[acc & 0xf]
        bit = 0
        acc = 0
      }
    }
    if (bit > 0) {
      acc = acc << (8 - bit) // pad the remaining bits of the last byte with 0
      hex[out++] = digits[(acc >> 4) & 0xf]
      hex[out++] = digits[acc & 0xf]
    }
  }

  return (
    '^XA' +
    `^PW${widthDots(label)}` +
    `^LL${heightDots(label)}` +
    '^LH0,0' +
    '^FO0,0' +
    `^GFA,${total},${total},${rowBytes},` +
    hex.join('') +
    '^FS' +
    '^XZ'
  )
}

/** A tiny label to confirm the printer link from the Settings screen. */
export function testZpl(label: Label): string {
  const w = widthDots(label)
  const h = heightDots(label)
  return (
    `^XA^CI28^PW${w}^LL${h}^LH0,0` +
    '^FO30,40^A0N,60,60^FDHatch Badge^FS' +
    '^FO30,120^A0N,40,40^FDPrinter OK^FS' +
    `^FO30,180^A0N,30,30^FD${w} x ${h} dots^FS` +
    '^XZ'
  )
}
