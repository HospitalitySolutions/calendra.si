export function clientEmailAlreadyExistsMessage(locale: string): string {
  return locale === 'sl'
    ? 'Stranka s tem e-poštnim naslovom že obstaja. Izberite obstoječo stranko ali uporabite drug e-poštni naslov.'
    : 'A client with this email address already exists. Select the existing client or use a different email address.'
}

export function clientMutationErrorMessage(
  error: any,
  locale: string,
  fallback: string,
): string {
  if (Number(error?.response?.status) === 409) {
    return clientEmailAlreadyExistsMessage(locale)
  }

  const backendMessage = error?.response?.data?.message ?? error?.response?.data?.detail
  return typeof backendMessage === 'string' && backendMessage.trim()
    ? backendMessage.trim()
    : fallback
}

export const skipConflictToastHeaders = {
  'X-Skip-Conflict-Toast': 'true',
} as const
