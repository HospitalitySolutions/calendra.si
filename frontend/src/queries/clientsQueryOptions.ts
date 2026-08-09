import { api } from '../api'
import { queryKeys } from './queryKeys'

type ScopeId = number | null | undefined

type SortDirection = 'asc' | 'desc'

export type DirectoryPageResponse<T> = {
  content: T[]
  totalElements: number
  page: number
  size: number
  totalPages: number
}

export type ClientDirectoryPageParams = {
  locationId?: ScopeId
  active?: boolean
  search?: string
  assignedOwner?: 'all' | 'unassigned' | number
  sortField?: string | null
  sortDir?: SortDirection
  page: number
  size: number
}

export type DirectoryPageParams = {
  locationId?: ScopeId
  active?: boolean
  search?: string
  sortField?: string | null
  sortDir?: SortDirection
  page: number
  size: number
}

const DIRECTORY_LIST_STALE_TIME_MS = 20_000
const DIRECTORY_OPTIONS_STALE_TIME_MS = 60_000

function unitHeaders(unitId: ScopeId) {
  return unitId == null ? undefined : { 'X-Calendra-Unit-Id': String(unitId) }
}

function normalizePageParams<T extends DirectoryPageParams>(params: T) {
  return {
    ...params,
    locationId: params.locationId ?? undefined,
    search: params.search?.trim() || undefined,
    sortField: params.sortField || undefined,
  }
}

async function getPage<T>(url: string, unitId: ScopeId, params: Record<string, unknown>, fallbackSize: number): Promise<DirectoryPageResponse<T>> {
  const response = await api.get<DirectoryPageResponse<T>>(url, {
    headers: unitHeaders(unitId),
    params,
  })
  const data = response.data
  return {
    content: Array.isArray(data?.content) ? data.content : [],
    totalElements: Number(data?.totalElements || 0),
    page: Number(data?.page || 0),
    size: Number(data?.size || fallbackSize),
    totalPages: Number(data?.totalPages || 0),
  }
}

export function clientDirectoryPageQueryOptions<T = unknown>(unitId: ScopeId, params: ClientDirectoryPageParams) {
  const normalized = {
    ...normalizePageParams(params),
    assignedOwner: params.assignedOwner === 'all' ? undefined : params.assignedOwner,
  }
  const signature = JSON.stringify(normalized)
  return {
    queryKey: queryKeys.clients.page(unitId, params.locationId, signature),
    queryFn: () => getPage<T>('/clients/page', unitId, normalized, params.size),
    staleTime: DIRECTORY_LIST_STALE_TIME_MS,
  }
}

export function companyDirectoryPageQueryOptions<T = unknown>(unitId: ScopeId, params: DirectoryPageParams) {
  const normalized = normalizePageParams(params)
  const signature = JSON.stringify(normalized)
  return {
    queryKey: queryKeys.companies.page(unitId, params.locationId, signature),
    queryFn: () => getPage<T>('/companies/page', unitId, normalized, params.size),
    staleTime: DIRECTORY_LIST_STALE_TIME_MS,
  }
}

export function groupDirectoryPageQueryOptions<T = unknown>(unitId: ScopeId, params: DirectoryPageParams) {
  const normalized = normalizePageParams(params)
  const signature = JSON.stringify(normalized)
  return {
    queryKey: queryKeys.groups.page(unitId, params.locationId, signature),
    queryFn: () => getPage<T>('/groups/page', unitId, normalized, params.size),
    staleTime: DIRECTORY_LIST_STALE_TIME_MS,
  }
}

export function clientOptionSearchQueryOptions<T = unknown>(
  unitId: ScopeId,
  locationId: ScopeId,
  search: string,
  size = 500,
) {
  const normalizedSearch = search.trim()
  const signature = JSON.stringify({ search: normalizedSearch || undefined, size })
  return {
    queryKey: queryKeys.clients.optionSearch(unitId, locationId, signature),
    queryFn: async (): Promise<T[]> => {
      const response = await api.get<T[]>('/clients/options', {
        headers: unitHeaders(unitId),
        params: {
          locationId: locationId ?? undefined,
          search: normalizedSearch || undefined,
          size,
        },
      })
      return Array.isArray(response.data) ? response.data : []
    },
    staleTime: 30_000,
  }
}

export function companyOptionsQueryOptions<T = unknown>(unitId: ScopeId, locationId: ScopeId) {
  return {
    queryKey: queryKeys.companies.options(unitId, locationId),
    queryFn: async (): Promise<T[]> => {
      const response = await api.get<T[]>('/companies/options', {
        headers: unitHeaders(unitId),
        params: { locationId: locationId ?? undefined },
      })
      return Array.isArray(response.data) ? response.data : []
    },
    staleTime: DIRECTORY_OPTIONS_STALE_TIME_MS,
  }
}
