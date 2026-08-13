import { API_BASE_URL } from '../config'

const TOKEN_KEY = 'calendra.customer.token'

export class ApiError extends Error {
  status: number
  payload: unknown

  constructor(message: string, status: number, payload: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setStoredToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

function errorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    const message = record.message ?? record.error ?? record.detail
    if (typeof message === 'string' && message.trim()) return message
  }
  if (typeof payload === 'string' && payload.trim()) return payload
  return fallback
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  options: { auth?: boolean; raw?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers)
  const token = getStoredToken()
  if (options.auth !== false && token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  headers.set('Accept', headers.get('Accept') || 'application/json')

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers })
  if (!response.ok) {
    if (response.status === 401 && options.auth !== false) {
      setStoredToken(null)
      window.dispatchEvent(new Event('calendra:customer-unauthorized'))
    }
    const contentType = response.headers.get('content-type') || ''
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.text().catch(() => '')
    throw new ApiError(errorMessage(payload, `Request failed (${response.status})`), response.status, payload)
  }

  if (options.raw) return response as T
  if (response.status === 204) return undefined as T
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) return (await response.text()) as T
  return response.json() as Promise<T>
}

export async function apiBlob(path: string): Promise<Blob> {
  const token = getStoredToken()
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  if (!response.ok) throw new ApiError('Datoteke ni bilo mogoče naložiti.', response.status, null)
  return response.blob()
}
