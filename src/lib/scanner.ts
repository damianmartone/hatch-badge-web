import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

/**
 * Camera QR scanning for the laptop webcam. Uses the browser's native
 * BarcodeDetector where it exists (Chrome on macOS backs it with Vision, which
 * is both faster and better at angled/held tickets) and falls back to jsQR.
 */

type Detector = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> }

declare global {
  interface Window {
    BarcodeDetector?: {
      new (opts?: { formats?: string[] }): Detector
      getSupportedFormats?(): Promise<string[]>
    }
  }
}

async function makeDetector(): Promise<Detector | null> {
  try {
    if (!window.BarcodeDetector) return null
    const formats = (await window.BarcodeDetector.getSupportedFormats?.()) ?? []
    if (formats.length && !formats.includes('qr_code')) return null
    return new window.BarcodeDetector({ formats: ['qr_code'] })
  } catch {
    return null
  }
}

export type CameraStatus = 'idle' | 'starting' | 'live' | 'denied' | 'error'

export interface ScannerOptions {
  /** Detection only runs while true; the preview stays live either way. */
  enabled: boolean
  deviceId?: string
  onQr: (value: string) => void
}

export interface ScannerState {
  status: CameraStatus
  error: string | null
  /** Attach to a <video autoPlay muted playsInline>. */
  videoRef: React.RefObject<HTMLVideoElement>
  retry: () => void
}

export function useScanner({ enabled, deviceId, onQr }: ScannerOptions): ScannerState {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  // Keep the latest callback/flag without restarting the camera on every render.
  const enabledRef = useRef(enabled)
  const onQrRef = useRef(onQr)
  enabledRef.current = enabled
  onQrRef.current = onQr

  useEffect(() => {
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false
    let detector: Detector | null = null
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    let lastValue = ''
    let lastAt = 0

    const emit = (value: string) => {
      const now = performance.now()
      // The same QR sits in frame for many frames — debounce it.
      if (value === lastValue && now - lastAt < 2000) return
      lastValue = value
      lastAt = now
      onQrRef.current(value)
    }

    const tick = async () => {
      if (stopped) return
      const video = videoRef.current
      if (video && enabledRef.current && video.readyState >= 2 && video.videoWidth > 0) {
        try {
          if (detector) {
            const hits = await detector.detect(video)
            const hit = hits.find((h) => h.rawValue)
            if (hit) emit(hit.rawValue)
          } else if (ctx) {
            // Downscale: jsQR is plenty accurate at ~640px and much cheaper.
            const scale = Math.min(1, 640 / video.videoWidth)
            canvas.width = Math.round(video.videoWidth * scale)
            canvas.height = Math.round(video.videoHeight * scale)
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
            const found = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
            if (found?.data) emit(found.data)
          }
        } catch {
          /* a dropped frame is not worth surfacing */
        }
      }
      if (!stopped) raf = requestAnimationFrame(() => void tick())
    }

    const start = async () => {
      setStatus('starting')
      setError(null)
      try {
        detector = await makeDetector()
        stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play().catch(() => {})
        }
        setStatus('live')
        raf = requestAnimationFrame(() => void tick())
      } catch (e) {
        if (stopped) return
        const name = (e as DOMException)?.name
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setStatus('denied')
          setError('Camera access was blocked. Allow the camera for this site and reload.')
        } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
          setStatus('error')
          setError('No camera found. Pick a different camera in Settings.')
        } else {
          setStatus('error')
          setError(`Camera failed to start: ${(e as Error)?.message ?? String(e)}`)
        }
      }
    }

    void start()

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
      const video = videoRef.current
      if (video) video.srcObject = null
    }
  }, [deviceId, attempt])

  return { status, error, videoRef, retry: () => setAttempt((a) => a + 1) }
}

export interface CameraOption {
  deviceId: string
  label: string
}

/** Cameras for the Settings picker. Labels need a granted permission first. */
export async function listCameras(): Promise<CameraOption[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices
      .filter((d) => d.kind === 'videoinput')
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }))
  } catch {
    return []
  }
}
