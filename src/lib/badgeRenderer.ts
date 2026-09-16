import { heightDots, widthDots, dotsPerMm, type Label } from './label'
import { qrCanvas } from './qr'
import { hasLinkedin, displayName, type Badge } from './types'

/**
 * Renders a badge to a 1-bit-friendly canvas using the embedded **Geist** font.
 * The SAME canvas is shown on screen and sent to the Zebra (as a ^GFA graphic),
 * so the printed font is exactly Geist and the preview is WYSIWYG.
 *
 * This is a direct port of the Android `BadgeBitmapRenderer`, down to the
 * proportions, so a badge printed from the laptop matches one printed from the
 * tablet dot for dot.
 *
 * Layout:
 *   - QR = 0.36 × width, right-aligned, near the top.
 *   - Left column holds first name (bold), last name (semibold); company
 *     (medium, uppercased) sits below the QR using the full width.
 *   - Role star + tag, or one circle per day, in the bottom band.
 */

const FAMILY = 'Geist'

interface Sized {
  size: number
  text: string
}

function setFont(ctx: CanvasRenderingContext2D, weight: number, size: number): void {
  ctx.font = `${weight} ${size}px ${FAMILY}`
}

function metrics(ctx: CanvasRenderingContext2D, text: string) {
  const m = ctx.measureText(text || 'M')
  // Fall back to rough ratios if the browser omits the font bounding box.
  const size = parseFloat(ctx.font) || 16
  const ascent = m.fontBoundingBoxAscent ?? size * 0.8
  const descent = m.fontBoundingBoxDescent ?? size * 0.2
  return { ascent, descent }
}

/** Draws [st] with its top at [topY]; returns the line height to advance by. */
function drawTop(ctx: CanvasRenderingContext2D, weight: number, st: Sized, x: number, topY: number): number {
  setFont(ctx, weight, st.size)
  const { ascent, descent } = metrics(ctx, st.text)
  ctx.fillText(st.text, x, topY + ascent)
  return Math.round(ascent + descent)
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  const ell = '…'
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 0 && ctx.measureText(t + ell).width > maxW) t = t.slice(0, -1)
  return t.length === 0 ? ell : t + ell
}

/** Largest size ≤ target that fits [maxW] on one line; ellipsize if even min is too wide. */
function fitOneLine(
  ctx: CanvasRenderingContext2D,
  weight: number,
  text: string,
  target: number,
  min: number,
  maxW: number,
): Sized {
  if (!text) return { size: target, text }
  setFont(ctx, weight, target)
  const width = ctx.measureText(text).width
  if (width <= maxW || width <= 0) return { size: target, text }

  const size = Math.max(min, Math.floor((target * maxW) / width))
  setFont(ctx, weight, size)
  const fitted = ctx.measureText(text).width > maxW ? ellipsize(ctx, text, maxW) : text
  return { size, text: fitted }
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number): void {
  const inner = outer * 0.42
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const ang = ((-90 + i * 36) * Math.PI) / 180
    const rr = i % 2 === 0 ? outer : inner
    const px = cx + rr * Math.cos(ang)
    const py = cy + rr * Math.sin(ang)
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fillStyle = '#fff'
  ctx.fill()
  ctx.fillStyle = '#000'
}

