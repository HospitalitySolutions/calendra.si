import type { AppLocale } from '../../locale'

export const REPEAT_WEEKDAY_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

export function formatRepeatWeekdayLabel(loc: AppLocale, englishDay: string): string {
  const idx = (REPEAT_WEEKDAY_EN as readonly string[]).indexOf(englishDay)
  if (idx < 0) return englishDay
  return new Date(2024, 0, 7 + idx).toLocaleDateString(loc === 'sl' ? 'sl-SI' : 'en-GB', { weekday: 'long' })
}

export function localTodayYmd() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

export function splitLocalDateTimeParts(value: string | undefined | null): { date: string; time: string } {
  if (value == null) return { date: '', time: '' }
  const v = String(value).trim()
  if (!v) return { date: '', time: '' }
  const withSeconds = v.length === 16 ? `${v}:00` : v
  const m = withSeconds.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/)
  if (!m) return { date: '', time: '' }
  return { date: m[1], time: m[2] }
}

function padLocalDateTimePart(n: number) {
  return String(n).padStart(2, '0')
}

/** Same rules as in-calendar normalizeToLocalDateTime (for all-day detection before component locals exist). */
export function normalizeLocalDateTimeInputForAllDay(value: string): string {
  if (!value) return value
  const v = String(value).trim()
  if (!v) return v
  if (v.endsWith('Z') || /[+-]\d\d:\d\d$/.test(v)) {
    const d = new Date(v)
    return `${d.getFullYear()}-${padLocalDateTimePart(d.getMonth() + 1)}-${padLocalDateTimePart(d.getDate())}T${padLocalDateTimePart(d.getHours())}:${padLocalDateTimePart(d.getMinutes())}:${padLocalDateTimePart(d.getSeconds())}`
  }
  return v.length === 16 ? `${v}:00` : v
}

/** Whole-day bookings: local midnight through 23:59:59, including multi-day date ranges. */
export function isLocalBookingAllDay(startVal: string | undefined, endVal: string | undefined): boolean {
  if (!startVal || !endVal) return false
  const ns = normalizeLocalDateTimeInputForAllDay(startVal)
  const ne = normalizeLocalDateTimeInputForAllDay(endVal)
  const sm = ns.match(/^(\d{4}-\d{2}-\d{2})T00:00:00/)
  const em = ne.match(/^(\d{4}-\d{2}-\d{2})T23:59:59/)
  if (!sm || !em) return false
  return em[1] >= sm[1]
}

/** Todo (single `startTime`): all-day when stored at local midnight on that calendar day. */
export function isLocalTodoAllDayStart(startVal: string | undefined): boolean {
  if (!startVal) return false
  const ns = normalizeLocalDateTimeInputForAllDay(startVal)
  return /^(\d{4}-\d{2}-\d{2})T00:00:00$/.test(ns)
}

/** Centers the field in the scrollport so Android WebView does not clip the native picker. */
export function scrollIntoViewForAndroidPicker(el: HTMLElement) {
  if (typeof document === 'undefined') return
  if (!document.documentElement.classList.contains('layout-android')) return
  window.requestAnimationFrame(() => {
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
  })
}
