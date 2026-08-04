const ACTIVE_UNIT_STORAGE_KEY = 'calendra.activeUnitId'

export function getActiveUnitId(): number | null {
  try {
    const raw = localStorage.getItem(ACTIVE_UNIT_STORAGE_KEY)
    if (!raw) return null
    const value = Number(raw)
    return Number.isInteger(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

export function setActiveUnitId(value: number | null | undefined) {
  try {
    if (value == null || !Number.isInteger(Number(value)) || Number(value) <= 0) {
      localStorage.removeItem(ACTIVE_UNIT_STORAGE_KEY)
      return
    }
    localStorage.setItem(ACTIVE_UNIT_STORAGE_KEY, String(value))
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

export function clearActiveUnitId() {
  try {
    localStorage.removeItem(ACTIVE_UNIT_STORAGE_KEY)
  } catch {
    // Ignore storage failures during logout/recovery.
  }
}
