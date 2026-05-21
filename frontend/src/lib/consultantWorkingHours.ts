import type { DayOfWeek, WorkingHoursConfig, WorkingHoursDay } from './types'

export type { WorkingHoursConfig }

const DAY_NAMES: DayOfWeek[] = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
]

/** Minutes from midnight for HH:mm or HH:mm:ss */
export function parseHmToMinutes(timeValue: string): number {
  const parts = timeValue.split(':').map((x) => Number(x) || 0)
  const hh = parts[0] ?? 0
  const mm = parts[1] ?? 0
  return hh * 60 + mm
}

function localMidnightMs(y: number, m0: number, d: number): number {
  return new Date(y, m0, d, 0, 0, 0, 0).getTime()
}

/**
 * Working window for a calendar day (local date parts), intersected with company grid [fallbackStartMin, fallbackEndMin).
 * Returns null if consultant has no custom hours (use full company window).
 * Returns { closed: true } if that day is non-working.
 */
export function consultantDayWindow(
  year: number,
  month0: number,
  day: number,
  consultantId: number | null | undefined,
  users: any[],
  fallbackStartMin: number,
  fallbackEndMin: number,
): { closed: true } | { closed?: false; startMin: number; endMin: number } | null {
  if (!Number.isFinite(consultantId as number)) return null
  const u = (users || []).find((x: any) => x.id === consultantId)
  const wh = u?.workingHours as WorkingHoursConfig | null | undefined
  if (!wh || typeof wh !== 'object') return null

  const dow = DAY_NAMES[new Date(year, month0, day).getDay()]
  let slot: WorkingHoursDay | null | undefined
  if (wh.sameForAllDays) {
    slot = wh.allDays ?? undefined
    if (slot == null) return { closed: true }
  } else {
    slot = wh.byDay?.[dow] as WorkingHoursDay | null | undefined
    if (slot == null) return { closed: true }
  }

  const sm = parseHmToMinutes(String(slot.start || '00:00'))
  const em = parseHmToMinutes(String(slot.end || '00:00'))
  if (em <= sm) return { closed: true }

  const startMin = Math.max(sm, fallbackStartMin)
  const endMin = Math.min(em, fallbackEndMin)
  if (endMin <= startMin) return { closed: true }
  return { startMin, endMin }
}

export function windowToDayMs(
  year: number,
  month0: number,
  day: number,
  startMin: number,
  endMin: number,
): { startMs: number; endMs: number } {
  const base = localMidnightMs(year, month0, day)
  return {
    startMs: base + startMin * 60_000,
    endMs: base + endMin * 60_000,
  }
}

/** Clip [segStart, segEnd] to consultant working window; drops if no overlap. */
export function clipSegmentToConsultantWindow(
  segStartMs: number,
  segEndMs: number,
  year: number,
  month0: number,
  day: number,
  consultantId: number | null | undefined,
  users: any[],
  fallbackStartMin: number,
  fallbackEndMin: number,
): Array<{ startMs: number; endMs: number }> {
  const w = consultantDayWindow(year, month0, day, consultantId, users, fallbackStartMin, fallbackEndMin)
  if (w == null) {
    return segEndMs > segStartMs ? [{ startMs: segStartMs, endMs: segEndMs }] : []
  }
  if (w.closed) return []
  const { startMs, endMs } = windowToDayMs(year, month0, day, w.startMin, w.endMin)
  const s = Math.max(segStartMs, startMs)
  const e = Math.min(segEndMs, endMs)
  if (e <= s) return []
  return [{ startMs: s, endMs: e }]
}
