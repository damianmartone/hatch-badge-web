import { useEffect, useState } from 'react'
import { HEAD_WIDTHS } from '../lib/niimbot/client'
import { connectNiimbot, disconnectNiimbot, refreshRoll, tryReconnectSerial, useNiimbot } from '../lib/niimbot/connection'
import { niimbotLayout, type Rotation } from '../lib/niimbot/image'
import { bluetoothSupported, serialSupported } from '../lib/niimbot/transport'
import { listPrinters, printTest, type PrinterInfo } from '../lib/print'
import { listCameras, type CameraOption } from '../lib/scanner'
import { DEFAULTS, labelFor, type AppSettings } from '../lib/settings'
import { EMPTY_BADGE, type Badge } from '../lib/types'
import { BadgePreview } from './BadgePreview'
import { BluetoothIcon, PrintIcon, UsbIcon, WifiIcon } from './Icons'

interface Props {
  settings: AppSettings
  onSave: (s: AppSettings) => void
  toast: (msg: string) => void
}

function ConnectionIcon({ connection }: { connection: string }) {
  if (connection === 'USB') return <UsbIcon size={16} />
  if (connection === 'Bluetooth') return <BluetoothIcon size={16} />
  if (connection === 'Network') return <WifiIcon size={16} />
  return <PrintIcon size={16} />
}

/**
 * Printer setup is just "pick one of the laptop's queues" — anything macOS or
 * Linux already has (USB, Bluetooth-paired, or on the WiFi) shows up here, so
 * there is no printer IP or port to type.
 */
