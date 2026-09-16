import { useEffect, useRef, useState } from 'react'
import type { Badge } from '../lib/types'

const LINKEDIN_PREFIX = 'https://www.linkedin.com/in/'

interface Props {
  badge: Badge
  saving: boolean
  error: string | null
  onSave: (first: string, last: string, company: string, linkedin: string) => void
  onCancel: () => void
}

/** Self-edit form. On a laptop this uses the real keyboard — no on-screen one. */
export function EditProfileForm({ badge, saving, error, onSave, onCancel }: Props) {
  const [first, setFirst] = useState(badge.first_name)
  const [last, setLast] = useState(badge.last_name)
  const [company, setCompany] = useState(badge.company)
  const [linkedin, setLinkedin] = useState(badge.linkedin_url)
  const linkedinRef = useRef<HTMLInputElement>(null)
  const firstRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    firstRef.current?.focus()
  }, [])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    onSave(first.trim(), last.trim(), company.trim(), linkedin.trim())
  }

  const prefillLinkedin = () => {
    const base = linkedin.startsWith(LINKEDIN_PREFIX) ? linkedin : LINKEDIN_PREFIX
    setLinkedin(base)
    requestAnimationFrame(() => {
      const el = linkedinRef.current
      el?.focus()
      el?.setSelectionRange(base.length, base.length)
    })
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div>
        <h2>Edit your details</h2>
        <p className="muted">These go straight onto the printed badge.</p>
      </div>

      <div className="row">
        <div className="field grow">
          <label htmlFor="ef-first">First name</label>
          <input id="ef-first" ref={firstRef} type="text" value={first} disabled={saving}
            autoComplete="off" onChange={(e) => setFirst(e.target.value)} />
        </div>
        <div className="field grow">
          <label htmlFor="ef-last">Last name</label>
          <input id="ef-last" type="text" value={last} disabled={saving}
            autoComplete="off" onChange={(e) => setLast(e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="ef-company">Company</label>
        <input id="ef-company" type="text" value={company} disabled={saving}
          autoComplete="off" onChange={(e) => setCompany(e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="ef-linkedin">LinkedIn (URL or username)</label>
        <div className="row">
          <input id="ef-linkedin" ref={linkedinRef} className="grow" type="text" value={linkedin}
            disabled={saving} autoComplete="off" spellCheck={false}
            onChange={(e) => setLinkedin(e.target.value)} />
          <button type="button" className="btn" onClick={prefillLinkedin} disabled={saving}>
            linkedin.com/in/
          </button>
        </div>
        <p className="small faint">Leave empty and the badge prints without a QR code.</p>
      </div>

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      <div className="row">
        <button type="button" className="btn grow big" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn primary grow big" disabled={saving}>
          {saving ? 'Saving…' : 'Save details'}
        </button>
      </div>
    </form>
  )
}
