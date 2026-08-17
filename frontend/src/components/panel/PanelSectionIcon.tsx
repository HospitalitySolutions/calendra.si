export type PanelSectionIconName =
  | 'clients'
  | 'service'
  | 'consumables'
  | 'schedule'
  | 'repeat'
  | 'notes'
  | 'location'
  | 'availability'
  | 'stock'
  | 'pricing'
  | 'supplier'
  | 'settings'
  | 'history'
  | 'contact'
  | 'offer'
  | 'group'
  | 'cards'
  | 'course'

/**
 * Leading icons for the collapsible cards in every panel. One set app-wide so a
 * section means the same thing on the calendar as it does on consumables.
 * Falls through to the notes glyph for an unknown name.
 */
export function PanelSectionIcon({ name }: { name: PanelSectionIconName }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  if (name === 'clients') {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </svg>
    )
  }
  if (name === 'service') {
    return (
      <svg {...common}>
        <rect x="3" y="7.5" width="18" height="12" rx="2.5" />
        <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
      </svg>
    )
  }
  if (name === 'consumables') {
    return (
      <svg {...common}>
        <path d="M12 3.5 20 7.5v9L12 20.5 4 16.5v-9Z" />
        <path d="M4 7.5l8 4 8-4M12 11.5v9" />
      </svg>
    )
  }
  if (name === 'schedule') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 1.8" />
      </svg>
    )
  }
  if (name === 'repeat') {
    return (
      <svg {...common}>
        <path d="M17.5 7H8.7A4.7 4.7 0 0 0 4 11.7V13" />
        <path d="m14.5 4 3 3-3 3" />
        <path d="M6.5 17h8.8a4.7 4.7 0 0 0 4.7-4.7V11" />
        <path d="m9.5 20-3-3 3-3" />
      </svg>
    )
  }
  if (name === 'location') {
    return (
      <svg {...common}>
        <path d="M12 21s6.5-5.4 6.5-10.2A6.5 6.5 0 0 0 5.5 10.8C5.5 15.6 12 21 12 21Z" />
        <circle cx="12" cy="10.5" r="2.4" />
      </svg>
    )
  }
  if (name === 'availability') {
    return (
      <svg {...common}>
        <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
        <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
      </svg>
    )
  }
  if (name === 'stock') {
    return (
      <svg {...common}>
        <path d="M3.5 8.5h17v11a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1Z" />
        <path d="M2.5 4.5h19v4h-19ZM9.5 13h5" />
      </svg>
    )
  }
  if (name === 'pricing') {
    return (
      <svg {...common}>
        <path d="M20.5 13.3 13.3 20.5a2 2 0 0 1-2.8 0l-7-7a2 2 0 0 1-.6-1.6l.5-6a1 1 0 0 1 .9-.9l6-.5a2 2 0 0 1 1.6.6l7 7a2 2 0 0 1 0 2.8Z" />
        <circle cx="8.4" cy="8.4" r="1.4" />
      </svg>
    )
  }
  if (name === 'supplier') {
    return (
      <svg {...common}>
        <path d="M2.5 15.5V7.5h10v8M12.5 10.5h4l3 3v2h-7Z" />
        <circle cx="6.5" cy="17.5" r="2" />
        <circle cx="16.5" cy="17.5" r="2" />
      </svg>
    )
  }
  if (name === 'settings') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3v2.5M12 18.5V21M4.5 12H3M21 12h-1.5M6.7 6.7 5.6 5.6M18.4 18.4l-1.1-1.1M17.3 6.7l1.1-1.1M5.6 18.4l1.1-1.1" />
      </svg>
    )
  }
  if (name === 'history') {
    return (
      <svg {...common}>
        <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4.5V10h5.5" />
        <path d="M12 8v4.2l3 1.8" />
      </svg>
    )
  }
  if (name === 'contact') {
    return (
      <svg {...common}>
        <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
        <path d="m3.5 7 8.5 6 8.5-6" />
      </svg>
    )
  }
  if (name === 'offer') {
    return (
      <svg {...common}>
        <path d="M12 3.5 14.6 9l6 .9-4.3 4.2 1 6-5.3-2.8-5.3 2.8 1-6L3.4 9.9 9.4 9Z" />
      </svg>
    )
  }
  if (name === 'group') {
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3" />
        <circle cx="16.5" cy="9" r="2.4" />
        <path d="M3.5 19.5a6 6 0 0 1 11 0M13.5 19.5a4.8 4.8 0 0 1 7 0" />
      </svg>
    )
  }
  if (name === 'cards') {
    return (
      <svg {...common}>
        <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
        <path d="M2.5 10h19M6.5 14.5h5" />
      </svg>
    )
  }
  if (name === 'course') {
    return (
      <svg {...common}>
        <path d="M4 6.5 12 4.5l8 2v11.5L12 16.5 4 18Z" />
        <path d="M12 4.5v12M16.5 8.5v8" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </svg>
  )
}
