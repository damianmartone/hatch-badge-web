import { checkedInAtDisplay, displayName, type Badge } from '../lib/types'
import { CheckIcon } from './Icons'

export function ResultRow({
  badge,
  onClick,
  selected,
  showTime,
}: {
  badge: Badge
  onClick: () => void
  selected?: boolean
  showTime?: boolean
}) {
  const sub = [badge.company, badge.ticket_type_label].filter(Boolean).join(' · ')
  const at = showTime ? checkedInAtDisplay(badge) : null
  return (
    <button type="button" className="result-row" aria-selected={Boolean(selected)} onClick={onClick}>
      <span className="grow stack tight">
        <span style={{ fontSize: 18, fontWeight: 600 }}>{displayName(badge) || '(no name)'}</span>
        {sub && <span className="small muted">{sub}</span>}
      </span>
      {badge.checked_in && (
        <span className="pill ok">
          <CheckIcon size={14} />
          {at ?? 'Checked in'}
        </span>
      )}
    </button>
  )
}
