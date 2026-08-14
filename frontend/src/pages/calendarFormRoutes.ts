import { matchPath } from 'react-router-dom'

export const ROUTE_NEW_BOOKING = '/calendar/drawer/new-appointment'
export const ROUTE_NEW_PERSONAL = '/calendar/drawer/new-personal'
export const ROUTE_NEW_TODO = '/calendar/drawer/new-task'
export const ROUTE_NEW_AVAILABILITY = '/calendar/drawer/new-availability'

export const ROUTE_EDIT_BOOKING = '/calendar/drawer/appointment/:id'
export const ROUTE_EDIT_PERSONAL = '/calendar/drawer/personal/:id'
export const ROUTE_EDIT_TODO = '/calendar/drawer/task/:id'

/** Previous Calendra routes kept for backwards-compatible redirects / hydration. */
const LEGACY_NEW_BOOKING = '/calendar/new/booking'
const LEGACY_NEW_PERSONAL = '/calendar/new/personal'
const LEGACY_NEW_TODO = '/calendar/new/todo'
const LEGACY_NEW_AVAILABILITY = '/calendar/new/availability'
const LEGACY_EDIT_BOOKING = '/calendar/booking/:id'
const LEGACY_EDIT_PERSONAL = '/calendar/personal/:id'
const LEGACY_EDIT_TODO = '/calendar/todo/:id'

const LEGACY_NEW_SLOT_PATHS = [LEGACY_NEW_BOOKING, LEGACY_NEW_PERSONAL, LEGACY_NEW_TODO, LEGACY_NEW_AVAILABILITY] as const

const FORM_ROUTE_PATTERNS = [
  ROUTE_NEW_BOOKING,
  ROUTE_NEW_PERSONAL,
  ROUTE_NEW_TODO,
  ROUTE_NEW_AVAILABILITY,
  ROUTE_EDIT_BOOKING,
  ROUTE_EDIT_PERSONAL,
  ROUTE_EDIT_TODO,
  ...LEGACY_NEW_SLOT_PATHS,
  LEGACY_EDIT_BOOKING,
  LEGACY_EDIT_PERSONAL,
  LEGACY_EDIT_TODO,
] as const

export function isLegacyNewSlotPath(pathname: string): boolean {
  return LEGACY_NEW_SLOT_PATHS.some((p) => matchPath({ path: p, end: true }, pathname) != null)
}

export function isCalendarFormPath(pathname: string): boolean {
  return FORM_ROUTE_PATTERNS.some((p) => matchPath({ path: p, end: true }, pathname) != null)
}

export type CalendarFormRouteMatch =
  | { kind: 'new'; form: 'booking' | 'personal' | 'todo' | 'availability' }
  | { kind: 'edit'; form: 'booking' | 'personal' | 'todo'; id: number }

function routeId(pathname: string, pattern: string): number | null {
  const match = matchPath({ path: pattern, end: true }, pathname)
  if (!match?.params.id) return null
  const id = Number(match.params.id)
  return Number.isFinite(id) ? id : null
}

export function matchCalendarFormRoute(pathname: string): CalendarFormRouteMatch | null {
  if (matchPath({ path: ROUTE_NEW_BOOKING, end: true }, pathname) || matchPath({ path: LEGACY_NEW_BOOKING, end: true }, pathname)) {
    return { kind: 'new', form: 'booking' }
  }
  if (matchPath({ path: ROUTE_NEW_PERSONAL, end: true }, pathname) || matchPath({ path: LEGACY_NEW_PERSONAL, end: true }, pathname)) {
    return { kind: 'new', form: 'personal' }
  }
  if (matchPath({ path: ROUTE_NEW_TODO, end: true }, pathname) || matchPath({ path: LEGACY_NEW_TODO, end: true }, pathname)) {
    return { kind: 'new', form: 'todo' }
  }
  if (matchPath({ path: ROUTE_NEW_AVAILABILITY, end: true }, pathname) || matchPath({ path: LEGACY_NEW_AVAILABILITY, end: true }, pathname)) {
    return { kind: 'new', form: 'availability' }
  }

  const bookingId = routeId(pathname, ROUTE_EDIT_BOOKING) ?? routeId(pathname, LEGACY_EDIT_BOOKING)
  if (bookingId != null) return { kind: 'edit', form: 'booking', id: bookingId }
  const personalId = routeId(pathname, ROUTE_EDIT_PERSONAL) ?? routeId(pathname, LEGACY_EDIT_PERSONAL)
  if (personalId != null) return { kind: 'edit', form: 'personal', id: personalId }
  const todoId = routeId(pathname, ROUTE_EDIT_TODO) ?? routeId(pathname, LEGACY_EDIT_TODO)
  if (todoId != null) return { kind: 'edit', form: 'todo', id: todoId }
  return null
}

export type NewSlotQuery = {
  start: string
  end: string
  consultantId?: number | null
  spaceId?: number | null
  clientId?: number | null
  resourceId?: string | null
  outsideBookable?: boolean
}

