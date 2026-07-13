/**
 * Referral attribution for the public register flow.
 *
 * A referral link looks like `/register?ref=CODE`. The `ref` code must survive the multi-step register
 * wizard (plan -> add-ons -> account -> verify) and reach the signup request, so we persist it in
 * sessionStorage the first time we see it and append it to the `returnSearch` that the backend stores and
 * reads when it provisions the new tenant.
 */

const REF_STORAGE_KEY = 'calendra.register.ref'
const REF_MAX_LENGTH = 64

function sanitizeRefCode(raw: string | null | undefined): string {
  return String(raw ?? '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, REF_MAX_LENGTH)
}

/** Reads `ref` from a search string and stores it. Returns the sanitized code (or ''). */
export function captureReferralCode(search?: string | null): string {
  if (typeof window === 'undefined') return ''
  try {
    const params = new URLSearchParams((search ?? window.location.search).replace(/^\?/, ''))
    const code = sanitizeRefCode(params.get('ref'))
    if (code) {
      window.sessionStorage.setItem(REF_STORAGE_KEY, code)
      return code
    }
  } catch {
    // Best-effort; a missing ref just means no attribution.
  }
  return getStoredReferralCode()
}

export function getStoredReferralCode(): string {
  if (typeof window === 'undefined') return ''
  try {
    return sanitizeRefCode(window.sessionStorage.getItem(REF_STORAGE_KEY))
  } catch {
    return ''
  }
}

/** Appends the stored `ref` code to a return-search string (if any), without duplicating it. */
export function appendReferralToReturnSearch(returnSearch: string): string {
  const code = getStoredReferralCode()
  if (!code) return returnSearch
  const params = new URLSearchParams((returnSearch ?? '').replace(/^\?/, ''))
  params.set('ref', code)
  return params.toString()
}
