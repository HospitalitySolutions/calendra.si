import { customerApi } from './api/customerApi'
import { MARKETING_BASE_URL } from './config'

export async function launchCustomerBooking(locationId: string | number, sessionTypeId?: string | number | null) {
  const handoff = await customerApi.bookingHandoff(locationId, sessionTypeId)
  const bookingBaseUrl = window.location.hostname === 'staging.calendra.si'
    ? window.location.origin
    : MARKETING_BASE_URL
  const url = new URL(handoff.bookingUrl, bookingBaseUrl)
  url.hash = new URLSearchParams({ customerHandoff: handoff.handoffToken }).toString()
  window.location.assign(url.toString())
}
