import { useEffect, type ReactNode } from 'react'
import { BackIcon, CloseIcon } from './Icons'

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onDone, 5000)
    return () => clearTimeout(t)
  }, [message, onDone])

  if (!message) return null
  return (
    <div className="toast" role="status" aria-live="polite">
      {message}
    </div>
  )
}

export function Dialog({
  title,
  children,
  onClose,
  actions,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  actions?: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-label={title} onMouseDown={onClose}>
      <div className="dialog stack" onMouseDown={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 className="grow">{title}</h2>
          <button type="button" className="btn ghost" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        {children}
        {actions && <div className="row" style={{ justifyContent: 'flex-end' }}>{actions}</div>}
      </div>
    </div>
  )
}

export function AdminChrome({
  title,
  onBack,
  children,
}: {
  title: string
  onBack: () => void
  children: ReactNode
}) {
  return (
    <div className="admin">
      <div className="admin-bar">
        <button type="button" className="btn ghost" onClick={onBack}>
          <BackIcon />
          Back to kiosk
        </button>
        <h3>{title}</h3>
      </div>
      <div className="admin-body">{children}</div>
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="stack tight" style={{ alignItems: 'center' }}>
      <div className="spin" />
      {label && <p className="muted">{label}</p>}
    </div>
  )
}