export function buildNewSlotSearchParams(q: NewSlotQuery): string {
  const sp = new URLSearchParams()
  sp.set('start', q.start)
  sp.set('end', q.end)
  if (q.consultantId != null && Number.isFinite(Number(q.consultantId))) {
    sp.set('consultantId', String(q.consultantId))
  }
  if (q.spaceId !== undefined) {
    if (q.spaceId === null || !Number.isFinite(Number(q.spaceId))) {
      sp.set('spaceId', '')
    } else {
      sp.set('spaceId', String(q.spaceId))
    }
  }
  if (q.clientId != null && Number.isInteger(Number(q.clientId)) && Number(q.clientId) > 0) {
    sp.set('clientId', String(q.clientId))
  }
  if (q.resourceId != null && q.resourceId !== '') {
    sp.set('resourceId', String(q.resourceId))
  }
  if (q.outsideBookable) {
    sp.set('outsideBookable', '1')
  }
  return sp.toString()
}

export function parseNewSlotQuery(search: string): Partial<NewSlotQuery> & { start?: string; end?: string } {
  const sp = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const start = sp.get('start') || undefined
  const end = sp.get('end') || undefined
  const consultantRaw = sp.get('consultantId')
  const clientRaw = sp.get('clientId')
  const resourceId = sp.get('resourceId')
  const outsideBookable = sp.get('outsideBookable') === '1'
  const out: Partial<NewSlotQuery> & { start?: string; end?: string } = {}
  if (start) out.start = start
  if (end) out.end = end
  if (consultantRaw != null && consultantRaw !== '') {
    const n = Number(consultantRaw)
    if (Number.isFinite(n)) out.consultantId = n
  }
  if (sp.has('spaceId')) {
    const spaceRaw = sp.get('spaceId')
    if (spaceRaw === '') {
      out.spaceId = null
    } else if (spaceRaw != null && spaceRaw !== '') {
      const n = Number(spaceRaw)
      if (Number.isFinite(n)) out.spaceId = n
    }
  }
  if (clientRaw != null && clientRaw !== '') {
    const n = Number(clientRaw)
    if (Number.isInteger(n) && n > 0) out.clientId = n
  }
  if (resourceId) out.resourceId = resourceId
  if (outsideBookable) out.outsideBookable = true
  return out
}

export type AvailabilityFormQuery = {
  start: string
  end: string
  consultantId: number | null
  locationId: number | null
  slotId: number | null
  indefinite: boolean
  rangeStartDate: string
  rangeEndDate: string
  fromWorkingHours: boolean
}

export function buildAvailabilitySearchParams(a: AvailabilityFormQuery): string {
  const sp = new URLSearchParams()
  sp.set('start', a.start)
  sp.set('end', a.end)
  if (a.consultantId != null && Number.isFinite(a.consultantId)) {
    sp.set('consultantId', String(a.consultantId))
  }
  if (a.locationId != null && Number.isFinite(a.locationId)) {
    sp.set('locationId', String(a.locationId))
  }
  if (a.slotId != null && Number.isFinite(a.slotId)) {
    sp.set('slotId', String(a.slotId))
  }
  sp.set('indefinite', a.indefinite ? '1' : '0')
  sp.set('rangeStart', a.rangeStartDate)
  sp.set('rangeEnd', a.rangeEndDate)
  sp.set('fromWh', a.fromWorkingHours ? '1' : '0')
  return sp.toString()
}

/** Single new-form URL: booking slot fields + availability fields (fromWh distinguishes availability vs plain booking). */
export function mergeNewBookingAndAvailabilitySearch(slot: NewSlotQuery, availability: AvailabilityFormQuery): string {
  const u = new URLSearchParams(buildNewSlotSearchParams(slot))
  const av = new URLSearchParams(buildAvailabilitySearchParams(availability))
  av.forEach((value, key) => {
    u.set(key, value)
  })
  return u.toString()
}

export function parseAvailabilityQuery(search: string): AvailabilityFormQuery | null {
  const sp = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const start = sp.get('start')
  const end = sp.get('end')
  if (!start || !end) return null
  const consultantRaw = sp.get('consultantId')
  const slotRaw = sp.get('slotId')
  const locationRaw = sp.get('locationId')
  const consultantId =
    consultantRaw != null && consultantRaw !== '' && Number.isFinite(Number(consultantRaw))
      ? Number(consultantRaw)
      : null
  const locationId =
    locationRaw != null && locationRaw !== '' && Number.isFinite(Number(locationRaw)) ? Number(locationRaw) : null
  const slotId =
    slotRaw != null && slotRaw !== '' && Number.isFinite(Number(slotRaw)) ? Number(slotRaw) : null
  return {
    start,
    end,
    consultantId,
    locationId,
    slotId,
    indefinite: sp.get('indefinite') === '1',
    rangeStartDate: sp.get('rangeStart') || start.slice(0, 10),
    rangeEndDate: sp.get('rangeEnd') || end.slice(0, 10),
    fromWorkingHours: sp.get('fromWh') === '1',
  }
}

/** Each creation flow has its own Fresha-style drawer URL. */
export function pathForNewForm(form: 'booking' | 'personal' | 'todo' | 'availability' = 'booking'): string {
  if (form === 'personal') return ROUTE_NEW_PERSONAL
  if (form === 'todo') return ROUTE_NEW_TODO
  if (form === 'availability') return ROUTE_NEW_AVAILABILITY
  return ROUTE_NEW_BOOKING
}