export function SettingsScreen({ settings, onSave, toast }: Props) {
  const [draft, setDraft] = useState<AppSettings>(settings)
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [cameras, setCameras] = useState<CameraOption[]>([])
  const [loadingPrinters, setLoadingPrinters] = useState(true)
  const [printerError, setPrinterError] = useState<string | null>(null)
  const [showPin, setShowPin] = useState(false)
  const [testing, setTesting] = useState(false)

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const refreshPrinters = async () => {
    setLoadingPrinters(true)
    setPrinterError(null)
    try {
      const list = await listPrinters()
      setPrinters(list)
      // First run: preselect the label printer, or the system default.
      setDraft((d) => {
        if (d.printerName && list.some((p) => p.name === d.printerName)) return d
        const pick = list.find((p) => p.zpl) ?? list.find((p) => p.isDefault) ?? list[0]
        return pick ? { ...d, printerName: pick.name, printMode: pick.zpl ? 'raw' : 'image' } : d
      })
    } catch (e) {
      setPrinterError((e as Error).message)
    } finally {
      setLoadingPrinters(false)
    }
  }

  useEffect(() => {
    void refreshPrinters()
    void listCameras().then(setCameras)
    // A USB NIIMBOT the user already approved can come back without a click.
    void tryReconnectSerial()
  }, [])

  const selected = printers.find((p) => p.name === draft.printerName)

  // Save as you go. Staff type the PIN and head straight back to the kiosk;
  // an explicit Save button meant that silently threw the PIN away.
  useEffect(() => {
    onSave(draft)
  }, [draft, onSave])

  const testPrint = async () => {
    if (draft.printerBackend === 'system' && !draft.printerName) {
      toast('Pick a printer first.')
      return
    }
    setTesting(true)
    const r = await printTest(draft, labelFor(draft))
    setTesting(false)
    toast(r.ok ? 'Test label sent to the printer' : `Test print failed: ${r.error}`)
  }

  return (
    <div className="admin-grid">
      {/* ---- Event / access ---- */}
      <section className="card stack">
        <h3>Access</h3>

        <div className="field">
          <label htmlFor="st-pin">Access PIN</label>
          <div className="row">
            <input
              id="st-pin"
              className="grow"
              type={showPin ? 'text' : 'password'}
              value={draft.staffPin}
              autoComplete="off"
              onChange={(e) => set('staffPin', e.target.value)}
            />
            <button type="button" className="btn" onClick={() => setShowPin((v) => !v)}>
              {showPin ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <div className="field">
          <label htmlFor="st-url">Edge function URL</label>
          <input
            id="st-url"
            type="text"
            value={draft.functionUrl}
            spellCheck={false}
            onChange={(e) => set('functionUrl', e.target.value)}
          />
          <p className="small faint">Must be an https Supabase function URL.</p>
        </div>

        <div className="field">
          <label htmlFor="st-override">Staff override code (re-print already checked-in)</label>
          <input
            id="st-override"
            type="text"
            inputMode="numeric"
            value={draft.overridePin}
            onChange={(e) => set('overridePin', e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
        </div>

        <div className="field">
          <label htmlFor="st-mode">Terminal mode</label>
          <select id="st-mode" value={draft.mode} onChange={(e) => set('mode', e.target.value as AppSettings['mode'])}>
            <option value="EVENT">Event check-in & badge printing</option>
            <option value="SESSIONS">Session RSVP check-in (no printing)</option>
          </select>
        </div>
      </section>

      {/* ---- Printer ---- */}
      <section className="card stack">
        <div className="row">
          <h3 className="grow">Printer</h3>
          {draft.printerBackend === 'system' && (
            <button type="button" className="btn ghost" onClick={() => void refreshPrinters()}>
              Refresh
            </button>
          )}
        </div>

        <div className="field">
          <label htmlFor="st-backend">Printer type</label>
          <select
            id="st-backend"
            value={draft.printerBackend}
            onChange={(e) => set('printerBackend', e.target.value as AppSettings['printerBackend'])}
          >
            <option value="system">A printer this laptop has installed (Zebra, USB/WiFi/Bluetooth)</option>
            <option value="niimbot">NIIMBOT (D11 / D110 / B1 / B21 …) over USB or Bluetooth</option>
          </select>
        </div>

        {draft.printerBackend === 'niimbot' ? (
          <NiimbotPanel draft={draft} set={set} />
        ) : (
        <>
        <p className="small muted">
          Every printer this laptop already has — USB, Bluetooth-paired, or on the WiFi. Add a new one in
          macOS <em>System Settings → Printers &amp; Scanners</em>, then hit Refresh.
        </p>

        {loadingPrinters && <p className="muted">Reading the laptop’s printers…</p>}
        {printerError && <p style={{ color: 'var(--danger)' }}>{printerError}</p>}
        {!loadingPrinters && !printerError && printers.length === 0 && (
          <p style={{ color: 'var(--danger)' }}>
            No printers installed. Add the Zebra in System Settings → Printers &amp; Scanners first.
          </p>
        )}

        {printers.length > 0 && (
          <div className="field">
            <label htmlFor="st-printer">Printer</label>
            <select
              id="st-printer"
              value={draft.printerName}
              onChange={(e) => {
                const name = e.target.value
                const p = printers.find((x) => x.name === name)
                setDraft((d) => ({ ...d, printerName: name, printMode: p?.zpl ? 'raw' : 'image' }))
              }}
            >
              <option value="">— none —</option>
              {printers.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.description || p.name} ({p.connection}
                  {p.isDefault ? ', default' : ''})
                </option>
              ))}
            </select>
          </div>
        )}

        {selected && (
          <div className="row wrap">
            <span className="pill">
              <ConnectionIcon connection={selected.connection} />
              {selected.connection}
            </span>
            <span className={`pill ${selected.state === 'idle' ? 'ok' : 'warn'}`}>{selected.state}</span>
            {selected.zpl && <span className="pill ok">ZPL label printer</span>}
          </div>
        )}

        <div className="field">
          <label htmlFor="st-printmode">How to send the badge</label>
          <select
            id="st-printmode"
            value={draft.printMode}
            onChange={(e) => set('printMode', e.target.value as AppSettings['printMode'])}
          >
            <option value="raw">Raw ZPL — Zebra label printers (sharpest)</option>
            <option value="image">Image through the driver — any printer</option>
          </select>
          <p className="small faint">
            {draft.printMode === 'raw'
              ? 'The badge is rendered here and sent as a ZPL graphic, so the print matches the preview exactly.'
              : 'The badge is sent as a PNG sized to the label and printed through the printer’s own driver.'}
          </p>
        </div>

        <div className="row">
          <div className="field grow">
            <label htmlFor="st-w">Width mm</label>
            <input id="st-w" type="number" min={10} max={200} value={draft.labelWidthMm}
              onChange={(e) => set('labelWidthMm', Number(e.target.value) || DEFAULTS.labelWidthMm)} />
          </div>
          <div className="field grow">
            <label htmlFor="st-h">Height mm</label>
            <input id="st-h" type="number" min={10} max={200} value={draft.labelHeightMm}
              onChange={(e) => set('labelHeightMm', Number(e.target.value) || DEFAULTS.labelHeightMm)} />
          </div>
          <div className="field grow">
            <label htmlFor="st-dpi">DPI</label>
            <input id="st-dpi" type="number" min={100} max={600} value={draft.dpi}
              onChange={(e) => set('dpi', Number(e.target.value) || DEFAULTS.dpi)} />
          </div>
        </div>
        </>
        )}
      </section>

      {/* ---- NIIMBOT roll ---- */}
      {draft.printerBackend === 'niimbot' && <NiimbotRollCard draft={draft} set={set} />}

      {/* ---- Camera ---- */}
      <section className="card stack">
        <h3>Camera</h3>
        <div className="field">
          <label htmlFor="st-cam">Scanner camera</label>
          <select id="st-cam" value={draft.cameraId} onChange={(e) => set('cameraId', e.target.value)}>
            <option value="">Default (built-in webcam)</option>
            {cameras.map((c) => (
              <option key={c.deviceId} value={c.deviceId}>
                {c.label}
              </option>
            ))}
          </select>
          <p className="small faint">
            Camera names appear once you’ve allowed camera access at least once.
          </p>
        </div>
      </section>

      {/* ---- Test ---- */}
      <section className="card stack">
        <h3>Test</h3>
        <p className="small muted">Changes save automatically.</p>
        <button type="button" className="btn primary block big" onClick={() => void testPrint()} disabled={testing}>
          <PrintIcon />
          {testing ? 'Sending…' : 'Test print'}
        </button>
      </section>
    </div>
  )
}

