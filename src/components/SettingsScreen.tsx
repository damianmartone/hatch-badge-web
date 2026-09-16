import { useEffect, useState } from 'react'
import { HEAD_WIDTHS } from '../lib/niimbot/client'
import { connectNiimbot, disconnectNiimbot, tryReconnectSerial, useNiimbot } from '../lib/niimbot/connection'
import type { Rotation } from '../lib/niimbot/image'
import { bluetoothSupported, serialSupported } from '../lib/niimbot/transport'
import { listPrinters, printTest, type PrinterInfo } from '../lib/print'
import { listCameras, type CameraOption } from '../lib/scanner'
import { DEFAULTS, type AppSettings } from '../lib/settings'
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

  const save = () => {
    onSave(draft)
    toast('Settings saved')
  }

  const saveAndTest = async () => {
    onSave(draft)
    if (draft.printerBackend === 'system' && !draft.printerName) {
      toast('Pick a printer first.')
      return
    }
    setTesting(true)
    const r = await printTest(draft, {
      widthMm: draft.labelWidthMm,
      heightMm: draft.labelHeightMm,
      dpi: draft.dpi,
    })
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

      {/* ---- Label size (shared by both backends) ---- */}
      {draft.printerBackend === 'niimbot' && (
        <section className="card stack">
          <h3>Label size</h3>
          <p className="small muted">
            The badge is drawn at this size, then turned sideways to fit the NIIMBOT’s narrow head.
          </p>
          <div className="row">
            <div className="field grow">
              <label htmlFor="st-nw">Width mm</label>
              <input id="st-nw" type="number" min={10} max={200} value={draft.labelWidthMm}
                onChange={(e) => set('labelWidthMm', Number(e.target.value) || DEFAULTS.labelWidthMm)} />
            </div>
            <div className="field grow">
              <label htmlFor="st-nh">Height mm</label>
              <input id="st-nh" type="number" min={10} max={200} value={draft.labelHeightMm}
                onChange={(e) => set('labelHeightMm', Number(e.target.value) || DEFAULTS.labelHeightMm)} />
            </div>
            <div className="field grow">
              <label htmlFor="st-ndpi">DPI</label>
              <input id="st-ndpi" type="number" min={100} max={600} value={draft.dpi}
                onChange={(e) => set('dpi', Number(e.target.value) || DEFAULTS.dpi)} />
            </div>
          </div>
        </section>
      )}

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

      {/* ---- Save ---- */}
      <section className="card stack">
        <h3>Save</h3>
        <button type="button" className="btn primary block big" onClick={save}>
          Save settings
        </button>
        <button type="button" className="btn block big" onClick={() => void saveAndTest()} disabled={testing}>
          <PrintIcon />
          {testing ? 'Sending…' : 'Save & test print'}
        </button>
      </section>
    </div>
  )
}


// ---------------- NIIMBOT ----------------

/**
 * NIIMBOTs have no macOS driver, so they never show up in Printers & Scanners.
 * The browser talks to them directly, which needs one click to pick the device.
 */
function NiimbotPanel({
  draft,
  set,
}: {
  draft: AppSettings
  set: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}) {
  const conn = useNiimbot()
  const transport = draft.niimbotTransport
  const supported = transport === 'serial' ? serialSupported() : bluetoothSupported()

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
        <p className="small faint">
          The badge is scaled to this head width — a 12 mm D11 can’t fit a conference badge legibly.
        </p>
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
        <div className="field grow">
          <label htmlFor="st-nb-rot">Orientation</label>
          <select
            id="st-nb-rot"
            value={draft.niimbotRotation}
            onChange={(e) => set('niimbotRotation', e.target.value as Rotation)}
          >
            <option value="auto">Auto (turn if too wide)</option>
            <option value="none">Upright</option>
            <option value="90">Always sideways</option>
          </select>
        </div>
      </div>
    </>
  )
}
