/** Trash icon for session panel “Izbriši” (matches pill footer style). */
export function CalendarFormFooterDeleteIcon() {
  return (
    <svg className="calendar-form-footer-btn__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 6h18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M8 6V5a1 1 0 011-1h6a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M6 6l1 15h10l1-15" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

/** Rounded badge + check for session panel “Shrani” / primary footer actions. */
export function CalendarFormFooterSaveIcon() {
  return (
    <span className="calendar-form-footer-btn__save-mark" aria-hidden>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path
          d="M6 12.5l3 3 8-9"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

export type BookingTypeTabIconName = 'booking' | 'personal' | 'todo' | 'availability'

export function BookingTypeTabIcon({ name }: { name: BookingTypeTabIconName }) {
  if (name === 'booking') {
    return (
      <svg className="booking-type-btn-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3v4M16 3v4M4 9h16" />
        <path d="m9 14 2 2 4-5" />
      </svg>
    )
  }
  if (name === 'personal') {
    return (
      <svg className="booking-type-btn-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20 21a8 8 0 0 0-16 0" />
        <circle cx="12" cy="8" r="4" />
      </svg>
    )
  }
  if (name === 'todo') {
    return (
      <svg className="booking-type-btn-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="4" y="4" width="16" height="16" rx="3" />
        <path d="m8.5 12.5 2.25 2.25L15.5 9.5" />
      </svg>
    )
  }
  return (
    <svg className="booking-type-btn-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

export function CalendarScannerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 7V5a1 1 0 0 1 1-1h2" />
      <path d="M17 4h2a1 1 0 0 1 1 1v2" />
      <path d="M20 17v2a1 1 0 0 1-1 1h-2" />
      <path d="M7 20H5a1 1 0 0 1-1-1v-2" />
      <path d="M7 8h10" />
      <path d="M7 12h10" />
      <path d="M7 16h6" />
    </svg>
  )
}
