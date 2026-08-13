import { apiFetch } from './client'
import type {
  CustomerBooking,
  CustomerHome,
  CustomerWallet,
  GuestSession,
  GuestUser,
  InboxThread,
  MessageView,
  NotificationsResponse,
  ProfileSettings,
  PublicLocation,
  SignupChallenge,
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

  forgotPassword(email: string) {
    return apiFetch<{ message: string }>('/api/guest/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email, locale: 'sl', language: 'sl' }),
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
