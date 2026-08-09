import { QueryClient } from '@tanstack/react-query'

const DEFAULT_STALE_TIME_MS = 30_000
const DEFAULT_GC_TIME_MS = 10 * 60_000

function shouldRetryQuery(failureCount: number, error: unknown) {
  const status = (error as { response?: { status?: number } } | null)?.response?.status
  if (typeof status === 'number' && status >= 400 && status < 500) return false
  return failureCount < 1
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: DEFAULT_STALE_TIME_MS,
      gcTime: DEFAULT_GC_TIME_MS,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: shouldRetryQuery,
    },
  },
})
