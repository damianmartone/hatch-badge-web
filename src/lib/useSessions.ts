import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from './api'
import { ApiError } from './api'
import { SESSION_ANY, type AppSettings } from './settings'
import type { Badge, SessionInfo } from './types'
import { KIOSK_SEARCH_MIN } from './useKiosk'

export type SessStage = 'PICK_SESSION' | 'SCANNING' | 'PEOPLE_SEARCH'

export interface SessionState {
  stage: SessStage
  session: SessionInfo | null
  /** A scan is being processed (detection pauses briefly). */
  busy: boolean
  // last check-in result (banner)
  resultName: string
  resultSession: string
  resultSpeakers: string[]
  resultAlready: boolean
  resultError: string | null
  resultId: number
  // session picker
  pickQuery: string
  pickResults: SessionInfo[]
  pickLoading: boolean
  pickError: string | null
  // people name search
  peopleQuery: string
  peopleResults: Badge[]
  peopleSearching: boolean
  peopleError: string | null
  peopleDone: boolean
}

const INITIAL: SessionState = {
  stage: 'PICK_SESSION',
  session: null,
  busy: false,
  resultName: '',
  resultSession: '',
  resultSpeakers: [],
  resultAlready: false,
  resultError: null,
  resultId: 0,
  pickQuery: '',
  pickResults: [],
  pickLoading: false,
  pickError: null,
  peopleQuery: '',
  peopleResults: [],
  peopleSearching: false,
  peopleError: null,
  peopleDone: false,
}

/** Keep scanning enabled while confirmations show — just pause during the request. */
export const sessScanningEnabled = (s: SessionState) => s.stage === 'SCANNING' && !s.busy
export const sessHasResult = (s: SessionState) => Boolean(s.resultName) || s.resultError !== null

/**
 * SESSIONS mode: rapid, buttonless check-in loop. The camera stays live; each
 * scan updates a confirmation banner and immediately re-arms for the next person.
 */
