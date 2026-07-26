import type { StoredBookingStatus } from './calendarStatus'

export type CalendarServiceDraft = {
  /** Selected session type. Null keeps a legacy untyped booking possible. */
  typeId: number | null
  /** Space is selected per service segment. */
  spaceId: number | null
  /** Existing child-row id, when editing a persisted booking. */
  id?: number | null
}

export type CalendarServiceSegment = CalendarServiceDraft & {
  position: number
  startTime: string
  endTime: string
  availabilityEndTime: string
  durationMinutes: number
  breakMinutes: number
  grossPrice: number | null
}

export type CalendarServiceChain = {
  drafts: CalendarServiceDraft[]
  segments: CalendarServiceSegment[]
  endTime: string
  availabilityEndTime: string
  totalServiceMinutes: number
  totalInternalBreakMinutes: number
  totalBreakMinutes: number
  totalSpanMinutes: number
  totalGross: number | null
}

export type ConfirmNonBookableEditPayload = {
  id: number
  clientIds: number[]
  groupId: number | null | undefined
  consultantId: number | null
  startTime: string
  endTime: string
  spaceId: number | null
  typeId: number | null
  services?: Array<{ typeId: number; position: number; spaceId: number | null }>
  notes: string
  online: boolean
  meetingLink: string | null
  meetingProvider: string | null
  recurrenceSeriesKey?: string | null
  bookingStatus?: StoredBookingStatus
  payees?: Array<{ clientId: number; payeeType: 'PERSON' | 'COMPANY' | string; companyId?: number | null; customData?: boolean; firstName?: string | null; lastName?: string | null; email?: string | null; companyName?: string | null; address?: string | null; city?: string | null; postalCode?: string | null; vatId?: string | null; companyEmail?: string | null }>
}

export type ConfirmNonBookableState =
  | { mode: 'create'; pastTime?: boolean }
  | { mode: 'edit'; editPayload: ConfirmNonBookableEditPayload; pastTime?: boolean }
