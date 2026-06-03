const ONBOARDING_TOUR_PENDING_KEY = 'calendra.onboardingTour.pending'
const ONBOARDING_TOUR_COMPLETED_PREFIX = 'calendra.onboardingTour.completed'

export function markOnboardingTourPending() {
  try {
    window.sessionStorage.setItem(ONBOARDING_TOUR_PENDING_KEY, '1')
  } catch {
    // Best-effort only; onboarding should never block registration.
  }
}

export function clearOnboardingTourPending() {
  try {
    window.sessionStorage.removeItem(ONBOARDING_TOUR_PENDING_KEY)
  } catch {
    // Best-effort only.
  }
}

export function hasPendingOnboardingTour() {
  try {
    return window.sessionStorage.getItem(ONBOARDING_TOUR_PENDING_KEY) === '1'
  } catch {
    return false
  }
}

export function getOnboardingTourCompletedKey(userId?: number | string | null, companyId?: number | string | null) {
  const owner = companyId ?? userId ?? 'anonymous'
  return `${ONBOARDING_TOUR_COMPLETED_PREFIX}.${owner}`
}

export function isOnboardingTourCompleted(userId?: number | string | null, companyId?: number | string | null) {
  try {
    return window.localStorage.getItem(getOnboardingTourCompletedKey(userId, companyId)) === '1'
  } catch {
    return false
  }
}

export function markOnboardingTourCompleted(userId?: number | string | null, companyId?: number | string | null) {
  try {
    window.localStorage.setItem(getOnboardingTourCompletedKey(userId, companyId), '1')
  } catch {
    // Best-effort only.
  }
  clearOnboardingTourPending()
}
