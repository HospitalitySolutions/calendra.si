import { useEffect, useState } from 'react'

/** Shell: below 1750px date nav moves left; from 940px up labeled Consultant/Space in header; under 940px icons + mic in bottom strip. */
const CALENDAR_COMPACT_HEADER_MAX_PX = 1749
/** ≤939px: Consultant/Space as icon popups in bottom strip; mic centered (labeled selects stay in header above 940px). */
export const CALENDAR_FILTERS_BOTTOM_BAR_MAX_PX = 939
/** Prev/next move from header to the right rail (narrow phones). */
const CALENDAR_DATE_NAV_RAIL_MAX_PX = 419
/** ≤780px: keep arrows + view selector grouped on the right side in the header. */
const CALENDAR_MOBILE_HEADER_NAV_MAX_PX = 780
/** ≤1100px: bookings “all consultants” resource columns show initials instead of full names. */
const CALENDAR_CONSULTANT_RESOURCE_INITIALS_MAX_PX = 1100

export function useCalendarCompactHeader() {
  const [compact, setCompact] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia(`(max-width: ${CALENDAR_COMPACT_HEADER_MAX_PX}px)`).matches
      : false,
  )
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${CALENDAR_COMPACT_HEADER_MAX_PX}px)`)
    const apply = () => setCompact(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  return compact
}

export function useCalendarFiltersBottomBar() {
  const [bottom, setBottom] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia(`(max-width: ${CALENDAR_FILTERS_BOTTOM_BAR_MAX_PX}px)`).matches
      : false,
  )
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${CALENDAR_FILTERS_BOTTOM_BAR_MAX_PX}px)`)
    const apply = () => setBottom(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  return bottom
}

export function useCalendarDateNavArrowsInRail() {
  const [v, setV] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia(`(max-width: ${CALENDAR_DATE_NAV_RAIL_MAX_PX}px)`).matches
      : false,
  )
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${CALENDAR_DATE_NAV_RAIL_MAX_PX}px)`)
    const apply = () => setV(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  return v
}

export function useCalendarMobileHeaderNav() {
  const [v, setV] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia(
          `(max-width: ${CALENDAR_MOBILE_HEADER_NAV_MAX_PX}px)`,
        ).matches
      : false,
  )
  useEffect(() => {
    const mq = window.matchMedia(
      `(max-width: ${CALENDAR_MOBILE_HEADER_NAV_MAX_PX}px)`,
    )
    const apply = () => setV(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  return v
}

export function useCalendarConsultantResourceInitialsLayout() {
  const [compact, setCompact] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia(`(max-width: ${CALENDAR_CONSULTANT_RESOURCE_INITIALS_MAX_PX}px)`).matches
      : false,
  )
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${CALENDAR_CONSULTANT_RESOURCE_INITIALS_MAX_PX}px)`)
    const apply = () => setCompact(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  return compact
}
