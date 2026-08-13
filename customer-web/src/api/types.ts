export type GuestUser = {
  id: string
  email: string
  firstName: string
  lastName: string
  phone?: string | null
  language?: string | null
  profilePicturePath?: string | null
}

export type GuestSession = {
  token: string
  guestUser: GuestUser
  linkedTenants: unknown[]
}

export type SignupChallenge = {
  challengeId: string
  email: string
  expiresAt: string
}

export type Provider = {
  companyId: string
  companyName: string
  logoUrl?: string | null
  locationId?: string | null
  locationName?: string | null
  locationAddress?: string | null
}

export type BookingService = {
  sessionTypeId: string
  name: string
  position: number
  durationMinutes: number
  startsAt?: string | null
  endsAt?: string | null
  priceGross: number
  currency?: string | null
}

export type CustomerBooking = {
  bookingId: string
  provider: Provider
  sessionTypeId?: string | null
  sessionTypeName?: string | null
  startsAt: string
  endsAt?: string | null
  bookingStatus: string
  consultantName?: string | null
  services: BookingService[]
  totalDurationMinutes: number
  totalPriceGross: number
  currency?: string | null
  paymentStatus?: string | null
}

export type Entitlement = {
  entitlementId: string
  productName: string
  entitlementType: string
  entitlementCode?: string | null
  remainingUses?: number | null
  visitCount?: number | null
  totalUses?: number | null
  validUntil?: string | null
  validityDays?: number | null
  status: string
  sessionTypeId?: string | null
  sessionTypeName?: string | null
  autoRenews: boolean
  displayCode?: string | null
  priceGross?: number | null
  remainingValueGross?: number | null
  voucherFaceValueGross?: number | null
  voucherRedemptionMode?: string | null
  voucherServiceScope?: string | null
  voucherSessionTypeIds?: string[] | null
  voucherSessionTypeNames?: string[] | null
  currency?: string | null
  accessUrl?: string | null
  availableAllLocations: boolean
  locationIds?: string[] | null
  locationNames?: string[] | null
}

export type WalletEntitlement = {
  provider: Provider
  entitlement: Entitlement
}

export type WalletOrder = {
  provider: Provider
  orderId: string
  status: string
  paymentMethodType?: string | null
  totalGross: number
  currency?: string | null
  paidAt?: string | null
  createdAt: string
  referenceCode?: string | null
  productName?: string | null
  productType?: string | null
}

export type CustomerWallet = {
  entitlements: WalletEntitlement[]
  orders: WalletOrder[]
}

export type CustomerNotification = {
  notificationId: string
  provider?: Provider | null
  notificationType: string
  title: string
  body: string
  readAt?: string | null
  createdAt: string
  payloadJson?: string | null
}

export type NotificationsResponse = {
  items: CustomerNotification[]
  unreadCount: number
}

export type InboxThread = {
  provider: Provider
  clientId: number
  threadKey: string
  clientFirstName?: string | null
  clientLastName?: string | null
  lastPreview?: string | null
  lastSenderName?: string | null
  lastSentAt?: string | null
  messageCount: number
  unreadCount: number
}

export type CustomerHome = {
  nextBooking?: CustomerBooking | null
  upcomingBookings: CustomerBooking[]
  activeEntitlements: WalletEntitlement[]
  recentProviders: Provider[]
  unreadNotificationCount: number
  unreadInboxCount: number
}

export type PublicLocation = {
  locationId: number
  slug: string
  tenantSlug: string
  publiclyDiscoverable: boolean
  publicName: string
  publicDescription?: string | null
  logoUrl?: string | null
  physicalAddress?: {
    address?: string | null
    postalCode?: string | null
    city?: string | null
    country?: string | null
  } | null
  publicAddress?: string | null
  publicPhone?: string | null
  category?: string | null
  publicBookingEnabled: boolean
  bookingUrl?: string | null
  googleRating?: number | null
  googleReviewCount?: number | null
  googleMapsUri?: string | null
}

export type ProfileSettings = {
  guestUser: GuestUser
  companyId?: string | null
  companyName?: string | null
  linkedCompanyId?: string | null
  linkedCompanyName?: string | null
  batchPaymentEnabled: boolean
  notifyMessagesEnabled: boolean
  notifyRemindersEnabled: boolean
  notifyReminderMinutes: number
  linkedCompanyOptions: { id: string; name: string }[]
  invoiceSettings?: unknown
}

export type MessageView = {
  id?: number | string
  messageId?: number | string
  body?: string | null
  senderName?: string | null
  senderType?: string | null
  direction?: string | null
  sentAt?: string | null
  createdAt?: string | null
  attachments?: unknown[]
  [key: string]: unknown
}
