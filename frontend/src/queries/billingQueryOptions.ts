import { api } from '../api'
import { queryKeys } from './queryKeys'

type ScopeId = number | null | undefined

export type BillingSummary = {
  openBills: number
  openPayments: number
  unusedAdvances: number
  giftCards: number
  history: number
}

export type BillingHistoryStats = {
  thisMonthCount: number
  paidCount: number
  refundsCount: number
  advancesCount: number
  totalAmount: number
}

export type BillingPageResponse<T> = {
  content: T[]
  totalElements: number
  page: number
  size: number
  totalPages: number
  totalAmount?: number
  historyStats?: BillingHistoryStats | null
}

export type UnusedAdvancePageResponse<T> = {
  content: T[]
  totalElements: number
  page: number
  size: number
  totalPages: number
  totalRemainingGross: number
}

export type GiftCardStats = {
  active: number
  partial: number
  used: number
  expired: number
  outstanding: number
}

export type GiftCardPageResponse<T> = {
  content: T[]
  totalElements: number
  page: number
  size: number
  totalPages: number
  stats: GiftCardStats
}

type BillPageParams = {
  view: 'history' | 'openPayments'
  locationId?: ScopeId
  search?: string
  dateFrom?: string
  dateTo?: string
  paymentStatus?: string
  fiscalStatus?: string
  billType?: string
  sortField?: string | null
  sortDir?: 'asc' | 'desc'
  page: number
  size: number
}

type SimplePagedParams = {
  locationId?: ScopeId
  search?: string
  sortField?: string | null
  sortDir?: 'asc' | 'desc'
  page: number
  size: number
}

type GiftCardPagedParams = SimplePagedParams & {
  dateFrom?: string
  dateTo?: string
  status?: string
}

const BILLING_LIST_STALE_TIME_MS = 20_000
const BILLING_SUMMARY_STALE_TIME_MS = 15_000
const BILLING_EDITOR_STALE_TIME_MS = 60_000

function unitHeaders(unitId: ScopeId) {
  return unitId == null ? undefined : { 'X-Calendra-Unit-Id': String(unitId) }
}

async function getList<T>(url: string, unitId: ScopeId, params?: Record<string, unknown>): Promise<T[]> {
  const response = await api.get<T[]>(url, { headers: unitHeaders(unitId), params })
  return Array.isArray(response.data) ? response.data : []
}

export function billingSummaryQueryOptions(unitId: ScopeId, locationId: ScopeId) {
  return {
    queryKey: queryKeys.billing.summary(unitId, locationId),
    queryFn: async (): Promise<BillingSummary> => {
      const response = await api.get<BillingSummary>('/billing/summary', {
        headers: unitHeaders(unitId),
        params: { locationId: locationId ?? undefined },
      })
      return response.data ?? { openBills: 0, openPayments: 0, unusedAdvances: 0, giftCards: 0, history: 0 }
    },
    staleTime: BILLING_SUMMARY_STALE_TIME_MS,
  }
}

export function openBillsQueryOptions<T = unknown>(unitId: ScopeId) {
  return {
    queryKey: queryKeys.billing.openBills(unitId),
    queryFn: () => getList<T>('/billing/open-bills', unitId),
    staleTime: BILLING_LIST_STALE_TIME_MS,
  }
}

export function openBillQueryOptions<T = unknown>(unitId: ScopeId, openBillId: number) {
  return {
    queryKey: queryKeys.billing.openBill(unitId, openBillId),
    queryFn: async (): Promise<T> => {
      const response = await api.get<T>(`/billing/open-bills/${openBillId}`, { headers: unitHeaders(unitId) })
      return response.data
    },
    staleTime: BILLING_EDITOR_STALE_TIME_MS,
  }
}

export function billsQueryOptions<T = unknown>(unitId: ScopeId) {
  return {
    queryKey: queryKeys.billing.bills(unitId),
    queryFn: () => getList<T>('/billing/bills', unitId),
    staleTime: BILLING_LIST_STALE_TIME_MS,
  }
}

export function unusedAdvancesQueryOptions<T = unknown>(unitId: ScopeId, locationId: ScopeId) {
  return {
    queryKey: queryKeys.billing.unusedAdvances(unitId, locationId),
    queryFn: () => getList<T>('/billing/unused-advances', unitId, { locationId: locationId ?? undefined }),
    staleTime: BILLING_LIST_STALE_TIME_MS,
  }
}

export function giftCardsQueryOptions<T = unknown>(unitId: ScopeId) {
  return {
    queryKey: queryKeys.billing.giftCards(unitId),
    queryFn: () => getList<T>('/billing/gift-cards', unitId),
    staleTime: BILLING_LIST_STALE_TIME_MS,
  }
}

