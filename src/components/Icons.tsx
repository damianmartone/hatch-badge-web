/** Inline SVG icons — no icon dependency, and they inherit currentColor. */

interface Props {
  size?: number
  className?: string
}

const svg = (path: React.ReactNode, viewBox = '0 0 24 24') =>
  function Icon({ size = 20, className }: Props) {
    return (
      <svg
        width={size}
        height={size}
        viewBox={viewBox}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
        focusable="false"
      >
        {path}
      </svg>
    )
  }

export const ScanIcon = svg(
  <>
    <path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
    <rect x="7" y="7" width="4" height="4" />
    <rect x="13" y="13" width="4" height="4" />
    <path d="M13 7h4M7 13v4" />
  </>,
)

export const SearchIcon = svg(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>,
)

export const PersonIcon = svg(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </>,
)

export const EditIcon = svg(
  <>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </>,
)

export const PrintIcon = svg(
  <>
    <path d="M6 9V3h12v6" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="7" />
  </>,
)

export const CheckIcon = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.5 2.5 2.5 4.5-5" />
  </>,
)

export const LockIcon = svg(
  <>
    <rect x="4" y="10" width="16" height="11" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </>,
)

export const BackIcon = svg(
  <>
    <path d="M19 12H5" />
    <path d="m11 18-6-6 6-6" />
  </>,
)

export const GearIcon = svg(
  <>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 14.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.56-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1.5Z" />
  </>,
)

export const CloseIcon = svg(
  <>
    <path d="M18 6 6 18M6 6l12 12" />
  </>,
)

export const CalendarIcon = svg(
  <>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </>,
)

export const UsbIcon = svg(
  <>
    <circle cx="12" cy="20" r="1.6" />
    <path d="M12 18V6" />
    <path d="m9 9 3-5 3 5" />
    <path d="M12 13l4-2v-2" />
    <path d="M12 15l-4-2V9" />
  </>,
)

export const WifiIcon = svg(
  <>
    <path d="M2.5 9a15 15 0 0 1 19 0" />
    <path d="M6 12.5a10 10 0 0 1 12 0" />
    <path d="M9.5 16a5 5 0 0 1 5 0" />
    <circle cx="12" cy="19.5" r="1" />
  </>,
)

export const BluetoothIcon = svg(
  <>
    <path d="m7 7 10 10-5 4V3l5 4L7 17" />
  </>,
)
