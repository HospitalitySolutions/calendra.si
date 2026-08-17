import { matchPath } from 'react-router-dom'
import { CALENDAR_DRAWERS, buildDrawerUrl, drawerPath, matchDrawer } from '../lib/drawerRoutes'

/**
 * Calendar drawer URLs.
 *
 * Every appointment form is its own address, and the four "dodaj termin" tabs
 * (termin / opravilo / osebno / dostopnost) are four separate routes rather than
 * a `?panel=` flag, so each tab is deep-linkable.
 */

export const ROUTE_NEW_BOOKING = drawerPath(CALENDAR_DRAWERS.newAppointment)
export const ROUTE_NEW_PERSONAL = drawerPath(CALENDAR_DRAWERS.newPersonal)
export const ROUTE_NEW_TODO = drawerPath(CALENDAR_DRAWERS.newTodo)
export const ROUTE_NEW_AVAILABILITY = drawerPath(CALENDAR_DRAWERS.newAvailability)

export const ROUTE_EDIT_BOOKING = CALENDAR_DRAWERS.appointment.pattern
export const ROUTE_EDIT_PERSONAL = CALENDAR_DRAWERS.personal.pattern
export const ROUTE_EDIT_TODO = CALENDAR_DRAWERS.todo.pattern

export type CalendarNewForm = 'booking' | 'personal' | 'todo' | 'availability'

const NEW_FORM_DRAWER: Record<CalendarNewForm, typeof CALENDAR_DRAWERS.newAppointment> = {
  booking: CALENDAR_DRAWERS.newAppointment,
  personal: CALENDAR_DRAWERS.newPersonal,
  todo: CALENDAR_DRAWERS.newTodo,
  availability: CALENDAR_DRAWERS.newAvailability,
}

/** Path of the "new" drawer for a given tab. */
export function pathForNewForm(form: CalendarNewForm = 'booking'): string {
  return drawerPath(NEW_FORM_DRAWER[form])
}

/** Params only the availability tab understands; dropped when switching to another tab. */
const AVAILABILITY_ONLY_PARAMS = ['slotId', 'locationId', 'indefinite', 'rangeStart', 'rangeEnd', 'fromWh']

/** URL of a "new" tab carrying the given query string. */
export function urlForNewForm(form: CalendarNewForm, search: string | URLSearchParams): string {
  if (form === 'availability') return buildDrawerUrl(NEW_FORM_DRAWER[form], { search })
  const sp = new URLSearchParams(typeof search === 'string' ? search.replace(/^\?/, '') : search)
  for (const key of AVAILABILITY_ONLY_PARAMS) sp.delete(key)
  return buildDrawerUrl(NEW_FORM_DRAWER[form], { search: sp })
}

export function urlForEditForm(form: 'booking' | 'personal' | 'todo', id: number): string {
  const descriptor =
    form === 'booking'
      ? CALENDAR_DRAWERS.appointment
      : form === 'personal'
        ? CALENDAR_DRAWERS.personal
        : CALENDAR_DRAWERS.todo
  return drawerPath(descriptor, { id })
}

export type CalendarFormRouteMatch =
  | { kind: 'new'; form: CalendarNewForm }
  | { kind: 'edit'; form: 'booking' | 'personal' | 'todo'; id: number }

export function matchCalendarFormRoute(pathname: string): CalendarFormRouteMatch | null {
  const match = matchDrawer(pathname)
  if (!match) return null
  switch (match.descriptor.name) {
    case CALENDAR_DRAWERS.newAppointment.name:
      return { kind: 'new', form: 'booking' }
    case CALENDAR_DRAWERS.newPersonal.name:
      return { kind: 'new', form: 'personal' }
    case CALENDAR_DRAWERS.newTodo.name:
      return { kind: 'new', form: 'todo' }
    case CALENDAR_DRAWERS.newAvailability.name:
      return { kind: 'new', form: 'availability' }
    case CALENDAR_DRAWERS.appointment.name:
    case CALENDAR_DRAWERS.personal.name:
    case CALENDAR_DRAWERS.todo.name: {
      const id = Number(match.params.id)
      if (!Number.isFinite(id)) return null
      const form =
        match.descriptor.name === CALENDAR_DRAWERS.appointment.name
          ? 'booking'
          : match.descriptor.name === CALENDAR_DRAWERS.personal.name
            ? 'personal'
            : 'todo'
      return { kind: 'edit', form, id }
    }
    default:
      return null
  }
}

export function isCalendarFormPath(pathname: string): boolean {
  return matchCalendarFormRoute(pathname) != null
}

/* --------------------------------------------------------------------------
 * Legacy URLs
 * ----------------------------------------------------------------------- */

