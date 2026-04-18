import { matchPath } from 'react-router-dom'

export const ROUTE_NEW_BOOKING = '/calendar/new/booking'
/** @deprecated Old URLs; redirected to {@link ROUTE_NEW_BOOKING} with query `panel` when applicable. */
export const ROUTE_NEW_PERSONAL = '/calendar/new/personal'
export const ROUTE_NEW_TODO = '/calendar/new/todo'
export const ROUTE_NEW_AVAILABILITY = '/calendar/new/availability'

export const ROUTE_EDIT_BOOKING = '/calendar/booking/:id'
export const ROUTE_EDIT_PERSONAL = '/calendar/personal/:id'
export const ROUTE_EDIT_TODO = '/calendar/todo/:id'

const LEGACY_NEW_SLOT_PATHS = [ROUTE_NEW_PERSONAL, ROUTE_NEW_TODO, ROUTE_NEW_AVAILABILITY] as const

const FORM_ROUTE_PATTERNS = [
  ROUTE_NEW_BOOKING,
  ...LEGACY_NEW_SLOT_PATHS,
  ROUTE_EDIT_BOOKING,
  ROUTE_EDIT_PERSONAL,
  ROUTE_EDIT_TODO,
] as const

export function isLegacyNewSlotPath(pathname: string): boolean {
  return LEGACY_NEW_SLOT_PATHS.some((p) => matchPath({ path: p, end: true }, pathname) != null)
}

export function isCalendarFormPath(pathname: string): boolean {
  return FORM_ROUTE_PATTERNS.some((p) => matchPath({ path: p, end: true }, pathname) != null)
}

export type CalendarFormRouteMatch =
  | { kind: 'new' }
  | { kind: 'edit'; form: 'booking' | 'personal' | 'todo'; id: number }

export function matchCalendarFormRoute(pathname: string): CalendarFormRouteMatch | null {
  if (matchPath({ path: ROUTE_NEW_BOOKING, end: true }, pathname)) return { kind: 'new' }
  const eb = matchPath({ path: ROUTE_EDIT_BOOKING, end: true }, pathname)
  if (eb?.params.id) {
    const id = Number(eb.params.id)
    if (Number.isFinite(id)) return { kind: 'edit', form: 'booking', id }
  }
  const ep = matchPath({ path: ROUTE_EDIT_PERSONAL, end: true }, pathname)
  if (ep?.params.id) {
    const id = Number(ep.params.id)
    if (Number.isFinite(id)) return { kind: 'edit', form: 'personal', id }
  }
  const et = matchPath({ path: ROUTE_EDIT_TODO, end: true }, pathname)
  if (et?.params.id) {
    const id = Number(et.params.id)
    if (Number.isFinite(id)) return { kind: 'edit', form: 'todo', id }
  }
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
  if (q.clientId != null && Number.isFinite(Number(q.clientId))) {
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
    if (Number.isFinite(n)) out.clientId = n
  }
  if (resourceId) out.resourceId = resourceId
  if (outsideBookable) out.outsideBookable = true
  return out
}

export type AvailabilityFormQuery = {
  start: string
  end: string
  consultantId: number | null
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
  const consultantId =
    consultantRaw != null && consultantRaw !== '' && Number.isFinite(Number(consultantRaw))
      ? Number(consultantRaw)
      : null
  const slotId =
    slotRaw != null && slotRaw !== '' && Number.isFinite(Number(slotRaw)) ? Number(slotRaw) : null
  return {
    start,
    end,
    consultantId,
    slotId,
    indefinite: sp.get('indefinite') === '1',
    rangeStartDate: sp.get('rangeStart') || start.slice(0, 10),
    rangeEndDate: sp.get('rangeEnd') || end.slice(0, 10),
    fromWorkingHours: sp.get('fromWh') === '1',
  }
}

/** All compact “new slot” flows share one path; tabs are in-app only. */
export function pathForNewForm(_form?: 'booking' | 'personal' | 'todo' | 'availability'): string {
  return ROUTE_NEW_BOOKING
}
