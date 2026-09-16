import QRCode from 'qrcode'

/**
 * Encodes [content] as a black-on-white QR canvas whose side is as close to
 * [targetPx] as whole modules allow (never larger), with a 1-module quiet zone —
 * module-exact, so the printed QR has no resampling blur. Null on failure.
 */
export function qrCanvas(content: string, targetPx: number): HTMLCanvasElement | null {
  if (!content.trim() || targetPx <= 0) return null
  try {
    const qr = QRCode.create(content, { errorCorrectionLevel: 'M' })
    const size = qr.modules.size
    const data = qr.modules.data
    const n = size + 2 // includes the margin=1 quiet zone
    const px = Math.max(1, Math.floor(targetPx / n))
    const side = px * n

    const canvas = document.createElement('canvas')
    canvas.width = side
    canvas.height = side
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, side, side)
    ctx.fillStyle = '#000'
    for (let my = 0; my < size; my++) {
      for (let mx = 0; mx < size; mx++) {
        if (data[my * size + mx]) ctx.fillRect((mx + 1) * px, (my + 1) * px, px, px)
      }
    }
    return canvas
  } catch {
    return null
  }
}
