/** Web: normal + resource (Spaces, ALL) time-grid view types. */
export function isWebTimeGridLikeView(v: string) {
  return (
    v === 'timeGridWeek' ||
    v === 'timeGridDay' ||
    v === 'timeGridThreeDay' ||
    v === 'resourceTimeGridWeek' ||
    v === 'resourceTimeGridDay' ||
    v === 'resourceTimeGridThreeDay'
  )
}

/** Web/mobile shell: month grid views (bookings + resource month). */
export function isCalendarMonthGridView(v: string) {
  return v === 'dayGridMonth' || v === 'resourceDayGridMonth'
}

/** Compact month label beside hamburger: week/day/3-day and month views. */
export function isCalendarViewWithToolbarMonthChip(v: string) {
  return isWebTimeGridLikeView(v) || isCalendarMonthGridView(v)
}

export function toIsoDateKey(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Resource week/three-day: keep holiday pill min-content small; full name stays in title. */
export function truncateCalendarHolidayPillText(name: string, maxChars: number) {
  const t = name.trim()
  if (t.length <= maxChars) return t
  return `${t.slice(0, Math.max(0, maxChars - 1))}\u2026`
}

/** Noun form after a numeric count for "termin" (e.g. "2 termina", "4 termini"). */
export function slovenianTerminCountForm(count: number): string {
  const n = Math.abs(count) % 100
  if (n >= 11 && n <= 14) return 'terminov'
  const last = n % 10
  if (last === 1) return 'termin'
  if (last >= 2 && last <= 4) return count >= 3 ? 'termini' : 'termina'
  return 'terminov'
}

export function newClientInitials(firstName: string, lastName: string) {
  const letters = [firstName, lastName]
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2)
  return letters || 'N'
}
