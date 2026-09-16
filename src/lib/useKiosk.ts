import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from './api'
import { ApiError } from './api'
import { printBadge } from './print'
import type { Label } from './label'
import type { AppSettings } from './settings'
import { isPrinterConfigured } from './settings'
import type { Badge } from './types'

export type KioskStage =
  | 'SCANNING' | 'LOADING' | 'REVIEW' | 'EDITING'
  | 'SAVING' | 'PRINTING' | 'CONFIRMED' | 'ERROR' | 'SEARCH'

export const KIOSK_SEARCH_MIN = 3

export interface KioskState {
  stage: KioskStage
  badge: Badge | null
  error: string | null
  searchQuery: string
  searching: boolean
  searchResults: Badge[]
  searchError: string | null
  searchDone: boolean
}

const INITIAL: KioskState = {
  stage: 'SCANNING',
  badge: null,
  error: null,
  searchQuery: '',
  searching: false,
  searchResults: [],
  searchError: null,
  searchDone: false,
}

/** Camera detection is only active while waiting for a scan. */
export const scanningEnabled = (s: KioskState) => s.stage === 'SCANNING' || s.stage === 'SEARCH'

/**
 * The self-service EVENT flow: scan (or search) → review → check in & print →
 * confirm → auto-reset for the next guest. Port of the Android MainViewModel.
 */
export function useKiosk(settings: AppSettings, label: Label, toast: (msg: string) => void) {
  const [state, setState] = useState<KioskState>(INITIAL)
  const printing = useRef(false)
  const stageRef = useRef<KioskStage>('SCANNING')
  stageRef.current = state.stage

  const reset = useCallback(() => setState(INITIAL), [])

  const scan = useCallback(
    async (code: string) => {
      if (stageRef.current !== 'SCANNING' && stageRef.current !== 'SEARCH') return
      stageRef.current = 'LOADING'
      setState({ ...INITIAL, stage: 'LOADING' })
      try {
        const badge = await api.lookup(settings, code)
        setState({ ...INITIAL, stage: 'REVIEW', badge })
      } catch (e) {
        const msg = e instanceof ApiError ? e.userMessage : 'Something went wrong.'
        setState({ ...INITIAL, stage: 'ERROR', error: msg })
      }
    },
    [settings],
  )

  // ---- Self-service name search (no ticket to scan) ----
  const openSearch = useCallback(() => setState({ ...INITIAL, stage: 'SEARCH' }), [])

  const setSearchQuery = useCallback((q: string) => {
    setState((s) => (s.stage === 'SEARCH' ? { ...s, searchQuery: q, searchError: null } : s))
  }, [])

  const runSearch = useCallback(async () => {
    const q = state.searchQuery.trim()
    if (q.length < KIOSK_SEARCH_MIN) {
      setState((s) => ({ ...s, searchError: `Type at least ${KIOSK_SEARCH_MIN} letters.` }))
      return
    }
    setState((s) => ({ ...s, searching: true, searchError: null, searchDone: false }))
    try {
      const results = await api.search(settings, q)
      setState((s) => (s.stage === 'SEARCH' ? { ...s, searching: false, searchResults: results, searchDone: true } : s))
    } catch (e) {
      const msg = e instanceof ApiError ? e.userMessage : 'Search failed.'
      setState((s) =>
        s.stage === 'SEARCH' ? { ...s, searching: false, searchResults: [], searchError: msg, searchDone: true } : s,
      )
    }
  }, [settings, state.searchQuery])

  // Live search as the attendee types, once there are enough letters.
  useEffect(() => {
    if (state.stage !== 'SEARCH') return
    if (state.searchQuery.trim().length < KIOSK_SEARCH_MIN) return
    const t = setTimeout(() => void runSearch(), 250)
    return () => clearTimeout(t)
    // runSearch changes with the query, which is exactly when we want to re-arm.
  }, [state.stage, state.searchQuery, runSearch])

  const pickResult = useCallback((badge: Badge) => setState({ ...INITIAL, stage: 'REVIEW', badge }), [])

  // ---- Self edit ----
  const editStart = useCallback(() => {
    setState((s) => (s.badge ? { ...s, stage: 'EDITING', error: null } : s))
  }, [])

  const editCancel = useCallback(() => {
    setState((s) => (s.badge ? { ...s, stage: 'REVIEW', error: null } : INITIAL))
  }, [])

  const saveEdits = useCallback(
    async (firstName: string, lastName: string, company: string, linkedin: string) => {
      const b = state.badge
      if (!b) return
      setState((s) => ({ ...s, stage: 'SAVING', error: null }))
      try {
        const updated = await api.update(settings, b.ticket_id, firstName, lastName, company, linkedin)
        setState({ ...INITIAL, stage: 'REVIEW', badge: updated })
      } catch (e) {
        const msg = e instanceof ApiError ? e.userMessage : 'Could not save.'
        setState((s) => ({ ...s, stage: 'EDITING', error: msg }))
      }
    },
    [settings, state.badge],
  )

  // ---- Check in + print ----
  const checkInAndPrint = useCallback(async () => {
    if (printing.current) return
    const b = state.badge
    if (!b) return
    if (!isPrinterConfigured(settings)) {
      toast('Printer not set up. Ask a staff member.')
      return
    }
    printing.current = true
    setState((s) => ({ ...s, stage: 'PRINTING' }))
    try {
      // Always (re)check-in so checked_in_at is refreshed — this path is only
      // reachable for a fresh ticket or an approved staff override.
      const updated = await api.checkin(settings, b.ticket_id)
      const result = await printBadge(updated, settings, label)
      toast(result.ok ? 'Checked in — badge printing' : `Checked in, but print failed: ${result.error}`)
      setState({ ...INITIAL, stage: 'CONFIRMED', badge: updated })
    } catch (e) {
      const msg = e instanceof ApiError ? e.userMessage : 'Check-in failed.'
      setState({ ...INITIAL, stage: 'REVIEW', badge: b })
      toast(msg)
    } finally {
      printing.current = false
    }
  }, [settings, label, state.badge, toast])

  // After printing, auto-reset for the next guest.
  useEffect(() => {
    if (state.stage !== 'CONFIRMED') return
    const t = setTimeout(reset, 6000)
    return () => clearTimeout(t)
  }, [state.stage, reset])

  return {
    state,
    scan,
    reset,
    openSearch,
    setSearchQuery,
    runSearch,
    pickResult,
    editStart,
    editCancel,
    saveEdits,
    checkInAndPrint,
  }
}
