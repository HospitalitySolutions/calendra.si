export type Role = 'ADMIN' | 'CONSULTANT' | 'SUPER_ADMIN'
export type PackageType = 'TRIAL' | 'BASIC' | 'PROFESSIONAL' | 'PREMIUM' | 'CUSTOM'

export type User = {
  id: number
  firstName: string
  lastName: string
  email: string
  role: Role
  consultant?: boolean
  companyId?: number
  /** Short public tenant identifier (e.g. widget URL segment); empty if not provisioned yet. */
  tenantCode?: string | null
  packageType?: PackageType
  avatarPath?: string | null
  permissions?: string[]
  createdAt?: string
  vatId?: string | null
  phone?: string | null
  whatsappSenderNumber?: string | null
  whatsappPhoneNumberId?: string | null
  workingHours?: WorkingHoursConfig | null
  spaces?: Space[]
  types?: SessionType[]
}

export type Client = {
  id: number
  firstName: string
  lastName: string
  email?: string | null
  phone?: string | null
  whatsappPhone?: string | null
  whatsappOptIn?: boolean
  viberUserId?: string | null
  viberConnected?: boolean
  guestAppLinked?: boolean
  anonymized?: boolean
  anonymizedAt?: string | null
  active?: boolean
  batchPaymentEnabled?: boolean
  assignedTo?: User | null
  billingCompany?: CompanySummary | null
  preferredSlots: PreferredSlot[]
  createdAt?: string
  updatedAt?: string
  /** True when upcoming/live bookings or usable wallet entitlements block deactivate/delete. */
  removalBlocked?: boolean
}

export type CompanySummary = {
  id: number
  name: string
  active?: boolean
  batchPaymentEnabled?: boolean
  address?: string | null
  postalCode?: string | null
  city?: string | null
  vatId?: string | null
  iban?: string | null
  email?: string | null
  telephone?: string | null
}

export type Company = CompanySummary & {
  createdAt?: string
  updatedAt?: string
}

export type ClientGroup = {
  id: number
  name: string
  email?: string | null
  active?: boolean
  batchPaymentEnabled?: boolean
  individualPaymentEnabled?: boolean
  billingCompany?: CompanySummary | null
  members?: Client[]
  createdAt?: string
  updatedAt?: string
}

export type StoredFile = {
  id: number
  fileName: string
  contentType?: string | null
  sizeBytes: number
  uploadedAt?: string | null
}

export type PreferredSlot = {
  id?: number
  dayOfWeek: DayOfWeek
  startTime: string
  endTime: string
}

export type Space = { id: number; name: string; description?: string; createdAt?: string }

export type TypeServiceLink = {
  id?: number
  transactionServiceId: number
  code: string
  description: string
  /** Net override on the type–service link (null = use transaction service net). */
  price: number | null
  /** Per-line gross for one unit, derived server-side for guest-card pricing. */
  unitGross?: number | null
}
export type SessionType = {
  id: number
  name: string
  description?: string
  active?: boolean
  durationMinutes?: number
  breakMinutes?: number
  maxParticipantsPerSession?: number | null
  groupBookingEnabled?: boolean
  widgetGroupBookingEnabled?: boolean
  guestBookingEnabled?: boolean
  priceCalculationMode?: 'PER_CLIENT' | 'TOTAL'
  guestLimitUserEmails?: string[]
  createdAt?: string
  linkedServices?: TypeServiceLink[]
}

export type BookableSlot = {
  id: number
  dayOfWeek: DayOfWeek
  startTime: string
  endTime: string
  consultant: User
  indefinite: boolean
  startDate?: string
  endDate?: string
  createdAt?: string
}

export type BookingPayee = {
  clientId: number
  payeeType: 'PERSON' | 'COMPANY' | string
  company?: CompanySummary | null
  companyId?: number | null
  customData?: boolean
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  companyName?: string | null
  address?: string | null
  city?: string | null
  postalCode?: string | null
  vatId?: string | null
  companyEmail?: string | null
}

export type BookingPaymentStatusValue = 'UNPAID' | 'PARTIALLY_PAID' | 'PAYMENT_PENDING' | 'PAID'

export type BookingPaymentAllocation = {
  source: 'INVOICE' | 'ENTITLEMENT' | string
  billId?: number | null
  billNumber?: string | null
  paymentMethod?: string | null
  paymentMethodType?: PaymentType | string | null
  paymentStatus?: string | null
  amountGross?: number | null
  paidAt?: string | null
  entitlementId?: number | null
  entitlementCode?: string | null
  entitlementType?: string | null
  productName?: string | null
  usedAt?: string | null
  scanSource?: string | null
}

