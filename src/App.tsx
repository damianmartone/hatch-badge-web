import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AdminChrome, Dialog, Toast } from './components/Chrome'
import { CameraPane } from './components/CameraPane'
import { GearIcon, SearchIcon } from './components/Icons'
import { KioskFlow } from './components/KioskFlow'
import { SessionFlow } from './components/SessionFlow'
import { SettingsScreen } from './components/SettingsScreen'
import { StaffSearch } from './components/StaffSearch'
import type { Label } from './lib/label'
import {
  isConfigured,
  isSessionsMode,
  labelFor,
  loadSettings,
  saveSettings,
  type AppSettings,
} from './lib/settings'
import { scanningEnabled, useKiosk } from './lib/useKiosk'
import { sessScanningEnabled, useSessions } from './lib/useSessions'

type Screen = 'KIOSK' | 'SETTINGS' | 'SEARCH'

/** A check-in stand shouldn't dim mid-queue. Best-effort; ignored if unsupported. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen')
      } catch {
        /* denied or unsupported — the kiosk still works */
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !cancelled) void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release().catch(() => {})
    }
  }, [active])
}

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  // Like the tablet build, a fresh load lands on Settings; staff tap Back to run.
  const [screen, setScreen] = useState<Screen>('SETTINGS')
  const [adminOpen, setAdminOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const toast = useCallback((msg: string) => setMessage(msg), [])

  const persist = useCallback((next: AppSettings) => {
    setSettings(next)
    saveSettings(next)
  }, [])

  const patchSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      setSettings((s) => {
        const next = { ...s, ...patch }
        saveSettings(next)
        return next
      })
    },
    [],
  )

  // Follows the selected printer, so the review screen previews the real print.
  const labelKey = JSON.stringify(labelFor(settings))
  const label: Label = useMemo(() => JSON.parse(labelKey), [labelKey])

  const sessions = isSessionsMode(settings)
  const onKiosk = screen === 'KIOSK'

  const kiosk = useKiosk(settings, label, toast)
  const sess = useSessions(settings, patchSettings, onKiosk && sessions)

  useWakeLock(onKiosk)

  // First run: if the PIN / URL isn't set, staff belong in Settings.
  useEffect(() => {
    if (!isConfigured(settings)) setScreen('SETTINGS')
  }, [settings])

  // Staff shortcut for the laptop, alongside the hidden top-left corner.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        setAdminOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Hidden admin entry: press and hold the top-left corner.
  const holdTimer = useRef<number | undefined>(undefined)
  const startHold = () => {
    holdTimer.current = window.setTimeout(() => setAdminOpen(true), 800)
  }
  const cancelHold = () => window.clearTimeout(holdTimer.current)

  if (screen === 'SETTINGS') {
    return (
      <>
        <AdminChrome title="Printer, PIN & mode" onBack={() => setScreen('KIOSK')}>
          <SettingsScreen settings={settings} onSave={persist} toast={toast} />
        </AdminChrome>
        <Toast message={message} onDone={() => setMessage(null)} />
      </>
    )
  }

  if (screen === 'SEARCH') {
    return (
      <>
        <AdminChrome title="Staff check-in" onBack={() => setScreen('KIOSK')}>
          <StaffSearch settings={settings} label={label} toast={toast} />
        </AdminChrome>
        <Toast message={message} onDone={() => setMessage(null)} />
      </>
    )
  }

  return (
    <>
      <div className="kiosk">
        <CameraPane
          enabled={sessions ? sessScanningEnabled(sess.state) : scanningEnabled(kiosk.state)}
          deviceId={settings.cameraId || undefined}
          onQr={sessions ? sess.scan : kiosk.scan}
          hint={
            sessions
              ? 'Hold your ticket QR up to the camera'
              : 'Hold your ticket QR up to the camera'
          }
        />

        <div className="flow-pane">
          {sessions ? (
            <SessionFlow
              state={sess.state}
              onPickQuery={sess.setPickQuery}
              onPickRun={() => void sess.runPicker()}
              onSelectSession={sess.selectSession}
              onUseTokens={sess.useTokens}
              onChangeSession={sess.changeSession}
              onOpenPeople={sess.openPeople}
              onPeopleQuery={sess.setPeopleQuery}
              onPickPerson={sess.pickPerson}
              onReset={sess.reset}
            />
          ) : (
            <KioskFlow
              state={kiosk.state}
              label={label}
              overridePin={settings.overridePin}
              onCheckInAndPrint={() => void kiosk.checkInAndPrint()}
              onEdit={kiosk.editStart}
              onSaveEdits={(a, b, c, d) => void kiosk.saveEdits(a, b, c, d)}
              onEditCancel={kiosk.editCancel}
              onReset={kiosk.reset}
              onOpenSearch={kiosk.openSearch}
              onSearchQuery={kiosk.setSearchQuery}
              onPickResult={kiosk.pickResult}
            />
          )}
        </div>

        <div
          className="hot-corner"
          onPointerDown={startHold}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
          title="Hold for the staff menu (or ⌘⇧S)"
        />
      </div>

      {adminOpen && (
        <Dialog title="Staff menu" onClose={() => setAdminOpen(false)}>
          <div className="stack">
            <button
              type="button"
              className="btn primary block big"
              onClick={() => {
                setAdminOpen(false)
                setScreen('SETTINGS')
              }}
            >
              <GearIcon />
              Printer, PIN &amp; mode
            </button>
            <button
              type="button"
              className="btn block big"
              onClick={() => {
                setAdminOpen(false)
                setScreen('SEARCH')
              }}
            >
              <SearchIcon />
              Staff search / check-in
            </button>
          </div>
        </Dialog>
      )}

      <Toast message={message} onDone={() => setMessage(null)} />
    </>
  )
}
