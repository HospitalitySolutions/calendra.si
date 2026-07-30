export const CALENDAR_TIME_SCALE_MINUTES_KEY = 'CALENDAR_TIME_SCALE_MINUTES'

export type CalendarTimeScaleMinutes = 30 | 60

export function normalizeCalendarTimeScaleMinutes(value: unknown): CalendarTimeScaleMinutes {
  return Number(value) === 60 ? 60 : 30
}
