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
  anonymized?: boolean
  anonymizedAt?: string | null
  active?: boolean
  batchPaymentEnabled?: boolean
  assignedTo: User
  billingCompany?: CompanySummary | null
  preferredSlots: PreferredSlot[]
  createdAt?: string
  updatedAt?: string
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

export type TypeServiceLink = { id?: number; transactionServiceId: number; code: string; description: string; price: number | null }
export type SessionType = {
  id: number
  name: string
  description?: string
  durationMinutes?: number
  breakMinutes?: number
  maxParticipantsPerSession?: number | null
  widgetGroupBookingEnabled?: boolean
  guestBookingEnabled?: boolean
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
  groupId?: number | null
  createdAt?: string
}

export type BillingService = {
  id: number
  code: string
  description: string
  taxRate: TaxRate
  netPrice: number
  createdAt?: string
}

export type PaymentType = 'CASH' | 'CARD' | 'BANK_TRANSFER'
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
  /** Optional display order for guest-facing payment methods. */
  guestDisplayOrder: number
}

/** Backward-compatible defaults when API omits flags (legacy responses). */
export function normalizePaymentMethod(
  pm: { id: number; name: string; paymentType: PaymentType; fiscalized?: boolean; stripeEnabled?: boolean; guestEnabled?: boolean; guestDisplayOrder?: number } | null | undefined,
): PaymentMethod | null {
  if (!pm) return null
  return {
    id: pm.id,
    name: pm.name,
    paymentType: pm.paymentType,
    fiscalized: typeof pm.fiscalized === 'boolean' ? pm.fiscalized : pm.paymentType !== 'CARD',
    stripeEnabled: typeof pm.stripeEnabled === 'boolean' ? pm.stripeEnabled : pm.paymentType === 'CARD',
    guestEnabled: typeof pm.guestEnabled === 'boolean' ? pm.guestEnabled : false,
    guestDisplayOrder: typeof pm.guestDisplayOrder === 'number' ? pm.guestDisplayOrder : 0,
  }
}

export type BillItem = {
  id: number
  transactionService: BillingService
  quantity: number
  netPrice: number
  grossPrice: number
}

export type Bill = {
  id: number
  billNumber: string
  sessionId?: number | null
  client?: Client | null
  recipientCompany?: CompanySummary | null
  billingTarget?: 'PERSON' | 'COMPANY'
  consultant: User
  paymentMethod?: PaymentMethod | null
  issueDate: string
  totalNet: number
  totalGross: number
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
  fiscalLogJson?: string | null
  items: BillItem[]
}

export type CompanyBillSummary = {
  id: number
  billNumber: string
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
  sourceSessionBookingId?: number | null
}

export type OpenBillSessionSummary = {
  sessionId: number
  sessionDisplayId?: string
  sessionInfo: string
  clientName?: string
  consultantName?: string
}

export type OpenBill = {
  id: number
  sessionId?: number | null
  client?: { id: number; firstName: string; lastName: string; email?: string; phone?: string } | null
  consultant?: { id: number; firstName: string; lastName: string; email: string; role: Role } | null
  paymentMethod?: PaymentMethod | null
  items: OpenBillItem[]
  sessionDisplayId?: string
  sessionInfo?: string
  batchScope?: 'NONE' | 'CLIENT' | 'COMPANY' | string
  batchTargetClientId?: number | null
  batchTargetCompanyId?: number | null
  sessions?: OpenBillSessionSummary[]
}


export type InboxChannel = 'EMAIL' | 'WHATSAPP' | 'VIBER'
export type InboxDirection = 'INBOUND' | 'OUTBOUND'
export type InboxStatus = 'SENT' | 'RECEIVED' | 'FAILED'

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
