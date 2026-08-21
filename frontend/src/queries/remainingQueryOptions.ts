import { api } from '../api'
import { queryKeys } from './queryKeys'

type ScopeId = number | null | undefined

type SortDirection = 'asc' | 'desc'

const MINUTE = 60_000

function unitHeaders(unitId: ScopeId) {
  return unitId == null ? undefined : { 'X-Calendra-Unit-Id': String(unitId) }
}

async function getList<T>(url: string, unitId: ScopeId, params?: Record<string, unknown>): Promise<T[]> {
  const response = await api.get<T[]>(url, { headers: unitHeaders(unitId), params })
  return Array.isArray(response.data) ? response.data : []
}

export function staffQuotaQueryOptions<T = unknown>(unitId: ScopeId) {
  return {
    queryKey: queryKeys.staff.quota(unitId),
    queryFn: async (): Promise<T | null> => {
      const response = await api.get<T>('/users/quota', { headers: unitHeaders(unitId) })
      return response.data ?? null
    },
    staleTime: 60_000,
  }
}

export function employeeRolesQueryOptions<T = unknown>(unitId: ScopeId) {
  return {
    queryKey: queryKeys.staff.roles(unitId),
    queryFn: async (): Promise<T> => {
      const response = await api.get<T>('/employee-roles', { headers: unitHeaders(unitId) })
      return response.data
    },
    staleTime: 3 * MINUTE,
  }
}

export function inboxCapabilitiesQueryOptions<T = unknown>() {
  return {
    queryKey: queryKeys.configuration.inboxCapabilities,
    queryFn: async (): Promise<T> => {
      const response = await api.get<T>('/inbox/global-capabilities')
      return response.data
    },
    staleTime: 10 * MINUTE,
  }
}

export function paymentCapabilitiesQueryOptions<T = unknown>() {
  return {
    queryKey: queryKeys.configuration.paymentCapabilities,
    queryFn: async (): Promise<T> => {
      const response = await api.get<T>('/settings/payment-capabilities')
      return response.data
    },
    staleTime: 10 * MINUTE,
  }
}

export function fiscalCertificateMetaQueryOptions<T = unknown>(unitId: ScopeId) {
  return {
    queryKey: queryKeys.configuration.fiscalCertificate(unitId),
    queryFn: async (): Promise<T> => {
      const response = await api.get<T>('/fiscal/certificate/meta', { headers: unitHeaders(unitId) })
      return response.data
    },
    staleTime: 60_000,
  }
}

export function stripeConnectConfigQueryOptions<T = unknown>(unitId: ScopeId) {
  return {
    queryKey: queryKeys.configuration.stripeConnectConfig(unitId),
    queryFn: async (): Promise<T> => {
      const response = await api.get<T>('/stripe/connect/config', { headers: unitHeaders(unitId) })
      return response.data
    },
    staleTime: 2 * MINUTE,
  }
}

export function receivedInvoicesQueryOptions<T = unknown>(unitId: ScopeId) {
  return {
    queryKey: queryKeys.configuration.receivedInvoices(unitId),
    queryFn: () => getList<T>('/account-management/received-invoices', unitId),
    staleTime: 60_000,
  }
}

export function registerCatalogQueryOptions<T = unknown>() {
  return {
    queryKey: queryKeys.configuration.registerCatalog,
    queryFn: async (): Promise<T> => {
      const response = await api.get<T>('/register/catalog')
      return response.data
    },
    staleTime: 30 * MINUTE,
  }
}

export function consumablesOverviewQueryOptions<T = unknown>(unitId: ScopeId, locationId: ScopeId) {
  return {
    queryKey: queryKeys.consumables.overview(unitId, locationId),
    queryFn: async (): Promise<T> => {
      const response = await api.get<T>('/consumables/overview', {
        headers: unitHeaders(unitId),
        params: { locationId: locationId ?? undefined },
      })
      return response.data
    },
    staleTime: 15_000,
  }
}

export function consumablesItemsQueryOptions<T = unknown>(unitId: ScopeId, locationId: ScopeId) {
  return {
    queryKey: queryKeys.consumables.items(unitId, locationId),
    queryFn: () => getList<T>('/consumables/items', unitId, { locationId: locationId ?? undefined }),
    staleTime: 15_000,
  }
}

export function consumablesCategoriesQueryOptions<T = unknown>(unitId: ScopeId) {
  return {
    queryKey: queryKeys.consumables.categories(unitId),
    queryFn: () => getList<T>('/consumables/categories', unitId),
    staleTime: 5 * MINUTE,
  }
}

export function consumablesMovementsQueryOptions<T = unknown>(unitId: ScopeId, locationId: ScopeId) {
  return {
    queryKey: queryKeys.consumables.movements(unitId, locationId),
    queryFn: () => getList<T>('/consumables/movements', unitId, { locationId: locationId ?? undefined }),
    staleTime: 15_000,
  }
}

export function consumablesSuppliersQueryOptions<T = unknown>(unitId: ScopeId) {
  return {
    queryKey: queryKeys.consumables.suppliers(unitId),
    queryFn: () => getList<T>('/consumables/suppliers', unitId),
    staleTime: 5 * MINUTE,
  }
}

export function consumablesPurchaseOrdersQueryOptions<T = unknown>(unitId: ScopeId, locationId: ScopeId) {
  return {
    queryKey: queryKeys.consumables.purchaseOrders(unitId, locationId),
    queryFn: () => getList<T>('/consumables/purchase-orders', unitId, { locationId: locationId ?? undefined }),
    staleTime: 15_000,
  }
}

export type ActivityLogPageParams = {
  search?: string
  module?: string
  action?: string
  actorType?: string
  actorUserId?: string | number
  locationId?: string | number
  from?: string
  to?: string
  page: number
  size: number
}

export function activityLogPageQueryOptions<T = unknown>(unitId: ScopeId, params: ActivityLogPageParams) {
  const normalized = {
    ...params,
    search: params.search?.trim() || undefined,
    module: params.module || undefined,
    action: params.action || undefined,
    actorType: params.actorType || undefined,
    actorUserId: params.actorUserId || undefined,
    locationId: params.locationId || undefined,
    from: params.from || undefined,
    to: params.to || undefined,
  }
  const signature = JSON.stringify(normalized)
  return {
    queryKey: queryKeys.activityLog.page(unitId, signature),
    queryFn: async (): Promise<T> => {
      const response = await api.get<T>('/activity-logs', {
        headers: unitHeaders(unitId),
        params: normalized,
      })
      return response.data
    },
    staleTime: 15_000,
  }
}

export function analyticsOverviewQueryOptions<T = unknown>(unitId: ScopeId, params: Record<string, string | number>) {
  const signature = JSON.stringify(params)
  return {
    queryKey: queryKeys.analytics.overview(unitId, signature),
    queryFn: async (): Promise<T> => {
      const response = await api.get<T>('/analytics/overview', {
        headers: unitHeaders(unitId),
        params,
      })
      return response.data
    },
    staleTime: 20_000,
  }
}