// ---------------- NIIMBOT ----------------

type SetFn = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void

const DOTS_PER_MM = 203 / 25.4

/** Common NIIMBOT roll sizes, width (across the head) × length (along the feed). */
const ROLL_PRESETS: [number, number][] = [
  [50, 30], [40, 30], [30, 20], [50, 50], [60, 40], [70, 50], [75, 50], [50, 80], [40, 60],
]

const STOCK_NAMES: Record<number, string> = { 1: 'gap labels', 2: 'black-mark labels', 3: 'continuous roll' }

const SAMPLE: Badge = {
  ...EMPTY_BADGE,
  ticket_id: 'sample',
  first_name: 'Hanna',
  last_name: 'Kang',
  company: 'GetYourGuide',
  linkedin_url: 'https://www.linkedin.com/in/hatch',
  days: [1, 2],
}

/**
 * NIIMBOTs have no macOS driver, so they never show up in Printers & Scanners.
 * The browser talks to them directly, which needs one click to pick the device.
 */
function NiimbotPanel({ draft, set }: { draft: AppSettings; set: SetFn }) {
  const conn = useNiimbot()
  const transport = draft.niimbotTransport
  const supported = transport === 'serial' ? serialSupported() : bluetoothSupported()

  // The roll's tag knows its stock type — use it rather than making staff guess.
  const tagType = conn.roll?.type
  useEffect(() => {
    if (tagType && tagType >= 1 && tagType <= 3 && tagType !== draft.niimbotLabelType) {
      set('niimbotLabelType', tagType)
    }
  }, [tagType, draft.niimbotLabelType, set])

  return (
    <>
      <p className="small muted">
        NIIMBOT printers don’t speak ZPL and macOS has no driver for them, so this connects to the
        printer directly from the browser. Needs Chrome or Edge.
      </p>

      <div className="field">
        <label htmlFor="st-nb-transport">How it’s connected</label>
        <select
          id="st-nb-transport"
          value={transport}
          onChange={(e) => set('niimbotTransport', e.target.value as AppSettings['niimbotTransport'])}
        >
          <option value="serial">Plugged in over USB</option>
          <option value="bluetooth">Paired over Bluetooth</option>
        </select>
      </div>

      {!supported && (
        <p style={{ color: 'var(--danger)' }}>
          This browser has no {transport === 'serial' ? 'Web Serial' : 'Web Bluetooth'}. Open the kiosk in
          Chrome or Edge.
        </p>
      )}

      <div className="row wrap">
        {conn.client ? (
          <>
            <span className="pill ok">
              {transport === 'serial' ? <UsbIcon size={14} /> : <BluetoothIcon size={14} />}
              Connected — {conn.info?.name ?? conn.client.name}
            </span>
            {conn.info?.battery != null && <span className="pill">Battery {conn.info.battery}%</span>}
            <button type="button" className="btn ghost" onClick={() => void disconnectNiimbot()}>
              Disconnect
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn primary"
            disabled={conn.connecting || !supported}
            onClick={() => void connectNiimbot(transport)}
          >
            {transport === 'serial' ? <UsbIcon /> : <BluetoothIcon />}
            {conn.connecting ? 'Connecting…' : 'Connect printer'}
          </button>
        )}
      </div>

      {conn.error && <p style={{ color: 'var(--danger)' }}>{conn.error}</p>}

      <div className="field">
        <label htmlFor="st-nb-head">Model / print head</label>
        <select
          id="st-nb-head"
          value={draft.niimbotHeadWidth}
          onChange={(e) => set('niimbotHeadWidth', Number(e.target.value))}
        >
          {HEAD_WIDTHS.map((h) => (
            <option key={h.dots} value={h.dots}>
              {h.label}
            </option>
          ))}
        </select>
      </div>

      <div className="row">
        <div className="field grow">
          <label htmlFor="st-nb-density">Darkness (1–5)</label>
          <input
            id="st-nb-density"
            type="number"
            min={1}
            max={5}
            value={draft.niimbotDensity}
            onChange={(e) => set('niimbotDensity', Math.min(5, Math.max(1, Number(e.target.value) || 3)))}
          />
        </div>
        <div className="field grow">
          <label htmlFor="st-nb-labeltype">Label stock</label>
          <select
            id="st-nb-labeltype"
            value={draft.niimbotLabelType}
            onChange={(e) => set('niimbotLabelType', Number(e.target.value))}
          >
            <option value={1}>Gap labels (normal rolls)</option>
            <option value={2}>Black-mark labels</option>
            <option value={3}>Continuous roll</option>
          </select>
        </div>
      </div>
    </>
  )
}

