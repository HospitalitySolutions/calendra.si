import { customerApi } from './api/customerApi'
import { MARKETING_BASE_URL } from './config'

export async function launchCustomerBooking(locationId: string | number, sessionTypeId?: string | number | null) {
  const handoff = await customerApi.bookingHandoff(locationId, sessionTypeId)
  const url = new URL(handoff.bookingUrl, MARKETING_BASE_URL)
  url.hash = new URLSearchParams({ customerHandoff: handoff.handoffToken }).toString()
  window.location.assign(url.toString())
}
