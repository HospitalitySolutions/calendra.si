import { Capacitor } from '@capacitor/core'
import axios from 'axios'

/**
 * JWT auth: POST /auth/login → token in JSON → sessionStorage + Bearer header (not cookies).
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

// Auth: JWT in sessionStorage + Bearer header (not cookies).
export const api = axios.create({
  baseURL: getApiBaseURL(),
  timeout: 30_000,
})

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
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