/** Roll size, orientation and a preview of the badge at the roll's real size. */
function NiimbotRollCard({ draft, set }: { draft: AppSettings; set: SetFn }) {
  const conn = useNiimbot()
  const roll = conn.roll
  const headMm = Math.round(draft.niimbotHeadWidth / DOTS_PER_MM)
  const width = draft.niimbotRollWidthMm
  const length = draft.niimbotRollLengthMm
  const layout = niimbotLayout({ widthMm: width, lengthMm: length }, draft.niimbotRotation)
  const tooWide = width > headMm

  const setRoll = (w: number, l: number) => {
    set('niimbotRollWidthMm', w)
    set('niimbotRollLengthMm', l)
  }

  return (
    <section className="card stack">
      <div className="row">
        <h3 className="grow">NIIMBOT label roll</h3>
        {conn.client && (
          <button type="button" className="btn ghost" onClick={() => void refreshRoll()}>
            Re-read roll
          </button>
        )}
      </div>

      {conn.client && roll && (
        <div className="row wrap">
          <span className="pill ok">Roll detected</span>
          {roll.total > 0 && (
            <span className="pill">
              {Math.max(0, roll.total - roll.used)} of {roll.total} labels left
            </span>
          )}
          {STOCK_NAMES[roll.type] && <span className="pill">{STOCK_NAMES[roll.type]}</span>}
          {roll.barcode && <span className="pill mono">{roll.barcode}</span>}
        </div>
      )}
      {conn.client && !roll && (
        <p className="small muted">No RFID tag on this roll (or the printer didn’t report one).</p>
      )}
      <p className="small muted">
        The roll’s tag doesn’t include its dimensions, so pick the size printed on the roll or its box —
        width first, as NIIMBOT names them.
      </p>

      <div className="row wrap">
        {ROLL_PRESETS.map(([w, l]) => {
          const active = w === width && l === length
          const fits = w <= headMm
          return (
            <button
              key={`${w}x${l}`}
              type="button"
              className={`btn ${active ? 'primary' : ''}`}
              style={{ padding: '8px 12px', fontSize: 14 }}
              title={fits ? undefined : `Wider than this printer’s ${headMm} mm head`}
              onClick={() => setRoll(w, l)}
            >
              {w}×{l}
              {!fits && ' ⚠'}
            </button>
          )
        })}
      </div>

      <div className="row">
        <div className="field grow">
          <label htmlFor="st-roll-w">Width mm (across the printer)</label>
          <input
            id="st-roll-w"
            type="number"
            min={10}
            max={120}
            value={width}
            aria-invalid={tooWide ? 'true' : 'false'}
            onChange={(e) => set('niimbotRollWidthMm', Number(e.target.value) || DEFAULTS.niimbotRollWidthMm)}
          />
        </div>
        <div className="field grow">
          <label htmlFor="st-roll-l">Length mm (feed direction)</label>
          <input
            id="st-roll-l"
            type="number"
            min={10}
            max={200}
            value={length}
            onChange={(e) => set('niimbotRollLengthMm', Number(e.target.value) || DEFAULTS.niimbotRollLengthMm)}
          />
        </div>
      </div>
      {tooWide && (
        <p className="small" style={{ color: 'var(--danger)' }}>
          {width} mm is wider than this printer’s {headMm} mm head — the badge will be shrunk to fit.
        </p>
      )}

      <div className="field">
        <label htmlFor="st-nb-rot">Orientation</label>
        <select
          id="st-nb-rot"
          value={draft.niimbotRotation}
          onChange={(e) => set('niimbotRotation', e.target.value as Rotation)}
        >
          <option value="auto">Auto — upright on wide rolls, turned on tall ones</option>
          <option value="0">Upright</option>
          <option value="90">Turned 90° clockwise</option>
          <option value="180">Upside down</option>
          <option value="270">Turned 90° anticlockwise</option>
        </select>
        <p className="small faint">
          If it comes out the wrong way round, step through these — it saves straight away.
        </p>
      </div>

      <div className="stack tight">
        <span className="small muted">
          Badge drawn at {layout.label.widthMm} × {layout.label.heightMm} mm
          {layout.degrees ? `, sent turned ${layout.degrees}°` : ', sent upright'}
        </span>
        <BadgePreview badge={SAMPLE} label={layout.label} />
      </div>
    </section>
  )
}
