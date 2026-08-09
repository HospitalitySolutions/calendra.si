import type { QueryClient } from '@tanstack/react-query'

type ApiTiming = {
  method: string
  endpoint: string
  status: number | null
  durationMs: number
  recordedAt: number
}

type QueryTiming = {
  queryKey: string
  durationMs: number
  outcome: 'success' | 'error'
  recordedAt: number
}

type NavigationTiming = {
  pathname: string
  durationMs: number
  recordedAt: number
}

type PerformanceSnapshot = {
  api: ApiTiming[]
  queries: QueryTiming[]
  navigations: NavigationTiming[]
}

type TimingSummary = {
  count: number
  averageMs: number
  p50Ms: number
  p95Ms: number
  maxMs: number
}

type PerformanceSummary = {
  apiByEndpoint: Record<string, TimingSummary>
  queryOverall: TimingSummary | null
  navigationByPath: Record<string, TimingSummary>
}

const MAX_ENTRIES = 250
const apiTimings: ApiTiming[] = []
const queryTimings: QueryTiming[] = []
const navigationTimings: NavigationTiming[] = []
const pendingNavigations = new Map<string, number>()

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function trim<T>(items: T[]) {
  if (items.length > MAX_ENTRIES) items.splice(0, items.length - MAX_ENTRIES)
}

function summarizeDurations(values: number[]): TimingSummary | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const percentile = (fraction: number) => {
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))
    return sorted[index]
  }
  const average = sorted.reduce((sum, value) => sum + value, 0) / sorted.length
  return {
    count: sorted.length,
    averageMs: Math.round(average * 10) / 10,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    maxMs: sorted[sorted.length - 1],
  }
}

function summarizeGroups<T>(items: T[], keyOf: (item: T) => string, durationOf: (item: T) => number) {
  const grouped = new Map<string, number[]>()
  items.forEach((item) => {
    const key = keyOf(item)
    const values = grouped.get(key) ?? []
    values.push(durationOf(item))
    grouped.set(key, values)
  })
  const result: Record<string, TimingSummary> = {}
  grouped.forEach((values, key) => {
    const summary = summarizeDurations(values)
    if (summary) result[key] = summary
  })
  return result
}

function normalizeEndpoint(url?: string) {
  if (!url) return 'unknown'
  const withoutQuery = url.split('?')[0] || url
  return withoutQuery
    .replace(/\/[0-9]+(?=\/|$)/g, '/:id')
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':uuid')
}

function debugEnabled() {
  if (typeof window === 'undefined') return false
  try {
    return import.meta.env.DEV || window.localStorage.getItem('calendra.performance.debug') === '1'
  } catch {
    return import.meta.env.DEV
  }
}

export function recordApiTiming(method: string | undefined, url: string | undefined, status: number | null, durationMs: number) {
  const entry: ApiTiming = {
    method: String(method || 'GET').toUpperCase(),
    endpoint: normalizeEndpoint(url),
    status,
    durationMs: Math.round(durationMs * 10) / 10,
    recordedAt: Date.now(),
  }
  apiTimings.push(entry)
  trim(apiTimings)
  if (debugEnabled() && entry.durationMs >= 500) {
    console.debug(`[perf] slow API ${entry.method} ${entry.endpoint}: ${entry.durationMs}ms`)
  }
}

export function markNavigationStart(pathname: string) {
  pendingNavigations.set(pathname, now())
}

export function markNavigationRendered(pathname: string) {
  const startedAt = pendingNavigations.get(pathname)
  if (startedAt == null) return
  pendingNavigations.delete(pathname)
  const entry: NavigationTiming = {
    pathname,
    durationMs: Math.round((now() - startedAt) * 10) / 10,
    recordedAt: Date.now(),
  }
  navigationTimings.push(entry)
  trim(navigationTimings)
  if (debugEnabled()) console.debug(`[perf] navigation ${pathname}: ${entry.durationMs}ms`)
}

export function installQueryPerformanceTracking(queryClient: QueryClient) {
  const started = new Map<string, number>()
  return queryClient.getQueryCache().subscribe((event) => {
    const query = event.query
    const queryHash = query.queryHash
    if (query.state.fetchStatus === 'fetching') {
      if (!started.has(queryHash)) started.set(queryHash, now())
      return
    }

    const startedAt = started.get(queryHash)
    if (startedAt == null) return
    started.delete(queryHash)

    const entry: QueryTiming = {
      queryKey: JSON.stringify(query.queryKey),
      durationMs: Math.round((now() - startedAt) * 10) / 10,
      outcome: query.state.status === 'error' ? 'error' : 'success',
      recordedAt: Date.now(),
    }
    queryTimings.push(entry)
    trim(queryTimings)
  })
}

export function getPerformanceSnapshot(): PerformanceSnapshot {
  return {
    api: [...apiTimings],
    queries: [...queryTimings],
    navigations: [...navigationTimings],
  }
}

export function getPerformanceSummary(): PerformanceSummary {
  return {
    apiByEndpoint: summarizeGroups(apiTimings, (entry) => `${entry.method} ${entry.endpoint}`, (entry) => entry.durationMs),
    queryOverall: summarizeDurations(queryTimings.map((entry) => entry.durationMs)),
    navigationByPath: summarizeGroups(navigationTimings, (entry) => entry.pathname, (entry) => entry.durationMs),
  }
}

export function clearPerformanceSnapshot() {
  apiTimings.length = 0
  queryTimings.length = 0
  navigationTimings.length = 0
  pendingNavigations.clear()
}

export function installPerformanceDebugApi() {
  if (typeof window === 'undefined') return
  window.calendraPerformance = {
    snapshot: getPerformanceSnapshot,
    summary: getPerformanceSummary,
    clear: clearPerformanceSnapshot,
  }
}
