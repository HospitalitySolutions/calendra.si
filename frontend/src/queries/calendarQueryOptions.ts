import { api } from '../api'
import { queryKeys } from './queryKeys'

type ScopeId = number | null | undefined

type CalendarScope = 'unit' | 'workspace'

const MINUTE = 60_000

function unitHeaders(unitId: ScopeId) {
  return unitId == null ? undefined : { 'X-Calendra-Unit-Id': String(unitId) }
}

async function getList<T>(url: string, unitId: ScopeId, params?: Record<string, unknown>): Promise<T[]> {
  const response = await api.get<T[]>(url, { headers: unitHeaders(unitId), params })
  return Array.isArray(response.data) ? response.data : []
}

export function calendarRangeQueryOptions<T = unknown>(
  unitId: ScopeId,
  scope: CalendarScope,
  from: string,
  to: string,
) {
  return {
    queryKey: queryKeys.calendar.range(unitId, scope, from, to),
    queryFn: async (): Promise<T> => {
      const endpoint = scope === 'workspace' ? '/bookings/calendar/workspace' : '/bookings/calendar'
      const response = await api.get<T>(endpoint, {
        headers: unitHeaders(unitId),
        params: { from, to },
      })
      return response.data
    },
    // A just-visited date range can be shown immediately. Realtime events and
    // mutation paths explicitly invalidate/refresh it when schedule data changes.
    staleTime: 15_000,
    gcTime: 5 * MINUTE,
  }
}

export function calendarSpacesQueryOptions<T = unknown>(unitId: ScopeId) {
  return {
    queryKey: queryKeys.scheduling.spaces(unitId),
    queryFn: () => getList<T>('/spaces', unitId),
    staleTime: 3 * MINUTE,
  }
}

export function calendarTypesQueryOptions<T = unknown>(unitId: ScopeId) {
  return {
    queryKey: queryKeys.scheduling.types(unitId),
    queryFn: () => getList<T>('/types', unitId),
    staleTime: 3 * MINUTE,
  }
}

export function calendarGroupsQueryOptions<T = unknown>(unitId: ScopeId, locationId: ScopeId) {
  return {
    queryKey: queryKeys.groups.calendar(unitId, locationId),
    queryFn: () => getList<T>('/groups', unitId, { locationId: locationId ?? undefined }),
    staleTime: 60_000,
  }
}

export function consultantsQueryOptions<T = unknown>(unitId: ScopeId) {
  return {
    queryKey: queryKeys.scheduling.consultants(unitId),
    queryFn: () => getList<T>('/users/consultants', unitId),
    staleTime: 3 * MINUTE,
  }
}

export function serviceGroupsQueryOptions<T = unknown>(unitId: ScopeId) {
  return {
    queryKey: queryKeys.scheduling.serviceGroups(unitId),
    queryFn: () => getList<T>('/service-groups', unitId),
    staleTime: 3 * MINUTE,
  }
}

export function holidaysQueryOptions<T = unknown>(from: string, to: string) {
  return {
    queryKey: queryKeys.calendar.holidays(from, to),
    queryFn: async (): Promise<T[]> => {
      const response = await api.get<T[]>('/holidays', { params: { from, to } })
      return Array.isArray(response.data) ? response.data : []
    },
    // Holiday data for a fixed date range is effectively static during a workday.
    staleTime: 12 * 60 * MINUTE,
    gcTime: 24 * 60 * MINUTE,
  }
}

export function calendarIntegrationStatusQueryOptions<T = unknown>(
  unitId: ScopeId,
  provider: 'zoom' | 'google' | 'voice-booking',
) {
  const endpoint = provider === 'voice-booking'
    ? '/ai/voice-booking/status'
    : `/${provider}/status`
  return {
    queryKey: queryKeys.calendar.integrationStatus(unitId, provider),
    queryFn: async (): Promise<T> => {
      const response = await api.get<T>(endpoint, { headers: unitHeaders(unitId) })
      return response.data
    },
    staleTime: 60_000,
  }
}

export function waitlistOverviewQueryOptions<T = unknown>(
  unitId: ScopeId,
  signature: string,
  params: Record<string, unknown>,
) {
  return {
    queryKey: queryKeys.waitlist.overview(unitId, signature),
    queryFn: async (): Promise<T> => {
      const response = await api.get<T>('/waitlists/overview', {
        headers: unitHeaders(unitId),
        params,
      })
      return response.data
    },
    staleTime: 15_000,
  }
}

export function waitlistDetailQueryOptions<T = unknown>(unitId: ScopeId, requestId: number) {
  return {
    queryKey: queryKeys.waitlist.detail(unitId, requestId),
    queryFn: async (): Promise<T> => {
      const response = await api.get<T>(`/waitlists/${requestId}`, { headers: unitHeaders(unitId) })
      return response.data
    },
    staleTime: 15_000,
  }
}
