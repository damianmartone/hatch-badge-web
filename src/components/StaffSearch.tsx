import { useEffect, useRef, useState } from 'react'
import * as api from '../lib/api'
import { ApiError } from '../lib/api'
import { printBadge } from '../lib/print'
import type { Label } from '../lib/label'
import { isPrinterConfigured, type AppSettings } from '../lib/settings'
import { checkedInAtDisplay, displayName, type Badge } from '../lib/types'
import { BadgePreview } from './BadgePreview'
import { Spinner } from './Chrome'
import { CheckIcon, PrintIcon, SearchIcon } from './Icons'
import { ResultRow } from './ResultRow'

/**
 * Staff search + check-in. Laid out as list-beside-detail, which is the whole
 * point of the laptop build — staff can see the queue and the badge at once.
 */
export function StaffSearch({
  settings,
  label,
  toast,
}: {
  settings: AppSettings
  label: Label
  toast: (msg: string) => void
}) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<Badge[]>([])
  const [selected, setSelected] = useState<Badge | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const run = async () => {
    const q = query.trim()
    if (q.length < 2) {
      setError('Type at least 2 characters.')
      return
    }
    setLoading(true)
    setError(null)
    setSearched(true)
    try {
      setResults(await api.search(settings, q))
    } catch (e) {
      setResults([])
      setError(e instanceof ApiError ? e.userMessage : 'Search failed.')
    } finally {
      setLoading(false)
    }
  }

  const replace = (updated: Badge) => {
    setResults((rs) => rs.map((r) => (r.ticket_id === updated.ticket_id ? updated : r)))
    setSelected((s) => (s?.ticket_id === updated.ticket_id ? updated : s))
  }

  const checkInAndPrint = async (badge: Badge) => {
    if (busy) return
    if (!isPrinterConfigured(settings)) {
      toast('Set up the printer in Settings first.')
      return
    }
    setBusy(true)
    try {
      const updated = badge.checked_in ? badge : await api.checkin(settings, badge.ticket_id)
      replace(updated)
      const r = await printBadge(updated, settings, label)
      const prefix = badge.checked_in ? '' : 'Checked in — '
      toast(r.ok ? `${prefix}badge printing` : `${badge.checked_in ? '' : 'Checked in, but '}print failed: ${r.error}`)
    } catch (e) {
      toast(e instanceof ApiError ? e.userMessage : 'Check-in failed.')
    } finally {
      setBusy(false)
    }
  }

  const reprint = async (badge: Badge) => {
    if (busy) return
    if (!isPrinterConfigured(settings)) {
      toast('Set up the printer in Settings first.')
      return
    }
    setBusy(true)
    const r = await printBadge(badge, settings, label)
    setBusy(false)
    toast(r.ok ? 'Badge printing' : `Print failed: ${r.error}`)
  }

  const at = selected ? checkedInAtDisplay(selected) : null

  return (
    <div className="admin-grid" style={{ maxWidth: 1200 }}>
      <section className="card stack" style={{ minHeight: 420 }}>
        <h3>Find someone</h3>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault()
            void run()
          }}
        >
          <input
            ref={inputRef}
            className="grow"
            type="text"
            value={query}
            placeholder="Name, company or email"
            autoComplete="off"
            onChange={(e) => {
              setQuery(e.target.value)
              setError(null)
            }}
          />
          <button type="submit" className="btn primary">
            <SearchIcon />
            Search
          </button>
        </form>

        {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
        {loading && <Spinner />}
        {!loading && searched && !error && results.length === 0 && <p className="muted">No matches.</p>}

        <div className="result-list">
          {results.map((b) => (
            <ResultRow
              key={b.ticket_id}
              badge={b}
              showTime
              selected={selected?.ticket_id === b.ticket_id}
              onClick={() => setSelected(b)}
            />
          ))}
        </div>
      </section>

      <section className="card stack">
        <h3>Badge</h3>
        {!selected && <p className="muted">Pick someone from the list to see and print their badge.</p>}
        {selected && (
          <>
            <BadgePreview badge={selected} label={label} />
            <div className="stack tight">
              <strong style={{ fontSize: 18 }}>{displayName(selected) || '(no name)'}</strong>
              {selected.company && <span className="muted">{selected.company}</span>}
              {selected.ticket_type_label && <span className="small muted">{selected.ticket_type_label}</span>}
              {selected.checked_in && (
                <span className="pill ok" style={{ alignSelf: 'flex-start' }}>
                  <CheckIcon size={14} />
                  Checked in{at ? ` · ${at}` : ''}
                </span>
              )}
            </div>
            <div className="row">
              {selected.checked_in ? (
                <button type="button" className="btn grow big" disabled={busy} onClick={() => void reprint(selected)}>
                  <PrintIcon />
                  Reprint badge
                </button>
              ) : (
                <button
                  type="button"
                  className="btn go grow big"
                  disabled={busy}
                  onClick={() => void checkInAndPrint(selected)}
                >
                  <CheckIcon />
                  Check in &amp; Print
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
