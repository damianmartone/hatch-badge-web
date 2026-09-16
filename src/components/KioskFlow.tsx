import { useEffect, useRef, useState } from 'react'
import { KIOSK_SEARCH_MIN, type KioskState } from '../lib/useKiosk'
import type { Label } from '../lib/label'
import { checkedInAtDisplay, type Badge } from '../lib/types'
import { BadgePreview } from './BadgePreview'
import { Dialog, Spinner } from './Chrome'
import { EditProfileForm } from './EditProfileForm'
import { ResultRow } from './ResultRow'
import { BackIcon, CheckIcon, EditIcon, LockIcon, PrintIcon, ScanIcon, SearchIcon } from './Icons'

interface Props {
  state: KioskState
  label: Label
  overridePin: string
  onCheckInAndPrint: () => void
  onEdit: () => void
  onSaveEdits: (first: string, last: string, company: string, linkedin: string) => void
  onEditCancel: () => void
  onReset: () => void
  onOpenSearch: () => void
  onSearchQuery: (q: string) => void
  onPickResult: (b: Badge) => void
}

/** The right half of the kiosk: welcome → review → print, edit, or name search. */
export function KioskFlow(p: Props) {
  const { state, label } = p

  switch (state.stage) {
    case 'SCANNING':
      return (
        <div className="flow-scroll">
          <div className="flow-center">
            <ScanIcon size={52} className="" />
            <h1>Welcome to Hatch</h1>
            <p className="muted" style={{ fontSize: 17, maxWidth: '36ch' }}>
              Hold your ticket QR up to the camera on the left to check in and print your badge.
            </p>
            <button type="button" className="btn big" style={{ marginTop: 10 }} onClick={p.onOpenSearch}>
              <SearchIcon />
              Can’t scan? Search your name
            </button>
          </div>
        </div>
      )

    case 'LOADING':
      return (
        <div className="flow-scroll">
          <div className="flow-center">
            <Spinner label="Finding your ticket…" />
          </div>
        </div>
      )

    case 'PRINTING':
      return (
        <div className="flow-scroll">
          <div className="flow-center">
            <Spinner label="Printing your badge…" />
          </div>
        </div>
      )

    case 'REVIEW':
      return state.badge ? (
        <ReviewPane
          badge={state.badge}
          label={label}
          overridePin={p.overridePin}
          onEdit={p.onEdit}
          onCheckInAndPrint={p.onCheckInAndPrint}
          onBack={p.onReset}
        />
      ) : null

    case 'EDITING':
    case 'SAVING':
      return state.badge ? (
        <div className="flow-scroll">
          <EditProfileForm
            badge={state.badge}
            saving={state.stage === 'SAVING'}
            error={state.error}
            onSave={p.onSaveEdits}
            onCancel={p.onEditCancel}
          />
        </div>
      ) : null

    case 'CONFIRMED':
      return (
        <div className="flow-scroll">
          <div className="flow-center">
            <span style={{ color: 'var(--check-green)' }}>
              <CheckIcon size={64} />
            </span>
            <h1>You’re checked in!</h1>
            <p className="muted" style={{ fontSize: 17 }}>
              Grab your badge from the printer. The next guest can scan now.
            </p>
            <button type="button" className="btn" onClick={p.onReset}>
              Done
            </button>
          </div>
        </div>
      )

    case 'ERROR':
      return (
        <div className="flow-scroll">
          <div className="flow-center">
            <p style={{ color: 'var(--danger)', fontSize: 18, maxWidth: '38ch' }}>
              {state.error ?? 'Something went wrong.'}
            </p>
            <button type="button" className="btn primary big block" onClick={p.onReset}>
              Try again
            </button>
            <button type="button" className="btn big block" onClick={p.onOpenSearch}>
              <SearchIcon />
              Search your name
            </button>
          </div>
        </div>
      )

    case 'SEARCH':
      return <SearchPane state={state} onQuery={p.onSearchQuery} onPick={p.onPickResult} onCancel={p.onReset} />
  }
}

// ---------------- Review + override ----------------

