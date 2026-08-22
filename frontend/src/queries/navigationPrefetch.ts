import { getSelectedLocationId } from '../lib/locationContext'
import { toIsoDateKey } from '../pages/calendar/calendarUtils'
import {
  billingServicesQueryOptions,
  customFieldsQueryOptions,
  locationsQueryOptions,
  paymentMethodsQueryOptions,
  settingsQueryOptions,
  usersQueryOptions,
} from './sharedQueryOptions'
import {
  calendarRangeQueryOptions,
  calendarSpacesQueryOptions,
  calendarTypesQueryOptions,
  consultantsQueryOptions,
  holidaysQueryOptions,
  serviceGroupsQueryOptions,
  waitlistOverviewQueryOptions,
} from './calendarQueryOptions'
import {
  billingSummaryQueryOptions,
  openBillsQueryOptions,
} from './billingQueryOptions'
import {
  analyticsOverviewQueryOptions,
  consumablesCategoriesQueryOptions,
  consumablesItemsQueryOptions,
  consumablesMovementsQueryOptions,
  consumablesOverviewQueryOptions,
  employeeRolesQueryOptions,
  inboxCapabilitiesQueryOptions,
  staffQuotaQueryOptions,
} from './remainingQueryOptions'
import { clientListQueryOptions } from './clientsQueryOptions'
import { queryClient } from './queryClient'
import { navigationRouteFamily } from './navigationRouteFamily'

type ScopeId = number | null | undefined

type NavigationPrefetchPriority = 'intent' | 'commit'

type NavigationPrefetchUser = {
  id?: number | null
  role?: string | null
  companyId?: number | null
  tenantCode?: string | null
}

export type NavigationPrefetchContext = {
  unitId: ScopeId
  user?: NavigationPrefetchUser | null
  priority?: NavigationPrefetchPriority
}

type NetworkInformationLike = {
  saveData?: boolean
  effectiveType?: string
}

type NavigatorWithConnection = Navigator & {
  connection?: NetworkInformationLike
  mozConnection?: NetworkInformationLike
  webkitConnection?: NetworkInformationLike
}

const CALENDAR_NAVIGATION_STORAGE_VERSION = 1
const DATA_PREFETCH_COOLDOWN_MS = 750
const lastRoutePrefetchAt = new Map<string, number>()

export function canSpeculativelyPrefetchNavigationData(priority: NavigationPrefetchPriority = 'intent'): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  if (navigator.onLine === false) return false
  if (priority === 'commit') return true
  if (document.visibilityState !== 'visible') return false

  const nav = navigator as NavigatorWithConnection
  const connection = nav.connection ?? nav.mozConnection ?? nav.webkitConnection
  if (!connection) return true
  if (connection.saveData === true) return false
  const effectiveType = String(connection.effectiveType || '').toLowerCase()
  return effectiveType !== 'slow-2g' && effectiveType !== '2g'
}

function calendarNavigationStorageKey(user: NavigationPrefetchUser): string | null {
  if (user.id == null) return null
  const tenantScope = String(user.tenantCode || user.companyId || 'default')
  return `calendra:calendar-navigation:v${CALENDAR_NAVIGATION_STORAGE_VERSION}:${tenantScope}:${user.id}`
}

function parseLocalDate(value: string | undefined): Date {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day, 12, 0, 0, 0)
  }
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0)
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function startOfMondayWeek(date: Date): Date {
  const next = new Date(date)
  const day = next.getDay()
  const offset = day === 0 ? -6 : 1 - day
  next.setDate(next.getDate() + offset)
  return next
}

function readCalendarNavigationIntent(user: NavigationPrefetchUser | null | undefined): { view: string; anchorDate?: string } {
  const fallback = { view: 'timeGridWeek' }
  if (!user || typeof window === 'undefined') return fallback
  const key = calendarNavigationStorageKey(user)
  if (!key) return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as { version?: number; view?: string; anchorDate?: string }
    if (parsed.version !== CALENDAR_NAVIGATION_STORAGE_VERSION || typeof parsed.view !== 'string') return fallback
    return {
      view: parsed.view,
      ...(typeof parsed.anchorDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.anchorDate)
        ? { anchorDate: parsed.anchorDate }
        : {}),
    }
  } catch {
    return fallback
  }
}

