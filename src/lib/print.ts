import { renderBadge } from './badgeRenderer'
import { ensureGeist } from './fonts'
import { getNiimbot } from './niimbot/connection'
import { badgeZpl, testZpl } from './zpl'
import type { Label } from './label'
import type { AppSettings } from './settings'
import type { Badge } from './types'

export interface PrinterInfo {
  name: string
  description: string
  state: string
  uri: string
  /** 'USB' | 'Bluetooth' | 'Network' | … — how the laptop reaches it. */
  connection: string
  /** Looks like a Zebra/ZPL label queue, so raw ZPL is the right mode. */
  zpl: boolean
  isDefault: boolean
}

export type PrintResult = { ok: true; jobId: string } | { ok: false; error: string }

/** Every print queue the laptop has — USB, Bluetooth-paired, or on the WiFi. */
export async function listPrinters(): Promise<PrinterInfo[]> {
  const res = await fetch('/api/printers')
  if (!res.ok) throw new Error('Could not read the laptop’s printers.')
  const json = await res.json()
  return json.printers ?? []
}

async function send(body: Record<string, unknown>): Promise<PrintResult> {
  try {
    const res = await fetch('/api/print', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, error: json?.detail || json?.error || `HTTP ${res.status}` }
    return { ok: true, jobId: json?.jobId ?? '' }
  } catch (e) {
    return { ok: false, error: 'Companion server unreachable — is `npm start` still running?' }
  }
}

const pngBase64 = (canvas: HTMLCanvasElement) => canvas.toDataURL('image/png').split(',')[1] ?? ''

/** NIIMBOT printers are driven straight from the browser, not through `lp`. */
async function sendToNiimbot(canvas: HTMLCanvasElement, settings: AppSettings): Promise<PrintResult> {
  const client = getNiimbot()
  if (!client) {
    return {
      ok: false,
      error: 'NIIMBOT not connected. Open Settings and hit Connect (the printer must be plugged in or paired).',
    }
  }
  try {
    await client.printCanvas(canvas, {
      density: settings.niimbotDensity,
      labelType: settings.niimbotLabelType,
      headWidth: settings.niimbotHeadWidth,
      rotation: settings.niimbotRotation,
    })
    return { ok: true, jobId: '' }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? String(e) }
  }
}

/** Renders the badge and sends it to the selected queue in the chosen mode. */
export async function printBadge(badge: Badge, settings: AppSettings, label: Label): Promise<PrintResult> {
  if (settings.printerBackend !== 'niimbot' && !settings.printerName) {
    return { ok: false, error: 'No printer selected.' }
  }
  await ensureGeist()
  const canvas = renderBadge(document.createElement('canvas'), badge, label)

  if (settings.printerBackend === 'niimbot') return sendToNiimbot(canvas, settings)

  if (settings.printMode === 'image') {
    return send({
      printer: settings.printerName,
      mode: 'image',
      pngBase64: pngBase64(canvas),
      widthMm: label.widthMm,
      heightMm: label.heightMm,
      title: `Hatch badge — ${badge.first_name} ${badge.last_name}`.trim(),
    })
  }
  return send({
    printer: settings.printerName,
    mode: 'raw',
    zpl: badgeZpl(canvas, label),
    title: `Hatch badge — ${badge.first_name} ${badge.last_name}`.trim(),
  })
}

/** Test label: raw ZPL for Zebra queues, a rendered PNG for driver mode. */
export async function printTest(settings: AppSettings, label: Label): Promise<PrintResult> {
  if (settings.printerBackend !== 'niimbot' && !settings.printerName) {
    return { ok: false, error: 'No printer selected.' }
  }

  if (settings.printerBackend === 'niimbot' || settings.printMode === 'image') {
    await ensureGeist()
    const sample: Badge = {
      ticket_id: '', ticket_secret: '', first_name: 'Test', last_name: 'Print',
      full_name: 'Test Print', company: 'Hatch', job_title: '', linkedin_url: '',
      ticket_type_label: '', role: '', status: '', checked_in: false,
      checked_in_at: null, role_tag: null, days: [1],
    }
    const canvas = renderBadge(document.createElement('canvas'), sample, label)
    if (settings.printerBackend === 'niimbot') return sendToNiimbot(canvas, settings)
    return send({
      printer: settings.printerName,
      mode: 'image',
      pngBase64: pngBase64(canvas),
      widthMm: label.widthMm,
      heightMm: label.heightMm,
      title: 'Hatch test label',
    })
  }
  return send({ printer: settings.printerName, mode: 'raw', zpl: testZpl(label), title: 'Hatch test label' })
}
