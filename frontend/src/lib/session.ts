export type AuthPayload = {
  token?: string
  user: unknown
}

export const POST_LOGIN_REDIRECT_KEY = 'postLoginRedirect'
export const POST_ZOOM_RETURN_KEY = 'postZoomReturnPath'

export function sanitizeNextPath(value: string | null | undefined): string {
  if (!value) return '/calendar'
  const trimmed = value.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '/calendar'
  return trimmed
}

export function setPostLoginRedirect(path: string | null | undefined) {
  sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, sanitizeNextPath(path))
}

export function consumePostLoginRedirect(fallback = '/calendar'): string {
  const raw = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY)
  sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY)
  return sanitizeNextPath(raw || fallback)
}


export function setPostZoomReturnPath(path: string | null | undefined) {
  sessionStorage.setItem(POST_ZOOM_RETURN_KEY, sanitizeNextPath(path))
}

export function getPostZoomReturnPath(fallback = '/calendar'): string {
  const raw = sessionStorage.getItem(POST_ZOOM_RETURN_KEY)
  return sanitizeNextPath(raw || fallback)
}

export function consumePostZoomReturnPath(fallback = '/calendar'): string {
  const target = getPostZoomReturnPath(fallback)
  sessionStorage.removeItem(POST_ZOOM_RETURN_KEY)
  return target
}

export function storeAuthenticatedSession(data: AuthPayload) {
  sessionStorage.removeItem('securityReauthToken')
  if (data.token) sessionStorage.setItem('token', data.token)
  else sessionStorage.removeItem('token')
  sessionStorage.setItem('user', JSON.stringify(data.user))
}
