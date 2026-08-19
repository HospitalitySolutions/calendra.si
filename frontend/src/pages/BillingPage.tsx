import '../styles/features/service-type-tabs.css'
import '../styles/features/clients-and-detail.css'
import '../styles/features.booking.css'
import '../styles/features/booking-side-panel.css'
import '../styles/features/modern-clients.css'
import { DesktopSelect } from '../components/DesktopSelect'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser'
import { api } from '../api'
import { clientMutationErrorMessage, skipConflictToastHeaders } from '../lib/clientErrors'
import { useAuthenticatedUser } from '../authUserContext'
import type { Bill, BillingService, Booking, Client, Company, InvoiceIssuerOption, InvoiceSeriesOption, Location, OpenBill, PaymentMethod, PaymentSplit, SessionType, User, WorkspaceBill } from '../lib/types'
import { normalizePaymentMethod } from '../lib/types'
import { Card, EmptyState, Field } from '../components/ui'
import { useToast } from '../components/Toast'
import { useLocale, type AppLocale } from '../locale'
import { ConfirmDialog, PanelBody, PanelButton, PanelFooter, PanelHeader, PanelMenuItem, PanelOverflowMenu, PanelTabs, SidePanel, useConfirm } from '../components/panel'
import { GuestConfigSaveIcon } from '../components/GuestConfigSaveIcon'
import { BILLING_DRAWERS, buildDrawerUrl, useDrawerRoute } from '../lib/drawerRoutes'
import { canIssueAdvanceInvoices, canIssueOpenInvoices, canIssueRefundInvoices } from '../lib/employeePermissions'
import { useMobileKeyboardOpen } from '../hooks/useMobileKeyboardOpen'
import { DEFAULT_INVOICE_PRINT_FORMAT_KEY, normalizeInvoicePrintPreference, type InvoicePrintFormat } from '../lib/invoicePrintFormat'
import { acquirePosPrinterPort, buildPosReceiptEscPosBytes, directPosPrintingEnabled, getWebSerialApi, readPosPrintingPreferences, sendEscPosBytes, type PosReceiptLayout, type PosReceiptPrintRequest, type WebSerialPortLike } from '../lib/posPrinter'
import { SimpleClientCreatePage } from './clients/SimpleClientCreatePage'
import { isWorkspaceRolloutEnabled } from '../lib/workspaceRollout'
import { useSelectedLocationId } from '../lib/locationContext'
import {
  billingServicesQueryOptions,
  clientOptionsQueryOptions,
  invoiceIssuersQueryOptions,
  invoiceSeriesQueryOptions,
  locationsQueryOptions,
  paymentMethodsQueryOptions,
  settingsQueryOptions,
  usersQueryOptions,
} from '../queries/sharedQueryOptions'
import {
  billingEditorBookingsQueryOptions,
  billingEditorCompaniesQueryOptions,
  billingSummaryQueryOptions,
  billsPageQueryOptions,
  giftCardsPageQueryOptions,
  openBillQueryOptions,
  openBillsQueryOptions,
  unusedAdvancesPageQueryOptions,
  unusedAdvancesQueryOptions,
  type BillingHistoryStats,
  type BillingSummary,
  type GiftCardStats,
} from '../queries/billingQueryOptions'
import { calendarTypesQueryOptions } from '../queries/calendarQueryOptions'
import { queryKeys } from '../queries/queryKeys'
import '../styles/main/billing-tabs.css'
import '../styles/main/billing-open-bill-popup.css'
import '../styles/main/billing-batch-payment.css'
import '../styles/main/billing-pos-editor.css'

/** POS-style entry: typed digits are minor units (new digits append on the right), e.g. "55" → €0.55, "555" → €5.55. */
const MAX_CASH_REGISTER_DIGITS = 12

function cashRegisterDigitsFromRaw(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, MAX_CASH_REGISTER_DIGITS)
}

function formatCashRegisterAmount(amount: number, locale: AppLocale): string {
  return amount.toLocaleString(locale === 'sl' ? 'sl-SI' : 'en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Backend placeholder for session summary when the open bill was created manually (see {@code BillingController}). */
const MANUAL_OPEN_BILL_BACKEND_LABEL = 'Manual open bill'

/** Sentinel range for invoice-editor lines added manually in the UI.
 * These rows must stay separate from booked-session rows and must not show a specific client in the Client column.
 */
const MANUAL_OPEN_BILL_LINE_SOURCE_ID_LIMIT = -900_000_000_000

function createManualOpenBillLineSourceId(): number {
  return MANUAL_OPEN_BILL_LINE_SOURCE_ID_LIMIT - Date.now() - Math.floor(Math.random() * 1000)
}

function isManualOpenBillLineSourceId(value: number | null | undefined): boolean {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric <= MANUAL_OPEN_BILL_LINE_SOURCE_ID_LIMIT
}

/** Billing list tabs: rows per page (folio history, open payments, unused advances). */
const BILLING_LIST_PAGE_SIZE = 10

function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timeout)
  }, [value, delayMs])
  return debounced
}

/** Negative ids mark manual open-bill slots (backend uses {@code -manualNo}); display {@code #M2} like open bills. */
function formatBillingSessionIdDisplay(sessionId: number | null | undefined): string {
  if (sessionId == null) return '—'
  if (sessionId < 0) return `#M${-sessionId}`
  return `#${sessionId}`
}

function displayInvoiceOrderId(bill: Pick<Bill, 'id' | 'orderId'>): string {
  return bill.orderId?.trim() || `PAY-${String(bill.id).padStart(4, '0')}`
}

function billingTaxMultiplier(taxRate: BillingService['taxRate'] | null | undefined): number {
  if (taxRate === 'VAT_22') return 0.22
  if (taxRate === 'VAT_9_5') return 0.095
  return 0
}

function grossStringFromService(service: BillingService | null | undefined): string {
  if (!service) return '0.00'
  return (Number(service.netPrice || 0) * (1 + billingTaxMultiplier(service.taxRate))).toFixed(2)
}

import { currency, formatDate, fullName } from '../lib/format'

const BANK_TRANSFER_QR_SETTINGS_MISSING_PREFIX = 'BANK_TRANSFER_QR_SETTINGS_MISSING:'
const STRIPE_SETUP_REQUIRED_PREFIX = 'STRIPE_SETUP_REQUIRED:'
const BANK_TRANSFER_QR_SETTING_KEYS = ['COMPANY_NAME', 'COMPANY_ADDRESS', 'COMPANY_POSTAL_CODE', 'COMPANY_CITY', 'COMPANY_IBAN'] as const

type BankTransferQrSettingKey = typeof BANK_TRANSFER_QR_SETTING_KEYS[number]
type BankTransferQrMissingModal = { missingKeys: BankTransferQrSettingKey[]; rawMessage?: string }
type StripeSetupMissingModal = { rawMessage?: string }
type InvoicePdfAction = 'download' | 'print'
type PrintableBillRef = Partial<Bill> & { id: number; billNumber?: string | null }

function escapePdfWindowHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const BANK_TRANSFER_QR_FIELD_LABELS: Record<BankTransferQrSettingKey, { sl: string; sr: string; en: string }> = {
  COMPANY_NAME: { sl: 'Naziv podjetja', sr: 'Naziv kompanije', en: 'Company name' },
  COMPANY_ADDRESS: { sl: 'Naslov podjetja', sr: 'Adresa kompanije', en: 'Company address' },
  COMPANY_POSTAL_CODE: { sl: 'Poštna številka', sr: 'Poštanski broj', en: 'Postal code' },
  COMPANY_CITY: { sl: 'Mesto', sr: 'Grad', en: 'City' },
  COMPANY_IBAN: { sl: 'IBAN', sr: 'IBAN', en: 'IBAN' },
}

function readBillingApiMessage(error: any): string {
  const data = error?.response?.data
  if (typeof data === 'string') return data
  if (typeof data?.message === 'string' && data.message.trim()) return data.message
  if (typeof data?.error === 'string' && data.error.trim()) return data.error
  if (typeof error?.message === 'string' && error.message.trim()) return error.message
  return ''
}

function extractMissingBankTransferQrKeys(error: any): BankTransferQrSettingKey[] {
  const candidates = [
    error?.response?.data?.message,
    error?.response?.data?.error,
    error?.response?.data,
    error?.message,
  ]
    .filter((entry) => typeof entry === 'string')
    .map((entry) => String(entry))

  const found = new Set<BankTransferQrSettingKey>()
  for (const candidate of candidates) {
    const idx = candidate.indexOf(BANK_TRANSFER_QR_SETTINGS_MISSING_PREFIX)
    if (idx >= 0) {
      const tail = candidate.slice(idx + BANK_TRANSFER_QR_SETTINGS_MISSING_PREFIX.length)
      BANK_TRANSFER_QR_SETTING_KEYS.forEach((key) => {
        if (tail.includes(key)) found.add(key)
      })
    }
  }
  if (found.size > 0) return Array.from(found)

  const haystack = candidates.join(' ').toLowerCase()
  const legacyMatches: Array<[BankTransferQrSettingKey, string[]]> = [
    ['COMPANY_NAME', ['company name', 'naziv podjetja']],
    ['COMPANY_ADDRESS', ['company address', 'naslov podjetja', 'naslov']],
    ['COMPANY_POSTAL_CODE', ['company postal code', 'postal code', 'poštna številka', 'postna stevilka']],
    ['COMPANY_CITY', ['company city', 'mesto']],
    ['COMPANY_IBAN', ['company iban', 'iban']],
  ]
  legacyMatches.forEach(([key, tokens]) => {
    if (tokens.some((token) => haystack.includes(token))) found.add(key)
  })
  return Array.from(found)
}

function isStripeSetupMissingError(error: any): boolean {
  const message = readBillingApiMessage(error)
  const haystack = [
    message,
    error?.response?.data?.message,
    error?.response?.data?.error,
    error?.response?.data,
    error?.message,
  ]
    .filter((entry) => typeof entry === 'string')
    .join(' ')
    .toLowerCase()
  return haystack.includes(STRIPE_SETUP_REQUIRED_PREFIX.toLowerCase())
    || haystack.includes('stripe connect is not ready')
    || haystack.includes('finish onboarding first')
    || haystack.includes('stripe is not configured')
    || haystack.includes('stripe secret key is not configured')
    || haystack.includes('stripe payments are disabled for this tenant')
}

function cleanStripeSetupMessage(message: string): string {
  const value = (message || '').trim()
  if (!value) return ''
  const idx = value.indexOf(STRIPE_SETUP_REQUIRED_PREFIX)
  return (idx >= 0 ? value.slice(idx + STRIPE_SETUP_REQUIRED_PREFIX.length) : value).trim()
}

type DiscountType = 'PERCENT' | 'AMOUNT'
type PosCatalogTab = 'services' | 'benefits' | 'giftCards'

type LineItemDiscountDraft = { type: DiscountType; value: string }

type DiscountDraft = { wholeBillPercent: string; itemDiscounts: Record<number, LineItemDiscountDraft> }

type BillForm = {
  clientId?: number
  consultantId?: number
  paymentMethodId?: number
  bankTransferReference?: string
  billingTarget: 'PERSON' | 'COMPANY'
  recipientCompanyId?: number
  billType: BillDocumentType
  sessionId?: number
  legalEntityId?: number
  invoiceSeriesId?: number
  locationId?: number
  paymentSplits?: OpenBillPaymentSplitDraft[]
  discountType?: DiscountType
  discountValue?: string
  discountItemIndex?: number
  wholeBillDiscountPercent?: string
  itemDiscounts?: Record<number, LineItemDiscountDraft>
  items: { transactionServiceId: number; quantity: number; netPrice: string; grossPrice: string; sourceSessionBookingId?: number | null }[]
}

function parseAdvanceDeductionServiceIds(raw: string | null | undefined): Set<number> {
  if (!raw) return new Set()
  const out = new Set<number>()
  for (const part of raw.split(',')) {
    const n = Number(part.trim())
    if (Number.isInteger(n) && n > 0) out.add(n)
  }
  return out
}

type OpenBillEditItem = {
  /** Server row id; keeps distinct persisted lines from being merged in the editor. */
  openBillItemId?: number
  /** Client-only row key; keeps newly added duplicate service lines separate until saved. */
  clientRowKey?: string
  transactionServiceId: number
  quantity: number
  netPrice: string
  grossPrice: string
  sourceSessionBookingId?: number | null
  sourceSessionConsumableId?: number | null
  sourceAdvanceBillId?: number | null
}

type OpenBillDetailsDraft = {
  billingTarget: 'PERSON' | 'COMPANY'
  clientId?: number
  recipientCompanyId?: number
  consultantId?: number
  sessionId?: number
}

type PayeeClientEditDraft = {
  firstName: string
  lastName: string
  email: string
  phone: string
}

type PayeeCompanyEditDraft = {
  name: string
  email: string
  telephone: string
  address: string
  postalCode: string
  city: string
  vatId: string
}

type OpenBillPayeeDialogDraft = {
  openBillId: number
  details: OpenBillDetailsDraft
  clientEdits: Record<number, PayeeClientEditDraft>
  companyEdits: Record<number, PayeeCompanyEditDraft>
}

type VatBreakdownKey = 'VAT_22' | 'VAT_9_5' | 'VAT_0' | 'NO_VAT'

type VatBreakdownRow = {
  key: VatBreakdownKey
  label: string
  taxTotal: number
  lineCount: number
}

type OpenBillPaymentSplitDraft = {
  key: string
  paymentMethodId?: number
  amountGross: string
  kind?: 'payment' | 'entitlement'
  entitlementCode?: string
  entitlementId?: number
  entitlementName?: string
  entitlementType?: string
  sourceAdvanceBillId?: number | null
  advanceSelections?: AdvancePaymentSelectionDraft[]
}

type AdvancePaymentSelectionDraft = {
  advanceBillId: number
  mode: 'full' | 'partial'
  amountGross: string
}

type AdvancePaymentModalState = {
  mode: 'create' | 'open'
  splitKey: string
  openBillId?: number
}

type EntitlementPaymentTarget = {
  openBillId: number
  splitKey: string
  totalGross: number
  paymentBookingId?: number | null
  paymentClientId?: number | null
}

type EntitlementPaymentStep = 'choice' | 'scanner' | 'manual' | 'wallet'

type EntitlementScanSource = 'qr' | 'manual' | 'wallet'

type EntitlementScanResponse = {
  success: boolean
  result?: string | null
  message?: string | null
  client?: { firstName?: string | null; lastName?: string | null } | null
  entitlement?: { id?: number | null; code?: string | null; productName?: string | null; entitlementType?: string | null; voucherMode?: string | null } | null
}

type EntitlementWalletOption = {
  id: number
  code?: string | null
  displayCode?: string | null
  productName?: string | null
  entitlementType?: string | null
  remainingUses?: number | null
  totalUses?: number | null
  validUntil?: string | null
  voucherMode?: string | null
  voucherScope?: string | null
  remainingValueGross?: number | null
  eligibleServiceNames?: string[] | null
}

const ENTITLEMENT_PAYMENT_OPTION_VALUE = '__ENTITLEMENT_PAYMENT__'




type PaymentMethodVisualKey = 'advance' | 'paypal' | 'stripe' | 'cash' | 'bank' | 'card' | 'other'

function paymentMethodVisualKey(value?: string | null, methodName?: string | null): PaymentMethodVisualKey {
  const normalizedName = (methodName || '').trim().toLowerCase()
  if (normalizedName.includes('advance') || normalizedName.includes('deposit') || normalizedName.includes('predpla') || normalizedName.includes('avans') || value === 'ADVANCE') return 'advance'
  if (normalizedName.includes('paypal')) return 'paypal'
  if (normalizedName.includes('stripe')) return 'stripe'
  if (value === 'CASH') return 'cash'
  if (value === 'BANK_TRANSFER') return 'bank'
  if (value === 'CARD') return 'card'
  return 'other'
}

const paymentTypeIcon = (value?: string | null, methodName?: string | null): ReactNode => {
  const visualKey = paymentMethodVisualKey(value, methodName)
  if (visualKey === 'card') {
    return (
      <span className="billing-payicon billing-payicon--card" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="3" />
          <path d="M3 10h18" />
          <path d="M7 15h3" />
        </svg>
      </span>
    )
  }
  if (visualKey === 'bank') {
    return (
      <span className="billing-payicon billing-payicon--bank" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 10h16" />
          <path d="M6 10v7" />
          <path d="M10 10v7" />
          <path d="M14 10v7" />
          <path d="M18 10v7" />
          <path d="M3 20h18" />
          <path d="M12 4 4 8h16l-8-4Z" />
        </svg>
      </span>
    )
  }
  if (visualKey === 'cash') {
    return (
      <span className="billing-payicon billing-payicon--cash" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="6" width="18" height="12" rx="2.5" />
          <circle cx="12" cy="12" r="2.4" />
          <path d="M6.5 9.5v.01M17.5 14.5v.01" />
        </svg>
      </span>
    )
  }
  if (visualKey === 'advance') {
    return (
      <span className="billing-payicon billing-payicon--advance" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 3h8l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
          <path d="M15 3v5h5" />
          <path d="M9 13h6M9 17h4" />
        </svg>
      </span>
    )
  }
  if (visualKey === 'other') {
    return (
      <span className="billing-payicon billing-payicon--other" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M3.5 12h17" />
          <path d="M12 3.5c2.2 2.3 3.4 5.1 3.4 8.5S14.2 18.2 12 20.5C9.8 18.2 8.6 15.4 8.6 12S9.8 5.8 12 3.5Z" />
        </svg>
      </span>
    )
  }
  return <span className={`billing-payicon billing-payicon--${visualKey}`} aria-hidden>{visualKey === 'paypal' ? 'P' : 'S'}</span>
}

const paymentMethodChipContent = (method: PaymentMethod | null | undefined, loc: AppLocale): ReactNode => (
  <>
    {paymentTypeIcon(method?.paymentType, method?.name)}
    <span>{localizedPaymentMethodName(method, loc)}</span>
  </>
)

const matchRemainingIcon = (): ReactNode => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3 10.6 7.2 6.5 8.6l4.1 1.4L12 14l1.4-4 4.1-1.4-4.1-1.4L12 3Z" />
    <path d="M5 15.5 4.2 18 2 18.8 4.2 19.6 5 22l.8-2.4L8 18.8 5.8 18 5 15.5Z" />
    <path d="M18 14l-.9 2.7-2.6.9 2.6.9L18 21l.9-2.5 2.6-.9-2.6-.9L18 14Z" />
  </svg>
)

const equalizeToZeroIcon = (): ReactNode => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3v18" />
    <path d="M3 7h18" />
    <path d="m5 7-3 8a5 5 0 0 0 6 0L5 7Z" />
    <path d="m19 7-3 8a5 5 0 0 0 6 0l-3-8Z" />
    <path d="M7 21h10" />
  </svg>
)

const billingPosSectionIcon = (kind: 'payee' | 'selected' | 'payment' | 'summary'): ReactNode => {
  if (kind === 'payee') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="7.5" r="3.5" />
        <path d="M5.5 20v-1.4A6.5 6.5 0 0 1 12 12.1a6.5 6.5 0 0 1 6.5 6.5V20" />
      </svg>
    )
  }
  if (kind === 'selected') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="4" y="6.5" width="16" height="13" rx="2" />
        <path d="M8 6.5V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1.5M4 11h16" />
      </svg>
    )
  }
  if (kind === 'payment') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
        <path d="M3.5 9h17M7.5 14h4" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 3h8l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M15 3v5h5M9 13h6M9 17h6" />
    </svg>
  )
}

const entitlementPaymentIcon = (): ReactNode => (
  <span className="billing-payicon billing-payicon--entitlement" aria-hidden>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 5.5 19 11l-8 8-5.5-5.5 8-8Z" />
      <path d="M9.5 9.5h.01M12 12h.01" strokeWidth="2.4" />
    </svg>
  </span>
)

const entitlementScanIcon = (): ReactNode => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M7 3H5a2 2 0 0 0-2 2v2M17 3h2a2 2 0 0 1 2 2v2M7 21H5a2 2 0 0 1-2-2v-2M17 21h2a2 2 0 0 0 2-2v-2" />
    <path d="M8 8h3v3H8zM13 8h3v3h-3zM8 13h3v3H8zM13 13h1.5M16 13v3M14 16h2" />
  </svg>
)

const entitlementKeyboardIcon = (): ReactNode => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3.5" y="6" width="17" height="12" rx="2.5" />
    <path d="M6.5 10.5h1M9.5 10.5h1M12.5 10.5h1M15.5 10.5h1M6.5 13.5h6M14.5 13.5h3" />
  </svg>
)

const entitlementWalletIcon = (): ReactNode => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5.5 7.5h12.2A2.3 2.3 0 0 1 20 9.8v7.4a2.3 2.3 0 0 1-2.3 2.3H5.5A2.5 2.5 0 0 1 3 17V7.4A2.9 2.9 0 0 1 5.9 4.5h9.8" />
    <path d="M5.6 7.5h12.9" />
    <path d="M16.2 12.3h4v3.4h-4a1.7 1.7 0 1 1 0-3.4Z" />
    <path d="M16.4 14h.01" strokeWidth="2.4" />
  </svg>
)

const entitlementCameraIcon = (): ReactNode => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M8.5 7.5h7l1 1.5H19A2.5 2.5 0 0 1 21.5 11.5v5A2.5 2.5 0 0 1 19 19H5a2.5 2.5 0 0 1-2.5-2.5v-5A2.5 2.5 0 0 1 5 9h2.5l1-1.5Z" />
    <circle cx="12" cy="14" r="3" />
  </svg>
)

function paymentMethodChipLabel(
  method: { name: string; paymentType?: string | null } | null | undefined,
  loc: AppLocale,
): string {
  if (!method) return '—'
  const visualKey = paymentMethodVisualKey(method.paymentType, method.name)
  if (loc === 'sl') {
    if (visualKey === 'card') return 'Kartica'
    if (visualKey === 'bank') return 'Banka'
    if (visualKey === 'cash') return 'Gotovina'
    if (visualKey === 'advance') return 'Predplačilo'
    if (visualKey === 'paypal') return 'PayPal'
    if (visualKey === 'stripe') return 'Stripe'
    return method.name || 'Spletno'
  }
  if (visualKey === 'bank') return 'Bank'
  if (visualKey === 'advance') return 'Advance'
  if (visualKey === 'paypal') return 'PayPal'
  if (visualKey === 'stripe') return 'Stripe'
  return localizedPaymentMethodName(method, loc)
}
function localizedPaymentMethodName(
  method: { name: string; paymentType?: string | null } | null | undefined,
  loc: AppLocale,
): string {
  if (!method) return '—'
  if (isDepositPaymentMethod(method)) return loc === 'sl' ? 'Predplačilo' : 'Advance'
  if (loc !== 'sl') return method.name
  const pt = method.paymentType
  if (pt === 'CASH') return 'Gotovina'
  if (pt === 'CARD') return 'Kartica'
  if (pt === 'BANK_TRANSFER') return 'Bančno nakazilo'
  if (pt === 'OTHER') return method.name === 'PayPal' ? 'PayPal' : 'Drugo'
  return method.name
}
function isDepositPaymentMethod(method: { name?: string | null; paymentType?: string | null } | null | undefined): boolean {
  if (!method) return false
  if (method.paymentType === 'ADVANCE') return true
  const haystack = `${method.name || ''} ${method.paymentType || ''}`.toLowerCase()
  return haystack.includes('deposit')
    || haystack.includes('advance')
    || haystack.includes('predpla')
    || haystack.includes('avans')
    || haystack.includes('polog')
}

function isStripePaymentMethod(method: { paymentType?: string | null; stripeEnabled?: boolean | null } | null | undefined): boolean {
  if (!method) return false
  return method.stripeEnabled === true || String(method.paymentType || '').trim().toUpperCase() === 'CARD'
}

function billBankTransferDueAmount(bill: Pick<Bill, 'paymentMethod' | 'paymentSplits' | 'totalGross' | 'pendingPaymentGross'> | null | undefined): number {
  if (!bill) return 0
  const hasBankTransferSplit = (bill.paymentSplits ?? []).some((split) => split?.paymentMethod?.paymentType === 'BANK_TRANSFER')
  const hasPrimaryBankTransfer = bill.paymentMethod?.paymentType === 'BANK_TRANSFER'
  const hasBankTransferPortion = hasBankTransferSplit || hasPrimaryBankTransfer
  const backendDue = Number(bill.pendingPaymentGross)
  if (hasBankTransferPortion && Number.isFinite(backendDue) && backendDue >= 0) return backendDue
  const splitDue = (bill.paymentSplits ?? [])
    .filter((split) => split?.paymentMethod?.paymentType === 'BANK_TRANSFER')
    .reduce((sum, split) => sum + Number(split?.amountGross || 0), 0)
  if (splitDue > 0) return Number(splitDue.toFixed(2))
  if (hasPrimaryBankTransfer) return Number(Number(bill.totalGross || 0).toFixed(2))
  return Number(Number(bill.totalGross || 0).toFixed(2))
}

function shouldCreateCheckoutSession(bill: Pick<Bill, 'paymentMethod' | 'paymentSplits' | 'totalGross' | 'pendingPaymentGross'> | null | undefined): boolean {
  if (!bill) return false
  if (bill.paymentMethod?.stripeEnabled) return true
  const hasBankTransferSplit = (bill.paymentSplits ?? []).some((split) => split?.paymentMethod?.paymentType === 'BANK_TRANSFER')
  const hasPrimaryBankTransfer = bill.paymentMethod?.paymentType === 'BANK_TRANSFER'
  return (hasBankTransferSplit || hasPrimaryBankTransfer) && billBankTransferDueAmount(bill) > 0
}

function normalizeBill(bill: Bill): Bill {
  const normalizedSplits: PaymentSplit[] = (bill.paymentSplits ?? [])
    .map((split) => ({
      ...split,
      paymentMethod: normalizePaymentMethod(split.paymentMethod),
    }))
    .filter((split): split is PaymentSplit => !!split.paymentMethod)
  return {
    ...bill,
    paymentMethod: normalizePaymentMethod(bill.paymentMethod),
    paymentSplits: normalizedSplits,
  }
}

function normalizeOpenBill(ob: OpenBill): OpenBill {
  return {
    ...ob,
    discountType: ob.discountType ?? null,
    discountValue: ob.discountValue == null ? null : Number(ob.discountValue),
    discountAmountGross: ob.discountAmountGross == null ? null : Number(ob.discountAmountGross),
    discountedTotalGross: ob.discountedTotalGross == null ? null : Number(ob.discountedTotalGross),
    discountItemIndex: ob.discountItemIndex == null ? null : Number(ob.discountItemIndex),
    wholeBillDiscountPercent: ob.wholeBillDiscountPercent == null ? null : Number(ob.wholeBillDiscountPercent),
    itemDiscounts: Array.isArray(ob.itemDiscounts) ? ob.itemDiscounts.map((entry) => ({
      ...entry,
      itemIndex: Number(entry.itemIndex),
      discountValue: Number(entry.discountValue),
    })) : [],
    paymentMethod: normalizePaymentMethod(ob.paymentMethod),
    items: (ob.items ?? []).map((item) => {
      const fallbackGross = Number(item.netPrice || 0) * (1 + billingTaxMultiplier(item.transactionService?.taxRate))
      return {
        ...item,
        netPrice: Number(item.netPrice || 0),
        grossPrice: Number.isFinite(Number(item.grossPrice)) ? Number(item.grossPrice) : Number(fallbackGross.toFixed(2)),
      }
    }),
    paymentSplits: (ob.paymentSplits ?? []).map((split) => ({
      ...split,
      paymentMethod: normalizePaymentMethod(split.paymentMethod)!,
      amountGross: Number(split.amountGross || 0),
      sourceAdvanceBillId: split.sourceAdvanceBillId ?? null,
    })),
  }
}

function slovenianPostavkaCountForm(count: number): string {
  const n = Math.abs(count) % 100
  if (n >= 11 && n <= 14) return 'postavk'
  const last = n % 10
  if (last === 1) return 'postavka'
  if (last === 2) return 'postavki'
  if (last === 3 || last === 4) return 'postavke'
  return 'postavk'
}
function slovenianRacunCountForm(count: number): string {
  const n = Math.abs(count) % 100
  if (n >= 11 && n <= 14) return 'računov'
  const last = n % 10
  if (last === 1) return 'račun'
  if (last === 2) return 'računa'
  if (last === 3 || last === 4) return 'računi'
  return 'računov'
}

const billingTabIcon = (tab: BillingTab): ReactNode => {
  if (tab === 'open') {
    return (
      <span className="billing-tab-icon" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 3.75h7l4 4V20a1.75 1.75 0 0 1-1.75 1.75h-9.5A1.75 1.75 0 0 1 5 20V5.5A1.75 1.75 0 0 1 6.75 3.75Z" />
          <path d="M14 3.75V8h4" />
          <path d="M9 12h6M9 15.5h6" />
        </svg>
      </span>
    )
  }
  if (tab === 'openPayments') {
    return (
      <span className="billing-tab-icon" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="8.5" cy="7.5" rx="3.5" ry="2" />
          <path d="M5 7.5v4c0 1.1 1.57 2 3.5 2s3.5-.9 3.5-2v-4" />
          <path d="M13 10c0-1.1 1.57-2 3.5-2s3.5.9 3.5 2-1.57 2-3.5 2-3.5-.9-3.5-2Z" />
          <path d="M13 10v4c0 1.1 1.57 2 3.5 2s3.5-.9 3.5-2v-4" />
        </svg>
      </span>
    )
  }
  if (tab === 'unusedAdvances') {
    return (
      <span className="billing-tab-icon" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5.25 8.25h12.5A2.25 2.25 0 0 1 20 10.5v7.25A2.25 2.25 0 0 1 17.75 20H6.25A2.25 2.25 0 0 1 4 17.75v-7.25a2.25 2.25 0 0 1 1.25-2.02l2.35-1.18a4 4 0 0 1 1.8-.43H17" />
          <path d="M4 10.25h16" />
          <path d="M15.5 14.75h2.5" />
        </svg>
      </span>
    )
  }
  if (tab === 'giftCards') {
    return (
      <span className="billing-tab-icon" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 12v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 20v-8" />
          <path d="M3 8.5h18V12H3z" />
          <path d="M12 8.5v13" />
          <path d="M12 8.5H8.7a2.2 2.2 0 1 1 2.2-2.2c0 1.4-1.1 2.2-2.2 2.2Z" />
          <path d="M12 8.5h3.3a2.2 2.2 0 1 0-2.2-2.2c0 1.4 1.1 2.2 2.2 2.2Z" />
        </svg>
      </span>
    )
  }
  return (
    <span className="billing-tab-icon" aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.75 10a7.25 7.25 0 1 1 2.12 5.13" />
        <path d="M4.75 5.75V10h4.25" />
        <path d="M12 8v4l2.75 1.75" />
      </svg>
    </span>
  )
}
type BillDocumentType = 'INVOICE' | 'ADVANCE'
type HistoryInvoiceTypeFilter = 'all' | BillDocumentType | 'REFUND'
type HistoryFiscalStatusFilter = 'all' | NonNullable<Bill['fiscalStatus']>
type HistoryPaymentStatusFilter = 'all' | NonNullable<Bill['paymentStatus']>
type BillingTab = 'open' | 'openPayments' | 'unusedAdvances' | 'giftCards' | 'history'

function parseBillingTab(search: string): BillingTab {
  const tab = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('tab')
  if (tab === 'openPayments' || tab === 'unusedAdvances' || tab === 'giftCards' || tab === 'history') return tab
  return 'open'
}

function billingTabSearch(tab: BillingTab): string {
  return tab === 'open' ? '' : `tab=${tab}`
}

function mergeSearch(...parts: Array<string | undefined>): string {
  const params = new URLSearchParams()
  for (const part of parts) {
    if (!part) continue
    new URLSearchParams(part.startsWith('?') ? part.slice(1) : part).forEach((value, key) => {
      if (value) params.set(key, value)
    })
  }
  return params.toString()
}

function parseLegacyOpenBillEditPath(pathname: string): number | null {
  const match = pathname.match(/^(?:\/billing)?\/open-bills\/(\d+)\/edit\/?$/)
  if (!match) return null
  const id = Number(match[1])
  return Number.isInteger(id) && id > 0 ? id : null
}
type BillingGiftCardStatus = 'all' | 'active' | 'partially_used' | 'used' | 'expired' | 'cancelled' | 'pending_payment'
type BillingGiftCard = {
  id: number
  giftCardNumber?: string | null
  code?: string | null
  productName?: string | null
  voucherMode?: 'SERVICE' | 'VALUE' | string | null
  voucherScope?: 'ALL_SERVICES' | 'SELECTED_SERVICES' | string | null
  eligibleServiceNames?: string[] | null
  clientId?: number | null
  clientName?: string | null
  clientEmail?: string | null
  valueGross?: number | null
  usedGross?: number | null
  remainingGross?: number | null
  remainingUses?: number | null
  issuedAt?: string | null
  expiresAt?: string | null
  status: Exclude<BillingGiftCardStatus, 'all'> | string
  billId?: number | null
  billNumber?: string | null
  orderReference?: string | null
  locationId?: number | null
  locationName?: string | null
  availableAllLocations?: boolean
  validLocationIds?: number[] | null
  validLocationNames?: string[] | null
}
type UnusedAdvance = {
  advanceBillId: number
  billNumber: string
  sessionId?: number | null
  client?: { id?: number; firstName?: string; lastName?: string } | null
  recipientCompany?: { id?: number; name?: string } | null
  billingTarget?: 'PERSON' | 'COMPANY' | string | null
  issueDate: string
  totalNet: number
  usedNet: number
  remainingNet: number
  totalGross: number
  usedGross: number
  remainingGross: number
  location?: { id: number; name: string } | null
}

type BillingServerPageMeta = {
  totalElements: number
  page: number
  size: number
  totalPages: number
}

const EMPTY_BILLING_SERVER_PAGE: BillingServerPageMeta = {
  totalElements: 0,
  page: 0,
  size: BILLING_LIST_PAGE_SIZE,
  totalPages: 0,
}


/** API `billType`; missing values default to invoice. */
function normalizeBillType(bill: Bill): BillDocumentType {
  const raw = String(bill.billType ?? '').toUpperCase().trim()
  if (raw === 'ADVANCE') return 'ADVANCE'
  return 'INVOICE'
}

function isRefundBill(bill: Pick<Bill, 'refundOfBillId' | 'refundReference' | 'totalGross'> | null | undefined): boolean {
  if (!bill) return false
  return Boolean(bill.refundOfBillId) || Boolean(bill.refundReference) || Number(bill.totalGross || 0) < 0
}

function historyInvoiceTypeForBill(bill: Bill): Exclude<HistoryInvoiceTypeFilter, 'all'> {
  if (isRefundBill(bill)) return 'REFUND'
  return normalizeBillType(bill)
}

function billingServiceDisplayLabel(service: Pick<BillingService, 'id' | 'code' | 'description'> | null | undefined): string {
  const description = (service?.description ?? '').trim()
  if (description) return description
  const code = (service?.code ?? '').trim()
  if (code) return code
  if (service?.id) return `Service #${service.id}`
  return '—'
}

function normalizeUnusedAdvanceBillingTarget(advance: UnusedAdvance): 'PERSON' | 'COMPANY' {
  const target = String(advance.billingTarget || '').toUpperCase()
  if (target === 'COMPANY') return 'COMPANY'
  if (target === 'PERSON') return 'PERSON'
  return advance.recipientCompany?.id != null ? 'COMPANY' : 'PERSON'
}

function doesUnusedAdvanceMatchRecipient(
  advance: UnusedAdvance,
  target: 'PERSON' | 'COMPANY',
  clientId?: number | null,
  recipientCompanyId?: number | null,
): boolean {
  const advanceTarget = normalizeUnusedAdvanceBillingTarget(advance)
  if (target === 'COMPANY') {
    if (recipientCompanyId == null) return false
    if (advanceTarget !== 'COMPANY') return false
    return Number(advance.recipientCompany?.id || 0) === recipientCompanyId
  }
  if (clientId == null) return false
  if (advanceTarget !== 'PERSON') return false
  return Number(advance.client?.id || 0) === clientId
}

type OpenBillsSortField = 'sessionId' | 'client' | 'session' | 'employee' | 'paymentMethod' | 'gross' | 'date'
type OpenPaymentsSortField = 'orderId' | 'billNumber' | 'payer' | 'date' | 'dueDate' | 'amount'
type UnusedAdvancesSortField = 'advanceNumber' | 'customer' | 'sessionId' | 'originalAmount' | 'remainingAmount' | 'date'
type GiftCardsSortField = 'id' | 'code' | 'type' | 'customer' | 'content' | 'expires' | 'status' | 'invoice' | 'issuedAt'

type BillingGuestProduct = {
  id: number
  name: string
  description?: string | null
  productType: 'CLASS_TICKET' | 'PACK' | 'MEMBERSHIP' | 'GIFT_CARD' | 'COURSE' | string | null
  priceGross: number | string | null
  currency?: string | null
  active: boolean
  usageLimit?: number | null
  validityDays?: number | null
  sessionTypeId?: number | null
  sessionTypeName?: string | null
  sessionTypeIds?: number[] | null
  sessionTypeNames?: string[] | null
  serviceGroupId?: number | null
  serviceGroupName?: string | null
  transactionServiceId?: number | null
  transactionServiceCode?: string | null
  transactionServiceDescription?: string | null
  voucherRedemptionMode?: 'SERVICE' | 'VALUE' | string | null
  availableAllLocations?: boolean
  locationIds?: number[] | null
  locationNames?: string[] | null
}

type BillingCatalogService = {
  key: string
  sessionTypeId?: number | null
  transactionServiceId: number | null
  displayName: string
  secondaryText?: string
  priceGross: number | null
}
type HistorySortField = 'invoiceNumber' | 'invoiceType' | 'orderId' | 'sessionId' | 'customer' | 'employee' | 'description' | 'date' | 'gross' | 'paymentStatus' | 'fiscalStatus'
type SortDir = 'asc' | 'desc'
type BillingSortState<K extends string> = { key: K | null; direction: SortDir }
type BillingSortableValue = string | number | boolean | null | undefined
function getOpenBillsSortOptions(loc: AppLocale): Array<{ field: OpenBillsSortField; label: string }> {
  if (loc === 'sl') {
    return [
      { field: 'gross', label: 'Bruto' },
      { field: 'date', label: 'Datum' },
      { field: 'client', label: 'Stranka' },
    ]
  }
  return [
    { field: 'gross', label: 'Gross' },
    { field: 'date', label: 'Date' },
    { field: 'client', label: 'Client' },
  ]
}

function nextBillingSortState<K extends string>(current: BillingSortState<K>, key: K): BillingSortState<K> {
  if (current.key !== key) return { key, direction: 'asc' }
  return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
}

function compareBillingSortableValues(left: BillingSortableValue, right: BillingSortableValue, locale: AppLocale): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  if (typeof left === 'boolean' && typeof right === 'boolean') return Number(left) - Number(right)
  const compareLocale = locale === 'sl' ? 'sl-SI' : locale === 'sr' ? 'sr-Latn' : 'en'
  return String(left ?? '').localeCompare(String(right ?? ''), compareLocale, { sensitivity: 'base', numeric: true })
}

function BillingSortableTableHeader<K extends string>({
  label,
  sortKey,
  sortState,
  onSort,
  sortAriaPrefix,
}: {
  label: string
  sortKey: K
  sortState: BillingSortState<K>
  onSort: (key: K) => void
  sortAriaPrefix: string
}) {
  const active = sortState.key === sortKey
  const direction = active ? sortState.direction : null
  return (
    <th aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className={`clients-sort-header${active ? ' clients-sort-header--active' : ''}`}
        onClick={() => onSort(sortKey)}
        aria-label={`${sortAriaPrefix} ${label}`}
        title={`${sortAriaPrefix} ${label}`}
      >
        <span>{label}</span>
        <svg className={`clients-sort-icon${direction ? ` clients-sort-icon--${direction}` : ''}`} width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path className="clients-sort-icon__up" d="m4.5 6 3.5-3.5L11.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path className="clients-sort-icon__down" d="m4.5 10 3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </th>
  )
}

export type EmbeddedCreateBillRequest = {
  billType: BillDocumentType
  sessionId?: number | null
  clientId?: number | null
  clientIds?: number[] | null
  consultantId?: number | null
  billingTarget?: 'PERSON' | 'COMPANY'
  recipientCompanyId?: number | null
  items?: Array<{
    transactionServiceId: number
    quantity?: number
    netPrice?: string | number | null
    grossPrice?: string | number | null
    sourceSessionBookingId?: number | null
  }>
}

export type BillingPageProps = {
  embeddedOpenBillId?: number | null
  embeddedCreateBill?: EmbeddedCreateBillRequest | null
  onEmbeddedClose?: () => void
  onEmbeddedSaved?: () => void | Promise<void>
}

export function BillingPage({ embeddedOpenBillId = null, embeddedCreateBill = null, onEmbeddedClose, onEmbeddedSaved }: BillingPageProps = {}) {
  const me = useAuthenticatedUser()
  const activeUnitId = me.activeUnitId ?? me.companyId
  const queryClient = useQueryClient()
  const [selectedLocationId] = useSelectedLocationId(activeUnitId)
  const billingEditorDependencyScopeKey = `${activeUnitId ?? 'none'}:${selectedLocationId ?? 'none'}`
  const isAdmin = me.role === 'ADMIN' || me.role === 'SUPER_ADMIN'
  const canIssueOpenInvoice = canIssueOpenInvoices(me)
  const canIssueAdvanceInvoice = canIssueAdvanceInvoices(me)
  const canIssueRefundInvoice = canIssueRefundInvoices(me)
  const { showToast } = useToast()
  const { t, locale } = useLocale()
  const confirm = useConfirm()
  const mobileKeyboardOpen = useMobileKeyboardOpen(1024)
  const routeParams = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { match: drawerMatch, isOpen: isDrawerOpen, open: openDrawer, close: closeDrawerRoute } = useDrawerRoute()
  const embeddedCreateMode = embeddedCreateBill != null
  const activeEmbeddedOpenBillId = Number(embeddedOpenBillId ?? 0)
  const embeddedOpenBillMode = Number.isInteger(activeEmbeddedOpenBillId) && activeEmbeddedOpenBillId > 0
  const embeddedMode = embeddedCreateMode || embeddedOpenBillMode
  const billingPageDrawers = !embeddedMode && (drawerMatch == null || drawerMatch.descriptor.page === '/billing')
  const newBillDrawerOpen = billingPageDrawers && isDrawerOpen(BILLING_DRAWERS.newBill)
  const openBillDrawerOpen = billingPageDrawers && isDrawerOpen(BILLING_DRAWERS.openBill)
  const billDrawerOpen = billingPageDrawers && isDrawerOpen(BILLING_DRAWERS.bill)
  const giftCardDrawerOpen = billingPageDrawers && isDrawerOpen(BILLING_DRAWERS.giftCard)
  const workspaceBillsDrawerOpen = billingPageDrawers && isDrawerOpen(BILLING_DRAWERS.workspaceBills)
  const drawerName = drawerMatch?.descriptor.name ?? ''
  const drawerId = drawerMatch?.params.id ?? ''
  const drawerKey = drawerName ? `${drawerName}:${drawerId}` : ''
  const pageSearch = embeddedMode ? '' : billingTabSearch(parseBillingTab(location.search))
  const closeDrawer = useCallback(
    () => closeDrawerRoute({ search: pageSearch }),
    [closeDrawerRoute, pageSearch],
  )
  const selectBillingTab = useCallback((tab: BillingTab) => {
    if (embeddedMode) return
    const search = billingTabSearch(tab)
    if (drawerMatch?.descriptor.page === '/billing') {
      closeDrawerRoute({ search })
      return
    }
    navigate(search ? `/billing?${search}` : '/billing', { replace: true })
  }, [closeDrawerRoute, drawerMatch, embeddedMode, navigate])
  const routedOpenBillId = Number(routeParams.openBillId ?? 0)
  const activeRouteOpenBillId = Number.isInteger(routedOpenBillId) && routedOpenBillId > 0 ? routedOpenBillId : null
  const drawerOpenBillIdRaw = Number(openBillDrawerOpen ? drawerId : 0)
  const drawerOpenBillId = Number.isInteger(drawerOpenBillIdRaw) && drawerOpenBillIdRaw > 0 ? drawerOpenBillIdRaw : null
  const legacyPathOpenBillId = embeddedMode ? null : parseLegacyOpenBillEditPath(location.pathname)
  const activeOpenBillId = embeddedOpenBillMode
    ? activeEmbeddedOpenBillId
    : (drawerOpenBillId ?? (openBillDrawerOpen ? null : (legacyPathOpenBillId ?? activeRouteOpenBillId)))
  const editorOnlyMode = embeddedOpenBillMode
  const overlayOnlyMode = embeddedMode
  const billingCopy = locale === 'sl' ? {
    newCompanyTitle: 'Novo podjetje',
    newCompanySubtitle: 'Obvezno je samo ime podjetja.',
    newClientTitle: 'Nova stranka',
    newClientSubtitle: 'Obvezna sta ime in priimek.',
    clientFirstName: 'Ime',
    clientLastName: 'Priimek',
    companyName: 'Ime podjetja',
    email: 'E-pošta',
    telephone: 'Telefon',
    emailOptional: 'E-pošta (neobvezno)',
    telephoneOptional: 'Telefon (neobvezno)',
    creating: 'Ustvarjam…',
    create: 'Ustvari',
    historySearchPlaceholder:
      'Iskanje po številki računa, ID seje, stranki, zaposlenem, načinu plačila …',
    historyStatusAll: 'Vsi statusi plačila',
    historyStatusPaid: 'Plačano',
    historyStatusPending: 'Delno plačano',
    historyStatusOpen: 'Neplačano',
    historyStatusCancelled: 'Arhivirano',
    historyFiscalStatusAll: 'Vsi fiskalni statusi',
    historyFiscalStatusSent: 'Izdano',
    historyFiscalStatusFailed: 'Napaka',
    historyFiscalStatusNotSent: 'Ni poslano',
    historyFilterStatusAria: 'Filtriraj po statusu plačila',
    historyFilterFiscalStatusAria: 'Filtriraj po fiskalnem statusu',
    historyFilterDateAria: 'Filtriraj po datumu izdaje',
    historyFilterBillTypeAria: 'Filtriraj po vrsti računa',
    historyBillTypeAll: 'Vse vrste računa',
    historyBillTypeInvoice: 'Račun',
    historyBillTypeAdvance: 'Predplačilo',
    historyBillTypeRefund: 'Dobropis',
    historyInvoiceTypeColumn: 'Vrsta računa',
    historyBillTypeColumn: 'Vrsta',
    historyEmptyTitle: 'Ni še računov',
    historyEmptyText:
      'Pod neizdanimi računi uporabite gumb Novo za ustvarjanje računa ali pretvorbo neizdanega računa. Bančni izpisek uvozite z gumbom Uvozi bančni CSV.',
    historyStatInvoicesThisMonth: 'Računi',
    historyStatInvoicesThisMonthSub: 'Skupaj izdanih računov',
    historyStatPaidInvoices: 'Plačani računi',
    historyStatPaidInvoicesSub: 'Skupaj v celoti plačanih računov',
    importBankCsv: 'Uvozi bančni CSV',
    importBankCsvImporting: 'Uvoz …',
    historyCollected: 'Zbrano',
    historyBillsCount: (n: number) => `${n} ${slovenianRacunCountForm(n)}`,
    gross: 'Bruto',
    openBillsOutstanding: 'Neporavnano',
    openBillsCount: (n: number) => `${n} ${slovenianRacunCountForm(n)}`,
    sortPrefix: 'Razvrsti:',
    sortOpenBillsAria: 'Razvrsti neizdane račune',
    sortHistoryAria: 'Razvrsti zgodovino računov',
    createBillTitle: 'Ustvari račun',
    targetPerson: 'Posameznik',
    targetCompany: 'Podjetje',
    recipientCompany: 'Prejemnik (podjetje)',
    searchCompanyPlaceholder: 'Iskanje podjetja …',
    selectCompany: 'Izberi podjetje',
    linkedToClientSuffix: '(povezano s stranko)',
    noCompaniesFound: 'Podjetja nismo našli. Uporabite + za dodajanje.',
    client: 'Stranka',
    clientOptional: 'Stranka (neobvezno)',
    selectClient: 'Izberi stranko',
    billLines: 'Postavke',
    grossUnitPrice: 'Bruto cena',
    addLine: 'Dodaj postavko',
    removeBillLine: 'Izbriši',
    noBillLinesTitle: 'Ni postavk',
    noBillLinesText: 'Dodajte eno ali več transakcijskih storitev.',
    noAdvanceServicesText: 'Za tip Predplačilo najprej na strani Storitve, zavihek Obračunske storitve, označite vsaj eno transakcijsko storitev kot Predplačilo.',
    paymentMethod: 'Način plačila',
    selectPaymentMethod: 'Izberite način plačila',
    paymentTypeTitle: 'Vrsta plačila',
    paymentTypeSubtitle: 'Izberite, kako bo račun plačan.',
    estimatedTotal: 'Predvideni znesek',
    lineItemsCount: (n: number) => `${n} ${slovenianPostavkaCountForm(n)}`,
    paymentWithMethod: (name: string) => `Plačilo: ${name}`,
    createOpenBill: 'Ustvari neizdan račun',
    createBill: 'Ustvari račun',
    createBillAria: 'Ustvari račun',
    creatingBill: 'Ustvarjanje računa',
    paymentPickerAria: 'Izberi način plačila',
    billTypeInvoice: 'Račun',
    billTypeAdvance: 'Predplačilo',
    tabUnusedAdvances: 'Neizkoriščena predplačila',
    unusedAdvancesEmpty: 'Ni neizkoriščenih predplačil.',
    applyToOpenBill: 'Dodaj na neizdan račun',
    selectOpenBillSession: 'Termin neizdanega računa',
    selectAdvance: 'Predplačilo',
    amountToApply: 'Znesek za porabo',
    applyAdvance: 'Uporabi predplačilo',
    applyingAdvance: 'Uporabljam…',
    remaining: 'Preostanek',
    used: 'Porabljeno',
    unusedAdvancesColBillNo: 'Št. računa',
    unusedAdvancesColIssued: 'Datum izdaje',
    unusedAdvancesColTotalGross: 'Skupaj bruto',
    unusedAdvancesColUsedGross: 'Porabljeno (bruto)',
    unusedAdvancesColRemainingGross: 'Preostanek (bruto)',
    requiredAdvanceSelection: 'Najprej izberite predplačilo.',
    requiredOpenBillSessionSelection: 'Najprej izberite sejo odprtega računa.',
    requiredApplyAmount: 'Vnesite znesek za porabo.',
    advanceAppliedSuccess: 'Predplačilo je uspešno dodano na neizdan račun.',
    openBillNeedsLinesForCreate: 'Dodajte vsaj eno postavko za neizdan račun.',
    openBillNeedsConsultantPayment: 'Izberite način plačila.',
    openBillsColSessionId: 'ID seje',
    openBillsColSession: 'Seja',
    openBillsTotalGrossFirst: 'Skupaj',
    openBillsTotalGrossLast: 'bruto',
    manualOpenBillSessionLabel: 'Ročno ustvarjen neizdan račun',
  } : {
    newCompanyTitle: 'New company',
    newCompanySubtitle: 'Required: company name.',
    newClientTitle: 'New client',
    newClientSubtitle: 'Required: first and last name.',
    clientFirstName: 'First name',
    clientLastName: 'Last name',
    companyName: 'Company name',
    email: 'Email',
    telephone: 'Telephone',
    emailOptional: 'Email (optional)',
    telephoneOptional: 'Telephone (optional)',
    creating: 'Creating…',
    create: 'Create',
    historySearchPlaceholder: 'Search folio by bill no., session ID, client, consultant, payment method...',
    historyStatusAll: 'All payment statuses',
    historyStatusPaid: 'Paid',
    historyStatusPending: 'Partially paid',
    historyStatusOpen: 'Unpaid',
    historyStatusCancelled: 'Archived',
    historyFiscalStatusAll: 'All fiscal statuses',
    historyFiscalStatusSent: 'Invoiced',
    historyFiscalStatusFailed: 'Failed',
    historyFiscalStatusNotSent: 'Not sent',
    historyFilterStatusAria: 'Filter by payment status',
    historyFilterFiscalStatusAria: 'Filter by fiscal status',
    historyFilterDateAria: 'Filter by issued date',
    historyFilterBillTypeAria: 'Filter by invoice type',
    historyBillTypeAll: 'All invoice types',
    historyBillTypeInvoice: 'Invoice',
    historyBillTypeAdvance: 'Advance',
    historyBillTypeRefund: 'Credit note',
    historyInvoiceTypeColumn: 'Invoice type',
    historyBillTypeColumn: 'Type',
    historyEmptyTitle: 'No bills yet',
    historyEmptyText: 'Use New under Unissued invoices to create an invoice, or convert an unissued invoice.',
    historyStatInvoicesThisMonth: 'Invoices',
    historyStatInvoicesThisMonthSub: 'Total invoices issued',
    historyStatPaidInvoices: 'Paid Invoices',
    historyStatPaidInvoicesSub: 'Total fully paid invoices',
    importBankCsv: 'Import bank CSV',
    importBankCsvImporting: 'Importing…',
    historyCollected: 'Collected',
    historyBillsCount: (n: number) => `${n} bills`,
    gross: 'Gross',
    openBillsOutstanding: 'Outstanding',
    openBillsCount: (n: number) => `${n} invoices`,
    sortPrefix: 'Sort:',
    sortOpenBillsAria: 'Sort unissued invoices',
    sortHistoryAria: 'Sort folio history',
    createBillTitle: 'Create bill',
    targetPerson: 'Individual',
    targetCompany: 'Company',
    recipientCompany: 'Recipient company',
    searchCompanyPlaceholder: 'Search company...',
    selectCompany: 'Select company',
    linkedToClientSuffix: '(linked to client)',
    noCompaniesFound: 'No companies found. Use + to add one.',
    client: 'Client',
    clientOptional: 'Client (optional)',
    selectClient: 'Select client',
    billLines: 'Bill lines',
    grossUnitPrice: 'Gross price',
    addLine: 'Add line',
    removeBillLine: 'Remove',
    noBillLinesTitle: 'No bill lines',
    noBillLinesText: 'Add one or more transaction services.',
    noAdvanceServicesText: 'For Advance type, first mark at least one transaction service as Advance in Session Types.',
    paymentMethod: 'Payment method',
    selectPaymentMethod: 'Select payment method',
    paymentTypeTitle: 'Payment type',
    paymentTypeSubtitle: 'Choose how this bill will be paid.',
    estimatedTotal: 'Estimated total',
    lineItemsCount: (n: number) => `${n} line items`,
    paymentWithMethod: (name: string) => `Payment: ${name}`,
    createOpenBill: 'Create an unissued invoice',
    createBill: 'Create bill',
    createBillAria: 'Create bill',
    creatingBill: 'Creating bill',
    paymentPickerAria: 'Select payment method',
    billTypeInvoice: 'Invoice',
    billTypeAdvance: 'Advance',
    tabUnusedAdvances: 'Unused advances',
    unusedAdvancesEmpty: 'No unused advances.',
    applyToOpenBill: 'Add to an unissued invoice',
    selectOpenBillSession: 'Unissued invoice session',
    selectAdvance: 'Advance',
    amountToApply: 'Amount to apply',
    applyAdvance: 'Apply advance',
    applyingAdvance: 'Applying…',
    remaining: 'Remaining',
    used: 'Used',
    unusedAdvancesColBillNo: 'Bill no.',
    unusedAdvancesColIssued: 'Issued',
    unusedAdvancesColTotalGross: 'Total gross',
    unusedAdvancesColUsedGross: 'Used (gross)',
    unusedAdvancesColRemainingGross: 'Remaining (gross)',
    requiredAdvanceSelection: 'Select an advance first.',
    requiredOpenBillSessionSelection: 'Select an open-bill session first.',
    requiredApplyAmount: 'Enter amount to apply.',
    advanceAppliedSuccess: 'Advance has been applied to an unissued invoice.',
    openBillNeedsLinesForCreate: 'Add at least one line item for an unissued invoice.',
    openBillNeedsConsultantPayment: 'Select a payment method.',
    openBillsColSessionId: 'Session ID',
    openBillsColSession: 'Session',
    openBillsTotalGrossFirst: 'Total',
    openBillsTotalGrossLast: 'gross',
    manualOpenBillSessionLabel: MANUAL_OPEN_BILL_BACKEND_LABEL,
  }
  const openBillsSortOptions = useMemo(() => getOpenBillsSortOptions(locale), [locale])
  const [settings, setSettings] = useState<Record<string, string>>(() => queryClient.getQueryData<Record<string, string>>(queryKeys.settings.byUnit(activeUnitId)) ?? {})
  const [services, setServices] = useState<BillingService[]>(() => queryClient.getQueryData<BillingService[]>(queryKeys.billing.services(activeUnitId)) ?? [])
  const [servicesLoaded, setServicesLoaded] = useState(() => queryClient.getQueryData(queryKeys.billing.services(activeUnitId)) != null)
  const [sessionTypes, setSessionTypes] = useState<SessionType[]>(() => queryClient.getQueryData<SessionType[]>(queryKeys.scheduling.types(activeUnitId)) ?? [])
  const [guestProducts, setGuestProducts] = useState<BillingGuestProduct[]>([])
  const [bills, setBills] = useState<Bill[]>(() => (queryClient.getQueryData<Bill[]>(queryKeys.billing.bills(activeUnitId)) ?? []).map((bill) => normalizeBill(bill)))
  const [openBills, setOpenBills] = useState<OpenBill[]>(() => (queryClient.getQueryData<OpenBill[]>(queryKeys.billing.openBills(activeUnitId)) ?? []).map((openBill) => normalizeOpenBill(openBill)))
  const [bookings, setBookings] = useState<Booking[]>([])
  const [unusedAdvances, setUnusedAdvances] = useState<UnusedAdvance[]>(() => queryClient.getQueryData<UnusedAdvance[]>(queryKeys.billing.unusedAdvances(activeUnitId, selectedLocationId)) ?? [])
  const [giftCards, setGiftCards] = useState<BillingGiftCard[]>(() => queryClient.getQueryData<BillingGiftCard[]>(queryKeys.billing.giftCards(activeUnitId)) ?? [])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(() => (queryClient.getQueryData<PaymentMethod[]>(queryKeys.billing.paymentMethods(activeUnitId)) ?? []).map((method) => normalizePaymentMethod(method)!).filter(Boolean))
  const [clients, setClients] = useState<Client[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [invoiceIssuers, setInvoiceIssuers] = useState<InvoiceIssuerOption[]>([])
  const [invoiceSeriesOptions, setInvoiceSeriesOptions] = useState<InvoiceSeriesOption[]>([])
  const [invoiceLocations, setInvoiceLocations] = useState<Location[]>([])
  const [workspaceBills, setWorkspaceBills] = useState<WorkspaceBill[]>([])
  const [showWorkspaceBills, setShowWorkspaceBills] = useState(false)
  const workspaceBillsPanelOpen = embeddedMode ? showWorkspaceBills : workspaceBillsDrawerOpen
  const [workspaceBillsLoading, setWorkspaceBillsLoading] = useState(false)
  const [billForm, setBillForm] = useState<BillForm>({ items: [], billingTarget: 'PERSON', billType: 'INVOICE', wholeBillDiscountPercent: '0', itemDiscounts: {} })
  const seededCreateBillClientRef = useRef('')
  const [showCreateBillModal, setShowCreateBillModal] = useState(false)
  const createBillPanelOpen = embeddedCreateMode ? showCreateBillModal : newBillDrawerOpen
  const [editingCreateBillPayee, setEditingCreateBillPayee] = useState(false)
  const [creatingBill, setCreatingBill] = useState(false)
  const [bankTransferQrMissingModal, setBankTransferQrMissingModal] = useState<BankTransferQrMissingModal | null>(null)
  const [stripeSetupMissingModal, setStripeSetupMissingModal] = useState<StripeSetupMissingModal | null>(null)
  const [creatingFromOpenId, setCreatingFromOpenId] = useState<number | null>(null)
  const [printingBillId, setPrintingBillId] = useState<number | null>(null)
  const posPrinterPortRef = useRef<WebSerialPortLike | null>(null)
  const [printFormatChoice, setPrintFormatChoice] = useState<{ bill: PrintableBillRef; preparedWindow?: Window | null } | null>(null)
  const [previewingOpenBillId, setPreviewingOpenBillId] = useState<number | null>(null)
  const [printingOpenBillPreviewId, setPrintingOpenBillPreviewId] = useState<number | null>(null)
  const [emailingOpenBillPreviewId, setEmailingOpenBillPreviewId] = useState<number | null>(null)
  const [openBillPreviewChoice, setOpenBillPreviewChoice] = useState<{ openBill: OpenBill; relatedBills?: OpenBill[]; recipientEmail: string } | null>(null)
  const [deletingOpenId, setDeletingOpenId] = useState<number | null>(null)
  const [detailOpenBill, setDetailOpenBill] = useState<OpenBill | null>(null)
  const [] = useState(false)
  const [] = useState(false)
  const [openBillEdits, setOpenBillEdits] = useState<Record<number, OpenBillEditItem[]>>({})
  const [openBillDetailsEdits, setOpenBillDetailsEdits] = useState<Record<number, OpenBillDetailsDraft>>({})
  const [openBillPaymentEdits, setOpenBillPaymentEdits] = useState<Record<number, OpenBillPaymentSplitDraft[]>>({})
  const [openBillDiscountEdits, setOpenBillDiscountEdits] = useState<Record<number, DiscountDraft>>({})
  const [openCreateItemDiscountIndex, setOpenCreateItemDiscountIndex] = useState<number | null>(null)
  const [openOpenBillItemDiscount, setOpenOpenBillItemDiscount] = useState<{ openBillId: number; index: number } | null>(null)
  const [posCatalogTab, setPosCatalogTab] = useState<PosCatalogTab>('services')
  const [posCatalogQuery, setPosCatalogQuery] = useState('')
  const [posPaymentNotes, setPosPaymentNotes] = useState<Record<string, string>>({})

  useEffect(() => {
    if (createBillPanelOpen) {
      setPosCatalogTab(billForm.billType === 'ADVANCE' ? 'benefits' : 'services')
      setPosCatalogQuery('')
      return
    }
    if (detailOpenBill) {
      setPosCatalogTab('services')
      setPosCatalogQuery('')
    }
  }, [createBillPanelOpen, billForm.billType, detailOpenBill?.id])

  useEffect(() => {
    if (openCreateItemDiscountIndex == null && openOpenBillItemDiscount == null) return

    const closeDiscountPopoverOnOutsideClick = (event: globalThis.MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('.billing-line-discount-popover, .billing-invoice-discount-mini')) return

      // Discount edits are written to the draft immediately while typing, so an
      // outside click only closes the popover and keeps the entered value.
      setOpenCreateItemDiscountIndex(null)
      setOpenOpenBillItemDiscount(null)
    }

    document.addEventListener('click', closeDiscountPopoverOnOutsideClick)
    return () => document.removeEventListener('click', closeDiscountPopoverOnOutsideClick)
  }, [openCreateItemDiscountIndex, openOpenBillItemDiscount])
  const [entitlementPaymentTarget, setEntitlementPaymentTarget] = useState<EntitlementPaymentTarget | null>(null)
  const [entitlementPaymentStep, setEntitlementPaymentStep] = useState<EntitlementPaymentStep>('choice')
  const [entitlementManualCode, setEntitlementManualCode] = useState('')
  const [entitlementSubmitting, setEntitlementSubmitting] = useState(false)
  const [entitlementScanResult, setEntitlementScanResult] = useState<{ tone: 'success' | 'error' | 'info'; text: string; detail?: string } | null>(null)
  const [entitlementWalletOptions, setEntitlementWalletOptions] = useState<EntitlementWalletOption[]>([])
  const [entitlementWalletLoading, setEntitlementWalletLoading] = useState(false)
  const [entitlementCameraActive, setEntitlementCameraActive] = useState(false)
  const entitlementVideoRef = useRef<HTMLVideoElement | null>(null)
  const entitlementScannerControlsRef = useRef<IScannerControls | null>(null)
  const entitlementQrReaderRef = useRef<BrowserQRCodeReader | null>(null)
  const entitlementScanningLockRef = useRef(false)
  const entitlementWalletRequestRef = useRef(0)
  const [openBillOnePayeeForAll, setOpenBillOnePayeeForAll] = useState<Record<number, boolean>>({})
  const [editingOpenBillPayeeId, setEditingOpenBillPayeeId] = useState<number | null>(null)
  const [openBillPayeeDialogDraft, setOpenBillPayeeDialogDraft] = useState<OpenBillPayeeDialogDraft | null>(null)
  const [addOpenBillContext, setAddOpenBillContext] = useState<
    | { sessionId: number; billingTarget: 'PERSON' | 'COMPANY'; clientId?: number; recipientCompanyId?: number; consultantId?: number }
    | null
  >(null)
  const [creatingAdditionalOpenBill, setCreatingAdditionalOpenBill] = useState(false)
  const [openBillEditorRootId, setOpenBillEditorRootId] = useState<number | null>(null)
  const [openBillAddMenuForId, setOpenBillAddMenuForId] = useState<number | null>(null)
  const [externalOpenBillPickerForRootId, setExternalOpenBillPickerForRootId] = useState<number | null>(null)
  const [externalOpenBillSearch, setExternalOpenBillSearch] = useState('')
  const [temporaryOpenBillTabIds, setTemporaryOpenBillTabIds] = useState<Record<number, number[]>>({})
  const [selectedOpenBillLines, setSelectedOpenBillLines] = useState<Record<string, boolean>>({})
  const [moveSelectedTargetOpenBillId, setMoveSelectedTargetOpenBillId] = useState<number | null>(null)
  const [draggedOpenBillLine, setDraggedOpenBillLine] = useState<{ openBillId: number; index: number } | null>(null)
  const [openBillsSearch, setOpenBillsSearch] = useState('')
  const [openPaymentsSearch, setOpenPaymentsSearch] = useState('')
  const [unusedAdvancesSearch, setUnusedAdvancesSearch] = useState('')
  const [giftCardSearch, setGiftCardSearch] = useState('')
  const [giftCardDateFrom, setGiftCardDateFrom] = useState('')
  const [giftCardDateTo, setGiftCardDateTo] = useState('')
  const giftCardDateFromInputRef = useRef<HTMLInputElement | null>(null)
  const giftCardDateToInputRef = useRef<HTMLInputElement | null>(null)
  const [giftCardStatusFilter, setGiftCardStatusFilter] = useState<BillingGiftCardStatus>('all')
  const [historySearch, setHistorySearch] = useState('')
  const [historyDateFrom, setHistoryDateFrom] = useState('')
  const [historyDateTo, setHistoryDateTo] = useState('')
  const historyDateFromInputRef = useRef<HTMLInputElement | null>(null)
  const historyDateToInputRef = useRef<HTMLInputElement | null>(null)
  const [historyStatusFilter, setHistoryStatusFilter] = useState<HistoryPaymentStatusFilter>('all')
  const [historyFiscalStatusFilter, setHistoryFiscalStatusFilter] = useState<HistoryFiscalStatusFilter>('all')
  const [historyBillTypeFilter, setHistoryBillTypeFilter] = useState<HistoryInvoiceTypeFilter>('all')
  const [showHistoryFilters, setShowHistoryFilters] = useState(false)
  const [historyFilterDraft, setHistoryFilterDraft] = useState<{
    dateFrom: string
    dateTo: string
    status: HistoryPaymentStatusFilter
    fiscalStatus: HistoryFiscalStatusFilter
    billType: HistoryInvoiceTypeFilter
  }>({
    dateFrom: '',
    dateTo: '',
    status: 'all',
    fiscalStatus: 'all',
    billType: 'all',
  })
  const [selectedHistoryBillIds, setSelectedHistoryBillIds] = useState<number[]>([])
  const [historyExportMenuOpen, setHistoryExportMenuOpen] = useState(false)
  const [exportingHistoryScope, setExportingHistoryScope] = useState<null | 'all-pdf' | 'selected-pdf' | 'all-excel' | 'selected-excel'>(null)
  const [showGiftCardFilters, setShowGiftCardFilters] = useState(false)
  const [giftCardFilterDraft, setGiftCardFilterDraft] = useState<{
    dateFrom: string
    dateTo: string
    status: BillingGiftCardStatus
  }>({
    dateFrom: '',
    dateTo: '',
    status: 'all',
  })
  const [billingTab, setBillingTab] = useState<BillingTab>(() => (embeddedMode ? 'open' : parseBillingTab(location.search)))
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(() => queryClient.getQueryData<BillingSummary>(queryKeys.billing.summary(activeUnitId, selectedLocationId)) ?? null)
  const [loadedBillingEditorDependencyScopeKey, setLoadedBillingEditorDependencyScopeKey] = useState('')
  const [selectedUnusedAdvanceId, setSelectedUnusedAdvanceId] = useState<number | null>(null)
  const [] = useState<{ openBillId: number; sessionId: number } | null>(null)
  const [, setApplyAmountNet] = useState('')
  const [advancePaymentModal, setAdvancePaymentModal] = useState<AdvancePaymentModalState | null>(null)
  const [advancePaymentDraftSelections, setAdvancePaymentDraftSelections] = useState<AdvancePaymentSelectionDraft[]>([])
  const [advancePaymentInitialSelections, setAdvancePaymentInitialSelections] = useState<AdvancePaymentSelectionDraft[]>([])
  const [advancePaymentShowOther, setAdvancePaymentShowOther] = useState(false)
  const [] = useState(false)
  const [newCompanyName, setNewCompanyName] = useState('')
  const [newCompanyEmail, setNewCompanyEmail] = useState('')
  const [newCompanyTelephone, setNewCompanyTelephone] = useState('')
  const [creatingCompany, setCreatingCompany] = useState(false)
  const [showAddCompanyModal, setShowAddCompanyModal] = useState(false)
  const [addCompanyTarget, setAddCompanyTarget] = useState<{ mode: 'createBill' } | { mode: 'editOpenBill'; openBillId: number } | null>(null)
  const [newClientFirstName, setNewClientFirstName] = useState('')
  const [newClientLastName, setNewClientLastName] = useState('')
  const [newClientEmail, setNewClientEmail] = useState('')
  const [newClientPhone, setNewClientPhone] = useState('')
  const [creatingClientInline, setCreatingClientInline] = useState(false)
  const [newClientInlineError, setNewClientInlineError] = useState('')
  const [showAddClientModal, setShowAddClientModal] = useState(false)
  const [addClientTarget, setAddClientTarget] = useState<{ mode: 'createBill' } | { mode: 'editOpenBill'; openBillId: number } | null>(null)
  const [payeeClientEdits, setPayeeClientEdits] = useState<Record<number, PayeeClientEditDraft>>({})
  const [payeeCompanyEdits, setPayeeCompanyEdits] = useState<Record<number, PayeeCompanyEditDraft>>({})
  const [savingPayeeEditor, setSavingPayeeEditor] = useState(false)
  const [recipientCompanySearch, setRecipientCompanySearch] = useState('')
  const [recipientCompanyPickerOpen, setRecipientCompanyPickerOpen] = useState(false)
  const [editingRecipientCompanySearch, setEditingRecipientCompanySearch] = useState(false)
  const [] = useState<number | null>(null)
  const [creatingCheckoutBillId, setCreatingCheckoutBillId] = useState<number | null>(null)
  const [importingBankStatement, setImportingBankStatement] = useState(false)
  const [markingPaidBillId, setMarkingPaidBillId] = useState<number | null>(null)
  const [refundingBillId, setRefundingBillId] = useState<number | null>(null)
  const bankStatementInputRef = useRef<HTMLInputElement | null>(null)
  const [detailFolioBill, setDetailFolioBill] = useState<Bill | null>(null)
  const [folioPanelTab, setFolioPanelTab] = useState<'invoice' | 'fiscal'>('invoice')
  const [fiscalLogBill, setFiscalLogBill] = useState<Bill | null>(null)
  const [fiscalLogRows, setFiscalLogRows] = useState<Array<{ at?: string; title?: string; status?: string; detail?: string }>>([])
  const [fiscalLogRequestBody, setFiscalLogRequestBody] = useState('')
  const [fiscalLogResponseBody, setFiscalLogResponseBody] = useState('')
  const [loadingFiscalLog, setLoadingFiscalLog] = useState(false)
  const [openBillsSortField, setOpenBillsSortField] = useState<OpenBillsSortField>('gross')
  const [openBillsSortDir, setOpenBillsSortDir] = useState<SortDir>('desc')
  const [openBillsSortMenuOpen, setOpenBillsSortMenuOpen] = useState(false)
  const [openPaymentsSort, setOpenPaymentsSort] = useState<BillingSortState<OpenPaymentsSortField>>({ key: null, direction: 'asc' })
  const [unusedAdvancesSort, setUnusedAdvancesSort] = useState<BillingSortState<UnusedAdvancesSortField>>({ key: null, direction: 'asc' })
  const [giftCardsSort, setGiftCardsSort] = useState<BillingSortState<GiftCardsSortField>>({ key: 'issuedAt', direction: 'desc' })
  const [historySortField, setHistorySortField] = useState<HistorySortField>('date')
  const [historySortDir, setHistorySortDir] = useState<SortDir>('asc')
  const [historySortMenuOpen, setHistorySortMenuOpen] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const [openPaymentsPage, setOpenPaymentsPage] = useState(1)
  const [unusedAdvancesPage, setUnusedAdvancesPage] = useState(1)
  const [giftCardsPage, setGiftCardsPage] = useState(1)
  const [historyPageMeta, setHistoryPageMeta] = useState<BillingServerPageMeta>(EMPTY_BILLING_SERVER_PAGE)
  const [openPaymentsPageMeta, setOpenPaymentsPageMeta] = useState<BillingServerPageMeta>(EMPTY_BILLING_SERVER_PAGE)
  const [unusedAdvancesPageMeta, setUnusedAdvancesPageMeta] = useState<BillingServerPageMeta>(EMPTY_BILLING_SERVER_PAGE)
  const [giftCardsPageMeta, setGiftCardsPageMeta] = useState<BillingServerPageMeta>(EMPTY_BILLING_SERVER_PAGE)
  const [loadedBillsView, setLoadedBillsView] = useState<'history' | 'openPayments' | null>(null)
  const [historyServerStats, setHistoryServerStats] = useState<BillingHistoryStats | null>(null)
  const [openPaymentsServerTotal, setOpenPaymentsServerTotal] = useState(0)
  const [unusedAdvancesServerTotal, setUnusedAdvancesServerTotal] = useState(0)
  const [giftCardServerStats, setGiftCardServerStats] = useState<GiftCardStats | null>(null)
  const debouncedOpenPaymentsSearch = useDebouncedValue(openPaymentsSearch)
  const debouncedUnusedAdvancesSearch = useDebouncedValue(unusedAdvancesSearch)
  const debouncedGiftCardSearch = useDebouncedValue(giftCardSearch)
  const debouncedHistorySearch = useDebouncedValue(historySearch)
  const [sendingGiftCardId, setSendingGiftCardId] = useState<number | null>(null)
  const [printingGiftCardId, setPrintingGiftCardId] = useState<number | null>(null)
  const [detailGiftCard, setDetailGiftCard] = useState<BillingGiftCard | null>(null)
  const [] = useState<string | null>(null)
  const [, setExpandedBatchSessionId] = useState<number | null>(null)
  const billingTabsRef = useRef<HTMLDivElement | null>(null)
  const billingPollInFlightRef = useRef<Promise<unknown> | null>(null)
  const [creatingManualOpenBill, setCreatingManualOpenBill] = useState(false)
  const [isOpenBillsMobile, setIsOpenBillsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 1024px)').matches : false,
  )
  const [isBillingMobileOrTablet, setIsBillingMobileOrTablet] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 1024px)').matches : false,
  )

  async function fetchBillingQuery<T>(
    options: { queryKey: readonly unknown[]; queryFn: () => Promise<T>; staleTime?: number },
    force = false,
  ): Promise<T> {
    if (force) {
      await queryClient.invalidateQueries({ queryKey: options.queryKey, exact: true, refetchType: 'none' })
    }
    return queryClient.fetchQuery(options)
  }

  const loadBillingSummary = async (force = false) => {
    try {
      const summary = await fetchBillingQuery(billingSummaryQueryOptions(activeUnitId, selectedLocationId), force)
      setBillingSummary(summary)
      return summary
    } catch {
      return null
    }
  }

  const loadBillingEditorDependencies = async (force = false) => {
    const settingsData = await fetchBillingQuery(settingsQueryOptions(activeUnitId), false).catch(() => ({} as Record<string, string>))
    setSettings(settingsData || {})

    const servicesPromise = fetchBillingQuery(billingServicesQueryOptions<BillingService>(activeUnitId), false).catch(() => [] as BillingService[])
    const sessionTypesPromise = fetchBillingQuery(calendarTypesQueryOptions<SessionType>(activeUnitId), false).catch(() => [] as SessionType[])
    const paymentMethodsPromise = fetchBillingQuery(paymentMethodsQueryOptions<PaymentMethod>(activeUnitId), false).catch(() => [] as PaymentMethod[])
    const clientsPromise = fetchBillingQuery(clientOptionsQueryOptions<Client>(activeUnitId, selectedLocationId, 500), force).catch(() => [] as Client[])
    const companiesPromise = fetchBillingQuery(billingEditorCompaniesQueryOptions<Company>(activeUnitId, selectedLocationId), force).catch(() => [] as Company[])
    const usersPromise = isAdmin
      ? fetchBillingQuery(usersQueryOptions<User>(activeUnitId), false).catch(() => [] as User[])
      : Promise.resolve([] as User[])
    const issuersPromise = fetchBillingQuery(invoiceIssuersQueryOptions<InvoiceIssuerOption>(activeUnitId), false).catch(() => [] as InvoiceIssuerOption[])
    const seriesPromise = fetchBillingQuery(invoiceSeriesQueryOptions<InvoiceSeriesOption>(activeUnitId), false).catch(() => [] as InvoiceSeriesOption[])
    const locationsPromise = fetchBillingQuery(locationsQueryOptions(activeUnitId), false).catch(() => [] as Location[])
    const bookingsPromise = fetchBillingQuery(billingEditorBookingsQueryOptions<Booking>(activeUnitId), force).catch(() => [] as Booking[])
    const guestProductsPromise = api.get<BillingGuestProduct[]>('/guest/admin/products').then((res) => res.data ?? []).catch(() => [] as BillingGuestProduct[])
    const unusedAdvancesPromise = settingsData?.BILLING_ADVANCE_ENABLED === 'false'
      ? Promise.resolve([] as UnusedAdvance[])
      : fetchBillingQuery(unusedAdvancesQueryOptions<UnusedAdvance>(activeUnitId, selectedLocationId), force).catch(() => [] as UnusedAdvance[])

    const [
      loadedServices,
      loadedSessionTypes,
      loadedPaymentMethods,
      loadedClients,
      loadedCompanies,
      loadedUsers,
      loadedIssuers,
      loadedSeries,
      loadedLocations,
      loadedBookings,
      loadedGuestProducts,
      loadedUnusedAdvances,
    ] = await Promise.all([
      servicesPromise,
      sessionTypesPromise,
      paymentMethodsPromise,
      clientsPromise,
      companiesPromise,
      usersPromise,
      issuersPromise,
      seriesPromise,
      locationsPromise,
      bookingsPromise,
      guestProductsPromise,
      unusedAdvancesPromise,
    ])

    const normalizedPaymentMethods = loadedPaymentMethods.map((method) => normalizePaymentMethod(method)!).filter(Boolean)
    setServices(loadedServices)
    setServicesLoaded(true)
    setSessionTypes(loadedSessionTypes)
    setPaymentMethods(normalizedPaymentMethods)
    setClients(loadedClients)
    setCompanies(loadedCompanies)
    setUsers(loadedUsers)
    setInvoiceIssuers(loadedIssuers.filter((issuer) => issuer.assignedToCurrentUnit && issuer.active))
    setInvoiceSeriesOptions(loadedSeries.filter((series) => series.active))
    setInvoiceLocations(loadedLocations.filter((invoiceLocation) => invoiceLocation.active !== false))
    setBookings(loadedBookings)
    setGuestProducts((loadedGuestProducts ?? []).filter((product) => product?.active !== false))
    setUnusedAdvances(loadedUnusedAdvances)
    setLoadedBillingEditorDependencyScopeKey(billingEditorDependencyScopeKey)

    return {
      settings: settingsData,
      services: loadedServices,
      sessionTypes: loadedSessionTypes,
      paymentMethods: normalizedPaymentMethods,
      clients: loadedClients,
      companies: loadedCompanies,
      users: loadedUsers,
      invoiceIssuers: loadedIssuers,
      invoiceSeries: loadedSeries,
      locations: loadedLocations,
      bookings: loadedBookings,
      guestProducts: loadedGuestProducts,
      unusedAdvances: loadedUnusedAdvances,
    }
  }

  const load = async (forceDynamic = true) => {
    // Phase 2: load only the selected billing tab. Shared/catalog data remains in
    // TanStack Query so returning to Billing can render from cache immediately.
    const settingsPromise = fetchBillingQuery(settingsQueryOptions(activeUnitId), false).catch(() => ({} as Record<string, string>))
    const summaryPromise = loadBillingSummary(forceDynamic)
    let loadedOpenBills = openBills

    const activeTabTask = (async () => {
      if (billingTab === 'open') {
        const [loadedServices, loadedPaymentMethods, rows] = await Promise.all([
          fetchBillingQuery(billingServicesQueryOptions<BillingService>(activeUnitId), false).catch(() => [] as BillingService[]),
          fetchBillingQuery(paymentMethodsQueryOptions<PaymentMethod>(activeUnitId), false).catch(() => [] as PaymentMethod[]),
          fetchBillingQuery(openBillsQueryOptions<OpenBill>(activeUnitId), forceDynamic).catch(() => [] as OpenBill[]),
        ])
        setServices(loadedServices)
        setServicesLoaded(true)
        setPaymentMethods(loadedPaymentMethods.map((method) => normalizePaymentMethod(method)!).filter(Boolean))
        loadedOpenBills = rows.map((openBill) => normalizeOpenBill(openBill))
        setOpenBills(loadedOpenBills)
        return
      }

      if (billingTab === 'openPayments') {
        const response = await fetchBillingQuery(billsPageQueryOptions<Bill>(activeUnitId, {
          view: 'openPayments',
          locationId: selectedLocationId,
          search: debouncedOpenPaymentsSearch,
          sortField: openPaymentsSort.key,
          sortDir: openPaymentsSort.key ? openPaymentsSort.direction : 'desc',
          page: Math.max(0, openPaymentsPage - 1),
          size: BILLING_LIST_PAGE_SIZE,
        }), forceDynamic).catch(() => null)
        if (!response) {
          setBills([])
          setLoadedBillsView(null)
          setOpenPaymentsPageMeta(EMPTY_BILLING_SERVER_PAGE)
          setOpenPaymentsServerTotal(0)
          return
        }
        setBills(response.content.map((bill) => normalizeBill(bill)))
        setLoadedBillsView('openPayments')
        setOpenPaymentsPageMeta({
          totalElements: response.totalElements,
          page: response.page,
          size: response.size,
          totalPages: response.totalPages,
        })
        setOpenPaymentsServerTotal(Number(response.totalAmount || 0))
        return
      }

      if (billingTab === 'history') {
        const response = await fetchBillingQuery(billsPageQueryOptions<Bill>(activeUnitId, {
          view: 'history',
          locationId: selectedLocationId,
          search: debouncedHistorySearch,
          dateFrom: historyDateFrom,
          dateTo: historyDateTo,
          paymentStatus: historyStatusFilter,
          fiscalStatus: fiscalCashRegisterEnabled ? historyFiscalStatusFilter : 'all',
          billType: historyBillTypeFilter,
          sortField: historySortField,
          sortDir: historySortDir,
          page: Math.max(0, historyPage - 1),
          size: BILLING_LIST_PAGE_SIZE,
        }), forceDynamic).catch(() => null)
        if (!response) {
          setBills([])
          setLoadedBillsView(null)
          setHistoryPageMeta(EMPTY_BILLING_SERVER_PAGE)
          setHistoryServerStats(null)
          return
        }
        setBills(response.content.map((bill) => normalizeBill(bill)))
        setLoadedBillsView('history')
        setHistoryPageMeta({
          totalElements: response.totalElements,
          page: response.page,
          size: response.size,
          totalPages: response.totalPages,
        })
        setHistoryServerStats(response.historyStats ?? null)
        return
      }

      const settingsData = await settingsPromise
      if (billingTab === 'unusedAdvances') {
        if (settingsData?.BILLING_ADVANCE_ENABLED === 'false') {
          setUnusedAdvances([])
          setUnusedAdvancesPageMeta(EMPTY_BILLING_SERVER_PAGE)
          setUnusedAdvancesServerTotal(0)
          return
        }
        const response = await fetchBillingQuery(unusedAdvancesPageQueryOptions<UnusedAdvance>(activeUnitId, {
          locationId: selectedLocationId,
          search: debouncedUnusedAdvancesSearch,
          sortField: unusedAdvancesSort.key,
          sortDir: unusedAdvancesSort.key ? unusedAdvancesSort.direction : 'desc',
          page: Math.max(0, unusedAdvancesPage - 1),
          size: BILLING_LIST_PAGE_SIZE,
        }), forceDynamic).catch(() => null)
        if (!response) {
          setUnusedAdvances([])
          setUnusedAdvancesPageMeta(EMPTY_BILLING_SERVER_PAGE)
          setUnusedAdvancesServerTotal(0)
          return
        }
        setUnusedAdvances(response.content)
        setUnusedAdvancesPageMeta({
          totalElements: response.totalElements,
          page: response.page,
          size: response.size,
          totalPages: response.totalPages,
        })
        setUnusedAdvancesServerTotal(Number(response.totalRemainingGross || 0))
        return
      }

      if (billingTab === 'giftCards') {
        if (settingsData?.BILLING_GIFT_CARDS_ENABLED !== 'true') {
          setGiftCards([])
          setGiftCardsPageMeta(EMPTY_BILLING_SERVER_PAGE)
          setGiftCardServerStats(null)
          return
        }
        const response = await fetchBillingQuery(giftCardsPageQueryOptions<BillingGiftCard>(activeUnitId, {
          locationId: selectedLocationId,
          search: debouncedGiftCardSearch,
          dateFrom: giftCardDateFrom,
          dateTo: giftCardDateTo,
          status: giftCardStatusFilter,
          sortField: giftCardsSort.key,
          sortDir: giftCardsSort.direction,
          page: Math.max(0, giftCardsPage - 1),
          size: BILLING_LIST_PAGE_SIZE,
        }), forceDynamic).catch(() => null)
        if (!response) {
          setGiftCards([])
          setGiftCardsPageMeta(EMPTY_BILLING_SERVER_PAGE)
          setGiftCardServerStats(null)
          return
        }
        setGiftCards(response.content)
        setGiftCardsPageMeta({
          totalElements: response.totalElements,
          page: response.page,
          size: response.size,
          totalPages: response.totalPages,
        })
        setGiftCardServerStats(response.stats)
      }
    })()

    const [settingsData] = await Promise.all([settingsPromise, summaryPromise, activeTabTask])
    setSettings(settingsData || {})
    return { openBills: loadedOpenBills }
  }

  const refreshBillingRows = async () => {
    // Refresh only what is visible. Bookings and invoice-editor catalogs are
    // intentionally excluded and are loaded when an editor is opened.
    await load(true)
  }

  const markBillingDynamicCacheStale = async () => {
    // Mutations invalidate all billing row caches without refetching inactive tabs.
    // The visible tab is refreshed immediately; other tabs refresh only when opened.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.summaryByUnit(activeUnitId), refetchType: 'none' }),
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.openBills(activeUnitId), exact: true, refetchType: 'none' }),
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.bills(activeUnitId), refetchType: 'none' }),
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.unusedAdvancesByUnit(activeUnitId), refetchType: 'none' }),
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.giftCards(activeUnitId), refetchType: 'none' }),
    ])
  }

  const reloadAfterBillingMutation = async () => {
    await markBillingDynamicCacheStale()
    return load(true)
  }

  const reloadOpenBillsAfterEditorClose = async (closedOpenBillId: number) => {
    await markBillingDynamicCacheStale()
    queryClient.removeQueries({ queryKey: queryKeys.billing.openBill(activeUnitId, closedOpenBillId), exact: true })
    try {
      const rows = await fetchBillingQuery(openBillsQueryOptions<OpenBill>(activeUnitId), true)
      const normalizedRows = rows.map((openBill) => normalizeOpenBill(openBill))
      setOpenBills(normalizedRows)
      void loadBillingSummary(true)
      return normalizedRows
    } catch {
      const fallbackRows = openBills.filter((entry) => Number(entry.id) !== Number(closedOpenBillId))
      setOpenBills(fallbackRows)
      return fallbackRows
    }
  }

  useEffect(() => {
    // Never keep another unit's billing rows visible while the new unit is loading.
    const cachedSettings = queryClient.getQueryData<Record<string, string>>(queryKeys.settings.byUnit(activeUnitId))
    const cachedServices = queryClient.getQueryData<BillingService[]>(queryKeys.billing.services(activeUnitId))
    const cachedSessionTypes = queryClient.getQueryData<SessionType[]>(queryKeys.scheduling.types(activeUnitId))
    const cachedOpenBills = queryClient.getQueryData<OpenBill[]>(queryKeys.billing.openBills(activeUnitId))
    const cachedPaymentMethods = queryClient.getQueryData<PaymentMethod[]>(queryKeys.billing.paymentMethods(activeUnitId))
    const cachedUsers = queryClient.getQueryData<User[]>(queryKeys.users.byUnit(activeUnitId))
    const cachedIssuers = queryClient.getQueryData<InvoiceIssuerOption[]>(queryKeys.billing.issuers(activeUnitId))
    const cachedSeries = queryClient.getQueryData<InvoiceSeriesOption[]>(queryKeys.billing.invoiceSeries(activeUnitId))
    const cachedLocations = queryClient.getQueryData<Location[]>(queryKeys.locations.byUnit(activeUnitId))
    const cachedBookings = queryClient.getQueryData<Booking[]>(queryKeys.billing.editorBookings(activeUnitId))

    setSettings(cachedSettings ?? {})
    setServices(cachedServices ?? [])
    setServicesLoaded(cachedServices != null)
    setSessionTypes(cachedSessionTypes ?? [])
    setGuestProducts([])
    setBills([])
    setLoadedBillsView(null)
    setHistoryPageMeta(EMPTY_BILLING_SERVER_PAGE)
    setOpenPaymentsPageMeta(EMPTY_BILLING_SERVER_PAGE)
    setHistoryServerStats(null)
    setOpenPaymentsServerTotal(0)
    setOpenBills((cachedOpenBills ?? []).map((openBill) => normalizeOpenBill(openBill)))
    setGiftCards([])
    setGiftCardsPageMeta(EMPTY_BILLING_SERVER_PAGE)
    setGiftCardServerStats(null)
    setPaymentMethods((cachedPaymentMethods ?? []).map((method) => normalizePaymentMethod(method)!).filter(Boolean))
    setUsers(cachedUsers ?? [])
    setInvoiceIssuers((cachedIssuers ?? []).filter((issuer) => issuer.assignedToCurrentUnit && issuer.active))
    setInvoiceSeriesOptions((cachedSeries ?? []).filter((series) => series.active))
    setInvoiceLocations((cachedLocations ?? []).filter((invoiceLocation) => invoiceLocation.active !== false))
    setBookings(cachedBookings ?? [])
    setLoadedBillingEditorDependencyScopeKey('')
  }, [activeUnitId, queryClient])

  useEffect(() => {
    // Location-specific caches have their own keys so changing the top-level location
    // cannot briefly display rows/counters from the previously selected location.
    setUnusedAdvances([])
    setUnusedAdvancesPageMeta(EMPTY_BILLING_SERVER_PAGE)
    setUnusedAdvancesServerTotal(0)
    setGiftCards([])
    setGiftCardsPageMeta(EMPTY_BILLING_SERVER_PAGE)
    setGiftCardServerStats(null)
    setBills([])
    setLoadedBillsView(null)
    setHistoryPageMeta(EMPTY_BILLING_SERVER_PAGE)
    setOpenPaymentsPageMeta(EMPTY_BILLING_SERVER_PAGE)
    setHistoryServerStats(null)
    setOpenPaymentsServerTotal(0)
    setBillingSummary(queryClient.getQueryData<BillingSummary>(queryKeys.billing.summary(activeUnitId, selectedLocationId)) ?? null)
    setClients(queryClient.getQueryData<Client[]>(queryKeys.clients.options(activeUnitId, selectedLocationId, 500)) ?? [])
    setCompanies(queryClient.getQueryData<Company[]>(queryKeys.billing.editorCompanies(activeUnitId, selectedLocationId)) ?? [])
    setLoadedBillingEditorDependencyScopeKey('')
  }, [activeUnitId, selectedLocationId, queryClient])

  useEffect(() => {
    // Embedded invoice editing has its own lightweight single-open-bill bootstrap below.
    // Do not compete with that critical request by loading the complete Billing page first.
    if (editorOnlyMode) return
    const request = load(false)
    billingPollInFlightRef.current = request
    const clear = () => {
      if (billingPollInFlightRef.current === request) billingPollInFlightRef.current = null
    }
    void request.then(clear, clear)
  }, [activeUnitId, billingTab, selectedLocationId, editorOnlyMode, debouncedOpenPaymentsSearch, openPaymentsSort, openPaymentsPage, debouncedUnusedAdvancesSearch, unusedAdvancesSort, unusedAdvancesPage, debouncedGiftCardSearch, giftCardDateFrom, giftCardDateTo, giftCardStatusFilter, giftCardsSort, giftCardsPage, debouncedHistorySearch, historyDateFrom, historyDateTo, historyStatusFilter, historyFiscalStatusFilter, historyBillTypeFilter, historySortField, historySortDir, historyPage])

  useEffect(() => {
    // For an embedded existing bill, wait until the bill itself is visible before loading
    // the editor catalogs. This keeps first paint dependent on one request instead of many.
    if (!embeddedCreateBill && detailOpenBill == null) return
    void loadBillingEditorDependencies(false)
  }, [activeUnitId, detailOpenBill?.id, embeddedCreateBill, selectedLocationId])

  useEffect(() => {
    // Related group tabs need the complete open-bill list, but not for first paint. Load it
    // only after the requested open bill is already on screen.
    if (!editorOnlyMode || detailOpenBill == null) return
    let cancelled = false
    void fetchBillingQuery(openBillsQueryOptions<OpenBill>(activeUnitId), true)
      .then((rows) => {
        if (cancelled) return
        const normalizedRows = rows.map((openBill) => normalizeOpenBill(openBill))
        const active = detailOpenBill
        if (active && !normalizedRows.some((entry) => Number(entry.id) === Number(active.id))) {
          normalizedRows.unshift(active)
        }
        queryClient.setQueryData(queryKeys.billing.openBills(activeUnitId), normalizedRows)
        setOpenBills(normalizedRows)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [activeUnitId, detailOpenBill?.id, editorOnlyMode, queryClient])

  useEffect(() => {
    if (editorOnlyMode) return
    const poll = () => {
      if (document.visibilityState !== 'visible' || billingPollInFlightRef.current) return
      const request = refreshBillingRows()
      billingPollInFlightRef.current = request
      const clear = () => {
        if (billingPollInFlightRef.current === request) billingPollInFlightRef.current = null
      }
      void request.then(clear, clear)
    }
    const interval = window.setInterval(poll, 30000)
    document.addEventListener('visibilitychange', poll)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', poll)
    }
  }, [activeUnitId, billingTab, selectedLocationId, editorOnlyMode, debouncedOpenPaymentsSearch, openPaymentsSort, openPaymentsPage, debouncedUnusedAdvancesSearch, unusedAdvancesSort, unusedAdvancesPage, debouncedGiftCardSearch, giftCardDateFrom, giftCardDateTo, giftCardStatusFilter, giftCardsSort, giftCardsPage, debouncedHistorySearch, historyDateFrom, historyDateTo, historyStatusFilter, historyFiscalStatusFilter, historyBillTypeFilter, historySortField, historySortDir, historyPage])

  const advanceBillingEnabled = settings.BILLING_ADVANCE_ENABLED !== 'false'
  const entitlementsEnabled = settings.ENTITLEMENTS_ENABLED !== 'false'
  const giftCardsEnabled =
    entitlementsEnabled && settings.BILLING_GIFT_CARDS_ENABLED === 'true'
  const fiscalCashRegisterEnabled = settings.BILLING_FISCAL_CASH_REGISTER_ENABLED === 'true'
  const stripeBillingEnabled = settings.BILLING_ONLINE_CARD_PAYMENTS_ENABLED !== 'false'
  const visiblePaymentMethods = useMemo(
    () => {
      const locationFiltered = selectedLocationId == null
        ? paymentMethods
        : paymentMethods.filter((method) => method.availableAllLocations !== false
          || (Array.isArray(method.locationIds) && method.locationIds.some((id) => Number(id) === Number(selectedLocationId))))
      const stripeFiltered = stripeBillingEnabled ? locationFiltered : locationFiltered.filter((method) => !isStripePaymentMethod(method))
      return advanceBillingEnabled ? stripeFiltered : stripeFiltered.filter((method) => !isDepositPaymentMethod(method))
    },
    [advanceBillingEnabled, paymentMethods, selectedLocationId, stripeBillingEnabled],
  )

  const defaultInvoiceIssuerId = invoiceIssuers.find((issuer) => issuer.defaultForCurrentUnit)?.id ?? invoiceIssuers[0]?.id
  const selectedInvoiceLocationId = selectedLocationId && invoiceLocations.some((location) => location.id === selectedLocationId)
    ? selectedLocationId
    : undefined
  const defaultInvoiceLocationId = selectedInvoiceLocationId
    ?? (invoiceLocations.length === 1
      ? invoiceLocations[0]?.id
      : invoiceLocations.find((location) => location.defaultLocation)?.id ?? invoiceLocations[0]?.id)
  const compatibleInvoiceSeries = useMemo(() => {
    if (!billForm.legalEntityId || !billForm.locationId) return []
    const issuerSeries = invoiceSeriesOptions.filter((series) => series.legalEntityId === billForm.legalEntityId)
    const locationSeries = issuerSeries.filter((series) => series.locationId === billForm.locationId)
    // Prefer the location-owned counter. Generic series remain only as a legacy fallback;
    // the backend converts their use into a dedicated location series on issuance.
    return locationSeries.length > 0 ? locationSeries : issuerSeries.filter((series) => series.locationId == null)
  }, [invoiceSeriesOptions, billForm.legalEntityId, billForm.locationId])

  useEffect(() => {
    if (invoiceIssuers.length === 0 || invoiceLocations.length === 0) return
    setBillForm((current) => {
      const locationId = selectedInvoiceLocationId
        ?? (current.locationId && invoiceLocations.some((location) => location.id === current.locationId)
          ? current.locationId
          : defaultInvoiceLocationId)
      const locationDefaultIssuerId = invoiceLocations.find((location) => location.id === locationId)?.defaultLegalEntityId
      const preferredIssuerId = locationDefaultIssuerId && invoiceIssuers.some((issuer) => issuer.id === locationDefaultIssuerId)
        ? locationDefaultIssuerId : defaultInvoiceIssuerId
      const legalEntityId = current.legalEntityId && invoiceIssuers.some((issuer) => issuer.id === current.legalEntityId) && current.locationId === locationId && !selectedInvoiceLocationId
        ? current.legalEntityId : preferredIssuerId
      const issuerSeries = invoiceSeriesOptions.filter((series) => series.legalEntityId === legalEntityId)
      const locationSeries = issuerSeries.filter((series) => series.locationId === locationId)
      const available = locationSeries.length > 0
        ? locationSeries
        : issuerSeries.filter((series) => series.locationId == null)
      const invoiceSeriesId = current.invoiceSeriesId && available.some((series) => series.id === current.invoiceSeriesId) && current.locationId === locationId
        ? current.invoiceSeriesId
        : (available.find((series) => series.defaultForCurrentUnit)?.id ?? available[0]?.id)
      if (current.locationId === locationId && current.legalEntityId === legalEntityId && current.invoiceSeriesId === invoiceSeriesId) return current
      return { ...current, locationId, legalEntityId, invoiceSeriesId }
    })
  }, [invoiceIssuers, invoiceLocations, invoiceSeriesOptions, defaultInvoiceIssuerId, defaultInvoiceLocationId, selectedInvoiceLocationId])

  useEffect(() => {
    if (!billForm.sessionId || selectedInvoiceLocationId != null) return
    const booking = bookings.find((entry) => entry.id === billForm.sessionId)
    const bookingLocationId = booking?.location?.id ?? booking?.space?.location?.id
    if (bookingLocationId && bookingLocationId !== billForm.locationId) {
      const locationDefaultIssuerId = invoiceLocations.find((location) => location.id === bookingLocationId)?.defaultLegalEntityId
      setBillForm((current) => ({
        ...current,
        locationId: bookingLocationId,
        legalEntityId: locationDefaultIssuerId && invoiceIssuers.some((issuer) => issuer.id === locationDefaultIssuerId)
          ? locationDefaultIssuerId : current.legalEntityId,
        invoiceSeriesId: undefined,
      }))
    }
  }, [billForm.sessionId, bookings, invoiceIssuers, invoiceLocations, selectedInvoiceLocationId])

  const loadWorkspaceBills = async () => {
    setWorkspaceBillsLoading(true)
    try {
      const { data } = await api.get('/billing/workspace-bills?size=500')
      setWorkspaceBills(Array.isArray(data) ? data : [])
    } catch (error: any) {
      showToast('error', error?.response?.data?.message || (locale === 'sl' ? 'Skupne zgodovine računov ni bilo mogoče naložiti.' : 'Could not load workspace invoice history.'))
    } finally {
      setWorkspaceBillsLoading(false)
    }
  }

  const openWorkspaceBillHistory = async () => {
    if (embeddedMode) setShowWorkspaceBills(true)
    else openDrawer(BILLING_DRAWERS.workspaceBills, { search: pageSearch })
    await loadWorkspaceBills()
  }

  useEffect(() => {
    if (embeddedMode) return
    const fromUrl = parseBillingTab(location.search)
    setBillingTab((prev) => (prev === fromUrl ? prev : fromUrl))
  }, [embeddedMode, location.search])

  useEffect(() => {
    if (embeddedMode) return
    const legacyId = parseLegacyOpenBillEditPath(location.pathname)
    if (!legacyId) return
    navigate(buildDrawerUrl(BILLING_DRAWERS.openBill, {
      params: { id: String(legacyId) },
      search: location.search.replace(/^\?/, ''),
    }), { replace: true })
  }, [embeddedMode, location.pathname, location.search, navigate])

  useEffect(() => {
    if (!advanceBillingEnabled && billingTab === 'unusedAdvances') {
      if (embeddedMode) setBillingTab('open')
      else selectBillingTab('open')
      setSelectedUnusedAdvanceId(null)
    }
    if (!giftCardsEnabled && billingTab === 'giftCards') {
      if (embeddedMode) setBillingTab('open')
      else selectBillingTab('open')
    }
    if (!fiscalCashRegisterEnabled && historyFiscalStatusFilter !== 'all') {
      setHistoryFiscalStatusFilter('all')
    }
    if (!fiscalCashRegisterEnabled && folioPanelTab === 'fiscal') {
      setFolioPanelTab('invoice')
    }
  }, [advanceBillingEnabled, giftCardsEnabled, fiscalCashRegisterEnabled, billingTab, historyFiscalStatusFilter, folioPanelTab])

  useEffect(() => {
    if (entitlementsEnabled) return
    entitlementWalletRequestRef.current += 1
    stopEntitlementCamera()
    setEntitlementPaymentTarget(null)
    setEntitlementPaymentStep('choice')
    setEntitlementWalletOptions([])
    setEntitlementScanResult(null)
  }, [entitlementsEnabled])

  const embeddedCreateKey = embeddedCreateBill
    ? [
        embeddedCreateBill.billType,
        embeddedCreateBill.sessionId ?? '',
        embeddedCreateBill.clientId ?? '',
        (embeddedCreateBill.clientIds ?? []).join(','),
        embeddedCreateBill.consultantId ?? '',
        embeddedCreateBill.billingTarget ?? '',
        embeddedCreateBill.recipientCompanyId ?? '',
        (embeddedCreateBill.items ?? []).map((item) => `${item.transactionServiceId}:${item.quantity ?? 1}:${item.netPrice ?? ''}:${item.grossPrice ?? ''}`).join(','),
      ].join(':')
    : ''
  const embeddedCreateKeyRef = useRef('')

  useEffect(() => {
    if (!embeddedCreateBill) return
    if ((embeddedCreateBill.billType === 'ADVANCE' && !canIssueAdvanceInvoice) || (embeddedCreateBill.billType !== 'ADVANCE' && !canIssueOpenInvoice)) {
      embeddedCreateKeyRef.current = ''
      setShowCreateBillModal(false)
      onEmbeddedClose?.()
      showToast('error', embeddedCreateBill.billType === 'ADVANCE'
        ? (locale === 'sl' ? 'Nimate dovoljenja za izdajo predplačil.' : 'You do not have permission to issue advance invoices.')
        : (locale === 'sl' ? 'Nimate dovoljenja za izdajo odprtih računov.' : 'You do not have permission to issue open invoices.'))
      return
    }
    if (embeddedCreateBill.billType === 'ADVANCE' && !advanceBillingEnabled) {
      embeddedCreateKeyRef.current = ''
      setShowCreateBillModal(false)
      onEmbeddedClose?.()
      return
    }
    if (loadedBillingEditorDependencyScopeKey !== billingEditorDependencyScopeKey) return
    const embeddedItemsNeedCatalog = (embeddedCreateBill.items ?? []).some((item) =>
      String(item.netPrice ?? '').trim() === '' || String(item.grossPrice ?? '').trim() === '')
    if (embeddedItemsNeedCatalog && !servicesLoaded) return
    if (embeddedCreateKeyRef.current === embeddedCreateKey) return
    embeddedCreateKeyRef.current = embeddedCreateKey
    const defaultPaymentMethodId = visiblePaymentMethods.find((method) => !isDepositPaymentMethod(method))?.id ?? visiblePaymentMethods[0]?.id
    const normalizedBillingTarget = embeddedCreateBill.billingTarget === 'COMPANY' ? 'COMPANY' : 'PERSON'
    const embeddedClientIds = Array.from(new Set([embeddedCreateBill.clientId, ...(embeddedCreateBill.clientIds ?? [])]
      .map((value) => Number(value ?? 0))
      .filter((value) => Number.isInteger(value) && value > 0)))
    const embeddedItems = (embeddedCreateBill.items ?? []).map((item) => {
      const catalogService = services.find((service) => Number(service.id) === Number(item.transactionServiceId))
      const netPrice = String(item.netPrice ?? '').trim() || String(catalogService?.netPrice ?? '0.00')
      const grossPrice = String(item.grossPrice ?? '').trim() || grossStringFromService(catalogService)
      return {
        transactionServiceId: Number(item.transactionServiceId),
        quantity: Math.max(1, Number(item.quantity ?? 1) || 1),
        netPrice,
        grossPrice,
        sourceSessionBookingId: item.sourceSessionBookingId ?? embeddedCreateBill.sessionId ?? null,
      }
    }).filter((item) => Number.isInteger(item.transactionServiceId) && item.transactionServiceId > 0)
    setBillForm({
      items: embeddedItems,
      paymentMethodId: defaultPaymentMethodId,
      billingTarget: normalizedBillingTarget,
      billType: embeddedCreateBill.billType,
      sessionId: embeddedCreateBill.sessionId ?? undefined,
      clientId: embeddedClientIds[0] ?? embeddedCreateBill.clientId ?? undefined,
      consultantId: embeddedCreateBill.consultantId ?? me.id,
      recipientCompanyId: normalizedBillingTarget === 'COMPANY' ? (embeddedCreateBill.recipientCompanyId ?? undefined) : undefined,
    })
    setBillingTab(embeddedCreateBill.billType === 'ADVANCE' && advanceBillingEnabled ? 'unusedAdvances' : 'open')
    setEditingCreateBillPayee(false)
    setShowCreateBillModal(true)
  }, [embeddedCreateBill, embeddedCreateKey, visiblePaymentMethods, advanceBillingEnabled, canIssueAdvanceInvoice, canIssueOpenInvoice, locale, me.id, onEmbeddedClose, services, servicesLoaded, showToast, billingEditorDependencyScopeKey, loadedBillingEditorDependencyScopeKey])
  /** Keep the side panel in sync when open bills reload (e.g. apply advance, polling) unless there are unsaved line edits. */
  useEffect(() => {
    setDetailOpenBill((prev) => {
      if (!prev) return prev
      if (Object.prototype.hasOwnProperty.call(openBillEdits, prev.id)) return prev
      if (Object.prototype.hasOwnProperty.call(openBillDetailsEdits, prev.id)) return prev
      if (Object.prototype.hasOwnProperty.call(openBillPaymentEdits, prev.id)) return prev
      const fresh = openBills.find((o) => o.id === prev.id)
      if (!fresh) return prev
      const prevSig = prev.items.map((i) => i.id).join()
      const freshSig = fresh.items.map((i) => i.id).join()
      if (prevSig === freshSig) return prev
      return normalizeOpenBill(fresh)
    })
  }, [openBills, openBillEdits, openBillDetailsEdits, openBillPaymentEdits])
  useEffect(() => {
    if (!detailOpenBill) {
      setExpandedBatchSessionId(null)
      return
    }
    const sessionIds = (detailOpenBill.sessions ?? []).map((session) => session.sessionId)
    const firstSessionId = sessionIds[0] ?? detailOpenBill.sessionId ?? null
    const isBatched = (detailOpenBill.batchScope ?? 'NONE') !== 'NONE' || (detailOpenBill.sessions?.length ?? 0) > 1
    if (!isBatched || firstSessionId == null) {
      setExpandedBatchSessionId(null)
      return
    }
    setExpandedBatchSessionId((prev) => (prev != null && sessionIds.includes(prev) ? prev : firstSessionId))
  }, [detailOpenBill])
  useEffect(() => {
    closeAdvancePaymentModal()
  }, [detailOpenBill?.id])
  useEffect(() => {
    const selected = unusedAdvances.find((entry) => entry.advanceBillId === selectedUnusedAdvanceId)
    if (!selected) return
    setApplyAmountNet(String(selected.remainingNet ?? ''))
  }, [selectedUnusedAdvanceId, unusedAdvances])

  useEffect(() => {
    if (!entitlementPaymentTarget || entitlementPaymentStep !== 'scanner') {
      stopEntitlementCamera()
      return
    }
    const timer = window.setTimeout(() => { void startEntitlementCamera() }, 120)
    return () => {
      window.clearTimeout(timer)
      stopEntitlementCamera()
    }
  }, [entitlementPaymentTarget?.openBillId, entitlementPaymentTarget?.splitKey, entitlementPaymentStep])

  const openBillClientLabel = (ob: OpenBill) => {
    if (ob.batchScope === 'COMPANY') {
      if (ob.sessions && ob.sessions.length > 1) return `${ob.sessions.length} sessions (company batch)`
      if (ob.sessions?.[0]?.clientName) return ob.sessions[0].clientName
    }
    return ob.client ? fullName(ob.client) : (ob.sessions?.[0]?.clientName || '—')
  }

  const openBillConsultantLabel = (ob: OpenBill) => {
    if (ob.batchScope === 'COMPANY' && (ob.sessions?.length ?? 0) > 1) return 'Multiple consultants'
    if (ob.consultant) return fullName(ob.consultant)
    return ob.sessions?.[0]?.consultantName || '—'
  }

  const uniqueNonBlankLabels = (labels: Array<string | null | undefined>) => {
    const seen = new Set<string>()
    const result: string[] = []
    labels.forEach((label) => {
      const cleaned = String(label || '').trim()
      if (!cleaned) return
      const key = cleaned.toLocaleLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      result.push(cleaned)
    })
    return result
  }

  const compactClientListLabel = (labels: string[]) => {
    const unique = uniqueNonBlankLabels(labels)
    if (unique.length <= 2) return unique.join(', ')
    return `${unique.slice(0, 2).join(', ')} +${unique.length - 2}`
  }

  const findServiceClientNameForSessionId = (sessionId: number | null | undefined, preferredBill?: OpenBill) => {
    const id = Number(sessionId)
    if (!Number.isFinite(id) || id <= 0) return ''

    const fromPreferredBill = preferredBill?.sessions?.find((session) => Number(session.sessionId) === id)?.clientName
    if (fromPreferredBill?.trim()) return fromPreferredBill.trim()

    for (const entry of openBills) {
      const fromOpenBill = entry.sessions?.find((session) => Number(session.sessionId) === id)?.clientName
      if (fromOpenBill?.trim()) return fromOpenBill.trim()
    }

    for (const booking of bookings) {
      if (Number(booking.id) === id && booking.client) {
        return fullName(booking.client)
      }

      const status = (booking.paymentStatuses ?? []).find((entry) => Number(entry.bookingId ?? booking.id) === id)
      const statusClientId = Number(status?.clientId)
      if (Number.isFinite(statusClientId) && statusClientId > 0) {
        const participant = (booking.clients ?? []).find((client) => Number(client.id) === statusClientId)
          || (Number(booking.client?.id) === statusClientId ? booking.client : null)
          || clients.find((client) => Number(client.id) === statusClientId)
        if (participant) return fullName(participant)
      }
    }

    return ''
  }

  const openBillServiceClientNames = (ob: OpenBill, items = getOpenBillItems(ob)) => {
    const labels: string[] = []
    items.forEach((item) => {
      if (isManualOpenBillLineSourceId(item.sourceSessionBookingId)) return
      const sourceSessionId = item.sourceSessionBookingId ?? ob.sessionId ?? null
      const fromSession = findServiceClientNameForSessionId(sourceSessionId, ob)
      if (fromSession) labels.push(fromSession)
    })
    ;(ob.sessions ?? []).forEach((session) => {
      if (session.clientName) labels.push(session.clientName)
    })
    return uniqueNonBlankLabels(labels)
  }

  const openBillServiceClientLabel = (ob: OpenBill) => compactClientListLabel(openBillServiceClientNames(ob))

  const openBillItemServiceClientLabel = (ob: OpenBill, item: OpenBillEditItem) => {
    if (isManualOpenBillLineSourceId(item.sourceSessionBookingId)) return '—'
    const sourceSessionId = item.sourceSessionBookingId ?? ob.sessionId ?? null
    const fromSession = findServiceClientNameForSessionId(sourceSessionId, ob)
    return fromSession || openBillServiceClientLabel(ob) || '—'
  }

  const openBillBillingTarget = (ob: OpenBill): 'PERSON' | 'COMPANY' => (
    ob.batchScope === 'COMPANY' || ob.batchTargetCompanyId != null ? 'COMPANY' : 'PERSON'
  )

  const openBillRecipientCompanyId = (ob: OpenBill): number | undefined => {
    if (ob.batchTargetCompanyId != null) return ob.batchTargetCompanyId
    const clientDetails = ob.client?.id ? clients.find((client) => client.id === ob.client?.id) : null
    return clientDetails?.billingCompany?.id
  }

  const deriveOpenBillDetailsDraft = (ob: OpenBill): OpenBillDetailsDraft => {
    const sessions = ob.sessions ?? []
    const singlePositiveSession = sessions.length === 1 && sessions[0].sessionId > 0 ? sessions[0].sessionId : undefined
    const entitySessionId = ob.sessionId != null && ob.sessionId > 0 ? ob.sessionId : undefined
    const billingTarget = openBillBillingTarget(ob)
    const clientId = ob.client?.id
    const linkedCompanyId = clientId != null
      ? clients.find((client) => client.id === clientId)?.billingCompany?.id
      : undefined
    const recipientCompanyId = openBillRecipientCompanyId(ob) ?? (billingTarget === 'COMPANY' ? linkedCompanyId : undefined)
    return {
      billingTarget,
      clientId,
      recipientCompanyId,
      consultantId: ob.consultant?.id,
      sessionId: entitySessionId ?? singlePositiveSession,
    }
  }

  const getOpenBillDetailsDraft = (ob: OpenBill): OpenBillDetailsDraft => (
    openBillDetailsEdits[ob.id] ?? deriveOpenBillDetailsDraft(ob)
  )

  const mergeOpenBillDetailsDraft = (
    current: OpenBillDetailsDraft,
    patch: Partial<OpenBillDetailsDraft>,
  ): OpenBillDetailsDraft => {
    let next: OpenBillDetailsDraft = { ...current, ...patch }

    if (patch.billingTarget === 'PERSON') {
      next = { ...next, recipientCompanyId: undefined }
    }

    if (patch.billingTarget === 'COMPANY') {
      const linkedCompanyId = next.clientId != null
        ? clients.find((client) => client.id === next.clientId)?.billingCompany?.id
        : undefined
      next = {
        ...next,
        recipientCompanyId: next.recipientCompanyId ?? linkedCompanyId,
      }
    }

    if (patch.clientId !== undefined && next.billingTarget === 'COMPANY' && next.recipientCompanyId == null) {
      const selected = clients.find((client) => client.id === patch.clientId)
      next = { ...next, recipientCompanyId: selected?.billingCompany?.id ?? next.recipientCompanyId }
    }

    return next
  }

  const openOpenBillPayeeEditor = (ob: OpenBill) => {
    setOpenBillPayeeDialogDraft({
      openBillId: ob.id,
      details: { ...getOpenBillDetailsDraft(ob) },
      clientEdits: {},
      companyEdits: {},
    })
    setEditingOpenBillPayeeId(ob.id)
  }

  const closeOpenBillPayeeEditor = () => {
    setEditingOpenBillPayeeId(null)
    setOpenBillPayeeDialogDraft(null)
    setRecipientCompanyPickerOpen(false)
    setEditingRecipientCompanySearch(false)
  }

  useEffect(() => {
    if (!activeOpenBillId) return
    let cancelled = false

    const hydrateTarget = (raw: OpenBill) => {
      if (cancelled || !raw) return
      const target = normalizeOpenBill(raw)
      setBillingTab('open')
      setOpenBillEditorRootId((current) => current ?? target.id)
      setDetailOpenBill((prev) => (prev?.id === target.id ? prev : target))
      setOpenBills((prev) => {
        const existingIndex = prev.findIndex((entry) => Number(entry.id) === Number(target.id))
        if (existingIndex < 0) return [target, ...prev]
        const next = [...prev]
        next[existingIndex] = target
        return next
      })
      setOpenBillDetailsEdits((prev) => (
        Object.prototype.hasOwnProperty.call(prev, target.id)
          ? prev
          : { ...prev, [target.id]: deriveOpenBillDetailsDraft(target) }
      ))
    }

    const cached = queryClient.getQueryData<OpenBill>(queryKeys.billing.openBill(activeUnitId, activeOpenBillId))
    if (cached) hydrateTarget(cached)

    void queryClient.fetchQuery(openBillQueryOptions<OpenBill>(activeUnitId, activeOpenBillId))
      .then(hydrateTarget)
      .catch(async () => {
        if (cancelled) return
        // Compatibility/recovery fallback: if the targeted request fails, try the list once
        // instead of leaving the editor in an endless loading state.
        try {
          const rows = await fetchBillingQuery(openBillsQueryOptions<OpenBill>(activeUnitId), true)
          if (cancelled) return
          const target = rows.find((entry) => Number(entry?.id) === Number(activeOpenBillId))
          if (target) {
            hydrateTarget(target)
            return
          }
        } catch {
          // Fall through to closing the missing/unavailable editor.
        }
        if (cancelled) return
        if (onEmbeddedClose) {
          onEmbeddedClose()
          return
        }
        if (openBillDrawerOpen) closeDrawer()
        else navigate(pageSearch ? `/billing?${pageSearch}` : '/billing', { replace: true })
      })

    return () => {
      cancelled = true
    }
  }, [activeOpenBillId, activeRouteOpenBillId, activeUnitId, navigate, onEmbeddedClose, queryClient])

  useEffect(() => {
    if (!activeOpenBillId) return
    const target = openBills.find((entry) => Number(entry.id) === Number(activeOpenBillId)) || null
    if (!target) return
    setBillingTab('open')
    setOpenBillEditorRootId(target.id)
    setDetailOpenBill((prev) => (prev?.id === target.id ? prev : normalizeOpenBill(target)))
    setOpenBillDetailsEdits((prev) => (
      Object.prototype.hasOwnProperty.call(prev, target.id)
        ? prev
        : { ...prev, [target.id]: deriveOpenBillDetailsDraft(target) }
    ))
  }, [activeOpenBillId, openBills, clients])

  useEffect(() => {
    if (activeOpenBillId != null || embeddedCreateBill) return
    setDetailOpenBill(null)
    setOpenBillEditorRootId(null)
  }, [activeOpenBillId, embeddedCreateBill])

  useEffect(() => {
    if (!giftCardDrawerOpen) {
      if (!embeddedMode) setDetailGiftCard(null)
      return
    }
    const id = Number(drawerId)
    if (!Number.isInteger(id) || id <= 0) return
    setDetailGiftCard((prev) => {
      if (prev?.id === id) return prev
      return giftCards.find((card) => card.id === id) ?? prev
    })
  }, [drawerId, embeddedMode, giftCardDrawerOpen, giftCards])


  useEffect(() => {
    if (!clients.length) return
    setOpenBillDetailsEdits((prev) => {
      let changed = false
      const next: Record<number, OpenBillDetailsDraft> = { ...prev }
      Object.entries(prev).forEach(([openBillIdRaw, draft]) => {
        if (!draft || draft.billingTarget !== 'COMPANY' || draft.recipientCompanyId != null || draft.clientId == null) return
        const linkedCompanyId = clients.find((client) => client.id === draft.clientId)?.billingCompany?.id
        if (linkedCompanyId == null) return
        const openBillId = Number(openBillIdRaw)
        next[openBillId] = { ...draft, recipientCompanyId: linkedCompanyId }
        changed = true
      })
      return changed ? next : prev
    })
  }, [clients])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1024px)')
    const apply = () => setIsOpenBillsMobile(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1024px)')
    const apply = () => setIsBillingMobileOrTablet(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])


  useEffect(() => {
    if (!isOpenBillsMobile) return
    const container = billingTabsRef.current
    const activeTab = container?.querySelector<HTMLButtonElement>('.clients-session-tab.active')
    if (!container || !activeTab) return
    const left = activeTab.offsetLeft - (container.clientWidth - activeTab.offsetWidth) / 2
    container.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
  }, [billingTab, isOpenBillsMobile])

  useEffect(() => {
    if (!openBillsSortMenuOpen && !historySortMenuOpen) return
    const onDocPointerDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest('.billing-open-mobile-sort-wrap')) return
      setOpenBillsSortMenuOpen(false)
      setHistorySortMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocPointerDown)
    return () => document.removeEventListener('mousedown', onDocPointerDown)
  }, [openBillsSortMenuOpen, historySortMenuOpen])

  useEffect(() => {
    if (!openBillPreviewChoice) return
    const onDocPointerDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest('.billing-preview-choice-anchor')) return
      setOpenBillPreviewChoice(null)
    }
    document.addEventListener('mousedown', onDocPointerDown)
    return () => document.removeEventListener('mousedown', onDocPointerDown)
  }, [openBillPreviewChoice])

  useEffect(() => {
    if (!historyExportMenuOpen) return
    const onDocPointerDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest('.billing-history-export')) return
      setHistoryExportMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocPointerDown)
    return () => document.removeEventListener('mousedown', onDocPointerDown)
  }, [historyExportMenuOpen])

  const grossPreview = useMemo(() => billForm.items.reduce((sum, item) => {
    const gross = Number(item.grossPrice || 0)
    return sum + (Number.isFinite(gross) ? gross : 0) * Number(item.quantity || 0)
  }, 0), [billForm.items])
  const configuredAdvanceServiceIds = useMemo(
    () => parseAdvanceDeductionServiceIds(settings.ADVANCE_DEDUCTION_TRANSACTION_SERVICE_ID),
    [settings.ADVANCE_DEDUCTION_TRANSACTION_SERVICE_ID],
  )
  const advanceDeductionIds = useMemo(
    () => advanceBillingEnabled ? configuredAdvanceServiceIds : new Set<number>(),
    [advanceBillingEnabled, configuredAdvanceServiceIds],
  )
  const advanceBillServices = useMemo(
    () => services.filter((s) => advanceDeductionIds.has(s.id)),
    [services, advanceDeductionIds],
  )
  const openBillSelectableServices = useMemo(
    () => services.filter((s) => !advanceDeductionIds.has(s.id)),
    [services, advanceDeductionIds],
  )
  const invoiceCatalogServices = useMemo<BillingCatalogService[]>(() => {
    const serviceById = new Map<number, BillingService>(services.map((service) => [Number(service.id), service] as [number, BillingService]))
    return sessionTypes
      .filter((type) => type.active !== false)
      .flatMap((type) => {
        const configuredLinks = type.linkedServices ?? []
        const regularLinks = configuredLinks.filter((link) => !configuredAdvanceServiceIds.has(Number(link.transactionServiceId)))

        // A service backed only by an "Avans" billing line belongs to advance
        // invoicing and must not appear in the normal unissued-invoice catalog.
        if (configuredLinks.length > 0 && regularLinks.length === 0) return []

        const mappedBillingService = services.find((service) => (
          String(service.systemSource || '').toUpperCase() === 'SESSION_TYPE'
          && String(service.systemSourceKey || '') === String(type.id)
          && !configuredAdvanceServiceIds.has(Number(service.id))
        )) ?? null
        const firstLink = mappedBillingService
          ? regularLinks.find((link) => Number(link.transactionServiceId) === Number(mappedBillingService.id)) ?? regularLinks[0]
          : regularLinks[0]
        const transactionServiceId = mappedBillingService?.id ?? (firstLink ? Number(firstLink.transactionServiceId) : null)
        const displayName = mappedBillingService?.description?.trim()
          || type.description?.trim()
          || type.name?.trim()
          || (locale === 'sl' ? 'Storitev' : 'Service')
        const secondaryText = type.internalDescription?.trim() || ''

        let priceGross: number | null = null
        if (mappedBillingService) {
          priceGross = Number(grossStringFromService(mappedBillingService))
        } else if (regularLinks.length > 0) {
          const grossParts = regularLinks.map((link) => {
            const configuredPrice = link.unitGross ?? link.price
            if (configuredPrice != null && Number.isFinite(Number(configuredPrice))) return Number(configuredPrice)
            const linkedService = serviceById.get(Number(link.transactionServiceId))
            if (linkedService) return Number(grossStringFromService(linkedService))
            return Number.NaN
          })
          if (grossParts.every(Number.isFinite)) {
            priceGross = Number(grossParts.reduce((sum, value) => sum + value, 0).toFixed(2))
          }
        }

        return [{
          key: `session-type-${type.id}`,
          sessionTypeId: type.id,
          transactionServiceId: transactionServiceId != null && transactionServiceId > 0 ? transactionServiceId : null,
          displayName,
          secondaryText,
          priceGross,
        }]
      })
  }, [sessionTypes, services, configuredAdvanceServiceIds, locale])
  const advanceCatalogServices = useMemo<BillingCatalogService[]>(
    () => advanceBillServices.map((service) => ({
      key: `billing-service-${service.id}`,
      transactionServiceId: service.id,
      displayName: billingServiceDisplayLabel(service),
      secondaryText: String(service.code || '').trim().toLocaleLowerCase() !== String(service.description || '').trim().toLocaleLowerCase()
        ? String(service.code || '').trim()
        : '',
      priceGross: Number(grossStringFromService(service)),
    })),
    [advanceBillServices],
  )
  const invoiceCatalogServiceByTransactionId = useMemo(() => {
    const map = new Map<number, BillingCatalogService>()
    invoiceCatalogServices.forEach((service) => {
      if (service.transactionServiceId != null && !map.has(service.transactionServiceId)) {
        map.set(service.transactionServiceId, service)
      }
    })
    return map
  }, [invoiceCatalogServices])

  const guestProductTypeLabel = (product: BillingGuestProduct) => {
    const type = String(product.productType || '').toUpperCase()
    if (locale === 'sl') {
      if (type === 'MEMBERSHIP') return 'Članarina'
      if (type === 'PACK') return 'Paket obiskov'
      if (type === 'CLASS_TICKET') return 'Karta'
      if (type === 'COURSE') return 'Dostop do tečaja'
      if (type === 'GIFT_CARD') return 'Bon'
      return 'Ugodnost'
    }
    if (type === 'MEMBERSHIP') return 'Membership'
    if (type === 'PACK') return 'Pack'
    if (type === 'CLASS_TICKET') return 'Ticket'
    if (type === 'COURSE') return 'Course access'
    if (type === 'GIFT_CARD') return 'Gift card'
    return 'Benefit'
  }

  const guestProductCatalogMetaByTransactionServiceId = useMemo(() => {
    const map = new Map<number, { displayName: string; secondaryText: string }>()
    guestProducts.forEach((product) => {
      const legacyTransactionServiceId = Number(product.transactionServiceId || 0)
      const mappedService = services.find((entry) => (
        String(entry.systemSource || '').toUpperCase() === 'GUEST_PRODUCT'
        && String(entry.systemSourceKey || '') === String(product.id)
      )) ?? services.find((entry) => Number(entry.id) === legacyTransactionServiceId)
      const transactionServiceId = Number(mappedService?.id || legacyTransactionServiceId || 0)
      if (!transactionServiceId || map.has(transactionServiceId)) return
      const productScope = product.serviceGroupName?.trim()
        || (product.sessionTypeNames ?? []).filter(Boolean).join(', ')
        || product.sessionTypeName?.trim()
        || ''
      map.set(transactionServiceId, {
        displayName: String(product.name || product.transactionServiceDescription || guestProductTypeLabel(product) || '').trim() || (locale === 'sl' ? 'Ugodnost' : 'Benefit'),
        secondaryText: [guestProductTypeLabel(product), productScope].filter(Boolean).join(' · '),
      })
    })
    return map
  }, [guestProducts, services, locale])
  const availableBillServices = useMemo(
    () => (billForm.billType === 'ADVANCE' ? advanceBillServices : openBillSelectableServices),
    [billForm.billType, advanceBillServices, openBillSelectableServices],
  )
  const selectableServicesForOpenBill = (ob: OpenBill | null | undefined) => (
    String(ob?.billType || 'INVOICE').toUpperCase() === 'ADVANCE' ? advanceBillServices : openBillSelectableServices
  )

  const normalizeDiscountType = (value: unknown): DiscountType => (String(value || '').toUpperCase() === 'AMOUNT' ? 'AMOUNT' : 'PERCENT')

  const sanitizeDiscountValueInput = (value: string) => value.replace(/[^0-9.,]/g, '').replace(',', '.')

  const discountValueNumber = (draft: LineItemDiscountDraft | null | undefined) => {
    const parsed = Number(String(draft?.value ?? '').replace(',', '.'))
    if (!Number.isFinite(parsed) || parsed <= 0) return 0
    return normalizeDiscountType(draft?.type) === 'PERCENT' ? Math.min(100, parsed) : parsed
  }

  const wholeBillPercentNumber = (draft: DiscountDraft | null | undefined) => {
    const parsed = Number(String(draft?.wholeBillPercent ?? '').replace(',', '.'))
    if (!Number.isFinite(parsed) || parsed <= 0) return 0
    return Math.min(99, parsed)
  }

  const discountLineGrossTotal = (item: { quantity: number; grossPrice: string }) => {
    const gross = Number(item.grossPrice || 0)
    const qty = Number(item.quantity || 0)
    if (!Number.isFinite(gross) || !Number.isFinite(qty)) return 0
    return Math.max(0, gross * qty)
  }

  const normalizeDiscountItemIndex = (
    rawIndex: number | string | null | undefined,
    items?: { quantity: number; grossPrice: string }[],
  ) => {
    if (rawIndex == null || !items?.length) return undefined
    const raw = Number(rawIndex)
    if (!Number.isFinite(raw)) return undefined
    return Math.min(items.length - 1, Math.max(0, Math.trunc(raw)))
  }

  const normalizeItemDiscountMap = (
    raw: unknown,
    options?: { keepZero?: boolean },
  ): Record<number, LineItemDiscountDraft> => {
    const keepZero = options?.keepZero === true
    const next: Record<number, LineItemDiscountDraft> = {}
    if (!raw) return next
    const add = (indexRaw: unknown, typeRaw: unknown, valueRaw: unknown) => {
      const index = Number(indexRaw)
      if (!Number.isFinite(index) || index < 0) return
      const value = sanitizeDiscountValueInput(String(valueRaw ?? '0'))
      const draft = { type: normalizeDiscountType(typeRaw), value }
      if (!keepZero && discountValueNumber(draft) <= 0) return
      next[Math.trunc(index)] = draft
    }
    if (Array.isArray(raw)) {
      raw.forEach((entry) => {
        const row = entry as { itemIndex?: unknown; index?: unknown; discountType?: unknown; type?: unknown; discountValue?: unknown; value?: unknown }
        add(row.itemIndex ?? row.index, row.discountType ?? row.type, row.discountValue ?? row.value)
      })
      return next
    }
    if (typeof raw === 'object') {
      Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => {
        const row = value as { discountType?: unknown; type?: unknown; discountValue?: unknown; value?: unknown }
        add(key, row?.discountType ?? row?.type, row?.discountValue ?? row?.value ?? value)
      })
    }
    return next
  }

  const getLineItemDiscount = (draft: DiscountDraft | null | undefined, index: number): LineItemDiscountDraft => {
    return draft?.itemDiscounts?.[index] ?? { type: 'PERCENT', value: '0' }
  }

  const calculateSingleLineDiscountGross = (lineGross: number, draft: LineItemDiscountDraft | null | undefined) => {
    const value = discountValueNumber(draft)
    const gross = Math.max(0, Number(lineGross || 0))
    if (gross <= 0 || value <= 0) return 0
    if (normalizeDiscountType(draft?.type) === 'AMOUNT') return Number(Math.min(gross, value).toFixed(2))
    return Number(Math.min(gross, gross * (value / 100)).toFixed(2))
  }

  const calculateDiscountedLineStates = (
    items: { quantity: number; grossPrice: string }[] | undefined,
    draft: DiscountDraft | null | undefined,
  ) => {
    const lineGrosses = (items ?? []).map(discountLineGrossTotal)
    const itemDiscountGrosses = lineGrosses.map((gross, index) => calculateSingleLineDiscountGross(gross, getLineItemDiscount(draft, index)))
    const afterItemGrosses = lineGrosses.map((gross, index) => Number(Math.max(0, gross - itemDiscountGrosses[index]).toFixed(2)))
    const pct = wholeBillPercentNumber(draft)
    const subtotalAfterItem = afterItemGrosses.reduce((sum, gross) => sum + gross, 0)
    const wholeDiscountGrosses = afterItemGrosses.map(() => 0)
    if (pct > 0 && subtotalAfterItem > 0) {
      let remaining = Number(Math.min(subtotalAfterItem, subtotalAfterItem * (pct / 100)).toFixed(2))
      const lastPositiveIndex = afterItemGrosses.reduce((last, gross, idx) => (gross > 0 ? idx : last), -1)
      afterItemGrosses.forEach((gross, index) => {
        if (gross <= 0 || remaining <= 0) return
        const discount = index === lastPositiveIndex
          ? Math.min(gross, remaining)
          : Math.min(gross, remaining, Number((gross * (pct / 100)).toFixed(2)))
        wholeDiscountGrosses[index] = Number(discount.toFixed(2))
        remaining = Number(Math.max(0, remaining - discount).toFixed(2))
      })
    }
    return lineGrosses.map((gross, index) => ({
      originalGross: Number(gross.toFixed(2)),
      itemDiscountGross: Number((itemDiscountGrosses[index] || 0).toFixed(2)),
      afterItemGross: Number((afterItemGrosses[index] || 0).toFixed(2)),
      wholeBillDiscountGross: Number((wholeDiscountGrosses[index] || 0).toFixed(2)),
      finalGross: Number(Math.max(0, (afterItemGrosses[index] || 0) - (wholeDiscountGrosses[index] || 0)).toFixed(2)),
    }))
  }

  const calculateDiscountGross = (
    subtotalGross: number,
    draft: DiscountDraft | null | undefined,
    items?: { quantity: number; grossPrice: string }[],
  ) => {
    const subtotal = Math.max(0, Number(subtotalGross || 0))
    if (items?.length) {
      const states = calculateDiscountedLineStates(items, draft)
      const finalGross = states.reduce((sum, row) => sum + row.finalGross, 0)
      return Number(Math.max(0, subtotal - finalGross).toFixed(2))
    }
    const pct = wholeBillPercentNumber(draft)
    if (subtotal <= 0 || pct <= 0) return 0
    return Number(Math.min(subtotal, subtotal * (pct / 100)).toFixed(2))
  }

  const calculateWholeBillDiscountGross = (
    subtotalGross: number,
    draft: DiscountDraft | null | undefined,
    items?: { quantity: number; grossPrice: string }[],
  ) => {
    const subtotal = Math.max(0, Number(subtotalGross || 0))
    if (items?.length) {
      return Number(calculateDiscountedLineStates(items, draft).reduce((sum, row) => sum + row.wholeBillDiscountGross, 0).toFixed(2))
    }
    const pct = wholeBillPercentNumber(draft)
    if (subtotal <= 0 || pct <= 0) return 0
    return Number(Math.min(subtotal, subtotal * (pct / 100)).toFixed(2))
  }

  const payableGrossAfterDiscount = (
    subtotalGross: number,
    draft: DiscountDraft | null | undefined,
    items?: { quantity: number; grossPrice: string }[],
  ) => {
    if (items?.length) {
      return Number(calculateDiscountedLineStates(items, draft).reduce((sum, row) => sum + row.finalGross, 0).toFixed(2))
    }
    const subtotal = Math.max(0, Number(subtotalGross || 0))
    return Number(Math.max(0, subtotal - calculateDiscountGross(subtotal, draft, items)).toFixed(2))
  }

  const shiftedItemDiscountsAfterRemoval = (current: Record<number, LineItemDiscountDraft> | undefined, removedIndex: number, nextLength: number) => {
    const next: Record<number, LineItemDiscountDraft> = {}
    Object.entries(current ?? {}).forEach(([key, value]) => {
      const index = Number(key)
      if (!Number.isFinite(index) || index === removedIndex) return
      const shifted = index > removedIndex ? index - 1 : index
      if (shifted >= 0 && shifted < nextLength) next[shifted] = value
    })
    return next
  }

  const getCreateBillDiscountDraft = (): DiscountDraft => {
    const itemDiscounts = normalizeItemDiscountMap(billForm.itemDiscounts, { keepZero: true })
    if (!Object.keys(itemDiscounts).length && billForm.discountItemIndex != null && billForm.discountValue) {
      itemDiscounts[billForm.discountItemIndex] = { type: normalizeDiscountType(billForm.discountType), value: billForm.discountValue }
    }
    const wholeBillPercent = billForm.wholeBillDiscountPercent ?? (billForm.discountItemIndex == null ? (billForm.discountValue ?? '0') : '0')
    return { wholeBillPercent, itemDiscounts }
  }

  const getOpenBillDiscountDraft = (ob: OpenBill | null | undefined): DiscountDraft => {
    if (!ob) return { wholeBillPercent: '0', itemDiscounts: {} }
    const edited = openBillDiscountEdits[ob.id]
    if (edited) return edited
    const itemDiscounts = normalizeItemDiscountMap(ob.itemDiscounts, { keepZero: true })
    if (!Object.keys(itemDiscounts).length && ob.discountItemIndex != null && ob.discountValue != null) {
      itemDiscounts[ob.discountItemIndex] = { type: normalizeDiscountType(ob.discountType), value: String(ob.discountValue) }
    }
    const legacyWholeValue = ob.discountItemIndex == null && String(ob.discountType || 'PERCENT').toUpperCase() !== 'AMOUNT' && ob.discountValue != null
      ? String(ob.discountValue)
      : '0'
    return {
      wholeBillPercent: ob.wholeBillDiscountPercent == null ? legacyWholeValue : String(ob.wholeBillDiscountPercent),
      itemDiscounts,
    }
  }

  const setOpenBillDiscountDraft = (ob: OpenBill, patch: Partial<DiscountDraft>) => {
    const current = getOpenBillDiscountDraft(ob)
    setOpenBillDiscountEdits((prev) => ({
      ...prev,
      [ob.id]: {
        wholeBillPercent: Object.prototype.hasOwnProperty.call(patch, 'wholeBillPercent') ? (patch.wholeBillPercent ?? '0') : current.wholeBillPercent,
        itemDiscounts: Object.prototype.hasOwnProperty.call(patch, 'itemDiscounts') ? (patch.itemDiscounts ?? {}) : current.itemDiscounts,
      },
    }))
  }

  const setOpenBillItemDiscountDraft = (ob: OpenBill, index: number, patch: Partial<LineItemDiscountDraft>) => {
    const current = getOpenBillDiscountDraft(ob)
    const existing = getLineItemDiscount(current, index)
    const nextLine = {
      type: patch.type ?? existing.type,
      value: Object.prototype.hasOwnProperty.call(patch, 'value') ? (patch.value ?? '0') : existing.value,
    }
    const nextItemDiscounts = { ...(current.itemDiscounts ?? {}) }
    nextItemDiscounts[index] = nextLine
    setOpenBillDiscountDraft(ob, { itemDiscounts: nextItemDiscounts })
  }

  const openBillPayableGross = (ob: OpenBill, items = getOpenBillItems(ob)) => {
    const subtotal = estimateGross(items)
    return payableGrossAfterDiscount(subtotal, getOpenBillDiscountDraft(ob), items)
  }

  const discountPayloadFields = (
    draft: DiscountDraft,
    subtotalGross: number,
    items?: { quantity: number; grossPrice: string }[],
  ) => {
    const wholeBillDiscountPercent = wholeBillPercentNumber(draft)
    const normalizedItems = Object.entries(draft.itemDiscounts ?? {})
      .map(([key, value]) => ({ index: normalizeDiscountItemIndex(key, items), value }))
      .filter((entry): entry is { index: number; value: LineItemDiscountDraft } => entry.index != null && discountValueNumber(entry.value) > 0)
      .map((entry) => ({
        itemIndex: entry.index,
        discountType: normalizeDiscountType(entry.value.type),
        discountValue: discountValueNumber(entry.value),
      }))
    const amountGross = calculateDiscountGross(subtotalGross, draft, items)
    return {
      discountType: 'PERCENT' as DiscountType,
      discountValue: wholeBillDiscountPercent,
      discountAmountGross: amountGross,
      discountedTotalGross: payableGrossAfterDiscount(subtotalGross, draft, items),
      discountItemIndex: null,
      wholeBillDiscountPercent,
      itemDiscounts: normalizedItems,
    }
  }

  const createBillDiscountDraft = getCreateBillDiscountDraft()
  const createBillDiscountGross = calculateDiscountGross(grossPreview, createBillDiscountDraft, billForm.items)
  const createBillPayableGross = payableGrossAfterDiscount(grossPreview, createBillDiscountDraft, billForm.items)
  useEffect(() => {
    const firstAllowed = availableBillServices[0]
    const allowedIds = new Set(availableBillServices.map((s) => s.id))
    setBillForm((prev) => {
      if (!firstAllowed) {
        if (prev.items.length === 0) return prev
        return { ...prev, items: [] }
      }
      let changed = false
      const nextItems = prev.items.map((item) => {
        if (allowedIds.has(item.transactionServiceId)) return item
        changed = true
        return {
          ...item,
          transactionServiceId: firstAllowed.id,
          netPrice: String(firstAllowed.netPrice),
          grossPrice: grossStringFromService(firstAllowed),
        }
      })
      return changed ? { ...prev, items: nextItems } : prev
    })
  }, [billForm.billType, availableBillServices])
  function openBillListGroupKey(ob: OpenBill): string {
    const batchScope = String(ob.batchScope ?? 'NONE').toUpperCase()
    if (batchScope !== 'NONE') return `open:${ob.id}`
    const keys = Array.from(new Set((ob.sessions ?? [])
      .map((session) => String(session.bookingGroupKey ?? '').trim())
      .filter(Boolean)))
    if (keys.length === 1) return `booking:${keys[0]}`
    return `open:${ob.id}`
  }

  function groupOpenBillRowsForSession(list: OpenBill[]): OpenBill[] {
    const grouped = new Map<string, OpenBill[]>()
    for (const ob of list) {
      const key = openBillListGroupKey(ob)
      grouped.set(key, [...(grouped.get(key) ?? []), ob])
    }
    return Array.from(grouped.values()).map((members) => [...members].sort((a, b) => Number(a.id) - Number(b.id))[0])
  }

  function getOpenBillListGroupMembers(ob: OpenBill): OpenBill[] {
    const key = openBillListGroupKey(ob)
    if (!key.startsWith('booking:')) return [ob]
    return openBills
      .filter((entry) => openBillListGroupKey(entry) === key)
      .sort((a, b) => Number(a.id) - Number(b.id))
  }

  function openBillListGroupGross(ob: OpenBill): number {
    return getOpenBillListGroupMembers(ob).reduce((sum, entry) => sum + estimateGross(getOpenBillItems(entry)), 0)
  }

  function openBillListGroupClientLabel(ob: OpenBill): string {
    const members = getOpenBillListGroupMembers(ob)
    if (members.length <= 1) return openBillClientLabel(ob)
    const names = members
      .map((entry) => openBillClientLabel(entry))
      .filter((name) => name && name !== '—')
    if (names.length <= 2) return names.join(' · ')
    return locale === 'sl' ? `${names.length} klienti` : `${names.length} clients`
  }

  function openBillListGroupEmployeeLabel(ob: OpenBill): string {
    const members = getOpenBillListGroupMembers(ob)
    const names = Array.from(new Set(members.map((entry) => openBillConsultantLabel(entry)).filter(Boolean)))
    if (names.length === 0) return '—'
    if (names.length === 1) return names[0]
    return locale === 'sl' ? 'Več zaposlenih' : 'Multiple employees'
  }

  // Legacy/manual records may not have a physical location snapshot. Keep those visible
  // instead of making existing accounting data disappear when a location is selected.
  const matchesSelectedLocation = useCallback((locationId: number | null | undefined) => (
    selectedLocationId == null || locationId == null || Number(locationId) === Number(selectedLocationId)
  ), [selectedLocationId])

  const locationFilteredBills = useMemo(
    () => (loadedBillsView === billingTab ? bills : []).filter((bill) => matchesSelectedLocation(bill.location?.id)),
    [billingTab, bills, loadedBillsView, matchesSelectedLocation],
  )
  const locationFilteredOpenBills = useMemo(
    () => openBills.filter((openBill) => matchesSelectedLocation(openBill.location?.id)),
    [openBills, matchesSelectedLocation],
  )
  const locationFilteredUnusedAdvances = useMemo(
    () => unusedAdvances.filter((advance) => matchesSelectedLocation(advance.location?.id)),
    [unusedAdvances, matchesSelectedLocation],
  )
  const locationFilteredGiftCards = useMemo(
    () => giftCards.filter((card) => matchesSelectedLocation(card.locationId)),
    [giftCards, matchesSelectedLocation],
  )

  const filteredOpenBills = useMemo(() => {
    const q = openBillsSearch.trim().toLowerCase()
    const filtered = !q
      ? locationFilteredOpenBills
      : locationFilteredOpenBills.filter((ob) => {
        const sessionId = String(ob.sessionDisplayId || ob.sessionId || '').toLowerCase()
        const client = openBillClientLabel(ob).toLowerCase()
        const consultant = openBillConsultantLabel(ob).toLowerCase()
        const session = String(ob.sessionInfo || '').toLowerCase()
        const method = String(ob.paymentMethod?.name || '').toLowerCase()
        const groupClients = getOpenBillListGroupMembers(ob).map((entry) => openBillClientLabel(entry).toLowerCase()).join(' ')
        return sessionId.includes(q) || client.includes(q) || consultant.includes(q) || session.includes(q) || method.includes(q) || groupClients.includes(q)
      })
    return groupOpenBillRowsForSession(filtered)
  }, [locationFilteredOpenBills, openBillsSearch, locale])

  // Phase 2.2: history and gift-card rows are already filtered, sorted and paged by the server.
  // Keep only the lightweight location guard for legacy records with no location snapshot.
  const filteredHistoryBills = locationFilteredBills
  const sortedHistoryBills = filteredHistoryBills

  useEffect(() => {
    setHistoryPage(1)
  }, [historySearch, historyDateFrom, historyDateTo, historyStatusFilter, historyFiscalStatusFilter, historyBillTypeFilter, historySortField, historySortDir])

  useEffect(() => {
    setSelectedHistoryBillIds([])
  }, [historySearch, historyDateFrom, historyDateTo, historyStatusFilter, historyFiscalStatusFilter, historyBillTypeFilter])

  const historyPagination = useMemo(() => {
    const total = Number(historyPageMeta.totalElements || 0)
    const totalPages = Math.max(1, Number(historyPageMeta.totalPages || 0))
    const page = Math.min(Math.max(1, historyPage), totalPages)
    const pageSize = Math.max(1, Number(historyPageMeta.size || BILLING_LIST_PAGE_SIZE))
    const offset = (page - 1) * pageSize
    const slice = sortedHistoryBills
    const showFrom = total === 0 ? 0 : offset + 1
    const showTo = total === 0 ? 0 : Math.min(offset + slice.length, total)
    return { total, totalPages, page, slice, showFrom, showTo }
  }, [sortedHistoryBills, historyPage, historyPageMeta])

  useEffect(() => {
    if (historyPagination.page !== historyPage) setHistoryPage(historyPagination.page)
  }, [historyPagination.page, historyPage])

  const selectedHistoryBillIdSet = useMemo(() => new Set(selectedHistoryBillIds), [selectedHistoryBillIds])
  const historyPageBillIds = useMemo(() => historyPagination.slice.map((bill) => bill.id), [historyPagination.slice])
  const allHistoryPageSelected = historyPageBillIds.length > 0 && historyPageBillIds.every((id) => selectedHistoryBillIdSet.has(id))

  const filteredGiftCards = locationFilteredGiftCards
  const sortedGiftCards = filteredGiftCards

  const giftCardStats = giftCardServerStats ?? {
    active: 0,
    partial: 0,
    used: 0,
    expired: 0,
    outstanding: 0,
  }

  const giftCardsPagination = useMemo(() => {
    const total = Number(giftCardsPageMeta.totalElements || 0)
    const totalPages = Math.max(1, Number(giftCardsPageMeta.totalPages || 0))
    const page = Math.min(Math.max(1, giftCardsPage), totalPages)
    const pageSize = Math.max(1, Number(giftCardsPageMeta.size || BILLING_LIST_PAGE_SIZE))
    const offset = (page - 1) * pageSize
    const slice = sortedGiftCards
    const showFrom = total === 0 ? 0 : offset + 1
    const showTo = total === 0 ? 0 : Math.min(offset + slice.length, total)
    return { total, totalPages, page, slice, showFrom, showTo }
  }, [sortedGiftCards, giftCardsPage, giftCardsPageMeta])

  useEffect(() => {
    setGiftCardsPage(1)
  }, [giftCardSearch, giftCardDateFrom, giftCardDateTo, giftCardStatusFilter, giftCardsSort])

  useEffect(() => {
    if (giftCardsPagination.page !== giftCardsPage) setGiftCardsPage(giftCardsPagination.page)
  }, [giftCardsPagination.page, giftCardsPage])

  function openBillItemToDraft(ob: OpenBill, i: OpenBill['items'][number], index: number): OpenBillEditItem {
    const fallbackGross = Number(i.netPrice || 0) * (1 + billingTaxMultiplier(i.transactionService?.taxRate))
    const grossPrice = Number.isFinite(Number(i.grossPrice)) ? Number(i.grossPrice) : fallbackGross
    return {
      openBillItemId: i.id,
      clientRowKey: Number(i.id) > 0 ? undefined : `server-row-${ob.id}-${index}`,
      transactionServiceId: i.transactionService.id,
      quantity: i.quantity,
      netPrice: String(i.netPrice),
      grossPrice: grossPrice.toFixed(2),
      sourceSessionBookingId: i.sourceSessionBookingId ?? null,
      sourceSessionConsumableId: i.sourceSessionConsumableId ?? null,
      sourceAdvanceBillId: i.sourceAdvanceBillId ?? null,
    }
  }

  function isHiddenAdvanceServiceForOpenBill(ob: OpenBill, item: OpenBillEditItem) {
    const openBillType = String(ob.billType || 'INVOICE').toUpperCase()
    return openBillType !== 'ADVANCE'
      && item.sourceAdvanceBillId == null
      && advanceDeductionIds.has(item.transactionServiceId)
  }

  function getOpenBillItems(ob: OpenBill) {
    return (openBillEdits[ob.id]
      ?? ob.items.map((i, index) => openBillItemToDraft(ob, i, index)))
      .filter((item) => !isLegacyAdvanceOffsetDraftItem(item) && !isHiddenAdvanceServiceForOpenBill(ob, item))
  }

  function openBillServerItemsToDraft(ob: OpenBill): OpenBillEditItem[] {
    return ob.items
      .map((i, index) => openBillItemToDraft(ob, i, index))
      .filter((item) => !isLegacyAdvanceOffsetDraftItem(item) && !isHiddenAdvanceServiceForOpenBill(ob, item))
  }

  const validateOpenBillDetailsDraft = (draft: OpenBillDetailsDraft | undefined) => {
    if (!draft) return true
    if (draft.billingTarget === 'COMPANY' && !draft.recipientCompanyId) {
      showToast('error', locale === 'sl' ? 'Izberite podjetje.' : 'Select recipient company first.')
      return false
    }
    if (draft.billingTarget === 'PERSON' && !draft.clientId) {
      showToast('error', locale === 'sl' ? 'Izberite stranko.' : 'Select client first.')
      return false
    }
    return true
  }

  const buildOpenBillUpdatePayload = (
    ob: OpenBill,
    items: OpenBillEditItem[],
    overrides?: { paymentMethodId?: number | null; paymentTotalGross?: number },
  ) => {
    const detailsDraft = openBillDetailsEdits[ob.id]
    const subtotalGross = estimateGross(items)
    const discountDraft = getOpenBillDiscountDraft(ob)
    const effectiveTotalGross = overrides?.paymentTotalGross ?? payableGrossAfterDiscount(subtotalGross, discountDraft, items)
    const paymentSplits = buildPaymentSplitsPayload(getOpenBillPaymentSplits(ob, effectiveTotalGross))
    const primaryPaymentMethodId = paymentSplits[0]?.paymentMethodId
      ?? (ob.paymentMethod?.id && !isDepositPaymentMethod(ob.paymentMethod) ? ob.paymentMethod.id : undefined)
    const payload: Record<string, unknown> = {
      paymentMethodId: overrides && Object.prototype.hasOwnProperty.call(overrides, 'paymentMethodId')
        ? overrides.paymentMethodId
        : primaryPaymentMethodId,
      paymentSplits,
      reference: ob.reference ?? '',
      ...discountPayloadFields(discountDraft, subtotalGross, items),
      items: items
        .filter((i) => !isLegacyAdvanceOffsetDraftItem(i))
        .map((i) => ({
          transactionServiceId: i.transactionServiceId,
          quantity: i.quantity,
          netPrice: Number(i.netPrice),
          grossPrice: Number(i.grossPrice),
          sourceSessionBookingId: i.sourceSessionBookingId ?? null,
          sourceSessionConsumableId: i.sourceSessionConsumableId ?? null,
          sourceAdvanceBillId: null,
        })),
    }

    if (detailsDraft) {
      payload.billingTarget = detailsDraft.billingTarget
      payload.clientId = detailsDraft.clientId ?? null
      payload.recipientCompanyId = detailsDraft.billingTarget === 'COMPANY' ? (detailsDraft.recipientCompanyId ?? null) : null
      payload.consultantId = detailsDraft.consultantId ?? me.id
      if (detailsDraft.sessionId != null) payload.sessionId = detailsDraft.sessionId
    }

    return payload
  }

  function estimateGross(items: { quantity: number; grossPrice?: string | number | null }[]) {
    return items.reduce((sum, item) => sum + Number(item.grossPrice || 0) * Number(item.quantity || 0), 0)
  }

  function formatPaymentAmountInput(amount: number) {
    if (!Number.isFinite(amount)) return '0.00'
    return amount.toFixed(2)
  }

  function isLegacyAdvanceOffsetDraftItem(item: { sourceAdvanceBillId?: number | null; netPrice?: string | number | null } | null | undefined) {
    return item?.sourceAdvanceBillId != null && Number(item.netPrice || 0) < 0
  }

  function getLegacyAdvanceSelectionsFromOpenBillItems(ob: OpenBill) {
    return (ob.items ?? [])
      .filter((item) => item.sourceAdvanceBillId != null && Number(item.netPrice || 0) < 0)
      .reduce<AdvancePaymentSelectionDraft[]>((acc, item) => {
        const advanceBillId = Number(item.sourceAdvanceBillId)
        if (!Number.isFinite(advanceBillId) || advanceBillId <= 0) return acc
        const grossAmount = estimateGross([{
          quantity: item.quantity,
          grossPrice: String(Math.abs(Number(item.grossPrice || 0)) || Math.abs(Number(item.netPrice || 0)) * (1 + billingTaxMultiplier(item.transactionService.taxRate))),
        }])
        const existing = acc.find((entry) => entry.advanceBillId === advanceBillId)
        if (existing) {
          existing.amountGross = formatPaymentAmountInput(Number(existing.amountGross || 0) + grossAmount)
          existing.mode = 'partial'
          return acc
        }
        acc.push({
          advanceBillId,
          mode: 'partial',
          amountGross: formatPaymentAmountInput(grossAmount),
        })
        return acc
      }, [])
  }

  function findAdvancePaymentMethodForOpenBill(ob: OpenBill) {
    if (!advanceBillingEnabled) return null
    if (ob.paymentMethod && isDepositPaymentMethod(ob.paymentMethod)) return ob.paymentMethod
    return paymentMethods.find((method) => isDepositPaymentMethod(method)) || null
  }

  function buildLegacyAdvancePaymentSplit(ob: OpenBill, selections: AdvancePaymentSelectionDraft[]): OpenBillPaymentSplitDraft | null {
    if (selections.length === 0) return null
    const method = findAdvancePaymentMethodForOpenBill(ob)
    if (!method) return null
    return {
      key: `legacy-advance-offset-${ob.id}`,
      paymentMethodId: method.id,
      amountGross: formatPaymentAmountInput(sumAdvanceSelectionGross(selections)),
      sourceAdvanceBillId: null,
      advanceSelections: selections,
    }
  }

  function getOpenBillPaymentSplits(ob: OpenBill, totalGross: number): OpenBillPaymentSplitDraft[] {
    if (Object.prototype.hasOwnProperty.call(openBillPaymentEdits, ob.id)) {
      return openBillPaymentEdits[ob.id]
    }
    const hasAdvanceSourcePaymentSplits = (ob.paymentSplits ?? []).some((split) => split.sourceAdvanceBillId != null)
    const legacyAdvanceSelections = hasAdvanceSourcePaymentSplits ? [] : getLegacyAdvanceSelectionsFromOpenBillItems(ob)
    const legacyAdvanceSplit = buildLegacyAdvancePaymentSplit(ob, legacyAdvanceSelections)
    const serverSplits = (ob.paymentSplits ?? [])
      .filter((split) => split.paymentMethod?.id)
      .reduce<OpenBillPaymentSplitDraft[]>((acc, split, index) => {
        const isAdvanceMethod = isDepositPaymentMethod(split.paymentMethod)
        const sourceAdvanceBillId = split.sourceAdvanceBillId == null ? null : Number(split.sourceAdvanceBillId)
        const amountGross = Number(split.amountGross || 0)
        if (isAdvanceMethod && sourceAdvanceBillId != null && Number.isFinite(sourceAdvanceBillId) && sourceAdvanceBillId > 0) {
          const groupKey = `server-advance-${ob.id}-${split.paymentMethod.id}`
          const existing = acc.find((entry) => entry.key === groupKey)
          const selection: AdvancePaymentSelectionDraft = {
            advanceBillId: sourceAdvanceBillId,
            mode: 'partial',
            amountGross: formatPaymentAmountInput(amountGross),
          }
          if (existing) {
            existing.amountGross = formatPaymentAmountInput(Number(existing.amountGross || 0) + amountGross)
            existing.advanceSelections = [...(existing.advanceSelections ?? []), selection]
            return acc
          }
          acc.push({
            key: groupKey,
            paymentMethodId: split.paymentMethod.id,
            amountGross: formatPaymentAmountInput(amountGross),
            sourceAdvanceBillId: null,
            advanceSelections: [selection],
          })
          return acc
        }
        acc.push({
          key: split.id != null ? `server-${split.id}` : `server-${ob.id}-${index}`,
          paymentMethodId: split.paymentMethod.id,
          amountGross: formatPaymentAmountInput(isAdvanceMethod ? 0 : amountGross),
          sourceAdvanceBillId,
          advanceSelections: [],
        })
        return acc
      }, [])
    if (serverSplits.length > 0) return legacyAdvanceSplit ? [...serverSplits, legacyAdvanceSplit] : serverSplits
    if (legacyAdvanceSplit && (!ob.paymentMethod?.id || isDepositPaymentMethod(ob.paymentMethod))) return [legacyAdvanceSplit]
    if (legacyAdvanceSplit && ob.paymentMethod?.id) {
      const remainingGross = Math.max(0, totalGross - Number(legacyAdvanceSplit.amountGross || 0))
      return [
        legacyAdvanceSplit,
        ...(remainingGross > 0.005 ? [{
          key: `legacy-${ob.id}`,
          paymentMethodId: ob.paymentMethod.id,
          amountGross: formatPaymentAmountInput(remainingGross),
          advanceSelections: [],
        }] : []),
      ]
    }
    if (ob.paymentMethod?.id) {
      const paymentMethodIsAdvance = isDepositPaymentMethod(ob.paymentMethod)
      return [{
        key: `legacy-${ob.id}`,
        paymentMethodId: ob.paymentMethod.id,
        amountGross: formatPaymentAmountInput(paymentMethodIsAdvance ? 0 : totalGross),
        advanceSelections: [],
      }]
    }

    // Keep the edit popup self-contained. Open bills can legitimately be created
    // without a payment method, but the invoice editor still needs a usable first
    // payment row so the user can close the invoice without first selecting a
    // payment method from the list view. Prefer a normal (non-advance) method;
    // advance payments require an explicit advance-selection flow.
    const openBillLocationId = Number(ob.location?.id ?? 0)
    const defaultMethod = visiblePaymentMethods.find((method) => (
      !isDepositPaymentMethod(method)
      && (
        openBillLocationId <= 0
        || method.availableAllLocations !== false
        || (Array.isArray(method.locationIds) && method.locationIds.some((id) => Number(id) === openBillLocationId))
      )
    ))
    if (defaultMethod) {
      return [{
        key: `default-${ob.id}`,
        paymentMethodId: defaultMethod.id,
        amountGross: formatPaymentAmountInput(totalGross),
        advanceSelections: [],
      }]
    }

    return legacyAdvanceSplit ? [legacyAdvanceSplit] : []
  }

  function paymentSplitEffectiveGross(split: OpenBillPaymentSplitDraft) {
    if (isAdvancePaymentSplit(split)) {
      return sumAdvanceSelectionGross(normalizeAdvanceSelections(split.advanceSelections))
    }
    return Number(split.amountGross || 0)
  }

  function paymentSplitTotalGross(splits: OpenBillPaymentSplitDraft[]) {
    return splits.reduce((sum, split) => sum + paymentSplitEffectiveGross(split), 0)
  }

  function paymentSplitsMatchInvoiceTotal(splits: OpenBillPaymentSplitDraft[], totalGross: number) {
    // Entitlements are prepaid coverage rather than a payment method, so a validated
    // entitlement split intentionally has no paymentMethodId. Treat it as a valid
    // settlement instrument when checking whether the bill is fully covered.
    if (!splits.some((split) => split.paymentMethodId || isEntitlementPaymentSplit(split))) return false
    return Math.abs(paymentSplitTotalGross(splits) - totalGross) <= 0.01
  }

  function paymentSplitDifference(totalGross: number, splits: OpenBillPaymentSplitDraft[]) {
    const diff = totalGross - paymentSplitTotalGross(splits)
    return Math.abs(diff) <= 0.005 ? 0 : diff
  }

  function paymentSplitAmountToMatchRow(splits: OpenBillPaymentSplitDraft[], key: string, totalGross: number) {
    const otherTotal = splits.reduce((sum, split) => (split.key === key ? sum : sum + paymentSplitEffectiveGross(split)), 0)
    return Math.max(0, totalGross - otherTotal)
  }

  const BILLABLE_CLOSE_STATUSES = new Set(['RESERVED', 'ONGOING', 'CHECKED_OUT', 'NO_SHOW'])

  function openBillSessionIsBillableForClose(session: NonNullable<OpenBill['sessions']>[number]) {
    if (!session) return false
    if (Number(session.sessionId) < 0) return true
    const status = String(session.lifecycleStatus ?? '').trim().toUpperCase()
    if (!status) return true
    return BILLABLE_CLOSE_STATUSES.has(status)
  }

  function collectOpenBillCloseSessions(bills: OpenBill[]) {
    const byId = new Map<number, NonNullable<OpenBill['sessions']>[number]>()
    bills.forEach((bill) => {
      getOpenBillIncludedSessions(bill).forEach((session) => {
        if (session.sessionId == null) return
        byId.set(session.sessionId, session)
      })
    })
    return Array.from(byId.values()).filter((session) => Number(session.sessionId) > 0)
  }

  function openBillSessionsAreBillableForClose(bills: OpenBill[]) {
    const sessions = collectOpenBillCloseSessions(bills)
    return sessions.length === 0 || sessions.every(openBillSessionIsBillableForClose)
  }

  /**
   * Decide the invoice type the bill will assume when "Zaključi račun" is pressed.
   * - Manually-set `billType` on the open bill always wins (manual open bills).
   * - Otherwise: any included session in RESERVED status -> ADVANCE; else INVOICE.
   *
   * Uses `ob.sessions` directly (not `getOpenBillIncludedSessions`) so this is
   * safe to call during early render, before later `const` helpers initialize.
   */
  function resolveOpenBillEffectiveType(ob: OpenBill | null | undefined): 'INVOICE' | 'ADVANCE' {
    if (!ob) return 'INVOICE'
    if (ob.billType === 'ADVANCE') return advanceBillingEnabled ? 'ADVANCE' : 'INVOICE'
    if (ob.billType === 'INVOICE') return 'INVOICE'
    if (!advanceBillingEnabled) return 'INVOICE'
    const sessions = ob.sessions ?? []
    const anyReserved = sessions.some((session) => {
      if (Number(session.sessionId) < 0) return false
      return String(session.lifecycleStatus ?? '').trim().toUpperCase() === 'RESERVED'
    })
    return anyReserved ? 'ADVANCE' : 'INVOICE'
  }

  function canIssueOpenBillType(ob: OpenBill | null | undefined): boolean {
    return resolveOpenBillEffectiveType(ob) === 'ADVANCE' ? canIssueAdvanceInvoice : canIssueOpenInvoice
  }

  function issueOpenBillPermissionTooltip(ob: OpenBill | null | undefined): string | undefined {
    if (canIssueOpenBillType(ob)) return undefined
    return resolveOpenBillEffectiveType(ob) === 'ADVANCE'
      ? (locale === 'sl' ? 'Nimate dovoljenja za izdajo predplačil.' : 'You do not have permission to issue advance invoices.')
      : (locale === 'sl' ? 'Nimate dovoljenja za izdajo odprtih računov.' : 'You do not have permission to issue open invoices.')
  }

  const setOpenBillPaymentSplits = (ob: OpenBill, splits: OpenBillPaymentSplitDraft[]) => {
    setOpenBillPaymentEdits((prev) => ({ ...prev, [ob.id]: splits }))
  }

  const updateOpenBillPaymentSplit = (ob: OpenBill, key: string, patch: Partial<OpenBillPaymentSplitDraft>) => {
    const current = getOpenBillPaymentSplits(ob, openBillPayableGross(ob))
    setOpenBillPaymentSplits(ob, current.map((split) => (split.key === key ? { ...split, ...patch } : split)))
  }

  const matchOpenBillPaymentSplitToRemaining = (ob: OpenBill, key: string, totalGross: number) => {
    const current = getOpenBillPaymentSplits(ob, totalGross)
    const amount = paymentSplitAmountToMatchRow(current, key, totalGross)
    setOpenBillPaymentSplits(ob, current.map((split) => (
      split.key === key
        ? { ...split, amountGross: formatPaymentAmountInput(amount) }
        : split
    )))
  }

  const removeOpenBillPaymentSplit = (ob: OpenBill, key: string) => {
    const current = getOpenBillPaymentSplits(ob, openBillPayableGross(ob))
    setOpenBillPaymentSplits(ob, current.filter((split) => split.key !== key))
  }

  const addOpenBillPaymentSplit = (ob: OpenBill, totalGross: number) => {
    const current = getOpenBillPaymentSplits(ob, totalGross)
    const usedIds = new Set(current.map((split) => split.paymentMethodId).filter(Boolean))
    const effectiveType = resolveOpenBillEffectiveType(ob)
    const eligibleMethods = effectiveType === 'ADVANCE'
      ? visiblePaymentMethods.filter((entry) => !isDepositPaymentMethod(entry))
      : visiblePaymentMethods
    const method = eligibleMethods.find((entry) => !usedIds.has(entry.id)) || eligibleMethods[0]
    if (!method) return
    const assigned = current.reduce((sum, split) => sum + paymentSplitEffectiveGross(split), 0)
    const remainder = Math.max(0, totalGross - assigned)
    setOpenBillPaymentSplits(ob, [
      ...current,
      {
        key: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        paymentMethodId: method.id,
        amountGross: formatPaymentAmountInput(remainder),
      },
    ])
  }

  function getCreateBillPaymentSplits(totalGross: number): OpenBillPaymentSplitDraft[] {
    if (billForm.paymentSplits) return billForm.paymentSplits
    if (billForm.paymentMethodId) {
      return [{ key: 'create-primary', paymentMethodId: billForm.paymentMethodId, amountGross: formatPaymentAmountInput(totalGross) }]
    }
    const method = createAvailablePaymentMethods[0]
    if (method) {
      return [{ key: 'create-primary', paymentMethodId: method.id, amountGross: formatPaymentAmountInput(totalGross) }]
    }
    return []
  }

  const setCreateBillPaymentSplits = (splits: OpenBillPaymentSplitDraft[]) => {
    const primaryPaymentMethodId = splits.find((split) => split.paymentMethodId)?.paymentMethodId
    setBillForm((prev) => ({ ...prev, paymentMethodId: primaryPaymentMethodId, paymentSplits: splits }))
  }

  const updateCreateBillPaymentSplit = (key: string, patch: Partial<OpenBillPaymentSplitDraft>) => {
    const current = getCreateBillPaymentSplits(createBillPayableGross)
    const next = current.map((split) => (split.key === key ? { ...split, ...patch } : split))
    setCreateBillPaymentSplits(next)
  }

  const matchCreateBillPaymentSplitToRemaining = (key: string, totalGross: number) => {
    const current = getCreateBillPaymentSplits(totalGross)
    const amount = paymentSplitAmountToMatchRow(current, key, totalGross)
    setCreateBillPaymentSplits(current.map((split) => (
      split.key === key
        ? { ...split, amountGross: formatPaymentAmountInput(amount) }
        : split
    )))
  }

  const removeCreateBillPaymentSplit = (key: string) => {
    const current = getCreateBillPaymentSplits(createBillPayableGross)
    setCreateBillPaymentSplits(current.filter((split) => split.key !== key))
  }

  const addCreateBillPaymentSplit = (totalGross: number) => {
    const current = getCreateBillPaymentSplits(totalGross)
    const usedIds = new Set(current.map((split) => split.paymentMethodId).filter(Boolean))
    const eligibleMethods = createAvailablePaymentMethods
    const method = eligibleMethods.find((entry) => !usedIds.has(entry.id)) || eligibleMethods[0]
    if (!method) return
    const assigned = current.reduce((sum, split) => sum + paymentSplitEffectiveGross(split), 0)
    const remainder = Math.max(0, totalGross - assigned)
    setCreateBillPaymentSplits([
      ...current,
      {
        key: `create-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        paymentMethodId: method.id,
        amountGross: formatPaymentAmountInput(remainder),
      },
    ])
  }

  function buildPaymentSplitsPayload(splits: OpenBillPaymentSplitDraft[]) {
    return splits.flatMap((split) => {
      const paymentMethodId = split.paymentMethodId
      if (!paymentMethodId) return []
      const advanceSelections = isAdvancePaymentSplit(split)
        ? normalizeAdvanceSelections(split.advanceSelections)
        : []
      if (advanceSelections.length > 0) {
        return advanceSelections.map((selection) => ({
          paymentMethodId,
          amountGross: Number(selection.amountGross || 0),
          sourceAdvanceBillId: selection.advanceBillId,
        }))
      }
      if (isAdvancePaymentSplit(split)) return []
      return [{
        paymentMethodId,
        amountGross: Number(split.amountGross || 0),
        sourceAdvanceBillId: split.sourceAdvanceBillId ?? null,
      }]
    })
  }

  function buildCreatePaymentSplitsPayload(totalGross: number) {
    return buildPaymentSplitsPayload(getCreateBillPaymentSplits(totalGross))
  }

  function sumAdvanceSelectionGross(selections: AdvancePaymentSelectionDraft[] | null | undefined) {
    return (selections ?? []).reduce((sum, selection) => sum + Number(selection.amountGross || 0), 0)
  }

  function findPaymentMethodById(paymentMethodId?: number | null) {
    return paymentMethodId == null ? null : (paymentMethods.find((method) => method.id === paymentMethodId) || null)
  }

  function isAdvancePaymentSplit(split: OpenBillPaymentSplitDraft | null | undefined) {
    return isDepositPaymentMethod(findPaymentMethodById(split?.paymentMethodId))
  }

  function getAdvanceSelectionsForSplit(split: OpenBillPaymentSplitDraft | null | undefined) {
    return split?.advanceSelections ?? []
  }

  function getAdvanceSelectionAmount(selection: AdvancePaymentSelectionDraft) {
    return Number(selection.amountGross || 0)
  }

  function findUnusedAdvanceById(advanceBillId: number) {
    return unusedAdvances.find((entry) => entry.advanceBillId === advanceBillId) || null
  }

  function validateAdvanceSelections(
    selections: AdvancePaymentSelectionDraft[] | null | undefined,
    eligibleAdvances: UnusedAdvance[],
    limitGross: number,
  ) {
    const byId = new Map(eligibleAdvances.map((entry) => [entry.advanceBillId, entry]))
    const safeSelections = selections ?? []
    if (safeSelections.length === 0) return false
    const seen = new Set<number>()
    let total = 0
    for (const selection of safeSelections) {
      if (seen.has(selection.advanceBillId)) return false
      seen.add(selection.advanceBillId)
      const advance = byId.get(selection.advanceBillId)
      if (!advance) return false
      const amountGross = getAdvanceSelectionAmount(selection)
      if (!Number.isFinite(amountGross) || amountGross <= 0) return false
      if (amountGross > Number(advance.remainingGross || 0) + 0.005) return false
      total += amountGross
    }
    return total <= limitGross + 0.005
  }

  function describeAdvanceSelectionCount(count: number) {
    if (locale === 'sl') {
      if (count === 1) return '1 izbrano predplačilo'
      if (count === 2) return '2 izbrani predplačili'
      if (count === 3 || count === 4) return `${count} izbrana predplačila`
      return `${count} izbranih predplačil`
    }
    return `${count} advance${count === 1 ? '' : 's'} selected`
  }

  function normalizeAdvanceSelections(selections: AdvancePaymentSelectionDraft[] | null | undefined) {
    const seen = new Set<number>()
    const normalized: AdvancePaymentSelectionDraft[] = []
    for (const selection of selections ?? []) {
      if (!selection || seen.has(selection.advanceBillId)) continue
      const amountGross = Number(selection.amountGross || 0)
      if (!Number.isFinite(amountGross) || amountGross <= 0) continue
      seen.add(selection.advanceBillId)
      normalized.push({
        advanceBillId: selection.advanceBillId,
        mode: selection.mode === 'partial' ? 'partial' : 'full',
        amountGross: formatPaymentAmountInput(amountGross),
      })
    }
    return normalized
  }

  function openAdvancePaymentModalForCreate(splitKey: string) {
    const split = getCreateBillPaymentSplits(createBillPayableGross).find((entry) => entry.key === splitKey)
    const initialSelections = normalizeAdvanceSelections(split?.advanceSelections)
    setAdvancePaymentDraftSelections(initialSelections)
    setAdvancePaymentInitialSelections(initialSelections)
    setAdvancePaymentShowOther(false)
    setAdvancePaymentModal({ mode: 'create', splitKey })
  }

  function openAdvancePaymentModalForOpenBill(ob: OpenBill, splitKey: string) {
    const split = getOpenBillPaymentSplits(ob, openBillPayableGross(ob)).find((entry) => entry.key === splitKey)
    const initialSelections = normalizeAdvanceSelections(split?.advanceSelections)
    setAdvancePaymentDraftSelections(initialSelections)
    setAdvancePaymentInitialSelections(initialSelections)
    setAdvancePaymentShowOther(false)
    setAdvancePaymentModal({ mode: 'open', openBillId: ob.id, splitKey })
  }

  function closeAdvancePaymentModal() {
    setAdvancePaymentModal(null)
    setAdvancePaymentDraftSelections([])
    setAdvancePaymentInitialSelections([])
    setAdvancePaymentShowOther(false)
  }

  function commitAdvancePaymentModalSelections() {
    if (!advancePaymentModal) return
    const normalized = normalizeAdvanceSelections(advancePaymentDraftSelections)
    const amountGross = formatPaymentAmountInput(sumAdvanceSelectionGross(normalized))
    if (advancePaymentModal.mode === 'create') {
      updateCreateBillPaymentSplit(advancePaymentModal.splitKey, { advanceSelections: normalized, amountGross })
    } else {
      const target = openBills.find((entry) => entry.id === advancePaymentModal.openBillId) || detailOpenBill
      if (target) updateOpenBillPaymentSplit(target, advancePaymentModal.splitKey, { advanceSelections: normalized, amountGross })
    }
    closeAdvancePaymentModal()
  }

  function toggleAdvanceDraftSelection(advance: UnusedAdvance, checked: boolean) {
    if (!checked) {
      setAdvancePaymentDraftSelections((prev) => prev.filter((entry) => entry.advanceBillId !== advance.advanceBillId))
      return
    }
    setAdvancePaymentDraftSelections((prev) => (
      prev.some((entry) => entry.advanceBillId === advance.advanceBillId)
        ? prev
        : [
            ...prev,
            {
              advanceBillId: advance.advanceBillId,
              mode: 'full',
              amountGross: formatPaymentAmountInput(Number(advance.remainingGross || 0)),
            },
          ]
    ))
  }

  function updateAdvanceDraftSelection(advanceBillId: number, patch: Partial<AdvancePaymentSelectionDraft>) {
    setAdvancePaymentDraftSelections((prev) => prev.map((entry) => {
      if (entry.advanceBillId !== advanceBillId) return entry
      let next: AdvancePaymentSelectionDraft = { ...entry, ...patch }
      if (patch.mode === 'full') {
        const advance = findUnusedAdvanceById(advanceBillId)
        const fullAmount = patch.amountGross != null ? Number(patch.amountGross) : Number(advance?.remainingGross || 0)
        next = { ...next, amountGross: formatPaymentAmountInput(fullAmount) }
      }
      if (patch.amountGross != null) {
        next = { ...next, amountGross: patch.amountGross.replace(/[^0-9.,-]/g, '').replace(',', '.') }
      }
      return next
    }))
  }


  function isEntitlementPaymentSplit(split: OpenBillPaymentSplitDraft | null | undefined) {
    return split?.kind === 'entitlement'
  }

  function entitlementPaymentLabel() {
    return locale === 'sl' ? 'Ugodnost' : 'Entitlement'
  }

  function openBillEntitlementSettlementSelection(ob: OpenBill, totalGross: number) {
    const splits = getOpenBillPaymentSplits(ob, totalGross)
    if (splits.length !== 1) return null
    const split = splits[0]
    if (!isEntitlementPaymentSplit(split)) return null
    const code = String(split.entitlementCode || '').trim()
    if (!code) return null
    const amount = paymentSplitEffectiveGross(split)
    if (Math.abs(amount - totalGross) > 0.01) return null
    const paymentClientId = getEntitlementPaymentClientIdForOpenBill(ob)
    const paymentBookingId = getEntitlementPaymentBookingIdForOpenBill(ob, paymentClientId)
    if (!paymentBookingId) return null
    return { split, code, paymentClientId, paymentBookingId, totalGross }
  }

  function openBillEntitlementSelectionIsValid(ob: OpenBill, totalGross: number) {
    const splits = getOpenBillPaymentSplits(ob, totalGross)
    const hasEntitlement = splits.some(isEntitlementPaymentSplit)
    if (!hasEntitlement) return true
    return openBillEntitlementSettlementSelection(ob, totalGross) != null
  }

  function entitlementErrorMessage(result?: string | null, message?: string | null) {
    if (message) return message
    if (result === 'INVALID_CODE') return locale === 'sl' ? 'Koda ugodnosti ni veljavna.' : 'The entitlement code is invalid.'
    if (result === 'EXPIRED') return locale === 'sl' ? 'Ugodnost je potekla.' : 'The entitlement has expired.'
    if (result === 'NO_VISITS_REMAINING') return locale === 'sl' ? 'Ugodnost nima več preostalih obiskov.' : 'No visits remain on this entitlement.'
    if (result === 'DUPLICATE_SCAN') return locale === 'sl' ? 'Ta ugodnost je bila pravkar uporabljena.' : 'This entitlement was just used.'
    if (result === 'UNSUPPORTED_PAYMENT_ENTITLEMENT') return locale === 'sl' ? 'Za kritje termina lahko uporabite karte, pakete in članstva.' : 'Tickets, packs and memberships can cover a session.'
    if (result === 'SERVICE_TYPE_MISMATCH') return locale === 'sl' ? 'Ugodnost ni vezana na storitev tega računa.' : 'The entitlement is not linked to this bill service.'
    if (result === 'PAYMENT_BOOKING_NOT_FOUND') return locale === 'sl' ? 'Termina za plačilo ni bilo mogoče najti.' : 'The payment booking could not be found.'
    if (result === 'PAYMENT_CLIENT_MISMATCH') return locale === 'sl' ? 'Ugodnost pripada drugemu klientu.' : 'The entitlement belongs to a different client.'
    if (result === 'ALREADY_PAID_WITH_ENTITLEMENT') return locale === 'sl' ? 'Ta račun je že plačan z ugodnostjo.' : 'This bill was already paid with an entitlement.'
    return locale === 'sl' ? 'Ugodnosti ni bilo mogoče uporabiti.' : 'Unable to apply the entitlement.'
  }

  function getEntitlementPaymentClientIdForOpenBill(ob: OpenBill) {
    const directClientId = Number(ob.client?.id)
    if (Number.isInteger(directClientId) && directClientId > 0) return directClientId
    const batchClientId = Number(ob.batchTargetClientId)
    if (Number.isInteger(batchClientId) && batchClientId > 0) return batchClientId
    return null
  }

  function getPositiveOpenBillSessionIds(ob: OpenBill) {
    const candidates = new Set<number>()
    if (Number.isInteger(Number(ob.sessionId)) && Number(ob.sessionId) > 0) candidates.add(Number(ob.sessionId))
    ;(ob.sessions ?? []).forEach((session) => {
      const id = Number(session.sessionId)
      if (Number.isInteger(id) && id > 0) candidates.add(id)
    })
    ;(ob.items ?? []).forEach((item) => {
      const id = Number(item.sourceSessionBookingId)
      if (Number.isInteger(id) && id > 0) candidates.add(id)
    })
    return candidates
  }

  function getEntitlementPaymentBookingIdForOpenBill(ob: OpenBill, paymentClientId?: number | null) {
    const payeeClientId = Number(paymentClientId)
    const hasPayeeClient = Number.isInteger(payeeClientId) && payeeClientId > 0
    const sessionIds = getPositiveOpenBillSessionIds(ob)

    for (const booking of bookings) {
      for (const status of booking.paymentStatuses ?? []) {
        if (Number(status.openBillId) !== Number(ob.id)) continue
        const statusClientId = Number(status.clientId)
        if (hasPayeeClient && Number.isInteger(statusClientId) && statusClientId !== payeeClientId) continue
        const bookingId = Number(status.bookingId ?? booking.id)
        if (Number.isInteger(bookingId) && bookingId > 0) return bookingId
      }
    }

    if (hasPayeeClient && sessionIds.size > 0) {
      for (const booking of bookings) {
        const bookingId = Number(booking.id)
        const bookingClientId = Number(booking.client?.id)
        if (Number.isInteger(bookingId) && sessionIds.has(bookingId) && bookingClientId === payeeClientId) return bookingId
      }
    }

    for (const booking of bookings) {
      const status = (booking.paymentStatuses ?? []).find((entry) => Number(entry.openBillId) === Number(ob.id))
      const bookingId = Number(status?.bookingId ?? booking.id)
      if (Number.isInteger(bookingId) && bookingId > 0) return bookingId
    }

    return Array.from(sessionIds)[0] ?? null
  }

  async function loadEntitlementWalletOptions(paymentBookingId: number, requestId: number, paymentClientId?: number | null) {
    if (!entitlementsEnabled) return
    setEntitlementWalletLoading(true)
    try {
      const clientId = Number(paymentClientId)
      const params: Record<string, number> = { paymentBookingId }
      if (Number.isInteger(clientId) && clientId > 0) params.paymentClientId = clientId
      const { data } = await api.get<EntitlementWalletOption[]>('/wallet-scanner/payment-options', { params })
      if (entitlementWalletRequestRef.current === requestId) {
        setEntitlementWalletOptions(Array.isArray(data) ? data : [])
      }
    } catch {
      if (entitlementWalletRequestRef.current === requestId) {
        setEntitlementWalletOptions([])
      }
    } finally {
      if (entitlementWalletRequestRef.current === requestId) {
        setEntitlementWalletLoading(false)
      }
    }
  }

  function openEntitlementPaymentChooser(ob: OpenBill, splitKey: string, totalGross: number) {
    if (!entitlementsEnabled) return
    const paymentClientId = getEntitlementPaymentClientIdForOpenBill(ob)
    const paymentBookingId = getEntitlementPaymentBookingIdForOpenBill(ob, paymentClientId)
    const walletRequestId = entitlementWalletRequestRef.current + 1
    entitlementWalletRequestRef.current = walletRequestId
    setEntitlementPaymentTarget({ openBillId: ob.id, splitKey, totalGross, paymentBookingId, paymentClientId })
    setEntitlementPaymentStep('choice')
    setEntitlementManualCode('')
    setEntitlementScanResult(null)
    setEntitlementWalletOptions([])
    setEntitlementWalletLoading(false)
    const numericPaymentBookingId = Number(paymentBookingId)
    if (Number.isInteger(numericPaymentBookingId) && numericPaymentBookingId > 0) {
      void loadEntitlementWalletOptions(numericPaymentBookingId, walletRequestId, paymentClientId)
    }
  }

  function selectEntitlementPaymentMethod(ob: OpenBill, splitKey: string, totalGross: number) {
    // Selection is only committed after the entitlement has been validated. Closing the
    // picker must leave the previous payment method untouched and must not consume credit.
    openEntitlementPaymentChooser(ob, splitKey, totalGross)
  }

  function closeEntitlementPaymentModal() {
    entitlementWalletRequestRef.current += 1
    stopEntitlementCamera()
    setEntitlementPaymentTarget(null)
    setEntitlementPaymentStep('choice')
    setEntitlementManualCode('')
    setEntitlementScanResult(null)
    setEntitlementWalletOptions([])
    setEntitlementWalletLoading(false)
  }

  function stopEntitlementCamera() {
    if (entitlementScannerControlsRef.current) {
      entitlementScannerControlsRef.current.stop()
      entitlementScannerControlsRef.current = null
    }
    entitlementQrReaderRef.current = null
    if (entitlementVideoRef.current) entitlementVideoRef.current.srcObject = null
    entitlementScanningLockRef.current = false
    setEntitlementCameraActive(false)
  }

  async function startEntitlementCamera() {
    if (entitlementCameraActive || entitlementSubmitting) return
    if (!navigator.mediaDevices?.getUserMedia) {
      setEntitlementScanResult({ tone: 'error', text: locale === 'sl' ? 'Kamera v tem brskalniku ni podprta.' : 'Camera scanning is not supported in this browser.' })
      return
    }
    if (!window.isSecureContext) {
      setEntitlementScanResult({ tone: 'error', text: locale === 'sl' ? 'Za uporabo kamere odprite aplikacijo prek HTTPS.' : 'Open the app over HTTPS to use the camera.' })
      return
    }
    const video = entitlementVideoRef.current
    if (!video) return
    try {
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 120 })
      entitlementQrReaderRef.current = reader
      entitlementScannerControlsRef.current = await reader.decodeFromVideoDevice(undefined, video, (decodeResult) => {
        if (!decodeResult || entitlementScanningLockRef.current) return
        void submitEntitlementPaymentCode(decodeResult.getText(), 'qr')
      })
      entitlementScanningLockRef.current = false
      setEntitlementCameraActive(true)
      setEntitlementScanResult(null)
    } catch (error: any) {
      const name = String(error?.name ?? '')
      const text = name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError'
        ? (locale === 'sl' ? 'Dovolite dostop do kamere in poskusite znova.' : 'Allow camera access and try again.')
        : (locale === 'sl' ? 'Kamere ni bilo mogoče zagnati.' : 'Unable to start the camera.')
      setEntitlementScanResult({ tone: 'error', text })
      stopEntitlementCamera()
    }
  }

  function applyEntitlementPaymentLocally(target: EntitlementPaymentTarget, entitlement?: EntitlementScanResponse['entitlement'], fallbackCode?: string | null) {
    const ob = detailOpenBill?.id === target.openBillId ? detailOpenBill : openBills.find((entry) => entry.id === target.openBillId)
    if (!ob) return
    const code = String(entitlement?.code || fallbackCode || '').trim()
    // A membership/pass is prepaid coverage, not another payment method. Once selected it
    // covers the complete linked service bill and removes cash/card split rows from this bill.
    setOpenBillPaymentSplits(ob, [{
      key: target.splitKey,
      kind: 'entitlement',
      paymentMethodId: undefined,
      amountGross: formatPaymentAmountInput(target.totalGross),
      entitlementCode: code || undefined,
      entitlementId: entitlement?.id == null ? undefined : Number(entitlement.id),
      entitlementName: entitlement?.productName || undefined,
      entitlementType: entitlement?.entitlementType || undefined,
    }])
  }

  async function submitEntitlementPaymentCode(rawCode: string, source: EntitlementScanSource) {
    const code = rawCode.trim()
    if (!entitlementsEnabled || !code || entitlementSubmitting || !entitlementPaymentTarget) return
    const paymentBookingId = Number(entitlementPaymentTarget.paymentBookingId)
    if (!Number.isInteger(paymentBookingId) || paymentBookingId <= 0) {
      setEntitlementScanResult({
        tone: 'error',
        text: locale === 'sl'
          ? 'Ugodnost lahko uporabite samo za račun, ki je povezan s terminom.'
          : 'Entitlements can only be used on bills linked to a booking.',
      })
      return
    }
    entitlementScanningLockRef.current = true
    setEntitlementSubmitting(true)
    setEntitlementScanResult({ tone: 'info', text: locale === 'sl' ? 'Preverjam ugodnost…' : 'Checking entitlement…' })
    try {
      const paymentClientId = Number(entitlementPaymentTarget.paymentClientId)
      const { data } = await api.post<EntitlementScanResponse>('/wallet-scanner/scan', {
        code,
        source,
        paymentBookingId,
        ...(Number.isInteger(paymentClientId) && paymentClientId > 0 ? { paymentClientId } : {}),
      })
      if (data.success) {
        const detail = [data.client?.firstName, data.client?.lastName].filter(Boolean).join(' ').trim()
          || data.entitlement?.productName
          || data.entitlement?.code
          || code
        applyEntitlementPaymentLocally(entitlementPaymentTarget, data.entitlement, code)
        setEntitlementScanResult({
          tone: 'success',
          text: locale === 'sl' ? 'Ugodnost je izbrana za kritje termina.' : 'Entitlement selected to cover the session.',
          detail,
        })
        showToast('success', locale === 'sl' ? 'Ugodnost bo ob zaključku pokrila termin brez novega računa.' : 'The entitlement will cover the session without issuing another invoice.')
        stopEntitlementCamera()
        window.setTimeout(() => closeEntitlementPaymentModal(), 450)
      } else {
        setEntitlementScanResult({ tone: 'error', text: entitlementErrorMessage(data.result, data.message), detail: data.entitlement?.productName || undefined })
        entitlementScanningLockRef.current = false
      }
    } catch (error: any) {
      const responseData = error?.response?.data as { result?: string; message?: string; error?: string } | undefined
      setEntitlementScanResult({
        tone: 'error',
        text: entitlementErrorMessage(responseData?.result, responseData?.message || responseData?.error),
      })
      entitlementScanningLockRef.current = false
    } finally {
      setEntitlementSubmitting(false)
    }
  }

  function submitEntitlementManualCode(event: FormEvent) {
    event.preventDefault()
    void submitEntitlementPaymentCode(entitlementManualCode, 'manual')
  }

  function entitlementWalletCountLabel(count: number) {
    if (locale === 'sl') return count === 1 ? '1 na voljo' : `${count} na voljo`
    return count === 1 ? '1 available' : `${count} available`
  }

  function entitlementWalletTypeLabel(option: EntitlementWalletOption) {
    if (locale === 'sl') {
      if (option.entitlementType === 'PACK') return 'Paket'
      if (option.entitlementType === 'TICKET') return 'Karta'
      if (option.entitlementType === 'MEMBERSHIP') return 'Članstvo'
      if (option.entitlementType === 'GIFT_CARD') return option.voucherMode === 'VALUE' ? 'Vrednostni bon' : 'Darilni bon'
      return 'Ugodnost'
    }
    if (option.entitlementType === 'PACK') return 'Pack'
    if (option.entitlementType === 'TICKET') return 'Ticket'
    if (option.entitlementType === 'MEMBERSHIP') return 'Membership'
    if (option.entitlementType === 'GIFT_CARD') return option.voucherMode === 'VALUE' ? 'Value voucher' : 'Service voucher'
    return 'Entitlement'
  }

  function entitlementWalletRemainingLabel(option: EntitlementWalletOption) {
    if (option.entitlementType === 'GIFT_CARD' && option.voucherMode === 'VALUE') {
      const remaining = Number(option.remainingValueGross ?? 0)
      return locale === 'sl' ? `Preostalo ${currency(remaining)}` : `${currency(remaining)} remaining`
    }
    if (option.entitlementType === 'MEMBERSHIP') {
      if (option.validUntil) {
        const date = new Date(option.validUntil)
        if (!Number.isNaN(date.getTime())) {
          return locale === 'sl'
            ? `Aktivno do ${date.toLocaleDateString('sl-SI')}`
            : `Active until ${date.toLocaleDateString('en-GB')}`
        }
      }
      return locale === 'sl' ? 'Aktivno članstvo' : 'Active membership'
    }
    const remaining = Number(option.remainingUses ?? 0)
    const total = Number(option.totalUses ?? 0)
    if (locale === 'sl') {
      if (Number.isFinite(total) && total > 0) return `${remaining}/${total} preostalo`
      return `${remaining} preostalo`
    }
    if (Number.isFinite(total) && total > 0) return `${remaining}/${total} remaining`
    return `${remaining} remaining`
  }

  function submitEntitlementWalletOption(option: EntitlementWalletOption) {
    const code = String(option.code || option.displayCode || '').trim()
    if (!code) {
      setEntitlementScanResult({ tone: 'error', text: locale === 'sl' ? 'Ta ugodnost nima kode za uporabo.' : 'This entitlement has no usable code.' })
      return
    }
    void submitEntitlementPaymentCode(code, 'wallet')
  }

  const sortedOpenBills = useMemo(() => {
    const list = [...filteredOpenBills]
    const factor = openBillsSortDir === 'asc' ? 1 : -1
    list.sort((a, b) => {
      let comparison = 0
      if (openBillsSortField === 'sessionId') {
        comparison = compareBillingSortableValues(a.sessionDisplayId || formatBillingSessionIdDisplay(a.sessionId), b.sessionDisplayId || formatBillingSessionIdDisplay(b.sessionId), locale)
      } else if (openBillsSortField === 'client') {
        comparison = compareBillingSortableValues(openBillListGroupClientLabel(a), openBillListGroupClientLabel(b), locale)
      } else if (openBillsSortField === 'session') {
        comparison = compareBillingSortableValues(`${a.sessionInfo || ''} ${openBillDescription(a)}`, `${b.sessionInfo || ''} ${openBillDescription(b)}`, locale)
      } else if (openBillsSortField === 'employee') {
        comparison = compareBillingSortableValues(openBillListGroupEmployeeLabel(a), openBillListGroupEmployeeLabel(b), locale)
      } else if (openBillsSortField === 'paymentMethod') {
        const methodA = getOpenBillListGroupMembers(a)[0]?.paymentMethod?.name || a.paymentMethod?.name || ''
        const methodB = getOpenBillListGroupMembers(b)[0]?.paymentMethod?.name || b.paymentMethod?.name || ''
        comparison = compareBillingSortableValues(methodA, methodB, locale)
      } else if (openBillsSortField === 'gross') {
        comparison = openBillListGroupGross(a) - openBillListGroupGross(b)
      } else {
        const tsA = Date.parse(String(a.sessionInfo || ''))
        const tsB = Date.parse(String(b.sessionInfo || ''))
        comparison = (Number.isFinite(tsA) ? tsA : 0) - (Number.isFinite(tsB) ? tsB : 0)
      }
      if (comparison === 0) comparison = Number(a.id || 0) - Number(b.id || 0)
      return comparison * factor
    })
    return list
  }, [filteredOpenBills, openBillsSortField, openBillsSortDir, openBillEdits, services, openBills, locale])

  const openBillsSummaryGross = useMemo(
    () => sortedOpenBills.reduce((sum, ob) => sum + openBillListGroupGross(ob), 0),
    [sortedOpenBills, openBillEdits, services, openBills],
  )





  // Phase 2.2: these lists are returned as already filtered/sorted server pages.
  const openPayments = locationFilteredBills
  const sortedOpenPayments = openPayments
  const filteredUnusedAdvances = locationFilteredUnusedAdvances
  const sortedUnusedAdvances = filteredUnusedAdvances

  const openPaymentsTotal = openPaymentsServerTotal
  const paymentDeadlineDays = useMemo(() => {
    const raw = settings.PAYMENT_DEADLINE_DAYS
    if (raw == null || String(raw).trim() === '') return 0
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || parsed < 0) return 0
    return Math.floor(parsed)
  }, [settings.PAYMENT_DEADLINE_DAYS])

  const unusedAdvancesTotal = unusedAdvancesServerTotal

  const openPaymentsPagination = useMemo(() => {
    const total = Number(openPaymentsPageMeta.totalElements || 0)
    const totalPages = Math.max(1, Number(openPaymentsPageMeta.totalPages || 0))
    const page = Math.min(Math.max(1, openPaymentsPage), totalPages)
    const pageSize = Math.max(1, Number(openPaymentsPageMeta.size || BILLING_LIST_PAGE_SIZE))
    const offset = (page - 1) * pageSize
    const slice = sortedOpenPayments
    const showFrom = total === 0 ? 0 : offset + 1
    const showTo = total === 0 ? 0 : Math.min(offset + slice.length, total)
    return { total, totalPages, page, slice, showFrom, showTo }
  }, [sortedOpenPayments, openPaymentsPage, openPaymentsPageMeta])

  const unusedAdvancesPagination = useMemo(() => {
    const total = Number(unusedAdvancesPageMeta.totalElements || 0)
    const totalPages = Math.max(1, Number(unusedAdvancesPageMeta.totalPages || 0))
    const page = Math.min(Math.max(1, unusedAdvancesPage), totalPages)
    const pageSize = Math.max(1, Number(unusedAdvancesPageMeta.size || BILLING_LIST_PAGE_SIZE))
    const offset = (page - 1) * pageSize
    const slice = sortedUnusedAdvances
    const showFrom = total === 0 ? 0 : offset + 1
    const showTo = total === 0 ? 0 : Math.min(offset + slice.length, total)
    return { total, totalPages, page, slice, showFrom, showTo }
  }, [sortedUnusedAdvances, unusedAdvancesPage, unusedAdvancesPageMeta])

  useEffect(() => {
    setOpenPaymentsPage(1)
  }, [openPaymentsSearch, openPaymentsSort])

  useEffect(() => {
    setUnusedAdvancesPage(1)
  }, [unusedAdvancesSearch, unusedAdvancesSort])

  useEffect(() => {
    setOpenPaymentsPage(1)
    setUnusedAdvancesPage(1)
    setGiftCardsPage(1)
    setHistoryPage(1)
    setSelectedHistoryBillIds([])
  }, [selectedLocationId])

  useEffect(() => {
    if (openPaymentsPagination.page !== openPaymentsPage) setOpenPaymentsPage(openPaymentsPagination.page)
  }, [openPaymentsPagination.page, openPaymentsPage])

  useEffect(() => {
    if (unusedAdvancesPagination.page !== unusedAdvancesPage) setUnusedAdvancesPage(unusedAdvancesPagination.page)
  }, [unusedAdvancesPagination.page, unusedAdvancesPage])

  const folioStats = historyServerStats ?? {
    thisMonthCount: 0,
    paidCount: 0,
    refundsCount: 0,
    advancesCount: 0,
    totalAmount: 0,
  }

  const addDays = (value: string | null | undefined, days: number) => {
    const d = new Date(value || '')
    if (!Number.isFinite(d.getTime())) return null
    d.setDate(d.getDate() + days)
    return d
  }

  const formatDateShort = (value: string | Date | null | undefined) => {
    if (!value) return '—'
    const d = value instanceof Date ? value : new Date(value)
    if (!Number.isFinite(d.getTime())) return '—'
    return d.toLocaleDateString(locale === 'sl' ? 'sl-SI' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatBillingMobileDate = (value: string | Date | null | undefined) => {
    if (!value) return '—'
    const d = value instanceof Date ? value : new Date(value)
    if (!Number.isFinite(d.getTime())) return '—'
    return d.toLocaleDateString('en-GB')
  }

  const formatTimeShort = (value: string | null | undefined) => {
    const d = new Date(value || '')
    if (!Number.isFinite(d.getTime())) return ''
    return d.toLocaleTimeString(locale === 'sl' ? 'sl-SI' : 'en-US', { hour: 'numeric', minute: '2-digit' })
  }

  const relativeDueLabel = (dueDate: Date | null) => {
    if (!dueDate) return ''
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const due = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate())
    const diff = Math.round((due.getTime() - today.getTime()) / 86400000)
    if (diff === 0) return locale === 'sl' ? 'Danes' : 'Today'
    if (diff > 0) return locale === 'sl' ? `Še ${diff} dni` : `${diff} days remaining`
    return locale === 'sl' ? `${Math.abs(diff)} dni zamude` : `${Math.abs(diff)} days overdue`
  }

  const paymentStatusLabel = (status: Bill['paymentStatus'] | null) => {
    if (status === 'paid') return locale === 'sl' ? 'Plačano' : 'Paid'
    if (status === 'payment_pending') return locale === 'sl' ? 'Delno plačano' : 'Partially Paid'
    if (status === 'cancelled') return locale === 'sl' ? 'Arhivirano' : 'Archived'
    return locale === 'sl' ? 'Neplačano' : locale === 'sr' ? 'Neplaćeno' : 'Unpaid'
  }

  const paymentStatusClass = (status: Bill['paymentStatus'] | null) => {
    if (status === 'paid') return 'paid'
    if (status === 'payment_pending') return 'partial'
    if (status === 'cancelled') return 'archived'
    return 'open'
  }

  const historyBillTypeLabel = (bill: Bill) => {
    if (isRefundBill(bill)) return locale === 'sl' ? 'Dobropis' : 'Credit note'
    return normalizeBillType(bill) === 'ADVANCE' ? billingCopy.billTypeAdvance : billingCopy.billTypeInvoice
  }

  const fiscalStatusLabel = (bill: Bill) => {
    if (bill.fiscalStatus === 'SENT') return locale === 'sl' ? 'Izdano' : 'Invoiced'
    if (bill.fiscalStatus === 'FAILED') return locale === 'sl' ? 'Napaka' : 'Failed'
    return locale === 'sl' ? 'Ni poslano' : 'Not Sent'
  }

  const fiscalStatusClass = (bill: Bill) => {
    if (bill.fiscalStatus === 'SENT') return 'invoiced'
    if (bill.fiscalStatus === 'FAILED') return 'failed'
    return 'not-sent'
  }

  const initialsFor = (name: string) => name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '—'


  const showBankTransferQrSettingsPopupFromError = (error: any): boolean => {
    const missingKeys = extractMissingBankTransferQrKeys(error)
    if (missingKeys.length === 0) return false
    setBankTransferQrMissingModal({ missingKeys, rawMessage: readBillingApiMessage(error) })
    return true
  }

  const showStripeSetupPopupFromError = (error: any): boolean => {
    if (!isStripeSetupMissingError(error)) return false
    setStripeSetupMissingModal({ rawMessage: cleanStripeSetupMessage(readBillingApiMessage(error)) })
    return true
  }

  const notifyOpenBillClosedResult = (data: any) => {
    if (data?.fiscalStatus === 'FAILED') {
      showToast('error', locale === 'sl'
        ? `Račun je bil zaključen, vendar davčno potrjevanje ni uspelo: ${data?.fiscalLastError || 'neznana napaka'}`
        : locale === 'sr'
          ? `Račun je zaključen, ali poreska potvrda nije uspela: ${data?.fiscalLastError || 'nepoznata greška'}`
          : `The invoice was closed, but fiscalization failed: ${data?.fiscalLastError || 'unknown error'}`)
      return
    }
    const invoiceEmailDeliveryEnabled = settings.INVOICE_DELIVERY_EMAIL_ENABLED !== 'false'
    showToast('success', locale === 'sl'
      ? invoiceEmailDeliveryEnabled
        ? 'Račun je bil uspešno zaključen in poslan stranki po e-pošti.'
        : 'Račun je bil uspešno zaključen.'
      : locale === 'sr'
        ? invoiceEmailDeliveryEnabled
          ? 'Račun je uspešno zaključen i poslat klijentu e-poštom.'
          : 'Račun je uspešno zaključen.'
        : invoiceEmailDeliveryEnabled
          ? 'The invoice was successfully closed and emailed to the client.'
          : 'The invoice was successfully closed.')
  }

  const notifyBillCreationResult = (data: any, pendingLabel = 'Bill created') => {
    if (billBankTransferDueAmount(data) > 0) {
      showToast('success', 'Bank transfer folio has been emailed to the client. When the required company payment data is complete, the PDF also includes a UPN QR code. Import your bank statement CSV later to mark it paid automatically in folio history.')
      return
    }
    if (data?.paymentMethod?.stripeEnabled) {
      showToast('success', 'Payment link has been sent to the client email. Bill is now payment pending.')
      return
    }
    if (data?.paymentStatus && data.paymentStatus !== 'paid') {
      showToast('success', `${pendingLabel} with payment status: ${data.paymentStatus}.`)
      return
    }
    if (data?.fiscalStatus === 'FAILED') {
      showToast('error', `Bill created, but fiscalization failed: ${data?.fiscalLastError || 'Unknown error'}`)
      return
    }
    if (data?.fiscalStatus === 'SENT') {
      showToast('success', `Bill fiscalized successfully${data?.fiscalEor ? ` (EOR: ${data.fiscalEor})` : ''}.`)
      return
    }
    showToast('success', pendingLabel)
  }

  const createBill = async (afterCreatePdfAction: InvoicePdfAction = 'download') => {
    if (creatingBill) return
    if (billForm.billType === 'ADVANCE' ? !canIssueAdvanceInvoice : !canIssueOpenInvoice) {
      showToast('error', billForm.billType === 'ADVANCE'
        ? (locale === 'sl' ? 'Nimate dovoljenja za izdajo predplačil.' : 'You do not have permission to issue advance invoices.')
        : (locale === 'sl' ? 'Nimate dovoljenja za izdajo odprtih računov.' : 'You do not have permission to issue open invoices.'))
      return
    }
    if (afterCreatePdfAction === 'print' && useDirectPosPrinting) {
      const ready = await prepareDirectPosPrinter()
      if (!ready) return
    }
    const printWindow = afterCreatePdfAction === 'print' && !useDirectPosPrinting
      ? openPdfActionWindow(locale === 'sl' ? 'Pripravljam račun za tiskanje…' : 'Preparing invoice for printing…')
      : null
    setCreatingBill(true)
    try {
      const payload = {
        clientId: billForm.clientId,
        consultantId: billForm.consultantId ?? me.id,
        paymentMethodId: billForm.paymentMethodId,
        paymentSplits: buildCreatePaymentSplitsPayload(createBillPayableGross),
        ...discountPayloadFields(createBillDiscountDraft, grossPreview, billForm.items),
        billingTarget: billForm.billingTarget,
        recipientCompanyId: billForm.recipientCompanyId,
        bankTransferReference: billForm.bankTransferReference,
        billType: billForm.billType,
        sessionId: billForm.sessionId,
        legalEntityId: billForm.legalEntityId,
        invoiceSeriesId: billForm.invoiceSeriesId,
        locationId: billForm.locationId,
        items: billForm.items.map((item) => ({
          ...item,
          netPrice: Number(item.netPrice),
          grossPrice: Number(item.grossPrice),
          sourceSessionBookingId: item.sourceSessionBookingId ?? billForm.sessionId ?? undefined,
        })),
      }
      const { data } = await api.post('/billing/bills', payload)

      // Show instantly in the list.
      if (data?.id) setBills((prev) => [normalizeBill(data), ...prev])

      await handleCreatedBillPdfAction(data, afterCreatePdfAction, printWindow)
      setBillForm({ items: [], billingTarget: 'PERSON', billType: 'INVOICE', discountType: 'PERCENT', discountValue: '0', wholeBillDiscountPercent: '0', itemDiscounts: {} })
      setShowCreateBillModal(false)
      setEditingCreateBillPayee(false)
      if (!embeddedCreateMode && newBillDrawerOpen) closeDrawer()
      if (data?.id && shouldCreateCheckoutSession(data)) {
        await api.post(`/billing/bills/${data.id}/checkout-session`)
      }
      notifyBillCreationResult(data)
      await reloadAfterBillingMutation()
      if (embeddedCreateBill) {
        await onEmbeddedSaved?.()
        onEmbeddedClose?.()
      }
    } catch (error: any) {
      closePdfActionWindow(printWindow)
      if (!showStripeSetupPopupFromError(error) && !showBankTransferQrSettingsPopupFromError(error)) {
        showToast(
          'error',
          readBillingApiMessage(error) || (locale === 'sl' ? 'Računa ni bilo mogoče izdati.' : 'Unable to issue the invoice.'),
        )
      }
    } finally {
      setCreatingBill(false)
    }
  }

  const openCreateBillModal = async () => {
    if (!canIssueOpenInvoice) {
      showToast('error', locale === 'sl' ? 'Nimate dovoljenja za izdajo odprtih računov.' : 'You do not have permission to issue open invoices.')
      return
    }
    const dependencies = await loadBillingEditorDependencies(false)
    const stripeEnabled = dependencies.settings.BILLING_ONLINE_CARD_PAYMENTS_ENABLED !== 'false'
    const advanceEnabled = dependencies.settings.BILLING_ADVANCE_ENABLED !== 'false'
    const availablePaymentMethods = dependencies.paymentMethods
      .filter((method) => stripeEnabled || !isStripePaymentMethod(method))
      .filter((method) => advanceEnabled || !isDepositPaymentMethod(method))
    const defaultPaymentMethodId = availablePaymentMethods.find((method) => !isDepositPaymentMethod(method))?.id ?? availablePaymentMethods[0]?.id
    setBillForm({
      items: [],
      paymentMethodId: defaultPaymentMethodId,
      billingTarget: 'PERSON',
      billType: 'INVOICE',
      consultantId: me.id,
      discountType: 'PERCENT',
      discountValue: '0',
      wholeBillDiscountPercent: '0',
      itemDiscounts: {},
    })
    setEditingCreateBillPayee(false)
    if (embeddedMode) setShowCreateBillModal(true)
    else openDrawer(BILLING_DRAWERS.newBill, { search: pageSearch })
  }

  useEffect(() => {
    if (embeddedMode || !newBillDrawerOpen) {
      seededCreateBillClientRef.current = ''
      return
    }

    const params = new URLSearchParams(location.search)
    const seededClientId = Number(params.get('clientId') ?? 0)
    const seededCompanyId = Number(params.get('companyId') ?? params.get('recipientCompanyId') ?? 0)
    const hasSeededClient = Number.isInteger(seededClientId) && seededClientId > 0
    const hasSeededCompany = Number.isInteger(seededCompanyId) && seededCompanyId > 0
    if (!hasSeededClient && !hasSeededCompany) return

    const seedEntityKey = hasSeededCompany ? `company:${seededCompanyId}` : `client:${seededClientId}`
    const seedKey = `${activeUnitId ?? 'none'}:${selectedLocationId ?? 'all'}:${seedEntityKey}`
    if (seededCreateBillClientRef.current === seedKey) return
    seededCreateBillClientRef.current = seedKey

    if (!canIssueOpenInvoice) {
      showToast('error', locale === 'sl' ? 'Nimate dovoljenja za izdajo odprtih računov.' : 'You do not have permission to issue open invoices.')
      closeDrawer()
      return
    }

    let cancelled = false
    void loadBillingEditorDependencies(false)
      .then((dependencies) => {
        if (cancelled) return
        const stripeEnabled = dependencies.settings.BILLING_ONLINE_CARD_PAYMENTS_ENABLED !== 'false'
        const advanceEnabled = dependencies.settings.BILLING_ADVANCE_ENABLED !== 'false'
        const availablePaymentMethods = dependencies.paymentMethods
          .filter((method) => stripeEnabled || !isStripePaymentMethod(method))
          .filter((method) => advanceEnabled || !isDepositPaymentMethod(method))
        const defaultPaymentMethodId = availablePaymentMethods.find((method) => !isDepositPaymentMethod(method))?.id ?? availablePaymentMethods[0]?.id

        setBillForm({
          items: [],
          paymentMethodId: defaultPaymentMethodId,
          billingTarget: hasSeededCompany ? 'COMPANY' : 'PERSON',
          billType: 'INVOICE',
          clientId: hasSeededClient ? seededClientId : undefined,
          recipientCompanyId: hasSeededCompany ? seededCompanyId : undefined,
          consultantId: me.id,
          discountType: 'PERCENT',
          discountValue: '0',
          wholeBillDiscountPercent: '0',
          itemDiscounts: {},
        })
        setEditingCreateBillPayee(false)
      })
      .catch(() => {
        if (!cancelled) seededCreateBillClientRef.current = ''
      })

    return () => {
      cancelled = true
    }
  }, [activeUnitId, canIssueOpenInvoice, closeDrawer, embeddedMode, locale, location.search, me.id, newBillDrawerOpen, selectedLocationId, showToast])

  const openCreateAdvanceBillModal = async () => {
    if (!advanceBillingEnabled) return
    if (!canIssueAdvanceInvoice) {
      showToast('error', locale === 'sl' ? 'Nimate dovoljenja za izdajo predplačil.' : 'You do not have permission to issue advance invoices.')
      return
    }
    const dependencies = await loadBillingEditorDependencies(false)
    const stripeEnabled = dependencies.settings.BILLING_ONLINE_CARD_PAYMENTS_ENABLED !== 'false'
    const availablePaymentMethods = dependencies.paymentMethods.filter((method) => stripeEnabled || !isStripePaymentMethod(method))
    const defaultPaymentMethodId = availablePaymentMethods.find((method) => !isDepositPaymentMethod(method))?.id ?? availablePaymentMethods[0]?.id
    setBillForm({
      items: [],
      paymentMethodId: defaultPaymentMethodId,
      billingTarget: 'PERSON',
      billType: 'ADVANCE',
      consultantId: me.id,
      wholeBillDiscountPercent: '0',
      itemDiscounts: {},
    })
    setEditingCreateBillPayee(false)
    if (embeddedMode) setShowCreateBillModal(true)
    else openDrawer(BILLING_DRAWERS.newBill, { search: mergeSearch(pageSearch, 'type=advance') })
  }

  const closeCreateBillModal = () => {
    setShowCreateBillModal(false)
    setEditingCreateBillPayee(false)
    setBillForm({ items: [], billingTarget: 'PERSON', billType: 'INVOICE', discountType: 'PERCENT', discountValue: '0', wholeBillDiscountPercent: '0', itemDiscounts: {} })
    setRecipientCompanySearch('')
    setRecipientCompanyPickerOpen(false)
    setEditingRecipientCompanySearch(false)
    if (embeddedCreateBill && onEmbeddedClose) onEmbeddedClose()
    else if (newBillDrawerOpen) closeDrawer()
  }

  const closeDetailOpenBill = () => {
    setOpenBillEditorRootId(null)
    setOpenBillAddMenuForId(null)
    setExternalOpenBillPickerForRootId(null)
    setExternalOpenBillSearch('')
    setTemporaryOpenBillTabIds({})
    setSelectedOpenBillLines({})
    setMoveSelectedTargetOpenBillId(null)
    if (activeOpenBillId && onEmbeddedClose) {
      // Keep the current bill mounted until the parent removes editOpenBillId. Clearing it
      // first produces a misleading "Loading bill data" shell after the last invoice.
      onEmbeddedClose()
      return
    }
    setDetailOpenBill(null)
    const searchParams = new URLSearchParams(location.search)
    const returnTo = searchParams.get('returnTo')
    if (returnTo) {
      navigate(returnTo, { replace: true })
      return
    }
    if (openBillDrawerOpen) {
      closeDrawer()
      return
    }
    if (!activeOpenBillId) return
    navigate(pageSearch ? `/billing?${pageSearch}` : '/billing', { replace: true })
  }

  const closeGiftCardPanel = () => {
    setDetailGiftCard(null)
    if (giftCardDrawerOpen) closeDrawer()
  }

  const openGiftCardPanel = (card: BillingGiftCard) => {
    setDetailGiftCard(card)
    if (!embeddedMode) {
      openDrawer(BILLING_DRAWERS.giftCard, { params: { id: String(card.id) }, search: pageSearch })
    }
  }

  const closeWorkspaceBillsPanel = () => {
    setShowWorkspaceBills(false)
    if (workspaceBillsDrawerOpen) closeDrawer()
  }

  const closeFolioPanel = () => {
    setFiscalLogBill(null)
    setDetailFolioBill(null)
    if (billDrawerOpen) closeDrawer()
  }

  const openEditInvoicePopup = (ob: OpenBill) => {
    void loadBillingEditorDependencies(false)
    setOpenBillEditorRootId(ob.id)
    setOpenBillAddMenuForId(null)
    setExternalOpenBillPickerForRootId(null)
    setExternalOpenBillSearch('')
    setSelectedOpenBillLines({})
    setMoveSelectedTargetOpenBillId(null)
    setDetailOpenBill(ob)
    if (!embeddedMode) {
      openDrawer(BILLING_DRAWERS.openBill, { params: { id: String(ob.id) }, search: pageSearch })
    }
  }

  const selectedClient = useMemo(() => clients.find((client) => client.id === billForm.clientId), [clients, billForm.clientId])
  const createAdvanceTabs = useMemo(() => {
    if (billForm.billType !== 'ADVANCE') return []
    const ids = Array.from(new Set([embeddedCreateBill?.clientId, ...(embeddedCreateBill?.clientIds ?? [])]
      .map((value) => Number(value ?? 0))
      .filter((value) => Number.isInteger(value) && value > 0)))
    if (ids.length <= 1) return []
    return ids.map((clientId) => {
      const client = clients.find((entry) => Number(entry.id) === clientId)
      return {
        clientId,
        label: client ? fullName(client) : `#${clientId}`,
        typeLabel: billingCopy.targetPerson,
      }
    })
  }, [billForm.billType, billingCopy.targetPerson, clients, embeddedCreateBill?.clientId, embeddedCreateBill?.clientIds])
  const selectedClientCompany = selectedClient?.billingCompany
  const selectedRecipientCompany = useMemo(
    () => companies.find((company) => company.id === billForm.recipientCompanyId),
    [companies, billForm.recipientCompanyId],
  )
  /** Company invoices: only clients with billingCompany matching the selected recipient (ClientCompany). */
  const clientsLinkedToInvoiceCompany = useMemo(() => {
    if (billForm.billingTarget !== 'COMPANY' || billForm.recipientCompanyId == null) return []
    return clients.filter((c) => c.billingCompany?.id === billForm.recipientCompanyId)
  }, [billForm.billingTarget, billForm.recipientCompanyId, clients])

  useEffect(() => {
    if (billForm.billingTarget !== 'COMPANY' || billForm.recipientCompanyId == null) return
    if (billForm.clientId == null) return
    const stillLinked = clients.some(
      (c) => c.id === billForm.clientId && c.billingCompany?.id === billForm.recipientCompanyId,
    )
    if (!stillLinked) setBillForm((prev) => ({ ...prev, clientId: undefined }))
  }, [billForm.billingTarget, billForm.recipientCompanyId, billForm.clientId, clients])

  const visibleRecipientCompanies = useMemo(() => {
    const q = recipientCompanySearch.trim().toLowerCase()
    if (!q) return companies
    return companies.filter((company) =>
      company.name.toLowerCase().includes(q)
      || (company.email || '').toLowerCase().includes(q)
      || (company.telephone || '').toLowerCase().includes(q),
    )
  }, [companies, recipientCompanySearch])
  const detailEligibleUnusedAdvances = useMemo(() => {
    if (!detailOpenBill) return unusedAdvances
    const detailRecipientTarget: 'PERSON' | 'COMPANY' =
      detailOpenBill.batchTargetCompanyId != null || detailOpenBill.batchScope === 'COMPANY'
        ? 'COMPANY'
        : 'PERSON'
    const byId = new Map<number, UnusedAdvance>()
    unusedAdvances
      .filter((entry) => doesUnusedAdvanceMatchRecipient(
        entry,
        detailRecipientTarget,
        detailOpenBill.client?.id ?? null,
        detailOpenBill.batchTargetCompanyId ?? null,
      ))
      .forEach((entry) => byId.set(entry.advanceBillId, { ...entry }))

    const persistedAdvanceSelections = (() => {
      const serverSelections = (detailOpenBill.paymentSplits ?? [])
        .filter((split) => isDepositPaymentMethod(split.paymentMethod) && split.sourceAdvanceBillId != null)
        .map<AdvancePaymentSelectionDraft>((split) => ({
          advanceBillId: Number(split.sourceAdvanceBillId),
          mode: 'partial',
          amountGross: formatPaymentAmountInput(Number(split.amountGross || 0)),
        }))
        .filter((selection) => Number.isFinite(selection.advanceBillId) && selection.advanceBillId > 0)
      const hasAdvanceSourcePaymentSplits = serverSelections.length > 0
      return hasAdvanceSourcePaymentSplits ? serverSelections : getLegacyAdvanceSelectionsFromOpenBillItems(detailOpenBill)
    })()

    persistedAdvanceSelections.forEach((selection) => {
      const selectedAmountGross = Number(selection.amountGross || 0)
      if (!Number.isFinite(selectedAmountGross) || selectedAmountGross <= 0) return
      if (byId.has(selection.advanceBillId)) return
      const bill = bills.find((entry) => entry.id === selection.advanceBillId)
      byId.set(selection.advanceBillId, {
        advanceBillId: selection.advanceBillId,
        billNumber: bill?.billNumber || `ADV-${selection.advanceBillId}`,
        sessionId: bill?.sessionId ?? null,
        client: bill?.client ? { id: bill.client.id, firstName: bill.client.firstName, lastName: bill.client.lastName } : null,
        recipientCompany: bill?.recipientCompany ? { id: bill.recipientCompany.id, name: bill.recipientCompany.name } : null,
        billingTarget: bill?.billingTarget ?? null,
        issueDate: bill?.issueDate || '',
        totalNet: selectedAmountGross,
        usedNet: 0,
        remainingNet: selectedAmountGross,
        totalGross: selectedAmountGross,
        usedGross: 0,
        remainingGross: selectedAmountGross,
      })
    })
    return Array.from(byId.values())
  }, [unusedAdvances, detailOpenBill, bills, services, paymentMethods])
  const createEligibleUnusedAdvances = useMemo(
    () => unusedAdvances.filter((entry) => doesUnusedAdvanceMatchRecipient(
      entry,
      billForm.billingTarget,
      billForm.clientId ?? null,
      billForm.recipientCompanyId ?? null,
    )),
    [unusedAdvances, billForm.billingTarget, billForm.clientId, billForm.recipientCompanyId],
  )

  const createBillSessionOptions = useMemo(() => {
    if (billForm.billType !== 'INVOICE') return []
    const seen = new Set<number>()
    const options: { sessionId: number; label: string }[] = []
    const addOption = (sessionId: number, label: string) => {
      if (!Number.isFinite(sessionId) || sessionId <= 0 || seen.has(sessionId)) return
      seen.add(sessionId)
      options.push({ sessionId, label })
    }

    for (const booking of bookings) {
      const paymentStatuses = booking.paymentStatuses ?? []
      for (const status of paymentStatuses) {
        if (status.status === 'PAID') continue
        const participant = (booking.clients || []).find((client) => client.id === status.clientId)
          || (booking.client?.id === status.clientId ? booking.client : null)
        if (!participant) continue
        const payee = (booking.payees || []).find((entry) => entry.clientId === participant.id)
        const matchesPerson = billForm.billingTarget === 'PERSON'
          && billForm.clientId != null
          && participant.id === billForm.clientId
        const matchesCompany = billForm.billingTarget === 'COMPANY'
          && billForm.recipientCompanyId != null
          && (participant.billingCompany?.id === billForm.recipientCompanyId
            || booking.sessionGroupBillingCompany?.id === billForm.recipientCompanyId
            || payee?.company?.id === billForm.recipientCompanyId)
        if (!matchesPerson && !matchesCompany) continue
        const labelParts = [
          formatBillingSessionIdDisplay(status.bookingId || booking.id),
          booking.type?.name,
          participant ? fullName(participant) : null,
          status.sessionTotalGross != null ? currency(status.sessionTotalGross) : null,
        ].filter(Boolean)
        addOption(status.bookingId || booking.id, labelParts.join(' · '))
      }
    }

    for (const ob of openBills) {
      const clientDetails = ob.client?.id ? clients.find((client) => client.id === ob.client?.id) : null
      const matchesPerson = billForm.billingTarget === 'PERSON'
        && billForm.clientId != null
        && ob.client?.id === billForm.clientId
      const matchesCompany = billForm.billingTarget === 'COMPANY'
        && billForm.recipientCompanyId != null
        && (ob.batchTargetCompanyId === billForm.recipientCompanyId || clientDetails?.billingCompany?.id === billForm.recipientCompanyId)
      if (!matchesPerson && !matchesCompany) continue
      const sessions = (ob.sessions && ob.sessions.length > 0)
        ? ob.sessions
        : (ob.sessionId != null
          ? [{
              sessionId: ob.sessionId,
              sessionDisplayId: ob.sessionDisplayId,
              sessionInfo: ob.sessionInfo || '',
              clientName: openBillClientLabel(ob),
              totalGross: estimateGross(getOpenBillItems(ob)),
            }]
          : [])
      for (const session of sessions) {
        if (!Number.isFinite(session.sessionId) || session.sessionId <= 0) continue
        const labelParts = [
          session.sessionDisplayId || formatBillingSessionIdDisplay(session.sessionId),
          session.sessionInfo || session.clientName || openBillClientLabel(ob),
          session.totalGross != null ? currency(session.totalGross) : null,
        ].filter(Boolean)
        addOption(session.sessionId, labelParts.join(' · '))
      }
    }
    return options
  }, [billForm.billType, billForm.billingTarget, billForm.clientId, billForm.recipientCompanyId, bookings, clients, openBills])

  useEffect(() => {
    if (billForm.billType !== 'INVOICE') return
    if (billForm.sessionId == null) return
    if (createBillSessionOptions.some((option) => option.sessionId === billForm.sessionId)) return
    setBillForm((prev) => ({
      ...prev,
      sessionId: undefined,
      items: prev.items.map((item) => ({ ...item, sourceSessionBookingId: undefined })),
    }))
  }, [billForm.billType, billForm.sessionId, createBillSessionOptions])
  const billItemsAllowedByType = billForm.items.length === 0
    || (availableBillServices.length > 0 && billForm.items.every((item) => availableBillServices.some((service) => service.id === item.transactionServiceId)))
  const createAvailablePaymentMethods = useMemo(
    () => billForm.billType === 'INVOICE' ? visiblePaymentMethods : visiblePaymentMethods.filter((method) => !isDepositPaymentMethod(method)),
    [visiblePaymentMethods, billForm.billType],
  )
  const createPaymentSplits = getCreateBillPaymentSplits(createBillPayableGross)
  const createPaymentsMatchTotal = paymentSplitsMatchInvoiceTotal(createPaymentSplits, createBillPayableGross)
  const detailOpenBillTransactionGross = useMemo(() => {
    if (!detailOpenBill) return 0
    const transactionItems = getOpenBillItems(detailOpenBill).filter((item) => item.sourceAdvanceBillId == null)
    return payableGrossAfterDiscount(estimateGross(transactionItems), getOpenBillDiscountDraft(detailOpenBill), transactionItems)
  }, [detailOpenBill, openBillEdits, openBillDiscountEdits, services])
  const createAdvanceSelectionValid = createPaymentSplits.every((split) => (
    !isAdvancePaymentSplit(split)
    || validateAdvanceSelections(getAdvanceSelectionsForSplit(split), createEligibleUnusedAdvances, createBillPayableGross)
  ))
  const detailPaymentSelectionValid = !detailOpenBill || (
    getOpenBillPaymentSplits(detailOpenBill, detailOpenBillTransactionGross).every((split) => (
      !isAdvancePaymentSplit(split)
      || validateAdvanceSelections(getAdvanceSelectionsForSplit(split), detailEligibleUnusedAdvances, detailOpenBillTransactionGross)
    ))
    && openBillEntitlementSelectionIsValid(detailOpenBill, detailOpenBillTransactionGross)
  )
  const billCanSubmit = billForm.items.length > 0
    && (billForm.billingTarget === 'PERSON' ? Boolean(billForm.clientId) : Boolean(billForm.recipientCompanyId))
    && Boolean(billForm.legalEntityId && billForm.invoiceSeriesId && billForm.locationId)
    && billItemsAllowedByType
    && createPaymentsMatchTotal
    && createAdvanceSelectionValid

  useEffect(() => {
    if (billForm.paymentMethodId && createAvailablePaymentMethods.some((method) => method.id === billForm.paymentMethodId)) return
    const fallbackPaymentMethodId = createAvailablePaymentMethods[0]?.id
    if (!fallbackPaymentMethodId) return
    setBillForm((prev) => ({
      ...prev,
      paymentMethodId: fallbackPaymentMethodId,
      paymentSplits: undefined,
    }))
  }, [billForm.paymentMethodId, createAvailablePaymentMethods, createBillPayableGross])

  const openAddCompanyModal = (target: { mode: 'createBill' } | { mode: 'editOpenBill'; openBillId: number }) => {
    setAddCompanyTarget(target)
    setNewCompanyName('')
    setNewCompanyEmail('')
    setNewCompanyTelephone('')
    setRecipientCompanyPickerOpen(false)
    setEditingRecipientCompanySearch(false)
    setShowAddCompanyModal(true)
  }

  const closeAddCompanyModal = () => {
    setShowAddCompanyModal(false)
    setAddCompanyTarget(null)
  }

  const openAddClientModal = (target: { mode: 'createBill' } | { mode: 'editOpenBill'; openBillId: number }) => {
    setAddClientTarget(target)
    setNewClientFirstName('')
    setNewClientLastName('')
    setNewClientEmail('')
    setNewClientPhone('')
    setNewClientInlineError('')
    setShowAddClientModal(true)
  }

  const closeAddClientModal = () => {
    setShowAddClientModal(false)
    setAddClientTarget(null)
    setNewClientInlineError('')
  }

  const getPayeeClientEdit = useCallback((client: Client | null | undefined) => {
    if (!client) {
      return { firstName: '', lastName: '', email: '', phone: '' }
    }
    const draft = payeeClientEdits[client.id]
    return {
      firstName: draft?.firstName ?? client.firstName ?? '',
      lastName: draft?.lastName ?? client.lastName ?? '',
      email: draft?.email ?? client.email ?? '',
      phone: draft?.phone ?? client.phone ?? '',
    }
  }, [payeeClientEdits])

  const getPayeeCompanyEdit = useCallback((company: Company | null | undefined) => {
    if (!company) {
      return { name: '', email: '', telephone: '', address: '', postalCode: '', city: '', vatId: '' }
    }
    const draft = payeeCompanyEdits[company.id]
    return {
      name: draft?.name ?? company.name ?? '',
      email: draft?.email ?? company.email ?? '',
      telephone: draft?.telephone ?? company.telephone ?? '',
      address: draft?.address ?? company.address ?? '',
      postalCode: draft?.postalCode ?? company.postalCode ?? '',
      city: draft?.city ?? company.city ?? '',
      vatId: draft?.vatId ?? company.vatId ?? '',
    }
  }, [payeeCompanyEdits])

  const updatePayeeClientEdit = useCallback((client: Client | null | undefined, patch: Partial<PayeeClientEditDraft>) => {
    if (!client) return
    setPayeeClientEdits((prev) => ({
      ...prev,
      [client.id]: {
        firstName: prev[client.id]?.firstName ?? client.firstName ?? '',
        lastName: prev[client.id]?.lastName ?? client.lastName ?? '',
        email: prev[client.id]?.email ?? client.email ?? '',
        phone: prev[client.id]?.phone ?? client.phone ?? '',
        ...patch,
      },
    }))
  }, [])

  const updatePayeeCompanyEdit = useCallback((company: Company | null | undefined, patch: Partial<PayeeCompanyEditDraft>) => {
    if (!company) return
    setPayeeCompanyEdits((prev) => ({
      ...prev,
      [company.id]: {
        name: prev[company.id]?.name ?? company.name ?? '',
        email: prev[company.id]?.email ?? company.email ?? '',
        telephone: prev[company.id]?.telephone ?? company.telephone ?? '',
        address: prev[company.id]?.address ?? company.address ?? '',
        postalCode: prev[company.id]?.postalCode ?? company.postalCode ?? '',
        city: prev[company.id]?.city ?? company.city ?? '',
        vatId: prev[company.id]?.vatId ?? company.vatId ?? '',
        ...patch,
      },
    }))
  }, [])

  const persistPayeeClientEdit = useCallback(async (clientId?: number, override?: PayeeClientEditDraft) => {
    if (!clientId) return true
    const existingClient = clients.find((client) => client.id === clientId)
    if (!existingClient) return true
    const payload = override ?? getPayeeClientEdit(existingClient)
    const unchanged = payload.firstName === (existingClient.firstName ?? '')
      && payload.lastName === (existingClient.lastName ?? '')
      && payload.email === (existingClient.email ?? '')
      && payload.phone === (existingClient.phone ?? '')
    if (unchanged) {
      setPayeeClientEdits((prev) => {
        if (!Object.prototype.hasOwnProperty.call(prev, clientId)) return prev
        const next = { ...prev }
        delete next[clientId]
        return next
      })
      return true
    }
    try {
      const response = await api.put<Client>(`/clients/${clientId}`, {
        firstName: payload.firstName.trim(),
        lastName: payload.lastName.trim(),
        email: payload.email.trim() || null,
        phone: payload.phone.trim() || null,
      })
      setClients((prev) => prev.map((client) => (client.id === response.data.id ? response.data : client)))
      setPayeeClientEdits((prev) => {
        const next = { ...prev }
        delete next[clientId]
        return next
      })
      return true
    } catch (error: any) {
      showToast('error', error?.response?.data?.message || error?.message || (locale === 'sl' ? 'Shranjevanje stranke ni uspelo.' : 'Failed to save client.'))
      return false
    }
  }, [clients, getPayeeClientEdit, locale, showToast])

  const persistPayeeCompanyEdit = useCallback(async (companyId?: number, override?: PayeeCompanyEditDraft) => {
    if (!companyId) return true
    const existingCompany = companies.find((company) => company.id === companyId)
    if (!existingCompany) return true
    const payload = override ?? getPayeeCompanyEdit(existingCompany)
    const unchanged = payload.name === (existingCompany.name ?? '')
      && payload.email === (existingCompany.email ?? '')
      && payload.telephone === (existingCompany.telephone ?? '')
      && payload.address === (existingCompany.address ?? '')
      && payload.postalCode === (existingCompany.postalCode ?? '')
      && payload.city === (existingCompany.city ?? '')
      && payload.vatId === (existingCompany.vatId ?? '')
    if (unchanged) {
      setPayeeCompanyEdits((prev) => {
        if (!Object.prototype.hasOwnProperty.call(prev, companyId)) return prev
        const next = { ...prev }
        delete next[companyId]
        return next
      })
      return true
    }
    try {
      const response = await api.put<Company>(`/companies/${companyId}`, {
        name: payload.name.trim(),
        address: payload.address.trim() || null,
        postalCode: payload.postalCode.trim() || null,
        city: payload.city.trim() || null,
        vatId: payload.vatId.trim() || null,
        email: payload.email.trim() || null,
        telephone: payload.telephone.trim() || null,
      })
      setCompanies((prev) => prev.map((company) => (company.id === response.data.id ? response.data : company)))
      setPayeeCompanyEdits((prev) => {
        const next = { ...prev }
        delete next[companyId]
        return next
      })
      return true
    } catch (error: any) {
      showToast('error', error?.response?.data?.message || error?.message || (locale === 'sl' ? 'Shranjevanje podjetja ni uspelo.' : 'Failed to save company.'))
      return false
    }
  }, [companies, getPayeeCompanyEdit, locale, showToast])

  const createClientInline = async () => {
    const firstName = newClientFirstName.trim()
    const lastName = newClientLastName.trim()
    if (!firstName || !lastName || creatingClientInline) return
    setCreatingClientInline(true)
    setNewClientInlineError('')
    try {
      const { data } = await api.post('/clients', {
        firstName,
        lastName,
        email: newClientEmail.trim() || null,
        phone: newClientPhone.trim() || null,
        preferredSlots: [],
      }, { headers: skipConflictToastHeaders })
      const createdClient = data as Client
      setClients((prev) => [createdClient, ...prev].sort((a, b) => fullName(a).localeCompare(fullName(b))))
      if (addClientTarget?.mode === 'editOpenBill') {
        const targetId = addClientTarget.openBillId
        if (editingOpenBillPayeeId === targetId && openBillPayeeDialogDraft?.openBillId === targetId) {
          setOpenBillPayeeDialogDraft((prev) => prev && prev.openBillId === targetId
            ? {
              ...prev,
              details: mergeOpenBillDetailsDraft(prev.details, {
                billingTarget: 'PERSON',
                clientId: createdClient.id,
                recipientCompanyId: undefined,
              }),
            }
            : prev)
        } else {
          const targetOpenBill = detailOpenBill?.id === targetId ? detailOpenBill : openBills.find((entry) => entry.id === targetId)
          setOpenBillDetailsEdits((prev) => {
            const current = targetOpenBill
              ? (prev[targetId] ?? deriveOpenBillDetailsDraft(targetOpenBill))
              : (prev[targetId] ?? { billingTarget: 'PERSON' as const })
            return {
              ...prev,
              [targetId]: mergeOpenBillDetailsDraft(current, {
                billingTarget: 'PERSON',
                clientId: createdClient.id,
                recipientCompanyId: undefined,
              }),
            }
          })
        }
      } else {
        setBillForm((prev) => ({ ...prev, billingTarget: 'PERSON', clientId: createdClient.id, recipientCompanyId: undefined }))
      }
      closeAddClientModal()
    } catch (error: any) {
      setNewClientInlineError(clientMutationErrorMessage(
        error,
        locale,
        locale === 'sl' ? 'Ustvarjanje stranke ni uspelo.' : 'Failed to create client.',
      ))
    } finally {
      setCreatingClientInline(false)
    }
  }

  const createCompanyInline = async () => {
    const name = newCompanyName.trim()
    if (!name || creatingCompany) return
    setCreatingCompany(true)
    try {
      const { data } = await api.post('/companies', {
        name,
        email: newCompanyEmail.trim() || null,
        telephone: newCompanyTelephone.trim() || null,
      })
      setCompanies((prev) => [data, ...prev].sort((a, b) => a.name.localeCompare(b.name)))
      if (addCompanyTarget?.mode === 'editOpenBill') {
        const targetId = addCompanyTarget.openBillId
        if (editingOpenBillPayeeId === targetId && openBillPayeeDialogDraft?.openBillId === targetId) {
          setOpenBillPayeeDialogDraft((prev) => prev && prev.openBillId === targetId
            ? {
              ...prev,
              details: mergeOpenBillDetailsDraft(prev.details, {
                billingTarget: 'COMPANY',
                recipientCompanyId: data.id,
              }),
            }
            : prev)
        } else {
          const targetOpenBill = detailOpenBill?.id === targetId ? detailOpenBill : openBills.find((entry) => entry.id === targetId)
          setOpenBillDetailsEdits((prev) => {
            const current = targetOpenBill
              ? (prev[targetId] ?? deriveOpenBillDetailsDraft(targetOpenBill))
              : (prev[targetId] ?? { billingTarget: 'COMPANY' as const })
            return {
              ...prev,
              [targetId]: mergeOpenBillDetailsDraft(current, {
                billingTarget: 'COMPANY',
                recipientCompanyId: data.id,
              }),
            }
          })
        }
      } else {
        setBillForm((prev) => ({ ...prev, billingTarget: 'COMPANY', recipientCompanyId: data.id }))
      }
      setNewCompanyName('')
      setNewCompanyEmail('')
      setNewCompanyTelephone('')
      setRecipientCompanyPickerOpen(false)
      setEditingRecipientCompanySearch(false)
      closeAddCompanyModal()
    } finally {
      setCreatingCompany(false)
    }
  }


  const invoicePrintPreference = normalizeInvoicePrintPreference(settings[DEFAULT_INVOICE_PRINT_FORMAT_KEY])
  const posPrintingPreferences = readPosPrintingPreferences(settings)
  const useDirectPosPrinting = directPosPrintingEnabled(settings)

  const billPdfFileName = (bill: { id: number; billNumber?: string | null }, format: InvoicePrintFormat = 'A4') =>
    `${format === 'POS_58' ? 'receipt-58mm' : 'folio'}-${bill.billNumber || `bill-${bill.id}`}.pdf`

  const openPdfActionWindow = (message: string): Window | null => {
    const actionWindow = window.open('', '_blank')
    if (actionWindow && !actionWindow.closed) {
      actionWindow.document.open()
      actionWindow.document.write(`<!doctype html><html><head><title>${escapePdfWindowHtml(message)}</title></head><body style="margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;color:#475569;"><p style="padding:24px;">${escapePdfWindowHtml(message)}</p></body></html>`)
      actionWindow.document.close()
    }
    return actionWindow
  }

  const closePdfActionWindow = (actionWindow?: Window | null) => {
    if (actionWindow && !actionWindow.closed) actionWindow.close()
  }

  const fetchBillFolioPdfBlob = async (billId: number, format: InvoicePrintFormat = 'A4'): Promise<Blob> => {
    const res = await api.get(`/billing/bills/${billId}/folio-pdf?locale=${locale}&format=${format}`, { responseType: 'blob' })
    return new Blob([res.data], { type: 'application/pdf' })
  }

  const downloadPdfBlob = (blob: Blob, fileName: string) => {
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  }

  const toggleHistoryBillSelection = (billId: number, checked?: boolean) => {
    setSelectedHistoryBillIds((prev) => {
      const exists = prev.includes(billId)
      const shouldSelect = checked == null ? !exists : checked
      if (shouldSelect && !exists) return [...prev, billId]
      if (!shouldSelect && exists) return prev.filter((id) => id !== billId)
      return prev
    })
  }

  const toggleHistoryPageSelection = (checked: boolean) => {
    setSelectedHistoryBillIds((prev) => {
      const next = new Set(prev)
      historyPageBillIds.forEach((id) => {
        if (checked) next.add(id)
        else next.delete(id)
      })
      return Array.from(next)
    })
  }

  const downloadHistoryExport = async (kind: 'pdf' | 'excel', scope: 'all' | 'selected') => {
    const stateLabel = `${scope}-${kind}` as 'all-pdf' | 'selected-pdf' | 'all-excel' | 'selected-excel'
    setExportingHistoryScope(stateLabel)
    setHistoryExportMenuOpen(false)
    try {
      const ids = scope === 'selected'
        ? selectedHistoryBillIds
        : (await api.get<number[]>('/billing/bills/paged/ids', {
          params: {
            locationId: selectedLocationId ?? undefined,
            search: historySearch.trim() || undefined,
            dateFrom: historyDateFrom || undefined,
            dateTo: historyDateTo || undefined,
            paymentStatus: historyStatusFilter !== 'all' ? historyStatusFilter : undefined,
            fiscalStatus: fiscalCashRegisterEnabled && historyFiscalStatusFilter !== 'all' ? historyFiscalStatusFilter : undefined,
            billType: historyBillTypeFilter !== 'all' ? historyBillTypeFilter : undefined,
            sortField: historySortField,
            sortDir: historySortDir,
          },
        })).data

      if (!Array.isArray(ids) || ids.length === 0) {
        showToast('error', locale === 'sl' ? 'Ni računov za izvoz.' : 'There are no invoices to export.')
        return
      }

      const response = await api.post(
        kind === 'pdf' ? `/billing/bills/export/pdf-zip?locale=${locale}` : `/billing/bills/export/excel?locale=${locale}`,
        { billIds: ids },
        { responseType: 'blob' },
      )
      const blob = new Blob([response.data], {
        type: kind === 'pdf' ? 'application/zip' : 'application/vnd.ms-excel',
      })
      const stamp = new Date().toISOString().slice(0, 10)
      const scopePart = scope === 'selected' ? (locale === 'sl' ? 'izbrani-racuni' : 'selected-invoices') : (locale === 'sl' ? 'vsi-racuni' : 'all-invoices')
      const extension = kind === 'pdf' ? 'zip' : 'xls'
      downloadPdfBlob(blob, `${scopePart}-${stamp}.${extension}`)
      showToast('success', locale === 'sl' ? 'Izvoz je pripravljen.' : 'Export is ready.')
    } catch (error: any) {
      showToast('error', readBillingApiMessage(error) || (locale === 'sl' ? 'Izvoza ni bilo mogoče pripraviti.' : 'Could not prepare the export.'))
    } finally {
      setExportingHistoryScope(null)
    }
  }

  const printPdfBlob = async (blob: Blob, fileName: string, preparedWindow?: Window | null): Promise<boolean> => {
    const printableFile = typeof File !== 'undefined'
      ? new File([blob], fileName, { type: 'application/pdf' })
      : null
    const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      || (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1024px)').matches)
    const shareNavigator = navigator as Navigator & { canShare?: (data: ShareData) => boolean }

    if (isMobileDevice && printableFile && navigator.share
      && (!shareNavigator.canShare || shareNavigator.canShare({ files: [printableFile] }))) {
      try {
        closePdfActionWindow(preparedWindow)
        await navigator.share({
          files: [printableFile],
          title: locale === 'sl' ? 'Račun za tiskanje' : locale === 'sr' ? 'Račun za štampu' : 'Invoice for printing',
        })
        return true
      } catch (error: any) {
        if (error?.name === 'AbortError') return false
        // Fall through to the native PDF viewer when file sharing is unavailable at runtime.
      }
    }

    const printableBlob = printableFile ?? blob
    const url = window.URL.createObjectURL(printableBlob)
    const printWindow = preparedWindow && !preparedWindow.closed ? preparedWindow : window.open('', '_blank')
    if (!printWindow) {
      window.URL.revokeObjectURL(url)
      showToast('error', locale === 'sl'
        ? 'Brskalnik je blokiral okno za tiskanje. Dovolite pojavna okna ali uporabite prenos PDF.'
        : locale === 'sr'
          ? 'Pregledač je blokirao prozor za štampu. Dozvolite iskačuće prozore ili preuzmite PDF.'
          : 'The browser blocked the print window. Allow pop-ups or use PDF download.')
      return false
    }

    if (isMobileDevice) {
      printWindow.location.href = url
      window.setTimeout(() => window.URL.revokeObjectURL(url), 120_000)
      return true
    }

    let printAttempted = false
    const tryPrint = () => {
      if (printAttempted || printWindow.closed) return
      printAttempted = true
      try { printWindow.focus(); printWindow.print() } catch { /* PDF remains open for manual printing. */ }
    }
    try { printWindow.addEventListener('load', () => window.setTimeout(tryPrint, 300), { once: true }) } catch { /* timer below is sufficient */ }
    printWindow.location.href = url
    window.setTimeout(tryPrint, 1500)
    window.setTimeout(() => window.URL.revokeObjectURL(url), 120_000)
    return true
  }

  const prepareDirectPosPrinter = async (): Promise<boolean> => {
    if (!useDirectPosPrinting) return true
    if (!getWebSerialApi()) {
      showToast('error', locale === 'sl'
        ? 'Neposredno POS tiskanje ni podprto v tem brskalniku. Uporabite Chrome ali Microsoft Edge.'
        : locale === 'sr'
          ? 'Direktna POS štampa nije podržana u ovom pregledaču. Koristite Chrome ili Microsoft Edge.'
          : 'Direct POS printing is not supported in this browser. Use Chrome or Microsoft Edge.')
      return false
    }
    try {
      const port = await acquirePosPrinterPort({ requestIfNeeded: true, preferredPort: posPrinterPortRef.current })
      if (!port) throw new Error(locale === 'sl' ? 'POS tiskalnik ni izbran.' : 'POS printer is not selected.')
      posPrinterPortRef.current = port
      return true
    } catch (error: any) {
      const name = String(error?.name || '')
      if (name === 'NotFoundError' || name === 'AbortError') {
        showToast('info', locale === 'sl' ? 'Izbira POS tiskalnika je bila preklicana.' : 'POS printer selection was cancelled.')
      } else {
        showToast('error', error?.message || (locale === 'sl' ? 'POS tiskalnika ni bilo mogoče povezati.' : 'Could not connect the POS printer.'))
      }
      return false
    }
  }

  const printBillDirectPos = async (bill: PrintableBillRef): Promise<boolean> => {
    if (printingBillId) return false
    setPrintingBillId(bill.id)
    try {
      let port = posPrinterPortRef.current
      if (!port) {
        port = await acquirePosPrinterPort({ requestIfNeeded: true })
        if (!port) throw new Error(locale === 'sl' ? 'Najprej povežite POS tiskalnik.' : 'Connect the POS printer first.')
        posPrinterPortRef.current = port
      }

      const { data } = await api.get(`/billing/bills/${bill.id}/pos-print-data`, { params: { locale } })
      const receipt = data?.receipt as PosReceiptPrintRequest | undefined
      const layout = data?.layout as PosReceiptLayout | undefined
      if (!receipt) throw new Error(locale === 'sl' ? 'Podatkov za POS račun ni bilo mogoče pripraviti.' : 'POS receipt data could not be prepared.')

      const printedBillNumber: string | number = receipt.folioNumber || bill.billNumber || bill.id
      const printerLayout: PosReceiptLayout | undefined = posPrintingPreferences.paperWidthMm === 80
        && posPrintingPreferences.template === 'COMPACT'
        && layout
        ? { ...layout, fontSize: 'COMPACT' }
        : layout
      const bytes = await buildPosReceiptEscPosBytes(receipt, printerLayout, locale, {
        paperWidthMm: posPrintingPreferences.paperWidthMm,
        // On 58 mm these switches live in Postavitev računa; the legacy POS toggles
        // are intentionally ignored so the saved layout is the single source of truth.
        printLogo: posPrintingPreferences.paperWidthMm === 58 ? true : posPrintingPreferences.printLogo,
        printQr: posPrintingPreferences.paperWidthMm === 58 ? true : posPrintingPreferences.printQr,
        autoCut: posPrintingPreferences.autoCut,
        logoSource: settings.COMPANY_LOGO_BASE64 || settings.COMPANY_LOGO_URL || null,
      })
      await sendEscPosBytes(port, bytes)
      showToast('success', locale === 'sl'
        ? `Račun ${printedBillNumber} je bil poslan na POS tiskalnik (${posPrintingPreferences.paperWidthMm} mm).`
        : `Invoice ${printedBillNumber} was sent to the POS printer (${posPrintingPreferences.paperWidthMm} mm).`)
      return true
    } catch (error: any) {
      const name = String(error?.name || '')
      if (name === 'NotFoundError' || name === 'AbortError') {
        showToast('info', locale === 'sl' ? 'Izbira POS tiskalnika je bila preklicana.' : 'POS printer selection was cancelled.')
      } else {
        showToast('error', error?.message || (locale === 'sl' ? 'Računa ni bilo mogoče natisniti na POS tiskalnik.' : 'Could not print the invoice on the POS printer.'))
      }
      return false
    } finally {
      setPrintingBillId(null)
    }
  }

  const downloadFolioPdf = async (bill: { id: number; billNumber?: string | null }, format: InvoicePrintFormat = 'A4') => {
    try {
      const blob = await fetchBillFolioPdfBlob(bill.id, format)
      downloadPdfBlob(blob, billPdfFileName(bill, format))
    } catch {
      showToast('error', locale === 'sl' ? 'PDF računa ni bilo mogoče prenesti.' : locale === 'sr' ? 'PDF računa nije moguće preuzeti.' : 'Unable to download invoice PDF.')
    }
  }

  const executePrintFolioPdf = async (
    bill: PrintableBillRef,
    format: InvoicePrintFormat,
    preparedWindow?: Window | null,
  ) => {
    if (printingBillId) { closePdfActionWindow(preparedWindow); return }
    setPrintingBillId(bill.id)
    try {
      const blob = await fetchBillFolioPdfBlob(bill.id, format)
      await printPdfBlob(blob, billPdfFileName(bill, format), preparedWindow)
    } catch {
      closePdfActionWindow(preparedWindow)
      showToast('error', locale === 'sl' ? 'Računa ni bilo mogoče pripraviti za tiskanje.' : locale === 'sr' ? 'Račun nije moguće pripremiti za štampu.' : 'Unable to prepare the invoice for printing.')
    } finally {
      setPrintingBillId(null)
    }
  }

  const printFolioPdf = async (
    bill: PrintableBillRef,
    preparedWindow?: Window | null,
    requestedFormat?: InvoicePrintFormat,
  ) => {
    const directPosRequested = useDirectPosPrinting && requestedFormat !== 'A4'
    if (directPosRequested) {
      closePdfActionWindow(preparedWindow)
      await printBillDirectPos(bill)
      return
    }

    if (requestedFormat) {
      const actionWindow = preparedWindow ?? openPdfActionWindow(
        locale === 'sl' ? 'Pripravljam račun za tiskanje…' : locale === 'sr' ? 'Pripremam račun za štampu…' : 'Preparing invoice for printing…',
      )
      await executePrintFolioPdf(bill, requestedFormat, actionWindow)
      return
    }
    if (invoicePrintPreference === 'ASK') {
      setPrintFormatChoice({ bill, preparedWindow })
      return
    }
    const actionWindow = preparedWindow ?? openPdfActionWindow(
      locale === 'sl' ? 'Pripravljam račun za tiskanje…' : locale === 'sr' ? 'Pripremam račun za štampu…' : 'Preparing invoice for printing…',
    )
    await executePrintFolioPdf(bill, invoicePrintPreference, actionWindow)
  }

  const isServiceVoucher = (card: BillingGiftCard | null | undefined) => card?.voucherMode === 'SERVICE'

  const voucherTypeLabel = (card: BillingGiftCard | null | undefined): string => {
    if (isServiceVoucher(card)) return locale === 'sl' ? 'Darilni bon' : 'Service voucher'
    return locale === 'sl' ? 'Vrednostni bon' : 'Value voucher'
  }

  const voucherScopeLabel = (card: BillingGiftCard | null | undefined): string => {
    if (card?.voucherScope !== 'SELECTED_SERVICES') return locale === 'sl' ? 'Vse storitve' : 'All services'
    const names = (card.eligibleServiceNames || []).filter(Boolean)
    if (names.length === 0) return locale === 'sl' ? 'Izbrane storitve' : 'Selected services'
    return names.join(', ')
  }

  const voucherLocationScopeLabel = (card: BillingGiftCard | null | undefined): string => {
    if (card?.availableAllLocations !== false) return locale === 'sl' ? 'Vse lokacije' : 'All locations'
    const names = (card?.validLocationNames || []).filter(Boolean)
    if (names.length === 0) return locale === 'sl' ? 'Izbrane lokacije' : 'Selected locations'
    return names.join(', ')
  }

  const voucherContentLabel = (card: BillingGiftCard): string => {
    if (isServiceVoucher(card)) return voucherScopeLabel(card)
    const original = currency(Number(card.valueGross || 0))
    const remaining = currency(Number(card.remainingGross || 0))
    if (card.status === 'partially_used') {
      return locale === 'sl' ? `${original} · preostalo ${remaining}` : `${original} · ${remaining} remaining`
    }
    return original
  }

  const giftCardPdfFileName = (card: BillingGiftCard) => `${isServiceVoucher(card) ? 'darilni-bon' : 'vrednostni-bon'}-${String(card.code || card.giftCardNumber || card.id).replace(/[^A-Za-z0-9._-]/g, '-')}.pdf`

  const fetchGiftCardPdfBlob = async (cardId: number): Promise<Blob> => {
    const res = await api.get(`/billing/gift-cards/${cardId}/pdf`, { responseType: 'blob' })
    return new Blob([res.data], { type: 'application/pdf' })
  }

  const downloadGiftCardPdf = async (card: BillingGiftCard) => {
    try {
      const blob = await fetchGiftCardPdfBlob(card.id)
      downloadPdfBlob(blob, giftCardPdfFileName(card))
    } catch (error) {
      showToast('error', locale === 'sl' ? 'PDF bona ni bilo mogoče prenesti.' : 'Unable to download voucher PDF.')
    }
  }

  const printGiftCardPdf = async (card: BillingGiftCard, preparedWindow?: Window | null) => {
    if (printingGiftCardId) {
      closePdfActionWindow(preparedWindow)
      return
    }
    setPrintingGiftCardId(card.id)
    try {
      const blob = await fetchGiftCardPdfBlob(card.id)
      await printPdfBlob(blob, giftCardPdfFileName(card), preparedWindow)
    } catch (error) {
      closePdfActionWindow(preparedWindow)
      showToast('error', locale === 'sl' ? 'Bona ni bilo mogoče pripraviti za tiskanje.' : 'Unable to prepare voucher for printing.')
    } finally {
      setPrintingGiftCardId(null)
    }
  }

  const sendGiftCardAgain = async (card: BillingGiftCard) => {
    if (sendingGiftCardId) return
    setSendingGiftCardId(card.id)
    try {
      await api.post(`/billing/gift-cards/${card.id}/send`)
      showToast('success', locale === 'sl' ? `${voucherTypeLabel(card)} je bil poslan.` : 'Voucher was sent.')
      await reloadAfterBillingMutation()
    } catch (error: any) {
      showToast('error', readBillingApiMessage(error) || (locale === 'sl' ? 'Bona ni bilo mogoče poslati.' : 'Unable to send voucher.'))
    } finally {
      setSendingGiftCardId(null)
    }
  }

  const giftCardStatusLabel = (status: string | null | undefined): string => {
    if (locale === 'sl') {
      if (status === 'active') return 'Aktiven'
      if (status === 'partially_used') return 'Delno porabljen'
      if (status === 'used') return 'Porabljen'
      if (status === 'expired') return 'Potekel'
      if (status === 'cancelled') return 'Preklican'
      if (status === 'pending_payment') return 'Čaka plačilo'
      return 'Neznano'
    }
    if (status === 'active') return 'Active'
    if (status === 'partially_used') return 'Partially used'
    if (status === 'used') return 'Used'
    if (status === 'expired') return 'Expired'
    if (status === 'cancelled') return 'Cancelled'
    if (status === 'pending_payment') return 'Pending payment'
    return 'Unknown'
  }

  const giftCardStatusClass = (status: string | null | undefined): string => {
    if (status === 'active') return 'paid'
    if (status === 'partially_used') return 'partial'
    if (status === 'used') return 'archived'
    if (status === 'expired' || status === 'cancelled') return 'failed'
    if (status === 'pending_payment') return 'open'
    return 'not-sent'
  }

  const handleCreatedBillPdfAction = async (bill: any, action: InvoicePdfAction, preparedWindow?: Window | null) => {
    if (!bill?.id) {
      closePdfActionWindow(preparedWindow)
      return
    }
    if (action === 'print') {
      await printFolioPdf(bill as PrintableBillRef, preparedWindow)
      return
    }
    if (bill.paymentStatus === 'paid') {
      await downloadFolioPdf({ id: bill.id, billNumber: bill.billNumber })
    }
  }

  const createOpenBillClientRowKey = () => `new-${Date.now()}-${Math.random().toString(36).slice(2)}`

  const setOpenBillItems = (ob: OpenBill, items: OpenBillEditItem[]) => {
    setOpenBillEdits((prev) => ({ ...prev, [ob.id]: items }))
  }

  const clearOpenBillDrafts = (ids: number[]) => {
    const idSet = new Set(ids)
    setOpenBillEdits((prev) => {
      const next = { ...prev }
      idSet.forEach((id) => { delete next[id] })
      return next
    })
    setOpenBillDetailsEdits((prev) => {
      const next = { ...prev }
      idSet.forEach((id) => { delete next[id] })
      return next
    })
    setOpenBillPaymentEdits((prev) => {
      const next = { ...prev }
      idSet.forEach((id) => { delete next[id] })
      return next
    })
    setOpenBillDiscountEdits((prev) => {
      const next = { ...prev }
      idSet.forEach((id) => { delete next[id] })
      return next
    })
  }

  const saveOpenBillGroupAsOnePayee = async (target: OpenBill, relatedBills: OpenBill[]) => {
    const related = Array.from(new Map(relatedBills.map((entry) => [entry.id, entry])).values())
      .sort((a, b) => Number(a.id) - Number(b.id))
    if (related.length <= 1) return target

    const combinedItems = related.flatMap((entry) => getOpenBillItems(entry))
    const combinedGross = estimateGross(combinedItems)

    for (const entry of related) {
      const draft = openBillDetailsEdits[entry.id]
      if (!validateOpenBillDetailsDraft(draft)) return null
      const entryItems = getOpenBillItems(entry)
      const payload = buildOpenBillUpdatePayload(entry, entryItems, entry.id === target.id ? { paymentTotalGross: combinedGross } : undefined)
      const payloadPaymentSplits = Array.isArray(payload.paymentSplits) ? payload.paymentSplits : []
      if (entry.id === target.id && payloadPaymentSplits.length === 0 && !Object.prototype.hasOwnProperty.call(openBillPaymentEdits, entry.id)) {
        const fallbackMethod = entry.paymentMethod && !isDepositPaymentMethod(entry.paymentMethod) && !isStripePaymentMethod(entry.paymentMethod)
          ? entry.paymentMethod
          : visiblePaymentMethods.find((method) => !isDepositPaymentMethod(method))
        const methodId = Number(fallbackMethod?.id || 0)
        if (methodId > 0) {
          payload.paymentMethodId = methodId
          payload.paymentSplits = [{ paymentMethodId: methodId, amountGross: Number(combinedGross.toFixed(2)) }]
        }
      }
      await api.put(`/billing/open-bills/${entry.id}`, payload)
    }

    const { data } = await api.post(`/billing/open-bills/${target.id}/merge-related`, {
      openBillIds: related.map((entry) => entry.id),
    })
    const normalized = (data || []).map((entry: OpenBill) => normalizeOpenBill(entry))
    queryClient.setQueryData(queryKeys.billing.openBills(activeUnitId), normalized)
    normalized.forEach((entry: OpenBill) => {
      queryClient.setQueryData(queryKeys.billing.openBill(activeUnitId, entry.id), entry)
    })
    related.forEach((entry) => {
      if (!normalized.some((candidate: OpenBill) => Number(candidate.id) === Number(entry.id))) {
        queryClient.removeQueries({ queryKey: queryKeys.billing.openBill(activeUnitId, entry.id), exact: true })
      }
    })
    setOpenBills(normalized)
    void queryClient.invalidateQueries({ queryKey: queryKeys.billing.summaryByUnit(activeUnitId), refetchType: 'none' })
    clearOpenBillDrafts(related.map((entry) => entry.id))
    const updated = normalized.find((entry: OpenBill) => entry.id === target.id) || null
    setDetailOpenBill(updated)
    await onEmbeddedSaved?.()
    return updated
  }

  const saveOpenBillEditorSet = async (activeBill: OpenBill, editorBills: OpenBill[], mergeAsOnePayee: boolean) => {
    const uniqueBills = Array.from(new Map(editorBills.map((entry) => [entry.id, entry])).values())
    if (mergeAsOnePayee && uniqueBills.length > 1) {
      await saveOpenBillGroupAsOnePayee(uniqueBills[0] ?? activeBill, uniqueBills)
      return
    }

    const dirtyBills = uniqueBills.filter((entry) => (
      Object.prototype.hasOwnProperty.call(openBillEdits, entry.id)
      || Object.prototype.hasOwnProperty.call(openBillDetailsEdits, entry.id)
      || Object.prototype.hasOwnProperty.call(openBillPaymentEdits, entry.id)
      || Object.prototype.hasOwnProperty.call(openBillDiscountEdits, entry.id)
    ))
    if (dirtyBills.length === 0) return

    for (const entry of dirtyBills) {
      const detailsDraft = openBillDetailsEdits[entry.id]
      if (!validateOpenBillDetailsDraft(detailsDraft)) return
    }

    for (const entry of dirtyBills) {
      await api.put(`/billing/open-bills/${entry.id}`, buildOpenBillUpdatePayload(entry, getOpenBillItems(entry)))
    }

    clearOpenBillDrafts(dirtyBills.map((entry) => entry.id))
    const snapshot = await reloadAfterBillingMutation()
    const refreshed = snapshot.openBills.map((entry) => normalizeOpenBill(entry))
    refreshed.forEach((entry) => {
      queryClient.setQueryData(queryKeys.billing.openBill(activeUnitId, entry.id), entry)
    })
    setOpenBills(refreshed)
    const updatedActive = refreshed.find((entry) => entry.id === activeBill.id)
      ?? refreshed.find((entry) => entry.id === openBillEditorRootId)
      ?? null
    setDetailOpenBill(updatedActive)
    await onEmbeddedSaved?.()
  }


  const deleteOpenBill = async (ob: OpenBill) => {
    if (deletingOpenId) return
    const confirmed = await confirm({
      title: t('confirmDeleteOpenBill'),
      text: t('confirmCannotBeUndone'),
      tone: 'danger',
    })
    if (!confirmed) return
    setDeletingOpenId(ob.id)
    try {
      await api.delete(`/billing/open-bills/${ob.id}`)
      queryClient.removeQueries({ queryKey: queryKeys.billing.openBill(activeUnitId, ob.id), exact: true })
      setOpenBills((prev) => {
        const next = prev.filter((x) => x.id !== ob.id)
        queryClient.setQueryData(queryKeys.billing.openBills(activeUnitId), next)
        return next
      })
      setBillingSummary((prev) => prev ? { ...prev, openBills: Math.max(0, prev.openBills - 1) } : prev)
      void queryClient.invalidateQueries({ queryKey: queryKeys.billing.summaryByUnit(activeUnitId), refetchType: 'none' })
      clearOpenBillDrafts([ob.id])
      setDetailOpenBill((prev) => (prev?.id === ob.id ? null : prev))
      if (activeOpenBillId === ob.id) closeDetailOpenBill()
    } finally {
      setDeletingOpenId(null)
    }
  }

  const resolveOpenBillPreviewTarget = (ob: OpenBill, onePayeeRelatedBills?: OpenBill[]) => {
    const related = onePayeeRelatedBills && onePayeeRelatedBills.length > 1
      ? Array.from(new Map(onePayeeRelatedBills.map((entry) => [entry.id, entry])).values())
      : []
    const target = related.length > 1 ? (related[0] ?? ob) : ob
    return { target, related }
  }

  const buildOpenBillPreviewRequestPayload = (ob: OpenBill, onePayeeRelatedBills?: OpenBill[]) => {
    const { target, related } = resolveOpenBillPreviewTarget(ob, onePayeeRelatedBills)
    const previewItems = related.length > 1
      ? related.flatMap((entry) => getOpenBillItems(entry))
      : getOpenBillItems(target)
    const combinedGross = estimateGross(previewItems)
    const payload = buildOpenBillUpdatePayload(
      target,
      previewItems,
      related.length > 1 ? { paymentTotalGross: combinedGross } : undefined,
    )
    const payloadPaymentSplits = Array.isArray(payload.paymentSplits) ? payload.paymentSplits : []
    if (related.length > 1 && payloadPaymentSplits.length === 0 && !Object.prototype.hasOwnProperty.call(openBillPaymentEdits, target.id)) {
      const fallbackMethod = target.paymentMethod && !isDepositPaymentMethod(target.paymentMethod) && !isStripePaymentMethod(target.paymentMethod)
        ? target.paymentMethod
        : visiblePaymentMethods.find((method) => !isDepositPaymentMethod(method))
      const methodId = Number(fallbackMethod?.id || 0)
      if (methodId > 0) {
        payload.paymentMethodId = methodId
        payload.paymentSplits = [{ paymentMethodId: methodId, amountGross: Number(combinedGross.toFixed(2)) }]
      }
    }
    return { target, payload }
  }

  const resolveOpenBillPreviewRecipientEmail = (ob: OpenBill, onePayeeRelatedBills?: OpenBill[]) => {
    const { target } = resolveOpenBillPreviewTarget(ob, onePayeeRelatedBills)
    const draft = getOpenBillDetailsDraft(target)
    const draftClient = draft.clientId != null ? clients.find((client) => client.id === draft.clientId) : null
    const draftBillingCompany = draftClient?.billingCompany ?? null
    let draftBillingCompanyEmail: string | undefined
    if (draftBillingCompany && draftBillingCompany.id === draft.recipientCompanyId) {
      draftBillingCompanyEmail = draftBillingCompany.email ?? undefined
    }
    const rawEmail = draft.billingTarget === 'COMPANY'
      ? (companies.find((company) => company.id === draft.recipientCompanyId)?.email || draftBillingCompanyEmail)
      : (draftClient?.email || target.client?.email)
    return (rawEmail || '').trim()
  }

  const openOpenBillPreviewChoice = (ob: OpenBill, onePayeeRelatedBills?: OpenBill[]) => {
    const { target } = resolveOpenBillPreviewTarget(ob, onePayeeRelatedBills)
    if (previewingOpenBillId || printingOpenBillPreviewId || emailingOpenBillPreviewId) return
    const detailsDraft = openBillDetailsEdits[target.id]
    if (!validateOpenBillDetailsDraft(detailsDraft)) return
    const recipientEmail = resolveOpenBillPreviewRecipientEmail(ob, onePayeeRelatedBills)
    if (!recipientEmail) {
      void previewOpenBillInvoice(ob, onePayeeRelatedBills)
      return
    }
    setOpenBillPreviewChoice({
      openBill: ob,
      relatedBills: onePayeeRelatedBills,
      recipientEmail,
    })
  }

  const previewOpenBillInvoice = async (ob: OpenBill, onePayeeRelatedBills?: OpenBill[]) => {
    const { target, payload } = buildOpenBillPreviewRequestPayload(ob, onePayeeRelatedBills)
    if (previewingOpenBillId) return

    const detailsDraft = openBillDetailsEdits[target.id]
    if (!validateOpenBillDetailsDraft(detailsDraft)) return

    const previewWindow = window.open('', '_blank')
    if (previewWindow) {
      previewWindow.document.write(`<p style="font-family: system-ui, sans-serif; padding: 24px; color: #475569;">${locale === 'sl' ? 'Pripravljam predračun…' : 'Preparing proforma invoice…'}</p>`)
    }

    setPreviewingOpenBillId(target.id)
    try {
      const res = await api.post(`/billing/open-bills/${target.id}/preview-pdf?locale=${locale}`, payload, { responseType: 'blob' })
      const blob = new Blob([res.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      if (previewWindow && !previewWindow.closed) {
        previewWindow.location.href = url
      } else {
        window.open(url, '_blank')
      }
      window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000)
    } catch (error) {
      if (previewWindow && !previewWindow.closed) previewWindow.close()
      showToast('error', locale === 'sl' ? 'Predračuna ni bilo mogoče pripraviti.' : 'Unable to prepare proforma invoice preview.')
    } finally {
      setPreviewingOpenBillId(null)
    }
  }

  const printOpenBillInvoicePreview = async (ob: OpenBill, onePayeeRelatedBills?: OpenBill[]) => {
    const { target, payload } = buildOpenBillPreviewRequestPayload(ob, onePayeeRelatedBills)
    if (previewingOpenBillId || printingOpenBillPreviewId || emailingOpenBillPreviewId) return

    const detailsDraft = openBillDetailsEdits[target.id]
    if (!validateOpenBillDetailsDraft(detailsDraft)) return

    const printWindow = openPdfActionWindow(locale === 'sl' ? 'Pripravljam predračun za tiskanje…' : 'Preparing proforma invoice for printing…')
    setPrintingOpenBillPreviewId(target.id)
    try {
      const res = await api.post(`/billing/open-bills/${target.id}/preview-pdf?locale=${locale}`, payload, { responseType: 'blob' })
      const blob = new Blob([res.data], { type: 'application/pdf' })
      const didPrint = await printPdfBlob(blob, `${locale === 'sl' ? 'predracun' : 'proforma'}-${target.id}.pdf`, printWindow)
      if (didPrint) setOpenBillPreviewChoice(null)
    } catch (error) {
      closePdfActionWindow(printWindow)
      showToast('error', locale === 'sl' ? 'Predračuna ni bilo mogoče pripraviti za tiskanje.' : 'Unable to prepare the proforma invoice for printing.')
    } finally {
      setPrintingOpenBillPreviewId(null)
    }
  }

  const emailOpenBillPreview = async (ob: OpenBill, onePayeeRelatedBills?: OpenBill[]) => {
    const { target, payload } = buildOpenBillPreviewRequestPayload(ob, onePayeeRelatedBills)
    if (previewingOpenBillId || printingOpenBillPreviewId || emailingOpenBillPreviewId) return

    const detailsDraft = openBillDetailsEdits[target.id]
    if (!validateOpenBillDetailsDraft(detailsDraft)) return

    setEmailingOpenBillPreviewId(target.id)
    try {
      const { data } = await api.post(`/billing/open-bills/${target.id}/preview-email?locale=${locale}`, payload)
      const sentTo = (data?.recipientEmail || resolveOpenBillPreviewRecipientEmail(ob, onePayeeRelatedBills) || '').trim()
      setOpenBillPreviewChoice(null)
      showToast('success', sentTo
        ? (locale === 'sl' ? `Predračun je bil poslan na ${sentTo}.` : `Proforma invoice sent to ${sentTo}.`)
        : (locale === 'sl' ? 'Predračun je bil poslan.' : 'Proforma invoice sent.'))
    } catch (error) {
      showToast('error', locale === 'sl' ? 'Predračuna ni bilo mogoče poslati po e-pošti.' : 'Unable to email the proforma invoice.')
    } finally {
      setEmailingOpenBillPreviewId(null)
    }
  }

  const renderOpenBillPreviewChoicePopover = (ob: OpenBill) => {
    if (!openBillPreviewChoice || openBillPreviewChoice.openBill.id !== ob.id) return null
    const { openBill, relatedBills, recipientEmail } = openBillPreviewChoice
    const { target } = resolveOpenBillPreviewTarget(openBill, relatedBills)
    const busy = previewingOpenBillId === target.id || printingOpenBillPreviewId === target.id || emailingOpenBillPreviewId === target.id
    return (
      <div
        className="billing-preview-choice-popover"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={locale === 'sl' ? 'Izberi način predračuna' : 'Choose proforma invoice action'}
      >
        <div className="billing-preview-choice-popover-head">
          <span className="billing-preview-choice-popover-icon" aria-hidden>{renderPlainFolioPdfIcon()}</span>
          <div>
            <h3>{locale === 'sl' ? 'Predračun' : 'Proforma invoice'}</h3>
            <p>{locale === 'sl' ? 'Odprite, natisnite ali predračun pošljite po e-pošti.' : 'Open, print, or email the proforma invoice.'}</p>
          </div>
          <button
            type="button"
            className="billing-preview-choice-popover-close"
            onClick={() => setOpenBillPreviewChoice(null)}
            disabled={busy}
            aria-label={locale === 'sl' ? 'Zapri' : 'Close'}
          >×</button>
        </div>
        <div className="billing-preview-choice-popover-email">
          <span>{locale === 'sl' ? 'Prejemnik' : 'Recipient'}</span>
          <strong>{recipientEmail}</strong>
        </div>
        <div className="billing-preview-choice-popover-actions">
          <button
            type="button"
            className="billing-preview-choice-popover-secondary"
            disabled={busy}
            onClick={() => {
              setOpenBillPreviewChoice(null)
              void previewOpenBillInvoice(openBill, relatedBills)
            }}
          >
            {previewingOpenBillId === target.id ? (locale === 'sl' ? 'Pripravljam…' : 'Preparing…') : (locale === 'sl' ? 'Predogled' : 'Preview')}
          </button>
          <button
            type="button"
            className="billing-preview-choice-popover-secondary"
            disabled={busy}
            onClick={() => void printOpenBillInvoicePreview(openBill, relatedBills)}
          >
            {printingOpenBillPreviewId === target.id ? (locale === 'sl' ? 'Pripravljam…' : 'Preparing…') : (locale === 'sl' ? 'Natisni predogled' : 'Print preview')}
          </button>
          <button
            type="button"
            className="billing-preview-choice-popover-primary"
            disabled={busy}
            onClick={() => void emailOpenBillPreview(openBill, relatedBills)}
          >
            {emailingOpenBillPreviewId === target.id ? (locale === 'sl' ? 'Pošiljam…' : 'Sending…') : (locale === 'sl' ? 'Pošlji po e-pošti' : 'Email')}
          </button>
        </div>
      </div>
    )
  }

  const createBillFromOpen = async (ob: OpenBill, onePayeeRelatedBills?: OpenBill[], afterCreatePdfAction: InvoicePdfAction = 'download') => {
    if (creatingFromOpenId) return
    const target = onePayeeRelatedBills && onePayeeRelatedBills.length > 1 ? (onePayeeRelatedBills[0] ?? ob) : ob
    const targetEntitlementSettlement = openBillEntitlementSettlementSelection(target, openBillPayableGross(target))
    const effectiveType = resolveOpenBillEffectiveType(ob)
    // Settling with a prepaid entitlement does not issue an invoice, so invoice/advance
    // issuance permissions must not block this path. The settlement endpoint performs
    // its own entitlement and booking validation.
    if (!targetEntitlementSettlement && (effectiveType === 'ADVANCE' ? !canIssueAdvanceInvoice : !canIssueOpenInvoice)) {
      showToast('error', effectiveType === 'ADVANCE'
        ? (locale === 'sl' ? 'Nimate dovoljenja za izdajo predplačil.' : 'You do not have permission to issue advance invoices.')
        : (locale === 'sl' ? 'Nimate dovoljenja za izdajo odprtih računov.' : 'You do not have permission to issue open invoices.'))
      return
    }
    if (targetEntitlementSettlement && onePayeeRelatedBills && onePayeeRelatedBills.length > 1) {
      showToast('error', locale === 'sl'
        ? 'Ugodnost lahko zaključi samo posamezen račun za en termin. Najprej izklopite združevanje plačnikov.'
        : 'An entitlement can settle only one bill for one session. Turn off combined payees first.')
      return
    }
    if (afterCreatePdfAction === 'print' && !targetEntitlementSettlement && useDirectPosPrinting) {
      const ready = await prepareDirectPosPrinter()
      if (!ready) return
    }
    const printWindow = afterCreatePdfAction === 'print' && !targetEntitlementSettlement && !useDirectPosPrinting
      ? openPdfActionWindow(locale === 'sl' ? 'Pripravljam račun za tiskanje…' : 'Preparing invoice for printing…')
      : null
    setCreatingFromOpenId(target.id)
    try {
      let invoiceSource = target
      if (onePayeeRelatedBills && onePayeeRelatedBills.length > 1) {
        const merged = await saveOpenBillGroupAsOnePayee(target, onePayeeRelatedBills)
        if (!merged) {
          closePdfActionWindow(printWindow)
          return
        }
        invoiceSource = merged
      }
      const sourceOpenBill = invoiceSource
      const relatedOpenBillsBeforeClose = onePayeeRelatedBills && onePayeeRelatedBills.length > 1
        ? []
        : getRelatedOpenBillsForEditor(sourceOpenBill)
      const items = getOpenBillItems(sourceOpenBill)
      const detailsDraft = openBillDetailsEdits[sourceOpenBill.id]
      if (!validateOpenBillDetailsDraft(detailsDraft)) {
        closePdfActionWindow(printWindow)
        return
      }
      await api.put(`/billing/open-bills/${sourceOpenBill.id}`, buildOpenBillUpdatePayload(sourceOpenBill, items))

      const entitlementSettlement = openBillEntitlementSettlementSelection(sourceOpenBill, openBillPayableGross(sourceOpenBill))
      if (entitlementSettlement) {
        const { data } = await api.post(`/billing/open-bills/${sourceOpenBill.id}/settle-entitlement`, {
          entitlementCode: entitlementSettlement.code,
          paymentBookingId: entitlementSettlement.paymentBookingId,
          paymentClientId: entitlementSettlement.paymentClientId,
        })
        setOpenBills((prev) => prev.filter((x) => x.id !== sourceOpenBill.id))
        setOpenBillEdits((prev) => { const n = { ...prev }; delete n[sourceOpenBill.id]; return n })
        setOpenBillDetailsEdits((prev) => { const n = { ...prev }; delete n[sourceOpenBill.id]; return n })
        setOpenBillPaymentEdits((prev) => { const n = { ...prev }; delete n[sourceOpenBill.id]; return n })
        setOpenBillDiscountEdits((prev) => { const n = { ...prev }; delete n[sourceOpenBill.id]; return n })
        showToast('success', locale === 'sl'
          ? `${data?.entitlementName || 'Ugodnost'} je pokrila termin. Nov račun ni bil izdan.`
          : `${data?.entitlementName || 'Entitlement'} covered the session. No new invoice was issued.`)
        const refreshedOpenBills = await reloadOpenBillsAfterEditorClose(sourceOpenBill.id)
        const movedToNextTab = selectNextOpenBillEditorTabAfterClose(sourceOpenBill.id, relatedOpenBillsBeforeClose, refreshedOpenBills)
        if (!movedToNextTab) {
          if (openBillEditorRootId === sourceOpenBill.id) setOpenBillEditorRootId(null)
          if (editorOnlyMode) closeDetailOpenBill()
          else setDetailOpenBill((prev) => (prev?.id === sourceOpenBill.id ? null : prev))
        }
        void Promise.resolve(onEmbeddedSaved?.()).catch(() => undefined)
        return
      }

      const { data } = await api.post(`/billing/open-bills/${sourceOpenBill.id}/create-bill`)
      if (data?.id) setBills((prev) => [normalizeBill(data), ...prev])
      setOpenBills((prev) => prev.filter((x) => x.id !== sourceOpenBill.id))
      setOpenBillEdits((prev) => { const n = { ...prev }; delete n[sourceOpenBill.id]; return n })
      setOpenBillDetailsEdits((prev) => { const n = { ...prev }; delete n[sourceOpenBill.id]; return n })
      setOpenBillPaymentEdits((prev) => { const n = { ...prev }; delete n[sourceOpenBill.id]; return n })
      setOpenBillDiscountEdits((prev) => { const n = { ...prev }; delete n[sourceOpenBill.id]; return n })
      await handleCreatedBillPdfAction(data, afterCreatePdfAction, printWindow)
      if (data?.id && shouldCreateCheckoutSession(data)) {
        await api.post(`/billing/bills/${data.id}/checkout-session`)
      }
      notifyOpenBillClosedResult(data)
      const refreshedOpenBills = await reloadOpenBillsAfterEditorClose(sourceOpenBill.id)
      const movedToNextTab = selectNextOpenBillEditorTabAfterClose(sourceOpenBill.id, relatedOpenBillsBeforeClose, refreshedOpenBills)
      if (!movedToNextTab) {
        if (openBillEditorRootId === sourceOpenBill.id) setOpenBillEditorRootId(null)
        if (editorOnlyMode) closeDetailOpenBill()
        else setDetailOpenBill((prev) => (prev?.id === sourceOpenBill.id ? null : prev))
      }
      void Promise.resolve(onEmbeddedSaved?.()).catch(() => undefined)
    } catch (error: any) {
      closePdfActionWindow(printWindow)
      if (!showStripeSetupPopupFromError(error) && !showBankTransferQrSettingsPopupFromError(error)) {
        showToast(
          'error',
          readBillingApiMessage(error) || (locale === 'sl' ? 'Računa ni bilo mogoče zaključiti.' : 'Unable to close the invoice.'),
        )
      }
    } finally {
      setCreatingFromOpenId(null)
    }
  }


  const buildManualOpenBillPayload = (): Record<string, unknown> | null => {
    const payload: Record<string, unknown> =
      billForm.billingTarget === 'COMPANY'
        ? { recipientCompanyId: billForm.recipientCompanyId }
        : { clientId: billForm.clientId }
    if (billForm.billingTarget === 'COMPANY' && !payload.recipientCompanyId) {
      showToast('error', 'Select recipient company first.')
      return null
    }
    if (billForm.billingTarget !== 'COMPANY' && !payload.clientId) {
      showToast('error', 'Select client first.')
      return null
    }
    const paymentSplits = buildCreatePaymentSplitsPayload(createBillPayableGross)
    const primaryPaymentMethodId = paymentSplits[0]?.paymentMethodId ?? billForm.paymentMethodId
    if (!primaryPaymentMethodId || !paymentSplitsMatchInvoiceTotal(getCreateBillPaymentSplits(createBillPayableGross), createBillPayableGross)) {
      showToast('error', billingCopy.openBillNeedsConsultantPayment)
      return null
    }
    if (billForm.items.length === 0) {
      showToast('error', billingCopy.openBillNeedsLinesForCreate)
      return null
    }
    payload.consultantId = billForm.consultantId ?? me.id
    payload.paymentMethodId = primaryPaymentMethodId
    payload.paymentSplits = paymentSplits
    if (billForm.billType === 'INVOICE') Object.assign(payload, discountPayloadFields(createBillDiscountDraft, grossPreview, billForm.items))
    payload.reference = billForm.bankTransferReference
    payload.sessionId = billForm.sessionId
    payload.legalEntityId = billForm.legalEntityId
    payload.invoiceSeriesId = billForm.invoiceSeriesId
    payload.locationId = billForm.locationId
    payload.billType = billForm.billType
    payload.items = billForm.items.map((row) => ({
      transactionServiceId: row.transactionServiceId,
      quantity: row.quantity,
      netPrice: Number(row.netPrice),
      grossPrice: Number(row.grossPrice),
      sourceSessionBookingId: row.sourceSessionBookingId ?? billForm.sessionId ?? undefined,
    }))
    return payload
  }

  const createManualOpenBillFromCreateBillForm = async () => {
    if (creatingManualOpenBill) return
    if (!canIssueOpenInvoice) {
      showToast('error', locale === 'sl' ? 'Nimate dovoljenja za izdajo odprtih računov.' : 'You do not have permission to issue open invoices.')
      return
    }
    const payload = buildManualOpenBillPayload()
    if (!payload) return
    setCreatingManualOpenBill(true)
    try {
      const snapshot = await reloadAfterBillingMutation()
      const refreshed = snapshot.openBills.map((entry) => normalizeOpenBill(entry))
      setOpenBills(refreshed)
      setBillingTab('open')
      setShowCreateBillModal(false)
      setEditingCreateBillPayee(false)
      if (!embeddedCreateMode && newBillDrawerOpen) closeDrawer()
      showToast('success', 'Open bill created.')
    } catch (error: any) {
      showToast(
        'error',
        error?.response?.data?.message
          || error?.message
          || (locale === 'sl' ? 'Odprtega računa ni bilo mogoče ustvariti.' : 'Unable to create open bill.'),
      )
    } finally {
      setCreatingManualOpenBill(false)
    }
  }

  const createAndCloseManualOpenBill = async (afterCreatePdfAction: InvoicePdfAction = 'download') => {
    if (creatingBill || creatingManualOpenBill) return
    if (!canIssueOpenInvoice) {
      showToast('error', locale === 'sl' ? 'Nimate dovoljenja za izdajo odprtih računov.' : 'You do not have permission to issue open invoices.')
      return
    }
    const payload = buildManualOpenBillPayload()
    if (!payload) return
    const existingIds = new Set(openBills.map((entry) => entry.id))
    if (afterCreatePdfAction === 'print' && useDirectPosPrinting) {
      const ready = await prepareDirectPosPrinter()
      if (!ready) return
    }
    const printWindow = afterCreatePdfAction === 'print' && !useDirectPosPrinting
      ? openPdfActionWindow(locale === 'sl' ? 'Pripravljam račun za tiskanje…' : 'Preparing invoice for printing…')
      : null
    setCreatingBill(true)
    try {
      const { data: createdList } = await api.post('/billing/open-bills/manual', payload)
      const responses: any[] = Array.isArray(createdList) ? createdList : []
      const newlyCreated = responses.find((entry) => entry?.id != null && !existingIds.has(entry.id))
        ?? [...responses].sort((a, b) => Number(b?.id ?? 0) - Number(a?.id ?? 0))[0]
      const targetId = newlyCreated?.id
      if (!targetId) {
        closePdfActionWindow(printWindow)
        showToast('error', locale === 'sl' ? 'Računa ni bilo mogoče zaključiti.' : 'Unable to close the invoice.')
        return
      }
      const { data: bill } = await api.post(`/billing/open-bills/${targetId}/create-bill`, {
        legalEntityId: billForm.legalEntityId,
        invoiceSeriesId: billForm.invoiceSeriesId,
        locationId: billForm.locationId,
      })
      if (bill?.id) setBills((prev) => [normalizeBill(bill), ...prev])
      await handleCreatedBillPdfAction(bill, afterCreatePdfAction, printWindow)
      if (bill?.id && shouldCreateCheckoutSession(bill)) {
        await api.post(`/billing/bills/${bill.id}/checkout-session`)
      }
      notifyBillCreationResult(bill)
      setBillForm({ items: [], billingTarget: 'PERSON', billType: 'INVOICE', consultantId: me.id, discountType: 'PERCENT', discountValue: '0', wholeBillDiscountPercent: '0', itemDiscounts: {} })
      setShowCreateBillModal(false)
      setEditingCreateBillPayee(false)
      if (!embeddedCreateMode && newBillDrawerOpen) closeDrawer()
      await reloadAfterBillingMutation()
    } catch (error: any) {
      closePdfActionWindow(printWindow)
      if (!showStripeSetupPopupFromError(error) && !showBankTransferQrSettingsPopupFromError(error)) {
        showToast(
          'error',
          readBillingApiMessage(error) || (locale === 'sl' ? 'Računa ni bilo mogoče zaključiti.' : 'Unable to close the invoice.'),
        )
      }
    } finally {
      setCreatingBill(false)
    }
  }

  const openAddOpenBillForSessionModal = (sourceBill: OpenBill) => {
    const sessionId = sourceBill.sessionId ?? getOpenBillIncludedSessions(sourceBill).find((s) => Number(s.sessionId) > 0)?.sessionId ?? null
    if (sessionId == null || Number(sessionId) <= 0) {
      showToast('error', locale === 'sl' ? 'Dodatnih računov ni mogoče dodati za ročno ustvarjen račun.' : 'Cannot add additional bills for a manual open bill.')
      return
    }
    setAddOpenBillContext({
      sessionId: Number(sessionId),
      billingTarget: 'PERSON',
      clientId: undefined,
      recipientCompanyId: undefined,
      consultantId: sourceBill.consultant?.id,
    })
  }

  const submitAdditionalOpenBill = async () => {
    if (!addOpenBillContext || creatingAdditionalOpenBill) return
    if (!canIssueOpenInvoice) {
      showToast('error', locale === 'sl' ? 'Nimate dovoljenja za izdajo odprtih računov.' : 'You do not have permission to issue open invoices.')
      return
    }
    const ctx = addOpenBillContext
    if (ctx.billingTarget === 'PERSON' && !ctx.clientId) {
      showToast('error', locale === 'sl' ? 'Izberite klienta.' : 'Select a client.')
      return
    }
    if (ctx.billingTarget === 'COMPANY' && !ctx.recipientCompanyId) {
      showToast('error', locale === 'sl' ? 'Izberite podjetje.' : 'Select a company.')
      return
    }
    const payload: Record<string, unknown> = {}
    if (ctx.billingTarget === 'COMPANY') {
      payload.recipientCompanyId = ctx.recipientCompanyId
      if (ctx.clientId) payload.clientId = ctx.clientId
    } else {
      payload.clientId = ctx.clientId
    }
    payload.consultantId = ctx.consultantId ?? me.id
    setCreatingAdditionalOpenBill(true)
    try {
      const { data } = await api.post(`/billing/open-bills/session/${ctx.sessionId}/additional`, payload)
      const created = data ? normalizeOpenBill(data) : null
      const snapshot = await reloadAfterBillingMutation()
      const refreshed = snapshot.openBills.map((entry) => normalizeOpenBill(entry))
      setOpenBills(refreshed)
      const target = created ? refreshed.find((entry) => entry.id === created.id) ?? created : null
      if (target) {
        selectOpenBillEditorTab(target)
      }
      setAddOpenBillContext(null)
      showToast('success', locale === 'sl' ? 'Račun dodan.' : 'Bill added.')
    } finally {
      setCreatingAdditionalOpenBill(false)
    }
  }

  const taxRateByServiceId = (serviceId: number): VatBreakdownKey => {
    // Generated consumable VAT carriers are intentionally excluded from /billing/services.
    // Resolve their tax rate from the open-bill payload so local VAT totals stay correct.
    const tax = services.find((s) => s.id === serviceId)?.taxRate
      ?? openBills.flatMap((bill) => bill.items ?? []).find((item) => Number(item.transactionService?.id) === Number(serviceId))?.transactionService?.taxRate
      ?? (detailOpenBill?.items ?? []).find((item) => Number(item.transactionService?.id) === Number(serviceId))?.transactionService?.taxRate
    if (tax === 'VAT_22' || tax === 'VAT_9_5' || tax === 'VAT_0' || tax === 'NO_VAT') return tax
    return 'NO_VAT'
  }

  const taxMultiplierByServiceId = (serviceId: number) => {
    const tax = taxRateByServiceId(serviceId)
    if (tax === 'VAT_22') return 0.22
    if (tax === 'VAT_9_5') return 0.095
    return 0
  }

  const vatBreakdownLabel = (key: VatBreakdownKey) => {
    if (key === 'VAT_22') return locale === 'sl' ? 'DDV 22%' : 'VAT 22%'
    if (key === 'VAT_9_5') return locale === 'sl' ? 'DDV 9,5%' : 'VAT 9.5%'
    if (key === 'VAT_0') return locale === 'sl' ? 'DDV 0%' : 'VAT 0%'
    return locale === 'sl' ? 'Brez DDV' : 'No VAT'
  }
  const advanceDeductionServiceId = useMemo(() => {
    const first = Array.from(advanceDeductionIds)[0]
    return typeof first === 'number' ? first : null
  }, [advanceDeductionIds])
  const advanceDeductionTaxMultiplier = useMemo(
    () => (advanceDeductionServiceId == null ? 0 : taxMultiplierByServiceId(advanceDeductionServiceId)),
    [advanceDeductionServiceId, services],
  )
  const grossToAdvanceNet = (gross: number) => {
    const divisor = 1 + advanceDeductionTaxMultiplier
    if (!Number.isFinite(gross) || gross <= 0 || divisor <= 0) return 0
    return Number((gross / divisor).toFixed(2))
  }
  const grossToNet = (gross: string, serviceId: number) => {
    const divisor = 1 + taxMultiplierByServiceId(serviceId)
    if (!Number.isFinite(divisor) || divisor <= 0) return Number(gross || 0)
    return Number((Number(gross || 0) / divisor).toFixed(4))
  }
  const applyDiscountToItemsForVat = <T extends { transactionServiceId: number; quantity: number; netPrice: string; grossPrice: string }>(
    items: T[],
    draft: DiscountDraft | null | undefined,
  ): T[] => {
    if (!items.length) return items
    const states = calculateDiscountedLineStates(items, draft)
    const hasDiscount = states.some((state) => state.itemDiscountGross > 0 || state.wholeBillDiscountGross > 0)
    if (!hasDiscount) return items
    return items.map((item, idx) => {
      const qty = Math.max(1, Number(item.quantity || 1))
      const unitGross = Number(((states[idx]?.finalGross ?? discountLineGrossTotal(item)) / qty).toFixed(4))
      const unitGrossText = unitGross.toFixed(4)
      return {
        ...item,
        grossPrice: unitGrossText,
        netPrice: String(grossToNet(unitGrossText, item.transactionServiceId)),
      }
    })
  }


  const lineNetTotal = (item: { quantity: number; netPrice: string }) =>
    Number(item.netPrice || 0) * Number(item.quantity || 0)

  const lineGrossTotal = (item: { quantity: number; grossPrice: string }) =>
    Number(item.grossPrice || 0) * Number(item.quantity || 0)

  const lineTaxTotal = (item: { transactionServiceId: number; quantity: number; netPrice: string; grossPrice: string }) =>
    lineGrossTotal(item) - lineNetTotal(item)

  const serviceOptionLabel = (service: BillingService) => billingServiceDisplayLabel(service)

  const estimateNet = (items: { transactionServiceId: number; quantity: number; netPrice: string; grossPrice: string }[]) =>
    items.reduce((sum, item) => sum + lineNetTotal(item), 0)


  const vatBreakdownRowsForItems = (items: { transactionServiceId: number; quantity: number; netPrice: string; grossPrice: string }[]): VatBreakdownRow[] => {
    const order: VatBreakdownKey[] = ['VAT_22', 'VAT_9_5', 'VAT_0', 'NO_VAT']
    const grouped = new Map<VatBreakdownKey, { taxTotal: number; lineCount: number }>(
      order.map((key) => [key, { taxTotal: 0, lineCount: 0 }]),
    )
    items.forEach((item) => {
      const key = taxRateByServiceId(item.transactionServiceId)
      const current = grouped.get(key) || { taxTotal: 0, lineCount: 0 }
      current.taxTotal += lineTaxTotal(item)
      current.lineCount += 1
      grouped.set(key, current)
    })
    return order
      .map((key) => ({
        key,
        label: vatBreakdownLabel(key),
        taxTotal: grouped.get(key)?.taxTotal ?? 0,
        lineCount: grouped.get(key)?.lineCount ?? 0,
      }))
      .filter((row) => row.lineCount > 0 && row.key !== 'NO_VAT')
  }


  const getOpenBillIncludedSessions = (ob: OpenBill) => {
    const sessions = ob.sessions ?? []
    if (sessions.length > 0) return sessions
    if (ob.sessionId == null) return []
    return [{
      sessionId: ob.sessionId,
      sessionDisplayId: ob.sessionDisplayId,
      sessionInfo: ob.sessionInfo || '',
      clientName: openBillClientLabel(ob),
      consultantName: openBillConsultantLabel(ob),
      totalGross: estimateGross(getOpenBillItems(ob)),
      totalNet: estimateNet(getOpenBillItems(ob)),
      lineItemCount: getOpenBillItems(ob).length,
    }]
  }






  const openBillEditorLineKey = (ob: OpenBill, idx: number, item: OpenBillEditItem) => {
    if (item.openBillItemId != null && item.openBillItemId > 0) return `line-${ob.id}-db-${item.openBillItemId}`
    if (item.clientRowKey) return `line-${ob.id}-client-${item.clientRowKey}`
    return `line-${ob.id}-idx-${idx}`
  }



  const getOpenBillEditorSessionIds = (ob: OpenBill) => {
    const ids = new Set<number>()
    if (ob.sessionId != null && ob.sessionId > 0) ids.add(ob.sessionId)
    ;(ob.sessions ?? []).forEach((session) => {
      if (session.sessionId != null && session.sessionId > 0) ids.add(session.sessionId)
    })
    getOpenBillItems(ob).forEach((item) => {
      if (item.sourceSessionBookingId != null && item.sourceSessionBookingId > 0) ids.add(item.sourceSessionBookingId)
    })
    return Array.from(ids)
  }

  const getOpenBillEditorBookingGroupKeys = (ob: OpenBill) => {
    const keys = new Set<string>()
    const topLevel = String(ob.bookingGroupKey ?? '').trim()
    if (topLevel) keys.add(topLevel)
    ;(ob.sessions ?? []).forEach((session) => {
      const key = String(session.bookingGroupKey ?? '').trim()
      if (key) keys.add(key)
    })
    return Array.from(keys)
  }

  const getRelatedOpenBillsForEditor = (ob: OpenBill) => {
    const editorSessionIds = getOpenBillEditorSessionIds(ob)
    const editorGroupKeys = getOpenBillEditorBookingGroupKeys(ob)
    const sessionIdSet = new Set(editorSessionIds)
    const groupKeySet = new Set(editorGroupKeys)
    const sourceBills = openBills.map((entry) => (entry.id === ob.id ? ob : entry))
    const related = sourceBills.filter((entry) => {
      if (entry.id === ob.id) return true
      if (groupKeySet.size > 0 && getOpenBillEditorBookingGroupKeys(entry).some((key) => groupKeySet.has(key))) return true
      if (sessionIdSet.size === 0) return false
      return getOpenBillEditorSessionIds(entry).some((id) => sessionIdSet.has(id))
    })
    const unique = Array.from(new Map(related.map((entry) => [entry.id, entry])).values())
    return unique.sort((a, b) => Number(a.id) - Number(b.id))
  }

  const getOpenBillForEditor = (openBillId: number) => {
    if (detailOpenBill?.id === openBillId) return detailOpenBill
    return openBills.find((entry) => entry.id === openBillId) || null
  }

  const getOpenBillEditorRoot = (fallback: OpenBill) => {
    if (openBillEditorRootId != null) {
      const root = getOpenBillForEditor(openBillEditorRootId)
      if (root) return root
    }
    return fallback
  }

  const getOpenBillEditorGroupKey = (rootBill: OpenBill) => {
    const baseRelated = getRelatedOpenBillsForEditor(rootBill)
    return onePayeeKeyForRelatedOpenBills(baseRelated, rootBill)
  }

  const getTemporaryOpenBillTabsForRoot = (rootBill: OpenBill) => {
    const groupKey = getOpenBillEditorGroupKey(rootBill)
    return (temporaryOpenBillTabIds[groupKey] ?? [])
      .map((id) => getOpenBillForEditor(id))
      .filter((entry): entry is OpenBill => Boolean(entry))
  }

  const getEditorOpenBillsWithTemporaryTabs = (rootBill: OpenBill) => {
    const baseRelated = getRelatedOpenBillsForEditor(rootBill)
    const baseIds = new Set(baseRelated.map((entry) => entry.id))
    const temporaryTabs = getTemporaryOpenBillTabsForRoot(rootBill).filter((entry) => !baseIds.has(entry.id))
    return [...baseRelated, ...temporaryTabs]
  }

  const addTemporaryOpenBillTab = (rootBill: OpenBill, externalBill: OpenBill) => {
    const groupKey = getOpenBillEditorGroupKey(rootBill)
    setTemporaryOpenBillTabIds((prev) => {
      const current = prev[groupKey] ?? []
      if (current.includes(externalBill.id)) return prev
      return { ...prev, [groupKey]: [...current, externalBill.id] }
    })
    setExternalOpenBillPickerForRootId(null)
    setExternalOpenBillSearch('')
    setOpenBillAddMenuForId(null)
    selectOpenBillEditorTab(externalBill)
  }

  const removeTemporaryOpenBillTab = (rootBill: OpenBill, externalBillId: number) => {
    const groupKey = getOpenBillEditorGroupKey(rootBill)
    setTemporaryOpenBillTabIds((prev) => ({
      ...prev,
      [groupKey]: (prev[groupKey] ?? []).filter((id) => id !== externalBillId),
    }))
    setSelectedOpenBillLines((prev) => {
      const next = { ...prev }
      Object.keys(next).forEach((key) => {
        if (key.startsWith(`line-${externalBillId}-`)) delete next[key]
      })
      return next
    })
    if (detailOpenBill?.id === externalBillId) {
      selectOpenBillEditorTab(rootBill)
    }
  }

  const getBookingGroupSessionIds = (groupKeys: string[]) => {
    const keySet = new Set(groupKeys.filter(Boolean))
    const ids = new Set<number>()
    if (keySet.size === 0) return ids
    for (const booking of bookings) {
      const key = String(booking.bookingGroupKey ?? '').trim()
      if (!keySet.has(key)) continue
      if (Number.isFinite(Number(booking.id)) && Number(booking.id) > 0) ids.add(Number(booking.id))
      ;(booking.paymentStatuses ?? []).forEach((status) => {
        const sid = Number(status.bookingId)
        if (Number.isFinite(sid) && sid > 0) ids.add(sid)
      })
    }
    return ids
  }

  const getAllSessionIdsForOpenBillGroup = (ob: OpenBill) => {
    const related = getRelatedOpenBillsForEditor(ob)
    const ids = new Set<number>()
    const groupKeys = new Set<string>()
    related.forEach((entry) => {
      getOpenBillEditorSessionIds(entry).forEach((id) => ids.add(id))
      getOpenBillEditorBookingGroupKeys(entry).forEach((key) => groupKeys.add(key))
    })
    getBookingGroupSessionIds(Array.from(groupKeys)).forEach((id) => ids.add(id))
    return ids
  }

  const hasIssuedBillForOpenBillGroup = (ob: OpenBill) => {
    const ids = getAllSessionIdsForOpenBillGroup(ob)
    if (ids.size === 0) return false
    return bills.some((bill) => {
      if (bill.sessionId != null && ids.has(Number(bill.sessionId))) return true
      return (bill.items ?? []).some((item) => item.sourceSessionBookingId != null && ids.has(Number(item.sourceSessionBookingId)))
    })
  }

  const onePayeeKeyForRelatedOpenBills = (related: OpenBill[], fallback: OpenBill) => related[0]?.id ?? fallback.id

  const isOnePayeeActiveForOpenBill = (ob: OpenBill, related = getRelatedOpenBillsForEditor(ob)) => (
    related.length > 1 && Boolean(openBillOnePayeeForAll[onePayeeKeyForRelatedOpenBills(related, ob)])
  )

  const selectOpenBillEditorTab = (target: OpenBill) => {
    setDetailOpenBill(normalizeOpenBill(target))
    setOpenBillDetailsEdits((prev) => (
      Object.prototype.hasOwnProperty.call(prev, target.id)
        ? prev
        : { ...prev, [target.id]: deriveOpenBillDetailsDraft(target) }
    ))
  }

  const selectNextOpenBillEditorTabAfterClose = (closedOpenBillId: number, relatedOpenBills: OpenBill[], refreshedOpenBills: OpenBill[]) => {
    const orderedRelated = relatedOpenBills.filter((entry) => entry.id !== closedOpenBillId)
    if (orderedRelated.length === 0) return false

    const closedIndex = relatedOpenBills.findIndex((entry) => entry.id === closedOpenBillId)
    const candidateIds: number[] = []
    if (closedIndex >= 0) {
      for (let offset = 1; offset < relatedOpenBills.length; offset += 1) {
        const candidate = relatedOpenBills[(closedIndex + offset) % relatedOpenBills.length]
        if (candidate && candidate.id !== closedOpenBillId) candidateIds.push(candidate.id)
      }
    }
    orderedRelated.forEach((entry) => {
      if (!candidateIds.includes(entry.id)) candidateIds.push(entry.id)
    })

    const nextOpenBill = candidateIds
      .map((id) => refreshedOpenBills.find((entry) => entry.id === id))
      .find((entry): entry is OpenBill => Boolean(entry))

    if (!nextOpenBill) return false
    if (openBillEditorRootId === closedOpenBillId) {
      setOpenBillEditorRootId(nextOpenBill.id)
    }
    selectOpenBillEditorTab(nextOpenBill)
    return true
  }

  const openBillEditorTabMeta = (ob: OpenBill) => {
    const draft = getOpenBillDetailsDraft(ob)
    const client = draft.clientId != null ? clients.find((entry) => entry.id === draft.clientId) : null
    const company = draft.recipientCompanyId != null ? companies.find((entry) => entry.id === draft.recipientCompanyId) : null
    const target = draft.billingTarget
    const label = target === 'COMPANY'
      ? (company?.name || openBillClientLabel(ob))
      : (client ? fullName(client) : openBillClientLabel(ob))
    return {
      target,
      label: label || (target === 'COMPANY' ? billingCopy.targetCompany : billingCopy.targetPerson),
      typeLabel: target === 'COMPANY' ? billingCopy.targetCompany : billingCopy.targetPerson,
      serviceClientLabel: openBillServiceClientLabel(ob),
    }
  }

  const openBillEditorSubtitle = (ob: OpenBill) => {
    const included = getOpenBillIncludedSessions(ob)
    const firstSession = included[0]
    const sessionLabel = firstSession?.sessionDisplayId || formatBillingSessionIdDisplay(firstSession?.sessionId ?? ob.sessionId)
    const sessionInfo = formatOpenBillSession(firstSession?.sessionInfo || ob.sessionInfo)
    const serviceLabel = openBillDescription(ob)
    return [sessionLabel, openBillClientLabel(ob), sessionInfo, serviceLabel].filter((part) => part && part !== '—').join(' · ')
  }

  const moveOpenBillLineToBill = (targetBill: OpenBill) => {
    if (!draggedOpenBillLine) return
    const sourceBill = getOpenBillForEditor(draggedOpenBillLine.openBillId)
    if (!sourceBill) return
    if (sourceBill.id === targetBill.id) {
      setDraggedOpenBillLine(null)
      return
    }
    const sourceItems = [...getOpenBillItems(sourceBill)]
    const [moved] = sourceItems.splice(draggedOpenBillLine.index, 1)
    if (!moved) {
      setDraggedOpenBillLine(null)
      return
    }
    setOpenBillItems(sourceBill, sourceItems)
    setOpenBillItems(targetBill, [...getOpenBillItems(targetBill), moved])
    setDraggedOpenBillLine(null)
  }

  const formatLineDiscountSummary = (draft: LineItemDiscountDraft | null | undefined) => {
    const value = discountValueNumber(draft)
    if (value <= 0) return ''
    return normalizeDiscountType(draft?.type) === 'AMOUNT' ? `€${Number(value).toFixed(2)}` : `${Math.round(value)}%`
  }

  const lineDiscountButtonContent = (draft: LineItemDiscountDraft | null | undefined) => {
    const summary = formatLineDiscountSummary(draft)
    return (
      <>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="7.5" cy="7.5" r="1.5" />
          <circle cx="16.5" cy="16.5" r="1.5" />
          <path d="M18.5 5.5 5.5 18.5" />
        </svg>
        <span>{summary || (locale === 'sl' ? 'Popust' : 'Discount')}</span>
        <em aria-hidden>⌄</em>
      </>
    )
  }

  const renderItemDiscountPopover = (
    draft: LineItemDiscountDraft,
    onPatch: (patch: Partial<LineItemDiscountDraft>) => void,
    onClose: () => void,
  ) => {
    const type = normalizeDiscountType(draft.type)
    const suffix = type === 'PERCENT' ? '%' : '€'
    return (
      <div className="billing-line-discount-popover" role="dialog" aria-label={locale === 'sl' ? 'Popust postavke' : 'Line-item discount'} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
        <div className="billing-line-discount-popover-head">
          <div>
            <strong>{locale === 'sl' ? 'Popust postavke' : 'Line-item discount'}</strong>
          </div>
          <button type="button" onClick={onClose} aria-label={locale === 'sl' ? 'Zapri popust postavke' : 'Close line discount'}>×</button>
        </div>
        <div className="billing-line-discount-segmented" role="group" aria-label={locale === 'sl' ? 'Vrsta popusta postavke' : 'Line discount type'}>
          <button type="button" className={type === 'PERCENT' ? 'is-active' : ''} aria-pressed={type === 'PERCENT'} onClick={() => onPatch({ type: 'PERCENT', value: draft.value })}>%</button>
          <button type="button" className={type === 'AMOUNT' ? 'is-active' : ''} aria-pressed={type === 'AMOUNT'} onClick={() => onPatch({ type: 'AMOUNT', value: draft.value })}>€</button>
        </div>
        <label className="billing-line-discount-input-wrap">
          <span className="sr-only">{locale === 'sl' ? 'Vrednost popusta postavke' : 'Line discount value'}</span>
          <input
            type="text"
            inputMode={type === 'PERCENT' ? 'numeric' : 'decimal'}
            value={draft.value}
            onChange={(event) => {
              const raw = type === 'PERCENT'
                ? event.target.value.replace(/[^0-9]/g, '').slice(0, 2)
                : sanitizeDiscountValueInput(event.target.value)
              onPatch({ type, value: raw })
            }}
            onBlur={() => {
              const numeric = discountValueNumber(draft)
              const normalized = type === 'PERCENT'
                ? (numeric <= 0 ? '0' : String(Math.max(1, Math.min(99, Math.round(numeric)))))
                : String(numeric)
              onPatch({ type, value: normalized })
            }}
            placeholder="0"
          />
          <em>{suffix}</em>
        </label>
        <div className="billing-line-discount-footer">
          <p>
            <span className="billing-line-discount-note-icon" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3 4.5 6v5.2c0 4.7 3.1 8.8 7.5 9.8 4.4-1 7.5-5.1 7.5-9.8V6L12 3Z" />
                <path d="m8.8 12 2.1 2.1 4.4-4.5" />
              </svg>
            </span>
            <span>{locale === 'sl' ? 'Popust se uporabi samo na izbrano postavko.' : 'The discount is applied only to the selected item.'}</span>
          </p>
          <button type="button" className="billing-line-discount-save" onClick={onClose}>
            {locale === 'sl' ? 'Shrani' : 'Save'}
          </button>
        </div>
      </div>
    )
  }

  const clampDiscountIndexAfterRemoval = (currentIndex: number | undefined, removedIndex: number, nextLength: number) => {
    if (currentIndex == null) return undefined
    if (currentIndex === removedIndex) return undefined
    const shifted = currentIndex > removedIndex ? currentIndex - 1 : currentIndex
    return nextLength > 0 ? Math.min(shifted, nextLength - 1) : undefined
  }

  const renderAdvancePaymentModal = () => {
    if (!advancePaymentModal) return null

    const isCreateMode = advancePaymentModal.mode === 'create'
    const targetOpenBill = isCreateMode
      ? null
      : (openBills.find((entry) => entry.id === advancePaymentModal.openBillId) || detailOpenBill)
    const targetDetails = targetOpenBill ? getOpenBillDetailsDraft(targetOpenBill) : null
    const modalUnusedAdvances = (() => {
      const byId = new Map<number, UnusedAdvance>()
      unusedAdvances.forEach((advance) => byId.set(advance.advanceBillId, { ...advance }))

      // Keep selections that were already assigned when the picker opened visible if
      // the backend no longer returns them as unused. Do not add the selected amount
      // to an existing unused balance, because that duplicates the visible deposit total.
      advancePaymentInitialSelections.forEach((selection) => {
        const selectedAmountGross = getAdvanceSelectionAmount(selection)
        if (!Number.isFinite(selectedAmountGross) || selectedAmountGross <= 0) return
        if (byId.has(selection.advanceBillId)) return
        const bill = bills.find((entry) => entry.id === selection.advanceBillId)
        byId.set(selection.advanceBillId, {
          advanceBillId: selection.advanceBillId,
          billNumber: bill?.billNumber || `ADV-${selection.advanceBillId}`,
          sessionId: bill?.sessionId ?? null,
          client: bill?.client ? { id: bill.client.id, firstName: bill.client.firstName, lastName: bill.client.lastName } : null,
          recipientCompany: bill?.recipientCompany ? { id: bill.recipientCompany.id, name: bill.recipientCompany.name } : null,
          billingTarget: bill?.billingTarget ?? null,
          issueDate: bill?.issueDate || '',
          totalNet: grossToAdvanceNet(selectedAmountGross),
          usedNet: 0,
          remainingNet: grossToAdvanceNet(selectedAmountGross),
          totalGross: selectedAmountGross,
          usedGross: 0,
          remainingGross: selectedAmountGross,
        })
      })

      // Keep a currently selected advance visible even if it is no longer returned as unused.
      // Do not add this amount to an existing remaining amount; it is only a fallback row.
      advancePaymentDraftSelections.forEach((selection) => {
        if (byId.has(selection.advanceBillId)) return
        const selectedAmountGross = getAdvanceSelectionAmount(selection)
        if (!Number.isFinite(selectedAmountGross) || selectedAmountGross <= 0) return
        const bill = bills.find((entry) => entry.id === selection.advanceBillId)
        byId.set(selection.advanceBillId, {
          advanceBillId: selection.advanceBillId,
          billNumber: bill?.billNumber || `ADV-${selection.advanceBillId}`,
          sessionId: bill?.sessionId ?? null,
          client: bill?.client ? { id: bill.client.id, firstName: bill.client.firstName, lastName: bill.client.lastName } : null,
          recipientCompany: bill?.recipientCompany ? { id: bill.recipientCompany.id, name: bill.recipientCompany.name } : null,
          billingTarget: bill?.billingTarget ?? null,
          issueDate: bill?.issueDate || '',
          totalNet: grossToAdvanceNet(selectedAmountGross),
          usedNet: 0,
          remainingNet: grossToAdvanceNet(selectedAmountGross),
          totalGross: selectedAmountGross,
          usedGross: 0,
          remainingGross: selectedAmountGross,
        })
      })
      return Array.from(byId.values())
    })()
    const selectedAdvanceIds = new Set(advancePaymentDraftSelections.map((entry) => entry.advanceBillId))
    const primaryAdvances = isCreateMode
      ? modalUnusedAdvances.filter((entry) => selectedAdvanceIds.has(entry.advanceBillId) || doesUnusedAdvanceMatchRecipient(
          entry,
          billForm.billingTarget,
          billForm.clientId ?? null,
          billForm.recipientCompanyId ?? null,
        ))
      : modalUnusedAdvances.filter((entry) => selectedAdvanceIds.has(entry.advanceBillId) || doesUnusedAdvanceMatchRecipient(
          entry,
          targetDetails?.billingTarget ?? 'PERSON',
          targetDetails?.clientId ?? targetOpenBill?.client?.id ?? null,
          targetDetails?.recipientCompanyId ?? targetOpenBill?.batchTargetCompanyId ?? null,
        ))
    const primaryAdvanceIds = new Set(primaryAdvances.map((entry) => entry.advanceBillId))
    const otherAdvances = modalUnusedAdvances.filter((entry) => !primaryAdvanceIds.has(entry.advanceBillId))
    const targetClient = isCreateMode
      ? clients.find((client) => client.id === billForm.clientId) || null
      : clients.find((client) => client.id === (targetDetails?.clientId ?? targetOpenBill?.client?.id)) || null
    const targetCompany = isCreateMode
      ? companies.find((company) => company.id === billForm.recipientCompanyId) || null
      : companies.find((company) => company.id === (targetDetails?.recipientCompanyId ?? targetOpenBill?.batchTargetCompanyId)) || null
    const targetLabel = (isCreateMode ? billForm.billingTarget : (targetDetails?.billingTarget ?? 'PERSON')) === 'COMPANY'
      ? (targetCompany?.name || (locale === 'sl' ? 'Izbrano podjetje' : 'Selected company'))
      : (targetClient ? fullName(targetClient) : (locale === 'sl' ? 'Izbrana stranka' : 'Selected client'))
    const limitGross = isCreateMode ? createBillPayableGross : detailOpenBillTransactionGross
    const selectedTotal = sumAdvanceSelectionGross(advancePaymentDraftSelections)
    const canConfirm = validateAdvanceSelections(advancePaymentDraftSelections, modalUnusedAdvances, limitGross)
    const selectedCount = advancePaymentDraftSelections.length

    const getAdvanceRecipientCaption = (advance: UnusedAdvance) => {
      if (advance.recipientCompany?.name) return advance.recipientCompany.name
      const person = `${advance.client?.firstName || ''} ${advance.client?.lastName || ''}`.trim()
      if (person) return person
      if (advance.sessionId != null) return `${locale === 'sl' ? 'Seja' : 'Session'} #${advance.sessionId}`
      return locale === 'sl' ? 'Predplačilo' : 'Advance payment'
    }

    const renderAdvanceSelectionModeRow = (
      advanceBillId: number,
      mode: 'full' | 'partial',
      checked: boolean,
      label: string,
      trailing: ReactNode,
      amountGross?: string,
    ) => (
      <label className={`billing-advance-picker-mode-row${checked ? ' is-active' : ''}`}>
        <input
          type="radio"
          name={`advance-mode-${advanceBillId}`}
          checked={checked}
          onChange={() => updateAdvanceDraftSelection(advanceBillId, { mode, ...(amountGross != null ? { amountGross } : {}) })}
        />
        <span className="billing-advance-picker-mode-radio" aria-hidden />
        <span className="billing-advance-picker-mode-label">{label}</span>
        <span className="billing-advance-picker-mode-value">{trailing}</span>
      </label>
    )

    const renderAdvanceCard = (advance: UnusedAdvance, tone: 'primary' | 'secondary' = 'primary') => {
      const selected = advancePaymentDraftSelections.find((entry) => entry.advanceBillId === advance.advanceBillId) || null
      const remainingGross = Number(advance.remainingGross || 0)
      const recipientCaption = getAdvanceRecipientCaption(advance)
      return (
        <div key={advance.advanceBillId} className={`billing-advance-picker-card billing-advance-picker-card--${tone}${selected ? ' is-selected' : ''}`}>
          <label className="billing-advance-picker-check">
            <input
              type="checkbox"
              checked={Boolean(selected)}
              onChange={(e) => toggleAdvanceDraftSelection(advance, e.target.checked)}
            />
            <span className="billing-advance-picker-checkmark" aria-hidden>
              {selected ? '✓' : ''}
            </span>
            <span className="billing-advance-picker-doc-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
                <path d="M14 3v5h5" />
                <path d="M9 13h6" />
                <path d="M9 17h6" />
              </svg>
            </span>
            <span className="billing-advance-picker-card-copy">
              <span className="billing-advance-picker-card-headline">
                <strong>{advance.billNumber || `ADV-${advance.advanceBillId}`}</strong>
                <span className="billing-advance-picker-status-pill">{locale === 'sl' ? 'Neizkoriščeno' : 'Unused'}</span>
              </span>
              <span className="billing-advance-picker-card-subtitle">{recipientCaption}</span>
            </span>
            <span className="billing-advance-picker-card-meta">
              <strong>{currency(remainingGross)}</strong>
              <span>{advance.issueDate ? formatDate(advance.issueDate) : '—'}</span>
            </span>
          </label>
          {selected && (
            <div className="billing-advance-picker-controls">
              {renderAdvanceSelectionModeRow(
                advance.advanceBillId,
                'full',
                selected.mode === 'full',
                locale === 'sl' ? 'Uporabi celoten znesek' : 'Use full amount',
                currency(remainingGross),
                formatPaymentAmountInput(remainingGross),
              )}
              {renderAdvanceSelectionModeRow(
                advance.advanceBillId,
                'partial',
                selected.mode === 'partial',
                locale === 'sl' ? 'Uporabi znesek na tem računu' : 'Use amount on this bill',
                <span className="billing-advance-picker-amount-field-wrap">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={selected.amountGross}
                    placeholder="0.00"
                    readOnly={selected.mode !== 'partial'}
                    onChange={(e) => updateAdvanceDraftSelection(advance.advanceBillId, { amountGross: e.target.value })}
                    onBlur={() => updateAdvanceDraftSelection(advance.advanceBillId, { amountGross: formatPaymentAmountInput(getAdvanceSelectionAmount(selected)) })}
                    aria-label={locale === 'sl' ? 'Znesek predplačila za ta račun' : 'Advance amount for this bill'}
                  />
                </span>,
              )}
              <p className="billing-advance-picker-payment-note">
                {locale === 'sl'
                  ? 'Izbrani znesek se doda kot plačilna metoda samo na ta račun. Neuporabljeni preostanek ostane na predplačilu.'
                  : 'The selected amount is added as a payment method only on this bill. Any unused remainder stays on the deposit.'}
              </p>
            </div>
          )}
        </div>
      )
    }

    return (
      <SidePanel
        open
        onClose={closeAdvancePaymentModal}
        ariaLabel={locale === 'sl' ? 'Izberi predplačila' : 'Choose advance payments'}
        size="lg"
      >
        <div className="billing-advance-picker-modal">
          <div className="billing-payee-modal-head billing-advance-picker-head">
            <div>
              <h3>{locale === 'sl' ? 'Izberi neizkoriščena predplačila' : 'Choose unused advance payments'}</h3>
              <p>{locale === 'sl' ? 'Izberite predplačila, ki jih želite uporabiti kot način plačila na tem računu.' : 'Choose the advance payments you want to use as payment methods on this bill.'}</p>
            </div>
            <button type="button" className="billing-bill-modal-close" onClick={closeAdvancePaymentModal} aria-label="Close">×</button>
          </div>

          <div className="billing-advance-picker-body">
            <section className="billing-advance-picker-section">
              <div className="billing-advance-picker-section-head">
                <div>
                  <h4>{locale === 'sl' ? 'Razpoložljiva predplačila' : 'Available advance payments'}</h4>
                  <p>{targetLabel}</p>
                </div>
              </div>
              <div className="billing-advance-picker-list">
                {primaryAdvances.length > 0 ? primaryAdvances.map((advance) => renderAdvanceCard(advance)) : (
                  <div className="billing-advance-picker-empty">{locale === 'sl' ? 'Za to stranko ali podjetje ni razpoložljivih predplačil.' : 'No available advances for this client or company.'}</div>
                )}
              </div>
            </section>

            {otherAdvances.length > 0 && (
              <section className="billing-advance-picker-section billing-advance-picker-section--other">
                <button type="button" className="billing-advance-picker-toggle" onClick={() => setAdvancePaymentShowOther((prev) => !prev)}>
                  <span>{advancePaymentShowOther ? (locale === 'sl' ? 'Skrij druga predplačila' : 'Hide other advance payments') : (locale === 'sl' ? 'Pokaži druga predplačila' : 'Show other advance payments')}</span>
                  <span className="billing-advance-picker-toggle-arrow" aria-hidden>›</span>
                </button>
                {advancePaymentShowOther && (
                  <div className="billing-advance-picker-list">
                    {otherAdvances.map((advance) => renderAdvanceCard(advance, 'secondary'))}
                  </div>
                )}
              </section>
            )}

            <section className="billing-advance-picker-summary">
              <div>
                <span>{selectedCount > 0 ? describeAdvanceSelectionCount(selectedCount) : (locale === 'sl' ? 'Ni izbranih predplačil' : 'No advances selected')}</span>
                <strong>{locale === 'sl' ? 'Izbrano' : 'Selected'}</strong>
              </div>
              <div>
                <span>{locale === 'sl' ? 'Znesek' : 'Amount'}</span>
                <strong>{currency(selectedTotal)}</strong>
              </div>
            </section>
          </div>

          <div className="billing-payee-modal-footer billing-advance-picker-footer">
            <div className="billing-advance-picker-footer-total">
              <span>{locale === 'sl' ? 'Znesek računa' : 'Bill amount'}</span>
              <strong>{currency(limitGross)}</strong>
            </div>
            <button type="button" className="billing-bill-modal-primary-action" onClick={commitAdvancePaymentModalSelections} disabled={!canConfirm}>
              {locale === 'sl' ? 'Potrdi izbiro' : 'Confirm selection'}
            </button>
          </div>
        </div>
      </SidePanel>
    )
  }

  const renderEntitlementPaymentModal = () => {
    if (!entitlementsEnabled || !entitlementPaymentTarget) return null
    const targetBill = detailOpenBill?.id === entitlementPaymentTarget.openBillId
      ? detailOpenBill
      : openBills.find((entry) => entry.id === entitlementPaymentTarget.openBillId)
    const canScanBill = Number.isInteger(Number(entitlementPaymentTarget.paymentBookingId)) && Number(entitlementPaymentTarget.paymentBookingId) > 0
    const walletOptionCount = entitlementWalletOptions.length
    const modalTitle = entitlementPaymentStep === 'choice'
      ? (locale === 'sl' ? 'Izberite vnos ugodnosti' : 'Choose entitlement input')
      : entitlementPaymentStep === 'scanner'
        ? (locale === 'sl' ? 'Skeniraj ugodnost' : 'Scan entitlement')
        : entitlementPaymentStep === 'wallet'
          ? (locale === 'sl' ? 'Izberite ugodnost iz denarnice' : 'Choose wallet entitlement')
          : (locale === 'sl' ? 'Vnesite kodo ugodnosti' : 'Enter entitlement code')

    return (
      <SidePanel
        open
        onClose={closeEntitlementPaymentModal}
        ariaLabel={modalTitle}
        size="md"
      >
        <div
          className={`billing-entitlement-modal billing-entitlement-modal--${entitlementPaymentStep}`}
          onMouseDown={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={modalTitle}
        >
          <div className="billing-entitlement-modal-head">
            <div>
              <h3>{modalTitle}</h3>
              <p>
                {entitlementPaymentStep === 'choice'
                  ? (locale === 'sl' ? 'Izberite, kako želite uporabiti ugodnost za ta račun.' : 'Select how you would like to provide the entitlement.')
                  : entitlementPaymentStep === 'scanner'
                    ? (locale === 'sl' ? 'Postavite QR ali črtno kodo znotraj okvirja.' : 'Position the QR or barcode within the frame.')
                    : entitlementPaymentStep === 'wallet'
                      ? (locale === 'sl' ? 'Izberite razpoložljivo ugodnost plačnika za izbrani račun.' : 'Choose an available entitlement from the payee wallet for this bill.')
                      : (locale === 'sl' ? 'Ročno vnesite kodo ugodnosti za ta račun.' : 'Enter the entitlement code manually to apply it to this invoice.')}
              </p>
            </div>
            <button type="button" className="billing-bill-modal-close" onClick={closeEntitlementPaymentModal} aria-label={locale === 'sl' ? 'Zapri' : 'Close'}>×</button>
          </div>

          {!canScanBill && (
            <div className="billing-entitlement-result billing-entitlement-result--error" role="status">
              <strong>{locale === 'sl' ? 'Ta račun ni povezan s terminom.' : 'This bill is not linked to a booking.'}</strong>
              <span>{locale === 'sl' ? 'Ugodnost lahko uporabite za kritje samo pri računih, ki imajo povezavo na termin.' : 'Entitlements can only cover bills that are linked to a booking.'}</span>
            </div>
          )}

          {entitlementPaymentStep === 'choice' && (
            <div className="billing-entitlement-choice-list">
              <button
                type="button"
                className="billing-entitlement-choice-card"
                onClick={() => {
                  setEntitlementPaymentStep('scanner')
                  setEntitlementScanResult(null)
                }}
                disabled={!canScanBill}
              >
                <span className="billing-entitlement-choice-icon" aria-hidden>{entitlementScanIcon()}</span>
                <span className="billing-entitlement-choice-copy">
                  <strong>{locale === 'sl' ? 'Skeniraj ugodnost' : 'Scan entitlement'}</strong>
                  <small>{locale === 'sl' ? 'Odprite skener v popupu in skenirajte QR kodo ugodnosti.' : 'Open the scanner in a popup to scan the entitlement QR code.'}</small>
                </span>
                <span className="billing-entitlement-choice-arrow" aria-hidden>›</span>
              </button>
              <button
                type="button"
                className="billing-entitlement-choice-card"
                onClick={() => {
                  stopEntitlementCamera()
                  setEntitlementPaymentStep('manual')
                  setEntitlementScanResult(null)
                }}
                disabled={!canScanBill}
              >
                <span className="billing-entitlement-choice-icon" aria-hidden>{entitlementKeyboardIcon()}</span>
                <span className="billing-entitlement-choice-copy">
                  <strong>{locale === 'sl' ? 'Vnesi kodo ročno' : 'Enter code manually'}</strong>
                  <small>{locale === 'sl' ? 'Odprite obrazec za ročni vnos kode ugodnosti.' : 'Open a form to manually enter the entitlement code.'}</small>
                </span>
                <span className="billing-entitlement-choice-arrow" aria-hidden>›</span>
              </button>
              {canScanBill && walletOptionCount > 0 && (
                <button
                  type="button"
                  className="billing-entitlement-choice-card billing-entitlement-choice-card--with-badge"
                  onClick={() => {
                    stopEntitlementCamera()
                    setEntitlementPaymentStep('wallet')
                    setEntitlementScanResult(null)
                  }}
                  disabled={entitlementWalletLoading}
                >
                  <span className="billing-entitlement-choice-icon" aria-hidden>{entitlementWalletIcon()}</span>
                  <span className="billing-entitlement-choice-copy">
                    <strong>{locale === 'sl' ? 'Izberi iz denarnice' : 'Choose from wallet'}</strong>
                    <small>{locale === 'sl' ? 'Uporabite razpoložljivo ugodnost plačnika za ta račun.' : 'Use an available entitlement from the payee wallet for this bill.'}</small>
                  </span>
                  <span className="billing-entitlement-choice-badge">{entitlementWalletCountLabel(walletOptionCount)}</span>
                  <span className="billing-entitlement-choice-arrow" aria-hidden>›</span>
                </button>
              )}
            </div>
          )}

          {entitlementPaymentStep === 'wallet' && (
            <div className="billing-entitlement-wallet">
              {targetBill && (
                <div className="billing-entitlement-target-strip">
                  <span>{locale === 'sl' ? 'Plačnik' : 'Payee'}</span>
                  <strong>{openBillClientLabel(targetBill)}</strong>
                  <em>{currency(entitlementPaymentTarget.totalGross)}</em>
                </div>
              )}
              <div className="billing-entitlement-wallet-list">
                {entitlementWalletOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="billing-entitlement-wallet-card"
                    onClick={() => submitEntitlementWalletOption(option)}
                    disabled={entitlementSubmitting || !String(option.code || option.displayCode || '').trim()}
                  >
                    <span className="billing-entitlement-choice-icon" aria-hidden>{entitlementWalletIcon()}</span>
                    <span className="billing-entitlement-wallet-copy">
                      <strong>{option.productName || entitlementWalletTypeLabel(option)}</strong>
                      <small>{entitlementWalletTypeLabel(option)} · {entitlementWalletRemainingLabel(option)}</small>
                      {(option.displayCode || option.code) && <em>{option.displayCode || option.code}</em>}
                    </span>
                    <span className="billing-entitlement-choice-arrow" aria-hidden>›</span>
                  </button>
                ))}
                {walletOptionCount === 0 && !entitlementWalletLoading && (
                  <div className="billing-entitlement-wallet-empty">
                    {locale === 'sl' ? 'Plačnik nima razpoložljivih kart, paketov ali članstev za to storitev.' : 'The payee has no available tickets, packs or memberships for this service.'}
                  </div>
                )}
                {entitlementWalletLoading && (
                  <div className="billing-entitlement-wallet-empty">
                    {locale === 'sl' ? 'Preverjam denarnico…' : 'Checking wallet…'}
                  </div>
                )}
              </div>
              <button type="button" className="billing-entitlement-link-btn billing-entitlement-wallet-back" onClick={() => setEntitlementPaymentStep('choice')}>
                {locale === 'sl' ? 'Nazaj na izbiro vnosa' : 'Back to input choice'}
              </button>
            </div>
          )}

          {entitlementPaymentStep === 'scanner' && (
            <div className="billing-entitlement-scanner">
              <div className="billing-entitlement-scanner-frame">
                <video ref={entitlementVideoRef} className="billing-entitlement-scanner-video" playsInline muted />
                {!entitlementCameraActive && (
                  <div className="billing-entitlement-scanner-empty">
                    <span aria-hidden>{entitlementScanIcon()}</span>
                    <strong>{locale === 'sl' ? 'Kamera se pripravlja…' : 'Preparing camera…'}</strong>
                  </div>
                )}
              </div>
              {targetBill && (
                <div className="billing-entitlement-target-strip">
                  <span>{locale === 'sl' ? 'Račun' : 'Bill'}</span>
                  <strong>{openBillClientLabel(targetBill)}</strong>
                  <em>{currency(entitlementPaymentTarget.totalGross)}</em>
                </div>
              )}
              <div className="billing-entitlement-scanner-actions">
                <button type="button" className="billing-entitlement-link-btn" onClick={() => { stopEntitlementCamera(); setEntitlementPaymentStep('manual'); setEntitlementScanResult(null) }}>
                  {locale === 'sl' ? 'Vnesi kodo ročno' : 'Enter code manually'}
                </button>
                <button type="button" className="billing-entitlement-camera-btn" onClick={() => void startEntitlementCamera()} disabled={entitlementSubmitting}>
                  {entitlementCameraIcon()}
                </button>
                <button type="button" className="billing-entitlement-icon-soft" onClick={stopEntitlementCamera} disabled={!entitlementCameraActive || entitlementSubmitting} aria-label={locale === 'sl' ? 'Ustavi kamero' : 'Stop camera'}>
                  {entitlementPaymentIcon()}
                </button>
              </div>
            </div>
          )}

          {entitlementPaymentStep === 'manual' && (
            <form className="billing-entitlement-manual-form" onSubmit={submitEntitlementManualCode}>
              <label>
                <span>{locale === 'sl' ? 'Koda ugodnosti' : 'Entitlement code'}</span>
                <input
                  value={entitlementManualCode}
                  onChange={(event) => setEntitlementManualCode(event.target.value)}
                  placeholder={locale === 'sl' ? 'npr. ENT-2025-0001' : 'e.g. ENT-2025-0001'}
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                />
              </label>
              <div className="billing-entitlement-manual-hint">
                <span aria-hidden>i</span>
                {locale === 'sl' ? 'Kodo običajno prejmete na kartici ugodnosti ali v mobilni denarnici.' : 'The code is typically printed on the entitlement or shown in the mobile wallet.'}
              </div>
              <button type="submit" className="billing-entitlement-apply-btn" disabled={entitlementSubmitting || !entitlementManualCode.trim()}>
                {entitlementSubmitting ? (locale === 'sl' ? 'Preverjam…' : 'Applying…') : (locale === 'sl' ? 'Uporabi kodo' : 'Apply code')}
              </button>
              <div className="billing-entitlement-or-row"><span>{locale === 'sl' ? 'ali' : 'or'}</span></div>
              <button type="button" className="billing-entitlement-open-scanner-btn" onClick={() => { setEntitlementPaymentStep('scanner'); setEntitlementScanResult(null) }}>
                {entitlementScanIcon()}
                {locale === 'sl' ? 'Odpri skener' : 'Open scanner'}
              </button>
            </form>
          )}

          {entitlementScanResult && (
            <div className={`billing-entitlement-result billing-entitlement-result--${entitlementScanResult.tone}`} role="status">
              <strong>{entitlementScanResult.text}</strong>
              {entitlementScanResult.detail && <span>{entitlementScanResult.detail}</span>}
            </div>
          )}
        </div>
      </SidePanel>
    )
  }

  const renderCreateBillPayeeDialog = () => {
    if (!editingCreateBillPayee) return null
    const selectedPayeeClient = clients.find((client) => client.id === billForm.clientId) || null
    const selectedPayeeCompany = companies.find((company) => company.id === billForm.recipientCompanyId) || null
    const selectedPayeeClientEdit = getPayeeClientEdit(selectedPayeeClient)
    const selectedPayeeCompanyEdit = getPayeeCompanyEdit(selectedPayeeCompany)

    const saveCreateBillPayeeDialog = async () => {
      if (savingPayeeEditor) return
      setSavingPayeeEditor(true)
      try {
        const ok = billForm.billingTarget === 'COMPANY'
          ? await persistPayeeCompanyEdit(billForm.recipientCompanyId)
          : await persistPayeeClientEdit(billForm.clientId)
        if (ok) setEditingCreateBillPayee(false)
      } finally {
        setSavingPayeeEditor(false)
      }
    }

    return (
      <SidePanel
        open
        onClose={() => setEditingCreateBillPayee(false)}
        ariaLabel={locale === 'sl' ? 'Uredi plačnika računa' : 'Edit bill payee'}
        size="lg"
      >
        <div className="billing-payee-modal billing-payee-modal--editor">
          <div className="billing-payee-mobile-topbar">
            <button type="button" className="billing-bill-modal-close" onClick={() => setEditingCreateBillPayee(false)} aria-label={locale === 'sl' ? 'Zapri' : 'Close'}>×</button>
            <div className="billing-payee-mobile-topbar-title">{locale === 'sl' ? 'Uredi plačnika računa' : 'Edit bill payee'}</div>
            <button type="button" className="billing-payee-mobile-save" onClick={() => void saveCreateBillPayeeDialog()} disabled={savingPayeeEditor}>{locale === 'sl' ? 'Shrani' : 'Save'}</button>
          </div>
          <div className="billing-payee-modal-head">
            <div>
              <h3>{locale === 'sl' ? 'Uredi plačnika računa' : 'Edit payee for this bill'}</h3>
              <p>{locale === 'sl' ? 'Izberite prejemnika in zaposlenega (opcijsko).' : 'Choose recipient and optional employee.'}</p>
            </div>
            <button type="button" className="billing-bill-modal-close" onClick={() => setEditingCreateBillPayee(false)} aria-label="Close">×</button>
          </div>
          <div className="booking-type-switcher billing-bill-modal-target-switcher billing-payee-type-switcher" role="group" aria-label={locale === 'sl' ? 'Vrsta plačnika' : 'Payee type'}>
            <button
              type="button"
              className={billForm.billingTarget === 'PERSON' ? 'booking-type-btn active' : 'booking-type-btn'}
              aria-pressed={billForm.billingTarget === 'PERSON'}
              onClick={() => setBillForm({ ...billForm, billingTarget: 'PERSON', recipientCompanyId: undefined })}
            >
              {billingCopy.targetPerson}
            </button>
            <button
              type="button"
              className={billForm.billingTarget === 'COMPANY' ? 'booking-type-btn active' : 'booking-type-btn'}
              aria-pressed={billForm.billingTarget === 'COMPANY'}
              onClick={() => setBillForm({
                ...billForm,
                billingTarget: 'COMPANY',
                recipientCompanyId: billForm.recipientCompanyId ?? selectedClientCompany?.id,
              })}
            >
              {billingCopy.targetCompany}
            </button>
          </div>
          <div className="billing-payee-modal-grid">
            {billForm.billingTarget === 'COMPANY' ? (
              <>
                <Field label={locale === 'sl' ? 'Prejemnik (podjetje)' : 'Recipient (company)'}>
                  <div className="billing-payee-client-picker-row billing-payee-client-picker-row--search" onClick={(e) => e.stopPropagation()}>
                    <div className="client-picker" style={{ minWidth: 0 }}>
                      <div className={`client-search-wrap${!editingRecipientCompanySearch ? ' client-search-wrap--compact-client' : ''}`}>
                        {editingRecipientCompanySearch ? (
                          <input
                            placeholder={billingCopy.searchCompanyPlaceholder}
                            value={recipientCompanySearch}
                            onChange={(e) => setRecipientCompanySearch(e.target.value)}
                            onFocus={() => setRecipientCompanyPickerOpen(true)}
                          />
                        ) : (
                          <button
                            type="button"
                            className="client-selected-display"
                            onClick={() => {
                              setEditingRecipientCompanySearch(true)
                              setRecipientCompanySearch('')
                              setRecipientCompanyPickerOpen(true)
                            }}
                          >
                            {selectedPayeeCompany?.name || billingCopy.selectCompany}
                          </button>
                        )}
                        <span className="client-search-icon" aria-hidden>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                        </span>
                      </div>
                      {recipientCompanyPickerOpen && (
                        <div className="client-dropdown-panel">
                          {selectedClientCompany && (
                            <button
                              type="button"
                              className={`client-list-item ${billForm.recipientCompanyId === selectedClientCompany.id ? 'selected' : ''}`}
                              onClick={() => {
                                setBillForm({ ...billForm, recipientCompanyId: selectedClientCompany.id })
                                setRecipientCompanyPickerOpen(false)
                                setEditingRecipientCompanySearch(false)
                              }}
                            >
                              {`${selectedClientCompany.name} ${billingCopy.linkedToClientSuffix}`}
                            </button>
                          )}
                          {visibleRecipientCompanies
                            .filter((company) => !selectedClientCompany || company.id !== selectedClientCompany.id)
                            .slice(0, 10)
                            .map((company) => (
                              <button
                                key={company.id}
                                type="button"
                                className={`client-list-item ${billForm.recipientCompanyId === company.id ? 'selected' : ''}`}
                                onClick={() => {
                                  setBillForm({ ...billForm, recipientCompanyId: company.id })
                                  setRecipientCompanyPickerOpen(false)
                                  setEditingRecipientCompanySearch(false)
                                }}
                              >
                                {company.name}
                              </button>
                            ))}
                          {visibleRecipientCompanies.length === 0 && <span className="muted">{billingCopy.noCompaniesFound}</span>}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="secondary client-add-btn billing-payee-inline-add-btn"
                      onClick={() => openAddCompanyModal({ mode: 'createBill' })}
                      aria-label={locale === 'sl' ? 'Dodaj podjetje' : 'Add company'}
                    >
                      +
                    </button>
                  </div>
                </Field>
                <Field label={locale === 'sl' ? 'Zaposleni (opcijsko)' : 'Employee (optional)'}>
                  <DesktopSelect value={billForm.consultantId ?? ''} onChange={(e) => setBillForm({ ...billForm, consultantId: e.target.value === '' ? undefined : Number(e.target.value) })}>
                    <option value="">{locale === 'sl' ? 'Privzeto: trenutni uporabnik' : 'Default: current user'}</option>
                    {(isAdmin ? users : [me]).map((user) => (
                      <option key={user.id} value={user.id}>{fullName(user)}</option>
                    ))}
                  </DesktopSelect>
                </Field>
                {clientsLinkedToInvoiceCompany.length > 0 && (
                  <Field label={billingCopy.clientOptional}>
                    <DesktopSelect
                      value={billForm.clientId ?? ''}
                      onChange={(e) => {
                        const nextClientId = e.target.value === '' ? undefined : Number(e.target.value)
                        const nextClient = clientsLinkedToInvoiceCompany.find((client) => client.id === nextClientId)
                        setBillForm({
                          ...billForm,
                          clientId: nextClientId,
                          recipientCompanyId: billForm.recipientCompanyId ?? nextClient?.billingCompany?.id,
                        })
                      }}
                    >
                      <option value="">{billingCopy.selectClient}</option>
                      {clientsLinkedToInvoiceCompany.map((client) => (
                        <option key={client.id} value={client.id}>{fullName(client)}</option>
                      ))}
                    </DesktopSelect>
                  </Field>
                )}
                <Field label={locale === 'sl' ? 'Podjetje' : 'Company'}>
                  <input value={selectedPayeeCompanyEdit.name} onChange={(e) => updatePayeeCompanyEdit(selectedPayeeCompany, { name: e.target.value })} disabled={!selectedPayeeCompany} />
                </Field>
                <Field label={locale === 'sl' ? 'E-pošta' : 'Email'}>
                  <input value={selectedPayeeCompanyEdit.email} onChange={(e) => updatePayeeCompanyEdit(selectedPayeeCompany, { email: e.target.value })} disabled={!selectedPayeeCompany} />
                </Field>
                <Field label={locale === 'sl' ? 'Telefon' : 'Phone'}>
                  <input value={selectedPayeeCompanyEdit.telephone} onChange={(e) => updatePayeeCompanyEdit(selectedPayeeCompany, { telephone: e.target.value })} disabled={!selectedPayeeCompany} />
                </Field>
                <Field label={locale === 'sl' ? 'Naslov' : 'Address'}>
                  <input value={selectedPayeeCompanyEdit.address} onChange={(e) => updatePayeeCompanyEdit(selectedPayeeCompany, { address: e.target.value })} disabled={!selectedPayeeCompany} />
                </Field>
                <Field label={locale === 'sl' ? 'Poštna številka' : 'Postal code'}>
                  <input value={selectedPayeeCompanyEdit.postalCode} onChange={(e) => updatePayeeCompanyEdit(selectedPayeeCompany, { postalCode: e.target.value })} disabled={!selectedPayeeCompany} />
                </Field>
                <Field label={locale === 'sl' ? 'Mesto' : 'City'}>
                  <input value={selectedPayeeCompanyEdit.city} onChange={(e) => updatePayeeCompanyEdit(selectedPayeeCompany, { city: e.target.value })} disabled={!selectedPayeeCompany} />
                </Field>
                <Field label={locale === 'sl' ? 'Davčna številka' : 'VAT ID'}>
                  <input value={selectedPayeeCompanyEdit.vatId} onChange={(e) => updatePayeeCompanyEdit(selectedPayeeCompany, { vatId: e.target.value })} disabled={!selectedPayeeCompany} />
                </Field>
              </>
            ) : (
              <>
                <Field label={locale === 'sl' ? 'Prejemnik' : 'Recipient'}>
                  <div className="billing-payee-client-picker-row">
                    <DesktopSelect
                      value={billForm.clientId ?? ''}
                      onChange={(e) => {
                        const nextClientId = e.target.value === '' ? undefined : Number(e.target.value)
                        setBillForm({
                          ...billForm,
                          clientId: nextClientId,
                          recipientCompanyId: undefined,
                        })
                      }}
                    >
                      <option value="">{billingCopy.selectClient}</option>
                      {clients.filter((client) => client.active !== false).map((client) => (
                        <option key={client.id} value={client.id}>{fullName(client)}</option>
                      ))}
                    </DesktopSelect>
                    <button
                      type="button"
                      className="secondary client-add-btn billing-payee-inline-add-btn"
                      onClick={() => openAddClientModal({ mode: 'createBill' })}
                      aria-label={locale === 'sl' ? 'Dodaj stranko' : 'Add client'}
                    >
                      +
                    </button>
                  </div>
                </Field>
                <Field label={locale === 'sl' ? 'Zaposleni (opcijsko)' : 'Employee (optional)'}>
                  <DesktopSelect value={billForm.consultantId ?? ''} onChange={(e) => setBillForm({ ...billForm, consultantId: e.target.value === '' ? undefined : Number(e.target.value) })}>
                    <option value="">{locale === 'sl' ? 'Privzeto: trenutni uporabnik' : 'Default: current user'}</option>
                    {(isAdmin ? users : [me]).map((user) => (
                      <option key={user.id} value={user.id}>{fullName(user)}</option>
                    ))}
                  </DesktopSelect>
                </Field>
                <Field label={locale === 'sl' ? 'Ime' : 'First name'}>
                  <input value={selectedPayeeClientEdit.firstName} onChange={(e) => updatePayeeClientEdit(selectedPayeeClient, { firstName: e.target.value })} disabled={!selectedPayeeClient} />
                </Field>
                <Field label={locale === 'sl' ? 'Priimek' : 'Last name'}>
                  <input value={selectedPayeeClientEdit.lastName} onChange={(e) => updatePayeeClientEdit(selectedPayeeClient, { lastName: e.target.value })} disabled={!selectedPayeeClient} />
                </Field>
                <Field label={locale === 'sl' ? 'E-pošta' : 'Email'}>
                  <input value={selectedPayeeClientEdit.email} onChange={(e) => updatePayeeClientEdit(selectedPayeeClient, { email: e.target.value })} disabled={!selectedPayeeClient} />
                </Field>
                <Field label={locale === 'sl' ? 'Telefon' : 'Phone'}>
                  <input value={selectedPayeeClientEdit.phone} onChange={(e) => updatePayeeClientEdit(selectedPayeeClient, { phone: e.target.value })} disabled={!selectedPayeeClient} />
                </Field>
              </>
            )}
          </div>
          <div className="billing-payee-modal-footer">
            <button type="button" className="billing-bill-modal-save-btn" onClick={() => void saveCreateBillPayeeDialog()} disabled={savingPayeeEditor}>
              <span>{locale === 'sl' ? 'Shrani' : 'Save'}</span>
            </button>
          </div>
        </div>
      </SidePanel>
    )
  }
  const renderAddOpenBillDialog = () => {
    if (!addOpenBillContext) return null
    const ctx = addOpenBillContext
    const sessionBookings = bookings.filter((booking) => Number(booking.id) === ctx.sessionId
      || (booking.paymentStatuses ?? []).some((status) => Number(status.bookingId) === ctx.sessionId))
    const peerClientIds = new Set<number>()
    sessionBookings.forEach((booking) => {
      const groupKey = String(booking.bookingGroupKey ?? '').trim()
      if (!groupKey) return
      bookings
        .filter((other) => String(other.bookingGroupKey ?? '').trim() === groupKey)
        .forEach((other) => {
          const peerClientId = other.client?.id
          if (peerClientId) peerClientIds.add(peerClientId)
        })
    })
    const sortedClients = clients.filter((client) => client.active !== false).sort((a, b) => {
      const aPeer = peerClientIds.has(a.id) ? 0 : 1
      const bPeer = peerClientIds.has(b.id) ? 0 : 1
      if (aPeer !== bPeer) return aPeer - bPeer
      return fullName(a).localeCompare(fullName(b))
    })
    const ctxClient = ctx.clientId ? clients.find((c) => c.id === ctx.clientId) ?? null : null
    const filteredCompanyClients = ctx.recipientCompanyId == null
      ? sortedClients
      : sortedClients.filter((client) => client.billingCompany?.id === ctx.recipientCompanyId)
    return (
      <SidePanel
        open
        onClose={() => { if (!creatingAdditionalOpenBill) setAddOpenBillContext(null) }}
        ariaLabel={locale === 'sl' ? 'Dodaj nov račun' : 'Add new bill'}
        size="lg"
      >
        <div className="billing-payee-modal">
          <div className="billing-payee-modal-head">
            <div>
              <h3>{locale === 'sl' ? 'Dodaj nov račun' : 'Add new bill'}</h3>
              <p>{locale === 'sl' ? 'Za isti termin lahko dodate dodatne odprte račune za druge plačnike.' : 'Add an additional open bill for another payee on the same session.'}</p>
            </div>
            <button type="button" className="billing-bill-modal-close" onClick={() => setAddOpenBillContext(null)} aria-label="Close" disabled={creatingAdditionalOpenBill}>×</button>
          </div>
          <div className="booking-type-switcher billing-bill-modal-target-switcher billing-payee-type-switcher" role="group" aria-label={locale === 'sl' ? 'Vrsta plačnika' : 'Payee type'}>
            <button
              type="button"
              className={ctx.billingTarget === 'PERSON' ? 'booking-type-btn active' : 'booking-type-btn'}
              aria-pressed={ctx.billingTarget === 'PERSON'}
              onClick={() => setAddOpenBillContext({ ...ctx, billingTarget: 'PERSON', recipientCompanyId: undefined })}
            >
              {billingCopy.targetPerson}
            </button>
            <button
              type="button"
              className={ctx.billingTarget === 'COMPANY' ? 'booking-type-btn active' : 'booking-type-btn'}
              aria-pressed={ctx.billingTarget === 'COMPANY'}
              onClick={() => setAddOpenBillContext({
                ...ctx,
                billingTarget: 'COMPANY',
                recipientCompanyId: ctx.recipientCompanyId ?? ctxClient?.billingCompany?.id,
              })}
            >
              {billingCopy.targetCompany}
            </button>
          </div>
          <div className="billing-payee-modal-grid">
            {ctx.billingTarget === 'COMPANY' && (
              <Field label={billingCopy.recipientCompany}>
                <DesktopSelect
                  value={ctx.recipientCompanyId ?? ''}
                  onChange={(e) => setAddOpenBillContext({
                    ...ctx,
                    recipientCompanyId: e.target.value === '' ? undefined : Number(e.target.value),
                    clientId: undefined,
                  })}
                >
                  <option value="">{billingCopy.selectCompany}</option>
                  {companies.filter((company) => company.active !== false).map((company) => (
                    <option key={company.id} value={company.id}>{company.name}</option>
                  ))}
                </DesktopSelect>
              </Field>
            )}
            <Field label={ctx.billingTarget === 'COMPANY' ? billingCopy.clientOptional : billingCopy.client}>
              <DesktopSelect
                value={ctx.clientId ?? ''}
                onChange={(e) => setAddOpenBillContext({
                  ...ctx,
                  clientId: e.target.value === '' ? undefined : Number(e.target.value),
                })}
              >
                <option value="">{billingCopy.selectClient}</option>
                {(ctx.billingTarget === 'COMPANY' ? filteredCompanyClients : sortedClients).map((client) => (
                  <option key={client.id} value={client.id}>
                    {fullName(client)}{peerClientIds.has(client.id) ? ` · ${locale === 'sl' ? 'v terminu' : 'in session'}` : ''}
                  </option>
                ))}
              </DesktopSelect>
            </Field>
            <Field label={locale === 'sl' ? 'Zaposleni (opcijsko)' : 'Employee (optional)'}>
              <DesktopSelect
                value={ctx.consultantId ?? ''}
                onChange={(e) => setAddOpenBillContext({
                  ...ctx,
                  consultantId: e.target.value === '' ? undefined : Number(e.target.value),
                })}
              >
                <option value="">{locale === 'sl' ? 'Privzeto: trenutni uporabnik' : 'Default: current user'}</option>
                {(isAdmin ? users : [me]).map((user) => (
                  <option key={user.id} value={user.id}>{fullName(user)}</option>
                ))}
              </DesktopSelect>
            </Field>
          </div>
          <div className="billing-payee-modal-footer">
            <button type="button" className="secondary" onClick={() => setAddOpenBillContext(null)} disabled={creatingAdditionalOpenBill}>
              {locale === 'sl' ? 'Prekliči' : 'Cancel'}
            </button>
            <button
              type="button"
              className="billing-bill-modal-save-btn"
              onClick={() => void submitAdditionalOpenBill()}
              disabled={creatingAdditionalOpenBill || (ctx.billingTarget === 'PERSON' ? !ctx.clientId : !ctx.recipientCompanyId)}
            >
              <span>{creatingAdditionalOpenBill ? (locale === 'sl' ? 'Dodajam…' : 'Adding…') : (locale === 'sl' ? 'Dodaj račun' : 'Add bill')}</span>
            </button>
          </div>
        </div>
      </SidePanel>
    )
  }

  const renderOpenBillPayeeEditorDialog = () => {
    if (editingOpenBillPayeeId == null) return null
    const targetOpenBill = getOpenBillForEditor(editingOpenBillPayeeId)
    if (!targetOpenBill) return null
    const dialogDraft = openBillPayeeDialogDraft?.openBillId === targetOpenBill.id
      ? openBillPayeeDialogDraft
      : null
    if (!dialogDraft) return null
    const draft = dialogDraft.details
    const draftClient = clients.find((client) => client.id === draft.clientId) || null
    const draftCompany = companies.find((company) => company.id === draft.recipientCompanyId) || null
    const draftClientEdit: PayeeClientEditDraft = draftClient
      ? (dialogDraft.clientEdits[draftClient.id] ?? {
        firstName: draftClient.firstName ?? '',
        lastName: draftClient.lastName ?? '',
        email: draftClient.email ?? '',
        phone: draftClient.phone ?? '',
      })
      : { firstName: '', lastName: '', email: '', phone: '' }
    const draftCompanyEdit: PayeeCompanyEditDraft = draftCompany
      ? (dialogDraft.companyEdits[draftCompany.id] ?? {
        name: draftCompany.name ?? '',
        email: draftCompany.email ?? '',
        telephone: draftCompany.telephone ?? '',
        address: draftCompany.address ?? '',
        postalCode: draftCompany.postalCode ?? '',
        city: draftCompany.city ?? '',
        vatId: draftCompany.vatId ?? '',
      })
      : { name: '', email: '', telephone: '', address: '', postalCode: '', city: '', vatId: '' }
    const activeClients = clients.filter((client) => client.active !== false)
    const companyClients = draft.recipientCompanyId == null ? [] : activeClients.filter((client) => client.billingCompany?.id === draft.recipientCompanyId)
    const payeeClientOptions = draft.billingTarget === 'COMPANY'
      ? (
        companyClients.length === 0
          ? activeClients
          : (draftClient && !companyClients.some((client) => client.id === draftClient.id)
            ? [draftClient, ...companyClients]
            : companyClients)
      )
      : activeClients

    const updateDialogDetails = (patch: Partial<OpenBillDetailsDraft>) => {
      setOpenBillPayeeDialogDraft((prev) => prev && prev.openBillId === targetOpenBill.id
        ? { ...prev, details: mergeOpenBillDetailsDraft(prev.details, patch) }
        : prev)
    }

    const updateDialogClientEdit = (client: Client | null | undefined, patch: Partial<PayeeClientEditDraft>) => {
      if (!client) return
      setOpenBillPayeeDialogDraft((prev) => {
        if (!prev || prev.openBillId !== targetOpenBill.id) return prev
        const current = prev.clientEdits[client.id] ?? {
          firstName: client.firstName ?? '',
          lastName: client.lastName ?? '',
          email: client.email ?? '',
          phone: client.phone ?? '',
        }
        return {
          ...prev,
          clientEdits: {
            ...prev.clientEdits,
            [client.id]: { ...current, ...patch },
          },
        }
      })
    }

    const updateDialogCompanyEdit = (company: Company | null | undefined, patch: Partial<PayeeCompanyEditDraft>) => {
      if (!company) return
      setOpenBillPayeeDialogDraft((prev) => {
        if (!prev || prev.openBillId !== targetOpenBill.id) return prev
        const current = prev.companyEdits[company.id] ?? {
          name: company.name ?? '',
          email: company.email ?? '',
          telephone: company.telephone ?? '',
          address: company.address ?? '',
          postalCode: company.postalCode ?? '',
          city: company.city ?? '',
          vatId: company.vatId ?? '',
        }
        return {
          ...prev,
          companyEdits: {
            ...prev.companyEdits,
            [company.id]: { ...current, ...patch },
          },
        }
      })
    }

    const saveOpenBillPayeeDialog = async () => {
      if (savingPayeeEditor) return
      setSavingPayeeEditor(true)
      try {
        const ok = draft.billingTarget === 'COMPANY'
          ? await persistPayeeCompanyEdit(draft.recipientCompanyId, draftCompany ? draftCompanyEdit : undefined)
          : await persistPayeeClientEdit(draft.clientId, draftClient ? draftClientEdit : undefined)
        if (ok) {
          setOpenBillDetailsEdits((prev) => ({ ...prev, [targetOpenBill.id]: { ...draft } }))
          closeOpenBillPayeeEditor()
        }
      } finally {
        setSavingPayeeEditor(false)
      }
    }

    return (
      <SidePanel
        open
        onClose={closeOpenBillPayeeEditor}
        ariaLabel={locale === 'sl' ? 'Uredi plačnika računa' : 'Edit bill payee'}
        size="lg"
      >
        <div className="billing-payee-modal billing-payee-modal--editor">
          <div className="billing-payee-mobile-topbar">
            <button type="button" className="billing-bill-modal-close" onClick={closeOpenBillPayeeEditor} aria-label={locale === 'sl' ? 'Zapri' : 'Close'}>×</button>
            <div className="billing-payee-mobile-topbar-title">{locale === 'sl' ? 'Uredi plačnika računa' : 'Edit bill payee'}</div>
            <button type="button" className="billing-payee-mobile-save" onClick={() => void saveOpenBillPayeeDialog()} disabled={savingPayeeEditor}>{locale === 'sl' ? 'Shrani' : 'Save'}</button>
          </div>
          <div className="billing-payee-modal-head">
            <div>
              <h3>{locale === 'sl' ? 'Uredi plačnika računa' : 'Edit payee for this bill'}</h3>
              <p>{locale === 'sl' ? 'Spremembe veljajo samo za izbrani račun.' : 'Changes apply to this bill only.'}</p>
            </div>
            <button type="button" className="billing-bill-modal-close" onClick={closeOpenBillPayeeEditor} aria-label="Close">×</button>
          </div>
          <div className="booking-type-switcher billing-bill-modal-target-switcher billing-payee-type-switcher" role="group" aria-label={locale === 'sl' ? 'Vrsta plačnika' : 'Payee type'}>
            <button
              type="button"
              className={draft.billingTarget === 'PERSON' ? 'booking-type-btn active' : 'booking-type-btn'}
              aria-pressed={draft.billingTarget === 'PERSON'}
              onClick={() => updateDialogDetails({ billingTarget: 'PERSON' })}
            >
              {billingCopy.targetPerson}
            </button>
            <button
              type="button"
              className={draft.billingTarget === 'COMPANY' ? 'booking-type-btn active' : 'booking-type-btn'}
              aria-pressed={draft.billingTarget === 'COMPANY'}
              onClick={() => updateDialogDetails({
                billingTarget: 'COMPANY',
                recipientCompanyId: draft.recipientCompanyId ?? draftClient?.billingCompany?.id,
              })}
            >
              {billingCopy.targetCompany}
            </button>
          </div>
          <div className="billing-payee-modal-grid">
            {draft.billingTarget === 'COMPANY' ? (
              <>
                <Field label={locale === 'sl' ? 'Prejemnik (podjetje)' : 'Recipient (company)'}>
                  <div className="billing-payee-client-picker-row billing-payee-client-picker-row--search" onClick={(e) => e.stopPropagation()}>
                    <div className="client-picker" style={{ minWidth: 0 }}>
                      <div className={`client-search-wrap${!editingRecipientCompanySearch ? ' client-search-wrap--compact-client' : ''}`}>
                        {editingRecipientCompanySearch ? (
                          <input
                            placeholder={billingCopy.searchCompanyPlaceholder}
                            value={recipientCompanySearch}
                            onChange={(e) => setRecipientCompanySearch(e.target.value)}
                            onFocus={() => setRecipientCompanyPickerOpen(true)}
                          />
                        ) : (
                          <button
                            type="button"
                            className="client-selected-display"
                            onClick={() => {
                              setEditingRecipientCompanySearch(true)
                              setRecipientCompanySearch('')
                              setRecipientCompanyPickerOpen(true)
                            }}
                          >
                            {draftCompany?.name || billingCopy.selectCompany}
                          </button>
                        )}
                        <span className="client-search-icon" aria-hidden>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                        </span>
                      </div>
                      {recipientCompanyPickerOpen && (
                        <div className="client-dropdown-panel">
                          {draftClient?.billingCompany && (
                            <button
                              type="button"
                              className={`client-list-item ${draft.recipientCompanyId === draftClient.billingCompany.id ? 'selected' : ''}`}
                              onClick={() => {
                                updateDialogDetails({ recipientCompanyId: draftClient.billingCompany?.id })
                                setRecipientCompanyPickerOpen(false)
                                setEditingRecipientCompanySearch(false)
                              }}
                            >
                              {`${draftClient.billingCompany.name} ${billingCopy.linkedToClientSuffix}`}
                            </button>
                          )}
                          {visibleRecipientCompanies
                            .filter((company) => !draftClient?.billingCompany || company.id !== draftClient.billingCompany.id)
                            .slice(0, 10)
                            .map((company) => (
                              <button
                                key={company.id}
                                type="button"
                                className={`client-list-item ${draft.recipientCompanyId === company.id ? 'selected' : ''}`}
                                onClick={() => {
                                  updateDialogDetails({ recipientCompanyId: company.id })
                                  setRecipientCompanyPickerOpen(false)
                                  setEditingRecipientCompanySearch(false)
                                }}
                              >
                                {company.name}
                              </button>
                            ))}
                          {visibleRecipientCompanies.length === 0 && <span className="muted">{billingCopy.noCompaniesFound}</span>}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="secondary client-add-btn billing-payee-inline-add-btn"
                      onClick={() => openAddCompanyModal({ mode: 'editOpenBill', openBillId: targetOpenBill.id })}
                      aria-label={locale === 'sl' ? 'Dodaj podjetje' : 'Add company'}
                    >
                      +
                    </button>
                  </div>
                </Field>
                <Field label={locale === 'sl' ? 'Zaposleni (opcijsko)' : 'Employee (optional)'}>
                  <DesktopSelect
                    value={draft.consultantId ?? ''}
                    onChange={(e) => updateDialogDetails({
                      consultantId: e.target.value === '' ? undefined : Number(e.target.value),
                    })}
                  >
                    <option value="">{locale === 'sl' ? 'Privzeto: trenutni uporabnik' : 'Default: current user'}</option>
                    {(isAdmin ? users : [me]).map((user) => (
                      <option key={user.id} value={user.id}>{fullName(user)}</option>
                    ))}
                  </DesktopSelect>
                </Field>
                <Field label={billingCopy.clientOptional}>
                  <DesktopSelect
                    value={draft.clientId ?? ''}
                    onChange={(e) => updateDialogDetails({
                      clientId: e.target.value === '' ? undefined : Number(e.target.value),
                    })}
                  >
                    <option value="">{billingCopy.selectClient}</option>
                    {payeeClientOptions.map((client) => (
                      <option key={client.id} value={client.id}>{fullName(client)}</option>
                    ))}
                  </DesktopSelect>
                </Field>
                <Field label={locale === 'sl' ? 'Podjetje' : 'Company'}>
                  <input value={draftCompanyEdit.name} onChange={(e) => updateDialogCompanyEdit(draftCompany, { name: e.target.value })} disabled={!draftCompany} />
                </Field>
                <Field label={locale === 'sl' ? 'E-pošta' : 'Email'}>
                  <input value={draftCompanyEdit.email} onChange={(e) => updateDialogCompanyEdit(draftCompany, { email: e.target.value })} disabled={!draftCompany} />
                </Field>
                <Field label={locale === 'sl' ? 'Telefon' : 'Phone'}>
                  <input value={draftCompanyEdit.telephone} onChange={(e) => updateDialogCompanyEdit(draftCompany, { telephone: e.target.value })} disabled={!draftCompany} />
                </Field>
                <Field label={locale === 'sl' ? 'Naslov' : 'Address'}>
                  <input value={draftCompanyEdit.address} onChange={(e) => updateDialogCompanyEdit(draftCompany, { address: e.target.value })} disabled={!draftCompany} />
                </Field>
                <Field label={locale === 'sl' ? 'Poštna številka' : 'Postal code'}>
                  <input value={draftCompanyEdit.postalCode} onChange={(e) => updateDialogCompanyEdit(draftCompany, { postalCode: e.target.value })} disabled={!draftCompany} />
                </Field>
                <Field label={locale === 'sl' ? 'Mesto' : 'City'}>
                  <input value={draftCompanyEdit.city} onChange={(e) => updateDialogCompanyEdit(draftCompany, { city: e.target.value })} disabled={!draftCompany} />
                </Field>
                <Field label={locale === 'sl' ? 'Davčna številka' : 'VAT ID'}>
                  <input value={draftCompanyEdit.vatId} onChange={(e) => updateDialogCompanyEdit(draftCompany, { vatId: e.target.value })} disabled={!draftCompany} />
                </Field>
              </>
            ) : (
              <>
                <Field label={locale === 'sl' ? 'Prejemnik' : 'Recipient'}>
                  <div className="billing-payee-client-picker-row">
                    <DesktopSelect
                      value={draft.clientId ?? ''}
                      onChange={(e) => updateDialogDetails({
                        clientId: e.target.value === '' ? undefined : Number(e.target.value),
                      })}
                    >
                      <option value="">{billingCopy.selectClient}</option>
                      {clients.filter((client) => client.active !== false).map((client) => (
                        <option key={client.id} value={client.id}>{fullName(client)}</option>
                      ))}
                    </DesktopSelect>
                    <button
                      type="button"
                      className="secondary client-add-btn billing-payee-inline-add-btn"
                      onClick={() => openAddClientModal({ mode: 'editOpenBill', openBillId: targetOpenBill.id })}
                      aria-label={locale === 'sl' ? 'Dodaj stranko' : 'Add client'}
                    >
                      +
                    </button>
                  </div>
                </Field>
                <Field label={locale === 'sl' ? 'Zaposleni (opcijsko)' : 'Employee (optional)'}>
                  <DesktopSelect
                    value={draft.consultantId ?? ''}
                    onChange={(e) => updateDialogDetails({
                      consultantId: e.target.value === '' ? undefined : Number(e.target.value),
                    })}
                  >
                    <option value="">{locale === 'sl' ? 'Privzeto: trenutni uporabnik' : 'Default: current user'}</option>
                    {(isAdmin ? users : [me]).map((user) => (
                      <option key={user.id} value={user.id}>{fullName(user)}</option>
                    ))}
                  </DesktopSelect>
                </Field>
                <Field label={locale === 'sl' ? 'Ime' : 'First name'}>
                  <input value={draftClientEdit.firstName} onChange={(e) => updateDialogClientEdit(draftClient, { firstName: e.target.value })} disabled={!draftClient} />
                </Field>
                <Field label={locale === 'sl' ? 'Priimek' : 'Last name'}>
                  <input value={draftClientEdit.lastName} onChange={(e) => updateDialogClientEdit(draftClient, { lastName: e.target.value })} disabled={!draftClient} />
                </Field>
                <Field label={locale === 'sl' ? 'E-pošta' : 'Email'}>
                  <input value={draftClientEdit.email} onChange={(e) => updateDialogClientEdit(draftClient, { email: e.target.value })} disabled={!draftClient} />
                </Field>
                <Field label={locale === 'sl' ? 'Telefon' : 'Phone'}>
                  <input value={draftClientEdit.phone} onChange={(e) => updateDialogClientEdit(draftClient, { phone: e.target.value })} disabled={!draftClient} />
                </Field>
              </>
            )}
          </div>
          <div className="billing-payee-modal-footer">
            <button type="button" className="billing-bill-modal-save-btn" onClick={() => void saveOpenBillPayeeDialog()} disabled={savingPayeeEditor}>
              <span>{locale === 'sl' ? 'Shrani' : 'Save'}</span>
            </button>
          </div>
        </div>
      </SidePanel>
    )
  }
  const posCatalogCategoryForService = (service: BillingService): PosCatalogTab => {
    const value = `${service.code || ''} ${service.description || ''}`.toLocaleLowerCase()
    if (/(daril|gift|voucher|vrednost|value|boni?|darilni|bon za|gift card)/i.test(value)) return 'giftCards'
    if (/(ugod|membership|član|clan|članarina|clanarina|meseč|mesec|karta|paket|obisk|ticket|pass|dostop|tečaj|tecaj|course|access|subscription)/i.test(value)) return 'benefits'
    return 'services'
  }

  const posCatalogTabLabel = (tab: PosCatalogTab) => {
    if (locale === 'sl') {
      if (tab === 'services') return 'Storitve'
      if (tab === 'benefits') return 'Ugodnosti'
      return 'Boni'
    }
    if (tab === 'services') return 'Services'
    if (tab === 'benefits') return 'Benefits'
    return 'Gift cards'
  }

  const isGiftCardGuestProduct = (product: BillingGuestProduct) => String(product.productType || '').toUpperCase() === 'GIFT_CARD'

  const guestProductAvailableAtLocation = (product: BillingGuestProduct, locationId?: number | null) => {
    if (!locationId) return true
    if (product.availableAllLocations !== false) return true
    return Array.isArray(product.locationIds) && product.locationIds.map(Number).includes(Number(locationId))
  }

  const posCatalogRows = (
    catalogServices: BillingCatalogService[],
    catalogProducts: BillingGuestProduct[],
    activeLocationId?: number | null,
    billType?: BillDocumentType | string | null,
  ) => {
    const normalizedQuery = posCatalogQuery.trim().toLocaleLowerCase()
    if (posCatalogTab === 'services') {
      const rows = catalogServices
      if (!normalizedQuery) return { services: rows, products: [] as BillingGuestProduct[] }
      return {
        services: rows.filter((service) => `${service.displayName || ''} ${service.secondaryText || ''}`.toLocaleLowerCase().includes(normalizedQuery)),
        products: [] as BillingGuestProduct[],
      }
    }
    const rows = catalogProducts.filter((product) => (
      posCatalogTab === 'giftCards' ? isGiftCardGuestProduct(product) : !isGiftCardGuestProduct(product)
    ) && guestProductAvailableAtLocation(product, activeLocationId))
    const fallbackRows = rows.length === 0 && String(billType || '').toUpperCase() === 'ADVANCE' && posCatalogTab === 'benefits'
      ? [] as BillingGuestProduct[]
      : rows
    if (!normalizedQuery) return { services: [] as BillingCatalogService[], products: fallbackRows }
    return {
      services: [] as BillingCatalogService[],
      products: fallbackRows.filter((product) => `${product.name || ''} ${guestProductTypeLabel(product)} ${product.transactionServiceCode || ''} ${product.transactionServiceDescription || ''}`.toLocaleLowerCase().includes(normalizedQuery)),
    }
  }

  const posServiceSecondaryText = (service: BillingService | null | undefined, fallback?: string) => {
    if (fallback?.trim()) return fallback.trim()
    const code = String(service?.code || '').trim()
    return code && code.toLocaleLowerCase() !== String(service?.description || '').trim().toLocaleLowerCase() ? code : ''
  }

  const posCreatePayeeLabel = () => {
    if (billForm.billingTarget === 'COMPANY') return selectedRecipientCompany?.name || (locale === 'sl' ? 'Izberi podjetje' : 'Select company')
    return selectedClient ? fullName(selectedClient) : (locale === 'sl' ? 'Išči stranko po imenu, telefonu ali e-pošti …' : 'Search client by name, phone or email …')
  }

  const posOpenBillPayeeLabel = (ob: OpenBill) => {
    const draft = openBillDetailsEdits[ob.id]
    if (draft?.billingTarget === 'COMPANY' && draft.recipientCompanyId) {
      return companies.find((company) => company.id === draft.recipientCompanyId)?.name || (locale === 'sl' ? 'Podjetje' : 'Company')
    }
    if (draft?.billingTarget === 'PERSON' && draft.clientId) {
      const client = clients.find((entry) => entry.id === draft.clientId)
      if (client) return fullName(client)
    }
    return openBillClientLabel(ob)
  }

  const renderPosCatalogRail = () => (
    <nav className="billing-pos-catalog-rail" aria-label={locale === 'sl' ? 'Vrsta postavke' : 'Item type'}>
      {(['services', 'benefits', 'giftCards'] as PosCatalogTab[]).map((tab) => (
        <button
          key={tab}
          type="button"
          className={posCatalogTab === tab ? 'is-active' : ''}
          aria-current={posCatalogTab === tab ? 'page' : undefined}
          onClick={() => { setPosCatalogTab(tab); setPosCatalogQuery('') }}
        >
          <span className="billing-pos-catalog-rail__icon" aria-hidden>
            {tab === 'services' ? (
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M4.5 8.5h15v10h-15zM8 8.5V6.8A2.3 2.3 0 0 1 10.3 4.5h3.4A2.3 2.3 0 0 1 16 6.8v1.7M4.5 12h15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : tab === 'benefits' ? (
              <svg viewBox="0 0 24 24" fill="none">
                <rect x="4" y="6" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.7" />
                <path d="M4 10h16M8 14h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M5 9h14v10H5zM4 9h16V6.5H4zM12 6.5V19M7.4 6.5C6.2 6.5 5.5 5.8 5.5 4.9S6.2 3.4 7.1 3.4c1.8 0 3.2 3.1 4.9 3.1M16.6 6.5c1.2 0 1.9-.7 1.9-1.6s-.7-1.5-1.6-1.5c-1.8 0-3.2 3.1-4.9 3.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
          <span>{posCatalogTabLabel(tab)}</span>
        </button>
      ))}
    </nav>
  )

  const renderPosCatalog = (
    catalogServices: BillingCatalogService[],
    catalogProducts: BillingGuestProduct[],
    onAddService: (service: BillingCatalogService) => void,
    onAddProduct: (product: BillingGuestProduct) => void,
    activeLocationId?: number | null,
    billType?: BillDocumentType | string | null,
  ) => {
    const rows = posCatalogRows(catalogServices, catalogProducts, activeLocationId, billType)
    const placeholder = posCatalogTab === 'services'
      ? (locale === 'sl' ? 'Išči storitve …' : 'Search services …')
      : posCatalogTab === 'benefits'
        ? (locale === 'sl' ? 'Išči ugodnosti …' : 'Search benefits …')
        : (locale === 'sl' ? 'Išči bone …' : 'Search gift cards …')
    return (
      <>
        <div className="billing-pos-tabs billing-pos-tabs--mobile" role="tablist" aria-label={locale === 'sl' ? 'Katalog' : 'Catalog'}>
          {(['services', 'benefits', 'giftCards'] as PosCatalogTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={posCatalogTab === tab}
              className={posCatalogTab === tab ? 'is-active' : ''}
              onClick={() => { setPosCatalogTab(tab); setPosCatalogQuery('') }}
            >
              {posCatalogTabLabel(tab)}
            </button>
          ))}
        </div>
        <input
          className="billing-pos-search"
          value={posCatalogQuery}
          onChange={(event) => setPosCatalogQuery(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
        <div className="billing-pos-catalog-list">
          {posCatalogTab === 'services' ? (rows.services.length > 0 ? rows.services.map((service) => (
            <div key={service.key} className="billing-pos-catalog-row">
              <div className="billing-pos-catalog-copy">
                <strong>{service.displayName}</strong>
                {service.secondaryText && <small>{service.secondaryText}</small>}
              </div>
              <span className="billing-pos-catalog-price">{service.priceGross == null ? '—' : currency(service.priceGross)}</span>
              <button
                type="button"
                className="billing-pos-add-btn"
                onClick={() => onAddService(service)}
                disabled={!service.transactionServiceId || service.priceGross == null}
                aria-label={`${locale === 'sl' ? 'Dodaj' : 'Add'} ${service.displayName}`}
                title={!service.transactionServiceId || service.priceGross == null
                  ? (locale === 'sl' ? 'Storitev nima povezane obračunske postavke ali cene.' : 'This service has no linked billing line or price.')
                  : undefined}
              >
                +
              </button>
            </div>
          )) : (
            <div className="billing-pos-catalog-empty">
              {locale === 'sl' ? 'Ni razpoložljivih postavk.' : 'No items available.'}
            </div>
          )) : (rows.products.length > 0 ? rows.products.map((product) => {
            const legacyTransactionServiceId = Number(product.transactionServiceId || 0)
            const mappedService = services.find((entry) => (
              String(entry.systemSource || '').toUpperCase() === 'GUEST_PRODUCT'
              && String(entry.systemSourceKey || '') === String(product.id)
            )) ?? services.find((entry) => Number(entry.id) === legacyTransactionServiceId)
            const transactionServiceId = Number(mappedService?.id || legacyTransactionServiceId || 0)
            const canAdd = product.active !== false && transactionServiceId > 0 && mappedService != null && mappedService.active !== false
            const price = mappedService ? Number(grossStringFromService(mappedService)) : Number.NaN
            const productDisplayName = product.name || mappedService?.description?.trim() || guestProductTypeLabel(product)
            const productScope = product.serviceGroupName?.trim()
              || (product.sessionTypeNames ?? []).filter(Boolean).join(', ')
              || product.sessionTypeName?.trim()
              || ''
            return (
              <div key={`product-${product.id}`} className="billing-pos-catalog-row">
                <div className="billing-pos-catalog-copy">
                  <strong>{productDisplayName}</strong>
                  <small>{[guestProductTypeLabel(product), productScope].filter(Boolean).join(' · ')}</small>
                </div>
                <span className="billing-pos-catalog-price">{currency(Number.isFinite(price) ? price : 0)}</span>
                <button
                  type="button"
                  className="billing-pos-add-btn"
                  onClick={() => onAddProduct(product)}
                  disabled={!canAdd}
                  aria-label={`${locale === 'sl' ? 'Dodaj' : 'Add'} ${productDisplayName}`}
                  title={!canAdd ? (locale === 'sl' ? 'Ta ugodnost ali bon nima povezane obračunske postavke.' : 'This product or voucher has no linked billing line.') : undefined}
                >
                  +
                </button>
              </div>
            )
          }) : (
            <div className="billing-pos-catalog-empty">
              {locale === 'sl' ? 'Ni razpoložljivih postavk.' : 'No items available.'}
            </div>
          ))}
        </div>
      </>
    )
  }

  const renderPosWholeBillDiscount = (
    draft: DiscountDraft,
    subtotalGross: number,
    items: { quantity: number; grossPrice: string }[],
    onChange: (value: string) => void,
  ) => {
    const percentage = wholeBillPercentNumber(draft)
    const discountGross = calculateDiscountGross(subtotalGross, draft, items)
    return (
      <div className="billing-pos-discount-row">
        <span className="billing-pos-discount-label">{locale === 'sl' ? 'Popust na račun' : 'Invoice discount'}</span>
        <input
          className="billing-pos-discount-slider"
          type="range"
          min="0"
          max="99"
          step="1"
          value={percentage}
          onChange={(event) => onChange(event.target.value)}
          aria-label={locale === 'sl' ? 'Popust na račun v odstotkih' : 'Invoice discount percentage'}
        />
        <label className="billing-pos-percent-input">
          <input
            type="text"
            inputMode="decimal"
            value={String(draft?.wholeBillPercent ?? '')}
            onChange={(event) => {
              let next = event.target.value.replace(',', '.').replace(/[^0-9.]/g, '')
              const firstDot = next.indexOf('.')
              if (firstDot >= 0) next = next.slice(0, firstDot + 1) + next.slice(firstDot + 1).replace(/\./g, '')
              const [wholeRaw = '', decimalRaw = ''] = next.split('.')
              const whole = wholeRaw.slice(0, 2)
              const decimal = decimalRaw.slice(0, 2)
              next = firstDot >= 0 ? `${whole}.${decimal}` : whole
              if (next === '' || next === '.') {
                onChange('')
                return
              }
              const numeric = Number(next)
              if (Number.isFinite(numeric) && numeric > 99) {
                onChange('99')
                return
              }
              onChange(next)
            }}
            onBlur={() => {
              const parsed = Number(String(draft?.wholeBillPercent ?? '').replace(',', '.'))
              if (!Number.isFinite(parsed) || parsed <= 0) {
                onChange('0')
                return
              }
              const clamped = Math.min(99, parsed)
              onChange(String(Number(clamped.toFixed(2))))
            }}
          />
          <span>%</span>
        </label>
        <span className="billing-pos-discount-value">−{currency(discountGross)}</span>
      </div>
    )
  }

  const renderPosTotalsMeta = (
    items: { transactionServiceId: number; quantity: number; netPrice: string; grossPrice: string }[],
    draft: DiscountDraft,
    discountGross: number,
  ) => {
    const discountedItems = applyDiscountToItemsForVat(items, draft)
    const vatRows = vatBreakdownRowsForItems(discountedItems)
    const hasDiscount = discountGross > 0.005
    if (!hasDiscount && vatRows.length === 0) return null
    return (
      <div className="billing-pos-meta-lines">
        {hasDiscount && (
          <div className="billing-pos-meta-row">
            <span>{locale === 'sl' ? 'Popust' : 'Discount'}</span>
            <strong className="is-discount">−{currency(discountGross)}</strong>
          </div>
        )}
        {vatRows.map((row) => (
          <div key={row.key} className="billing-pos-meta-row">
            <span>{row.label}</span>
            <strong>{currency(row.taxTotal)}</strong>
          </div>
        ))}
      </div>
    )
  }

  const renderPosCreatePaymentMethods = (
    totalGross: number,
    items: { transactionServiceId: number; quantity: number; netPrice: string; grossPrice: string }[],
    draft: DiscountDraft,
    discountGross: number,
  ) => {
    const splits = getCreateBillPaymentSplits(totalGross)
    const methods = createAvailablePaymentMethods
    const totalPaid = Number(splits.reduce((sum, split) => sum + paymentSplitEffectiveGross(split), 0).toFixed(2))
    const remaining = Number((totalGross - totalPaid).toFixed(2))
    const primarySplit = splits.find((split) => !isAdvancePaymentSplit(split)) ?? splits[0] ?? null
    const setPrimaryMethod = (method: PaymentMethod) => {
      const target = primarySplit
      if (!target) {
        const key = `create-${Date.now()}-${Math.random().toString(36).slice(2)}`
        const nextSplit: OpenBillPaymentSplitDraft = {
          key,
          paymentMethodId: method.id,
          amountGross: formatPaymentAmountInput(Math.max(0, totalGross)),
        }
        setCreateBillPaymentSplits([nextSplit])
        if (isDepositPaymentMethod(method)) window.setTimeout(() => openAdvancePaymentModalForCreate(key), 0)
        return
      }
      const selections = isDepositPaymentMethod(method) ? getAdvanceSelectionsForSplit(target) : []
      updateCreateBillPaymentSplit(target.key, {
        paymentMethodId: method.id,
        amountGross: isDepositPaymentMethod(method) ? formatPaymentAmountInput(sumAdvanceSelectionGross(selections)) : target.amountGross,
        advanceSelections: selections,
      })
      if (isDepositPaymentMethod(method)) openAdvancePaymentModalForCreate(target.key)
    }
    const equalizeRemaining = (splitKey?: string) => {
      if (!splits.length || Math.abs(remaining) <= 0.01) return
      const target = splitKey ? splits.find((entry) => entry.key === splitKey) : splits[splits.length - 1]
      if (!target || isAdvancePaymentSplit(target)) return
      const nextValue = Number((Number(target.amountGross || 0) + remaining).toFixed(2))
      updateCreateBillPaymentSplit(target.key, { amountGross: formatPaymentAmountInput(Math.max(0, nextValue)) })
    }
    return (
      <section className="billing-pos-payment-section">
        <h3 className="billing-pos-section-heading"><span className="billing-pos-section-icon">{billingPosSectionIcon('payment')}</span><span>{locale === 'sl' ? 'Načini plačila' : 'Payment methods'}</span></h3>
        <div className="billing-pos-method-chips">
          {methods.slice(0, 5).map((method) => {
            const selected = primarySplit?.paymentMethodId === method.id
            return (
              <button key={method.id} type="button" className={selected ? 'is-selected' : ''} onClick={() => setPrimaryMethod(method)}>
                {paymentMethodChipContent(method, locale)}
              </button>
            )
          })}
        </div>
        <div className="billing-pos-payment-list">
          {splits.map((split) => {
            const selectedMethod = paymentMethods.find((method) => method.id === split.paymentMethodId) || null
            const isAdvanceSplit = isAdvancePaymentSplit(split)
            const displayedAmountGross = isAdvanceSplit ? formatPaymentAmountInput(sumAdvanceSelectionGross(getAdvanceSelectionsForSplit(split))) : split.amountGross
            const methodOptions = selectedMethod && !methods.some((entry) => entry.id === selectedMethod.id) ? [...methods, selectedMethod] : methods
            return (
              <div key={split.key} className="billing-pos-payment-row">
                <select
                  value={split.paymentMethodId ?? ''}
                  onChange={(event) => {
                    const paymentMethodId = Number(event.target.value)
                    const nextMethod = paymentMethods.find((method) => method.id === paymentMethodId) || null
                    const selections = isDepositPaymentMethod(nextMethod) ? getAdvanceSelectionsForSplit(split) : []
                    updateCreateBillPaymentSplit(split.key, {
                      paymentMethodId,
                      amountGross: isDepositPaymentMethod(nextMethod) ? formatPaymentAmountInput(sumAdvanceSelectionGross(selections)) : split.amountGross,
                      advanceSelections: selections,
                    })
                    if (isDepositPaymentMethod(nextMethod)) openAdvancePaymentModalForCreate(split.key)
                  }}
                >
                  {methodOptions.map((method) => <option key={method.id} value={method.id}>{localizedPaymentMethodName(method, locale)}</option>)}
                </select>
                <div className="billing-pos-payment-amount-wrap">
                  <label className="billing-pos-money-input"><span>€</span><input
                    value={displayedAmountGross}
                    readOnly={isAdvanceSplit}
                    onClick={() => { if (isAdvanceSplit) openAdvancePaymentModalForCreate(split.key) }}
                    onChange={(event) => { if (!isAdvanceSplit) updateCreateBillPaymentSplit(split.key, { amountGross: event.target.value.replace(/[^0-9.,-]/g, '').replace(',', '.') }) }}
                    onBlur={() => { if (!isAdvanceSplit) updateCreateBillPaymentSplit(split.key, { amountGross: formatPaymentAmountInput(Number(split.amountGross || 0)) }) }}
                  /></label>
                  <button
                    type="button"
                    className="billing-pos-equalize-btn"
                    onClick={() => equalizeRemaining(split.key)}
                    disabled={isAdvanceSplit || Math.abs(remaining) <= 0.01}
                    aria-label={locale === 'sl' ? 'Poravnaj do 0' : 'Equalize to 0'}
                    title={locale === 'sl' ? 'Poravnaj do 0' : 'Equalize to 0'}
                  >
                    <span className="billing-pos-equalize-icon">{equalizeToZeroIcon()}</span>
                    <span className="billing-pos-equalize-text">{locale === 'sl' ? 'Poravnaj do 0' : 'Equalize to 0'}</span>
                  </button>
                </div>
                <button type="button" className="billing-pos-remove-payment" onClick={() => removeCreateBillPaymentSplit(split.key)} aria-label={locale === 'sl' ? 'Odstrani način plačila' : 'Remove payment method'}>×</button>
              </div>
            )
          })}
          <button type="button" className="billing-pos-add-payment" disabled={methods.length === 0} onClick={() => addCreateBillPaymentSplit(totalGross)}>+ {locale === 'sl' ? 'Dodaj način plačila' : 'Add payment method'}</button>
        </div>
        <h3 className="billing-pos-summary-title billing-pos-section-heading"><span className="billing-pos-section-icon">{billingPosSectionIcon('summary')}</span><span>{locale === 'sl' ? 'Povzetek računa' : 'Invoice summary'}</span></h3>
        {renderPosTotalsMeta(items, draft, discountGross)}
        <div className="billing-pos-payment-totals">
          <div><span>{locale === 'sl' ? 'Skupaj plačano' : 'Total paid'}</span><strong className={Math.abs(remaining) <= 0.01 ? 'is-complete' : ''}>{currency(totalPaid)}</strong></div>
          <div><span>{locale === 'sl' ? 'Preostalo za plačilo' : 'Remaining to pay'}</span><strong>{currency(Math.max(0, remaining))}</strong></div>
        </div>
      </section>
    )
  }


  const renderPosOpenPaymentMethods = (
    ob: OpenBill,
    totalGross: number,
    items: { transactionServiceId: number; quantity: number; netPrice: string; grossPrice: string }[],
    draft: DiscountDraft,
    discountGross: number,
  ) => {
    const splits = getOpenBillPaymentSplits(ob, totalGross)
    const effectiveType = resolveOpenBillEffectiveType(ob)
    const methods = effectiveType === 'ADVANCE' ? visiblePaymentMethods.filter((method) => !isDepositPaymentMethod(method)) : visiblePaymentMethods
    const totalPaid = Number(splits.reduce((sum, split) => sum + paymentSplitEffectiveGross(split), 0).toFixed(2))
    const remaining = Number((totalGross - totalPaid).toFixed(2))
    const primarySplit = splits.find((split) => !isEntitlementPaymentSplit(split) && !isAdvancePaymentSplit(split)) ?? splits.find((split) => !isEntitlementPaymentSplit(split)) ?? null
    const setPrimaryMethod = (method: PaymentMethod) => {
      const target = primarySplit
      if (!target) {
        const key = `new-${Date.now()}-${Math.random().toString(36).slice(2)}`
        const nextSplit: OpenBillPaymentSplitDraft = {
          key,
          paymentMethodId: method.id,
          amountGross: formatPaymentAmountInput(Math.max(0, totalGross)),
        }
        setOpenBillPaymentSplits(ob, [...splits, nextSplit])
        if (isDepositPaymentMethod(method)) window.setTimeout(() => openAdvancePaymentModalForOpenBill(ob, key), 0)
        return
      }
      const selections = isDepositPaymentMethod(method) ? getAdvanceSelectionsForSplit(target) : []
      updateOpenBillPaymentSplit(ob, target.key, {
        paymentMethodId: method.id,
        amountGross: isDepositPaymentMethod(method) ? formatPaymentAmountInput(sumAdvanceSelectionGross(selections)) : target.amountGross,
        advanceSelections: selections,
      })
      if (isDepositPaymentMethod(method)) openAdvancePaymentModalForOpenBill(ob, target.key)
    }
    const equalizeRemaining = (splitKey?: string) => {
      if (!splits.length || Math.abs(remaining) <= 0.01) return
      const target = splitKey ? splits.find((entry) => entry.key === splitKey) : splits[splits.length - 1]
      if (!target || isEntitlementPaymentSplit(target) || isAdvancePaymentSplit(target)) return
      const nextValue = Number((Number(target.amountGross || 0) + remaining).toFixed(2))
      updateOpenBillPaymentSplit(ob, target.key, { amountGross: formatPaymentAmountInput(Math.max(0, nextValue)) })
    }
    return (
      <section className="billing-pos-payment-section">
        <h3 className="billing-pos-section-heading"><span className="billing-pos-section-icon">{billingPosSectionIcon('payment')}</span><span>{locale === 'sl' ? 'Načini plačila' : 'Payment methods'}</span></h3>
        <div className="billing-pos-method-chips">
          {methods.slice(0, 5).map((method) => {
            const selected = primarySplit?.paymentMethodId === method.id
            return <button key={method.id} type="button" className={selected ? 'is-selected' : ''} onClick={() => setPrimaryMethod(method)}>{paymentMethodChipContent(method, locale)}</button>
          })}
        </div>
        <div className="billing-pos-payment-list">
          {splits.map((split) => {
            const selectedMethod = paymentMethods.find((method) => method.id === split.paymentMethodId) || null
            const isEntitlement = isEntitlementPaymentSplit(split)
            const isAdvanceSplit = isAdvancePaymentSplit(split)
            const displayedAmountGross = isAdvanceSplit ? formatPaymentAmountInput(sumAdvanceSelectionGross(getAdvanceSelectionsForSplit(split))) : split.amountGross
            const methodOptions = selectedMethod && !methods.some((entry) => entry.id === selectedMethod.id) ? [...methods, selectedMethod] : methods
            return (
              <div key={split.key} className="billing-pos-payment-row">
                {isEntitlement ? <span className="billing-pos-entitlement-label">{locale === 'sl' ? 'Ugodnost' : 'Entitlement'}</span> : <select
                  value={split.paymentMethodId ?? ''}
                  onChange={(event) => {
                    const paymentMethodId = Number(event.target.value)
                    const nextMethod = paymentMethods.find((method) => method.id === paymentMethodId) || null
                    const selections = isDepositPaymentMethod(nextMethod) ? getAdvanceSelectionsForSplit(split) : []
                    updateOpenBillPaymentSplit(ob, split.key, {
                      paymentMethodId,
                      amountGross: isDepositPaymentMethod(nextMethod) ? formatPaymentAmountInput(sumAdvanceSelectionGross(selections)) : split.amountGross,
                      advanceSelections: selections,
                    })
                    if (isDepositPaymentMethod(nextMethod)) openAdvancePaymentModalForOpenBill(ob, split.key)
                  }}
                >
                  {methodOptions.map((method) => <option key={method.id} value={method.id}>{localizedPaymentMethodName(method, locale)}</option>)}
                </select>}
                <div className="billing-pos-payment-amount-wrap">
                  <label className="billing-pos-money-input"><span>€</span><input
                    value={displayedAmountGross}
                    readOnly={isEntitlement || isAdvanceSplit}
                    onClick={() => { if (isAdvanceSplit) openAdvancePaymentModalForOpenBill(ob, split.key) }}
                    onChange={(event) => { if (!isEntitlement && !isAdvanceSplit) updateOpenBillPaymentSplit(ob, split.key, { amountGross: event.target.value.replace(/[^0-9.,-]/g, '').replace(',', '.') }) }}
                    onBlur={() => { if (!isEntitlement && !isAdvanceSplit) updateOpenBillPaymentSplit(ob, split.key, { amountGross: formatPaymentAmountInput(Number(split.amountGross || 0)) }) }}
                  /></label>
                  <button
                    type="button"
                    className="billing-pos-equalize-btn"
                    onClick={() => equalizeRemaining(split.key)}
                    disabled={isEntitlement || isAdvanceSplit || Math.abs(remaining) <= 0.01}
                    aria-label={locale === 'sl' ? 'Poravnaj do 0' : 'Equalize to 0'}
                    title={locale === 'sl' ? 'Poravnaj do 0' : 'Equalize to 0'}
                  >
                    <span className="billing-pos-equalize-icon">{equalizeToZeroIcon()}</span>
                    <span className="billing-pos-equalize-text">{locale === 'sl' ? 'Poravnaj do 0' : 'Equalize to 0'}</span>
                  </button>
                </div>
                <button type="button" className="billing-pos-remove-payment" disabled={isEntitlement} onClick={() => removeOpenBillPaymentSplit(ob, split.key)} aria-label={locale === 'sl' ? 'Odstrani način plačila' : 'Remove payment method'}>×</button>
              </div>
            )
          })}
          <button type="button" className="billing-pos-add-payment" disabled={methods.length === 0} onClick={() => addOpenBillPaymentSplit(ob, totalGross)}>+ {locale === 'sl' ? 'Dodaj način plačila' : 'Add payment method'}</button>
        </div>
        <h3 className="billing-pos-summary-title billing-pos-section-heading"><span className="billing-pos-section-icon">{billingPosSectionIcon('summary')}</span><span>{locale === 'sl' ? 'Povzetek računa' : 'Invoice summary'}</span></h3>
        {renderPosTotalsMeta(items, draft, discountGross)}
        <div className="billing-pos-payment-totals">
          <div><span>{locale === 'sl' ? 'Skupaj plačano' : 'Total paid'}</span><strong className={Math.abs(remaining) <= 0.01 ? 'is-complete' : ''}>{currency(totalPaid)}</strong></div>
          <div><span>{locale === 'sl' ? 'Preostalo za plačilo' : 'Remaining to pay'}</span><strong>{currency(Math.max(0, remaining))}</strong></div>
        </div>
      </section>
    )
  }


  const renderPosCreateSelectedItems = (showButtonStyle: boolean) => {
    const lineStates = calculateDiscountedLineStates(billForm.items, createBillDiscountDraft)
    const consultant = users.find((entry) => entry.id === billForm.consultantId) || me
    const consultantLabel = consultant ? fullName(consultant) : ''
    return (
      <div className="billing-pos-selected-box">
        {billForm.items.length > 0 ? billForm.items.map((item, index) => {
          const service = services.find((entry) => entry.id === item.transactionServiceId)
          const catalogService = billForm.billType === 'INVOICE' ? invoiceCatalogServiceByTransactionId.get(item.transactionServiceId) : undefined
          const lineDraft = getLineItemDiscount(createBillDiscountDraft, index)
          const lineDiscountActive = discountValueNumber(lineDraft) > 0
          const lineDiscountOpen = openCreateItemDiscountIndex === index
          const lineTotal = lineStates[index]?.finalGross ?? lineGrossTotal(item)
          const patchLineDiscount = (patch: Partial<LineItemDiscountDraft>) => {
            setBillForm((prev) => {
              const discounts = normalizeItemDiscountMap(prev.itemDiscounts, { keepZero: true })
              const current = discounts[index] ?? { type: 'PERCENT' as DiscountType, value: '0' }
              discounts[index] = { type: patch.type ?? current.type, value: Object.prototype.hasOwnProperty.call(patch, 'value') ? (patch.value ?? '0') : current.value }
              return { ...prev, itemDiscounts: discounts }
            })
          }
          const productMeta = guestProductCatalogMetaByTransactionServiceId.get(item.transactionServiceId)
          return (
            <div key={`${item.transactionServiceId}-${index}`} className="billing-pos-selected-row">
              <div className="billing-pos-selected-copy">
                <strong>{productMeta?.displayName || catalogService?.displayName || (service ? serviceOptionLabel(service) : `#${item.transactionServiceId}`)}</strong>
                {(productMeta?.secondaryText || catalogService?.secondaryText || posServiceSecondaryText(service) || consultantLabel) && <small>{[productMeta?.secondaryText || catalogService?.secondaryText || posServiceSecondaryText(service), consultantLabel].filter(Boolean).join(' · ')}</small>}
              </div>
              <label className="billing-pos-unit-price-input billing-pos-money-input"><span>€</span><input
                value={item.grossPrice ?? ''}
                onChange={(event) => {
                  const nextGross = event.target.value.replace(/[^0-9.,-]/g, '').replace(',', '.')
                  setBillForm((prev) => ({
                    ...prev,
                    items: prev.items.map((row, rowIndex) => rowIndex === index ? { ...row, grossPrice: nextGross, netPrice: String(grossToNet(nextGross || '0', row.transactionServiceId)) } : row),
                  }))
                }}
                onBlur={() => {
                  const normalized = formatPaymentAmountInput(Number(item.grossPrice || 0))
                  setBillForm((prev) => ({
                    ...prev,
                    items: prev.items.map((row, rowIndex) => rowIndex === index ? { ...row, grossPrice: normalized, netPrice: String(grossToNet(normalized, row.transactionServiceId)) } : row),
                  }))
                }}
              /></label>
              <div className="billing-pos-qty">
                <button type="button" onClick={() => setBillForm((prev) => ({ ...prev, items: prev.items.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: Math.max(1, Number(row.quantity || 1) - 1) } : row) }))}>−</button>
                <span className="billing-pos-qty-value">{item.quantity}</span>
                <button type="button" onClick={() => setBillForm((prev) => ({ ...prev, items: prev.items.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: Number(row.quantity || 0) + 1 } : row) }))}>+</button>
              </div>
              <strong className="billing-pos-line-total">{currency(lineTotal)}</strong>
              <div className={`billing-pos-line-actions${showButtonStyle ? '' : ' billing-pos-line-actions--remove-only'}`}>
                {showButtonStyle && (
                  <div className="billing-pos-line-discount">
                    <button
                      type="button"
                      className={`billing-pos-inline-discount-btn${lineDiscountActive ? ' is-active' : ''}`}
                      aria-label={locale === 'sl' ? 'Popust postavke' : 'Line-item discount'}
                      title={locale === 'sl' ? 'Popust postavke' : 'Line-item discount'}
                      onClick={(event) => { event.stopPropagation(); setOpenCreateItemDiscountIndex(lineDiscountOpen ? null : index) }}
                    >
                      {lineDiscountButtonContent(lineDraft)}
                    </button>
                    {lineDiscountOpen && renderItemDiscountPopover(lineDraft, patchLineDiscount, () => setOpenCreateItemDiscountIndex(null))}
                  </div>
                )}
                <button type="button" className="billing-pos-row-remove" aria-label={locale === 'sl' ? 'Odstrani postavko' : 'Remove item'} onClick={() => {
                  const nextItems = billForm.items.filter((_, rowIndex) => rowIndex !== index)
                  setBillForm((prev) => ({ ...prev, items: nextItems, itemDiscounts: shiftedItemDiscountsAfterRemoval(normalizeItemDiscountMap(prev.itemDiscounts, { keepZero: true }), index, nextItems.length), discountItemIndex: clampDiscountIndexAfterRemoval(prev.discountItemIndex, index, nextItems.length) }))
                  if (openCreateItemDiscountIndex === index) setOpenCreateItemDiscountIndex(null)
                }}>×</button>
              </div>
            </div>
          )
        }) : <div className="billing-pos-selected-empty">{locale === 'sl' ? 'Izberite storitev, ugodnost ali bon na levi.' : 'Choose a service, benefit or gift card on the left.'}</div>}
      </div>
    )
  }

  const renderPosOpenSelectedItems = (ob: OpenBill) => {
    const showButtonStyle = resolveOpenBillEffectiveType(ob) !== 'ADVANCE'

    const items = getOpenBillItems(ob)
    const draft = getOpenBillDiscountDraft(ob)
    const lineStates = calculateDiscountedLineStates(items, draft)
    const consultantLabel = ob.consultant ? fullName(ob.consultant) : ''
    return (
      <div className="billing-pos-selected-box">
        {items.length > 0 ? items.map((item, index) => {
          const persistedService = ob.items.find((serverItem) => Number(serverItem.id) === Number(item.openBillItemId))?.transactionService
          const service = services.find((entry) => entry.id === item.transactionServiceId) || persistedService
          const catalogService = resolveOpenBillEffectiveType(ob) === 'INVOICE' ? invoiceCatalogServiceByTransactionId.get(item.transactionServiceId) : undefined
          const lineDraft = getLineItemDiscount(draft, index)
          const lineDiscountActive = discountValueNumber(lineDraft) > 0
          const lineDiscountOpen = openOpenBillItemDiscount?.openBillId === ob.id && openOpenBillItemDiscount.index === index
          const lineTotal = lineStates[index]?.finalGross ?? lineGrossTotal(item)
          const productMeta = guestProductCatalogMetaByTransactionServiceId.get(item.transactionServiceId)
          return (
            <div key={item.openBillItemId || item.clientRowKey || index} className="billing-pos-selected-row">
              <div className="billing-pos-selected-copy"><strong>{productMeta?.displayName || catalogService?.displayName || (service ? serviceOptionLabel(service) : `#${item.transactionServiceId}`)}</strong>{(productMeta?.secondaryText || catalogService?.secondaryText || posServiceSecondaryText(service) || consultantLabel) && <small>{[productMeta?.secondaryText || catalogService?.secondaryText || posServiceSecondaryText(service), consultantLabel].filter(Boolean).join(' · ')}</small>}</div>
              <label className="billing-pos-unit-price-input billing-pos-money-input"><span>€</span><input
                value={item.grossPrice ?? ''}
                onChange={(event) => {
                  const nextGross = event.target.value.replace(/[^0-9.,-]/g, '').replace(',', '.')
                  const next = [...items]
                  next[index] = { ...next[index], grossPrice: nextGross, netPrice: String(grossToNet(nextGross || '0', next[index].transactionServiceId)) }
                  setOpenBillItems(ob, next)
                }}
                onBlur={() => {
                  const normalized = formatPaymentAmountInput(Number(item.grossPrice || 0))
                  const next = [...items]
                  next[index] = { ...next[index], grossPrice: normalized, netPrice: String(grossToNet(normalized, next[index].transactionServiceId)) }
                  setOpenBillItems(ob, next)
                }}
              /></label>
              <div className="billing-pos-qty">
                <button type="button" onClick={() => { const next = [...items]; next[index] = { ...next[index], quantity: Math.max(1, Number(next[index].quantity || 1) - 1) }; setOpenBillItems(ob, next) }}>−</button>
                <span className="billing-pos-qty-value">{item.quantity}</span>
                <button type="button" onClick={() => { const next = [...items]; next[index] = { ...next[index], quantity: Number(next[index].quantity || 0) + 1 }; setOpenBillItems(ob, next) }}>+</button>
              </div>
              <strong className="billing-pos-line-total">{currency(lineTotal)}</strong>
              <div className="billing-pos-line-actions">
                <div className="billing-pos-line-discount">
                  <button
                    type="button"
                    className={`${showButtonStyle ? 'billing-pos-inline-discount-btn ' : ''}${lineDiscountActive ? 'is-active' : ''}`.trim()}
                    aria-label={locale === 'sl' ? 'Popust postavke' : 'Line-item discount'}
                    title={locale === 'sl' ? 'Popust postavke' : 'Line-item discount'}
                    onClick={(event) => { event.stopPropagation(); setOpenOpenBillItemDiscount(lineDiscountOpen ? null : { openBillId: ob.id, index }) }}
                  >
                    {lineDiscountButtonContent(lineDraft)}
                  </button>
                  {lineDiscountOpen && renderItemDiscountPopover(lineDraft, (patch) => setOpenBillItemDiscountDraft(ob, index, patch), () => setOpenOpenBillItemDiscount(null))}
                </div>
                <button type="button" className="billing-pos-row-remove" aria-label={locale === 'sl' ? 'Odstrani postavko' : 'Remove item'} onClick={() => {
                  const nextItems = items.filter((_, rowIndex) => rowIndex !== index)
                  setOpenBillItems(ob, nextItems)
                  setOpenBillDiscountDraft(ob, { itemDiscounts: shiftedItemDiscountsAfterRemoval(draft.itemDiscounts, index, nextItems.length) })
                  if (openOpenBillItemDiscount?.openBillId === ob.id) setOpenOpenBillItemDiscount(null)
                }}>×</button>
              </div>
            </div>
          )
        }) : <div className="billing-pos-selected-empty">{locale === 'sl' ? 'Izberite storitev, ugodnost ali bon na levi.' : 'Choose a service, benefit or gift card on the left.'}</div>}
      </div>
    )
  }

  const renderPosCreateEditor = (isAdvance: boolean) => {
    const subtotalGross = estimateGross(billForm.items)
    const totalGross = payableGrossAfterDiscount(subtotalGross, createBillDiscountDraft, billForm.items)
    const discountGross = calculateDiscountGross(subtotalGross, createBillDiscountDraft, billForm.items)
    const addService = (service: BillingCatalogService) => {
      const transactionServiceId = Number(service.transactionServiceId || 0)
      if (!transactionServiceId || service.priceGross == null) {
        showToast('error', locale === 'sl' ? 'Storitev nima povezane obračunske postavke ali cene.' : 'This service has no linked billing line or price.')
        return
      }
      const unitGrossText = Number(service.priceGross).toFixed(2)
      setBillForm((prev) => {
        const existingIndex = prev.items.findIndex((item) => item.transactionServiceId === transactionServiceId)
        if (existingIndex >= 0) {
          return { ...prev, items: prev.items.map((item, index) => index === existingIndex ? { ...item, quantity: Number(item.quantity || 0) + 1 } : item) }
        }
        return { ...prev, items: [...prev.items, { transactionServiceId, quantity: 1, netPrice: String(grossToNet(unitGrossText, transactionServiceId)), grossPrice: unitGrossText, sourceSessionBookingId: prev.sessionId ?? undefined }] }
      })
    }
    const addProduct = (product: BillingGuestProduct) => {
      const legacyTransactionServiceId = Number(product.transactionServiceId || 0)
      const linkedService = services.find((entry) => (
        String(entry.systemSource || '').toUpperCase() === 'GUEST_PRODUCT'
        && String(entry.systemSourceKey || '') === String(product.id)
      )) ?? services.find((entry) => Number(entry.id) === legacyTransactionServiceId)
      const transactionServiceId = Number(linkedService?.id || legacyTransactionServiceId || 0)
      if (!linkedService || !transactionServiceId) {
        showToast('error', locale === 'sl' ? 'Ta ugodnost ali bon nima povezane obračunske postavke.' : 'This product or voucher has no linked billing line.')
        return
      }
      const quantity = 1
      const unitGrossText = Number(grossStringFromService(linkedService)).toFixed(2)
      setBillForm((prev) => ({
        ...prev,
        items: [...prev.items, {
          transactionServiceId,
          quantity,
          netPrice: String(grossToNet(unitGrossText, transactionServiceId)),
          grossPrice: unitGrossText,
          sourceSessionBookingId: prev.sessionId ?? undefined,
        }],
      }))
    }
    return (
      <div className="billing-pos-layout">
        {renderPosCatalogRail()}
        <section className="billing-pos-catalog-pane">
          {renderPosCatalog(isAdvance ? advanceCatalogServices : invoiceCatalogServices, guestProducts, addService, addProduct, billForm.locationId, isAdvance ? 'ADVANCE' : 'INVOICE')}
        </section>
        <section className="billing-pos-checkout-pane">
          <div className="billing-pos-payee-section">
            <label className="billing-pos-payee-label billing-pos-section-heading"><span className="billing-pos-section-icon">{billingPosSectionIcon('payee')}</span><span>{locale === 'sl' ? 'Plačnik' : 'Payee'}</span></label>
            <button type="button" className="billing-pos-payee-field" onClick={() => setEditingCreateBillPayee(true)}>{posCreatePayeeLabel()}</button>
          </div>
          <h3 className="billing-pos-selected-title billing-pos-section-heading"><span className="billing-pos-section-icon">{billingPosSectionIcon('selected')}</span><span>{locale === 'sl' ? 'Izbrano' : 'Selected'}</span></h3>
          {renderPosCreateSelectedItems(!isAdvance)}
          <div className="billing-pos-subtotal"><span>{locale === 'sl' ? 'Vmesni seštevek' : 'Subtotal'}</span><strong>{currency(subtotalGross)}</strong></div>
          {renderPosWholeBillDiscount(createBillDiscountDraft, subtotalGross, billForm.items, (value) => { setOpenCreateItemDiscountIndex(null); setBillForm((prev) => ({ ...prev, wholeBillDiscountPercent: value, discountType: 'PERCENT', discountValue: value, discountItemIndex: undefined })) })}
          <div className="billing-pos-grand-total"><span>{locale === 'sl' ? 'Skupaj' : 'Total'}</span><strong>{currency(totalGross)}</strong></div>
          {renderPosCreatePaymentMethods(totalGross, billForm.items, createBillDiscountDraft, discountGross)}
        </section>
      </div>
    )
  }

  const renderModernOpenBillEditor = (ob: OpenBill) => {
    const items = getOpenBillItems(ob)
    const discountDraft = getOpenBillDiscountDraft(ob)
    const subtotalGross = estimateGross(items)
    const totalGross = payableGrossAfterDiscount(subtotalGross, discountDraft, items)
    const discountGross = calculateDiscountGross(subtotalGross, discountDraft, items)
    const isAdvanceOpenBill = String(ob.billType || 'INVOICE').toUpperCase() === 'ADVANCE'
    const catalogServices = isAdvanceOpenBill ? advanceCatalogServices : invoiceCatalogServices
    const addService = (service: BillingCatalogService) => {
      const transactionServiceId = Number(service.transactionServiceId || 0)
      if (!transactionServiceId || service.priceGross == null) {
        showToast('error', locale === 'sl' ? 'Storitev nima povezane obračunske postavke ali cene.' : 'This service has no linked billing line or price.')
        return
      }
      const unitGrossText = Number(service.priceGross).toFixed(2)
      const currentItems = getOpenBillItems(ob)
      const existingIndex = currentItems.findIndex((item) => item.transactionServiceId === transactionServiceId && item.sourceAdvanceBillId == null)
      if (existingIndex >= 0) {
        const next = [...currentItems]
        next[existingIndex] = { ...next[existingIndex], quantity: Number(next[existingIndex].quantity || 0) + 1 }
        setOpenBillItems(ob, next)
        return
      }
      setOpenBillItems(ob, [...currentItems, { clientRowKey: createOpenBillClientRowKey(), transactionServiceId, quantity: 1, netPrice: String(grossToNet(unitGrossText, transactionServiceId)), grossPrice: unitGrossText, sourceSessionBookingId: createManualOpenBillLineSourceId() }])
    }
    const addProduct = (product: BillingGuestProduct) => {
      const legacyTransactionServiceId = Number(product.transactionServiceId || 0)
      const linkedService = services.find((entry) => (
        String(entry.systemSource || '').toUpperCase() === 'GUEST_PRODUCT'
        && String(entry.systemSourceKey || '') === String(product.id)
      )) ?? services.find((entry) => Number(entry.id) === legacyTransactionServiceId)
      const transactionServiceId = Number(linkedService?.id || legacyTransactionServiceId || 0)
      if (!linkedService || !transactionServiceId) {
        showToast('error', locale === 'sl' ? 'Ta ugodnost ali bon nima povezane obračunske postavke.' : 'This product or voucher has no linked billing line.')
        return
      }
      const quantity = 1
      const unitGrossText = Number(grossStringFromService(linkedService)).toFixed(2)
      const currentItems = getOpenBillItems(ob)
      setOpenBillItems(ob, [...currentItems, {
        clientRowKey: createOpenBillClientRowKey(),
        transactionServiceId,
        quantity,
        netPrice: String(grossToNet(unitGrossText, transactionServiceId)),
        grossPrice: unitGrossText,
        sourceSessionBookingId: createManualOpenBillLineSourceId(),
      }])
    }
    return (
      <div className="billing-pos-layout">
        {renderPosCatalogRail()}
        <section className="billing-pos-catalog-pane">
          {renderPosCatalog(catalogServices, guestProducts, addService, addProduct, ob.location?.id, ob.billType || 'INVOICE')}
        </section>
        <section className="billing-pos-checkout-pane">
          <div className="billing-pos-payee-section">
            <label className="billing-pos-payee-label billing-pos-section-heading"><span className="billing-pos-section-icon">{billingPosSectionIcon('payee')}</span><span>{locale === 'sl' ? 'Plačnik' : 'Payee'}</span></label>
            <button type="button" className="billing-pos-payee-field" onClick={() => openOpenBillPayeeEditor(ob)}>{posOpenBillPayeeLabel(ob)}</button>
          </div>
          <h3 className="billing-pos-selected-title billing-pos-section-heading"><span className="billing-pos-section-icon">{billingPosSectionIcon('selected')}</span><span>{locale === 'sl' ? 'Izbrano' : 'Selected'}</span></h3>
          {renderPosOpenSelectedItems(ob)}
          <div className="billing-pos-subtotal"><span>{locale === 'sl' ? 'Vmesni seštevek' : 'Subtotal'}</span><strong>{currency(subtotalGross)}</strong></div>
          {renderPosWholeBillDiscount(discountDraft, subtotalGross, items, (value) => { setOpenOpenBillItemDiscount(null); setOpenBillDiscountDraft(ob, { wholeBillPercent: value }) })}
          <div className="billing-pos-grand-total"><span>{locale === 'sl' ? 'Skupaj' : 'Total'}</span><strong>{currency(totalGross)}</strong></div>
          {renderPosOpenPaymentMethods(ob, totalGross, items, discountDraft, discountGross)}
        </section>
      </div>
    )
  }

  const formatOpenBillSession = (sessionInfo?: string) => {
    if (!sessionInfo) return '—'
    const value = String(sessionInfo).trim()
    if (value === MANUAL_OPEN_BILL_BACKEND_LABEL) return billingCopy.manualOpenBillSessionLabel
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/)
    if (!match) return value
    const [, year, month, day, rest] = match
    return `${day}/${month}/${year}${rest || ''}`
  }

  function openBillDescription(ob: OpenBill) {
    const names = getOpenBillItems(ob)
      .map((item) => services.find((service) => service.id === item.transactionServiceId)?.description || '')
      .map((name) => name.trim())
      .filter(Boolean)
    const uniqueNames = Array.from(new Set(names))
    if (uniqueNames.length === 0) return '—'
    return uniqueNames.join(' · ')
  }



  const sendCheckoutLink = async (bill: Bill) => {
    if (creatingCheckoutBillId) return
    setCreatingCheckoutBillId(bill.id)
    try {
      await api.post(`/billing/bills/${bill.id}/checkout-session`)
      if (billBankTransferDueAmount(bill) > 0) {
        showToast('success', 'Bank transfer folio sent to client email. A UPN QR code is included only when all required company payment data is complete.')
      } else {
        showToast('success', 'Payment link sent to client email.')
      }
      await reloadAfterBillingMutation()
    } catch (error: any) {
      if (!showStripeSetupPopupFromError(error) && !showBankTransferQrSettingsPopupFromError(error)) {
        showToast(
          'error',
          readBillingApiMessage(error) || (locale === 'sl' ? 'Navodil za plačilo ni bilo mogoče poslati.' : 'Unable to send payment instructions.'),
        )
      }
    } finally {
      setCreatingCheckoutBillId(null)
    }
  }

  const importBankStatement = async (file?: File | null) => {
    if (!file || importingBankStatement) return
    setImportingBankStatement(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await api.post('/billing/bank-reconciliation/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const matched = Number(data?.matchedCount || 0)
      const unmatched = Number(data?.unmatchedCount || 0)
      const matchedBills = Array.isArray(data?.matchedBills) ? data.matchedBills : []
      const preview = matchedBills.slice(0, 5).map((entry: any) => entry.billNumber).join(', ')
      showToast(
        matched > 0 ? 'success' : 'error',
        matched > 0
          ? `Imported bank statement. Matched ${matched} payment${matched === 1 ? '' : 's'}${preview ? `: ${preview}` : ''}. ${unmatched} row${unmatched === 1 ? '' : 's'} left unmatched.`
          : 'Imported bank statement, but no unpaid folios were matched.',
      )
      await reloadAfterBillingMutation()
    } finally {
      setImportingBankStatement(false)
      if (bankStatementInputRef.current) bankStatementInputRef.current.value = ''
    }
  }

  const markBillPaid = async (bill: Bill) => {
    if (markingPaidBillId) return
    setMarkingPaidBillId(bill.id)
    try {
      await api.post(`/billing/bills/${bill.id}/mark-paid`)
      await reloadAfterBillingMutation()
    } finally {
      setMarkingPaidBillId(null)
    }
  }

  const canRefundBill = (bill: Bill) =>
    canIssueRefundInvoice
    && bill.paymentStatus === 'paid'
    && Number(bill.totalGross || 0) > 0
    && !bill.refundOfBillId
    && normalizeBillType(bill) === 'INVOICE'

  const refundBill = async (bill: Bill) => {
    if (refundingBillId) return
    if (!canIssueRefundInvoice) {
      showToast('error', locale === 'sl' ? 'Nimate dovoljenja za izdajo vračil.' : 'You do not have permission to issue refunds.')
      return
    }
    if (!canRefundBill(bill)) return
    const ok = await confirm({
      title: t('confirmCreateRefund').replace('{name}', bill.billNumber || `#${bill.id}`),
    })
    if (!ok) return
    setRefundingBillId(bill.id)
    try {
      await api.post(`/billing/bills/${bill.id}/refund`)
      showToast('success', 'Refund invoice created.')
      await reloadAfterBillingMutation()
    } finally {
      setRefundingBillId(null)
    }
  }

  const openFiscalLog = async (bill: Bill) => {
    setFiscalLogBill(bill)
    if (!fiscalCashRegisterEnabled) {
      setFiscalLogRows([])
      setFiscalLogRequestBody('')
      setFiscalLogResponseBody('')
      setLoadingFiscalLog(false)
      return
    }
    setLoadingFiscalLog(true)
    setFiscalLogRequestBody('')
    setFiscalLogResponseBody('')
    try {
      const { data } = await api.get(`/fiscal/invoices/${bill.id}/log`)
      const parsed = (() => {
        try {
          const source = typeof data?.logJson === 'string' ? JSON.parse(data.logJson) : data?.logJson
          return Array.isArray(source) ? source : []
        } catch {
          return []
        }
      })()
      setFiscalLogRows(parsed)
      setFiscalLogRequestBody(String(data?.requestBody || ''))
      setFiscalLogResponseBody(String(data?.responseBody || ''))
    } catch {
      setFiscalLogRows([])
      setFiscalLogRequestBody('')
      setFiscalLogResponseBody('')
    } finally {
      setLoadingFiscalLog(false)
    }
  }

  const hydrateFolioBill = async (bill: Bill, tab: 'invoice' | 'fiscal' = 'invoice') => {
    setDetailFolioBill(normalizeBill(bill))
    setFolioPanelTab(fiscalCashRegisterEnabled ? tab : 'invoice')
    await openFiscalLog(bill)
  }

  const openFolioPanel = async (bill: Bill, tab: 'invoice' | 'fiscal' = 'invoice') => {
    await hydrateFolioBill(bill, tab)
    if (!embeddedMode) {
      openDrawer(BILLING_DRAWERS.bill, { params: { id: String(bill.id) }, search: pageSearch })
    }
  }

  const folioHydrateKeyRef = useRef('')
  useEffect(() => {
    if (!billDrawerOpen) {
      folioHydrateKeyRef.current = ''
      return
    }
    const id = Number(drawerId)
    if (!Number.isInteger(id) || id <= 0) return
    if (folioHydrateKeyRef.current === drawerKey) return
    folioHydrateKeyRef.current = drawerKey
    if (detailFolioBill?.id === id) {
      void openFiscalLog(detailFolioBill)
      return
    }
    const existing = bills.find((bill) => Number(bill.id) === id)
    if (existing) {
      void hydrateFolioBill(existing)
      return
    }
    void api.get<Bill>(`/billing/bills/${id}`)
      .then(({ data }) => {
        if (data) void hydrateFolioBill(normalizeBill(data))
        else closeDrawer()
      })
      .catch(() => closeDrawer())
  }, [billDrawerOpen, drawerId, drawerKey])

  useEffect(() => {
    if (!workspaceBillsDrawerOpen) return
    void loadWorkspaceBills()
  }, [workspaceBillsDrawerOpen])

  /** Plain document icon (matches open-bill “create bill” icon, no payment-status badge). */
  const renderPlainFolioPdfIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 17h8M8 13h8" />
    </svg>
  )

  const renderEyeActionIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  )

  const renderPrintActionIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9V3h12v6" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M6 14h12v7H6z" />
    </svg>
  )


  const renderBankStatementImportButton = () => (
    <button
      type="button"
      className="clients-modern-new-btn billing-bank-import-btn"
      onClick={() => bankStatementInputRef.current?.click()}
      disabled={importingBankStatement}
      title={billingCopy.importBankCsv}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3v12" />
        <path d="m7 8 5-5 5 5" />
        <path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
      </svg>
      <span className="billing-fab-label billing-fab-label--desktop">{importingBankStatement ? billingCopy.importBankCsvImporting : billingCopy.importBankCsv}</span>
      <span className="billing-fab-label billing-fab-label--mobile">{importingBankStatement ? (locale === 'sl' ? 'Uvažam…' : 'Importing…') : (locale === 'sl' ? 'Uvozi CSV' : 'Import CSV')}</span>
    </button>
  )

  const billingTabCounts = {
    // Server-paged tabs use the server total whenever their own filters/search are active.
    // The lightweight summary remains the source for untouched/inactive tab totals.
    open: openBillsSearch.trim() ? sortedOpenBills.length : (billingSummary?.openBills ?? sortedOpenBills.length),
    openPayments: openPaymentsSearch.trim()
      ? openPaymentsPageMeta.totalElements
      : (billingSummary?.openPayments ?? openPaymentsPageMeta.totalElements),
    unusedAdvances: unusedAdvancesSearch.trim()
      ? unusedAdvancesPageMeta.totalElements
      : (billingSummary?.unusedAdvances ?? unusedAdvancesPageMeta.totalElements),
    giftCards: (giftCardSearch.trim() || giftCardDateFrom || giftCardDateTo || giftCardStatusFilter !== 'all')
      ? giftCardsPageMeta.totalElements
      : (billingSummary?.giftCards ?? giftCardsPageMeta.totalElements),
    history: (historySearch.trim() || historyDateFrom || historyDateTo || historyStatusFilter !== 'all'
      || (fiscalCashRegisterEnabled && historyFiscalStatusFilter !== 'all') || historyBillTypeFilter !== 'all')
      ? historyPageMeta.totalElements
      : (billingSummary?.history ?? historyPageMeta.totalElements),
  }

  const activeHistoryFilterCount = [
    historyDateFrom,
    historyDateTo,
    historyStatusFilter !== 'all' ? historyStatusFilter : '',
    fiscalCashRegisterEnabled && historyFiscalStatusFilter !== 'all' ? historyFiscalStatusFilter : '',
    historyBillTypeFilter !== 'all' ? historyBillTypeFilter : '',
  ].filter(Boolean).length

  const historyFilterText = {
    title: locale === 'sl' ? 'Filtri' : 'Filters',
    reset: locale === 'sl' ? 'Ponastavi' : 'Reset',
    apply: locale === 'sl' ? 'Uporabi filtre' : 'Apply filters',
    newInvoice: locale === 'sl' ? 'Nov račun' : 'New Invoice',
    from: locale === 'sl' ? 'Datum od' : 'Date from',
    to: locale === 'sl' ? 'Datum do' : 'Date to',
  }

  const historyExportText = {
    button: locale === 'sl' ? 'Izvoz' : 'Export',
    all: locale === 'sl' ? 'Izvozi vse račune' : 'Export all invoices',
    selected: locale === 'sl' ? `Izvozi izbrane račune (${selectedHistoryBillIds.length})` : `Export selected invoices (${selectedHistoryBillIds.length})`,
    asPdf: locale === 'sl' ? 'Kot PDF datoteke (.zip)' : 'As PDF files (.zip)',
    asExcel: locale === 'sl' ? 'Kot Excel tabela (.xls)' : 'As Excel table (.xls)',
    clearSelection: locale === 'sl' ? 'Počisti izbor' : 'Clear selection',
    selectedBar: locale === 'sl' ? `Izbrani ${selectedHistoryBillIds.length} računi` : `${selectedHistoryBillIds.length} invoices selected`,
  }

  const openHistoryFiltersModal = () => {
    setHistoryFilterDraft({
      dateFrom: historyDateFrom,
      dateTo: historyDateTo,
      status: historyStatusFilter,
      fiscalStatus: historyFiscalStatusFilter,
      billType: historyBillTypeFilter,
    })
    setShowHistoryFilters(true)
  }

  const applyHistoryFilters = () => {
    setHistoryDateFrom(historyFilterDraft.dateFrom)
    setHistoryDateTo(historyFilterDraft.dateTo)
    setHistoryStatusFilter(historyFilterDraft.status)
    setHistoryFiscalStatusFilter(historyFilterDraft.fiscalStatus)
    setHistoryBillTypeFilter(historyFilterDraft.billType)
    setShowHistoryFilters(false)
  }

  const resetHistoryFilterDraft = () => {
    setHistoryFilterDraft({
      dateFrom: '',
      dateTo: '',
      status: 'all',
      fiscalStatus: 'all',
      billType: 'all',
    })
  }

  const activeGiftCardFilterCount = [
    giftCardDateFrom,
    giftCardDateTo,
    giftCardStatusFilter !== 'all' ? giftCardStatusFilter : '',
  ].filter(Boolean).length

  const openGiftCardFiltersModal = () => {
    setGiftCardFilterDraft({
      dateFrom: giftCardDateFrom,
      dateTo: giftCardDateTo,
      status: giftCardStatusFilter,
    })
    setShowGiftCardFilters(true)
  }

  const applyGiftCardFilters = () => {
    setGiftCardDateFrom(giftCardFilterDraft.dateFrom)
    setGiftCardDateTo(giftCardFilterDraft.dateTo)
    setGiftCardStatusFilter(giftCardFilterDraft.status)
    setShowGiftCardFilters(false)
  }

  const resetGiftCardFilterDraft = () => {
    setGiftCardFilterDraft({
      dateFrom: '',
      dateTo: '',
      status: 'all',
    })
  }

  const billingSortAriaPrefix = locale === 'sl' ? 'Razvrsti po' : locale === 'sr' ? 'Sortiraj po' : 'Sort by'
  const openBillsSortState: BillingSortState<OpenBillsSortField> = { key: openBillsSortField, direction: openBillsSortDir }
  const historySortState: BillingSortState<HistorySortField> = { key: historySortField, direction: historySortDir }

  const handleOpenBillsSort = (key: OpenBillsSortField) => {
    if (key === openBillsSortField) {
      setOpenBillsSortDir((current) => current === 'asc' ? 'desc' : 'asc')
      return
    }
    setOpenBillsSortField(key)
    setOpenBillsSortDir('asc')
  }

  const handleHistorySort = (key: HistorySortField) => {
    if (key === historySortField) {
      setHistorySortDir((current) => current === 'asc' ? 'desc' : 'asc')
      return
    }
    setHistorySortField(key)
    setHistorySortDir('asc')
  }

  const prefetchBillingTabData = (tab: BillingTab) => {
    if (tab === billingTab) return
    const tasks: Promise<unknown>[] = []

    if (tab === 'open') {
      tasks.push(
        queryClient.prefetchQuery(openBillsQueryOptions<OpenBill>(activeUnitId)),
        queryClient.prefetchQuery(billingServicesQueryOptions<BillingService>(activeUnitId)),
        queryClient.prefetchQuery(paymentMethodsQueryOptions<PaymentMethod>(activeUnitId)),
      )
    } else if (tab === 'openPayments') {
      tasks.push(queryClient.prefetchQuery(billsPageQueryOptions<Bill>(activeUnitId, {
        view: 'openPayments',
        locationId: selectedLocationId,
        search: debouncedOpenPaymentsSearch,
        sortField: openPaymentsSort.key,
        sortDir: openPaymentsSort.key ? openPaymentsSort.direction : 'desc',
        page: Math.max(0, openPaymentsPage - 1),
        size: BILLING_LIST_PAGE_SIZE,
      })))
    } else if (tab === 'history') {
      tasks.push(queryClient.prefetchQuery(billsPageQueryOptions<Bill>(activeUnitId, {
        view: 'history',
        locationId: selectedLocationId,
        search: debouncedHistorySearch,
        dateFrom: historyDateFrom,
        dateTo: historyDateTo,
        paymentStatus: historyStatusFilter,
        fiscalStatus: fiscalCashRegisterEnabled ? historyFiscalStatusFilter : 'all',
        billType: historyBillTypeFilter,
        sortField: historySortField,
        sortDir: historySortDir,
        page: Math.max(0, historyPage - 1),
        size: BILLING_LIST_PAGE_SIZE,
      })))
    } else if (tab === 'unusedAdvances' && advanceBillingEnabled) {
      tasks.push(queryClient.prefetchQuery(unusedAdvancesPageQueryOptions<UnusedAdvance>(activeUnitId, {
        locationId: selectedLocationId,
        search: debouncedUnusedAdvancesSearch,
        sortField: unusedAdvancesSort.key,
        sortDir: unusedAdvancesSort.key ? unusedAdvancesSort.direction : 'desc',
        page: Math.max(0, unusedAdvancesPage - 1),
        size: BILLING_LIST_PAGE_SIZE,
      })))
    } else if (tab === 'giftCards' && giftCardsEnabled) {
      tasks.push(queryClient.prefetchQuery(giftCardsPageQueryOptions<BillingGiftCard>(activeUnitId, {
        locationId: selectedLocationId,
        search: debouncedGiftCardSearch,
        dateFrom: giftCardDateFrom,
        dateTo: giftCardDateTo,
        status: giftCardStatusFilter,
        sortField: giftCardsSort.key,
        sortDir: giftCardsSort.direction,
        page: Math.max(0, giftCardsPage - 1),
        size: BILLING_LIST_PAGE_SIZE,
      })))
    }

    if (tasks.length > 0) void Promise.allSettled(tasks)
  }

  return (
    <div className={overlayOnlyMode ? "stack gap-lg billing-open-bill-editor-only" : "stack gap-lg"}>
      <div className="stack gap-lg billing-page-main-stack" data-onboarding-panel="billing">
          <Card className={`${isOpenBillsMobile ? 'billing-mobile-shell ' : ''}${billingTab === 'open' && isOpenBillsMobile ? 'billing-open-mobile-shell ' : ''}billing-modern-card billing-modern-card--${billingTab}`}>
            <div className="billing-modern-header">
              <div ref={billingTabsRef} className="clients-session-tabs billing-modern-tabs" style={{ marginBottom: 0 }}>
                <button type="button" className={billingTab === 'open' ? 'clients-session-tab active' : 'clients-session-tab'} onPointerEnter={() => prefetchBillingTabData('open')} onFocus={() => prefetchBillingTabData('open')} onClick={() => (embeddedMode ? setBillingTab('open') : selectBillingTab('open'))}>
                  {billingTabIcon('open')}
                  <span className="billing-tab-label billing-tab-label--desktop">{t('billingTabOpenBills')}</span>
                  <span className="billing-tab-label billing-tab-label--mobile">{t('billingTabOpenBills')}</span>
                  <strong className="billing-tab-count">{billingTabCounts.open}</strong>
                </button>
                <button type="button" className={billingTab === 'openPayments' ? 'clients-session-tab active' : 'clients-session-tab'} onPointerEnter={() => prefetchBillingTabData('openPayments')} onFocus={() => prefetchBillingTabData('openPayments')} onClick={() => (embeddedMode ? setBillingTab('openPayments') : selectBillingTab('openPayments'))}>
                  {billingTabIcon('openPayments')}
                  <span className="billing-tab-label billing-tab-label--desktop">{t('billingTabOpenPayments')}</span>
                  <span className="billing-tab-label billing-tab-label--mobile">{locale === 'sl' ? 'Odprta plačila' : 'Payments'}</span>
                  <strong className="billing-tab-count">{billingTabCounts.openPayments}</strong>
                </button>
                {advanceBillingEnabled && (
                  <button type="button" className={billingTab === 'unusedAdvances' ? 'clients-session-tab active' : 'clients-session-tab'} onPointerEnter={() => prefetchBillingTabData('unusedAdvances')} onFocus={() => prefetchBillingTabData('unusedAdvances')} onClick={() => (embeddedMode ? setBillingTab('unusedAdvances') : selectBillingTab('unusedAdvances'))}>
                    {billingTabIcon('unusedAdvances')}
                    <span className="billing-tab-label billing-tab-label--desktop">{t('billingTabUnusedAdvances')}</span>
                    <span className="billing-tab-label billing-tab-label--mobile">{locale === 'sl' ? 'Predplačila' : 'Advances'}</span>
                    <strong className="billing-tab-count">{billingTabCounts.unusedAdvances}</strong>
                  </button>
                )}
                {giftCardsEnabled && (
                  <button type="button" className={billingTab === 'giftCards' ? 'clients-session-tab active' : 'clients-session-tab'} onPointerEnter={() => prefetchBillingTabData('giftCards')} onFocus={() => prefetchBillingTabData('giftCards')} onClick={() => (embeddedMode ? setBillingTab('giftCards') : selectBillingTab('giftCards'))}>
                    {billingTabIcon('giftCards')}
                    <span className="billing-tab-label billing-tab-label--desktop">{t('billingTabGiftCards')}</span>
                    <span className="billing-tab-label billing-tab-label--mobile">{locale === 'sl' ? 'Boni' : 'Vouchers'}</span>
                    <strong className="billing-tab-count">{billingTabCounts.giftCards}</strong>
                  </button>
                )}
                <button type="button" className={billingTab === 'history' ? 'clients-session-tab active' : 'clients-session-tab'} onPointerEnter={() => prefetchBillingTabData('history')} onFocus={() => prefetchBillingTabData('history')} onClick={() => (embeddedMode ? setBillingTab('history') : selectBillingTab('history'))}>
                  {billingTabIcon('history')}
                  <span className="billing-tab-label billing-tab-label--desktop">{t('billingTabFolioHistory')}</span>
                  <span className="billing-tab-label billing-tab-label--mobile">{locale === 'sl' ? 'Zgodovina' : 'History'}</span>
                  <strong className="billing-tab-count">{billingTabCounts.history}</strong>
                </button>
              </div>
            </div>
            <input
              ref={bankStatementInputRef}
              type="file"
              accept=".csv,text/csv,application/vnd.ms-excel,text/plain"
              className="billing-bank-import-input"
              onChange={(e) => { void importBankStatement(e.currentTarget.files?.[0]) }}
            />

            {billingTab === 'open' && (
              <div className="billing-modern-content">
                <div className="billing-modern-filter-row">
                  <div className="billing-modern-search-wrap">
                    <span className="billing-modern-search-icon" aria-hidden>⌕</span>
                    <input
                      className="clients-search-input billing-modern-search"
                      placeholder={isOpenBillsMobile ? (locale === 'sl' ? 'Išči neizdane račune...' : locale === 'sr' ? 'Pretraži neizdate račune...' : 'Search unissued invoices...') : t('billingOpenBillsSearchPlaceholder')}
                      value={openBillsSearch}
                      onChange={(e) => setOpenBillsSearch(e.target.value)}
                    />
                  </div>
                  <div className="billing-mobile-toolbar-sort billing-open-mobile-sort-wrap">
                    <button
                      type="button"
                      className="billing-mobile-inline-sort"
                      aria-haspopup="menu"
                      aria-expanded={openBillsSortMenuOpen}
                      aria-label={billingCopy.sortOpenBillsAria}
                      onClick={() => setOpenBillsSortMenuOpen((prev) => !prev)}
                    >
                      <span>{locale === 'sl' ? 'Bruto' : 'Gross'}</span>
                      <span className="billing-mobile-inline-sort__caret" aria-hidden>▾</span>
                    </button>
                    {openBillsSortMenuOpen ? (
                      <div className="billing-open-mobile-sort-popup billing-open-mobile-sort-popup--toolbar" role="menu" aria-label={billingCopy.sortOpenBillsAria}>
                        {openBillsSortOptions.map((option) => {
                          const active = openBillsSortField === option.field
                          return (
                            <button
                              key={option.field}
                              type="button"
                              role="menuitemradio"
                              aria-checked={active}
                              className={active ? 'billing-open-mobile-sort-option active' : 'billing-open-mobile-sort-option'}
                              onClick={() => {
                                if (active) {
                                  setOpenBillsSortDir((prev) => prev === 'asc' ? 'desc' : 'asc')
                                } else {
                                  setOpenBillsSortField(option.field)
                                  setOpenBillsSortDir(option.field === 'client' ? 'asc' : 'desc')
                                }
                                setOpenBillsSortMenuOpen(false)
                              }}
                            >
                              {option.label}{active ? (openBillsSortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                            </button>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="clients-modern-new-btn"
                    onClick={openCreateBillModal}
                    disabled={!canIssueOpenInvoice}
                    title={!canIssueOpenInvoice ? (locale === 'sl' ? 'Nimate dovoljenja za izdajo odprtih računov.' : 'You do not have permission to issue open invoices.') : undefined}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </svg>
                    <span className="billing-fab-label billing-fab-label--desktop">{locale === 'sl' ? 'Nov račun' : 'New Invoice'}</span>
                    <span className="billing-fab-label billing-fab-label--mobile">{locale === 'sl' ? 'Novo' : 'New'}</span>
                  </button>
                </div>

                <div className="billing-modern-stats billing-modern-stats--two">
                  <div className="billing-modern-stat-card">
                    <span className="billing-modern-stat-icon billing-modern-stat-icon--blue" aria-hidden>▤</span>
                    <div>
                      <span className="billing-modern-stat-label">{t('billingTabOpenBills')}</span>
                      <strong>{sortedOpenBills.length}</strong>
                      <small>{billingCopy.openBillsCount(sortedOpenBills.length)}</small>
                    </div>
                  </div>
                  <div className="billing-modern-stat-card">
                    <span className="billing-modern-stat-icon billing-modern-stat-icon--green" aria-hidden>€</span>
                    <div>
                      <span className="billing-modern-stat-label">{billingCopy.openBillsOutstanding}</span>
                      <strong>{currency(openBillsSummaryGross)}</strong>
                      <small>{locale === 'sl' ? 'Skupaj neporavnano' : 'Total outstanding'}</small>
                    </div>
                  </div>
                </div>

                {sortedOpenBills.length === 0 ? <EmptyState title={t('billingEmptyOpenTitle')} text={t('billingEmptyOpenText')} /> : isOpenBillsMobile ? (
                  <div className="billing-open-modern-mobile-layout">
                    <div className="billing-open-modern-mobile-cards">
                      {sortedOpenBills.map((ob) => {
                        const rowMembers = getOpenBillListGroupMembers(ob)
                        const gross = openBillListGroupGross(ob)
                        const employeeLabel = openBillListGroupEmployeeLabel(ob)
                        const clientLabel = openBillListGroupClientLabel(ob)
                        const rowDescription = Array.from(new Set(rowMembers.map((entry) => openBillDescription(entry)).filter((value) => value && value !== '—'))).join(' · ') || '—'
                        const rawId = String(ob.sessionDisplayId || formatBillingSessionIdDisplay(ob.sessionId) || '—')
                        const displayId = rawId.startsWith('#') ? rawId : `#${rawId}`
                        return (
                          <article
                            key={`${openBillListGroupKey(ob)}:${ob.id}`}
                            className="billing-mobile-bill-card"
                            onClick={() => openEditInvoicePopup(ob)}
                          >
                            <div className="billing-mobile-bill-card__head">
                              <span className="billing-mobile-bill-card__id">{displayId}</span>
                              <strong className="billing-mobile-bill-card__client">{clientLabel}</strong>
                            </div>
                            <div className="billing-mobile-bill-card__details">
                              <div className="billing-mobile-bill-detail">
                                <span className="billing-mobile-bill-detail__icon" aria-hidden>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="3" /><path d="M8 2v4M16 2v4M3 10h18" /></svg>
                                </span>
                                <span>{locale === 'sl' ? 'Seja' : 'Session'}</span>
                                <strong>{formatOpenBillSession(ob.sessionInfo)}</strong>
                              </div>
                              <div className="billing-mobile-bill-detail">
                                <span className="billing-mobile-bill-detail__icon" aria-hidden>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41 11 3H4v7l9.59 9.59a2 2 0 0 0 2.82 0l4.18-4.18a2 2 0 0 0 0-2.82Z" /><path d="M7 7h.01" /></svg>
                                </span>
                                <span>{locale === 'sl' ? 'Storitev' : 'Service'}</span>
                                <strong>{rowDescription}</strong>
                              </div>
                              <div className="billing-mobile-bill-detail">
                                <span className="billing-mobile-bill-detail__icon" aria-hidden>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21a8 8 0 0 0-16 0" /><circle cx="12" cy="7" r="4" /></svg>
                                </span>
                                <span>{locale === 'sl' ? 'Zaposleni' : 'Employee'}</span>
                                <strong>{employeeLabel}</strong>
                              </div>
                              <div className="billing-mobile-bill-detail billing-mobile-bill-detail--amount">
                                <span className="billing-mobile-bill-detail__icon" aria-hidden>€</span>
                                <span>{locale === 'sl' ? 'Odprt znesek' : 'Open amount'}</span>
                                <strong>{currency(gross)}</strong>
                              </div>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className={isBillingMobileOrTablet ? 'billing-clients-table-layout' : 'billing-clients-table-layout clients-modern-card'}>
                  <div className="simple-table-wrap clients-table-wrap clients-table-desktop billing-modern-table-wrap">
                    <table className="clients-table billing-modern-table billing-open-bills-table">
                      <thead>
                        <tr>
                          <BillingSortableTableHeader label={billingCopy.openBillsColSessionId} sortKey="sessionId" sortState={openBillsSortState} onSort={handleOpenBillsSort} sortAriaPrefix={billingSortAriaPrefix} />
                          <BillingSortableTableHeader label={billingCopy.client} sortKey="client" sortState={openBillsSortState} onSort={handleOpenBillsSort} sortAriaPrefix={billingSortAriaPrefix} />
                          <BillingSortableTableHeader label={`${billingCopy.openBillsColSession} / ${locale === 'sl' ? 'Opis' : 'Description'}`} sortKey="session" sortState={openBillsSortState} onSort={handleOpenBillsSort} sortAriaPrefix={billingSortAriaPrefix} />
                          <BillingSortableTableHeader label={locale === 'sl' ? 'Zaposleni' : 'Employee'} sortKey="employee" sortState={openBillsSortState} onSort={handleOpenBillsSort} sortAriaPrefix={billingSortAriaPrefix} />
                          <BillingSortableTableHeader label={locale === 'sl' ? 'Znesek' : 'Amount'} sortKey="gross" sortState={openBillsSortState} onSort={handleOpenBillsSort} sortAriaPrefix={billingSortAriaPrefix} />
                          <th>{locale === 'sl' ? 'Dejanja' : 'Action'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedOpenBills.map((ob) => {
                          const rowMembers = getOpenBillListGroupMembers(ob)
                          const items = rowMembers.flatMap((entry) => getOpenBillItems(entry))
                          const gross = openBillListGroupGross(ob)
                          const employeeLabel = openBillListGroupEmployeeLabel(ob)
                          const clientLabel = openBillListGroupClientLabel(ob)
                          const rowDescription = Array.from(new Set(rowMembers.map((entry) => openBillDescription(entry)).filter((value) => value && value !== '—'))).join(' · ') || '—'
                          const groupBillCount = rowMembers.length
                          return (
                            <tr key={`${openBillListGroupKey(ob)}:${ob.id}`} className="clients-row" onClick={() => openEditInvoicePopup(ob)}>
                              <td className="billing-modern-link-cell">
                                {ob.sessionDisplayId || formatBillingSessionIdDisplay(ob.sessionId)}
                                {groupBillCount > 1 ? <span className="billing-open-batch-chip">{groupBillCount} {locale === 'sl' ? 'računi' : 'bills'}</span> : null}
                                {(ob.sessions?.length ?? 0) > 1 ? <span className="billing-open-batch-chip">{ob.sessions?.length} sessions</span> : null}
                              </td>
                              <td>{clientLabel}</td>
                              <td>
                                <div className="billing-modern-main-text">{formatOpenBillSession(ob.sessionInfo)}</div>
                                <div className="billing-modern-muted">{rowDescription}</div>
                              </td>
                              <td>
                                <div className="billing-modern-employee">
                                  <span className="billing-modern-avatar">{initialsFor(employeeLabel)}</span>
                                  <div>
                                    <div className="billing-modern-main-text">{employeeLabel}</div>
                                    <div className="billing-modern-muted">{locale === 'sl' ? 'Zaposleni' : 'Employee'}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="billing-modern-amount">{currency(gross)}</td>
                              <td className="billing-modern-actions" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  className="billing-open-row-action billing-open-row-action--primary"
                                  onClick={() => openEditInvoicePopup(ob)}
                                  disabled={creatingFromOpenId === ob.id || items.length === 0}
                                >
                                  {creatingFromOpenId === ob.id
                                    ? billingCopy.creating
                                    : (groupBillCount > 1 ? (locale === 'sl' ? 'Uredi račune' : 'Edit bills') : (locale === 'sl' ? 'Uredi račun' : 'Edit invoice'))}
                                </button>
                                <button type="button" className="billing-open-row-action billing-open-row-action--danger" onClick={() => deleteOpenBill(ob)} disabled={deletingOpenId === ob.id || groupBillCount > 1}>
                                  {deletingOpenId === ob.id ? (locale === 'sl' ? 'Brisanje…' : 'Deleting…') : (locale === 'sl' ? 'Izbriši' : 'Delete')}
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                    <div className="clients-modern-table-footer billing-modern-footer">
                      <span>{locale === 'sl' ? `Prikazujem 1 do ${sortedOpenBills.length} od ${sortedOpenBills.length} rezultatov` : `Showing 1 to ${sortedOpenBills.length} of ${sortedOpenBills.length} results`}</span>
                      <div className="clients-modern-pagination" aria-hidden="true">
                        <button type="button" className="secondary">‹</button>
                        <span>1</span>
                        <button type="button" className="secondary">›</button>
                      </div>
                    </div>
                  
                  </div>
                )}
              </div>
            )}

            {billingTab === 'openPayments' && (
              <div className="billing-modern-content">
                <div className="billing-modern-filter-row">
                  <div className="billing-modern-search-wrap">
                    <span className="billing-modern-search-icon" aria-hidden>⌕</span>
                    <input
                      className="clients-search-input billing-modern-search"
                      placeholder={isOpenBillsMobile ? (locale === 'sl' ? 'Išči odprta plačila...' : 'Search open payments...') : (locale === 'sl' ? 'Iskanje po ID naročila, št. računa, plačniku ali znesku ...' : 'Search by order ID, bill number, payer, or amount...')}
                      value={openPaymentsSearch}
                      onChange={(e) => setOpenPaymentsSearch(e.target.value)}
                    />
                  </div>
                  <button type="button" className="billing-mobile-inline-sort" aria-label={locale === 'sl' ? 'Razvrsti po znesku' : 'Sort by amount'}>
                    <span>{locale === 'sl' ? 'Znesek' : 'Amount'}</span>
                    <span className="billing-mobile-inline-sort__caret" aria-hidden>▾</span>
                  </button>
                  {renderBankStatementImportButton()}
                </div>

                {!isOpenBillsMobile && (
                  <div className="billing-modern-stats billing-modern-stats--single">
                    <div className="billing-modern-stat-card">
                      <span className="billing-modern-stat-icon billing-modern-stat-icon--orange" aria-hidden>▧</span>
                      <div>
                        <span className="billing-modern-stat-label">{locale === 'sl' ? 'Čaka na plačilo' : 'Pending Allocation'}</span>
                        <strong>{currency(openPaymentsTotal)}</strong>
                        <small>{openPaymentsPageMeta.totalElements} {locale === 'sl' ? 'plačil' : 'payments'}</small>
                      </div>
                    </div>
                  </div>
                )}

                {openPayments.length === 0 ? <EmptyState title={t('billingTabOpenPayments')} text={locale === 'sl' ? 'Ni odprtih plačil.' : 'No open payments.'} /> : isOpenBillsMobile ? (
                  <div className="billing-mobile-payment-cards">
                    {openPaymentsPagination.slice.map((bill) => {
                      const dueDate = addDays(bill.issueDate, paymentDeadlineDays)
                      const payer = bill.billingTarget === 'COMPANY'
                        ? (bill.recipientCompany?.name || '—')
                        : (bill.client ? fullName(bill.client) : '—')
                      const orderReference = displayInvoiceOrderId(bill)
                      const orderDisplay = orderReference.startsWith('#') ? orderReference : `#${orderReference}`
                      return (
                        <article
                          key={bill.id}
                          className="billing-mobile-payment-card"
                          onClick={() => { void openFolioPanel(bill) }}
                        >
                          <div className="billing-mobile-payment-card__head">
                            <span className="billing-mobile-payment-card__id">{orderDisplay}</span>
                            <strong>{payer}</strong>
                            <button
                              type="button"
                              className="billing-mobile-card-menu"
                              aria-label={locale === 'sl' ? 'Odpri plačilo' : 'Open payment'}
                              onClick={(event) => {
                                event.stopPropagation()
                                void openFolioPanel(bill)
                              }}
                            >
                              <span aria-hidden>•••</span>
                            </button>
                          </div>
                          <div className="billing-mobile-payment-card__grid">
                            <div className="billing-mobile-payment-card__column">
                              <div className="billing-mobile-payment-detail">
                                <span className="billing-mobile-payment-detail__icon" aria-hidden>▣</span>
                                <span>{locale === 'sl' ? 'ID naročila' : 'Order ID'}</span>
                                <strong>{orderReference}</strong>
                              </div>
                              <div className="billing-mobile-payment-detail">
                                <span className="billing-mobile-payment-detail__icon" aria-hidden>◇</span>
                                <span>{locale === 'sl' ? 'Št. računa' : 'Bill No.'}</span>
                                <strong>{bill.billNumber || `BILL-${bill.id}`}</strong>
                              </div>
                              <div className="billing-mobile-payment-detail">
                                <span className="billing-mobile-payment-detail__icon" aria-hidden>♙</span>
                                <span>{locale === 'sl' ? 'Plačnik' : 'Payer'}</span>
                                <strong>{payer}</strong>
                              </div>
                            </div>
                            <div className="billing-mobile-payment-card__column">
                              <div className="billing-mobile-payment-detail">
                                <span className="billing-mobile-payment-detail__icon" aria-hidden>□</span>
                                <span>{locale === 'sl' ? 'Datum' : 'Date'}</span>
                                <strong>{formatBillingMobileDate(bill.issueDate)}</strong>
                              </div>
                              <div className="billing-mobile-payment-detail">
                                <span className="billing-mobile-payment-detail__icon" aria-hidden>□</span>
                                <span>{locale === 'sl' ? 'Rok plačila' : 'Due date'}</span>
                                <strong>{formatBillingMobileDate(dueDate)}</strong>
                              </div>
                              <div className="billing-mobile-payment-detail billing-mobile-payment-detail--amount">
                                <span className="billing-mobile-payment-detail__icon" aria-hidden>€</span>
                                <span>{locale === 'sl' ? 'Znesek' : 'Amount'}</span>
                                <strong>{currency(billBankTransferDueAmount(bill))}</strong>
                              </div>
                            </div>
                          </div>
                          <div className="billing-mobile-payment-card__action" onClick={(event) => event.stopPropagation()}>
                            <button type="button" onClick={() => markBillPaid(bill)} disabled={markingPaidBillId === bill.id}>
                              <span className="billing-mobile-payment-card__action-icon" aria-hidden>✓</span>
                              <span>{markingPaidBillId === bill.id ? (locale === 'sl' ? 'Shranjujem…' : 'Saving…') : (locale === 'sl' ? 'Označi kot plačano' : 'Mark as paid')}</span>
                            </button>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                ) : (
                  <div className={isBillingMobileOrTablet ? 'billing-clients-table-layout' : 'billing-clients-table-layout clients-modern-card'}>
                  <div className="simple-table-wrap clients-table-wrap clients-table-desktop billing-modern-table-wrap">
                    <table className="clients-table billing-modern-table billing-modern-payments-table">
                      <thead>
                        <tr>
                          <BillingSortableTableHeader label={locale === 'sl' ? 'ID naročila' : 'Order ID'} sortKey="orderId" sortState={openPaymentsSort} onSort={(key) => setOpenPaymentsSort((current) => nextBillingSortState(current, key))} sortAriaPrefix={billingSortAriaPrefix} />
                          <BillingSortableTableHeader label={locale === 'sl' ? 'Št. računa' : 'Bill No.'} sortKey="billNumber" sortState={openPaymentsSort} onSort={(key) => setOpenPaymentsSort((current) => nextBillingSortState(current, key))} sortAriaPrefix={billingSortAriaPrefix} />
                          <BillingSortableTableHeader label={locale === 'sl' ? 'Plačnik' : 'Payer'} sortKey="payer" sortState={openPaymentsSort} onSort={(key) => setOpenPaymentsSort((current) => nextBillingSortState(current, key))} sortAriaPrefix={billingSortAriaPrefix} />
                          <BillingSortableTableHeader label={locale === 'sl' ? 'Datum' : 'Date'} sortKey="date" sortState={openPaymentsSort} onSort={(key) => setOpenPaymentsSort((current) => nextBillingSortState(current, key))} sortAriaPrefix={billingSortAriaPrefix} />
                          <BillingSortableTableHeader label={locale === 'sl' ? 'Rok plačila' : 'Due Date'} sortKey="dueDate" sortState={openPaymentsSort} onSort={(key) => setOpenPaymentsSort((current) => nextBillingSortState(current, key))} sortAriaPrefix={billingSortAriaPrefix} />
                          <BillingSortableTableHeader label={locale === 'sl' ? 'Znesek' : 'Amount'} sortKey="amount" sortState={openPaymentsSort} onSort={(key) => setOpenPaymentsSort((current) => nextBillingSortState(current, key))} sortAriaPrefix={billingSortAriaPrefix} />
                          <th>{locale === 'sl' ? 'Dejanja' : 'Action'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {openPaymentsPagination.slice.map((bill) => {
                          const dueDate = addDays(bill.issueDate, paymentDeadlineDays)
                          const dueLabel = relativeDueLabel(dueDate)
                          return (
                            <tr key={bill.id} className="clients-row">
                              <td className="billing-modern-link-cell">{displayInvoiceOrderId(bill)}</td>
                              <td>{bill.billNumber || `BILL-${bill.id}`}</td>
                              <td>{bill.billingTarget === 'COMPANY' ? (bill.recipientCompany?.name || '—') : (bill.client ? fullName(bill.client) : '—')}</td>
                              <td>
                                <div className="billing-modern-main-text">{formatDateShort(bill.issueDate)}</div>
                                <div className="billing-modern-muted">{formatTimeShort(bill.issueDate)}</div>
                              </td>
                              <td>
                                <div className="billing-modern-main-text">{formatDateShort(dueDate)}</div>
                                <div className={dueLabel.toLowerCase().includes('overdue') || dueLabel.toLowerCase().includes('zamude') ? 'billing-modern-overdue' : 'billing-modern-muted'}>{dueLabel}</div>
                              </td>
                              <td className="billing-modern-amount">{currency(billBankTransferDueAmount(bill))}</td>
                              <td className="billing-modern-actions" onClick={(e) => e.stopPropagation()}>
                                <button type="button" className="billing-action-btn billing-action-btn--wide" onClick={() => markBillPaid(bill)} disabled={markingPaidBillId === bill.id}>
                                  {markingPaidBillId === bill.id ? (locale === 'sl' ? 'SHRANJUJEM…' : 'SAVING…') : (locale === 'sl' ? 'OZNAČI KOT PLAČANO' : 'MARK AS PAID')}
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                    <div className="clients-modern-table-footer billing-modern-footer">
                      <span>
                        {locale === 'sl'
                          ? `Prikazujem ${openPaymentsPagination.showFrom} do ${openPaymentsPagination.showTo} od ${openPaymentsPagination.total} rezultatov`
                          : `Showing ${openPaymentsPagination.showFrom} to ${openPaymentsPagination.showTo} of ${openPaymentsPagination.total} results`}
                      </span>
                      <div
                        className="clients-modern-pagination"
                        aria-hidden={openPaymentsPagination.totalPages <= 1}
                        role={openPaymentsPagination.totalPages > 1 ? 'navigation' : undefined}
                        aria-label={openPaymentsPagination.totalPages > 1 ? 'Open payments pages' : undefined}
                      >
                        <button
                          type="button"
                          className="secondary"
                          onClick={openPaymentsPagination.totalPages > 1 ? () => setOpenPaymentsPage((p) => Math.max(1, p - 1)) : undefined}
                          disabled={openPaymentsPagination.totalPages > 1 && openPaymentsPagination.page <= 1}
                        >
                          ‹
                        </button>
                        <span>{openPaymentsPagination.page}</span>
                        <button
                          type="button"
                          className="secondary"
                          onClick={
                            openPaymentsPagination.totalPages > 1
                              ? () => setOpenPaymentsPage((p) => Math.min(openPaymentsPagination.totalPages, p + 1))
                              : undefined
                          }
                          disabled={openPaymentsPagination.totalPages > 1 && openPaymentsPagination.page >= openPaymentsPagination.totalPages}
                        >
                          ›
                        </button>
                      </div>
                    </div>
                  
                  </div>
                )}
              </div>
            )}

            {advanceBillingEnabled && billingTab === 'unusedAdvances' && (
              <div className="billing-modern-content">
                <div className="billing-modern-filter-row">
                  <div className="billing-modern-search-wrap">
                    <span className="billing-modern-search-icon" aria-hidden>⌕</span>
                    <input
                      className="clients-search-input billing-modern-search"
                      placeholder={isOpenBillsMobile ? (locale === 'sl' ? 'Išči predplačila...' : 'Search advances...') : (locale === 'sl' ? 'Iskanje po št. predplačila, stranki, ID seje ali opombah ...' : 'Search by advance no., client, session id, or notes...')}
                      value={unusedAdvancesSearch}
                      onChange={(e) => setUnusedAdvancesSearch(e.target.value)}
                    />
                  </div>
                  <button type="button" className="billing-mobile-inline-sort" aria-label={locale === 'sl' ? 'Razvrsti po stanju' : 'Sort by balance'}>
                    <span>{locale === 'sl' ? 'Stanje' : 'Balance'}</span>
                    <span className="billing-mobile-inline-sort__caret" aria-hidden>▾</span>
                  </button>
                  <button
                    type="button"
                    className="clients-modern-new-btn"
                    onClick={openCreateAdvanceBillModal}
                    disabled={!canIssueAdvanceInvoice}
                    title={!canIssueAdvanceInvoice ? (locale === 'sl' ? 'Nimate dovoljenja za izdajo predplačil.' : 'You do not have permission to issue advance invoices.') : undefined}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </svg>
                    <span className="billing-fab-label billing-fab-label--desktop">{locale === 'sl' ? 'Novo predplačilo' : 'New Advance'}</span>
                    <span className="billing-fab-label billing-fab-label--mobile">{locale === 'sl' ? 'Novo' : 'New'}</span>
                  </button>
                </div>

                {!isOpenBillsMobile && (
                  <div className="billing-modern-stats billing-modern-stats--single billing-modern-stats--center">
                    <div className="billing-modern-stat-card billing-modern-stat-card--compact">
                      <span className="billing-modern-stat-icon billing-modern-stat-icon--blue" aria-hidden>▤</span>
                      <div>
                        <span className="billing-modern-stat-label">{locale === 'sl' ? 'Skupno stanje predplačil' : 'Total Advance Balance'}</span>
                        <strong>{currency(unusedAdvancesTotal)}</strong>
                        <small>{locale === 'sl' ? 'Skupaj neizkoriščena predplačila' : 'Total unused advances'}</small>
                      </div>
                    </div>
                  </div>
                )}

                {filteredUnusedAdvances.length === 0 ? (
                  isOpenBillsMobile ? (
                    <div className="billing-mobile-advances-empty">
                      <span className="billing-mobile-advances-empty__icon" aria-hidden>
                        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M13 23h31a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6H16a7 7 0 0 1-7-7V23a8 8 0 0 1 8-8h23a5 5 0 0 1 5 5v3" />
                          <path d="M42 34h13v12H42a6 6 0 0 1 0-12Z" />
                          <circle cx="47" cy="40" r="1.5" fill="currentColor" stroke="none" />
                        </svg>
                      </span>
                      <h3>{locale === 'sl' ? 'Ni predplačil' : 'No advances'}</h3>
                      <p>{locale === 'sl' ? 'Predplačila se bodo prikazala tukaj.' : 'Advances will appear here.'}</p>
                      <button type="button" onClick={openCreateAdvanceBillModal}>
                        {locale === 'sl' ? 'Dodajte novo predplačilo.' : 'Add a new advance.'}
                      </button>
                    </div>
                  ) : <EmptyState title={t('billingTabUnusedAdvances')} text={billingCopy.unusedAdvancesEmpty} />
                ) : isOpenBillsMobile ? (
                  <div className="billing-mobile-advance-cards">
                    {unusedAdvancesPagination.slice.map((advance) => {
                      const clientLabel = `${advance.client?.firstName || ''} ${advance.client?.lastName || ''}`.trim()
                        || advance.recipientCompany?.name
                        || '—'
                      const advanceNo = String(advance.billNumber || `ADV-${advance.advanceBillId}`)
                      const displayAdvanceNo = advanceNo.startsWith('#') ? advanceNo : `#${advanceNo}`
                      return (
                        <article
                          key={advance.advanceBillId}
                          className={selectedUnusedAdvanceId === advance.advanceBillId ? 'billing-mobile-advance-card is-selected' : 'billing-mobile-advance-card'}
                          onClick={() => setSelectedUnusedAdvanceId(advance.advanceBillId)}
                        >
                          <div className="billing-mobile-advance-card__head">
                            <span>{displayAdvanceNo}</span>
                            <strong>{clientLabel}</strong>
                            <button
                              type="button"
                              className="billing-mobile-card-menu"
                              aria-label={locale === 'sl' ? 'Možnosti predplačila' : 'Advance options'}
                              onClick={(event) => {
                                event.stopPropagation()
                                setSelectedUnusedAdvanceId(advance.advanceBillId)
                              }}
                            >
                              <span aria-hidden>•••</span>
                            </button>
                          </div>
                          <div className="billing-mobile-advance-card__details">
                            <div><span>{locale === 'sl' ? 'ID seje' : 'Session ID'}</span><strong>{formatBillingSessionIdDisplay(advance.sessionId)}</strong></div>
                            <div><span>{locale === 'sl' ? 'Datum izdaje' : 'Issued date'}</span><strong>{formatBillingMobileDate(advance.issueDate)}</strong></div>
                            <div><span>{locale === 'sl' ? 'Prvotni znesek' : 'Original amount'}</span><strong>{currency(advance.totalGross)}</strong></div>
                            <div className="billing-mobile-advance-card__balance"><span>{locale === 'sl' ? 'Preostalo stanje' : 'Remaining balance'}</span><strong>{currency(advance.remainingGross)}</strong></div>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                ) : (
                  <div className={isBillingMobileOrTablet ? 'billing-clients-table-layout' : 'billing-clients-table-layout clients-modern-card'}>
                  <div className="simple-table-wrap clients-table-wrap clients-table-desktop billing-modern-table-wrap">
                    <table className="clients-table billing-modern-table billing-modern-advances-table">
                      <thead>
                        <tr>
                          <BillingSortableTableHeader label={locale === 'sl' ? 'Št. predplačila' : 'Advance No.'} sortKey="advanceNumber" sortState={unusedAdvancesSort} onSort={(key) => setUnusedAdvancesSort((current) => nextBillingSortState(current, key))} sortAriaPrefix={billingSortAriaPrefix} />
                          <BillingSortableTableHeader label={locale === 'sl' ? `${billingCopy.client} / Podjetje` : `${billingCopy.client} / Company`} sortKey="customer" sortState={unusedAdvancesSort} onSort={(key) => setUnusedAdvancesSort((current) => nextBillingSortState(current, key))} sortAriaPrefix={billingSortAriaPrefix} />
                          <BillingSortableTableHeader label={locale === 'sl' ? 'ID seje' : 'Session ID'} sortKey="sessionId" sortState={unusedAdvancesSort} onSort={(key) => setUnusedAdvancesSort((current) => nextBillingSortState(current, key))} sortAriaPrefix={billingSortAriaPrefix} />
                          <BillingSortableTableHeader label={locale === 'sl' ? 'Prvotni znesek' : 'Original Amount'} sortKey="originalAmount" sortState={unusedAdvancesSort} onSort={(key) => setUnusedAdvancesSort((current) => nextBillingSortState(current, key))} sortAriaPrefix={billingSortAriaPrefix} />
                          <BillingSortableTableHeader label={locale === 'sl' ? 'Preostalo stanje' : 'Remaining Balance'} sortKey="remainingAmount" sortState={unusedAdvancesSort} onSort={(key) => setUnusedAdvancesSort((current) => nextBillingSortState(current, key))} sortAriaPrefix={billingSortAriaPrefix} />
                          <BillingSortableTableHeader label={locale === 'sl' ? 'Datum izdaje' : 'Issued Date'} sortKey="date" sortState={unusedAdvancesSort} onSort={(key) => setUnusedAdvancesSort((current) => nextBillingSortState(current, key))} sortAriaPrefix={billingSortAriaPrefix} />
                          <th>{locale === 'sl' ? 'Dejanja' : 'Action'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unusedAdvancesPagination.slice.map((advance) => {
                          const clientLabel = `${advance.client?.firstName || ''} ${advance.client?.lastName || ''}`.trim() || '—'
                          return (
                            <tr key={advance.advanceBillId} className={selectedUnusedAdvanceId === advance.advanceBillId ? 'clients-row selected' : 'clients-row'} onClick={() => setSelectedUnusedAdvanceId(advance.advanceBillId)}>
                              <td className="billing-modern-link-cell">{advance.billNumber}</td>
                              <td>{clientLabel}</td>
                              <td>{formatBillingSessionIdDisplay(advance.sessionId)}</td>
                              <td className="billing-modern-amount">{currency(advance.totalGross)}</td>
                              <td className="billing-modern-amount">{currency(advance.remainingGross)}</td>
                              <td>
                                <div className="billing-modern-main-text">{formatDateShort(advance.issueDate)}</div>
                                <div className="billing-modern-muted">{formatDate(advance.issueDate)}</div>
                              </td>
                              <td className="billing-modern-actions" onClick={(e) => e.stopPropagation()}>
                                <button type="button" className="billing-action-btn" onClick={() => setSelectedUnusedAdvanceId(advance.advanceBillId)}>{locale === 'sl' ? 'Vračilo' : 'Refund'}</button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                    <div className="clients-modern-table-footer billing-modern-footer">
                      <span>
                        {locale === 'sl'
                          ? `Prikazujem ${unusedAdvancesPagination.showFrom} do ${unusedAdvancesPagination.showTo} od ${unusedAdvancesPagination.total} rezultatov`
                          : `Showing ${unusedAdvancesPagination.showFrom} to ${unusedAdvancesPagination.showTo} of ${unusedAdvancesPagination.total} results`}
                      </span>
                      <div
                        className="clients-modern-pagination"
                        aria-hidden={unusedAdvancesPagination.totalPages <= 1}
                        role={unusedAdvancesPagination.totalPages > 1 ? 'navigation' : undefined}
                        aria-label={unusedAdvancesPagination.totalPages > 1 ? 'Unused advances pages' : undefined}
                      >
                        <button
                          type="button"
                          className="secondary"
                          onClick={unusedAdvancesPagination.totalPages > 1 ? () => setUnusedAdvancesPage((p) => Math.max(1, p - 1)) : undefined}
                          disabled={unusedAdvancesPagination.totalPages > 1 && unusedAdvancesPagination.page <= 1}
                        >
                          ‹
                        </button>
                        <span>{unusedAdvancesPagination.page}</span>
                        <button
                          type="button"
                          className="secondary"
                          onClick={
                            unusedAdvancesPagination.totalPages > 1
                              ? () => setUnusedAdvancesPage((p) => Math.min(unusedAdvancesPagination.totalPages, p + 1))
                              : undefined
                          }
                          disabled={unusedAdvancesPagination.totalPages > 1 && unusedAdvancesPagination.page >= unusedAdvancesPagination.totalPages}
                        >
                          ›
                        </button>
                      </div>
                    </div>
                  
                  </div>
                )}
              </div>
            )}

            {giftCardsEnabled && billingTab === 'giftCards' && (
              <div className="billing-modern-content">
                <div className="billing-modern-filter-row billing-modern-filter-row--toolbar">
                  <div className="billing-modern-search-wrap">
                    <span className="billing-modern-search-icon" aria-hidden>⌕</span>
                    <input
                      className="clients-search-input billing-modern-search"
                      placeholder={locale === 'sl' ? 'Išči po kodi kupona, kupcu ali računu …' : 'Search by coupon code, buyer or invoice …'}
                      value={giftCardSearch}
                      onChange={(e) => setGiftCardSearch(e.target.value)}
                    />
                  </div>
                  <div className="billing-modern-toolbar-actions">
                    <button type="button" className="billing-filter-btn" onClick={openGiftCardFiltersModal}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M4 6h16" />
                        <path d="M7 12h10" />
                        <path d="M10 18h4" />
                      </svg>
                      <span>{historyFilterText.title}</span>
                      {activeGiftCardFilterCount > 0 ? <strong className="billing-filter-btn__count">{activeGiftCardFilterCount}</strong> : null}
                    </button>
                  </div>
                </div>

                {!isOpenBillsMobile && (
                  <div className="billing-modern-stats billing-modern-stats--five">
                    <div className="billing-modern-stat-card">
                      <span className="billing-modern-stat-icon billing-modern-stat-icon--green" aria-hidden>🎁</span>
                      <div><span className="billing-modern-stat-label">{locale === 'sl' ? 'Aktivni' : 'Active'}</span><strong>{giftCardStats.active}</strong><small>{locale === 'sl' ? 'Veljavni in neporabljeni boni' : 'Valid unused vouchers'}</small></div>
                    </div>
                    <div className="billing-modern-stat-card">
                      <span className="billing-modern-stat-icon billing-modern-stat-icon--orange" aria-hidden>◔</span>
                      <div><span className="billing-modern-stat-label">{locale === 'sl' ? 'Delno porabljeni' : 'Partially used'}</span><strong>{giftCardStats.partial}</strong><small>{locale === 'sl' ? 'Vrednostni boni z delno porabljenim dobroimetjem' : 'Value vouchers with remaining balance'}</small></div>
                    </div>
                    <div className="billing-modern-stat-card">
                      <span className="billing-modern-stat-icon billing-modern-stat-icon--blue" aria-hidden>✓</span>
                      <div><span className="billing-modern-stat-label">{locale === 'sl' ? 'Porabljeni' : 'Used'}</span><strong>{giftCardStats.used}</strong><small>{locale === 'sl' ? 'Popolnoma izkoriščeni boni' : 'Fully redeemed vouchers'}</small></div>
                    </div>
                    <div className="billing-modern-stat-card">
                      <span className="billing-modern-stat-icon billing-modern-stat-icon--red" aria-hidden>⏱</span>
                      <div><span className="billing-modern-stat-label">{locale === 'sl' ? 'Potekli' : 'Expired'}</span><strong>{giftCardStats.expired}</strong><small>{locale === 'sl' ? 'Boni, ki jim je potekel rok' : 'Expired vouchers'}</small></div>
                    </div>
                    <div className="billing-modern-stat-card">
                      <span className="billing-modern-stat-icon billing-modern-stat-icon--purple" aria-hidden>€</span>
                      <div><span className="billing-modern-stat-label">{locale === 'sl' ? 'Skupna neporabljena vrednost' : 'Unused value'}</span><strong>{currency(giftCardStats.outstanding)}</strong><small>{locale === 'sl' ? 'Preostalo dobroimetje vrednostnih bonov' : 'Remaining value-voucher balance'}</small></div>
                    </div>
                  </div>
                )}

                {sortedGiftCards.length === 0 ? <EmptyState title={t('billingTabGiftCards')} text={locale === 'sl' ? 'Ni izdanih bonov.' : 'No vouchers yet.'} /> : (
                  <div className={isBillingMobileOrTablet ? 'billing-clients-table-layout' : 'billing-clients-table-layout clients-modern-card'}>
                    <div className="simple-table-wrap clients-table-wrap clients-table-desktop billing-modern-table-wrap">
                    <table className="clients-table billing-modern-table billing-modern-gift-cards-table">
                      <thead>
                        <tr>
                          <BillingSortableTableHeader label={locale === 'sl' ? 'ID bona' : 'Voucher ID'} sortKey="id" sortState={giftCardsSort} onSort={(key) => setGiftCardsSort((current) => nextBillingSortState(current, key))} sortAriaPrefix={billingSortAriaPrefix} />
                          <BillingSortableTableHeader label={locale === 'sl' ? 'Koda' : 'Code'} sortKey="code" sortState={giftCardsSort} onSort={(key) => setGiftCardsSort((current) => nextBillingSortState(current, key))} sortAriaPrefix={billingSortAriaPrefix} />
                          <BillingSortableTableHeader label={locale === 'sl' ? 'Vrsta' : 'Type'} sortKey="type" sortState={giftCardsSort} onSort={(key) => setGiftCardsSort((current) => nextBillingSortState(current, key))} sortAriaPrefix={billingSortAriaPrefix} />
                          <BillingSortableTableHeader label={locale === 'sl' ? 'Stranka / Kupec' : 'Client / Buyer'} sortKey="customer" sortState={giftCardsSort} onSort={(key) => setGiftCardsSort((current) => nextBillingSortState(current, key))} sortAriaPrefix={billingSortAriaPrefix} />
                          <BillingSortableTableHeader label={locale === 'sl' ? 'Vsebina' : 'Content'} sortKey="content" sortState={giftCardsSort} onSort={(key) => setGiftCardsSort((current) => nextBillingSortState(current, key))} sortAriaPrefix={billingSortAriaPrefix} />
                          <BillingSortableTableHeader label={locale === 'sl' ? 'Poteče' : 'Expires'} sortKey="expires" sortState={giftCardsSort} onSort={(key) => setGiftCardsSort((current) => nextBillingSortState(current, key))} sortAriaPrefix={billingSortAriaPrefix} />
                          <BillingSortableTableHeader label={locale === 'sl' ? 'Status' : 'Status'} sortKey="status" sortState={giftCardsSort} onSort={(key) => setGiftCardsSort((current) => nextBillingSortState(current, key))} sortAriaPrefix={billingSortAriaPrefix} />
                          <BillingSortableTableHeader label={locale === 'sl' ? 'Račun' : 'Invoice'} sortKey="invoice" sortState={giftCardsSort} onSort={(key) => setGiftCardsSort((current) => nextBillingSortState(current, key))} sortAriaPrefix={billingSortAriaPrefix} />
                          <th>{locale === 'sl' ? 'Dejanja' : 'Actions'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {giftCardsPagination.slice.map((card) => (
                          <tr key={card.id} className="clients-row billing-history-row" onClick={() => openGiftCardPanel(card)}>
                            <td className="billing-modern-link-cell">{card.giftCardNumber || `DB-${card.id}`}</td>
                            <td>{card.code || '—'}</td>
                            <td><span className="billing-status-pill billing-status-pill--not-sent">{voucherTypeLabel(card)}</span></td>
                            <td>
                              <div className="billing-modern-main-text">{card.clientName || '—'}</div>
                              {card.clientEmail ? <div className="billing-modern-muted">{card.clientEmail}</div> : null}
                            </td>
                            <td>
                              <div className="billing-modern-main-text">{voucherContentLabel(card)}</div>
                              {isServiceVoucher(card) && card.productName ? <div className="billing-modern-muted">{card.productName}</div> : null}
                            </td>
                            <td>
                              <div className="billing-modern-main-text">{card.expiresAt ? formatDateShort(card.expiresAt) : '—'}</div>
                              {card.expiresAt ? <div className="billing-modern-muted">{formatDate(card.expiresAt)}</div> : null}
                            </td>
                            <td><span className={`billing-status-pill billing-status-pill--${giftCardStatusClass(card.status)}`}>{giftCardStatusLabel(card.status)}</span></td>
                            <td>{card.billNumber || card.orderReference || '—'}</td>
                            <td className="billing-modern-actions billing-modern-actions--history" onClick={(e) => e.stopPropagation()}>
                              <button type="button" className="billing-action-btn" onClick={() => openGiftCardPanel(card)}>{locale === 'sl' ? 'Poglej' : 'View'}</button>
                              <button type="button" className="billing-action-btn" onClick={() => downloadGiftCardPdf(card)}>{locale === 'sl' ? 'Prenesi PDF' : 'PDF'}</button>
                              <button type="button" className="billing-action-btn" onClick={() => sendGiftCardAgain(card)} disabled={sendingGiftCardId === card.id}>{sendingGiftCardId === card.id ? (locale === 'sl' ? 'Pošiljam…' : 'Sending…') : (locale === 'sl' ? 'Pošlji' : 'Send')}</button>
                              <button type="button" className="billing-action-btn" onClick={() => printGiftCardPdf(card)} disabled={printingGiftCardId === card.id}>{printingGiftCardId === card.id ? (locale === 'sl' ? 'Tiskanje…' : 'Printing…') : (locale === 'sl' ? 'Natisni' : 'Print')}</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                    <div className="clients-modern-table-footer billing-modern-footer">
                      <span>
                        {locale === 'sl'
                          ? `Prikazujem ${giftCardsPagination.showFrom} do ${giftCardsPagination.showTo} od ${giftCardsPagination.total} bonov`
                          : `Showing ${giftCardsPagination.showFrom} to ${giftCardsPagination.showTo} of ${giftCardsPagination.total} vouchers`}
                      </span>
                      <div
                        className="clients-modern-pagination"
                        aria-hidden={giftCardsPagination.totalPages <= 1}
                        role={giftCardsPagination.totalPages > 1 ? 'navigation' : undefined}
                        aria-label={giftCardsPagination.totalPages > 1 ? 'Voucher pages' : undefined}
                      >
                        <button
                          type="button"
                          className="secondary"
                          onClick={giftCardsPagination.totalPages > 1 ? () => setGiftCardsPage((p) => Math.max(1, p - 1)) : undefined}
                          disabled={giftCardsPagination.totalPages > 1 && giftCardsPagination.page <= 1}
                        >
                          ‹
                        </button>
                        <span>{giftCardsPagination.page}</span>
                        <button
                          type="button"
                          className="secondary"
                          onClick={
                            giftCardsPagination.totalPages > 1
                              ? () => setGiftCardsPage((p) => Math.min(giftCardsPagination.totalPages, p + 1))
                              : undefined
                          }
                          disabled={giftCardsPagination.totalPages > 1 && giftCardsPagination.page >= giftCardsPagination.totalPages}
                        >
                          ›
                        </button>
                      </div>
                    </div>
                  
                  </div>
                )}
              </div>
            )}

            {billingTab === 'history' && (
              <div className="billing-modern-content">
                <div className="billing-modern-filter-row billing-modern-filter-row--toolbar">
                  <div className="billing-modern-search-wrap">
                    <span className="billing-modern-search-icon" aria-hidden>⌕</span>
                    <input
                      className="clients-search-input billing-modern-search"
                      placeholder={billingCopy.historySearchPlaceholder}
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                    />
                  </div>
                  <div className="billing-modern-toolbar-actions">
                    <button type="button" className="billing-filter-btn" onClick={openHistoryFiltersModal}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M4 6h16" />
                        <path d="M7 12h10" />
                        <path d="M10 18h4" />
                      </svg>
                      <span>{historyFilterText.title}</span>
                      {activeHistoryFilterCount > 0 ? <strong className="billing-filter-btn__count">{activeHistoryFilterCount}</strong> : null}
                    </button>
                    {(me.units?.length ?? 0) > 1 && isWorkspaceRolloutEnabled(me, 'CONSOLIDATED_BILLING') && (
                      <button
                        type="button"
                        className="billing-filter-btn"
                        onClick={() => void openWorkspaceBillHistory()}
                        disabled={workspaceBillsLoading}
                        title={locale === 'sl' ? 'Prikaži račune vseh dostopnih enot' : 'Show invoices from all accessible units'}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M3 21h18" />
                          <path d="M5 21V7l7-4 7 4v14" />
                          <path d="M9 9h1" />
                          <path d="M14 9h1" />
                          <path d="M9 13h1" />
                          <path d="M14 13h1" />
                        </svg>
                        <span>{workspaceBillsLoading ? (locale === 'sl' ? 'Nalaganje…' : 'Loading…') : (locale === 'sl' ? 'Vse enote' : 'All units')}</span>
                      </button>
                    )}
                    <div className="billing-history-export">
                      <button
                        type="button"
                        className="billing-filter-btn billing-export-btn"
                        onClick={() => setHistoryExportMenuOpen((value) => !value)}
                        disabled={historyPageMeta.totalElements === 0 || exportingHistoryScope != null}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M12 3v12" />
                          <path d="m7 10 5 5 5-5" />
                          <path d="M5 21h14" />
                        </svg>
                        <span>{exportingHistoryScope == null ? historyExportText.button : (locale === 'sl' ? 'Pripravljam…' : 'Preparing…')}</span>
                        <span className={`billing-export-btn__caret${historyExportMenuOpen ? ' is-open' : ''}`} aria-hidden>⌃</span>
                      </button>
                      {historyExportMenuOpen ? (
                        <div className="billing-export-menu" role="menu">
                          <div className="billing-export-menu__section">
                            <button type="button" className="billing-export-menu__headline" onClick={() => downloadHistoryExport('pdf', 'all')} role="menuitem">
                              <span>{historyExportText.all}</span>
                            </button>
                            <button type="button" className="billing-export-menu__item" onClick={() => downloadHistoryExport('pdf', 'all')} role="menuitem">
                              <span className="billing-export-menu__icon" aria-hidden>📄</span>
                              <span className="billing-export-menu__copy">
                                <strong>{historyExportText.asPdf}</strong>
                              </span>
                            </button>
                            <button type="button" className="billing-export-menu__item" onClick={() => downloadHistoryExport('excel', 'all')} role="menuitem">
                              <span className="billing-export-menu__icon" aria-hidden>📊</span>
                              <span className="billing-export-menu__copy">
                                <strong>{historyExportText.asExcel}</strong>
                              </span>
                            </button>
                          </div>
                          <div className="billing-export-menu__divider" />
                          <div className="billing-export-menu__section">
                            <button type="button" className="billing-export-menu__headline" disabled={selectedHistoryBillIds.length === 0} onClick={() => downloadHistoryExport('pdf', 'selected')} role="menuitem">
                              <span>{historyExportText.selected}</span>
                            </button>
                            <button type="button" className="billing-export-menu__item" disabled={selectedHistoryBillIds.length === 0} onClick={() => downloadHistoryExport('pdf', 'selected')} role="menuitem">
                              <span className="billing-export-menu__icon" aria-hidden>📄</span>
                              <span className="billing-export-menu__copy">
                                <strong>{historyExportText.asPdf}</strong>
                              </span>
                            </button>
                            <button type="button" className="billing-export-menu__item" disabled={selectedHistoryBillIds.length === 0} onClick={() => downloadHistoryExport('excel', 'selected')} role="menuitem">
                              <span className="billing-export-menu__icon" aria-hidden>📊</span>
                              <span className="billing-export-menu__copy">
                                <strong>{historyExportText.asExcel}</strong>
                              </span>
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="clients-modern-new-btn billing-history-new-btn"
                      onClick={openCreateBillModal}
                      disabled={!canIssueOpenInvoice}
                      title={!canIssueOpenInvoice ? (locale === 'sl' ? 'Nimate dovoljenja za izdajo odprtih računov.' : 'You do not have permission to issue open invoices.') : undefined}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M12 5v14" />
                        <path d="M5 12h14" />
                      </svg>
                      <span className="billing-fab-label billing-fab-label--desktop">{historyFilterText.newInvoice}</span>
                      <span className="billing-fab-label billing-fab-label--mobile">{locale === 'sl' ? 'Novo' : 'New'}</span>
                    </button>
                  </div>
                </div>

                {!isOpenBillsMobile && (
                  <div className="billing-modern-stats billing-modern-stats--five">
                    <div className="billing-modern-stat-card">
                      <span className="billing-modern-stat-icon billing-modern-stat-icon--blue" aria-hidden>▤</span>
                      <div><span className="billing-modern-stat-label">{billingCopy.historyStatInvoicesThisMonth}</span><strong>{folioStats.thisMonthCount}</strong><small>{billingCopy.historyStatInvoicesThisMonthSub}</small></div>
                    </div>
                    <div className="billing-modern-stat-card">
                      <span className="billing-modern-stat-icon billing-modern-stat-icon--green" aria-hidden>✓</span>
                      <div><span className="billing-modern-stat-label">{billingCopy.historyStatPaidInvoices}</span><strong>{folioStats.paidCount}</strong><small>{billingCopy.historyStatPaidInvoicesSub}</small></div>
                    </div>
                    <div className="billing-modern-stat-card">
                      <span className="billing-modern-stat-icon billing-modern-stat-icon--red" aria-hidden>↺</span>
                      <div><span className="billing-modern-stat-label">{locale === 'sl' ? 'Vračila' : 'Refunds'}</span><strong>{folioStats.refundsCount}</strong><small>{locale === 'sl' ? 'Skupaj vrnjenih računov' : 'Total refunded folios'}</small></div>
                    </div>
                    <div className="billing-modern-stat-card">
                      <span className="billing-modern-stat-icon billing-modern-stat-icon--orange" aria-hidden>▣</span>
                      <div><span className="billing-modern-stat-label">{locale === 'sl' ? 'Predplačila' : 'Advances'}</span><strong>{folioStats.advancesCount}</strong><small>{locale === 'sl' ? 'Skupaj uporabljenih predplačil' : 'Total advances applied'}</small></div>
                    </div>
                    <div className="billing-modern-stat-card">
                      <span className="billing-modern-stat-icon billing-modern-stat-icon--purple" aria-hidden>€</span>
                      <div><span className="billing-modern-stat-label">{locale === 'sl' ? 'Skupni znesek' : 'Total Amount'}</span><strong>{currency(folioStats.totalAmount)}</strong><small>{locale === 'sl' ? 'Skupaj za vse račune' : 'Across all folios'}</small></div>
                    </div>
                  </div>
                )}

                {sortedHistoryBills.length === 0 ? <EmptyState title={billingCopy.historyEmptyTitle} text={billingCopy.historyEmptyText} /> : isOpenBillsMobile ? (
                  <div className="billing-history-mobile">
                    <div className="billing-history-mobile__result-count">
                      {locale === 'sl'
                        ? `Prikazujem ${historyPagination.showFrom} do ${historyPagination.showTo} od ${historyPagination.total} rezultatov`
                        : `Showing ${historyPagination.showFrom} to ${historyPagination.showTo} of ${historyPagination.total} results`}
                    </div>

                    <div className="billing-history-mobile__list">
                      {historyPagination.slice.map((bill) => {
                        const billType = historyBillTypeLabel(bill)
                        const customer = bill.billingTarget === 'COMPANY'
                          ? (bill.recipientCompany?.name || '—')
                          : (bill.client ? fullName(bill.client) : '—')
                        const paymentMethod = paymentMethodChipLabel(bill.paymentMethod, locale)
                        const iconTone = isRefundBill(bill)
                          ? 'credit'
                          : normalizeBillType(bill) === 'ADVANCE'
                            ? 'advance'
                            : bill.paymentStatus === 'cancelled'
                              ? 'cancelled'
                              : bill.paymentStatus === 'payment_pending'
                                ? 'pending'
                                : 'invoice'
                        const invoiceNumber = bill.billNumber.startsWith('#') ? bill.billNumber : `#${bill.billNumber}`

                        return (
                          <article
                            key={bill.id}
                            className="billing-history-mobile-card"
                            role="button"
                            tabIndex={0}
                            onClick={() => { void openFolioPanel(bill) }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                void openFolioPanel(bill)
                              }
                            }}
                          >
                            <div className="billing-history-mobile-card__header">
                              <span className={`billing-history-mobile-card__document billing-history-mobile-card__document--${iconTone}`} aria-hidden>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
                                  <path d="M14 2v5h5" />
                                  <path d="M9 13h6M9 17h6" />
                                </svg>
                              </span>

                              <div className="billing-history-mobile-card__identity">
                                <h3>{billType} {invoiceNumber}</h3>
                                <span className="billing-history-mobile-card__type">{billType}</span>
                              </div>

                              <div className="billing-history-mobile-card__summary">
                                <strong>{currency(bill.totalGross)}</strong>
                                <span className={`billing-status-pill billing-status-pill--${paymentStatusClass(bill.paymentStatus)}`}>
                                  <span className="billing-history-mobile-card__status-dot" aria-hidden />
                                  {paymentStatusLabel(bill.paymentStatus)}
                                </span>
                                <button
                                  type="button"
                                  className="billing-history-mobile-card__open"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    void openFolioPanel(bill)
                                  }}
                                >
                                  <span>{locale === 'sl' ? 'Odpri' : 'Open'}</span>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                    <path d="m9 18 6-6-6-6" />
                                  </svg>
                                </button>
                              </div>
                            </div>

                            <div className="billing-history-mobile-card__details">
                              <div className="billing-history-mobile-card__detail">
                                <span className="billing-history-mobile-card__detail-icon" aria-hidden>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M4 7h16v10H4z" />
                                    <path d="M8 7V5h8v2M8 12h8" />
                                  </svg>
                                </span>
                                <div><span>{locale === 'sl' ? 'ID naročila' : 'Order ID'}</span><strong>{displayInvoiceOrderId(bill)}</strong></div>
                              </div>

                              <div className="billing-history-mobile-card__detail">
                                <span className="billing-history-mobile-card__detail-icon" aria-hidden>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M6 3h12v18H6z" />
                                    <path d="M9 7h6M9 11h6" />
                                  </svg>
                                </span>
                                <div><span>{locale === 'sl' ? 'Vrsta računa' : 'Invoice type'}</span><strong>{billType}</strong></div>
                              </div>

                              <div className="billing-history-mobile-card__detail">
                                <span className="billing-history-mobile-card__detail-icon" aria-hidden>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="8" />
                                    <path d="M9.5 9.5h5v5h-5z" />
                                  </svg>
                                </span>
                                <div><span>{locale === 'sl' ? 'ID seje' : 'Session ID'}</span><strong>{formatBillingSessionIdDisplay(bill.sessionId)}</strong></div>
                              </div>

                              <div className="billing-history-mobile-card__detail">
                                <span className="billing-history-mobile-card__detail-icon" aria-hidden>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="5" width="18" height="14" rx="3" />
                                    <path d="M3 10h18" />
                                  </svg>
                                </span>
                                <div>
                                  <span>{locale === 'sl' ? 'Način plačila' : 'Payment method'}</span>
                                  <strong className="billing-history-mobile-card__payment-method">{paymentTypeIcon(bill.paymentMethod?.paymentType, bill.paymentMethod?.name)} {paymentMethod}</strong>
                                </div>
                              </div>

                              <div className="billing-history-mobile-card__detail">
                                <span className="billing-history-mobile-card__detail-icon" aria-hidden>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="5" width="18" height="16" rx="2" />
                                    <path d="M16 3v4M8 3v4M3 10h18" />
                                  </svg>
                                </span>
                                <div>
                                  <span>{locale === 'sl' ? 'Datum in čas' : 'Date and time'}</span>
                                  <strong>{formatDateShort(bill.issueDate)}{formatTimeShort(bill.issueDate) ? `, ${formatTimeShort(bill.issueDate)}` : ''}</strong>
                                </div>
                              </div>

                              <div className="billing-history-mobile-card__detail">
                                <span className="billing-history-mobile-card__detail-icon" aria-hidden>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="8" r="4" />
                                    <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
                                  </svg>
                                </span>
                                <div><span>{locale === 'sl' ? 'Kupec' : 'Customer'}</span><strong>{customer}</strong></div>
                              </div>
                            </div>
                          </article>
                        )
                      })}
                    </div>

                    <div className="billing-history-mobile__pagination">
                      <button
                        type="button"
                        className="secondary"
                        onClick={historyPagination.totalPages > 1 ? () => setHistoryPage((page) => Math.max(1, page - 1)) : undefined}
                        disabled={historyPagination.totalPages > 1 && historyPagination.page <= 1}
                        aria-label={locale === 'sl' ? 'Prejšnja stran' : 'Previous page'}
                      >
                        ‹
                      </button>
                      <span>{historyPagination.page}</span>
                      <button
                        type="button"
                        className="secondary"
                        onClick={historyPagination.totalPages > 1 ? () => setHistoryPage((page) => Math.min(historyPagination.totalPages, page + 1)) : undefined}
                        disabled={historyPagination.totalPages > 1 && historyPagination.page >= historyPagination.totalPages}
                        aria-label={locale === 'sl' ? 'Naslednja stran' : 'Next page'}
                      >
                        ›
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {selectedHistoryBillIds.length > 0 ? (
                      <div className="billing-history-selection-bar">
                        <label className="billing-history-selection-bar__label">
                          <input
                            type="checkbox"
                            checked={allHistoryPageSelected}
                            onChange={(e) => toggleHistoryPageSelection(e.target.checked)}
                          />
                          <span>{historyExportText.selectedBar}</span>
                        </label>
                        <button type="button" className="billing-history-selection-bar__clear" onClick={() => setSelectedHistoryBillIds([])}>{historyExportText.clearSelection}</button>
                      </div>
                    ) : null}
                  <div className={isBillingMobileOrTablet ? 'billing-clients-table-layout' : 'billing-clients-table-layout clients-modern-card'}>
                    <div className="simple-table-wrap clients-table-wrap clients-table-desktop billing-modern-table-wrap">
                    <table className="clients-table billing-modern-table billing-modern-history-table">
                      <thead>
                        <tr>
                          <th className="billing-history-checkbox-cell">
                            <input
                              type="checkbox"
                              checked={allHistoryPageSelected}
                              onChange={(e) => toggleHistoryPageSelection(e.target.checked)}
                              aria-label={locale === 'sl' ? 'Izberi vse račune na strani' : 'Select all invoices on page'}
                            />
                          </th>
                          <BillingSortableTableHeader label={locale === 'sl' ? 'Št. računa' : 'Invoice No.'} sortKey="invoiceNumber" sortState={historySortState} onSort={handleHistorySort} sortAriaPrefix={billingSortAriaPrefix} />
                          <BillingSortableTableHeader label={billingCopy.historyInvoiceTypeColumn} sortKey="invoiceType" sortState={historySortState} onSort={handleHistorySort} sortAriaPrefix={billingSortAriaPrefix} />
                          <BillingSortableTableHeader label={locale === 'sl' ? 'ID naročila' : 'Order ID'} sortKey="orderId" sortState={historySortState} onSort={handleHistorySort} sortAriaPrefix={billingSortAriaPrefix} />
                          <BillingSortableTableHeader label={locale === 'sl' ? 'ID seje' : 'Session ID'} sortKey="sessionId" sortState={historySortState} onSort={handleHistorySort} sortAriaPrefix={billingSortAriaPrefix} />
                          <BillingSortableTableHeader label={locale === 'sl' ? `${billingCopy.client} / Podjetje` : `${billingCopy.client} / Company`} sortKey="customer" sortState={historySortState} onSort={handleHistorySort} sortAriaPrefix={billingSortAriaPrefix} />
                          <BillingSortableTableHeader label={locale === 'sl' ? 'Zaposleni' : 'Employee'} sortKey="employee" sortState={historySortState} onSort={handleHistorySort} sortAriaPrefix={billingSortAriaPrefix} />
                          <BillingSortableTableHeader label={locale === 'sl' ? 'Opis' : 'Description'} sortKey="description" sortState={historySortState} onSort={handleHistorySort} sortAriaPrefix={billingSortAriaPrefix} />
                          <BillingSortableTableHeader label={locale === 'sl' ? 'Datum izdaje' : 'Issue Date'} sortKey="date" sortState={historySortState} onSort={handleHistorySort} sortAriaPrefix={billingSortAriaPrefix} />
                          <BillingSortableTableHeader label={locale === 'sl' ? 'Znesek' : 'Amount'} sortKey="gross" sortState={historySortState} onSort={handleHistorySort} sortAriaPrefix={billingSortAriaPrefix} />
                          <BillingSortableTableHeader label={locale === 'sl' ? 'Status plačila' : 'Payment Status'} sortKey="paymentStatus" sortState={historySortState} onSort={handleHistorySort} sortAriaPrefix={billingSortAriaPrefix} />
                          {fiscalCashRegisterEnabled ? <BillingSortableTableHeader label={locale === 'sl' ? 'Fiskalni status' : 'Fiscal Status'} sortKey="fiscalStatus" sortState={historySortState} onSort={handleHistorySort} sortAriaPrefix={billingSortAriaPrefix} /> : null}
                          <th>{locale === 'sl' ? 'Dejanja' : 'Action'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyPagination.slice.map((bill) => (
                          <tr key={bill.id} className={`clients-row billing-history-row${selectedHistoryBillIdSet.has(bill.id) ? ' billing-history-row--selected' : ''}`} onClick={() => { void openFolioPanel(bill) }}>
                            <td className="billing-history-checkbox-cell" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={selectedHistoryBillIdSet.has(bill.id)}
                                onChange={(e) => toggleHistoryBillSelection(bill.id, e.target.checked)}
                                aria-label={locale === 'sl' ? `Izberi račun ${bill.billNumber}` : `Select invoice ${bill.billNumber}`}
                              />
                            </td>
                            <td className="billing-modern-link-cell">{bill.billNumber}{bill.refundReference ? <div className="billing-modern-muted">{bill.refundReference}</div> : null}</td>
                            <td>{historyBillTypeLabel(bill)}</td>
                            <td>{displayInvoiceOrderId(bill)}</td>
                            <td>{formatBillingSessionIdDisplay(bill.sessionId)}</td>
                            <td>{bill.billingTarget === 'COMPANY' ? (bill.recipientCompany?.name || '—') : (bill.client ? fullName(bill.client) : '—')}</td>
                            <td>{fullName(bill.consultant)}</td>
                            <td>
                              <div className="billing-modern-main-text">{bill.items?.[0]?.transactionService?.description || normalizeBillType(bill)}</div>
                              <div className="billing-modern-muted">{locale === 'sl' ? 'Račun' : 'Invoice'} {bill.billNumber}</div>
                            </td>
                            <td>
                              <div className="billing-modern-main-text">{formatDateShort(bill.issueDate)}</div>
                              <div className="billing-modern-muted">{formatDate(bill.issueDate)}</div>
                            </td>
                            <td className="billing-modern-amount">{currency(bill.totalGross)}</td>
                            <td><span className={`billing-status-pill billing-status-pill--${paymentStatusClass(bill.paymentStatus)}`}>{paymentStatusLabel(bill.paymentStatus)}</span></td>
                            {fiscalCashRegisterEnabled ? <td><span className={`billing-status-pill billing-status-pill--${fiscalStatusClass(bill)}`}>{fiscalStatusLabel(bill)}</span></td> : null}
                            <td className="billing-modern-actions billing-modern-actions--history" onClick={(e) => e.stopPropagation()}>
                              <button type="button" className="billing-action-btn billing-action-btn--danger" onClick={() => refundBill(bill)} disabled={!canRefundBill(bill) || refundingBillId === bill.id}>{refundingBillId === bill.id ? (locale === 'sl' ? 'Vračilo…' : 'Refunding…') : (locale === 'sl' ? 'Vračilo' : 'Refund')}</button>
                              <button type="button" className="billing-action-btn" onClick={() => sendCheckoutLink(bill)} disabled={creatingCheckoutBillId === bill.id}>{creatingCheckoutBillId === bill.id ? (locale === 'sl' ? 'Pošiljanje…' : 'Sending…') : (locale === 'sl' ? 'Pošlji' : 'Send')}</button>
                              <button type="button" className="billing-action-btn" onClick={() => downloadFolioPdf(bill)}>{locale === 'sl' ? 'Prenesi PDF' : 'PDF'}</button>
                              <button type="button" className="billing-action-btn" onClick={() => printFolioPdf(bill)} disabled={printingBillId === bill.id}>{printingBillId === bill.id ? (locale === 'sl' ? 'Tiskanje…' : 'Printing…') : (locale === 'sl' ? 'Natisni' : 'Print')}</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                    <div className="clients-modern-table-footer billing-modern-footer">
                      <span>
                        {locale === 'sl'
                          ? `Prikazujem ${historyPagination.showFrom} do ${historyPagination.showTo} od ${historyPagination.total} rezultatov`
                          : `Showing ${historyPagination.showFrom} to ${historyPagination.showTo} of ${historyPagination.total} results`}
                      </span>
                      <div
                        className="clients-modern-pagination"
                        aria-hidden={historyPagination.totalPages <= 1}
                        role={historyPagination.totalPages > 1 ? 'navigation' : undefined}
                        aria-label={historyPagination.totalPages > 1 ? 'Folio history pages' : undefined}
                      >
                        <button
                          type="button"
                          className="secondary"
                          onClick={historyPagination.totalPages > 1 ? () => setHistoryPage((p) => Math.max(1, p - 1)) : undefined}
                          disabled={historyPagination.totalPages > 1 && historyPagination.page <= 1}
                        >
                          ‹
                        </button>
                        <span>{historyPagination.page}</span>
                        <button
                          type="button"
                          className="secondary"
                          onClick={
                            historyPagination.totalPages > 1
                              ? () => setHistoryPage((p) => Math.min(historyPagination.totalPages, p + 1))
                              : undefined
                          }
                          disabled={historyPagination.totalPages > 1 && historyPagination.page >= historyPagination.totalPages}
                        >
                          ›
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  </>
                )}
              </div>
            )}

            {showGiftCardFilters && billingTab === 'giftCards' && (
              <SidePanel
                open
                onClose={() => setShowGiftCardFilters(false)}
                ariaLabel={historyFilterText.title}
                size="sm"
              >
                  <PanelHeader
                    title={historyFilterText.title}
                    onClose={() => setShowGiftCardFilters(false)}
                    closeLabel={locale === 'sl' ? 'Zapri' : 'Close'}
                  />
                  <PanelBody>
                  <div className="billing-filter-modal__body">
                    <label>
                      <span>{historyFilterText.from}</span>
                      <input ref={giftCardDateFromInputRef} type="date" value={giftCardFilterDraft.dateFrom} onChange={(e) => setGiftCardFilterDraft((value) => ({ ...value, dateFrom: e.target.value }))} />
                    </label>
                    <label>
                      <span>{historyFilterText.to}</span>
                      <input ref={giftCardDateToInputRef} type="date" value={giftCardFilterDraft.dateTo} onChange={(e) => setGiftCardFilterDraft((value) => ({ ...value, dateTo: e.target.value }))} />
                    </label>
                    <label>
                      <span>{locale === 'sl' ? 'Status bona' : 'Voucher status'}</span>
                      <DesktopSelect value={giftCardFilterDraft.status} onChange={(e) => setGiftCardFilterDraft((value) => ({ ...value, status: e.target.value as BillingGiftCardStatus }))}>
                        <option value="all">{locale === 'sl' ? 'Vsi statusi' : 'All statuses'}</option>
                        <option value="active">{locale === 'sl' ? 'Aktivni' : 'Active'}</option>
                        <option value="partially_used">{locale === 'sl' ? 'Delno porabljeni' : 'Partially used'}</option>
                        <option value="used">{locale === 'sl' ? 'Porabljeni' : 'Used'}</option>
                        <option value="expired">{locale === 'sl' ? 'Potekli' : 'Expired'}</option>
                        <option value="pending_payment">{locale === 'sl' ? 'Čaka plačilo' : 'Pending payment'}</option>
                        <option value="cancelled">{locale === 'sl' ? 'Preklicani' : 'Cancelled'}</option>
                      </DesktopSelect>
                    </label>
                  </div>
                  </PanelBody>
                  <PanelFooter>
                    <PanelButton onClick={resetGiftCardFilterDraft}>{historyFilterText.reset}</PanelButton>
                    <PanelButton variant="primary" onClick={applyGiftCardFilters}>{historyFilterText.apply}</PanelButton>
                  </PanelFooter>
              </SidePanel>
            )}


            {showHistoryFilters && billingTab === 'history' && (
              <SidePanel
                open
                onClose={() => setShowHistoryFilters(false)}
                ariaLabel={historyFilterText.title}
                size="sm"
              >
                  <PanelHeader
                    title={historyFilterText.title}
                    onClose={() => setShowHistoryFilters(false)}
                    closeLabel={locale === 'sl' ? 'Zapri' : 'Close'}
                  />
                  <PanelBody>
                  <div className="billing-filter-modal__body">
                    <label>
                      <span>{historyFilterText.from}</span>
                      <input ref={historyDateFromInputRef} type="date" value={historyFilterDraft.dateFrom} onChange={(e) => setHistoryFilterDraft((value) => ({ ...value, dateFrom: e.target.value }))} />
                    </label>
                    <label>
                      <span>{historyFilterText.to}</span>
                      <input ref={historyDateToInputRef} type="date" value={historyFilterDraft.dateTo} onChange={(e) => setHistoryFilterDraft((value) => ({ ...value, dateTo: e.target.value }))} />
                    </label>
                    <label>
                      <span>{billingCopy.historyFilterStatusAria}</span>
                      <DesktopSelect value={historyFilterDraft.status} onChange={(e) => setHistoryFilterDraft((value) => ({ ...value, status: e.target.value as HistoryPaymentStatusFilter }))}>
                        <option value="all">{billingCopy.historyStatusAll}</option>
                        <option value="paid">{billingCopy.historyStatusPaid}</option>
                        <option value="payment_pending">{billingCopy.historyStatusPending}</option>
                        <option value="open">{billingCopy.historyStatusOpen}</option>
                        <option value="cancelled">{billingCopy.historyStatusCancelled}</option>
                      </DesktopSelect>
                    </label>
                    {fiscalCashRegisterEnabled ? (
                      <label>
                        <span>{billingCopy.historyFilterFiscalStatusAria}</span>
                        <DesktopSelect value={historyFilterDraft.fiscalStatus} onChange={(e) => setHistoryFilterDraft((value) => ({ ...value, fiscalStatus: e.target.value as HistoryFiscalStatusFilter }))}>
                          <option value="all">{billingCopy.historyFiscalStatusAll}</option>
                          <option value="SENT">{billingCopy.historyFiscalStatusSent}</option>
                          <option value="FAILED">{billingCopy.historyFiscalStatusFailed}</option>
                          <option value="NOT_SENT">{billingCopy.historyFiscalStatusNotSent}</option>
                        </DesktopSelect>
                      </label>
                    ) : null}
                    <label>
                      <span>{billingCopy.historyFilterBillTypeAria}</span>
                      <DesktopSelect value={historyFilterDraft.billType} onChange={(e) => setHistoryFilterDraft((value) => ({ ...value, billType: e.target.value as HistoryInvoiceTypeFilter }))}>
                        <option value="all">{billingCopy.historyBillTypeAll}</option>
                        <option value="INVOICE">{billingCopy.historyBillTypeInvoice}</option>
                        <option value="ADVANCE">{billingCopy.historyBillTypeAdvance}</option>
                        <option value="REFUND">{billingCopy.historyBillTypeRefund}</option>
                      </DesktopSelect>
                    </label>
                  </div>
                  </PanelBody>
                  <PanelFooter>
                    <PanelButton onClick={resetHistoryFilterDraft}>{historyFilterText.reset}</PanelButton>
                    <PanelButton variant="primary" onClick={applyHistoryFilters}>{historyFilterText.apply}</PanelButton>
                  </PanelFooter>
              </SidePanel>
            )}
          </Card>
      </div>

      {detailGiftCard && (
        <SidePanel
          open
          onClose={closeGiftCardPanel}
          ariaLabel={voucherTypeLabel(detailGiftCard)}
          size="lg"
        >
            <PanelHeader
              title={voucherTypeLabel(detailGiftCard)}
              subtitle={`${detailGiftCard.giftCardNumber || ('DB-' + detailGiftCard.id)} · ${detailGiftCard.code || '—'}`}
              onClose={closeGiftCardPanel}
              closeLabel={locale === 'sl' ? 'Zapri' : 'Close'}
            />
            <PanelBody>
            <div className="billing-bill-modal-body stack gap-md">
              <div className="billing-modern-stats billing-modern-stats--two">
                {isServiceVoucher(detailGiftCard) ? (
                  <>
                    <div className="billing-modern-stat-card">
                      <span className="billing-modern-stat-icon billing-modern-stat-icon--purple" aria-hidden>◇</span>
                      <div><span className="billing-modern-stat-label">{locale === 'sl' ? 'Storitev' : 'Service'}</span><strong>{voucherScopeLabel(detailGiftCard)}</strong><small>{locale === 'sl' ? 'Kaj je mogoče unovčiti' : 'What can be redeemed'}</small></div>
                    </div>
                    <div className="billing-modern-stat-card">
                      <span className="billing-modern-stat-icon billing-modern-stat-icon--green" aria-hidden>1×</span>
                      <div><span className="billing-modern-stat-label">{locale === 'sl' ? 'Preostalo' : 'Remaining'}</span><strong>{detailGiftCard.remainingUses ?? 0}</strong><small>{locale === 'sl' ? 'Število unovčenj' : 'Redemptions left'}</small></div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="billing-modern-stat-card">
                      <span className="billing-modern-stat-icon billing-modern-stat-icon--purple" aria-hidden>€</span>
                      <div><span className="billing-modern-stat-label">{locale === 'sl' ? 'Vrednost' : 'Value'}</span><strong>{currency(Number(detailGiftCard.valueGross || 0))}</strong><small>{locale === 'sl' ? 'Začetna vrednost bona' : 'Original value'}</small></div>
                    </div>
                    <div className="billing-modern-stat-card">
                      <span className="billing-modern-stat-icon billing-modern-stat-icon--green" aria-hidden>€</span>
                      <div><span className="billing-modern-stat-label">{locale === 'sl' ? 'Preostanek' : 'Remaining'}</span><strong>{currency(Number(detailGiftCard.remainingGross || 0))}</strong><small>{locale === 'sl' ? 'Trenutno stanje' : 'Current balance'}</small></div>
                    </div>
                  </>
                )}
              </div>
              <div className="billing-open-detail-grid">
                <div><span className="muted">{locale === 'sl' ? 'Vrsta bona' : 'Voucher type'}</span><strong>{voucherTypeLabel(detailGiftCard)}</strong></div>
                <div><span className="muted">{locale === 'sl' ? 'Stranka / kupec' : 'Client / buyer'}</span><strong>{detailGiftCard.clientName || '—'}</strong></div>
                <div><span className="muted">{locale === 'sl' ? 'E-pošta' : 'Email'}</span><strong>{detailGiftCard.clientEmail || '—'}</strong></div>
                <div><span className="muted">{locale === 'sl' ? 'Velja za' : 'Valid for'}</span><strong>{voucherScopeLabel(detailGiftCard)}</strong></div>
                <div><span className="muted">{locale === 'sl' ? 'Velja na lokacijah' : 'Valid at locations'}</span><strong>{voucherLocationScopeLabel(detailGiftCard)}</strong></div>
                {!isServiceVoucher(detailGiftCard) ? <div><span className="muted">{locale === 'sl' ? 'Porabljeno' : 'Used'}</span><strong>{currency(Number(detailGiftCard.usedGross || 0))}</strong></div> : null}
                <div><span className="muted">{locale === 'sl' ? 'Poteče' : 'Expires'}</span><strong>{detailGiftCard.expiresAt ? formatDate(detailGiftCard.expiresAt) : '—'}</strong></div>
                <div><span className="muted">{locale === 'sl' ? 'Račun' : 'Invoice'}</span><strong>{detailGiftCard.billNumber || detailGiftCard.orderReference || '—'}</strong></div>
                <div><span className="muted">{locale === 'sl' ? 'Ugodnost' : 'Product'}</span><strong>{detailGiftCard.productName || '—'}</strong></div>
              </div>
            </div>
            </PanelBody>
            <PanelFooter>
                <PanelButton onClick={() => downloadGiftCardPdf(detailGiftCard)}>{locale === 'sl' ? 'Prenesi PDF' : 'Download PDF'}</PanelButton>
                <PanelButton onClick={() => printGiftCardPdf(detailGiftCard)} disabled={printingGiftCardId === detailGiftCard.id}>{printingGiftCardId === detailGiftCard.id ? (locale === 'sl' ? 'Tiskanje…' : 'Printing…') : (locale === 'sl' ? 'Natisni' : 'Print')}</PanelButton>
                <PanelButton variant="primary" onClick={() => sendGiftCardAgain(detailGiftCard)} disabled={sendingGiftCardId === detailGiftCard.id}>{sendingGiftCardId === detailGiftCard.id ? (locale === 'sl' ? 'Pošiljam…' : 'Sending…') : (locale === 'sl' ? 'Pošlji po e-pošti' : 'Send by email')}</PanelButton>
            </PanelFooter>
        </SidePanel>
      )}

      {(embeddedOpenBillMode || openBillDrawerOpen) && !detailOpenBill && (
        <SidePanel
          open
          onClose={closeDetailOpenBill}
          ariaLabel={locale === 'sl' ? 'Uredi neizdan račun' : 'Edit unissued invoice'}
          size="xl"
        >
          <PanelHeader
            title={locale === 'sl' ? 'Uredi neizdan račun' : 'Edit unissued invoice'}
            subtitle={locale === 'sl' ? 'Nalaganje podatkov računa…' : 'Loading bill data…'}
            onClose={closeDetailOpenBill}
            closeLabel={locale === 'sl' ? 'Zapri' : 'Close'}
          />
          <PanelBody>
            <p>{locale === 'sl' ? 'Nalaganje podatkov računa…' : 'Loading bill data…'}</p>
          </PanelBody>
        </SidePanel>
      )}

      {detailOpenBill && (() => {
        const detailRootOpenBill = getOpenBillEditorRoot(detailOpenBill)
        const detailBaseRelatedOpenBills = getRelatedOpenBillsForEditor(detailRootOpenBill)
        const detailTemporaryOpenBills = getTemporaryOpenBillTabsForRoot(detailRootOpenBill)
        const detailOnePayeeForAll = detailTemporaryOpenBills.length === 0
          && isOnePayeeActiveForOpenBill(detailRootOpenBill, detailBaseRelatedOpenBills)
          && !hasIssuedBillForOpenBillGroup(detailRootOpenBill)
        const detailActionOpenBill = detailOnePayeeForAll ? (detailBaseRelatedOpenBills[0] ?? detailRootOpenBill) : detailOpenBill
        const detailActionItems = detailOnePayeeForAll
          ? detailBaseRelatedOpenBills.flatMap((entry) => getOpenBillItems(entry))
          : getOpenBillItems(detailActionOpenBill)
        const detailActionGross = detailOnePayeeForAll
          ? Number(detailBaseRelatedOpenBills.reduce((sum, entry) => sum + openBillPayableGross(entry), 0).toFixed(2))
          : openBillPayableGross(detailActionOpenBill)
        const detailPaymentSplits = getOpenBillPaymentSplits(detailActionOpenBill, detailActionGross)
        const detailEntitlementSettlement = detailOnePayeeForAll
          ? null
          : openBillEntitlementSettlementSelection(detailActionOpenBill, detailActionGross)
        const detailCloseCandidateBills = detailOnePayeeForAll ? detailBaseRelatedOpenBills : [detailActionOpenBill]
        const detailSessionsBillableForClose = openBillSessionsAreBillableForClose(detailCloseCandidateBills)
        const detailPaymentsMatchCloseTotal = paymentSplitsMatchInvoiceTotal(detailPaymentSplits, detailActionGross)
        const detailCanIssueOpenBill = canIssueOpenBillType(detailActionOpenBill)
        const detailIssuePermissionTooltip = issueOpenBillPermissionTooltip(detailActionOpenBill)
        const detailCloseDisabledReason = !detailEntitlementSettlement && !detailCanIssueOpenBill
          ? detailIssuePermissionTooltip
          : !detailSessionsBillableForClose
            ? (locale === 'sl'
              ? 'Termin mora biti v statusu RESERVED, ONGOING, CHECKED OUT ali NO SHOW.'
              : 'Session must be in RESERVED, ONGOING, CHECKED OUT or NO SHOW status.')
            : !detailPaymentsMatchCloseTotal
              ? (locale === 'sl' ? 'Vsota plačil mora biti enaka znesku računa.' : 'Payment method amounts must match the invoice total.')
              : !detailPaymentSelectionValid
                ? (locale === 'sl' ? 'Izbrano plačilo ali ugodnost ni veljavna.' : 'The selected payment or entitlement is not valid.')
                : undefined
        const detailCloseDisabled = creatingFromOpenId === detailActionOpenBill.id
          || detailActionItems.length === 0
          || !detailPaymentsMatchCloseTotal
          || !detailSessionsBillableForClose
          || !detailPaymentSelectionValid
          || (!detailEntitlementSettlement && !detailCanIssueOpenBill)
        return (
          <>
            <SidePanel
              open
              onClose={closeDetailOpenBill}
              ariaLabel={locale === 'sl' ? 'Uredi neizdan račun' : 'Edit unissued invoice'}
              size="xl"
              closeOnScrimClick={false}
              className="billing-pos-panel billing-pos-panel--edit"
            >
              <PanelHeader
                title={locale === 'sl' ? 'Uredi neizdan račun' : 'Edit unissued invoice'}
                onClose={closeDetailOpenBill}
                closeLabel={locale === 'sl' ? 'Zapri' : 'Close'}
              />
              <PanelBody flush className="billing-pos-panel-body">
                {renderModernOpenBillEditor(detailActionOpenBill)}
              </PanelBody>
              <div className="billing-pos-footer">
                <div className="billing-pos-footer-left billing-preview-choice-anchor">
                  <button
                    type="button"
                    className="billing-pos-footer-btn billing-pos-footer-btn--preview"
                    onClick={() => openOpenBillPreviewChoice(detailActionOpenBill, detailOnePayeeForAll ? detailBaseRelatedOpenBills : undefined)}
                    disabled={Boolean(detailEntitlementSettlement) || previewingOpenBillId === detailActionOpenBill.id || emailingOpenBillPreviewId === detailActionOpenBill.id || detailActionItems.length === 0}
                  >
                    {previewingOpenBillId === detailActionOpenBill.id
                      ? (locale === 'sl' ? 'Pripravljam…' : 'Preparing…')
                      : (locale === 'sl' ? 'Predogled računa' : 'Invoice preview')}
                  </button>
                  {renderOpenBillPreviewChoicePopover(detailActionOpenBill)}
                </div>
                <div className="billing-pos-footer-actions">
                  <button
                    type="button"
                    className="billing-pos-footer-btn billing-pos-footer-btn--secondary"
                    onClick={() => void createBillFromOpen(detailActionOpenBill, detailOnePayeeForAll ? detailBaseRelatedOpenBills : undefined)}
                    disabled={detailCloseDisabled}
                    title={detailCloseDisabledReason}
                  >
                    {creatingFromOpenId === detailActionOpenBill.id ? billingCopy.creating : (locale === 'sl' ? 'Zaključi račun' : 'Close invoice')}
                  </button>
                  <button
                    type="button"
                    className="billing-pos-footer-btn billing-pos-footer-btn--primary"
                    onClick={() => void createBillFromOpen(detailActionOpenBill, detailOnePayeeForAll ? detailBaseRelatedOpenBills : undefined, 'print')}
                    disabled={detailCloseDisabled || Boolean(detailEntitlementSettlement)}
                    title={detailCloseDisabledReason}
                  >
                    {creatingFromOpenId === detailActionOpenBill.id ? billingCopy.creating : (locale === 'sl' ? 'Zaključi in natisni' : 'Close and print')}
                  </button>
                </div>
              </div>
            </SidePanel>
            {renderOpenBillPayeeEditorDialog()}
            {renderAddOpenBillDialog()}
          </>
        )
      })()}


      {workspaceBillsPanelOpen && (
        <SidePanel
          open
          onClose={closeWorkspaceBillsPanel}
          ariaLabel={locale === 'sl' ? 'Računi vseh enot' : 'Invoices from all units'}
          size="xl"
        >
            <PanelHeader
              title={locale === 'sl' ? 'Računi vseh dostopnih enot' : 'Invoices from all accessible units'}
              subtitle={locale === 'sl' ? 'Združeni pregled je samo za branje. Račun ostane vezan na prvotno enoto, lokacijo, izdajatelja in serijo.' : 'This consolidated view is read-only. Every invoice remains owned by its original unit, location, issuer and series.'}
              onClose={closeWorkspaceBillsPanel}
              closeLabel={locale === 'sl' ? 'Zapri' : 'Close'}
            />
            <PanelBody>
            <div className="billing-workspace-history-body">
              {workspaceBillsLoading ? (
                <p className="billing-workspace-history-empty">{locale === 'sl' ? 'Nalaganje računov…' : 'Loading invoices…'}</p>
              ) : workspaceBills.length === 0 ? (
                <p className="billing-workspace-history-empty">{locale === 'sl' ? 'V dostopnih enotah še ni računov.' : 'No invoices exist in the accessible units yet.'}</p>
              ) : (
                <div className="billing-workspace-history-table-wrap">
                  <table className="billing-workspace-history-table">
                    <thead>
                      <tr>
                        <th>{locale === 'sl' ? 'Račun' : 'Invoice'}</th>
                        <th>{locale === 'sl' ? 'Datum' : 'Date'}</th>
                        <th>{locale === 'sl' ? 'Enota' : 'Unit'}</th>
                        <th>{locale === 'sl' ? 'Lokacija' : 'Location'}</th>
                        <th>{locale === 'sl' ? 'Izdajatelj' : 'Issuer'}</th>
                        <th>{locale === 'sl' ? 'Serija' : 'Series'}</th>
                        <th>{locale === 'sl' ? 'Stranka' : 'Client'}</th>
                        <th>{locale === 'sl' ? 'Bruto' : 'Gross'}</th>
                        <th>{locale === 'sl' ? 'Status' : 'Status'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workspaceBills.map((bill) => (
                        <tr key={bill.id}>
                          <td><strong>{bill.billNumber || `#${bill.id}`}</strong><small>{bill.billType}</small></td>
                          <td>{formatDate(bill.issueDate)}</td>
                          <td>{bill.companyName}</td>
                          <td>{bill.locationName}</td>
                          <td>{bill.issuerName}</td>
                          <td>{bill.invoiceSeriesName}</td>
                          <td>{bill.clientName || '—'}</td>
                          <td><strong>{currency(bill.totalGross)}</strong></td>
                          <td><span className={`billing-status-pill billing-status-pill--${paymentStatusClass(bill.paymentStatus)}`}>{paymentStatusLabel(bill.paymentStatus)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            </PanelBody>
        </SidePanel>
      )}

      {createBillPanelOpen && (() => {
        const isCreateAdvanceBill = billForm.billType === 'ADVANCE'
        const canIssueCreateBillType = isCreateAdvanceBill ? canIssueAdvanceInvoice : canIssueOpenInvoice
        const createPermissionTooltip = !canIssueCreateBillType
          ? (isCreateAdvanceBill
            ? (locale === 'sl' ? 'Nimate dovoljenja za izdajo predplačil.' : 'You do not have permission to issue advance invoices.')
            : (locale === 'sl' ? 'Nimate dovoljenja za izdajo odprtih računov.' : 'You do not have permission to issue open invoices.'))
          : undefined
        const createCloseTooltip = createPermissionTooltip
          ?? ((billForm.billingTarget === 'PERSON' && !billForm.clientId)
            ? (locale === 'sl' ? 'Izberite klienta.' : 'Select a client.')
            : (billForm.billingTarget === 'COMPANY' && !billForm.recipientCompanyId)
              ? (locale === 'sl' ? 'Izberite podjetje.' : 'Select a company.')
              : billForm.items.length === 0
                ? (locale === 'sl' ? 'Dodajte vsaj eno postavko.' : 'Add at least one line item.')
                : !billForm.legalEntityId || !billForm.invoiceSeriesId || !billForm.locationId
                  ? (locale === 'sl' ? 'Izberite izdajatelja, številčno serijo in lokacijo.' : 'Select an issuer, invoice series and location.')
                  : !billItemsAllowedByType
                    ? (isCreateAdvanceBill
                      ? (locale === 'sl' ? 'Za predplačilo lahko izberete samo storitve s Predplačilo ON.' : 'Advance bills only accept services marked as Advance.')
                      : (locale === 'sl' ? 'Storitve s Predplačilo ON lahko uporabite samo na Novo predplačilo.' : 'Services marked as Advance can only be used on New advance.'))
                    : !createPaymentsMatchTotal
                      ? (locale === 'sl' ? 'Vsota plačil mora biti enaka znesku računa.' : 'Payment amounts must match the total.')
                      : !createAdvanceSelectionValid
                        ? (locale === 'sl' ? 'Izbrana predplačila niso veljavna.' : 'The selected advances are not valid.')
                        : undefined)
        const createDisabled = creatingBill || creatingManualOpenBill || !billCanSubmit || !canIssueCreateBillType
        return (
          <>
            <SidePanel
              open
              onClose={closeCreateBillModal}
              ariaLabel={isCreateAdvanceBill ? (locale === 'sl' ? 'Novo predplačilo' : 'New advance') : (locale === 'sl' ? 'Nov neizdan račun' : 'New unissued invoice')}
              size="xl"
              closeOnScrimClick={false}
              className={`billing-pos-panel billing-pos-panel--create${isCreateAdvanceBill ? ' billing-pos-panel--advance' : ''}`}
            >
              <PanelHeader
                title={isCreateAdvanceBill ? (locale === 'sl' ? 'Novo predplačilo' : 'New advance') : (locale === 'sl' ? 'Nov neizdan račun' : 'New unissued invoice')}
                onClose={closeCreateBillModal}
                closeLabel={locale === 'sl' ? 'Zapri' : 'Close'}
              />
              <PanelBody flush className="billing-pos-panel-body">
                {renderPosCreateEditor(isCreateAdvanceBill)}
              </PanelBody>
              <div className={`billing-pos-footer${mobileKeyboardOpen ? ' billing-pos-footer--keyboard-hidden' : ''}`}>
                <div className="billing-pos-footer-spacer" />
                <div className="billing-pos-footer-actions">
                  <button
                    type="button"
                    className="billing-pos-footer-btn billing-pos-footer-btn--secondary"
                    onClick={() => void (isCreateAdvanceBill ? createBill() : createAndCloseManualOpenBill())}
                    disabled={createDisabled}
                    title={createCloseTooltip}
                  >
                    {creatingBill || creatingManualOpenBill
                      ? billingCopy.creating
                      : isCreateAdvanceBill
                        ? (locale === 'sl' ? 'Ustvari predplačilo' : 'Create advance')
                        : (locale === 'sl' ? 'Ustvari račun' : 'Create invoice')}
                  </button>
                  <button
                    type="button"
                    className="billing-pos-footer-btn billing-pos-footer-btn--primary"
                    onClick={() => void (isCreateAdvanceBill ? createBill('print') : createAndCloseManualOpenBill('print'))}
                    disabled={createDisabled}
                    title={createCloseTooltip}
                  >
                    {creatingBill || creatingManualOpenBill ? billingCopy.creating : (locale === 'sl' ? 'Ustvari in natisni' : 'Create and print')}
                  </button>
                </div>
              </div>
            </SidePanel>
            {renderCreateBillPayeeDialog()}
          </>
        )
      })()}


      {printFormatChoice ? (
        <SidePanel
          open
          placement="center"
          size="sm"
          onClose={() => {
            closePdfActionWindow(printFormatChoice.preparedWindow)
            setPrintFormatChoice(null)
          }}
          ariaLabel={locale === 'sl' ? 'Izberite obliko tiskanja' : locale === 'sr' ? 'Izaberite format štampe' : 'Choose print format'}
        >
          <div className="billing-print-format-dialog">
            <button
              type="button"
              className="billing-print-format-close"
              aria-label={locale === 'sl' ? 'Zapri' : locale === 'sr' ? 'Zatvori' : 'Close'}
              onClick={() => {
                closePdfActionWindow(printFormatChoice.preparedWindow)
                setPrintFormatChoice(null)
              }}
            >
              ×
            </button>
            <div className="billing-print-format-icon" aria-hidden>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9V2h12v7" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <path d="M6 14h12v8H6z" />
              </svg>
            </div>
            <h2 id="billing-print-format-title">
              {locale === 'sl' ? 'Izberite obliko tiskanja' : locale === 'sr' ? 'Izaberite format štampe' : 'Choose print format'}
            </h2>
            <p>
              {locale === 'sl'
                ? 'A4 je namenjen običajnim tiskalnikom, POS 58 mm pa termičnim tiskalnikom in ročnim POS napravam.'
                : locale === 'sr'
                  ? 'A4 je namenjen standardnim štampačima, a POS 58 mm termalnim štampačima i ručnim POS uređajima.'
                  : 'A4 is for standard printers; POS 58 mm is optimized for thermal printers and handheld POS devices.'}
            </p>
            <div className="billing-print-format-options">
              <button
                type="button"
                className="billing-print-format-option"
                onClick={() => {
                  const choice = printFormatChoice
                  const actionWindow = choice.preparedWindow ?? openPdfActionWindow(
                    locale === 'sl' ? 'Pripravljam A4 račun za tiskanje…' : locale === 'sr' ? 'Pripremam A4 račun za štampu…' : 'Preparing A4 invoice for printing…',
                  )
                  setPrintFormatChoice(null)
                  void executePrintFolioPdf(choice.bill, 'A4', actionWindow)
                }}
              >
                <span className="billing-print-format-paper billing-print-format-paper--a4" aria-hidden />
                <span><strong>A4</strong><small>{locale === 'sl' ? 'Običajni tiskalnik' : locale === 'sr' ? 'Standardni štampač' : 'Standard printer'}</small></span>
              </button>
              <button
                type="button"
                className="billing-print-format-option"
                onClick={() => {
                  const choice = printFormatChoice
                  const actionWindow = choice.preparedWindow ?? openPdfActionWindow(
                    locale === 'sl' ? 'Pripravljam 58 mm račun za tiskanje…' : locale === 'sr' ? 'Pripremam račun od 58 mm za štampu…' : 'Preparing 58 mm invoice for printing…',
                  )
                  setPrintFormatChoice(null)
                  void executePrintFolioPdf(choice.bill, 'POS_58', actionWindow)
                }}
              >
                <span className="billing-print-format-paper billing-print-format-paper--receipt" aria-hidden />
                <span><strong>POS 58 mm</strong><small>{locale === 'sl' ? 'Termični tiskalnik' : locale === 'sr' ? 'Termalni štampač' : 'Thermal printer'}</small></span>
              </button>
            </div>
            <button
              type="button"
              className="billing-print-format-cancel"
              onClick={() => {
                closePdfActionWindow(printFormatChoice.preparedWindow)
                setPrintFormatChoice(null)
              }}
            >
              {locale === 'sl' ? 'Prekliči' : locale === 'sr' ? 'Otkaži' : 'Cancel'}
            </button>
          </div>
        </SidePanel>
      ) : null}

      {renderAdvancePaymentModal()}

      {renderEntitlementPaymentModal()}


      {showAddClientModal && (
        <SidePanel
          open
          onClose={closeAddClientModal}
          ariaLabel={billingCopy.newClientTitle}
          size="lg"
        >
          {isBillingMobileOrTablet ? (
            <SimpleClientCreatePage
              title={billingCopy.newClientTitle}
              closeLabel={locale === 'sl' ? 'Zapri' : 'Close'}
              submitLabel={locale === 'sl' ? 'Ustvari stranko' : 'Create client'}
              savingLabel={locale === 'sl' ? 'Shranjujem…' : 'Saving…'}
              draft={{
                firstName: newClientFirstName,
                lastName: newClientLastName,
                email: newClientEmail,
                phone: newClientPhone,
              }}
              labels={{
                firstName: billingCopy.clientFirstName,
                lastName: billingCopy.clientLastName,
                email: billingCopy.email,
                phone: billingCopy.telephone,
              }}
              saving={creatingClientInline}
              submitDisabled={creatingClientInline || !newClientFirstName.trim() || !newClientLastName.trim()}
              keyboardOpen={mobileKeyboardOpen}
              error={newClientInlineError}
              inputNamePrefix="calendra-billing-new-client"
              onClose={closeAddClientModal}
              onChange={(field, value) => {
                if (newClientInlineError) setNewClientInlineError('')
                if (field === 'firstName') setNewClientFirstName(value)
                else if (field === 'lastName') setNewClientLastName(value)
                else if (field === 'email') setNewClientEmail(value)
                else setNewClientPhone(value)
              }}
              onSubmit={(event) => {
                event.preventDefault()
                if (!creatingClientInline && newClientFirstName.trim() && newClientLastName.trim()) void createClientInline()
              }}
            />
          ) : (
            <>
            <PanelHeader
              title={billingCopy.newClientTitle}
              subtitle={billingCopy.newClientSubtitle}
              onClose={closeAddClientModal}
              closeLabel={locale === 'sl' ? 'Zapri' : 'Close'}
            />
            <PanelBody>
            <div className="billing-add-company-modal-body">
              <div className="form-grid">
                <Field label={billingCopy.clientFirstName}>
                  <input value={newClientFirstName} onChange={(e) => { setNewClientInlineError(''); setNewClientFirstName(e.target.value) }} placeholder={billingCopy.clientFirstName} />
                </Field>
                <Field label={billingCopy.clientLastName}>
                  <input value={newClientLastName} onChange={(e) => { setNewClientInlineError(''); setNewClientLastName(e.target.value) }} placeholder={billingCopy.clientLastName} />
                </Field>
                <Field label={billingCopy.email}>
                  <input type="email" value={newClientEmail} onChange={(e) => { setNewClientInlineError(''); setNewClientEmail(e.target.value) }} placeholder={billingCopy.emailOptional} />
                </Field>
                <Field label={billingCopy.telephone}>
                  <input value={newClientPhone} onChange={(e) => { setNewClientInlineError(''); setNewClientPhone(e.target.value) }} placeholder={billingCopy.telephoneOptional} />
                </Field>
              </div>
              {newClientInlineError ? <div className="error">{newClientInlineError}</div> : null}
            </div>
            </PanelBody>
            <PanelFooter>
              <PanelButton onClick={closeAddClientModal}>{t('cancel')}</PanelButton>
              <PanelButton
                variant="primary"
                icon={<GuestConfigSaveIcon />}
                onClick={() => void createClientInline()}
                disabled={creatingClientInline || !newClientFirstName.trim() || !newClientLastName.trim()}
              >
                {creatingClientInline ? billingCopy.creating : billingCopy.create}
              </PanelButton>
            </PanelFooter>
            </>
          )}
        </SidePanel>
      )}

      {showAddCompanyModal && (
        <SidePanel
          open
          onClose={closeAddCompanyModal}
          ariaLabel={billingCopy.newCompanyTitle}
          size="lg"
        >
            <PanelHeader
              title={billingCopy.newCompanyTitle}
              subtitle={billingCopy.newCompanySubtitle}
              onClose={closeAddCompanyModal}
              closeLabel={locale === 'sl' ? 'Zapri' : 'Close'}
            />
            <PanelBody>
            <div className="billing-add-company-modal-body">
              <div className="form-grid">
                <Field label={billingCopy.companyName}>
                  <input value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} placeholder={billingCopy.companyName} />
                </Field>
                <Field label={billingCopy.email}>
                  <input type="email" value={newCompanyEmail} onChange={(e) => setNewCompanyEmail(e.target.value)} placeholder={billingCopy.emailOptional} />
                </Field>
                <Field label={billingCopy.telephone}>
                  <input value={newCompanyTelephone} onChange={(e) => setNewCompanyTelephone(e.target.value)} placeholder={billingCopy.telephoneOptional} />
                </Field>
              </div>
            </div>
            </PanelBody>
            <PanelFooter>
              <PanelButton onClick={closeAddCompanyModal}>{t('cancel')}</PanelButton>
              <PanelButton
                variant="primary"
                icon={<GuestConfigSaveIcon />}
                onClick={() => void createCompanyInline()}
                disabled={creatingCompany || !newCompanyName.trim()}
              >
                {creatingCompany ? billingCopy.creating : billingCopy.create}
              </PanelButton>
            </PanelFooter>
        </SidePanel>
      )}

      <ConfirmDialog
        open={bankTransferQrMissingModal != null}
        onClose={() => setBankTransferQrMissingModal(null)}
        title={locale === 'sl' ? 'Manjkajoči podatki za bančno nakazilo' : 'Missing bank transfer data'}
        text={locale === 'sl'
          ? 'Računa z bančnim nakazilom in UPN QR kodo ni mogoče zaključiti, dokler niso izpolnjeni vsi obvezni podatki podjetja.'
          : 'An invoice with bank transfer and UPN QR cannot be closed until all required company data is filled in.'}
        confirmLabel={locale === 'sl' ? 'Odpri podatke podjetja' : 'Open company details'}
        cancelLabel={locale === 'sl' ? 'Zapri' : 'Close'}
        onConfirm={() => {
          setBankTransferQrMissingModal(null)
          navigate('/configuration?tab=company')
        }}
      >
        {bankTransferQrMissingModal ? (
          <ul className="billing-bank-transfer-settings-list">
            {bankTransferQrMissingModal.missingKeys.map((key) => (
              <li key={key}>{BANK_TRANSFER_QR_FIELD_LABELS[key]?.[locale] || key}</li>
            ))}
          </ul>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={stripeSetupMissingModal != null}
        onClose={() => setStripeSetupMissingModal(null)}
        title={locale === 'sl' ? 'Stripe ni nastavljen' : 'Stripe is not set up'}
        text={stripeSetupMissingModal?.rawMessage
          || (locale === 'sl'
            ? 'Računa s plačilom Kartica ni mogoče zaključiti, dokler Stripe ni povezan in omogočen za plačila. Odprite Konfiguracija → Obračun → Stripe in dokončajte povezavo računa.'
            : 'An invoice with Card payment cannot be closed until Stripe is connected and enabled for payments. Open Configuration → Billing → Stripe and finish connecting the account.')}
        confirmLabel={locale === 'sl' ? 'Odpri Stripe nastavitve' : 'Open Stripe settings'}
        cancelLabel={locale === 'sl' ? 'Zapri' : 'Close'}
        onConfirm={() => {
          setStripeSetupMissingModal(null)
          navigate('/configuration?tab=billing&subtab=stripe')
        }}
      />

      {(billDrawerOpen || fiscalLogBill || detailFolioBill) && (
        <SidePanel
          open
          onClose={closeFolioPanel}
          ariaLabel={detailFolioBill
            ? `${locale === 'sl' || locale === 'sr' ? 'Račun' : 'Invoice'} #${detailFolioBill.billNumber || detailFolioBill.id}`
            : (locale === 'sl' || locale === 'sr' ? 'Račun' : 'Invoice')}
          size="lg"
          className="billing-folio-side-panel"
        >
          <PanelHeader
            title={detailFolioBill
              ? `${locale === 'sl' || locale === 'sr' ? 'Račun' : 'Invoice'} #${detailFolioBill.billNumber || detailFolioBill.id}`
              : (locale === 'sl' || locale === 'sr' ? 'Račun' : 'Invoice')}
            subtitle={detailFolioBill
              ? `${detailFolioBill.billingTarget === 'COMPANY'
                ? (detailFolioBill.recipientCompany?.name || '—')
                : (detailFolioBill.client ? fullName(detailFolioBill.client) : '—')} · ${formatDate(detailFolioBill.issueDate || '')}`
              : undefined}
            onClose={closeFolioPanel}
            closeLabel={locale === 'sl' ? 'Zapri' : 'Close'}
          />
          <PanelTabs
            label={locale === 'sl' ? 'Podrobnosti računa' : 'Invoice details'}
            activeId={folioPanelTab}
            onSelect={(id) => setFolioPanelTab(id === 'fiscal' ? 'fiscal' : 'invoice')}
            tabs={[
              {
                id: 'invoice',
                label: locale === 'sl' ? 'Račun' : 'Invoice',
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M6 3h9l3 3v15H6z" />
                    <path d="M15 3v4h4" />
                    <path d="M9 11h6M9 15h6" />
                  </svg>
                ),
              },
              {
                id: 'fiscal',
                label: locale === 'sl' ? 'Davčno potrjevanje' : 'Tax confirmation',
                hidden: !fiscalCashRegisterEnabled,
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M7 3h10v4a5 5 0 0 1-10 0z" />
                    <path d="M12 12v9" />
                    <path d="M8 21h8" />
                    <path d="m9.5 7 1.7 1.7L15 5" />
                  </svg>
                ),
              },
            ]}
          />

          <PanelBody>
            <div className="billing-folio-modal-body">
              {folioPanelTab === 'invoice' ? (
                detailFolioBill ? (
                  <div className="billing-folio-invoice-view">
                    {detailFolioBill.refundReference ? (
                      <div className="billing-folio-reference-note">{detailFolioBill.refundReference}</div>
                    ) : null}

                    <section className="billing-folio-section">
                      <h3 className="billing-folio-section-title">
                        <span className="billing-folio-section-title__icon" aria-hidden>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 3h9l3 3v15H6z" />
                            <path d="M15 3v4h4" />
                            <path d="M9 11h6M9 15h6" />
                          </svg>
                        </span>
                        {locale === 'sl' ? 'Podatki o računu' : 'Invoice details'}
                      </h3>
                      <div className="billing-folio-detail-grid">
                        <div className="billing-folio-detail-field">
                          <span>{locale === 'sl' ? 'Order ID' : 'Order ID'}</span>
                          <strong>{displayInvoiceOrderId(detailFolioBill)}</strong>
                        </div>
                        <div className="billing-folio-detail-field">
                          <span>{locale === 'sl' ? 'Izdano' : 'Issued'}</span>
                          <strong>{formatDate(detailFolioBill.issueDate)}</strong>
                        </div>
                        <div className="billing-folio-detail-field">
                          <span>{locale === 'sl' ? 'Zaposleni' : 'Employee'}</span>
                          <strong>{fullName(detailFolioBill.consultant)}</strong>
                        </div>
                        <div className="billing-folio-detail-field">
                          <span>{locale === 'sl' ? 'Posvetovanje' : 'Session'}</span>
                          <strong>{formatBillingSessionIdDisplay(detailFolioBill.sessionId)}</strong>
                        </div>
                        <div className="billing-folio-detail-field">
                          <span>{locale === 'sl' ? 'Način plačila' : 'Payment method'}</span>
                          <strong>{detailFolioBill.paymentMethod ? detailFolioBill.paymentMethod.name : '—'}</strong>
                        </div>
                        <div className="billing-folio-detail-field billing-folio-detail-field--status">
                          <span>{locale === 'sl' ? 'Status plačila' : 'Payment status'}</span>
                          <strong>
                            <span className={`billing-status-pill billing-status-pill--${paymentStatusClass(detailFolioBill.paymentStatus)}`}>
                              {paymentStatusLabel(detailFolioBill.paymentStatus)}
                            </span>
                          </strong>
                        </div>
                      </div>
                    </section>

                    <section className="billing-folio-section">
                      <h3 className="billing-folio-section-title">
                        <span className="billing-folio-section-title__icon" aria-hidden>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 7h14v12H5z" />
                            <path d="M8 7V5h8v2" />
                          </svg>
                        </span>
                        {locale === 'sl' ? 'Storitve' : 'Services'}
                      </h3>
                      <div className="billing-folio-items-table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>{locale === 'sl' ? 'Storitev' : 'Service'}</th>
                              <th>{locale === 'sl' ? 'Kol.' : 'Qty'}</th>
                              <th>{locale === 'sl' ? 'Bruto' : 'Gross'}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detailFolioBill.items?.map((item, index) => (
                              <tr key={item.id ?? `${item.transactionService?.id || 'service'}-${index}`}>
                                <td>{billingServiceDisplayLabel(item.transactionService)}</td>
                                <td>{item.quantity}</td>
                                <td>{currency(item.grossPrice)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="billing-folio-total-card">
                        <span>{locale === 'sl' ? 'Skupaj bruto' : 'Total gross'}</span>
                        <strong>{currency(detailFolioBill.totalGross)}</strong>
                      </div>
                    </section>

                    <section className="billing-folio-section">
                      <h3 className="billing-folio-section-title">
                        <span className="billing-folio-section-title__icon" aria-hidden>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 7h16v10H4z" />
                            <path d="M4 10h16" />
                          </svg>
                        </span>
                        {locale === 'sl' ? 'Plačila' : 'Payments'}
                      </h3>
                      <div className="billing-folio-payment-table">
                        <div className="billing-folio-payment-table__head">
                          <span>{locale === 'sl' ? 'Način plačila' : 'Payment method'}</span>
                          <span>{locale === 'sl' ? 'Znesek' : 'Amount'}</span>
                          <span>{locale === 'sl' ? 'Datum' : 'Date'}</span>
                        </div>
                        {(detailFolioBill.paymentSplits?.length
                          ? detailFolioBill.paymentSplits
                          : detailFolioBill.paymentMethod
                            ? [{ paymentMethod: detailFolioBill.paymentMethod, amountGross: detailFolioBill.totalGross }]
                            : []).map((split, index) => (
                          <div className="billing-folio-payment-table__row" key={`${split.paymentMethod?.id ?? 'payment'}-${index}`}>
                            <strong>{split.paymentMethod?.name || '—'}</strong>
                            <strong>{currency(split.amountGross)}</strong>
                            <strong>{formatDate(detailFolioBill.paidAt || detailFolioBill.issueDate)}</strong>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="billing-folio-section billing-folio-section--notes">
                      <h3 className="billing-folio-section-title">
                        <span className="billing-folio-section-title__icon" aria-hidden>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 4h14v16H5z" />
                            <path d="M8 8h8M8 12h8M8 16h5" />
                          </svg>
                        </span>
                        {locale === 'sl' ? 'Opombe' : 'Notes'}
                      </h3>
                      <div className="billing-folio-notes-value">—</div>
                    </section>

                    <div className="billing-folio-actions">
                      {canRefundBill(detailFolioBill) ? (
                        <button
                          type="button"
                          className="billing-folio-action-btn billing-folio-action-btn--danger billing-folio-action-btn--refund"
                          onClick={() => refundBill(detailFolioBill)}
                          disabled={refundingBillId === detailFolioBill.id}
                        >
                          <span aria-hidden>
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 7v6h6" />
                              <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
                            </svg>
                          </span>
                          {refundingBillId === detailFolioBill.id ? (locale === 'sl' ? 'Vračilo…' : 'Refunding…') : (locale === 'sl' ? 'Vračilo' : 'Refund')}
                        </button>
                      ) : null}
                      <div className="billing-folio-actions__right">
                        <button
                          type="button"
                          className="billing-folio-action-btn billing-folio-action-btn--secondary"
                          onClick={() => void printFolioPdf(detailFolioBill)}
                          disabled={printingBillId === detailFolioBill.id}
                        >
                          <span aria-hidden>
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M6 9V2h12v7" />
                              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                              <path d="M6 14h12v8H6z" />
                            </svg>
                          </span>
                          {printingBillId === detailFolioBill.id
                            ? (locale === 'sl' ? 'Pripravljam…' : 'Preparing…')
                            : (locale === 'sl' ? 'Natisni' : locale === 'sr' ? 'Štampaj' : 'Print')}
                        </button>
                        <button
                          type="button"
                          className="billing-folio-action-btn billing-folio-action-btn--secondary"
                          onClick={() => void downloadFolioPdf(detailFolioBill, 'A4')}
                        >
                          <span aria-hidden>
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <path d="M7 10l5 5 5-5" />
                              <path d="M12 15V3" />
                            </svg>
                          </span>
                          {locale === 'sl' ? 'Prenesi PDF' : locale === 'sr' ? 'Preuzmi PDF' : 'Download PDF'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null
              ) : loadingFiscalLog ? (
                <p className="billing-folio-muted">{locale === 'sl' ? 'Nalaganje fiskalizacijskega dnevnika…' : 'Loading fiscal log…'}</p>
              ) : fiscalLogRows.length === 0 ? (
                <EmptyState
                  title={locale === 'sl' ? 'Fiskalizacijskega dnevnika še ni' : 'No fiscal log yet'}
                  text={locale === 'sl' ? 'Za prikaz podrobnosti zaženite ponovno fiskalizacijo.' : 'Run Retry fiscal to capture transmission details.'}
                />
              ) : (
                <div className="billing-folio-fiscal-view">
                  <div className="billing-folio-items-table-wrap billing-folio-items-table-wrap--fiscal">
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: 70 }}>{locale === 'sl' ? 'Korak' : 'Step'}</th>
                          <th>{locale === 'sl' ? 'Status' : 'Status'}</th>
                          <th style={{ width: 190 }}>{locale === 'sl' ? 'Čas' : 'Time'}</th>
                          <th>{locale === 'sl' ? 'Podrobnosti' : 'Details'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fiscalLogRows.map((row, idx) => (
                          <tr key={`${row.title || 'step'}-${idx}`}>
                            <td>{idx + 1}</td>
                            <td>{row.title || `Step ${idx + 1}`}</td>
                            <td>{row.at ? String(row.at).replace('T', ' ').replace('Z', '') : '—'}</td>
                            <td>{row.detail || ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Field label={locale === 'sl' ? 'Zahteva' : 'Request'}>
                    <textarea rows={8} readOnly value={fiscalLogRequestBody || (locale === 'sl' ? 'Zahteva še ni zabeležena.' : 'No request captured yet.')} />
                  </Field>
                  <Field label={locale === 'sl' ? 'Odgovor' : 'Response'}>
                    <textarea rows={8} readOnly value={fiscalLogResponseBody || (locale === 'sl' ? 'Odgovor še ni zabeležen.' : 'No response captured yet.')} />
                  </Field>
                </div>
              )}
            </div>
          </PanelBody>
        </SidePanel>
      )}
    </div>
  )
}
