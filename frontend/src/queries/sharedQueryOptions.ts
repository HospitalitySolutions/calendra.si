import { api } from '../api'
import type { CustomFieldDefinition, Location } from '../lib/types'
import { queryKeys } from './queryKeys'

type ScopeId = number | null | undefined

type ModuleCapabilities = {
  waitlistEnabled?: boolean
  consumablesEnabled?: boolean
  [key: string]: unknown
}

const MINUTE = 60_000

function unitHeaders(unitId: ScopeId) {
  return unitId == null ? undefined : { 'X-Calendra-Unit-Id': String(unitId) }
}

async function getList<T>(url: string, unitId: ScopeId, params?: Record<string, unknown>): Promise<T[]> {
  const response = await api.get<T[]>(url, {
    headers: unitHeaders(unitId),
    params,
  })
  return Array.isArray(response.data) ? response.data : []
}

export function settingsQueryOptions(unitId: ScopeId) {
  return {
    queryKey: queryKeys.settings.byUnit(unitId),
    queryFn: async (): Promise<Record<string, string>> => {
      const response = await api.get<Record<string, string>>('/settings', { headers: unitHeaders(unitId) })
      return response.data ?? {}
    },
    staleTime: 5 * MINUTE,
  }
}

export function moduleCapabilitiesQueryOptions(unitId: ScopeId) {
  return {
    queryKey: queryKeys.settings.moduleCapabilities(unitId),
    queryFn: async (): Promise<ModuleCapabilities> => {
      const response = await api.get<ModuleCapabilities>('/settings/module-capabilities', { headers: unitHeaders(unitId) })
      return response.data ?? {}
    },
    staleTime: 5 * MINUTE,
  }
}

export function locationsQueryOptions(unitId: ScopeId) {
  return {
    queryKey: queryKeys.locations.byUnit(unitId),
    queryFn: () => getList<Location>('/locations', unitId),
    staleTime: 5 * MINUTE,
  }
}

export function usersQueryOptions<T = unknown>(unitId: ScopeId) {
  return {
    queryKey: queryKeys.users.byUnit(unitId),
    queryFn: () => getList<T>('/users', unitId),
    staleTime: 3 * MINUTE,
  }
}

export function customFieldsQueryOptions(unitId: ScopeId) {
  return {
    queryKey: queryKeys.customFields.byUnit(unitId),
    queryFn: () => getList<CustomFieldDefinition>('/custom-fields', unitId),
    staleTime: 5 * MINUTE,
  }
}

export function billingServicesQueryOptions<T = unknown>(unitId: ScopeId) {
  return {
    queryKey: queryKeys.billing.services(unitId),
    queryFn: () => getList<T>('/billing/services', unitId),
    staleTime: 2 * MINUTE,
  }
}

export function paymentMethodsQueryOptions<T = unknown>(unitId: ScopeId) {
  return {
    queryKey: queryKeys.billing.paymentMethods(unitId),
    queryFn: () => getList<T>('/billing/payment-methods', unitId),
    staleTime: 10 * MINUTE,
  }
}

export function invoiceIssuersQueryOptions<T = unknown>(unitId: ScopeId) {
  return {
    queryKey: queryKeys.billing.issuers(unitId),
    queryFn: () => getList<T>('/billing/issuers', unitId),
    staleTime: 5 * MINUTE,
  }
}

export function invoiceSeriesQueryOptions<T = unknown>(unitId: ScopeId) {
  return {
    queryKey: queryKeys.billing.invoiceSeries(unitId),
    queryFn: () => getList<T>('/billing/invoice-series', unitId),
    staleTime: 5 * MINUTE,
  }
}

export function clientOptionsQueryOptions<T = unknown>(unitId: ScopeId, locationId: ScopeId, size = 500) {
  return {
    queryKey: queryKeys.clients.options(unitId, locationId, size),
    queryFn: () => getList<T>('/clients/options', unitId, {
      size,
      locationId: locationId ?? undefined,
    }),
    staleTime: 30_000,
  }
}
