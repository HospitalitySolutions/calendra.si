import { Capacitor } from '@capacitor/core'
import axios from 'axios'

const isNativePlatform = Capacitor.isNativePlatform()

function readEnv(name: keyof ImportMetaEnv): string | undefined {
  return (import.meta.env[name] as string | undefined)?.trim() || undefined
}

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`
}

function normalizeApiBaseUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

function buildApiUrlFromParts(): string | undefined {
  const host = readEnv('VITE_API_HOST')
  if (!host) return undefined

  const protocol = readEnv('VITE_API_PROTOCOL') || 'http'
  const port = readEnv('VITE_API_PORT') || '4000'
  const path = normalizePath(readEnv('VITE_API_PATH') || '/api')
  const cleanHost = host
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/\/+$/, '')
  const portPart = port && !/:\d+$/.test(cleanHost) ? `:${port.replace(/^:/, '')}` : ''

  return normalizeApiBaseUrl(`${protocol}://${cleanHost}${portPart}${path}`)
}

function configuredMobileApiUrl(): string | undefined {
  const fullUrl = readEnv('VITE_API_URL')
  return fullUrl ? normalizeApiBaseUrl(fullUrl) : buildApiUrlFromParts()
}

function isAndroidEmulatorUrl(url: string): boolean {
  return url.includes('10.0.2.2')
}

/**
 * Web uses HttpOnly auth cookies. Native apps still use a bearer token from sessionStorage.
 *
 * To switch which computer/device the mobile app connects to, change VITE_API_HOST
 * in frontend/.env.android.local (physical device) or frontend/.env.androidemu.local
 * (Android emulator). VITE_API_URL is still supported as a full URL override.
 */
export function getApiBaseURL(): string {
  const native = Capacitor.isNativePlatform()
  const mobileApiUrl = configuredMobileApiUrl()
  const webUrl = readEnv('VITE_WEB_API_URL')
  const android = Capacitor.getPlatform() === 'android'

  if (native) {
    if (mobileApiUrl) {
      return mobileApiUrl
    }
    // Android emulator default; iOS Simulator can reach host via localhost.
    return android ? 'http://10.0.2.2:4000/api' : 'http://localhost:4000/api'
  }
  if (webUrl) {
    return normalizeApiBaseUrl(webUrl)
  }

  // When someone opens a mobile build in a browser, LAN hosts are fine,
  // but emulator-only hosts such as 10.0.2.2 are not reachable from desktop browsers.
  if (mobileApiUrl && !isAndroidEmulatorUrl(mobileApiUrl)) {
    return mobileApiUrl
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
