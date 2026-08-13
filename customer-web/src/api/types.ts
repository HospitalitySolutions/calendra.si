
export type BookingHandoff = {
  handoffToken: string
  expiresAt: string
  bookingUrl: string
  companyId: string
  companyName: string
  locationId: string
  locationName: string
}

export type AvailabilitySlot = {
  slotId: string
  startsAt: string
  endsAt: string
  available: boolean
}

export type AvailabilityResponse = {
  sessionTypeId: string
  date: string
  slots: AvailabilitySlot[]
  sessionTypeIds?: string[]
  totalDurationMinutes?: number
  estimatedPriceGross?: number
  currency?: string
}

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
  latitude?: number | null
  longitude?: number | null
  distanceKm?: number | null
}

export type NearbyLocationSearchResponse = {
  query: string
  resolvedAddress: string
  latitude: number
  longitude: number
  radiusKm?: number | null
  locations: PublicLocation[]
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

export type CustomerProduct = {
  productId: string
  name: string
  productType: string
  priceGross: number
  currency: string
  sessionTypeId?: string | null
  sessionTypeName?: string | null
  bookable: boolean
  description?: string | null
  durationMinutes?: number | null
  promoText?: string | null
  validityDays?: number | null
  usageLimit?: number | null
  voucherRedemptionMode?: string | null
  voucherServiceScope?: string | null
  voucherFaceValueGross?: number | null
  voucherSessionTypeIds?: string[] | null
  voucherSessionTypeNames?: string[] | null
}

export type CommerceCatalog = {
  provider: Provider
  products: CustomerProduct[]
  acceptedPaymentMethods: string[]
}

export type PublicStorefrontService = {
  id: number
  name: string
  description?: string | null
  durationMinutes?: number | null
  priceLabel?: string | null
  priceGross?: number | null
  maxParticipantsPerSession?: number | null
  groupBooking: boolean
  serviceGroupId?: number | null
  serviceGroupName?: string | null
  serviceGroupSortOrder?: number | null
  serviceSortOrder: number
}

export type PublicStorefrontProduct = {
  productId: string
  name: string
  productType: string
  priceGross: number
  currency: string
  description?: string | null
  promoText?: string | null
  validityDays?: number | null
  usageLimit?: number | null
  bookable: boolean
  voucherFaceValueGross?: number | null
  voucherSessionTypeNames?: string[] | null
}

export type PublicStorefront = {
  location: PublicLocation
  services: PublicStorefrontService[]
  products: PublicStorefrontProduct[]
  team: { id: number; name: string }[]
}

export type CreateOrderResponse = {
  order: {
    orderId: string
    status: string
    paymentMethodType: string
    subtotalGross: number
    taxAmount: number
    totalGross: number
    currency: string
  }
  booking?: unknown | null
  nextAction: string
}

export type CheckoutResponse = {
  orderId: string
  paymentMethodType: string
  status: string
  checkoutUrl?: string | null
  bankTransfer?: {
    amount: number
    currency: string
    referenceCode: string
    instructions: string
  } | null
  nextAction: string
  merchantDisplayName?: string | null
}
