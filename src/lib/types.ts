/** One attendee badge, as returned by the `badge-checkin` edge function. */
export interface Badge {
  ticket_id: string
  ticket_secret: string
  first_name: string
  last_name: string
  full_name: string
  company: string
  job_title: string
  linkedin_url: string
  ticket_type_label: string
  role: string
  status: string
  checked_in: boolean
  checked_in_at: string | null
  /** Special-role tag (SPEAKER/FACILITATOR/STAFF/SPONSOR), else day numbers. */
  role_tag: string | null
  days: number[]
}

export function displayName(b: Badge): string {
  return b.full_name?.trim() || [b.first_name, b.last_name].filter(Boolean).join(' ')
}

export function hasLinkedin(b: Badge): boolean {
  return Boolean(b.linkedin_url && b.linkedin_url.trim())
}

/** e.g. "Wed 6 Aug · 15:56" in the laptop's local time, or null. */
export function checkedInAtDisplay(b: Badge): string | null {
  if (!b.checked_in_at) return null
  const d = new Date(b.checked_in_at)
  if (Number.isNaN(d.getTime())) return null
  const date = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${date} · ${time}`
}

export interface SessionInfo {
  id: string
  title: string
  day: string
  start_time: string
  end_time: string
  room: string
}

export function sessionSubtitle(s: SessionInfo): string {
  const day = s.day ? new Date(`${s.day}T00:00:00`) : null
  const dayLabel =
    day && !Number.isNaN(day.getTime())
      ? day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
      : s.day
  const time = s.start_time ? s.start_time + (s.end_time ? `–${s.end_time}` : '') : ''
  return [dayLabel, time, s.room].filter(Boolean).join(' · ')
}

export interface SessionCheckinResult {
  name: string
  session_title: string
  speakers: string[]
  already: boolean
  error?: string
}

export const EMPTY_BADGE: Badge = {
  ticket_id: '', ticket_secret: '', first_name: '', last_name: '', full_name: '',
  company: '', job_title: '', linkedin_url: '', ticket_type_label: '', role: '',
  status: '', checked_in: false, checked_in_at: null, role_tag: null, days: [],
}

export function normalizeBadge(raw: Partial<Badge> | null | undefined): Badge {
  return { ...EMPTY_BADGE, ...(raw || {}), days: raw?.days ?? [] }
}