function calendarPrefetchRanges(user: NavigationPrefetchUser | null | undefined) {
  const { view, anchorDate } = readCalendarNavigationIntent(user)
  const anchor = parseLocalDate(anchorDate)
  let activeStart = new Date(anchor)
  let activeEnd = addDays(activeStart, 7)

  if (view === 'timeGridDay' || view === 'resourceTimeGridDay') {
    activeEnd = addDays(activeStart, 1)
  } else if (view === 'timeGridThreeDay' || view === 'resourceTimeGridThreeDay') {
    activeEnd = addDays(activeStart, 3)
  } else if (view === 'timeGridWorkWeek' || view === 'resourceTimeGridWorkWeek') {
    activeStart = startOfMondayWeek(anchor)
    activeEnd = addDays(activeStart, 5)
  } else if (view === 'dayGridMonth' || view === 'resourceDayGridMonth') {
    activeStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12, 0, 0, 0)
    activeEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1, 12, 0, 0, 0)
  } else {
    activeStart = startOfMondayWeek(anchor)
    activeEnd = addDays(activeStart, 7)
  }

  const fetchFrom = addDays(activeStart, -7)
  const fetchTo = addDays(activeEnd, 7)
  const holidayEnd = addDays(activeEnd, -1)
  return {
    fetchFrom: toIsoDateKey(fetchFrom),
    fetchTo: toIsoDateKey(fetchTo),
    holidayFrom: toIsoDateKey(activeStart),
    holidayTo: toIsoDateKey(holidayEnd),
  }
}

async function prefetchCalendar(unitId: ScopeId, user: NavigationPrefetchUser | null | undefined) {
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'
  const ranges = calendarPrefetchRanges(user)

  await Promise.allSettled([
    queryClient.prefetchQuery(settingsQueryOptions(unitId)),
    queryClient.prefetchQuery(locationsQueryOptions(unitId)),
    queryClient.prefetchQuery(calendarSpacesQueryOptions(unitId)),
    queryClient.prefetchQuery(calendarTypesQueryOptions(unitId)),
    ...(isAdmin ? [queryClient.prefetchQuery(usersQueryOptions(unitId))] : []),
    queryClient.prefetchQuery(calendarRangeQueryOptions(unitId, 'unit', ranges.fetchFrom, ranges.fetchTo)),
    queryClient.prefetchQuery(holidaysQueryOptions(ranges.holidayFrom, ranges.holidayTo)),
  ])
}

async function prefetchBilling(unitId: ScopeId) {
  const locationId = getSelectedLocationId(unitId)
  await Promise.allSettled([
    queryClient.prefetchQuery(settingsQueryOptions(unitId)),
    queryClient.prefetchQuery(billingSummaryQueryOptions(unitId, locationId)),
    queryClient.prefetchQuery(openBillsQueryOptions(unitId)),
    queryClient.prefetchQuery(billingServicesQueryOptions(unitId)),
    queryClient.prefetchQuery(paymentMethodsQueryOptions(unitId)),
  ])
}

async function prefetchAppointments(unitId: ScopeId, priority: NavigationPrefetchPriority) {
  const params = {
    view: 'ACTIVE',
    search: undefined,
    serviceId: undefined,
    employeeId: undefined,
    source: undefined,
    dateFrom: undefined,
    dateTo: undefined,
  }
  const signature = JSON.stringify(params)
  const tasks: Promise<unknown>[] = [
    queryClient.prefetchQuery(settingsQueryOptions(unitId)),
    queryClient.prefetchQuery(waitlistOverviewQueryOptions(unitId, signature, params)),
  ]
  if (priority === 'commit') {
    tasks.push(
      queryClient.prefetchQuery(calendarTypesQueryOptions(unitId)),
      queryClient.prefetchQuery(consultantsQueryOptions(unitId)),
    )
  }
  await Promise.allSettled(tasks)
}

async function prefetchClients(unitId: ScopeId, user: NavigationPrefetchUser | null | undefined, priority: NavigationPrefetchPriority) {
  const locationId = getSelectedLocationId(unitId)
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'
  const tasks: Promise<unknown>[] = [
    queryClient.prefetchQuery(clientListQueryOptions(unitId, locationId)),
    queryClient.prefetchQuery(settingsQueryOptions(unitId)),
  ]
  if (priority === 'commit') {
    tasks.push(
      queryClient.prefetchQuery(locationsQueryOptions(unitId)),
      queryClient.prefetchQuery(customFieldsQueryOptions(unitId)),
      queryClient.prefetchQuery(inboxCapabilitiesQueryOptions()),
      ...(isAdmin ? [queryClient.prefetchQuery(usersQueryOptions(unitId))] : []),
    )
  }
  await Promise.allSettled(tasks)
}

async function prefetchSessionTypes(unitId: ScopeId, priority: NavigationPrefetchPriority) {
  const tasks: Promise<unknown>[] = [
    queryClient.prefetchQuery(settingsQueryOptions(unitId)),
    queryClient.prefetchQuery(calendarTypesQueryOptions(unitId)),
    queryClient.prefetchQuery(serviceGroupsQueryOptions(unitId)),
    queryClient.prefetchQuery(billingServicesQueryOptions(unitId)),
  ]
  if (priority === 'commit') tasks.push(queryClient.prefetchQuery(locationsQueryOptions(unitId)))
  await Promise.allSettled(tasks)
}

