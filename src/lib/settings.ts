import type { Rotation } from './niimbot/image'

/** All user-configurable settings, persisted in localStorage. */
export interface AppSettings {
  functionUrl: string
  staffPin: string
  /**
   * 'system' = a print queue the laptop already has (CUPS: USB, Bluetooth, WiFi).
   * 'niimbot' = a NIIMBOT talked to directly, since macOS has no driver for them.
   */
  printerBackend: 'system' | 'niimbot'
  /** CUPS queue name from /api/printers — no IP, no port. */
  printerName: string
  /** 'raw' = ZPL straight to a Zebra queue, 'image' = PNG through the driver. */
  printMode: 'raw' | 'image'
  labelWidthMm: number
  labelHeightMm: number
  dpi: number
  overridePin: string
  /** 'EVENT' (badge printing) or 'SESSIONS' (RSVP check-in). */
  mode: 'EVENT' | 'SESSIONS'
  sessionId: string
  sessionTitle: string
  /** Which camera to scan with (deviceId from enumerateDevices), '' = default. */
  cameraId: string
  /** NIIMBOT backend only. */
  niimbotTransport: 'serial' | 'bluetooth'
  niimbotDensity: number
  niimbotLabelType: number
  niimbotHeadWidth: number
  niimbotRotation: Rotation
}

export const DEFAULTS: AppSettings = {
  functionUrl: 'https://dpacnmgiyezxtodtodac.supabase.co/functions/v1/badge-checkin',
  staffPin: '',
  printerBackend: 'system',
  printerName: '',
  printMode: 'raw',
  labelWidthMm: 80,
  labelHeightMm: 50,
  dpi: 203,
  // 4-digit staff code to authorize re-printing an already-checked-in badge.
  overridePin: '2468',
  mode: 'EVENT',
  sessionId: '',
  sessionTitle: '',
  cameraId: '',
  niimbotTransport: 'serial',
  niimbotDensity: 3,
  niimbotLabelType: 1,
  niimbotHeadWidth: 384,
  niimbotRotation: 'auto',
}

/** Sentinel session id meaning "no fixed session — accept per-session QR tokens". */
export const SESSION_ANY = 'ANY'

const KEY = 'hatch_badge_settings'

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(s: AppSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* private window / storage disabled — settings just won't persist */
  }
}

export const isConfigured = (s: AppSettings) => Boolean(s.functionUrl.trim() && s.staffPin.trim())
/** NIIMBOT is "configured" as soon as the backend is picked; the live
 *  connection is checked at print time so staff get a clear message instead. */
export const isPrinterConfigured = (s: AppSettings) =>
  s.printerBackend === 'niimbot' ? true : Boolean(s.printerName.trim())
export const isSessionsMode = (s: AppSettings) => s.mode === 'SESSIONS'
