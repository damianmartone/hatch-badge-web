import { useEffect, useRef } from 'react'
import { KIOSK_SEARCH_MIN } from '../lib/useKiosk'
import { sessHasResult, type SessionState } from '../lib/useSessions'
import { sessionSubtitle, type Badge, type SessionInfo } from '../lib/types'
import { Spinner } from './Chrome'
import { CalendarIcon, CheckIcon, PersonIcon, ScanIcon, SearchIcon } from './Icons'
import { ResultRow } from './ResultRow'

interface Props {
  state: SessionState
  onPickQuery: (q: string) => void
  onPickRun: () => void
  onSelectSession: (s: SessionInfo) => void
  onUseTokens: () => void
  onChangeSession: () => void
  onOpenPeople: () => void
  onPeopleQuery: (q: string) => void
  onPickPerson: (b: Badge) => void
  onReset: () => void
}

/** The right half in SESSIONS mode: which session, and who just scanned in. */
export function SessionFlow(p: Props) {
  const { state } = p

  if (state.stage === 'PICK_SESSION') return <SessionPicker {...p} />
  if (state.stage === 'PEOPLE_SEARCH') return <PeopleSearch {...p} />

  const fixed = state.session
  return (
    <div className="flow-scroll stack">
      <div className="row">
        <span className="pill">
          <CalendarIcon size={14} />
          {fixed?.title ? 'Session' : 'Any session (QR token)'}
        </span>
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={p.onChangeSession}>
          Change session
        </button>
      </div>

      <div>
        <h1>{fixed?.title || 'Scan a session QR'}</h1>
        {fixed && sessionSubtitle(fixed) && <p className="muted">{sessionSubtitle(fixed)}</p>}
        {!fixed && <p className="muted">This terminal accepts per-session QR tokens.</p>}
      </div>

      <div className="flow-center" style={{ gap: 16 }}>
        {state.busy && <Spinner label="Checking in…" />}

        {!state.busy && !sessHasResult(state) && (
          <>
            <ScanIcon size={48} />
            <p className="muted" style={{ fontSize: 17 }}>
              Hold a ticket QR up to the camera. Check-in is instant — no buttons.
            </p>
          </>
        )}

        {!state.busy && state.resultError && (
          <p style={{ color: 'var(--danger)', fontSize: 19, maxWidth: '34ch' }}>{state.resultError}</p>
        )}

        {!state.busy && state.resultName && (
          <div className="stack tight" style={{ alignItems: 'center' }}>
            <span style={{ color: state.resultAlready ? 'var(--muted)' : 'var(--check-green)' }}>
              <CheckIcon size={56} />
            </span>
            <h1 style={{ color: state.resultAlready ? 'var(--muted)' : 'var(--check-green)' }}>
              {state.resultName}
            </h1>
            <p className="muted" style={{ fontSize: 17 }}>
              {state.resultAlready ? 'Already checked in' : 'Checked in'}
              {state.resultSession ? ` · ${state.resultSession}` : ''}
            </p>
            {state.resultSpeakers.length > 0 && (
              <p className="small faint">with {state.resultSpeakers.join(', ')}</p>
            )}
          </div>
        )}
      </div>

      <div className="row">
        {fixed && (
          <button type="button" className="btn grow" onClick={p.onOpenPeople}>
            <SearchIcon />
            Can’t scan? Search a name
          </button>
        )}
        {sessHasResult(state) && (
          <button type="button" className="btn ghost" onClick={p.onReset}>
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

function SessionPicker({ state, onPickQuery, onPickRun, onSelectSession, onUseTokens }: Props) {
  return (
    <div className="flow-scroll stack" style={{ overflow: 'hidden' }}>
      <div>
        <h2>Pick this terminal’s session</h2>
        <p className="muted">Everyone who scans here gets checked into it.</p>
      </div>

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          onPickRun()
        }}
      >
        <input
          className="grow"
          type="text"
          value={state.pickQuery}
          placeholder="Filter by title or room"
          autoComplete="off"
          onChange={(e) => onPickQuery(e.target.value)}
        />
        <button type="submit" className="btn primary">
          <SearchIcon />
          Find
        </button>
      </form>

      {state.pickLoading && <Spinner />}
      {state.pickError && <p style={{ color: 'var(--danger)' }}>{state.pickError}</p>}
      {!state.pickLoading && !state.pickError && state.pickResults.length === 0 && (
        <p className="muted">No sessions found.</p>
      )}

      <div className="result-list grow">
        {state.pickResults.map((s) => (
          <button key={s.id} type="button" className="result-row" onClick={() => onSelectSession(s)}>
            <span className="grow stack tight">
              <span style={{ fontSize: 17, fontWeight: 600 }}>{s.title}</span>
              {sessionSubtitle(s) && <span className="small muted">{sessionSubtitle(s)}</span>}
            </span>
          </button>
        ))}
      </div>

      <button type="button" className="btn block" onClick={onUseTokens}>
        <ScanIcon />
        No fixed session — accept per-session QR tokens
      </button>
    </div>
  )
}

function PeopleSearch({ state, onPeopleQuery, onPickPerson, onReset }: Props) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])

  const enough = state.peopleQuery.trim().length >= KIOSK_SEARCH_MIN

  return (
    <div className="flow-scroll stack" style={{ overflow: 'hidden' }}>
      <div className="row">
        <h2 className="grow">
          <PersonIcon /> Search a name
        </h2>
        <button type="button" className="btn ghost" onClick={onReset}>
          Cancel
        </button>
      </div>

      <input
        ref={ref}
        type="text"
        value={state.peopleQuery}
        placeholder="Type a name…"
        autoComplete="off"
        style={{ fontSize: 22, padding: '14px 16px' }}
        onChange={(e) => onPeopleQuery(e.target.value)}
      />

      <div className="result-list grow">
        {!enough && <p className="muted">Type at least {KIOSK_SEARCH_MIN} letters.</p>}
        {enough && state.peopleSearching && state.peopleResults.length === 0 && <Spinner />}
        {enough && state.peopleError && <p style={{ color: 'var(--danger)' }}>{state.peopleError}</p>}
        {enough && !state.peopleError && state.peopleDone && state.peopleResults.length === 0 && (
          <p className="muted">No matches.</p>
        )}
        {enough &&
          state.peopleResults.map((b) => (
            <ResultRow key={b.ticket_id} badge={b} onClick={() => onPickPerson(b)} />
          ))}
      </div>
    </div>
  )
}