/** Bottom band: role star + tag, OR one day-number circle per day. */
function drawBottomIndicators(
  ctx: CanvasRenderingContext2D,
  badge: Badge,
  w: number,
  h: number,
  margin: number,
): void {
  const indD = Math.round(h * 0.16)
  const r = indD / 2
  const gap = Math.round(indD * 0.18)
  const cy = h - margin - r

  const tag = badge.role_tag?.trim()
  if (tag) {
    // Star in a black circle, bottom-left.
    ctx.fillStyle = '#000'
    ctx.beginPath()
    ctx.arc(margin + r, cy, r, 0, Math.PI * 2)
    ctx.fill()
    drawStar(ctx, margin + r, cy, r * 0.6)

    // Black tag with white Geist-Bold label, bottom-right.
    setFont(ctx, 700, indD * 0.42)
    const tw = ctx.measureText(tag).width
    const padH = indD * 0.36
    const tagH = indD
    const x1 = w - margin
    const x0 = x1 - (tw + 2 * padH)
    ctx.fillStyle = '#000'
    ctx.beginPath()
    ctx.roundRect(x0, cy - tagH / 2, x1 - x0, tagH, tagH * 0.24)
    ctx.fill()
    const { ascent, descent } = metrics(ctx, tag)
    ctx.fillStyle = '#fff'
    ctx.fillText(tag, x0 + padH, cy + (ascent - descent) / 2)
    ctx.fillStyle = '#000'
    return
  }

  if (badge.days.length > 0) {
    setFont(ctx, 700, indD * 0.4)
    let cx = margin
    for (const day of badge.days) {
      ctx.fillStyle = '#000'
      ctx.beginPath()
      ctx.arc(cx + r, cy, r, 0, Math.PI * 2)
      ctx.fill()
      const s = String(day)
      const tw = ctx.measureText(s).width
      const { ascent, descent } = metrics(ctx, s)
      ctx.fillStyle = '#fff'
      ctx.fillText(s, cx + r - tw / 2, cy + (ascent - descent) / 2)
      ctx.fillStyle = '#000'
      cx += indD + gap
    }
  }
}

/** Renders the badge into [canvas], resizing it to the label's dot grid. */
export function renderBadge(canvas: HTMLCanvasElement, badge: Badge, label: Label): HTMLCanvasElement {
  const w = widthDots(label)
  const h = heightDots(label)
  canvas.width = w
  canvas.height = h

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return canvas

  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#000'
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'

  const margin = Math.round(h * 0.08)
  const gap = Math.round(w * 0.03)
  const nameGap = Math.round(h * 0.02) // first->last == last->company
  const minFirst = Math.round(h * 0.09)
  const minRest = Math.round(h * 0.07)

  // --- QR (top-right, 0.36 width) ---
  let textCol = w - 2 * margin
  let qrBottom = margin
  if (hasLinkedin(badge)) {
    const qr = qrCanvas(badge.linkedin_url, Math.round(w * 0.36))
    if (qr) {
      const qrX = w - margin - qr.width
      ctx.drawImage(qr, qrX, margin)
      textCol = qrX - gap - margin
      qrBottom = margin + qr.height
    }
  }

  const x = margin
  let y = margin

  // First name (bold, 700)
  const first = badge.first_name.trim() || displayName(badge)
  const s1 = fitOneLine(ctx, 700, first, Math.round(h * 0.184), minFirst, textCol)
  y += drawTop(ctx, 700, s1, x, y) + nameGap

  // Last name (semibold, 600)
  if (badge.last_name.trim()) {
    const s2 = fitOneLine(ctx, 600, badge.last_name, Math.round(h * 0.135), minRest, textCol)
    y += drawTop(ctx, 600, s2, x, y) + nameGap
  }

  // Company (medium, 500, uppercased) — one line, auto-shrunk to ~60 mm.
  // Sits below the QR so it can use the full width instead of wrapping.
  if (badge.company.trim()) {
    const indicatorsTop = h - margin - Math.round(h * 0.16)
    const vPad = Math.round(h * 0.015)
    const companyTop = Math.max(y, qrBottom + vPad)
    const vAvail = Math.max(indicatorsTop - companyTop - vPad, Math.round(h * 0.06))
    const maxWidth = Math.min(Math.round(60 * dotsPerMm(label.dpi)), w - 2 * margin)
    const target = Math.min(Math.round(h * 0.11), Math.trunc(vAvail / 1.28))
    const st = fitOneLine(ctx, 500, badge.company.toUpperCase(), target, Math.round(h * 0.05), maxWidth)
    drawTop(ctx, 500, st, x, companyTop)
  }

  drawBottomIndicators(ctx, badge, w, h, margin)
  return canvas
}