const LEGACY_PATTERNS = [
  { path: '/calendar/new/booking', form: 'booking' as const },
  { path: '/calendar/new/personal', form: 'personal' as const },
  { path: '/calendar/new/todo', form: 'todo' as const },
  { path: '/calendar/new/availability', form: 'availability' as const },
]

const LEGACY_EDIT_PATTERNS = [
  { path: '/calendar/booking/:id', form: 'booking' as const },
  { path: '/calendar/personal/:id', form: 'personal' as const },
  { path: '/calendar/todo/:id', form: 'todo' as const },
]

/**
 * Maps a pre-drawer calendar URL onto its replacement, or returns null when the
 * path is already current. Keeps bookmarked and shared links working.
 */
export function legacyCalendarFormRedirect(pathname: string, search: string): string | null {
  for (const legacy of LEGACY_PATTERNS) {
    if (!matchPath({ path: legacy.path, end: true }, pathname)) continue
    const sp = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
    // The old booking URL carried the tab as a query flag.
    const panel = sp.get('panel')
    sp.delete('panel')
    let form: CalendarNewForm = legacy.form
    if (legacy.form === 'booking') {
      if (sp.get('fromWh') != null) form = 'availability'
      else if (panel === 'personal') form = 'personal'
      else if (panel === 'todo') form = 'todo'
    }
    return urlForNewForm(form, sp)
  }

  for (const legacy of LEGACY_EDIT_PATTERNS) {
    const match = matchPath({ path: legacy.path, end: true }, pathname)
    if (!match?.params.id) continue
    const id = Number(match.params.id)
    if (!Number.isFinite(id)) continue
    const suffix = search && search !== '?' ? (search.startsWith('?') ? search : `?${search}`) : ''
    return `${urlForEditForm(legacy.form, id)}${suffix}`
  }

  return null
}

/* --------------------------------------------------------------------------
 * Query parameters
 * ----------------------------------------------------------------------- */

export type NewSlotQuery = {
  /** Local `YYYY-MM-DDTHH:mm`. */
  start: string
  end: string
  consultantId?: number | null
  spaceId?: number | null
  clientId?: number | null
  resourceId?: string | null
  outsideBookable?: boolean
}

function splitLocal(value: string): { date: string; time: string } {
  const [date = '', time = ''] = value.split('T')
  return { date, time: time.slice(0, 5) }
}

function joinLocal(date: string, time: string): string {
  return `${date}T${time.length === 5 ? time : `${time}`.slice(0, 5)}`
}

/**
 * Fresha-style readable slot params: `?date=2026-08-14&startTime=10:15&endTime=11:45`.
 * `endDate` is only emitted when the slot crosses midnight.
 */
export function buildNewSlotSearchParams(q: NewSlotQuery): string {
  const sp = new URLSearchParams()
  const start = splitLocal(q.start)
  const end = splitLocal(q.end)
  sp.set('date', start.date)
  sp.set('startTime', start.time)
  sp.set('endTime', end.time)
  if (end.date && end.date !== start.date) sp.set('endDate', end.date)
  if (q.consultantId != null && Number.isFinite(Number(q.consultantId))) {
    sp.set('employeeId', String(q.consultantId))
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

function readSlotBounds(sp: URLSearchParams): { start?: string; end?: string } {
  // Current form.
  const date = sp.get('date')
  const startTime = sp.get('startTime')
  const endTime = sp.get('endTime')
  if (date && startTime && endTime) {
    return {
      start: joinLocal(date, startTime),
      end: joinLocal(sp.get('endDate') || date, endTime),
    }
  }
  // Pre-drawer form: full local datetimes.
  const legacyStart = sp.get('start') || undefined
  const legacyEnd = sp.get('end') || undefined
  return { start: legacyStart, end: legacyEnd }
}

export function parseNewSlotQuery(search: string): Partial<NewSlotQuery> & { start?: string; end?: string } {
  const sp = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const { start, end } = readSlotBounds(sp)
  const consultantRaw = sp.get('employeeId') ?? sp.get('consultantId')
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
  const start = splitLocal(a.start)
  const end = splitLocal(a.end)
  sp.set('date', start.date)
  sp.set('startTime', start.time)
  sp.set('endTime', end.time)
  if (end.date && end.date !== start.date) sp.set('endDate', end.date)
  if (a.consultantId != null && Number.isFinite(a.consultantId)) {
    sp.set('employeeId', String(a.consultantId))
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

/** The availability drawer needs both the slot fields and the recurrence range. */
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
  const { start, end } = readSlotBounds(sp)
  if (!start || !end) return null
  const consultantRaw = sp.get('employeeId') ?? sp.get('consultantId')
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
