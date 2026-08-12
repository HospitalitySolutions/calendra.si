import { useEffect, useState } from 'react'

/** `app-shell.css` — narrow shell / hamburger; calendar uses compact header toolbar row. */
const CALENDAR_MOBILE_HEADER_NAV_MAX_PX = 1024
/** `calendar-shell.css` — filters + bottom pill bar instead of header row. */
export const CALENDAR_FILTERS_BOTTOM_BAR_MAX_PX = 1024

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

export function useCalendarMobileHeaderNav() {
  return useMediaMaxWidth(CALENDAR_MOBILE_HEADER_NAV_MAX_PX)
}

export function useCalendarFiltersBottomBar() {
  return useMediaMaxWidth(CALENDAR_FILTERS_BOTTOM_BAR_MAX_PX)
}