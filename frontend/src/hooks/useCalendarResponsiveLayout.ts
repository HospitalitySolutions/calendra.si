import { useEffect, useState } from 'react'

/** Match `calendar-toolbar.css` @media (max-width: 1749px) — title visually hidden; date nav fits better in left column. */
const CALENDAR_HEADER_COMPACT_MAX_PX = 1749
/** `CalendarWebShellHeader`: chevrons live in rail (see `calendar-responsive.css` ≤419px). */
const CALENDAR_DATE_NAV_RAIL_MAX_PX = 419
/** `app-shell.css` — narrow shell / hamburger; calendar uses compact header toolbar row. */
const CALENDAR_MOBILE_HEADER_NAV_MAX_PX = 780
/** `calendar-shell.css` — filters + bottom pill bar instead of header row. */
export const CALENDAR_FILTERS_BOTTOM_BAR_MAX_PX = 939
/** Resource time-grid columns: show consultant initials when width is tight. */
const CALENDAR_CONSULTANT_INITIALS_MAX_PX = 939

export function useMediaMaxWidth(maxPx: number): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(`(max-width: ${maxPx}px)`).matches : false,
  )

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxPx}px)`)
    const apply = () => setMatches(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [maxPx])

  return matches
}

export function useCalendarCompactHeader() {
  return useMediaMaxWidth(CALENDAR_HEADER_COMPACT_MAX_PX)
}

export function useCalendarDateNavArrowsInRail() {
  return useMediaMaxWidth(CALENDAR_DATE_NAV_RAIL_MAX_PX)
}

export function useCalendarMobileHeaderNav() {
  return useMediaMaxWidth(CALENDAR_MOBILE_HEADER_NAV_MAX_PX)
}

export function useCalendarFiltersBottomBar() {
  return useMediaMaxWidth(CALENDAR_FILTERS_BOTTOM_BAR_MAX_PX)
}

export function useCalendarConsultantResourceInitialsLayout() {
  return useMediaMaxWidth(CALENDAR_CONSULTANT_INITIALS_MAX_PX)
}