function ReviewPane({
  badge,
  label,
  overridePin,
  onEdit,
  onCheckInAndPrint,
  onBack,
}: {
  badge: Badge
  label: Label
  overridePin: string
  onEdit: () => void
  onCheckInAndPrint: () => void
  onBack: () => void
}) {
  const [granted, setGranted] = useState(false)
  const [showDialog, setShowDialog] = useState(badge.checked_in)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)

  // A different ticket means a fresh override decision.
  useEffect(() => {
    setGranted(false)
    setShowDialog(badge.checked_in)
    setPin('')
    setPinError(null)
  }, [badge.ticket_id, badge.checked_in])

  const locked = badge.checked_in && !granted
  const at = checkedInAtDisplay(badge)

  const confirm = () => {
    if (overridePin && pin === overridePin) {
      setGranted(true)
      setShowDialog(false)
    } else {
      setPinError('Incorrect code. Ask a staff member.')
    }
  }

  return (
    <div className="flow-scroll stack">
      <div className="row">
        <button type="button" className="btn ghost" onClick={onBack}>
          <BackIcon />
          Back
        </button>
      </div>

      <div style={{ display: 'grid', placeItems: 'center' }}>
        <BadgePreview badge={badge} label={label} />
      </div>

      {badge.checked_in && (
        <div className="stack tight" style={{ alignItems: 'center' }}>
          <span className="pill ok" style={{ fontSize: 14 }}>
            <CheckIcon size={16} />
            Already checked in{at ? ` · ${at}` : ''}
          </span>
          {granted && <p className="small muted">Staff override approved — you can re-print.</p>}
        </div>
      )}

      <div className="row">
        <button type="button" className="btn big grow" onClick={onEdit}>
          <EditIcon />
          Edit details
        </button>
        <button type="button" className="btn go big grow" onClick={onCheckInAndPrint} disabled={locked}>
          {badge.checked_in ? <PrintIcon /> : <CheckIcon />}
          {badge.checked_in ? 'Print badge' : 'Check in & Print'}
        </button>
      </div>

      {locked && (
        <button
          type="button"
          className="btn block"
          onClick={() => {
            setPinError(null)
            setShowDialog(true)
          }}
        >
          <LockIcon />
          Staff: enter code to re-print
        </button>
      )}

      {showDialog && (
        <Dialog
          title="Already checked in"
          onClose={() => {
            setShowDialog(false)
            onBack()
          }}
          actions={
            <>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setShowDialog(false)
                  onBack()
                }}
              >
                Back
              </button>
              <button type="button" className="btn primary" onClick={confirm}>
                Confirm
              </button>
            </>
          }
        >
          <p>This ticket was already checked in{at ? ` at ${at}` : ''}.</p>
          <p className="muted">
            To allow re-check in and badge print, ask a staff member to add the code.
          </p>
          <div className="field">
            <label htmlFor="override-pin">Staff code</label>
            <input
              id="override-pin"
              type="password"
              inputMode="numeric"
              autoFocus
              value={pin}
              aria-invalid={pinError ? 'true' : 'false'}
              style={{ fontSize: 26, fontWeight: 700, textAlign: 'center', letterSpacing: '0.3em' }}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                setPinError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirm()
              }}
            />
          </div>
          {pinError && <p style={{ color: 'var(--danger)' }}>{pinError}</p>}
        </Dialog>
      )}
    </div>
  )
}

// ---------------- Name search ----------------

function SearchPane({
  state,
  onQuery,
  onPick,
  onCancel,
}: {
  state: KioskState
  onQuery: (q: string) => void
  onPick: (b: Badge) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])

  const enough = state.searchQuery.trim().length >= KIOSK_SEARCH_MIN

  return (
    <div className="flow-scroll stack" style={{ overflow: 'hidden' }}>
      <div className="row">
        <h2 className="grow">Search your name</h2>
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <input
        ref={ref}
        type="text"
        value={state.searchQuery}
        placeholder="Type your name…"
        autoComplete="off"
        spellCheck={false}
        style={{ fontSize: 24, padding: '16px 18px' }}
        onChange={(e) => onQuery(e.target.value)}
      />
      <p className="small muted">You can also just hold your ticket QR up to the camera.</p>

      <div className="result-list grow">
        {!enough && <p className="muted">Type at least {KIOSK_SEARCH_MIN} letters to search.</p>}
        {enough && state.searching && state.searchResults.length === 0 && <Spinner />}
        {enough && state.searchError && <p style={{ color: 'var(--danger)' }}>{state.searchError}</p>}
        {enough && !state.searchError && state.searchDone && state.searchResults.length === 0 && (
          <p className="muted">No matches. Try fewer letters, or ask a staff member.</p>
        )}
        {enough &&
          state.searchResults.map((b) => <ResultRow key={b.ticket_id} badge={b} onClick={() => onPick(b)} />)}
      </div>
    </div>
  )
}