export type BookingPaymentStatus = {
  clientId: number
  bookingId: number
  status: BookingPaymentStatusValue
  sessionTotalGross?: number | null
  paidGross?: number | null
  pendingGross?: number | null
  openBillId?: number | null
  allocations?: BookingPaymentAllocation[]
}

export type Booking = {
  id: number
  bookingGroupKey?: string
  client: Client
  clients?: Client[]
  consultant: User
  startTime: string
  endTime: string
  space?: Space
  type?: SessionType
  notes?: string
  meetingLink?: string
  meetingProvider?: string
  bookingStatus?: 'RESERVED' | 'CANCELLED' | 'NO_SHOW' | 'CONFIRMED'
  billedAt?: string | null
  groupId?: number | null
  sessionGroupEmailOverride?: string | null
  sessionGroupBillingCompany?: CompanySummary | null
  payees?: BookingPayee[]
  paymentStatuses?: BookingPaymentStatus[]
  createdAt?: string
}

export type BillingService = {
  id: number
  code: string
  description: string
  taxRate: TaxRate
  netPrice: number
  active?: boolean
  createdAt?: string
}

export type PaymentType = 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'OTHER' | 'ADVANCE'
export type PaymentSplit = {
  id?: number | null
  paymentMethod: PaymentMethod
  amountGross: number
  sourceAdvanceBillId?: number | null
}

export type PaymentMethod = {
  id: number
  name: string
  paymentType: PaymentType
  /** When true, bill creation sends the invoice to the fiscal service. */
  fiscalized: boolean
  /** When true, Stripe Checkout / payment link flow applies. */
  stripeEnabled: boolean
  /** When true, the method is shown in the guest-facing mobile app. */
  guestEnabled: boolean
  /** When true, the method is shown in the website booking widget. */
  widgetEnabled: boolean
  /** Optional display order for guest-facing payment methods. */
  guestDisplayOrder: number
  /** Product types this guest payment method can be used for. */
  allowedGuestProductTypes: string[]
}

/** Backward-compatible defaults when API omits flags (legacy responses). */
export function normalizePaymentMethod(
  pm: { id: number; name: string; paymentType: PaymentType; fiscalized?: boolean; stripeEnabled?: boolean; guestEnabled?: boolean; widgetEnabled?: boolean; guestDisplayOrder?: number; allowedGuestProductTypes?: string[] } | null | undefined,
): PaymentMethod | null {
  if (!pm) return null
  const defaultAllowed = pm.paymentType === 'BANK_TRANSFER'
    ? ['PACK', 'MEMBERSHIP', 'GIFT_CARD']
    : ['SESSION_SINGLE', 'CLASS_TICKET', 'PACK', 'MEMBERSHIP', 'GIFT_CARD']
  return {
    id: pm.id,
    name: pm.name,
    paymentType: pm.paymentType,
    fiscalized: typeof pm.fiscalized === 'boolean' ? pm.fiscalized : pm.paymentType !== 'CARD',
    stripeEnabled: typeof pm.stripeEnabled === 'boolean' ? pm.stripeEnabled : pm.paymentType === 'CARD',
    guestEnabled: typeof pm.guestEnabled === 'boolean' ? pm.guestEnabled : false,
    widgetEnabled: typeof pm.widgetEnabled === 'boolean' ? pm.widgetEnabled : (typeof pm.guestEnabled === 'boolean' ? pm.guestEnabled : false),
    guestDisplayOrder: typeof pm.guestDisplayOrder === 'number' ? pm.guestDisplayOrder : 0,
    allowedGuestProductTypes: Array.isArray(pm.allowedGuestProductTypes) && pm.allowedGuestProductTypes.length > 0
      ? pm.allowedGuestProductTypes
      : defaultAllowed,
  }
}

export type BillItem = {
  id: number
  transactionService: BillingService
  quantity: number
  netPrice: number
  grossPrice: number
  sourceSessionBookingId?: number | null
}

export type Bill = {
  id: number
  billNumber: string
  orderId?: string | null
  orderCounter?: number | null
  /** Fiscal document kind from API (`INVOICE` | `ADVANCE`). */
  billType?: 'INVOICE' | 'ADVANCE' | string | null
  sessionId?: number | null
  client?: Client | null
  recipientCompany?: CompanySummary | null
  billingTarget?: 'PERSON' | 'COMPANY'
  consultant: User
  paymentMethod?: PaymentMethod | null
  paymentSplits?: PaymentSplit[]
  issueDate: string
  totalNet: number
  totalGross: number
  pendingPaymentGross?: number | null
  paymentStatus?: 'open' | 'payment_pending' | 'paid' | 'cancelled'
  checkoutSessionId?: string | null
  paymentIntentId?: string | null
  stripeInvoiceId?: string | null
  stripeHostedInvoiceUrl?: string | null
  paidAt?: string | null
  fiscalStatus?: 'NOT_SENT' | 'SENT' | 'FAILED'
  fiscalZoi?: string | null
  fiscalEor?: string | null
  fiscalQr?: string | null
  fiscalMessageId?: string | null
  fiscalLastError?: string | null
  fiscalAttemptCount?: number | null
  refundOfBillId?: number | null
  refundReference?: string | null
  bankTransferReference?: string | null
  fiscalLogJson?: string | null
  items: BillItem[]
}

