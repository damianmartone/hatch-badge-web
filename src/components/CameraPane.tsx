import { useScanner, type CameraStatus } from '../lib/scanner'

interface Props {
  enabled: boolean
  deviceId?: string
  onQr: (value: string) => void
  hint: string
  /** Shown top-left over the video, e.g. "Scanning" / "Paused". */
  statusLabel?: string
}

function statusText(status: CameraStatus, enabled: boolean): { text: string; cls: string } {
  if (status === 'live') return enabled ? { text: 'Scanning', cls: 'live' } : { text: 'Paused', cls: 'paused' }
  if (status === 'starting') return { text: 'Starting camera…', cls: '' }
  if (status === 'denied') return { text: 'Camera blocked', cls: '' }
  if (status === 'error') return { text: 'Camera error', cls: '' }
  return { text: 'Camera off', cls: '' }
}

/**
 * The left half of the kiosk: a permanently live webcam. Unlike the phone
 * layout it never shrinks, because the badge sits beside it rather than below.
 */
export function CameraPane({ enabled, deviceId, onQr, hint, statusLabel }: Props) {
  const { status, error, videoRef, retry } = useScanner({ enabled, deviceId, onQr })
  const s = statusText(status, enabled)

  return (
    <div className="camera-pane">
      <video ref={videoRef} autoPlay muted playsInline />

      {status === 'live' && (
        <>
          <div className="camera-frame">
            <div className="reticle" />
          </div>
          <p className="camera-hint">{hint}</p>
        </>
      )}

      {(status === 'denied' || status === 'error') && (
        <div className="camera-message stack">
          <p>{error}</p>
          <button type="button" className="btn primary" onClick={retry}>
            Try camera again
          </button>
        </div>
      )}

      <span className="camera-badge">
        <span className={`dot ${s.cls}`} />
        {statusLabel ?? s.text}
      </span>
    </div>
  )
}