export function billsPageQueryOptions<T = unknown>(unitId: ScopeId, params: BillPageParams) {
  const normalized = {
    ...params,
    locationId: params.locationId ?? undefined,
    search: params.search?.trim() || undefined,
    dateFrom: params.dateFrom || undefined,
    dateTo: params.dateTo || undefined,
    paymentStatus: params.paymentStatus && params.paymentStatus !== 'all' ? params.paymentStatus : undefined,
    fiscalStatus: params.fiscalStatus && params.fiscalStatus !== 'all' ? params.fiscalStatus : undefined,
    billType: params.billType && params.billType !== 'all' ? params.billType : undefined,
    sortField: params.sortField || undefined,
  }
  const signature = JSON.stringify(normalized)
  return {
    queryKey: queryKeys.billing.billsPage(unitId, params.view, params.locationId, signature),
    queryFn: async (): Promise<BillingPageResponse<T>> => {
      const response = await api.get<BillingPageResponse<T>>('/billing/bills/paged', {
        headers: unitHeaders(unitId),
        params: normalized,
      })
      const data = response.data
      return {
        content: Array.isArray(data?.content) ? data.content : [],
        totalElements: Number(data?.totalElements || 0),
        page: Number(data?.page || 0),
        size: Number(data?.size || params.size),
        totalPages: Number(data?.totalPages || 0),
        totalAmount: Number(data?.totalAmount || 0),
        historyStats: data?.historyStats ?? null,
      }
    },
    staleTime: BILLING_LIST_STALE_TIME_MS,
  }
}

export function unusedAdvancesPageQueryOptions<T = unknown>(unitId: ScopeId, params: SimplePagedParams) {
  const normalized = {
    ...params,
    locationId: params.locationId ?? undefined,
    search: params.search?.trim() || undefined,
    sortField: params.sortField || undefined,
  }
  const signature = JSON.stringify(normalized)
  return {
    queryKey: queryKeys.billing.unusedAdvancesPage(unitId, params.locationId, signature),
    queryFn: async (): Promise<UnusedAdvancePageResponse<T>> => {
      const response = await api.get<UnusedAdvancePageResponse<T>>('/billing/unused-advances/paged', {
        headers: unitHeaders(unitId),
        params: normalized,
      })
      const data = response.data
      return {
        content: Array.isArray(data?.content) ? data.content : [],
        totalElements: Number(data?.totalElements || 0),
        page: Number(data?.page || 0),
        size: Number(data?.size || params.size),
        totalPages: Number(data?.totalPages || 0),
        totalRemainingGross: Number(data?.totalRemainingGross || 0),
      }
    },
    staleTime: BILLING_LIST_STALE_TIME_MS,
  }
}

export function giftCardsPageQueryOptions<T = unknown>(unitId: ScopeId, params: GiftCardPagedParams) {
  const normalized = {
    ...params,
    locationId: params.locationId ?? undefined,
    search: params.search?.trim() || undefined,
    dateFrom: params.dateFrom || undefined,
    dateTo: params.dateTo || undefined,
    status: params.status && params.status !== 'all' ? params.status : undefined,
    sortField: params.sortField || undefined,
  }
  const signature = JSON.stringify(normalized)
  return {
    queryKey: queryKeys.billing.giftCardsPage(unitId, params.locationId, signature),
    queryFn: async (): Promise<GiftCardPageResponse<T>> => {
      const response = await api.get<GiftCardPageResponse<T>>('/billing/gift-cards/paged', {
        headers: unitHeaders(unitId),
        params: normalized,
      })
      const data = response.data
      return {
        content: Array.isArray(data?.content) ? data.content : [],
        totalElements: Number(data?.totalElements || 0),
        page: Number(data?.page || 0),
        size: Number(data?.size || params.size),
        totalPages: Number(data?.totalPages || 0),
        stats: data?.stats ?? { active: 0, partial: 0, used: 0, expired: 0, outstanding: 0 },
      }
    },
    staleTime: BILLING_LIST_STALE_TIME_MS,
  }
}

export function billingEditorCompaniesQueryOptions<T = unknown>(unitId: ScopeId, locationId: ScopeId) {
  return {
    queryKey: queryKeys.billing.editorCompanies(unitId, locationId),
    queryFn: () => getList<T>('/companies', unitId, { locationId: locationId ?? undefined }),
    staleTime: BILLING_EDITOR_STALE_TIME_MS,
  }
}

export function billingEditorBookingsQueryOptions<T = unknown>(unitId: ScopeId) {
  return {
    queryKey: queryKeys.billing.editorBookings(unitId),
    queryFn: () => getList<T>('/bookings', unitId),
    staleTime: 30_000,
  }
}
