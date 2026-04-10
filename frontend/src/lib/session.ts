export type AuthPayload = {
  token: string
  user: unknown
}

export function storeAuthenticatedSession(data: AuthPayload) {
  sessionStorage.removeItem('securityReauthToken')
  sessionStorage.setItem('token', data.token)
  sessionStorage.setItem('user', JSON.stringify(data.user))
}
