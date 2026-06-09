import { nowMs } from '../../lib/clock'

export type StoredBookingStatus = 'RESERVED' | 'CANCELLED' | 'NO_SHOW' | 'CHECKED_OUT'
export type DerivedBookingStatus = StoredBookingStatus | 'ONGOING' | 'CHECKED_OUT'
export type BookingStatusUpdateValidationReason = 'INVALID_TIME_WINDOW' | 'CHECKED_OUT_BEFORE_START' | 'UNSUPPORTED_TRANSITION'

export function bookingStatusDisplayLabel(
  status: DerivedBookingStatus | StoredBookingStatus | string,
  locale: string,
): string {
  const key = String(status ?? '').trim().toUpperCase()
  if (locale === 'sl') {
    if (key === 'CHECKED_OUT') return 'Zaključen'
    if (key === 'ONGOING') return 'V teku'
    if (key === 'CANCELLED') return 'Odpovedan'
    if (key === 'NO_SHOW') return 'Ni prišel'
    return 'Rezerviran'
  }
  if (key === 'CHECKED_OUT') return 'Checked out'
  if (key === 'ONGOING') return 'Ongoing'
  if (key === 'CANCELLED') return 'Cancelled'
  if (key === 'NO_SHOW') return 'No show'
  return 'Reserved'
}

export function normalizeStoredBookingStatus(rawStatus: unknown): StoredBookingStatus {
  const value = String(rawStatus ?? '').trim().toUpperCase()
  if (value === 'CANCELLED') return 'CANCELLED'
  if (value === 'NO_SHOW') return 'NO_SHOW'
  if (value === 'CHECKED_OUT') return 'CHECKED_OUT'
  return 'RESERVED'
}

function deriveBookingStatusAtTime(
  startTime: unknown,
  endTime: unknown,
  rawStatus: unknown,
  nowMs: number,
): DerivedBookingStatus {
  const stored = normalizeStoredBookingStatus(rawStatus)
  if (stored === 'CANCELLED' || stored === 'NO_SHOW') return stored
  if (stored === 'CHECKED_OUT') return 'CHECKED_OUT'
  const startMs = new Date(String(startTime ?? '')).getTime()
  const endMs = new Date(String(endTime ?? '')).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 'RESERVED'
  if (nowMs < startMs) return 'RESERVED'
  if (nowMs < endMs) return 'ONGOING'
  return 'CHECKED_OUT'
}

export function deriveBookingStatus(startTime: unknown, endTime: unknown, rawStatus: unknown): DerivedBookingStatus {
  return deriveBookingStatusAtTime(startTime, endTime, rawStatus, nowMs())
}

function canTransitionToStoredStatus(derivedStatus: DerivedBookingStatus, targetStoredStatus: StoredBookingStatus): boolean {
  if (derivedStatus === 'CANCELLED' || derivedStatus === 'NO_SHOW') return derivedStatus === targetStoredStatus
  if (derivedStatus === 'RESERVED') return targetStoredStatus === 'RESERVED' || targetStoredStatus === 'CANCELLED' || targetStoredStatus === 'NO_SHOW'
  if (derivedStatus === 'ONGOING') return targetStoredStatus === 'RESERVED' || targetStoredStatus === 'CHECKED_OUT' || targetStoredStatus === 'CANCELLED' || targetStoredStatus === 'NO_SHOW'
  if (derivedStatus === 'CHECKED_OUT') return targetStoredStatus === 'CANCELLED' || targetStoredStatus === 'NO_SHOW'
  return false
}

export function validateStoredBookingStatusUpdate(
  startTime: unknown,
  endTime: unknown,
  currentStoredStatus: unknown,
  targetStoredStatus: unknown,
  nowMsArg: number = nowMs(),
): { allowed: true } | { allowed: false; reason: BookingStatusUpdateValidationReason } {
  const normalizedCurrent = normalizeStoredBookingStatus(currentStoredStatus)
  const normalizedTarget = normalizeStoredBookingStatus(targetStoredStatus)
  const startMs = new Date(String(startTime ?? '')).getTime()
  const endMs = new Date(String(endTime ?? '')).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return { allowed: false, reason: 'INVALID_TIME_WINDOW' }
  }
  if (normalizedTarget === 'CHECKED_OUT') {
    if (normalizedCurrent === 'CANCELLED' || normalizedCurrent === 'NO_SHOW') {
      return { allowed: false, reason: 'UNSUPPORTED_TRANSITION' }
    }
    if (normalizedCurrent === 'CHECKED_OUT') return { allowed: true }
    if (nowMsArg < startMs) return { allowed: false, reason: 'CHECKED_OUT_BEFORE_START' }
    return { allowed: true }
  }
  const derivedStatus = deriveBookingStatusAtTime(startTime, endTime, normalizedCurrent, nowMsArg)
  return canTransitionToStoredStatus(derivedStatus, normalizedTarget)
    ? { allowed: true }
    : { allowed: false, reason: 'UNSUPPORTED_TRANSITION' }
}

export function allowedStoredTargetsForDerivedStatus(status: DerivedBookingStatus): StoredBookingStatus[] {
  if (status === 'RESERVED') return ['CANCELLED']
  if (status === 'ONGOING') return ['CHECKED_OUT', 'CANCELLED', 'NO_SHOW']
  if (status === 'CHECKED_OUT') return ['CANCELLED', 'NO_SHOW']
  return []
}

export function filterHiddenStatusesFromCalendarPayload(payload: any) {
  if (!payload || typeof payload !== 'object') return payload
  const booked = Array.isArray(payload.booked) ? payload.booked : []
  return {
    ...payload,
    booked: booked.filter((row: any) => {
      const stored = normalizeStoredBookingStatus(row?.bookingStatus)
      return stored !== 'CANCELLED' && stored !== 'NO_SHOW'
    }),
  }
}

export function bookingStatusTagColors(status: DerivedBookingStatus | StoredBookingStatus) {
  if (status === 'ONGOING') {
    return { background: '#2563eb', border: '#1d4ed8' }
  }
  if (status === 'CANCELLED' || status === 'NO_SHOW') {
    return { background: '#dc2626', border: '#b91c1c' }
  }
  return { background: '#16a34a', border: '#15803d' }
}