export function useSessions(
  settings: AppSettings,
  patchSettings: (patch: Partial<AppSettings>) => void,
  active: boolean,
) {
  const [state, setState] = useState<SessionState>(INITIAL)
  const entered = useRef(false)
  const lastCode = useRef('')
  const lastAt = useRef(0)
  const stateRef = useRef(state)
  stateRef.current = state

  const runPicker = useCallback(
    async (query?: string) => {
      const q = (query ?? stateRef.current.pickQuery).trim()
      setState((s) => ({ ...s, pickLoading: true, pickError: null }))
      try {
        const list = await api.sessions(settings, q)
        setState((s) => ({ ...s, pickLoading: false, pickResults: list }))
      } catch (e) {
        const msg = e instanceof ApiError ? e.userMessage : 'Could not load sessions.'
        setState((s) => ({ ...s, pickLoading: false, pickResults: [], pickError: msg }))
      }
    },
    [settings],
  )

  const openPicker = useCallback(() => {
    setState((s) => ({ ...s, stage: 'PICK_SESSION', pickError: null }))
    void runPicker()
  }, [runPicker])

  /** Restore the saved session, enter token mode, or show the picker. */
  useEffect(() => {
    if (!active || entered.current) return
    entered.current = true
    const sid = settings.sessionId
    if (sid === SESSION_ANY) {
      setState({ ...INITIAL, stage: 'SCANNING', session: null })
    } else if (sid) {
      setState({
        ...INITIAL,
        stage: 'SCANNING',
        session: { id: sid, title: settings.sessionTitle, day: '', start_time: '', end_time: '', room: '' },
      })
    } else {
      openPicker()
    }
  }, [active, settings.sessionId, settings.sessionTitle, openPicker])

  const setPickQuery = useCallback((q: string) => setState((s) => ({ ...s, pickQuery: q })), [])

  /** Terminal accepts per-session QR tokens (no fixed session). */
  const useTokens = useCallback(() => {
    patchSettings({ sessionId: SESSION_ANY, sessionTitle: '' })
    setState({ ...INITIAL, stage: 'SCANNING', session: null })
  }, [patchSettings])

  const selectSession = useCallback(
    (session: SessionInfo) => {
      patchSettings({ sessionId: session.id, sessionTitle: session.title })
      setState({ ...INITIAL, stage: 'SCANNING', session })
    },
    [patchSettings],
  )

  const doCheckin = useCallback(
    async (sessionId: string, opts: { code?: string; ticketId?: string }) => {
      const id = stateRef.current.resultId + 1
      try {
        const r = await api.sessionCheckin(settings, sessionId, opts)
        setState((s) => ({
          ...s,
          stage: 'SCANNING',
          busy: false,
          resultName: r.name,
          resultSession: r.session_title,
          resultSpeakers: r.speakers ?? [],
          resultAlready: Boolean(r.already),
          resultError: null,
          resultId: id,
        }))
      } catch (e) {
        const msg = e instanceof ApiError ? e.userMessage : 'Check-in failed.'
        setState((s) => ({
          ...s,
          stage: 'SCANNING',
          busy: false,
          resultName: '',
          resultSession: '',
          resultSpeakers: [],
          resultError: msg,
          resultId: id,
        }))
      }
      // Auto-clear the banner after a few seconds (scanning stays live throughout).
      setTimeout(() => {
        setState((s) =>
          s.resultId === id
            ? { ...s, resultName: '', resultSession: '', resultSpeakers: [], resultError: null }
            : s,
        )
      }, 4500)
    },
    [settings],
  )

  /** A ticket/session QR was scanned — check in and immediately re-arm. */
  const scan = useCallback(
    (code: string) => {
      const cur = stateRef.current
      if (cur.stage !== 'SCANNING' || cur.busy) return
      const now = Date.now()
      // Ignore the same QR held in frame.
      if (code === lastCode.current && now - lastAt.current < 2500) return
      lastCode.current = code
      lastAt.current = now
      setState((s) => ({ ...s, busy: true }))
      void doCheckin(cur.session?.id ?? '', { code })
    },
    [doCheckin],
  )

  const openPeople = useCallback(() => {
    setState((s) => ({
      ...s,
      stage: 'PEOPLE_SEARCH',
      peopleQuery: '',
      peopleResults: [],
      peopleError: null,
      peopleDone: false,
    }))
  }, [])

  const setPeopleQuery = useCallback(
    (q: string) => setState((s) => ({ ...s, peopleQuery: q, peopleError: null })),
    [],
  )

  const runPeople = useCallback(async () => {
    const q = stateRef.current.peopleQuery.trim()
    if (q.length < KIOSK_SEARCH_MIN) return
    setState((s) => ({ ...s, peopleSearching: true, peopleError: null, peopleDone: false }))
    try {
      const results = await api.search(settings, q)
      setState((s) => ({ ...s, peopleSearching: false, peopleResults: results, peopleDone: true }))
    } catch (e) {
      const msg = e instanceof ApiError ? e.userMessage : 'Search failed.'
      setState((s) => ({ ...s, peopleSearching: false, peopleResults: [], peopleError: msg, peopleDone: true }))
    }
  }, [settings])

  // Live search as staff type.
  useEffect(() => {
    if (state.stage !== 'PEOPLE_SEARCH') return
    if (state.peopleQuery.trim().length < KIOSK_SEARCH_MIN) return
    const t = setTimeout(() => void runPeople(), 250)
    return () => clearTimeout(t)
  }, [state.stage, state.peopleQuery, runPeople])

  /** Name-search pick — only when a fixed session is selected. */
  const pickPerson = useCallback(
    (badge: Badge) => {
      const session = stateRef.current.session
      if (!session) return
      setState((s) => ({ ...s, stage: 'SCANNING', busy: true }))
      void doCheckin(session.id, { ticketId: badge.ticket_id })
    },
    [doCheckin],
  )

  /** Back to the live scanner, clearing the banner. */
  const reset = useCallback(() => {
    setState((s) => ({
      ...s,
      stage: 'SCANNING',
      busy: false,
      resultName: '',
      resultSession: '',
      resultSpeakers: [],
      resultError: null,
    }))
  }, [])

  return {
    state,
    openPicker,
    setPickQuery,
    runPicker,
    useTokens,
    selectSession,
    changeSession: openPicker,
    scan,
    openPeople,
    setPeopleQuery,
    runPeople,
    pickPerson,
    reset,
  }
}