async function prefetchConsultants(unitId: ScopeId, priority: NavigationPrefetchPriority) {
  const tasks: Promise<unknown>[] = [
    queryClient.prefetchQuery(usersQueryOptions(unitId)),
    queryClient.prefetchQuery(staffQuotaQueryOptions(unitId)),
    queryClient.prefetchQuery(employeeRolesQueryOptions(unitId)),
  ]
  if (priority === 'commit') tasks.push(queryClient.prefetchQuery(locationsQueryOptions(unitId)))
  await Promise.allSettled(tasks)
}

async function prefetchConsumables(unitId: ScopeId, priority: NavigationPrefetchPriority) {
  const locationId = getSelectedLocationId(unitId)
  const tasks: Promise<unknown>[] = [
    queryClient.prefetchQuery(locationsQueryOptions(unitId)),
    queryClient.prefetchQuery(consumablesOverviewQueryOptions(unitId, locationId)),
    queryClient.prefetchQuery(consumablesItemsQueryOptions(unitId, locationId)),
  ]
  if (priority === 'commit') {
    tasks.push(
      queryClient.prefetchQuery(consumablesCategoriesQueryOptions(unitId)),
      queryClient.prefetchQuery(consumablesMovementsQueryOptions(unitId, locationId)),
    )
  }
  await Promise.allSettled(tasks)
}

async function prefetchAnalytics(unitId: ScopeId, user: NavigationPrefetchUser | null | undefined, priority: NavigationPrefetchPriority) {
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'
  const tasks: Promise<unknown>[] = [
    queryClient.prefetchQuery(settingsQueryOptions(unitId)),
    queryClient.prefetchQuery(analyticsOverviewQueryOptions(unitId, { period: 'month' })),
  ]
  if (priority === 'commit') {
    tasks.push(
      queryClient.prefetchQuery(calendarSpacesQueryOptions(unitId)),
      queryClient.prefetchQuery(calendarTypesQueryOptions(unitId)),
      queryClient.prefetchQuery(serviceGroupsQueryOptions(unitId)),
      ...(isAdmin ? [queryClient.prefetchQuery(usersQueryOptions(unitId))] : []),
    )
  }
  await Promise.allSettled(tasks)
}

async function prefetchInbox(unitId: ScopeId) {
  await Promise.allSettled([
    queryClient.prefetchQuery(settingsQueryOptions(unitId)),
    queryClient.prefetchQuery(inboxCapabilitiesQueryOptions()),
  ])
}

async function prefetchConfiguration(unitId: ScopeId, priority: NavigationPrefetchPriority) {
  const tasks: Promise<unknown>[] = [
    queryClient.prefetchQuery(settingsQueryOptions(unitId)),
    queryClient.prefetchQuery(locationsQueryOptions(unitId)),
    queryClient.prefetchQuery(calendarSpacesQueryOptions(unitId)),
  ]
  if (priority === 'commit') {
    tasks.push(
      queryClient.prefetchQuery(usersQueryOptions(unitId)),
      queryClient.prefetchQuery(inboxCapabilitiesQueryOptions()),
    )
  }
  await Promise.allSettled(tasks)
}

/**
 * Warm exactly the data the destination is expected to request first. Query keys
 * are identical to the destination pages, so pointer-down prefetches are also
 * deduplicated when navigation starts before the request has completed.
 */
export async function prefetchNavigationData(pathname: string, context: NavigationPrefetchContext): Promise<void> {
  const family = navigationRouteFamily(pathname)
  if (!family) return

  const priority = context.priority ?? 'intent'
  if (!canSpeculativelyPrefetchNavigationData(priority)) return

  const scopeKey = `${family}:${context.unitId ?? 'none'}:${getSelectedLocationId(context.unitId) ?? 'all'}:${priority}`
  const now = Date.now()
  const last = lastRoutePrefetchAt.get(scopeKey) ?? 0
  if (now - last < DATA_PREFETCH_COOLDOWN_MS) return
  lastRoutePrefetchAt.set(scopeKey, now)

  if (family === 'calendar') return prefetchCalendar(context.unitId, context.user)
  if (family === 'billing') return prefetchBilling(context.unitId)
  if (family === 'appointments') return prefetchAppointments(context.unitId, priority)
  if (family === 'clients') return prefetchClients(context.unitId, context.user, priority)
  if (family === 'session-types') return prefetchSessionTypes(context.unitId, priority)
  if (family === 'consultants') return prefetchConsultants(context.unitId, priority)
  if (family === 'consumables') return prefetchConsumables(context.unitId, priority)
  if (family === 'analytics') return prefetchAnalytics(context.unitId, context.user, priority)
  if (family === 'inbox') return prefetchInbox(context.unitId)
  if (family === 'configuration') return prefetchConfiguration(context.unitId, priority)
}
