import { apiFetch } from './client'
import type {
  AvailabilityResponse,
  BookingHandoff,
  CommerceCatalog,
  CreateOrderResponse,
  CheckoutResponse,
  CustomerBooking,
  CustomerHome,
  CustomerWallet,
  GuestSession,
  GuestUser,
  InboxThread,
  MessageView,
  NearbyPublicLocationSearch,
  NotificationsResponse,
  ProfileSettings,
  PublicLocation,
  PublicStorefront,
  SignupChallenge,
  WalletOrder,
} from './types'

export const customerApi = {
  login(email: string, password: string) {
    return apiFetch<GuestSession>('/api/guest/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }, { auth: false })
  },

  signupStart(payload: { email: string; password: string; firstName: string; lastName: string; phone?: string; language: string }) {
    return apiFetch<SignupChallenge>('/api/guest/auth/signup/start', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { auth: false })
  },

  signupVerify(challengeId: string, code: string) {
    return apiFetch<GuestSession>('/api/guest/auth/signup/verify-code', {
      method: 'POST',
      body: JSON.stringify({ challengeId, code }),
    }, { auth: false })
  },

  signupResend(challengeId: string) {
    return apiFetch<SignupChallenge>('/api/guest/auth/signup/resend-code', {
      method: 'POST',
      body: JSON.stringify({ challengeId }),
    }, { auth: false })
  },

  forgotPassword(email: string, language: string = 'sl') {
    return apiFetch<{ message: string }>('/api/guest/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email, locale: language, language }),
    }, { auth: false })
  },

  verifyResetCode(email: string, code: string) {
    return apiFetch<{ verified: boolean; email: string; resetToken: string }>('/api/guest/auth/forgot-password/verify-code', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    }, { auth: false })
  },

  resetPassword(token: string, password: string) {
    return apiFetch<{ message: string }>('/api/guest/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }, { auth: false })
  },

  me() {
    return apiFetch<{ guestUser: GuestUser; linkedTenants: unknown[] }>('/api/guest/me')
  },

  home() {
    return apiFetch<CustomerHome>('/api/customer/v1/home')
  },

  bookingHandoff(locationId: string | number, sessionTypeId?: string | number | null) {
    return apiFetch<BookingHandoff>('/api/customer/v1/booking-handoffs', {
      method: 'POST',
      body: JSON.stringify({
        locationId: String(locationId),
        sessionTypeId: sessionTypeId == null || String(sessionTypeId).trim() === '' ? null : String(sessionTypeId),
      }),
    })
  },

  availability(companyId: string, sessionTypeId: string, date: string, locationId?: string | null) {
    const params = new URLSearchParams({ companyId, sessionTypeId, date })
    if (locationId) params.set('locationId', locationId)
    return apiFetch<AvailabilityResponse>(`/api/guest/availability?${params.toString()}`)
  },

  rescheduleBooking(id: string, newSlotId: string) {
    return apiFetch<unknown>(`/api/guest/bookings/${encodeURIComponent(id)}/reschedule`, {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ newSlotId }),
    })
  },

  bookings(status: 'upcoming' | 'past' | 'cancelled') {
    return apiFetch<CustomerBooking[]>(`/api/customer/v1/bookings?status=${encodeURIComponent(status)}&size=100`)
  },

  booking(id: string) {
    return apiFetch<CustomerBooking>(`/api/customer/v1/bookings/${encodeURIComponent(id)}`)
  },

  cancelBooking(id: string, reason?: string) {
    return apiFetch<unknown>(`/api/guest/bookings/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ reason: reason || null }),
    })
  },

  wallet() {
    return apiFetch<CustomerWallet>('/api/customer/v1/wallet?size=100')
  },

  notifications() {
    return apiFetch<NotificationsResponse>('/api/customer/v1/notifications?size=100')
  },

  markNotificationRead(id: string) {
    return apiFetch<unknown>(`/api/customer/v1/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' })
  },

  markAllNotificationsRead() {
    return apiFetch<unknown>('/api/customer/v1/notifications/read-all', { method: 'POST' })
  },

  inboxThreads() {
    return apiFetch<InboxThread[]>('/api/customer/v1/inbox/threads?size=100')
  },

  messages(companyId: string) {
    return apiFetch<MessageView[]>(`/api/guest/inbox/messages?companyId=${encodeURIComponent(companyId)}&size=100`)
  },

  sendMessage(companyId: string, body: string) {
    return apiFetch<MessageView>('/api/guest/inbox/messages', {
      method: 'POST',
      body: JSON.stringify({ companyId, body, attachmentFileIds: [] }),
    })
  },

  providers() {
    return apiFetch<PublicLocation[]>('/api/public/location-directory', {}, { auth: false })
  },

  nearbyProviders(address: string, limit = 100) {
    const params = new URLSearchParams({ address, limit: String(limit) })
    return apiFetch<NearbyPublicLocationSearch>(`/api/public/location-directory/nearby?${params.toString()}`, {}, { auth: false })
  },

  storefront(slug: string) {
    return apiFetch<PublicStorefront>(`/api/public/storefront/${encodeURIComponent(slug)}`, {}, { auth: false })
  },

  commerceCatalog(locationId: string | number) {
    return apiFetch<CommerceCatalog>(`/api/customer/v1/commerce/locations/${encodeURIComponent(String(locationId))}`)
  },

  createCommerceOrder(payload: { locationId: string | number; productId: string; paymentMethodType: string; locale?: string }) {
    return apiFetch<CreateOrderResponse>('/api/customer/v1/commerce/orders', {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({
        locationId: String(payload.locationId),
        productId: payload.productId,
        paymentMethodType: payload.paymentMethodType,
        locale: payload.locale || 'sl',
      }),
    })
  },

  checkoutCommerceOrder(orderId: string, paymentMethodType: string, locale = 'sl') {
    return apiFetch<CheckoutResponse>(`/api/customer/v1/commerce/orders/${encodeURIComponent(orderId)}/checkout`, {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ paymentMethodType, locale }),
    })
  },

  commerceOrder(orderId: string) {
    return apiFetch<WalletOrder>(`/api/customer/v1/commerce/orders/${encodeURIComponent(orderId)}`)
  },

  cancelCommerceCheckout(orderId: string, options: { sessionId?: string | null } = {}) {
    const params = new URLSearchParams()
    if (options.sessionId) params.set('session_id', options.sessionId)
    const query = params.toString()
    const suffix = query ? `?${query}` : ''
    return apiFetch<WalletOrder>(`/api/customer/v1/commerce/orders/${encodeURIComponent(orderId)}/cancel${suffix}`, { method: 'POST' })
  },

  profileSettings() {
    return apiFetch<ProfileSettings>('/api/guest/profile/settings')
  },

  updateProfile(payload: Record<string, unknown>) {
    return apiFetch<ProfileSettings>('/api/guest/profile/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  },

  async uploadProfilePicture(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    return apiFetch<ProfileSettings>('/api/guest/profile/picture', { method: 'POST', body: formData })
  },
}
