import type { StoredBookingStatus } from './calendarStatus'

export type ConfirmNonBookableEditPayload = {
  id: number
  clientIds: number[]
  groupId: number | null | undefined
  consultantId: number | null
  startTime: string
  endTime: string
  spaceId: number | null
  typeId: number | null
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
