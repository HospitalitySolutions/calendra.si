/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Full mobile API URL override, e.g. http://192.168.1.50:4000/api. */
  readonly VITE_API_URL?: string
  /** Preferred mobile API host variable, e.g. 192.168.1.50 or 10.0.2.2. */
  readonly VITE_API_HOST?: string
  readonly VITE_API_PORT?: string
  readonly VITE_API_PROTOCOL?: string
  readonly VITE_API_PATH?: string
  /** Optional override when running in a browser (never uses emulator-only hosts). */
  readonly VITE_WEB_API_URL?: string
  readonly VITE_WEBSITE_PRICING_URL?: string
}

interface Window {
  calendraPerformance?: {
    snapshot: () => {
      api: Array<{ method: string; endpoint: string; status: number | null; durationMs: number; recordedAt: number }>
      queries: Array<{ queryKey: string; durationMs: number; outcome: 'success' | 'error'; recordedAt: number }>
      duplicates: Array<{ method: 'GET'; endpoint: string; recordedAt: number }>
      navigations: Array<{
        pathname: string
        family: string | null
        durationMs: number
        apiGetCount: number
        uniqueApiGetCount: number
        duplicateGetCount: number
        recordedAt: number
      }>
    }
    summary: () => {
      apiByEndpoint: Record<string, { count: number; averageMs: number; p50Ms: number; p95Ms: number; maxMs: number }>
      queryOverall: { count: number; averageMs: number; p50Ms: number; p95Ms: number; maxMs: number } | null
      duplicateInflightGets: number
      navigationByPath: Record<string, { count: number; averageMs: number; p50Ms: number; p95Ms: number; maxMs: number }>
    }
    guardrails: () => {
      passed: boolean
      violations: Array<{ code: string; message: string; examples?: string[] }>
      warnings: Array<{ code: string; message: string; examples?: string[] }>
      observations: Array<{ type: 'api' | 'navigation'; key: string; samples: number; p95Ms: number | null; budgetMs: number }>
    }
    budgets: () => unknown
    clear: () => void
  }
}
