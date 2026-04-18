import { Capacitor } from '@capacitor/core'
import axios from 'axios'

const isNativePlatform = Capacitor.isNativePlatform()

/**
 * Web uses HttpOnly auth cookies. Native apps still use a bearer token from sessionStorage.
 *
 * Web must not use Android-emulator URLs baked from `vite build --mode android*`.
 * Native apps use VITE_API_URL from that build; browser uses localhost unless VITE_WEB_API_URL is set.
 */
export function getApiBaseURL(): string {
  const native = Capacitor.isNativePlatform()
  const mobileBuildUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim()
  const webUrl = (import.meta.env.VITE_WEB_API_URL as string | undefined)?.trim()
  const android = Capacitor.getPlatform() === 'android'

  if (native) {
    if (mobileBuildUrl) {
      return mobileBuildUrl
    }
    // Android emulator default; iOS Simulator can reach host via localhost.
    return android ? 'http://10.0.2.2:4000/api' : 'http://localhost:4000/api'
  }
  if (webUrl) {
    return webUrl
  }

  if (mobileBuildUrl && !mobileBuildUrl.includes('10.0.2.2')) {
    return mobileBuildUrl
  }
  return '/api'
}

// Auth: browser cookies for web, bearer token for native.
export const api = axios.create({
  baseURL: getApiBaseURL(),
  timeout: 30_000,
  withCredentials: true,
})

const csrfBootstrapClient = axios.create({
  baseURL: getApiBaseURL(),
  timeout: 30_000,
  withCredentials: true,
})

let csrfReadyPromise: Promise<void> | null = null

function isSafeMethod(method?: string) {
  const normalized = String(method || 'get').toUpperCase()
  return normalized === 'GET' || normalized === 'HEAD' || normalized === 'OPTIONS'
}

function readCookie(name: string) {
  if (typeof document === 'undefined') return null
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.substring(name.length + 1)) : null
}

export async function ensureCsrfToken(force = false): Promise<void> {
  if (isNativePlatform) return
  if (!force && readCookie('XSRF-TOKEN')) return
  if (!force && csrfReadyPromise) {
    await csrfReadyPromise
    return
  }
  csrfReadyPromise = csrfBootstrapClient
    .get('/auth/csrf', {
      headers: {
        'X-App-Platform': 'web',
      },
    })
    .then(() => undefined)
    .finally(() => {
      csrfReadyPromise = null
    })
  await csrfReadyPromise
}

api.interceptors.request.use(async (config) => {
  config.headers['X-App-Platform'] = isNativePlatform ? 'native' : 'web'
  if (isNativePlatform) {
    const token = sessionStorage.getItem('token')
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  }

  const skipPrefetch = config.headers?.['X-Skip-CSRF-Prefetch'] === 'true' || config.headers?.['x-skip-csrf-prefetch'] === 'true'
  if (!isSafeMethod(config.method) && !skipPrefetch) {
    await ensureCsrfToken()
    const csrfToken = readCookie('XSRF-TOKEN')
    if (csrfToken) {
      config.headers['X-XSRF-TOKEN'] = csrfToken
    }
  }
  return config
})

let _conflict409Handler: ((msg: string) => void) | null = null

export function registerConflict409Handler(fn: ((msg: string) => void) | null) {
  _conflict409Handler = fn
}

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const headers = err?.config?.headers as Record<string, unknown> | undefined
    const skipConflictToast =
      headers?.['X-Skip-Conflict-Toast'] === 'true'
      || headers?.['x-skip-conflict-toast'] === 'true'
    if (err?.response?.status === 409 && _conflict409Handler && !skipConflictToast) {
      const msg: string = err.response.data?.message || 'The requested change conflicts with existing data.'
      _conflict409Handler(msg)
    }
    return Promise.reject(err)
  },
)
