import { useEffect, useRef } from 'react'
import { renderBadge } from '../lib/badgeRenderer'
import { ensureGeist } from '../lib/fonts'
import { aspect, type Label } from '../lib/label'
import { displayName, type Badge } from '../lib/types'

/**
 * WYSIWYG preview: the exact canvas that gets converted to ZPL, drawn at the
 * label's dot resolution and scaled down by CSS.
 */
export function BadgePreview({ badge, label }: { badge: Badge; label: Label }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let cancelled = false
    void ensureGeist().then(() => {
      if (!cancelled && ref.current) renderBadge(ref.current, badge, label)
    })
    return () => {
      cancelled = true
    }
  }, [badge, label])

  return (
    <canvas
      ref={ref}
      className="badge-preview"
      style={{ aspectRatio: String(aspect(label)) }}
      role="img"
      aria-label={`Badge preview for ${displayName(badge) || 'attendee'}`}
    />
  )
}