export type CompanyBillSummary = {
  id: number
  billNumber: string
  orderId?: string | null
  orderCounter?: number | null
  issueDate: string
  totalNet: number
  totalGross: number
  clientId?: number | null
  clientName?: string
  paymentStatus?: 'open' | 'payment_pending' | 'paid' | 'cancelled'
  fiscalStatus?: 'NOT_SENT' | 'SENT' | 'FAILED'
}

export type OpenBillItem = {
  id: number
  transactionService: BillingService
  quantity: number
  netPrice: number
  /** Gross unit price is the Billing source of truth; netPrice is derived from it for VAT/base. */
  grossPrice: number
  sourceSessionBookingId?: number | null
  sourceAdvanceBillId?: number | null
}

export type OpenBillSessionSummary = {
  sessionId: number
  sessionDisplayId?: string
  sessionInfo: string
  bookingGroupKey?: string | null
  lifecycleStatus?: 'RESERVED' | 'CANCELLED' | 'NO_SHOW' | 'ONGOING' | 'CHECKED_OUT' | string | null
  clientName?: string
  consultantName?: string
  totalNet?: number
  totalGross?: number
  lineItemCount?: number
}

export type OpenBill = {
  id: number
  sessionId?: number | null
  client?: { id: number; firstName: string; lastName: string; email?: string; phone?: string } | null
  consultant?: { id: number; firstName: string; lastName: string; email: string; role: Role } | null
  paymentMethod?: PaymentMethod | null
  paymentSplits?: PaymentSplit[]
  reference?: string | null
  discountType?: 'PERCENT' | 'AMOUNT' | string | null
  discountValue?: number | null
  discountAmountGross?: number | null
  discountedTotalGross?: number | null
  items: OpenBillItem[]
  sessionDisplayId?: string
  sessionInfo?: string
  batchScope?: 'NONE' | 'CLIENT' | 'COMPANY' | string
  batchTargetClientId?: number | null
  batchTargetCompanyId?: number | null
  billType?: 'INVOICE' | 'ADVANCE' | null
  bookingGroupKey?: string | null
  sessions?: OpenBillSessionSummary[]
}


export type InboxChannel = 'EMAIL' | 'WHATSAPP' | 'VIBER' | 'GUEST_APP'
export type InboxDirection = 'INBOUND' | 'OUTBOUND'
export type InboxStatus = 'SENT' | 'DELIVERED' | 'READ' | 'RECEIVED' | 'FAILED'

export type InboxThread = {
  clientId: number
  clientFirstName: string
  clientLastName: string
  clientEmail?: string | null
  clientPhone?: string | null
  lastChannel: InboxChannel
  lastDirection: InboxDirection
  lastStatus: InboxStatus
  lastSubject?: string | null
  lastPreview?: string | null
  lastSenderName?: string | null
  lastSenderPhone?: string | null
  lastSentAt?: string | null
  messageCount: number
  unreadCount?: number
}

export type MessageAttachment = {
  id: number
  clientFileId: number
  fileName: string
  contentType?: string | null
  sizeBytes: number
  uploadedAt?: string | null
}

export type ClientMessage = {
  id: number
  clientId: number
  clientFirstName: string
  clientLastName: string
  recipient: string
  channel: InboxChannel
  direction: InboxDirection
  status: InboxStatus
  subject?: string | null
  body: string
  externalMessageId?: string | null
  errorMessage?: string | null
  senderName?: string | null
  senderPhone?: string | null
  sentAt?: string | null
  createdAt: string
  attachments?: MessageAttachment[]
}

export type SettingsMap = Record<string, string>

export type DayOfWeek = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY'

export type WorkingHoursDay = { start: string; end: string }

/** Stored in users.workingHoursJson — intersects with company grid and bookable slots on the calendar. */
export type WorkingHoursConfig = {
  sameForAllDays: boolean
  allDays?: WorkingHoursDay | null
  byDay?: Partial<Record<DayOfWeek, WorkingHoursDay | null | undefined>>
}
export type TaxRate = 'VAT_0' | 'VAT_9_5' | 'VAT_22' | 'NO_VAT'

export const dayOptions: DayOfWeek[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']
export const taxLabels: Record<TaxRate, string> = {
  VAT_0: '0%',
  VAT_9_5: '9.5%',
  VAT_22: '22%',
  NO_VAT: 'NO VAT',
}
