import { api } from '../api'

type BookingRealtimePayload = {
  bookingId?: number
  companyId?: number
  startTime?: string
  endTime?: string
  kind?: string
}

const RECONNECT_DELAY_MS = 2000

export function subscribeBookingUpdates(onBookingUpdated: (payload: BookingRealtimePayload) => void): () => void {
  let source: EventSource | null = null
  let reconnectTimer: number | null = null
  let closed = false

  const clearReconnect = () => {
    if (reconnectTimer != null) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  const connect = () => {
    if (closed) return
    const streamUrl = api.getUri({ url: '/bookings/stream' })
    source = new EventSource(streamUrl, { withCredentials: true })

    source.addEventListener('booking-updated', (event) => {
      try {
        const payload = JSON.parse(String((event as MessageEvent).data || '{}')) as BookingRealtimePayload
        onBookingUpdated(payload)
      } catch {
        // Ignore malformed payloads.
      }
    })

    source.onerror = () => {
      source?.close()
      source = null
      if (closed) return
      clearReconnect()
      reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS)
    }
  }

  connect()

  return () => {
    closed = true
    clearReconnect()
    source?.close()
    source = null
  }
}

