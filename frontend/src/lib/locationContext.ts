import { useCallback, useSyncExternalStore } from 'react'

const EVENT_NAME = 'calendra-location-changed'

function keyFor(unitId: number | null | undefined) {
  return `calendra.activeLocationId:${unitId ?? 'default'}`
}

export function getSelectedLocationId(unitId: number | null | undefined): number | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(keyFor(unitId))
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function setSelectedLocationId(unitId: number | null | undefined, locationId: number | null) {
  if (typeof window === 'undefined') return
  const key = keyFor(unitId)
  if (locationId == null) window.localStorage.removeItem(key)
  else window.localStorage.setItem(key, String(locationId))
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { unitId, locationId } }))
}

function subscribe(callback: () => void) {
  if (typeof window === 'undefined') return () => undefined
  const handler = () => callback()
  window.addEventListener(EVENT_NAME, handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener(EVENT_NAME, handler)
    window.removeEventListener('storage', handler)
  }
}

export function useSelectedLocationId(unitId: number | null | undefined) {
  const value = useSyncExternalStore(
    subscribe,
    () => getSelectedLocationId(unitId),
    () => null,
  )
  const setValue = useCallback((next: number | null) => setSelectedLocationId(unitId, next), [unitId])
  return [value, setValue] as const
}
