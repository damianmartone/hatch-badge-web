import { normalizeBadge, type Badge, type SessionCheckinResult, type SessionInfo } from './types'
import type { AppSettings } from './settings'

/** Thrown for any non-2xx response; [userMessage] is safe to show to staff. */
export class ApiError extends Error {
  constructor(public status: number, public code: string | null, public userMessage: string) {
    super(userMessage)
    this.name = 'ApiError'
  }
}

function messageFor(status: number, code: string | null): string {
  if (status === 401 || code === 'invalid_pin' || code === 'missing_pin')
    return 'Access PIN is wrong or missing. Fix it in Settings.'
  if (code === 'event_not_configured') return 'This event has no PIN configured on the server.'
  if (status === 404 || code === 'not_found') return 'Ticket not found.'
  if (code === 'query_too_short') return 'Type at least 2 characters to search.'
  if (code === 'bad_function_url') return 'The edge function URL in Settings is not valid.'
  if (status >= 500 && status < 600) return 'Server error. Try again.'
  return `Request failed (${code ?? status}).`
}

/**
 * Every call is a POST through the local companion server, which forwards it to
 * the `badge-checkin` edge function with the shared PIN in `x-staff-pin`.
 */
async function call(s: AppSettings, body: Record<string, unknown>): Promise<any> {
  let res: Response
  try {
    res = await fetch('/api/badge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, functionUrl: s.functionUrl, pin: s.staffPin }),
    })
  } catch {
    throw new ApiError(0, 'network', 'Network error. Check the connection and the function URL.')
  }

  const text = await res.text()
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* non-JSON error body */
  }
  if (res.ok) return json ?? {}

  const code = (json?.error as string | undefined) ?? null
  throw new ApiError(res.status, code, messageFor(res.status, code))
}

export async function lookup(s: AppSettings, code: string): Promise<Badge> {
  const r = await call(s, { action: 'lookup', code })
  if (!r?.badge) throw new ApiError(404, 'not_found', 'Ticket not found.')
  return normalizeBadge(r.badge)
}

export async function search(s: AppSettings, query: string): Promise<Badge[]> {
  const r = await call(s, { action: 'search', query })
  return (r?.results ?? []).map(normalizeBadge)
}

export async function checkin(s: AppSettings, ticketId: string): Promise<Badge> {
  const r = await call(s, { action: 'checkin', ticket_id: ticketId })
  if (!r?.badge) throw new ApiError(404, 'not_found', 'Ticket not found.')
  return normalizeBadge(r.badge)
}

export async function update(
  s: AppSettings,
  ticketId: string,
  firstName: string,
  lastName: string,
  company: string,
  linkedin: string,
): Promise<Badge> {
  const r = await call(s, {
    action: 'update',
    ticket_id: ticketId,
    first_name: firstName,
    last_name: lastName,
    company,
    linkedin_url: linkedin,
  })
  if (!r?.badge) throw new ApiError(404, 'not_found', 'Ticket not found.')
  return normalizeBadge(r.badge)
}

export async function sessions(s: AppSettings, query: string): Promise<SessionInfo[]> {
  const r = await call(s, { action: 'sessions', query })
  return r?.sessions ?? []
}

/** Check a person into a session (by scanned [code] or picked [ticketId]). */
export async function sessionCheckin(
  s: AppSettings,
  sessionId: string,
  opts: { code?: string; ticketId?: string },
): Promise<SessionCheckinResult> {
  const body: Record<string, unknown> = { action: 'session_checkin', session_id: sessionId }
  if (opts.ticketId) body.ticket_id = opts.ticketId
  if (opts.code) body.code = opts.code
  const r = await call(s, body)
  return { name: '', session_title: '', speakers: [], already: false, ...(r ?? {}) }
}
