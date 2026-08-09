import type { QueryClient } from '@tanstack/react-query'
import performanceBudgets from '../config/performanceBudgets.json'
import { navigationRouteFamily, type NavigationRouteFamily } from '../queries/navigationRouteFamily'
import { evaluatePerformanceSnapshot, type PerformanceGuardrailReport } from './performanceGuardrails.mjs'

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

type DuplicateRequest = {
  method: 'GET'
  endpoint: string
  recordedAt: number
}

type NavigationTiming = {
  pathname: string
  family: NavigationRouteFamily | null
  durationMs: number
  apiGetCount: number
  uniqueApiGetCount: number
  duplicateGetCount: number
  recordedAt: number
}

type PerformanceSnapshot = {
  api: ApiTiming[]
  queries: QueryTiming[]
  duplicates: DuplicateRequest[]
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
  duplicateInflightGets: number
  navigationByPath: Record<string, TimingSummary>
}

type ActiveNavigation = {
  pathname: string
  family: NavigationRouteFamily | null
  startedAt: number
  renderedDurationMs: number | null
  apiGetCount: number
  apiGetIdentities: Set<string>
  duplicateGetCount: number
  finalizeTimer: ReturnType<typeof setTimeout> | null
}

const MAX_ENTRIES = 250
const NAVIGATION_FANOUT_CAPTURE_MS = 750
const apiTimings: ApiTiming[] = []
const queryTimings: QueryTiming[] = []
const duplicateRequests: DuplicateRequest[] = []
const navigationTimings: NavigationTiming[] = []
const activeGetRequests = new Map<string, number>()
let activeNavigation: ActiveNavigation | null = null
let requestSequence = 0

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

function stableSerialize(value: unknown): string {
  if (value == null) return ''
  if (value instanceof URLSearchParams) return value.toString()
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${key}:${stableSerialize(record[key])}`).join(',')}}`
  }
  return String(value)
}

function requestIdentity(method: string, url: string | undefined, params: unknown): string {
  return `${method}:${url || 'unknown'}?${stableSerialize(params)}`
}

function debugEnabled() {
  if (typeof window === 'undefined') return false
  try {
    return import.meta.env.DEV || window.localStorage.getItem('calendra.performance.debug') === '1'
  } catch {
    return import.meta.env.DEV
  }
}

function finalizeActiveNavigation() {
  const navigation = activeNavigation
  if (!navigation) return
  if (navigation.finalizeTimer) clearTimeout(navigation.finalizeTimer)
  activeNavigation = null
  if (navigation.renderedDurationMs == null) return

  const entry: NavigationTiming = {
    pathname: navigation.pathname,
    family: navigation.family,
    durationMs: navigation.renderedDurationMs,
    apiGetCount: navigation.apiGetCount,
    uniqueApiGetCount: navigation.apiGetIdentities.size,
    duplicateGetCount: navigation.duplicateGetCount,
    recordedAt: Date.now(),
  }
  navigationTimings.push(entry)
  trim(navigationTimings)

  if (debugEnabled()) {
    console.debug(
      `[perf] navigation ${entry.pathname}: ${entry.durationMs}ms; `
      + `${entry.uniqueApiGetCount} unique GETs (${entry.duplicateGetCount} duplicate in-flight)`,
    )
  }
}

export function recordApiRequestStarted(method: string | undefined, url: string | undefined, params?: unknown): string {
  const normalizedMethod = String(method || 'GET').toUpperCase()
  const identity = requestIdentity(normalizedMethod, url, params)
  const token = `${++requestSequence}:${identity}`

  if (normalizedMethod === 'GET') {
    const existing = activeGetRequests.get(identity) ?? 0
    const duplicate = existing > 0
    activeGetRequests.set(identity, existing + 1)

    if (activeNavigation) {
      activeNavigation.apiGetCount += 1
      activeNavigation.apiGetIdentities.add(identity)
      if (duplicate) activeNavigation.duplicateGetCount += 1
    }

    if (duplicate) {
      const entry: DuplicateRequest = {
        method: 'GET',
        endpoint: normalizeEndpoint(url),
        recordedAt: Date.now(),
      }
      duplicateRequests.push(entry)
      trim(duplicateRequests)
      if (debugEnabled()) console.warn(`[perf] duplicate in-flight GET ${entry.endpoint}`)
    }
  }

  return token
}

export function recordApiRequestFinished(token: string | undefined) {
  if (!token) return
  const separator = token.indexOf(':')
  if (separator < 0) return
  const identity = token.slice(separator + 1)
  if (!identity.startsWith('GET:')) return
  const existing = activeGetRequests.get(identity) ?? 0
  if (existing <= 1) activeGetRequests.delete(identity)
  else activeGetRequests.set(identity, existing - 1)
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
  finalizeActiveNavigation()
  activeNavigation = {
    pathname,
    family: navigationRouteFamily(pathname),
    startedAt: now(),
    renderedDurationMs: null,
    apiGetCount: 0,
    apiGetIdentities: new Set<string>(),
    duplicateGetCount: 0,
    finalizeTimer: null,
  }
}

export function markNavigationRendered(pathname: string) {
  const navigation = activeNavigation
  if (!navigation || navigation.pathname !== pathname || navigation.renderedDurationMs != null) return
  navigation.renderedDurationMs = Math.round((now() - navigation.startedAt) * 10) / 10
  navigation.finalizeTimer = setTimeout(finalizeActiveNavigation, NAVIGATION_FANOUT_CAPTURE_MS)
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
    duplicates: [...duplicateRequests],
    navigations: [...navigationTimings],
  }
}

export function getPerformanceSummary(): PerformanceSummary {
  return {
    apiByEndpoint: summarizeGroups(apiTimings, (entry) => `${entry.method} ${entry.endpoint}`, (entry) => entry.durationMs),
    queryOverall: summarizeDurations(queryTimings.map((entry) => entry.durationMs)),
    duplicateInflightGets: duplicateRequests.length,
    navigationByPath: summarizeGroups(navigationTimings, (entry) => entry.pathname, (entry) => entry.durationMs),
  }
}

export function getPerformanceGuardrailReport(): PerformanceGuardrailReport {
  return evaluatePerformanceSnapshot(getPerformanceSnapshot(), performanceBudgets)
}

export function clearPerformanceSnapshot() {
  apiTimings.length = 0
  queryTimings.length = 0
  duplicateRequests.length = 0
  navigationTimings.length = 0
  activeGetRequests.clear()
  if (activeNavigation?.finalizeTimer) clearTimeout(activeNavigation.finalizeTimer)
  activeNavigation = null
}

export function installPerformanceDebugApi() {
  if (typeof window === 'undefined') return
  window.calendraPerformance = {
    snapshot: getPerformanceSnapshot,
    summary: getPerformanceSummary,
    guardrails: getPerformanceGuardrailReport,
    budgets: () => performanceBudgets,
    clear: clearPerformanceSnapshot,
  }
}
