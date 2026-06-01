import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser'
import { api } from '../api'
import { getStoredUser } from '../auth'
import type { Bill, BillingService, Booking, Client, Company, OpenBill, PaymentMethod, PaymentSplit, User } from '../lib/types'
import { normalizePaymentMethod } from '../lib/types'
import { Card, EmptyState, Field, PageHeader } from '../components/ui'
import { useToast } from '../components/Toast'
import { useLocale, type AppLocale } from '../locale'

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
type DiscountType = 'PERCENT' | 'AMOUNT'

type DiscountDraft = { type: DiscountType; value: string }

type BillForm = {
  clientId?: number
  consultantId?: number
  paymentMethodId?: number
  bankTransferReference?: string
  billingTarget: 'PERSON' | 'COMPANY'
  recipientCompanyId?: number
  billType: BillDocumentType
  sessionId?: number
  paymentSplits?: OpenBillPaymentSplitDraft[]
  discountType?: DiscountType
  discountValue?: string
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
  sourceAdvanceBillId?: number | null
}

type OpenBillDetailsDraft = {
  billingTarget: 'PERSON' | 'COMPANY'
  clientId?: number
  recipientCompanyId?: number
  consultantId?: number
  sessionId?: number
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
  entitlement?: { id?: number | null; code?: string | null; productName?: string | null } | null
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
}

const ENTITLEMENT_PAYMENT_OPTION_VALUE = '__ENTITLEMENT_PAYMENT__'


/** Lines that share service + gross unit price + session are combined; quantities add (gross is authoritative). */
function openBillLineMergeKey(item: {
  openBillItemId?: number
  clientRowKey?: string
  transactionServiceId: number
  netPrice: string
  grossPrice: string
  sourceSessionBookingId?: number | null
  sourceAdvanceBillId?: number | null
}) {
  if (item.openBillItemId != null && item.openBillItemId > 0) {
    return `id:${item.openBillItemId}`
  }
  if (item.clientRowKey) {
    return `client:${item.clientRowKey}`
  }
  const sid = item.sourceSessionBookingId == null ? '' : String(item.sourceSessionBookingId)
  const aid = item.sourceAdvanceBillId == null ? '' : String(item.sourceAdvanceBillId)
  const gross = Number(item.grossPrice || 0)
  const grossKey = Number.isFinite(gross) ? gross.toFixed(2) : '0.00'
  return `${item.transactionServiceId}|${grossKey}|${sid}|${aid}`
}

function mergeDuplicateOpenBillLines(items: OpenBillEditItem[]): OpenBillEditItem[] {
  if (items.length < 2) return items
  const byKey = new Map<string, OpenBillEditItem>()
  const order: string[] = []
  for (const item of items) {
    const key = openBillLineMergeKey(item)
    const cur = byKey.get(key)
    if (!cur) {
      byKey.set(key, {
        openBillItemId: item.openBillItemId,
        clientRowKey: item.clientRowKey,
        transactionServiceId: item.transactionServiceId,
        quantity: item.quantity,
        netPrice: String(item.netPrice),
        grossPrice: String(item.grossPrice),
        sourceSessionBookingId: item.sourceSessionBookingId ?? null,
        sourceAdvanceBillId: item.sourceAdvanceBillId ?? null,
      })
      order.push(key)
    } else {
      cur.quantity = cur.quantity + item.quantity
    }
  }
  return order.map((k) => byKey.get(k)!)
}

function paymentTypeLabel(value: string | null | undefined, loc: AppLocale): string {
  if (loc === 'sl') {
    if (value === 'BANK_TRANSFER') return 'BANK. NAKAZILO'
    if (value === 'OTHER') return 'DRUGO'
    return value || '—'
  }
  if (value === 'BANK_TRANSFER') return 'BANK TRANSFER'
  if (value === 'OTHER') return 'OTHER'
  return value || '—'
}
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

const matchRemainingIcon = (): ReactNode => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3 10.6 7.2 6.5 8.6l4.1 1.4L12 14l1.4-4 4.1-1.4-4.1-1.4L12 3Z" />
    <path d="M5 15.5 4.2 18 2 18.8 4.2 19.6 5 22l.8-2.4L8 18.8 5.8 18 5 15.5Z" />
    <path d="M18 14l-.9 2.7-2.6.9 2.6.9L18 21l.9-2.5 2.6-.9-2.6-.9L18 14Z" />
  </svg>
)

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
function paymentTypeBadgeLabel(value: string | null | undefined, loc: AppLocale): string {
  if (loc === 'sl') {
    return value === 'BANK_TRANSFER'
      ? 'Nakazilo'
      : value === 'CASH'
        ? 'Gotovina'
        : value === 'CARD'
          ? 'Kartica'
          : value === 'ADVANCE'
            ? 'Predplačilo'
            : value === 'OTHER'
              ? 'Drugo'
              : '—'
  }
  return value === 'BANK_TRANSFER'
    ? 'Transfer'
    : value === 'CASH'
      ? 'Cash'
      : value === 'CARD'
        ? 'Card'
        : value === 'ADVANCE'
          ? 'Advance'
          : value === 'OTHER'
            ? 'Other'
            : '—'
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

function formatAmountForInput(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return ''
  return value.toFixed(2)
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

const billingTabIcon = (tab: 'open' | 'openPayments' | 'unusedAdvances' | 'history'): ReactNode => {
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
}

/** API `billType`; missing values default to invoice. */
function normalizeBillType(bill: Bill): BillDocumentType {
  const raw = String(bill.billType ?? '').toUpperCase().trim()
  if (raw === 'ADVANCE') return 'ADVANCE'
  return 'INVOICE'
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

type OpenBillsSortField = 'gross' | 'client' | 'date'
type HistorySortField = 'gross' | 'folio' | 'date'
type SortDir = 'asc' | 'desc'
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
function getHistorySortOptions(loc: AppLocale): Array<{ field: HistorySortField; label: string }> {
  if (loc === 'sl') {
    return [
      { field: 'date', label: 'Datum' },
      { field: 'gross', label: 'Bruto' },
      { field: 'folio', label: 'Št. lista' },
    ]
  }
  return [
    { field: 'date', label: 'Date' },
    { field: 'gross', label: 'Gross' },
    { field: 'folio', label: 'Folio no.' },
  ]
}

export type EmbeddedCreateBillRequest = {
  billType: BillDocumentType
  sessionId?: number | null
  clientId?: number | null
  clientIds?: number[] | null
  consultantId?: number | null
  billingTarget?: 'PERSON' | 'COMPANY'
  recipientCompanyId?: number | null
}

export type BillingPageProps = {
  embeddedOpenBillId?: number | null
  embeddedCreateBill?: EmbeddedCreateBillRequest | null
  onEmbeddedClose?: () => void
  onEmbeddedSaved?: () => void | Promise<void>
}

export function BillingPage({ embeddedOpenBillId = null, embeddedCreateBill = null, onEmbeddedClose, onEmbeddedSaved }: BillingPageProps = {}) {
  const me = getStoredUser()!
  const isAdmin = me.role === 'ADMIN' || me.role === 'SUPER_ADMIN'
  const { showToast } = useToast()
  const { t, locale } = useLocale()
  const routeParams = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const routedOpenBillId = Number(routeParams.openBillId ?? 0)
  const activeRouteOpenBillId = Number.isInteger(routedOpenBillId) && routedOpenBillId > 0 ? routedOpenBillId : null
  const activeEmbeddedOpenBillId = Number(embeddedOpenBillId ?? 0)
  const activeOpenBillId = Number.isInteger(activeEmbeddedOpenBillId) && activeEmbeddedOpenBillId > 0
    ? activeEmbeddedOpenBillId
    : activeRouteOpenBillId
  const editorOnlyMode = activeOpenBillId != null && (embeddedOpenBillId != null || activeRouteOpenBillId != null)
  const embeddedCreateMode = embeddedCreateBill != null
  const overlayOnlyMode = editorOnlyMode || embeddedCreateMode
  const billingCopy = locale === 'sl' ? {
    newCompanyTitle: 'Novo podjetje',
    newCompanySubtitle: 'Obvezno je samo ime podjetja.',
    companyName: 'Ime podjetja',
    email: 'E-pošta',
    telephone: 'Telefon',
    emailOptional: 'E-pošta (neobvezno)',
    telephoneOptional: 'Telefon (neobvezno)',
    creating: 'Ustvarjam…',
    create: 'Ustvari',
    historySearchPlaceholder:
      'Iskanje po številki računa, ID seje, stranki, zaposlenem, načinu plačila …',
    historyStatusAll: 'Vsi statusi',
    historyStatusPaid: 'Plačano',
    historyStatusPending: 'Čaka na plačilo',
    historyStatusOpen: 'Odprt',
    historyStatusCancelled: 'Preklicano',
    historyFilterStatusAria: 'Filtriraj po statusu plačila',
    historyFilterDateAria: 'Filtriraj po datumu izdaje',
    historyFilterBillTypeAria: 'Filtriraj po vrsti dokumenta',
    historyBillTypeAll: 'Vsi dokumenti',
    historyBillTypeInvoice: 'Račun',
    historyBillTypeAdvance: 'Avans',
    historyBillTypeColumn: 'Vrsta',
    historyEmptyTitle: 'Ni še računov',
    historyEmptyText:
      'Pod odprtimi računi uporabite gumb Novo za ustvarjanje računa ali pretvorbo odprtega računa. Bančni izpisek uvozite z gumbom Uvozi bančni CSV.',
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
    sortOpenBillsAria: 'Razvrsti odprte račune',
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
    createOpenBill: 'Ustvari odprti račun',
    createBill: 'Ustvari račun',
    createBillAria: 'Ustvari račun',
    creatingBill: 'Ustvarjanje računa',
    paymentPickerAria: 'Izberi način plačila',
    billTypeInvoice: 'Račun',
    billTypeAdvance: 'Predplačilo',
    tabUnusedAdvances: 'Neizkoriščena predplačila',
    unusedAdvancesEmpty: 'Ni neizkoriščenih predplačil.',
    applyToOpenBill: 'Dodaj na odprti račun',
    selectOpenBillSession: 'Seja odprtega računa',
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
    advanceAppliedSuccess: 'Predplačilo je uspešno dodano na odprti račun.',
    openBillNeedsLinesForCreate: 'Dodajte vsaj eno postavko za odprti račun.',
    openBillNeedsConsultantPayment: 'Izberite način plačila.',
    openBillsColSessionId: 'ID seje',
    openBillsColSession: 'Seja',
    openBillsTotalGrossFirst: 'Skupaj',
    openBillsTotalGrossLast: 'bruto',
    manualOpenBillSessionLabel: 'Ročno ustvarjen odprti račun',
  } : {
    newCompanyTitle: 'New company',
    newCompanySubtitle: 'Required: company name.',
    companyName: 'Company name',
    email: 'Email',
    telephone: 'Telephone',
    emailOptional: 'Email (optional)',
    telephoneOptional: 'Telephone (optional)',
    creating: 'Creating…',
    create: 'Create',
    historySearchPlaceholder: 'Search folio by bill no., session ID, client, consultant, payment method...',
    historyStatusAll: 'All statuses',
    historyStatusPaid: 'Paid',
    historyStatusPending: 'Payment pending',
    historyStatusOpen: 'Open',
    historyStatusCancelled: 'Cancelled',
    historyFilterStatusAria: 'Filter by payment status',
    historyFilterDateAria: 'Filter by issued date',
    historyFilterBillTypeAria: 'Filter by document type',
    historyBillTypeAll: 'All',
    historyBillTypeInvoice: 'Invoice',
    historyBillTypeAdvance: 'Advance',
    historyBillTypeColumn: 'Type',
    historyEmptyTitle: 'No bills yet',
    historyEmptyText: 'Use New under Open bills to create a bill, or convert an open bill.',
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
    sortOpenBillsAria: 'Sort open bills',
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
    createOpenBill: 'Create Open Bill',
    createBill: 'Create bill',
    createBillAria: 'Create bill',
    creatingBill: 'Creating bill',
    paymentPickerAria: 'Select payment method',
    billTypeInvoice: 'Invoice',
    billTypeAdvance: 'Advance',
    tabUnusedAdvances: 'Unused advances',
    unusedAdvancesEmpty: 'No unused advances.',
    applyToOpenBill: 'Add to open bill',
    selectOpenBillSession: 'Open bill session',
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
    advanceAppliedSuccess: 'Advance has been applied to the open bill.',
    openBillNeedsLinesForCreate: 'Add at least one line item for the open bill.',
    openBillNeedsConsultantPayment: 'Select a payment method.',
    openBillsColSessionId: 'Session ID',
    openBillsColSession: 'Session',
    openBillsTotalGrossFirst: 'Total',
    openBillsTotalGrossLast: 'gross',
    manualOpenBillSessionLabel: MANUAL_OPEN_BILL_BACKEND_LABEL,
  }
  const openBillsSortOptions = useMemo(() => getOpenBillsSortOptions(locale), [locale])
  const historySortOptions = useMemo(() => getHistorySortOptions(locale), [locale])
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [services, setServices] = useState<BillingService[]>([])
  const [bills, setBills] = useState<Bill[]>([])
  const [openBills, setOpenBills] = useState<OpenBill[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [unusedAdvances, setUnusedAdvances] = useState<UnusedAdvance[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [billForm, setBillForm] = useState<BillForm>({ items: [], billingTarget: 'PERSON', billType: 'INVOICE' })
  const [showCreateBillModal, setShowCreateBillModal] = useState(false)
  const [editingCreateBillPayee, setEditingCreateBillPayee] = useState(false)
  const [creatingBill, setCreatingBill] = useState(false)
  const [creatingFromOpenId, setCreatingFromOpenId] = useState<number | null>(null)
  const [previewingOpenBillId, setPreviewingOpenBillId] = useState<number | null>(null)
  const [deletingOpenId, setDeletingOpenId] = useState<number | null>(null)
  const [detailOpenBill, setDetailOpenBill] = useState<OpenBill | null>(null)
  const [editPayeePopupOpen, setEditPayeePopupOpen] = useState(false)
  const [useOnePayeeForAllBills, setUseOnePayeeForAllBills] = useState(false)
  const [openBillEdits, setOpenBillEdits] = useState<Record<number, OpenBillEditItem[]>>({})
  const [openBillDetailsEdits, setOpenBillDetailsEdits] = useState<Record<number, OpenBillDetailsDraft>>({})
  const [openBillPaymentEdits, setOpenBillPaymentEdits] = useState<Record<number, OpenBillPaymentSplitDraft[]>>({})
  const [openBillDiscountEdits, setOpenBillDiscountEdits] = useState<Record<number, DiscountDraft>>({})
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
  const [historySearch, setHistorySearch] = useState('')
  const [historyDateFrom, setHistoryDateFrom] = useState('')
  const [historyDateTo, setHistoryDateTo] = useState('')
  const historyDateFromInputRef = useRef<HTMLInputElement | null>(null)
  const historyDateToInputRef = useRef<HTMLInputElement | null>(null)
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'paid' | 'payment_pending' | 'open' | 'cancelled'>('all')
  const [historyBillTypeFilter, setHistoryBillTypeFilter] = useState<'all' | BillDocumentType>('all')
  const [billingTab, setBillingTab] = useState<'open' | 'openPayments' | 'unusedAdvances' | 'history'>('open')
  const [selectedUnusedAdvanceId, setSelectedUnusedAdvanceId] = useState<number | null>(null)
  const [selectedApplyTarget, setSelectedApplyTarget] = useState<{ openBillId: number; sessionId: number } | null>(null)
  const [applyAmountNet, setApplyAmountNet] = useState('')
  const [advancePaymentModal, setAdvancePaymentModal] = useState<AdvancePaymentModalState | null>(null)
  const [advancePaymentDraftSelections, setAdvancePaymentDraftSelections] = useState<AdvancePaymentSelectionDraft[]>([])
  const [advancePaymentInitialSelections, setAdvancePaymentInitialSelections] = useState<AdvancePaymentSelectionDraft[]>([])
  const [advancePaymentShowOther, setAdvancePaymentShowOther] = useState(false)
  const [applyingAdvance, setApplyingAdvance] = useState(false)
  const [newCompanyName, setNewCompanyName] = useState('')
  const [newCompanyEmail, setNewCompanyEmail] = useState('')
  const [newCompanyTelephone, setNewCompanyTelephone] = useState('')
  const [creatingCompany, setCreatingCompany] = useState(false)
  const [showAddCompanyModal, setShowAddCompanyModal] = useState(false)
  const [addCompanyTarget, setAddCompanyTarget] = useState<{ mode: 'createBill' } | { mode: 'editOpenBill'; openBillId: number } | null>(null)
  const [recipientCompanySearch, setRecipientCompanySearch] = useState('')
  const [recipientCompanyPickerOpen, setRecipientCompanyPickerOpen] = useState(false)
  const [editingRecipientCompanySearch, setEditingRecipientCompanySearch] = useState(false)
  const [retryingFiscalBillId, setRetryingFiscalBillId] = useState<number | null>(null)
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
  const [historySortField, setHistorySortField] = useState<HistorySortField>('date')
  const [historySortDir, setHistorySortDir] = useState<SortDir>('asc')
  const [historySortMenuOpen, setHistorySortMenuOpen] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const [openPaymentsPage, setOpenPaymentsPage] = useState(1)
  const [unusedAdvancesPage, setUnusedAdvancesPage] = useState(1)
  const [splittingSessionKey, setSplittingSessionKey] = useState<string | null>(null)
  const [expandedBatchSessionId, setExpandedBatchSessionId] = useState<number | null>(null)
  const batchInvoicesRef = useRef<HTMLDivElement | null>(null)
  const [creatingManualOpenBill, setCreatingManualOpenBill] = useState(false)
  const [isOpenBillsMobile, setIsOpenBillsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 760px)').matches : false,
  )

  const load = async () => {
    const [settingsRes, servicesRes, billsRes, openBillsRes, bookingsRes, unusedAdvancesRes, clientsRes, companiesRes, usersRes, paymentMethodsRes] = await Promise.all([
      api.get('/settings').catch(() => ({ data: {} })),
      api.get('/billing/services'),
      api.get('/billing/bills'),
      api.get('/billing/open-bills'),
      api.get('/bookings').catch(() => ({ data: [] })),
      api.get('/billing/unused-advances').catch(() => ({ data: [] })),
      api.get('/clients'),
      api.get('/companies'),
      isAdmin ? api.get('/users') : Promise.resolve({ data: [] }),
      api.get('/billing/payment-methods').catch(() => ({ data: [] })),
    ])
    setSettings(settingsRes.data || {})
    setServices(servicesRes.data)
    setBills((billsRes.data || []).map((b: Bill) => normalizeBill(b)))
    setOpenBills((openBillsRes.data || []).map((ob: OpenBill) => normalizeOpenBill(ob)))
    setBookings(bookingsRes.data || [])
    setUnusedAdvances(settingsRes.data?.BILLING_ADVANCE_ENABLED === 'false' ? [] : (unusedAdvancesRes.data || []))
    setClients(clientsRes.data)
    setCompanies(companiesRes.data || [])
    setUsers(usersRes.data)
    setPaymentMethods((paymentMethodsRes.data || []).map((p: PaymentMethod) => normalizePaymentMethod(p)!))
    return {
      openBills: (openBillsRes.data || []).map((ob: OpenBill) => normalizeOpenBill(ob)) as OpenBill[],
    }
  }
  useEffect(() => { load() }, [])
  useEffect(() => {
    const interval = window.setInterval(() => { void load() }, 30000)
    return () => window.clearInterval(interval)
  }, [])

  const advanceBillingEnabled = settings.BILLING_ADVANCE_ENABLED !== 'false'
  const visiblePaymentMethods = useMemo(
    () => advanceBillingEnabled ? paymentMethods : paymentMethods.filter((method) => !isDepositPaymentMethod(method)),
    [advanceBillingEnabled, paymentMethods],
  )

  useEffect(() => {
    if (!advanceBillingEnabled && billingTab === 'unusedAdvances') {
      setBillingTab('open')
      setSelectedUnusedAdvanceId(null)
    }
  }, [advanceBillingEnabled, billingTab])

  const embeddedCreateKey = embeddedCreateBill
    ? [
        embeddedCreateBill.billType,
        embeddedCreateBill.sessionId ?? '',
        embeddedCreateBill.clientId ?? '',
        (embeddedCreateBill.clientIds ?? []).join(','),
        embeddedCreateBill.consultantId ?? '',
        embeddedCreateBill.billingTarget ?? '',
        embeddedCreateBill.recipientCompanyId ?? '',
      ].join(':')
    : ''
  const embeddedCreateKeyRef = useRef('')

  useEffect(() => {
    if (!embeddedCreateBill) return
    if (embeddedCreateBill.billType === 'ADVANCE' && !advanceBillingEnabled) {
      embeddedCreateKeyRef.current = ''
      setShowCreateBillModal(false)
      onEmbeddedClose?.()
      return
    }
    if (embeddedCreateKeyRef.current === embeddedCreateKey) return
    embeddedCreateKeyRef.current = embeddedCreateKey
    const defaultPaymentMethodId = visiblePaymentMethods.find((method) => !isDepositPaymentMethod(method))?.id ?? visiblePaymentMethods[0]?.id
    const normalizedBillingTarget = embeddedCreateBill.billingTarget === 'COMPANY' ? 'COMPANY' : 'PERSON'
    const embeddedClientIds = Array.from(new Set([embeddedCreateBill.clientId, ...(embeddedCreateBill.clientIds ?? [])]
      .map((value) => Number(value ?? 0))
      .filter((value) => Number.isInteger(value) && value > 0)))
    setBillForm({
      items: [],
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
  }, [embeddedCreateBill, embeddedCreateKey, visiblePaymentMethods, advanceBillingEnabled, me.id])
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

  const normalizeOpenBill = (ob: OpenBill): OpenBill => ({
    ...ob,
    discountType: ob.discountType ?? null,
    discountValue: ob.discountValue == null ? null : Number(ob.discountValue),
    discountAmountGross: ob.discountAmountGross == null ? null : Number(ob.discountAmountGross),
    discountedTotalGross: ob.discountedTotalGross == null ? null : Number(ob.discountedTotalGross),
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
  })

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

  const updateOpenBillDetailsDraft = (ob: OpenBill, patch: Partial<OpenBillDetailsDraft>) => {
    const current = getOpenBillDetailsDraft(ob)
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

    setOpenBillDetailsEdits((prev) => ({ ...prev, [ob.id]: next }))
  }

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
    const mq = window.matchMedia('(max-width: 760px)')
    const apply = () => setIsOpenBillsMobile(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

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

  const grossPreview = useMemo(() => billForm.items.reduce((sum, item) => {
    const gross = Number(item.grossPrice || 0)
    return sum + (Number.isFinite(gross) ? gross : 0) * Number(item.quantity || 0)
  }, 0), [billForm.items])
  const advanceDeductionIds = useMemo(
    () => advanceBillingEnabled ? parseAdvanceDeductionServiceIds(settings.ADVANCE_DEDUCTION_TRANSACTION_SERVICE_ID) : new Set<number>(),
    [advanceBillingEnabled, settings.ADVANCE_DEDUCTION_TRANSACTION_SERVICE_ID],
  )
  const advanceBillServices = useMemo(
    () => services.filter((s) => advanceDeductionIds.has(s.id)),
    [services, advanceDeductionIds],
  )
  const openBillSelectableServices = useMemo(
    () => services.filter((s) => !advanceDeductionIds.has(s.id)),
    [services, advanceDeductionIds],
  )
  const availableBillServices = useMemo(
    () => (billForm.billType === 'ADVANCE' ? advanceBillServices : openBillSelectableServices),
    [billForm.billType, advanceBillServices, openBillSelectableServices],
  )
  const selectableServicesForOpenBill = (ob: OpenBill | null | undefined) => (
    String(ob?.billType || 'INVOICE').toUpperCase() === 'ADVANCE' ? advanceBillServices : openBillSelectableServices
  )

  const normalizeDiscountType = (value: unknown): DiscountType => (String(value || '').toUpperCase() === 'AMOUNT' ? 'AMOUNT' : 'PERCENT')

  const sanitizeDiscountValueInput = (value: string) => value.replace(/[^0-9.,]/g, '').replace(',', '.')

  const discountValueNumber = (draft: DiscountDraft | null | undefined) => {
    const parsed = Number(String(draft?.value ?? '').replace(',', '.'))
    if (!Number.isFinite(parsed) || parsed <= 0) return 0
    return draft?.type === 'PERCENT' ? Math.min(100, parsed) : parsed
  }

  const calculateDiscountGross = (subtotalGross: number, draft: DiscountDraft | null | undefined) => {
    const subtotal = Math.max(0, Number(subtotalGross || 0))
    const value = discountValueNumber(draft)
    if (subtotal <= 0 || value <= 0) return 0
    const discount = draft?.type === 'PERCENT' ? subtotal * (value / 100) : value
    return Number(Math.min(subtotal, Math.max(0, discount)).toFixed(2))
  }

  const payableGrossAfterDiscount = (subtotalGross: number, draft: DiscountDraft | null | undefined) => {
    const subtotal = Math.max(0, Number(subtotalGross || 0))
    return Number(Math.max(0, subtotal - calculateDiscountGross(subtotal, draft)).toFixed(2))
  }

  const getCreateBillDiscountDraft = (): DiscountDraft => ({
    type: normalizeDiscountType(billForm.discountType),
    value: billForm.discountValue ?? '0',
  })

  const getOpenBillDiscountDraft = (ob: OpenBill | null | undefined): DiscountDraft => {
    if (!ob) return { type: 'PERCENT', value: '0' }
    const edited = openBillDiscountEdits[ob.id]
    if (edited) return edited
    const type = normalizeDiscountType(ob.discountType)
    const rawValue = ob.discountValue
    const fallbackAmount = ob.discountAmountGross
    const value = rawValue != null
      ? String(rawValue)
      : (type === 'AMOUNT' && fallbackAmount != null ? String(fallbackAmount) : '0')
    return { type, value }
  }

  const setOpenBillDiscountDraft = (ob: OpenBill, patch: Partial<DiscountDraft>) => {
    const current = getOpenBillDiscountDraft(ob)
    setOpenBillDiscountEdits((prev) => ({
      ...prev,
      [ob.id]: {
        type: patch.type ?? current.type,
        value: patch.value ?? current.value,
      },
    }))
  }

  const openBillPayableGross = (ob: OpenBill, items = getOpenBillItems(ob)) => {
    const subtotal = estimateGross(items)
    return payableGrossAfterDiscount(subtotal, getOpenBillDiscountDraft(ob))
  }

  const discountPayloadFields = (draft: DiscountDraft, subtotalGross: number) => {
    const value = discountValueNumber(draft)
    const amountGross = calculateDiscountGross(subtotalGross, draft)
    return {
      discountType: draft.type,
      discountValue: value,
      discountAmountGross: amountGross,
      discountedTotalGross: payableGrossAfterDiscount(subtotalGross, draft),
    }
  }

  const createBillDiscountDraft = getCreateBillDiscountDraft()
  const createBillDiscountGross = billForm.billType === 'INVOICE'
    ? calculateDiscountGross(grossPreview, createBillDiscountDraft)
    : 0
  const createBillPayableGross = billForm.billType === 'INVOICE'
    ? payableGrossAfterDiscount(grossPreview, createBillDiscountDraft)
    : grossPreview
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

  const filteredOpenBills = useMemo(() => {
    const q = openBillsSearch.trim().toLowerCase()
    const filtered = !q
      ? openBills
      : openBills.filter((ob) => {
        const sessionId = String(ob.sessionDisplayId || ob.sessionId || '').toLowerCase()
        const client = openBillClientLabel(ob).toLowerCase()
        const consultant = openBillConsultantLabel(ob).toLowerCase()
        const session = String(ob.sessionInfo || '').toLowerCase()
        const method = String(ob.paymentMethod?.name || '').toLowerCase()
        const groupClients = getOpenBillListGroupMembers(ob).map((entry) => openBillClientLabel(entry).toLowerCase()).join(' ')
        return sessionId.includes(q) || client.includes(q) || consultant.includes(q) || session.includes(q) || method.includes(q) || groupClients.includes(q)
      })
    return groupOpenBillRowsForSession(filtered)
  }, [openBills, openBillsSearch, locale])

  const filteredHistoryBills = useMemo(() => {
    const q = historySearch.trim().toLowerCase()
    const from = historyDateFrom ? Date.parse(`${historyDateFrom}T00:00:00`) : Number.NEGATIVE_INFINITY
    const to = historyDateTo ? Date.parse(`${historyDateTo}T23:59:59`) : Number.POSITIVE_INFINITY
    const byDate = bills.filter((bill) => {
      const ts = Date.parse(String(bill.issueDate || ''))
      if (!Number.isFinite(ts)) return true
      return ts >= from && ts <= to
    })
    const byStatus = historyStatusFilter === 'all'
      ? byDate
      : byDate.filter((bill) => (bill.paymentStatus || 'open') === historyStatusFilter)
    const byBillType =
      historyBillTypeFilter === 'all'
        ? byStatus
        : byStatus.filter((bill) => normalizeBillType(bill) === historyBillTypeFilter)
    if (!q) return byBillType
    return byBillType.filter((bill) => {
      const billNo = String(bill.billNumber || '').toLowerCase()
      const orderId = displayInvoiceOrderId(bill).toLowerCase()
      const sessionHaystack =
        bill.sessionId == null
          ? ''
          : `${bill.sessionId} ${formatBillingSessionIdDisplay(bill.sessionId)}`.toLowerCase()
      const client = bill.client ? fullName(bill.client).toLowerCase() : ''
      const recipientCompany = String(bill.recipientCompany?.name || '').toLowerCase()
      const consultant = fullName(bill.consultant).toLowerCase()
      const method = String(bill.paymentMethod?.name || '').toLowerCase()
      return (
        billNo.includes(q) ||
        orderId.includes(q) ||
        sessionHaystack.includes(q) ||
        client.includes(q) ||
        recipientCompany.includes(q) ||
        consultant.includes(q) ||
        method.includes(q)
      )
    })
  }, [bills, historySearch, historyDateFrom, historyDateTo, historyStatusFilter, historyBillTypeFilter])

  const sortedHistoryBills = useMemo(() => {
    const list = [...filteredHistoryBills]
    const factor = historySortDir === 'asc' ? 1 : -1
    list.sort((a, b) => {
      if (historySortField === 'gross') return (Number(a.totalGross || 0) - Number(b.totalGross || 0)) * factor
      if (historySortField === 'date') {
        const tsA = Date.parse(String(a.issueDate || ''))
        const tsB = Date.parse(String(b.issueDate || ''))
        const safeA = Number.isFinite(tsA) ? tsA : 0
        const safeB = Number.isFinite(tsB) ? tsB : 0
        return (safeA - safeB) * factor
      }
      const folioA = Number.parseInt(String(a.billNumber || a.id || 0).replace(/[^\d]/g, ''), 10)
      const folioB = Number.parseInt(String(b.billNumber || b.id || 0).replace(/[^\d]/g, ''), 10)
      const safeA = Number.isFinite(folioA) ? folioA : 0
      const safeB = Number.isFinite(folioB) ? folioB : 0
      return (safeA - safeB) * factor
    })
    return list
  }, [filteredHistoryBills, historySortField, historySortDir])

  useEffect(() => {
    setHistoryPage(1)
  }, [historySearch, historyDateFrom, historyDateTo, historyStatusFilter, historyBillTypeFilter, historySortField, historySortDir])

  const historyPagination = useMemo(() => {
    const total = sortedHistoryBills.length
    const totalPages = Math.max(1, Math.ceil(total / BILLING_LIST_PAGE_SIZE))
    const page = Math.min(Math.max(1, historyPage), totalPages)
    const offset = (page - 1) * BILLING_LIST_PAGE_SIZE
    const slice = sortedHistoryBills.slice(offset, offset + BILLING_LIST_PAGE_SIZE)
    const showFrom = total === 0 ? 0 : offset + 1
    const showTo = total === 0 ? 0 : Math.min(offset + BILLING_LIST_PAGE_SIZE, total)
    return { total, totalPages, page, slice, showFrom, showTo }
  }, [sortedHistoryBills, historyPage])

  useEffect(() => {
    if (historyPagination.page !== historyPage) setHistoryPage(historyPagination.page)
  }, [historyPagination.page, historyPage])

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

  const markOpenBillDirty = (ob: OpenBill) => {
    setOpenBillEdits((prev) => (
      Object.prototype.hasOwnProperty.call(prev, ob.id)
        ? prev
        : { ...prev, [ob.id]: openBillServerItemsToDraft(ob) }
    ))
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
    const effectiveTotalGross = overrides?.paymentTotalGross ?? payableGrossAfterDiscount(subtotalGross, discountDraft)
    const paymentSplits = buildPaymentSplitsPayload(getOpenBillPaymentSplits(ob, effectiveTotalGross))
    const primaryPaymentMethodId = paymentSplits[0]?.paymentMethodId
      ?? (ob.paymentMethod?.id && !isDepositPaymentMethod(ob.paymentMethod) ? ob.paymentMethod.id : undefined)
    const payload: Record<string, unknown> = {
      paymentMethodId: overrides && Object.prototype.hasOwnProperty.call(overrides, 'paymentMethodId')
        ? overrides.paymentMethodId
        : primaryPaymentMethodId,
      paymentSplits,
      reference: ob.reference ?? '',
      ...discountPayloadFields(discountDraft, subtotalGross),
      items: items
        .filter((i) => !isLegacyAdvanceOffsetDraftItem(i))
        .map((i) => ({
          transactionServiceId: i.transactionServiceId,
          quantity: i.quantity,
          netPrice: Number(i.netPrice),
          grossPrice: Number(i.grossPrice),
          sourceSessionBookingId: i.sourceSessionBookingId ?? null,
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
    if (!splits.some((split) => split.paymentMethodId)) return false
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

  const setOpenBillPaymentSplits = (ob: OpenBill, splits: OpenBillPaymentSplitDraft[]) => {
    setOpenBillPaymentEdits((prev) => ({ ...prev, [ob.id]: splits }))
  }

  const updateOpenBillPaymentSplit = (ob: OpenBill, key: string, patch: Partial<OpenBillPaymentSplitDraft>) => {
    const current = getOpenBillPaymentSplits(ob, estimateGross(getOpenBillItems(ob)))
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
    const current = getOpenBillPaymentSplits(ob, estimateGross(getOpenBillItems(ob)))
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

  async function applyAdvanceSelectionsToOpenBill(openBillId: number, sessionId: number, selections: AdvancePaymentSelectionDraft[]) {
    const normalized = normalizeAdvanceSelections(selections)
    for (const selection of normalized) {
      const amountGross = Number(selection.amountGross || 0)
      if (!Number.isFinite(amountGross) || amountGross <= 0) continue
      await api.post('/billing/unused-advances/apply', {
        advanceBillId: selection.advanceBillId,
        openBillId,
        sessionId,
        applyAmountGross: amountGross,
      })
    }
  }

  function isEntitlementPaymentSplit(split: OpenBillPaymentSplitDraft | null | undefined) {
    return split?.kind === 'entitlement'
  }

  function entitlementPaymentLabel() {
    return locale === 'sl' ? 'Ugodnost' : 'Entitlement'
  }

  function entitlementErrorMessage(result?: string | null, message?: string | null) {
    if (message) return message
    if (result === 'INVALID_CODE') return locale === 'sl' ? 'Koda ugodnosti ni veljavna.' : 'The entitlement code is invalid.'
    if (result === 'EXPIRED') return locale === 'sl' ? 'Ugodnost je potekla.' : 'The entitlement has expired.'
    if (result === 'NO_VISITS_REMAINING') return locale === 'sl' ? 'Ugodnost nima več preostalih obiskov.' : 'No visits remain on this entitlement.'
    if (result === 'DUPLICATE_SCAN') return locale === 'sl' ? 'Ta ugodnost je bila pravkar uporabljena.' : 'This entitlement was just used.'
    if (result === 'UNSUPPORTED_PAYMENT_ENTITLEMENT') return locale === 'sl' ? 'Za plačilo lahko uporabite samo vstopnice in pakete.' : 'Only tickets and packs can be used for payment.'
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
    const current = getOpenBillPaymentSplits(ob, totalGross)
    setOpenBillPaymentSplits(ob, current.map((split) => (
      split.key === splitKey
        ? { ...split, kind: 'entitlement', paymentMethodId: undefined, amountGross: formatPaymentAmountInput(0), entitlementCode: undefined }
        : split
    )))
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

  function applyEntitlementPaymentLocally(target: EntitlementPaymentTarget, code?: string | null) {
    const ob = detailOpenBill?.id === target.openBillId ? detailOpenBill : openBills.find((entry) => entry.id === target.openBillId)
    if (!ob) return
    const current = getOpenBillPaymentSplits(ob, target.totalGross)
    const amount = paymentSplitAmountToMatchRow(current, target.splitKey, target.totalGross)
    setOpenBillPaymentSplits(ob, current.map((split) => (
      split.key === target.splitKey
        ? { ...split, kind: 'entitlement', paymentMethodId: undefined, amountGross: formatPaymentAmountInput(amount), entitlementCode: code || split.entitlementCode }
        : split
    )))
  }

  async function submitEntitlementPaymentCode(rawCode: string, source: EntitlementScanSource) {
    const code = rawCode.trim()
    if (!code || entitlementSubmitting || !entitlementPaymentTarget) return
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
        applyEntitlementPaymentLocally(entitlementPaymentTarget, data.entitlement?.code || code)
        setEntitlementScanResult({
          tone: 'success',
          text: locale === 'sl' ? 'Ugodnost je uporabljena kot plačilo.' : 'Entitlement applied as payment.',
          detail,
        })
        showToast('success', locale === 'sl' ? 'Ugodnost je uporabljena kot plačilo.' : 'Entitlement applied as payment.')
        stopEntitlementCamera()
        await load()
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
      return 'Ugodnost'
    }
    if (option.entitlementType === 'PACK') return 'Pack'
    if (option.entitlementType === 'TICKET') return 'Ticket'
    return 'Entitlement'
  }

  function entitlementWalletRemainingLabel(option: EntitlementWalletOption) {
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
      if (openBillsSortField === 'gross') {
        const grossA = openBillListGroupGross(a)
        const grossB = openBillListGroupGross(b)
        return (grossA - grossB) * factor
      }
      if (openBillsSortField === 'client') {
        const labelA = openBillListGroupClientLabel(a).toLowerCase()
        const labelB = openBillListGroupClientLabel(b).toLowerCase()
        return labelA.localeCompare(labelB) * factor
      }
      const tsA = Date.parse(String(a.sessionInfo || ''))
      const tsB = Date.parse(String(b.sessionInfo || ''))
      const safeA = Number.isFinite(tsA) ? tsA : 0
      const safeB = Number.isFinite(tsB) ? tsB : 0
      return (safeA - safeB) * factor
    })
    return list
  }, [filteredOpenBills, openBillsSortField, openBillsSortDir, openBillEdits, services, openBills, locale])

  const openBillsSummaryGross = useMemo(
    () => sortedOpenBills.reduce((sum, ob) => sum + openBillListGroupGross(ob), 0),
    [sortedOpenBills, openBillEdits, services, openBills],
  )

  const openBillsSortLabel = useMemo(() => {
    const opt = openBillsSortOptions.find((o) => o.field === openBillsSortField)
    const label = opt?.label ?? ''
    return `${label} ${openBillsSortDir === 'asc' ? '↑' : '↓'}`
  }, [openBillsSortOptions, openBillsSortField, openBillsSortDir])

  const historySortButtonLabel = useMemo(() => {
    const opt = historySortOptions.find((o) => o.field === historySortField)
    const label = opt?.label ?? ''
    return `${label} ${historySortDir === 'asc' ? '↑' : '↓'}`
  }, [historySortOptions, historySortField, historySortDir])

  const historyCollectedTotal = useMemo(
    () => sortedHistoryBills.reduce((sum, bill) => sum + Number(bill.totalGross || 0), 0),
    [sortedHistoryBills],
  )

  const openHistoryDatePicker = useCallback((input: HTMLInputElement | null) => {
    if (!input) return
    input.focus()
    const pickerInput = input as HTMLInputElement & { showPicker?: () => void }
    if (typeof pickerInput.showPicker === 'function') {
      pickerInput.showPicker()
      return
    }
    input.click()
  }, [])

  const openPayments = useMemo(() => {
    const q = openPaymentsSearch.trim().toLowerCase()
    const unpaid = bills.filter((bill) => (bill.paymentStatus || 'open') !== 'paid' && (bill.paymentStatus || 'open') !== 'cancelled')
    const filtered = q
      ? unpaid.filter((bill) => {
        const billNo = String(bill.billNumber || '').toLowerCase()
        const orderId = displayInvoiceOrderId(bill).toLowerCase()
        const client = bill.billingTarget === 'COMPANY'
          ? String(bill.recipientCompany?.name || '').toLowerCase()
          : (bill.client ? fullName(bill.client).toLowerCase() : '')
        const method = String(bill.paymentMethod?.name || '').toLowerCase()
        const amount = String(billBankTransferDueAmount(bill) || '').toLowerCase()
        return billNo.includes(q) || orderId.includes(q) || client.includes(q) || method.includes(q) || amount.includes(q)
      })
      : unpaid
    return [...filtered].sort((a, b) => Date.parse(String(b.issueDate || '')) - Date.parse(String(a.issueDate || '')))
  }, [bills, openPaymentsSearch])

  const filteredUnusedAdvances = useMemo(() => {
    const q = unusedAdvancesSearch.trim().toLowerCase()
    if (!q) return unusedAdvances
    return unusedAdvances.filter((advance) => {
      const clientLabel = `${advance.client?.firstName || ''} ${advance.client?.lastName || ''}`.trim().toLowerCase()
      const billNo = String(advance.billNumber || '').toLowerCase()
      const sessionId = `${advance.sessionId ?? ''} ${formatBillingSessionIdDisplay(advance.sessionId)}`.toLowerCase()
      return billNo.includes(q) || clientLabel.includes(q) || sessionId.includes(q)
    })
  }, [unusedAdvances, unusedAdvancesSearch])

  const openPaymentsTotal = useMemo(
    () => openPayments.reduce((sum, bill) => sum + billBankTransferDueAmount(bill), 0),
    [openPayments],
  )
  const paymentDeadlineDays = useMemo(() => {
    const raw = settings.PAYMENT_DEADLINE_DAYS
    if (raw == null || String(raw).trim() === '') return 0
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || parsed < 0) return 0
    return Math.floor(parsed)
  }, [settings.PAYMENT_DEADLINE_DAYS])

  const unusedAdvancesTotal = useMemo(
    () => filteredUnusedAdvances.reduce((sum, advance) => sum + Number(advance.remainingGross || 0), 0),
    [filteredUnusedAdvances],
  )

  const openPaymentsPagination = useMemo(() => {
    const total = openPayments.length
    const totalPages = Math.max(1, Math.ceil(total / BILLING_LIST_PAGE_SIZE))
    const page = Math.min(Math.max(1, openPaymentsPage), totalPages)
    const offset = (page - 1) * BILLING_LIST_PAGE_SIZE
    const slice = openPayments.slice(offset, offset + BILLING_LIST_PAGE_SIZE)
    const showFrom = total === 0 ? 0 : offset + 1
    const showTo = total === 0 ? 0 : Math.min(offset + BILLING_LIST_PAGE_SIZE, total)
    return { total, totalPages, page, slice, showFrom, showTo }
  }, [openPayments, openPaymentsPage])

  const unusedAdvancesPagination = useMemo(() => {
    const total = filteredUnusedAdvances.length
    const totalPages = Math.max(1, Math.ceil(total / BILLING_LIST_PAGE_SIZE))
    const page = Math.min(Math.max(1, unusedAdvancesPage), totalPages)
    const offset = (page - 1) * BILLING_LIST_PAGE_SIZE
    const slice = filteredUnusedAdvances.slice(offset, offset + BILLING_LIST_PAGE_SIZE)
    const showFrom = total === 0 ? 0 : offset + 1
    const showTo = total === 0 ? 0 : Math.min(offset + BILLING_LIST_PAGE_SIZE, total)
    return { total, totalPages, page, slice, showFrom, showTo }
  }, [filteredUnusedAdvances, unusedAdvancesPage])

  useEffect(() => {
    setOpenPaymentsPage(1)
  }, [openPaymentsSearch])

  useEffect(() => {
    setUnusedAdvancesPage(1)
  }, [unusedAdvancesSearch])

  useEffect(() => {
    if (openPaymentsPagination.page !== openPaymentsPage) setOpenPaymentsPage(openPaymentsPagination.page)
  }, [openPaymentsPagination.page, openPaymentsPage])

  useEffect(() => {
    if (unusedAdvancesPagination.page !== unusedAdvancesPage) setUnusedAdvancesPage(unusedAdvancesPagination.page)
  }, [unusedAdvancesPagination.page, unusedAdvancesPage])

  const folioStats = useMemo(() => {
    const now = new Date()
    const thisMonth = sortedHistoryBills.filter((bill) => {
      const date = new Date(bill.issueDate)
      return Number.isFinite(date.getTime()) && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
    })
    return {
      thisMonthCount: thisMonth.length,
      paidCount: sortedHistoryBills.filter((bill) => bill.paymentStatus === 'paid').length,
      refundsCount: sortedHistoryBills.filter((bill) => Boolean(bill.refundOfBillId) || Boolean(bill.refundReference) || Number(bill.totalGross || 0) < 0).length,
      advancesCount: sortedHistoryBills.filter((bill) => normalizeBillType(bill) === 'ADVANCE').length,
      totalAmount: sortedHistoryBills.reduce((sum, bill) => sum + Number(bill.totalGross || 0), 0),
    }
  }, [sortedHistoryBills])

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

  const paymentStatusLabel = (status: Bill['paymentStatus']) => {
    if (status === 'paid') return locale === 'sl' ? 'Plačano' : 'Paid'
    if (status === 'payment_pending') return locale === 'sl' ? 'Delno plačano' : 'Partially Paid'
    if (status === 'cancelled') return locale === 'sl' ? 'Arhivirano' : 'Archived'
    return locale === 'sl' ? 'Odprto' : 'Open'
  }

  const paymentStatusClass = (status: Bill['paymentStatus']) => {
    if (status === 'paid') return 'paid'
    if (status === 'payment_pending') return 'partial'
    if (status === 'cancelled') return 'archived'
    return 'open'
  }

  const fiscalStatusLabel = (bill: Bill) => {
    if (bill.refundOfBillId || bill.refundReference) return locale === 'sl' ? 'Dobropis' : 'Credit Note'
    if (bill.fiscalStatus === 'SENT') return locale === 'sl' ? 'Izdano' : 'Invoiced'
    if (bill.fiscalStatus === 'FAILED') return locale === 'sl' ? 'Napaka' : 'Failed'
    return locale === 'sl' ? 'Ni poslano' : 'Not Sent'
  }

  const fiscalStatusClass = (bill: Bill) => {
    if (bill.refundOfBillId || bill.refundReference) return 'credit'
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

  const paymentReferenceLabel = (bill: Bill | OpenBill) => {
    const method = bill.paymentMethod
    const typeLabel = localizedPaymentMethodName(method, locale)
    const suffix = method?.paymentType === 'CARD'
      ? '•••• 4242'
      : method?.paymentType === 'BANK_TRANSFER'
        ? `Ref: ${'billNumber' in bill ? bill.billNumber : `OB-${bill.id}`}`
        : method?.paymentType === 'CASH'
          ? (locale === 'sl' ? 'Blagajna' : 'Point of sale')
          : '—'
    return { typeLabel, suffix }
  }

  const notifyBillCreationResult = (data: any, pendingLabel = 'Bill created') => {
    if (billBankTransferDueAmount(data) > 0) {
      showToast('success', 'Bank transfer folio with UPN QR has been emailed to the client. Import your bank statement CSV later to mark it paid automatically in folio history.')
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

  const createBill = async () => {
    if (creatingBill) return
    setCreatingBill(true)
    try {
      const payload = {
        clientId: billForm.clientId,
        consultantId: billForm.consultantId ?? me.id,
        paymentMethodId: billForm.paymentMethodId,
        paymentSplits: buildCreatePaymentSplitsPayload(createBillPayableGross),
        ...(billForm.billType === 'INVOICE' ? discountPayloadFields(createBillDiscountDraft, grossPreview) : {}),
        billingTarget: billForm.billingTarget,
        recipientCompanyId: billForm.recipientCompanyId,
        bankTransferReference: billForm.bankTransferReference,
        billType: billForm.billType,
        sessionId: billForm.sessionId,
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

      const billId = data?.id
      if (billId && data?.paymentStatus === 'paid') {
        const res = await api.get(`/billing/bills/${billId}/folio-pdf?locale=${locale}`, { responseType: 'blob' })
        const blob = new Blob([res.data], { type: 'application/pdf' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `folio-${data.billNumber || `bill-${billId}`}.pdf`
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.URL.revokeObjectURL(url)
      }
      setBillForm({ items: [], billingTarget: 'PERSON', billType: 'INVOICE', discountType: 'PERCENT', discountValue: '0' })
      setShowCreateBillModal(false)
      setEditingCreateBillPayee(false)
      if (data?.id && shouldCreateCheckoutSession(data)) {
        await api.post(`/billing/bills/${data.id}/checkout-session`)
      }
      notifyBillCreationResult(data)
      await load()
      if (embeddedCreateBill) {
        await onEmbeddedSaved?.()
        onEmbeddedClose?.()
      }
    } finally {
      setCreatingBill(false)
    }
  }

  const openCreateBillModal = () => {
    const defaultPaymentMethodId = visiblePaymentMethods.find((method) => !isDepositPaymentMethod(method))?.id ?? visiblePaymentMethods[0]?.id
    setBillForm({
      items: [],
      paymentMethodId: defaultPaymentMethodId,
      billingTarget: 'PERSON',
      billType: 'INVOICE',
      consultantId: me.id,
      discountType: 'PERCENT',
      discountValue: '0',
    })
    setEditingCreateBillPayee(false)
    setShowCreateBillModal(true)
  }

  const openCreateAdvanceBillModal = () => {
    if (!advanceBillingEnabled) return
    const defaultPaymentMethodId = visiblePaymentMethods.find((method) => !isDepositPaymentMethod(method))?.id ?? visiblePaymentMethods[0]?.id
    setBillForm({
      items: [],
      paymentMethodId: defaultPaymentMethodId,
      billingTarget: 'PERSON',
      billType: 'ADVANCE',
      consultantId: me.id,
    })
    setEditingCreateBillPayee(false)
    setShowCreateBillModal(true)
  }

  const closeCreateBillModal = () => {
    setShowCreateBillModal(false)
    setEditingCreateBillPayee(false)
    setBillForm({ items: [], billingTarget: 'PERSON', billType: 'INVOICE', discountType: 'PERCENT', discountValue: '0' })
    setRecipientCompanySearch('')
    setRecipientCompanyPickerOpen(false)
    setEditingRecipientCompanySearch(false)
    if (embeddedCreateBill && onEmbeddedClose) onEmbeddedClose()
  }

  /** Close only when press starts on the dimmed overlay (not after selecting/dragging from inside the panel — same as transaction-services modal). */
  const onCreateBillBackdropMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) closeCreateBillModal()
  }

  const closeDetailOpenBill = () => {
    setDetailOpenBill(null)
    setOpenBillEditorRootId(null)
    setOpenBillAddMenuForId(null)
    setExternalOpenBillPickerForRootId(null)
    setExternalOpenBillSearch('')
    setTemporaryOpenBillTabIds({})
    setSelectedOpenBillLines({})
    setMoveSelectedTargetOpenBillId(null)
    if (!activeOpenBillId) return
    if (onEmbeddedClose) {
      onEmbeddedClose()
      return
    }
    const searchParams = new URLSearchParams(location.search)
    const returnTo = searchParams.get('returnTo')
    if (returnTo) {
      navigate(returnTo, { replace: true })
      return
    }
    navigate('/billing', { replace: true })
  }

  const onDetailOpenBillBackdropMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) closeDetailOpenBill()
  }

  const openEditInvoicePopup = (ob: OpenBill) => {
    setOpenBillEditorRootId(ob.id)
    setOpenBillAddMenuForId(null)
    setExternalOpenBillPickerForRootId(null)
    setExternalOpenBillSearch('')
    setSelectedOpenBillLines({})
    setMoveSelectedTargetOpenBillId(null)
    setDetailOpenBill(ob)
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
  const selectedUnusedAdvance = useMemo(
    () => unusedAdvances.find((entry) => entry.advanceBillId === selectedUnusedAdvanceId) || null,
    [unusedAdvances, selectedUnusedAdvanceId],
  )
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
  const openBillSessionTargets = useMemo(
    () =>
      openBills.flatMap((ob) => {
        const source = (ob.sessions && ob.sessions.length > 0)
          ? ob.sessions.map((s) => ({
              sessionId: s.sessionId,
              sessionDisplayId: s.sessionDisplayId || formatBillingSessionIdDisplay(s.sessionId),
            }))
          : (ob.sessionId != null
            ? [{ sessionId: ob.sessionId, sessionDisplayId: ob.sessionDisplayId || formatBillingSessionIdDisplay(ob.sessionId) }]
            : [])
        // Backend uses negative synthetic ids for manual open-bill slots (#M1 → -1).
        return source
          .filter((entry) => Number.isFinite(entry.sessionId) && entry.sessionId !== 0)
          .map((entry) => ({
            key: `${ob.id}:${entry.sessionId}`,
            openBillId: ob.id,
            sessionId: entry.sessionId,
            label: `${entry.sessionDisplayId} · ${openBillClientLabel(ob)}`,
          }))
      }),
    [openBills],
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
  const nonDepositPaymentMethods = useMemo(
    () => visiblePaymentMethods.filter((method) => !isDepositPaymentMethod(method)),
    [visiblePaymentMethods],
  )
  const createPaymentSplits = getCreateBillPaymentSplits(createBillPayableGross)
  const createPaymentsMatchTotal = paymentSplitsMatchInvoiceTotal(createPaymentSplits, createBillPayableGross)
  const detailOpenBillTransactionGross = useMemo(() => {
    if (!detailOpenBill) return 0
    const transactionItems = getOpenBillItems(detailOpenBill).filter((item) => item.sourceAdvanceBillId == null)
    return payableGrossAfterDiscount(estimateGross(transactionItems), getOpenBillDiscountDraft(detailOpenBill))
  }, [detailOpenBill, openBillEdits, openBillDiscountEdits, services])
  const createAdvanceSelectionValid = createPaymentSplits.every((split) => (
    !isAdvancePaymentSplit(split)
    || validateAdvanceSelections(getAdvanceSelectionsForSplit(split), createEligibleUnusedAdvances, createBillPayableGross)
  ))
  const detailPaymentSelectionValid = !detailOpenBill || getOpenBillPaymentSplits(detailOpenBill, detailOpenBillTransactionGross).every((split) => (
    !isAdvancePaymentSplit(split)
    || validateAdvanceSelections(getAdvanceSelectionsForSplit(split), detailEligibleUnusedAdvances, detailOpenBillTransactionGross)
  ))
  const billCanSubmit = billForm.items.length > 0
    && (billForm.billingTarget === 'PERSON' ? Boolean(billForm.clientId) : Boolean(billForm.recipientCompanyId))
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
        const targetOpenBill = detailOpenBill?.id === targetId ? detailOpenBill : openBills.find((entry) => entry.id === targetId)
        setOpenBillDetailsEdits((prev) => {
          const current = targetOpenBill
            ? (prev[targetId] ?? deriveOpenBillDetailsDraft(targetOpenBill))
            : (prev[targetId] ?? { billingTarget: 'COMPANY' as const })
          return {
            ...prev,
            [targetId]: {
              ...current,
              billingTarget: 'COMPANY',
              recipientCompanyId: data.id,
            },
          }
        })
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

  const applyUnusedAdvance = async (params?: {
    advanceBillId?: number | null
    openBillId?: number | null
    sessionId?: number | null
    applyAmountNet?: number
  }) => {
    if (applyingAdvance) return
    const effectiveAdvanceBillId = params?.advanceBillId ?? selectedUnusedAdvanceId
    const effectiveOpenBillId = params?.openBillId ?? selectedApplyTarget?.openBillId ?? null
    const effectiveSessionId = params?.sessionId ?? selectedApplyTarget?.sessionId ?? null
    if (!effectiveAdvanceBillId) {
      showToast('error', billingCopy.requiredAdvanceSelection)
      return
    }
    if (!effectiveOpenBillId || !effectiveSessionId) {
      showToast('error', billingCopy.requiredOpenBillSessionSelection)
      return
    }
    const numericAmount = Number(params?.applyAmountNet ?? applyAmountNet)
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      showToast('error', billingCopy.requiredApplyAmount)
      return
    }
    setApplyingAdvance(true)
    try {
      const appliedOpenBillId = effectiveOpenBillId
      await api.post('/billing/unused-advances/apply', {
        advanceBillId: effectiveAdvanceBillId,
        openBillId: appliedOpenBillId,
        sessionId: effectiveSessionId,
        applyAmountGross: numericAmount,
      })
      showToast('success', billingCopy.advanceAppliedSuccess)
      setApplyAmountNet('')
      // Drop stale line drafts so Save / Create bill cannot PUT a subset and wipe server lines.
      setOpenBillEdits((prev) => {
        if (!Object.prototype.hasOwnProperty.call(prev, appliedOpenBillId)) return prev
        const next = { ...prev }
        delete next[appliedOpenBillId]
        return next
      })
      const snapshot = await load()
      setDetailOpenBill((prev) => {
        if (!prev || prev.id !== appliedOpenBillId) return prev
        const raw = snapshot.openBills.find((o: OpenBill) => o.id === appliedOpenBillId)
        return raw ? normalizeOpenBill(raw) : prev
      })
    } finally {
      setApplyingAdvance(false)
    }
  }

  const downloadFolioPdf = async (bill: Bill) => {
    const res = await api.get(`/billing/bills/${bill.id}/folio-pdf?locale=${locale}`, { responseType: 'blob' })
    const blob = new Blob([res.data], { type: 'application/pdf' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `folio-${bill.billNumber || bill.id}.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
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
        const fallbackMethod = entry.paymentMethod && !isDepositPaymentMethod(entry.paymentMethod)
          ? entry.paymentMethod
          : paymentMethods.find((method) => !isDepositPaymentMethod(method))
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
    setOpenBills(normalized)
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
    const snapshot = await load()
    const refreshed = snapshot.openBills.map((entry) => normalizeOpenBill(entry))
    setOpenBills(refreshed)
    const updatedActive = refreshed.find((entry) => entry.id === activeBill.id)
      ?? refreshed.find((entry) => entry.id === openBillEditorRootId)
      ?? null
    setDetailOpenBill(updatedActive)
    await onEmbeddedSaved?.()
  }

  const saveOpenBill = async (ob: OpenBill, onePayeeRelatedBills?: OpenBill[]) => {
    if (onePayeeRelatedBills && onePayeeRelatedBills.length > 1) {
      await saveOpenBillGroupAsOnePayee(onePayeeRelatedBills[0] ?? ob, onePayeeRelatedBills)
      return
    }
    const items = getOpenBillItems(ob)
    const detailsDraft = openBillDetailsEdits[ob.id]
    if (!validateOpenBillDetailsDraft(detailsDraft)) return
    await api.put(`/billing/open-bills/${ob.id}`, buildOpenBillUpdatePayload(ob, items))

    // Optimistically sync modal/list bill items to avoid UI flicker back to stale values.
    const mergedItems = items.map((row) => {
      const fromServer = ob.items.find((i) => i.transactionService.id === row.transactionServiceId)?.transactionService
      const service =
        services.find((s) => s.id === row.transactionServiceId)
        || fromServer
        || ({
          id: row.transactionServiceId,
          code: '',
          description: '',
          taxRate: 'VAT_22',
          netPrice: Number(row.netPrice || 0),
        } as any)
      return {
        id: 0,
        transactionService: service,
        quantity: row.quantity,
        netPrice: Number(row.netPrice || 0),
        grossPrice: Number(row.grossPrice || 0),
        sourceSessionBookingId: row.sourceSessionBookingId ?? null,
        sourceAdvanceBillId: row.sourceAdvanceBillId ?? null,
      }
    })
    setOpenBills((prev) => prev.map((entry) => (entry.id === ob.id ? { ...entry, items: mergedItems } : entry)))
    setDetailOpenBill((prev) => (prev?.id === ob.id ? { ...prev, items: mergedItems } : prev))

    clearOpenBillDrafts([ob.id])
    const snapshot = await load()
    const updated = snapshot.openBills.find((entry) => entry.id === ob.id) || null
    setDetailOpenBill(updated)
    await onEmbeddedSaved?.()
  }

  const deleteOpenBill = async (ob: OpenBill) => {
    if (deletingOpenId) return
    if (!window.confirm('Delete this open bill? This cannot be undone.')) return
    setDeletingOpenId(ob.id)
    try {
      await api.delete(`/billing/open-bills/${ob.id}`)
      setOpenBills((prev) => prev.filter((x) => x.id !== ob.id))
      clearOpenBillDrafts([ob.id])
      setDetailOpenBill((prev) => (prev?.id === ob.id ? null : prev))
      if (activeOpenBillId === ob.id) closeDetailOpenBill()
    } finally {
      setDeletingOpenId(null)
    }
  }

  const previewOpenBillInvoice = async (ob: OpenBill, onePayeeRelatedBills?: OpenBill[]) => {
    const related = onePayeeRelatedBills && onePayeeRelatedBills.length > 1
      ? Array.from(new Map(onePayeeRelatedBills.map((entry) => [entry.id, entry])).values())
      : []
    const target = related.length > 1 ? (related[0] ?? ob) : ob
    if (previewingOpenBillId) return

    const detailsDraft = openBillDetailsEdits[target.id]
    if (!validateOpenBillDetailsDraft(detailsDraft)) return

    const previewWindow = window.open('', '_blank')
    if (previewWindow) {
      previewWindow.document.write(`<p style="font-family: system-ui, sans-serif; padding: 24px; color: #475569;">${locale === 'sl' ? 'Pripravljam predogled računa…' : 'Preparing invoice preview…'}</p>`)
    }

    setPreviewingOpenBillId(target.id)
    try {
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
        const fallbackMethod = target.paymentMethod && !isDepositPaymentMethod(target.paymentMethod)
          ? target.paymentMethod
          : paymentMethods.find((method) => !isDepositPaymentMethod(method))
        const methodId = Number(fallbackMethod?.id || 0)
        if (methodId > 0) {
          payload.paymentMethodId = methodId
          payload.paymentSplits = [{ paymentMethodId: methodId, amountGross: Number(combinedGross.toFixed(2)) }]
        }
      }

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
      showToast('error', locale === 'sl' ? 'Predogleda računa ni bilo mogoče pripraviti.' : 'Unable to prepare invoice preview.')
    } finally {
      setPreviewingOpenBillId(null)
    }
  }

  const createBillFromOpen = async (ob: OpenBill, onePayeeRelatedBills?: OpenBill[]) => {
    if (creatingFromOpenId) return
    const target = onePayeeRelatedBills && onePayeeRelatedBills.length > 1 ? (onePayeeRelatedBills[0] ?? ob) : ob
    setCreatingFromOpenId(target.id)
    try {
      let invoiceSource = target
      if (onePayeeRelatedBills && onePayeeRelatedBills.length > 1) {
        const merged = await saveOpenBillGroupAsOnePayee(target, onePayeeRelatedBills)
        if (!merged) return
        invoiceSource = merged
      }
      const sourceOpenBill = invoiceSource
      const relatedOpenBillsBeforeClose = onePayeeRelatedBills && onePayeeRelatedBills.length > 1
        ? []
        : getRelatedOpenBillsForEditor(sourceOpenBill)
      const items = getOpenBillItems(sourceOpenBill)
      const detailsDraft = openBillDetailsEdits[sourceOpenBill.id]
      if (!validateOpenBillDetailsDraft(detailsDraft)) return
      await api.put(`/billing/open-bills/${sourceOpenBill.id}`, buildOpenBillUpdatePayload(sourceOpenBill, items))

      const { data } = await api.post(`/billing/open-bills/${sourceOpenBill.id}/create-bill`)
      if (data?.id) setBills((prev) => [normalizeBill(data), ...prev])
      setOpenBills((prev) => prev.filter((x) => x.id !== sourceOpenBill.id))
      setOpenBillEdits((prev) => { const n = { ...prev }; delete n[sourceOpenBill.id]; return n })
      setOpenBillDetailsEdits((prev) => { const n = { ...prev }; delete n[sourceOpenBill.id]; return n })
      setOpenBillPaymentEdits((prev) => { const n = { ...prev }; delete n[sourceOpenBill.id]; return n })
      setOpenBillDiscountEdits((prev) => { const n = { ...prev }; delete n[sourceOpenBill.id]; return n })
      if (data?.id && data?.paymentStatus === 'paid') {
        const res = await api.get(`/billing/bills/${data.id}/folio-pdf?locale=${locale}`, { responseType: 'blob' })
        const blob = new Blob([res.data], { type: 'application/pdf' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `folio-${data.billNumber || `bill-${data.id}`}.pdf`
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.URL.revokeObjectURL(url)
      }
      if (data?.id && shouldCreateCheckoutSession(data)) {
        await api.post(`/billing/bills/${data.id}/checkout-session`)
      }
      notifyBillCreationResult(data, 'Bill created')
      const snapshot = await load()
      await onEmbeddedSaved?.()
      const movedToNextTab = selectNextOpenBillEditorTabAfterClose(sourceOpenBill.id, relatedOpenBillsBeforeClose, snapshot.openBills)
      if (!movedToNextTab) {
        if (openBillEditorRootId === sourceOpenBill.id) setOpenBillEditorRootId(null)
        setDetailOpenBill((prev) => (prev?.id === sourceOpenBill.id ? null : prev))
        if (activeOpenBillId === sourceOpenBill.id) closeDetailOpenBill()
      }
    } catch (error: any) {
      showToast(
        'error',
        error?.response?.data?.message
          || error?.message
          || (locale === 'sl' ? 'Računa ni bilo mogoče zaključiti.' : 'Unable to close the invoice.'),
      )
    } finally {
      setCreatingFromOpenId(null)
    }
  }

  const splitOpenBillSession = async (ob: OpenBill, sessionId: number) => {
    if (splittingSessionKey) return
    const key = `${ob.id}:${sessionId}`
    setSplittingSessionKey(key)
    try {
      const { data } = await api.post('/billing/open-bills/' + ob.id + '/split-session', { sessionId })
      const normalized = (data || []).map((entry: OpenBill) => normalizeOpenBill(entry))
      setOpenBills(normalized)
      setOpenBillEdits({})
      setOpenBillDetailsEdits({})
      setOpenBillPaymentEdits({})
      setOpenBillDiscountEdits({})
      setDetailOpenBill(normalized.find((entry: OpenBill) => entry.id === ob.id) || null)
    } finally {
      setSplittingSessionKey(null)
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
    if (billForm.billType === 'INVOICE') Object.assign(payload, discountPayloadFields(createBillDiscountDraft, grossPreview))
    payload.reference = billForm.bankTransferReference
    payload.sessionId = billForm.sessionId
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
    const payload = buildManualOpenBillPayload()
    if (!payload) return
    const existingIds = new Set(openBills.map((entry) => entry.id))
    setCreatingManualOpenBill(true)
    try {
      const { data: createdList } = await api.post('/billing/open-bills/manual', payload)
      const responses: any[] = Array.isArray(createdList) ? createdList : []
      const newlyCreated = responses.find((entry) => entry?.id != null && !existingIds.has(entry.id))
        ?? [...responses].sort((a, b) => Number(b?.id ?? 0) - Number(a?.id ?? 0))[0]
      const snapshot = await load()
      const refreshed = snapshot.openBills.map((entry) => normalizeOpenBill(entry))
      setOpenBills(refreshed)
      setBillingTab('open')
      setShowCreateBillModal(false)
      setEditingCreateBillPayee(false)
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

  const createAndCloseManualOpenBill = async () => {
    if (creatingBill || creatingManualOpenBill) return
    const payload = buildManualOpenBillPayload()
    if (!payload) return
    const existingIds = new Set(openBills.map((entry) => entry.id))
    setCreatingBill(true)
    try {
      const { data: createdList } = await api.post('/billing/open-bills/manual', payload)
      const responses: any[] = Array.isArray(createdList) ? createdList : []
      const newlyCreated = responses.find((entry) => entry?.id != null && !existingIds.has(entry.id))
        ?? [...responses].sort((a, b) => Number(b?.id ?? 0) - Number(a?.id ?? 0))[0]
      const targetId = newlyCreated?.id
      if (!targetId) {
        showToast('error', locale === 'sl' ? 'Računa ni bilo mogoče zaključiti.' : 'Unable to close the invoice.')
        return
      }
      const { data: bill } = await api.post(`/billing/open-bills/${targetId}/create-bill`)
      if (bill?.id) setBills((prev) => [normalizeBill(bill), ...prev])
      if (bill?.id && bill?.paymentStatus === 'paid') {
        const res = await api.get(`/billing/bills/${bill.id}/folio-pdf?locale=${locale}`, { responseType: 'blob' })
        const blob = new Blob([res.data], { type: 'application/pdf' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `folio-${bill.billNumber || `bill-${bill.id}`}.pdf`
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.URL.revokeObjectURL(url)
      }
      if (bill?.id && shouldCreateCheckoutSession(bill)) {
        await api.post(`/billing/bills/${bill.id}/checkout-session`)
      }
      notifyBillCreationResult(bill)
      setBillForm({ items: [], billingTarget: 'PERSON', billType: 'INVOICE', consultantId: me.id, discountType: 'PERCENT', discountValue: '0' })
      setShowCreateBillModal(false)
      setEditingCreateBillPayee(false)
      await load()
    } catch (error: any) {
      showToast(
        'error',
        error?.response?.data?.message
          || error?.message
          || (locale === 'sl' ? 'Računa ni bilo mogoče zaključiti.' : 'Unable to close the invoice.'),
      )
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
      const snapshot = await load()
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

  const updateOpenBillPaymentMethod = (openBillId: number, methodId: number) => {
    const selected = paymentMethods.find((p) => p.id === methodId) || null
    const source = detailOpenBill?.id === openBillId ? detailOpenBill : openBills.find((entry) => entry.id === openBillId)
    if (source) markOpenBillDirty(source)
    setOpenBills((prev) => prev.map((entry) => entry.id === openBillId ? { ...entry, paymentMethod: selected } : entry))
    setDetailOpenBill((prev) => prev?.id === openBillId ? { ...prev, paymentMethod: selected } : prev)
  }

  const updateOpenBillReference = (openBillId: number, value: string) => {
    const source = detailOpenBill?.id === openBillId ? detailOpenBill : openBills.find((entry) => entry.id === openBillId)
    if (source) markOpenBillDirty(source)
    setOpenBills((prev) => prev.map((entry) => entry.id === openBillId ? { ...entry, reference: value } : entry))
    setDetailOpenBill((prev) => prev?.id === openBillId ? { ...prev, reference: value } : prev)
  }

  const taxRateByServiceId = (serviceId: number): VatBreakdownKey => {
    const tax = services.find((s) => s.id === serviceId)?.taxRate
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
  const advanceNetToGross = (net: number) => {
    if (!Number.isFinite(net) || net <= 0) return 0
    return Number((net * (1 + advanceDeductionTaxMultiplier)).toFixed(2))
  }
  const grossToNet = (gross: string, serviceId: number) => {
    const divisor = 1 + taxMultiplierByServiceId(serviceId)
    if (!Number.isFinite(divisor) || divisor <= 0) return Number(gross || 0)
    return Number((Number(gross || 0) / divisor).toFixed(4))
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

  const estimateTax = (items: { transactionServiceId: number; quantity: number; netPrice: string; grossPrice: string }[]) =>
    items.reduce((sum, item) => sum + lineTaxTotal(item), 0)

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
      .filter((row) => row.lineCount > 0)
  }

  const isOpenBillBatchPayment = (ob: OpenBill) => (ob.batchScope ?? 'NONE') !== 'NONE'
  const isOpenBillBatched = (ob: OpenBill) => isOpenBillBatchPayment(ob) || (ob.sessions?.length ?? 0) > 1

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

  const getEditOpenBillSessionOptions = (ob: OpenBill, draft: OpenBillDetailsDraft) => {
    const seen = new Set<number>()
    const options: { sessionId: number; label: string }[] = []
    const addOption = (sessionId: number | null | undefined, label: string) => {
      if (sessionId == null || !Number.isFinite(sessionId) || sessionId <= 0 || seen.has(sessionId)) return
      seen.add(sessionId)
      options.push({ sessionId, label })
    }

    getOpenBillIncludedSessions(ob).forEach((session) => {
      addOption(
        session.sessionId,
        [
          session.sessionDisplayId || formatBillingSessionIdDisplay(session.sessionId),
          session.sessionInfo || session.clientName || openBillClientLabel(ob),
          session.totalGross != null ? currency(session.totalGross) : null,
        ].filter(Boolean).join(' · '),
      )
    })

    for (const booking of bookings) {
      const paymentStatuses = booking.paymentStatuses ?? []
      for (const status of paymentStatuses) {
        if (status.status === 'PAID') continue
        const participant = (booking.clients || []).find((client) => client.id === status.clientId)
          || (booking.client?.id === status.clientId ? booking.client : null)
        if (!participant) continue
        const payee = (booking.payees || []).find((entry) => entry.clientId === participant.id)
        const matchesPerson = draft.billingTarget === 'PERSON'
          && draft.clientId != null
          && participant.id === draft.clientId
        const matchesCompany = draft.billingTarget === 'COMPANY'
          && draft.recipientCompanyId != null
          && (participant.billingCompany?.id === draft.recipientCompanyId
            || booking.sessionGroupBillingCompany?.id === draft.recipientCompanyId
            || payee?.company?.id === draft.recipientCompanyId)
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

    return options
  }

  const getOpenBillSessionGross = (ob: OpenBill, sessionId: number) => {
    const summary = (ob.sessions ?? []).find((s) => s.sessionId === sessionId)
    const fromApi = Number(summary?.totalGross)
    if (Number.isFinite(fromApi) && fromApi !== 0) return fromApi
    const matching = getOpenBillItems(ob).filter((item) => item.sourceSessionBookingId === sessionId || ((item.sourceSessionBookingId == null) && ob.sessionId === sessionId))
    return estimateGross(matching)
  }

  const itemBelongsToBatchedSession = (ob: OpenBill, item: OpenBillEditItem) => {
    if (!isOpenBillBatched(ob)) return false
    const sid = item.sourceSessionBookingId
    if (sid == null) return false
    return (ob.sessions ?? []).some((s) => s.sessionId === sid)
  }

  const openBillLineIndicesForMain = (ob: OpenBill) =>
    getOpenBillItems(ob)
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => !itemBelongsToBatchedSession(ob, item))
      .map(({ idx }) => idx)

  const openBillLineIndicesForSession = (ob: OpenBill, sessionId: number) =>
    getOpenBillItems(ob)
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => item.sourceSessionBookingId === sessionId)
      .map(({ idx }) => idx)

  const openBillEditorLineKey = (ob: OpenBill, idx: number, item: OpenBillEditItem) => {
    if (item.openBillItemId != null && item.openBillItemId > 0) return `line-${ob.id}-db-${item.openBillItemId}`
    if (item.clientRowKey) return `line-${ob.id}-client-${item.clientRowKey}`
    return `line-${ob.id}-idx-${idx}`
  }

  const renderOpenBillLineEditor = (ob: OpenBill, idx: number) => {
    const item = getOpenBillItems(ob)[idx]
    const billServices = selectableServicesForOpenBill(ob)
    if (!item) return null
    return (
      <div key={openBillEditorLineKey(ob, idx, item)} className="billing-bill-modal-item-row">
        <div className="billing-bill-modal-field billing-bill-modal-field--service">
          <select
            value={item.transactionServiceId}
            onChange={(e) => {
              const id = Number(e.target.value)
              const svc = billServices.find((s) => s.id === id)
              const next = [...getOpenBillItems(ob)]
              next[idx] = { ...next[idx], transactionServiceId: id, netPrice: String(svc?.netPrice ?? 0), grossPrice: grossStringFromService(svc) }
              setOpenBillItems(ob, next)
            }}
          >
            {billServices.map((s) => (
              <option key={s.id} value={s.id}>
                {serviceOptionLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="billing-bill-modal-field billing-bill-modal-field--qty">
          <input
            type="number"
            min="1"
            value={item.quantity}
            onChange={(e) => {
              const next = [...getOpenBillItems(ob)]
              next[idx].quantity = Number(e.target.value)
              setOpenBillItems(ob, next)
            }}
          />
        </div>
        <div className="billing-bill-modal-field billing-bill-modal-field--price">
          <input
            type="number"
            step="0.01"
            value={String(Number(item.grossPrice || 0).toFixed(2))}
            onChange={(e) => {
              const grossStr = Number(e.target.value || 0).toFixed(2)
              const next = [...getOpenBillItems(ob)]
              next[idx].grossPrice = grossStr
              next[idx].netPrice = String(grossToNet(grossStr, item.transactionServiceId))
              setOpenBillItems(ob, next)
            }}
          />
        </div>
        <div className="billing-bill-modal-amount">
          <strong>{currency(lineGrossTotal(item))}</strong>
        </div>
        <button
          type="button"
          className="billing-bill-modal-icon-btn billing-bill-modal-icon-btn--danger"
          onClick={() => setOpenBillItems(ob, getOpenBillItems(ob).filter((_, i) => i !== idx))}
          aria-label={billingCopy.removeBillLine}
          title={billingCopy.removeBillLine}
        >
          🗑
        </button>
      </div>
    )
  }

  const renderBillFormLineEditor = (item: BillForm['items'][number], index: number) => (
    <div key={index} className="billing-bill-modal-item-row">
      <div className="billing-bill-modal-field billing-bill-modal-field--service">
        <select
          value={item.transactionServiceId}
          onChange={(e) => {
            const id = Number(e.target.value)
            const service = services.find((entry) => entry.id === id)
            const next = [...billForm.items]
            next[index] = { ...next[index], transactionServiceId: id, netPrice: String(service?.netPrice ?? 0), grossPrice: grossStringFromService(service) }
            setBillForm({ ...billForm, items: next })
          }}
        >
          {availableBillServices.map((service) => (
            <option key={service.id} value={service.id}>{serviceOptionLabel(service)}</option>
          ))}
        </select>
      </div>
      <div className="billing-bill-modal-field billing-bill-modal-field--qty">
        <input
          type="number"
          min="1"
          value={item.quantity}
          onChange={(e) => {
            const next = [...billForm.items]
            next[index].quantity = Number(e.target.value)
            setBillForm({ ...billForm, items: next })
          }}
        />
      </div>
      <div className="billing-bill-modal-field billing-bill-modal-field--price">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={billingCopy.grossUnitPrice}
          value={formatCashRegisterAmount(Number(item.grossPrice || 0), locale)}
          onChange={(e) => {
            const digits = cashRegisterDigitsFromRaw(e.target.value)
            const cents = digits ? Number.parseInt(digits, 10) : 0
            const grossStr = Number.isFinite(cents) ? (cents / 100).toFixed(2) : '0'
            const next = [...billForm.items]
            next[index].grossPrice = grossStr
            next[index].netPrice = String(grossToNet(grossStr, item.transactionServiceId))
            setBillForm({ ...billForm, items: next })
          }}
        />
      </div>
      <div className="billing-bill-modal-amount">
        <strong>{currency(lineGrossTotal(item))}</strong>
      </div>
      <button
        type="button"
        className="billing-bill-modal-icon-btn billing-bill-modal-icon-btn--danger"
        onClick={() => setBillForm({ ...billForm, items: billForm.items.filter((_, i) => i !== index) })}
        aria-label={billingCopy.removeBillLine}
        title={billingCopy.removeBillLine}
      >
        🗑
      </button>
    </div>
  )

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

  const renderPaymentRemainingToMatch = (splits: OpenBillPaymentSplitDraft[], totalGross: number) => {
    const difference = paymentSplitDifference(totalGross, splits)
    const isMatched = Math.abs(difference) <= 0.01
    const isOver = difference < 0
    const label = isMatched
      ? (locale === 'sl' ? 'Plačila so usklajena' : 'Payments matched')
      : isOver
        ? (locale === 'sl' ? 'Preplačano' : 'Overpaid by')
        : (locale === 'sl' ? 'Preostanek do ujemanja' : 'Remaining to match')
    const helper = isMatched
      ? (locale === 'sl' ? 'Vsota plačil se ujema s skupnim zneskom.' : 'Payment total matches the bill total.')
      : (locale === 'sl' ? 'Dopolnite razliko na eni od metod plačila zgoraj.' : 'Auto-fill the remaining balance to match the total.')
    return (
      <div className={`billing-invoice-remaining-strip${isMatched ? ' billing-invoice-remaining-strip--matched' : ''}${isOver ? ' billing-invoice-remaining-strip--over' : ''}`}>
        <div className="billing-invoice-remaining-copy">
          <span className="billing-invoice-remaining-dot" aria-hidden>{isMatched ? '✓' : '€'}</span>
          <div>
            <strong>{label}</strong>
            <small>{helper}</small>
          </div>
        </div>
        <strong className="billing-invoice-remaining-amount">{currency(Math.abs(difference))}</strong>
      </div>
    )
  }

  const renderDiscountCard = (
    draft: DiscountDraft,
    subtotalGross: number,
    onTypeChange: (type: DiscountType) => void,
    onValueChange: (value: string) => void,
  ) => {
    const type = normalizeDiscountType(draft.type)
    const discountGross = calculateDiscountGross(subtotalGross, draft)
    const suffix = type === 'PERCENT' ? '%' : '€'
    return (
      <section className="billing-invoice-discount-card">
        <div className="billing-invoice-discount-head">
          <div className="billing-invoice-discount-title">
            <span className="billing-invoice-discount-dot" aria-hidden>◈</span>
            <h3>{locale === 'sl' ? 'Popust' : 'Discount'}</h3>
            <span className="billing-invoice-info-dot">i</span>
          </div>
        </div>
        <div className="billing-invoice-discount-controls">
          <div className="billing-invoice-discount-segmented" role="group" aria-label={locale === 'sl' ? 'Vrsta popusta' : 'Discount type'}>
            <button
              type="button"
              className={type === 'PERCENT' ? 'is-active' : ''}
              aria-pressed={type === 'PERCENT'}
              onClick={() => onTypeChange('PERCENT')}
            >
              %
            </button>
            <button
              type="button"
              className={type === 'AMOUNT' ? 'is-active' : ''}
              aria-pressed={type === 'AMOUNT'}
              onClick={() => onTypeChange('AMOUNT')}
            >
              €
            </button>
          </div>
          <label className="billing-invoice-discount-input-wrap">
            <span className="sr-only">{locale === 'sl' ? 'Vrednost popusta' : 'Discount value'}</span>
            <input
              type="text"
              inputMode="decimal"
              value={draft.value}
              onChange={(event) => onValueChange(sanitizeDiscountValueInput(event.target.value))}
              onBlur={() => onValueChange(String(discountValueNumber(draft)))}
              placeholder="0.00"
            />
            <em>{suffix}</em>
          </label>
        </div>
        <div className="billing-invoice-discount-foot">
          <span>{locale === 'sl' ? 'Popust bo izračunan od vmesnega seštevka.' : 'Discount is calculated from the subtotal.'}</span>
          <strong>{discountGross > 0 ? `- ${currency(discountGross)}` : currency(0)}</strong>
        </div>
      </section>
    )
  }

  const renderOpenBillEditorPaymentMethods = (ob: OpenBill, totalGross: number) => {
    const splits = getOpenBillPaymentSplits(ob, totalGross)
    const effectiveType = resolveOpenBillEffectiveType(ob)
    const availableMethods = effectiveType === 'ADVANCE'
      ? visiblePaymentMethods.filter((method) => !isDepositPaymentMethod(method))
      : visiblePaymentMethods
    return (
      <section className="billing-invoice-payment-card">
        <div className="billing-invoice-section-title-row">
          <h3>{locale === 'sl' ? 'Načini plačila' : 'Payment methods'}</h3>
          <span>{splits.length} {splits.length === 1 ? (locale === 'sl' ? 'način' : 'method') : (locale === 'sl' ? 'načini' : 'methods')}</span>
        </div>
        <div className="billing-invoice-payment-list">
          {splits.length > 0 ? splits.map((split) => {
            const isEntitlement = isEntitlementPaymentSplit(split)
            const isAdvanceSplit = isAdvancePaymentSplit(split)
            const advanceSelections = getAdvanceSelectionsForSplit(split)
            const selectedMethod = isEntitlement ? null : paymentMethods.find((method) => method.id === split.paymentMethodId)
            const methodOptions = selectedMethod && !availableMethods.some((entry) => entry.id === selectedMethod.id)
              ? [...availableMethods, selectedMethod]
              : availableMethods
            const displayedAmountGross = isAdvanceSplit ? formatPaymentAmountInput(sumAdvanceSelectionGross(advanceSelections)) : split.amountGross
            return (
              <div key={split.key} className={`billing-invoice-payment-row billing-invoice-payment-row--split${isEntitlement ? ' billing-invoice-payment-row--entitlement' : ''}`}>
                <span className="billing-invoice-payment-icon" aria-hidden>
                  {isEntitlement ? entitlementPaymentIcon() : selectedMethod ? paymentTypeIcon(selectedMethod.paymentType, selectedMethod.name) : paymentTypeIcon(undefined)}
                </span>
                <select
                  value={isEntitlement ? ENTITLEMENT_PAYMENT_OPTION_VALUE : (split.paymentMethodId ?? '')}
                  onChange={(e) => {
                    if (e.target.value === ENTITLEMENT_PAYMENT_OPTION_VALUE) {
                      selectEntitlementPaymentMethod(ob, split.key, totalGross)
                      return
                    }
                    const paymentMethodId = Number(e.target.value)
                    const nextMethod = paymentMethods.find((method) => method.id === paymentMethodId) || null
                    const nextAdvanceSelections = isDepositPaymentMethod(nextMethod) ? getAdvanceSelectionsForSplit(split) : []
                    updateOpenBillPaymentSplit(ob, split.key, {
                      kind: 'payment',
                      entitlementCode: undefined,
                      paymentMethodId,
                      amountGross: isDepositPaymentMethod(nextMethod) ? formatPaymentAmountInput(sumAdvanceSelectionGross(nextAdvanceSelections)) : split.amountGross,
                      advanceSelections: nextAdvanceSelections,
                    })
                    if (isDepositPaymentMethod(nextMethod)) {
                      openAdvancePaymentModalForOpenBill(ob, split.key)
                    }
                  }}
                  aria-label={billingCopy.paymentMethod}
                >
                  {methodOptions.map((method) => (
                    <option key={method.id} value={method.id}>{localizedPaymentMethodName(method, locale)}</option>
                  ))}
                  <option value={ENTITLEMENT_PAYMENT_OPTION_VALUE}>{entitlementPaymentLabel()}</option>
                </select>
                <input
                  className="billing-invoice-payment-amount-input"
                  type="text"
                  inputMode="decimal"
                  value={displayedAmountGross}
                  readOnly={isEntitlement || isAdvanceSplit}
                  onClick={() => {
                    if (isEntitlement) {
                      openEntitlementPaymentChooser(ob, split.key, totalGross)
                      return
                    }
                    if (isAdvanceSplit) openAdvancePaymentModalForOpenBill(ob, split.key)
                  }}
                  onChange={(e) => {
                    if (isEntitlement || isAdvanceSplit) return
                    updateOpenBillPaymentSplit(ob, split.key, { amountGross: e.target.value.replace(/[^0-9.,-]/g, '').replace(',', '.') })
                  }}
                  onBlur={() => {
                    if (!isEntitlement && !isAdvanceSplit) updateOpenBillPaymentSplit(ob, split.key, { amountGross: formatPaymentAmountInput(Number(split.amountGross || 0)) })
                  }}
                  aria-label={locale === 'sl' ? 'Znesek plačila' : 'Payment amount'}
                />
                <button
                  type="button"
                  className={`billing-invoice-match-mini${isAdvanceSplit ? ' billing-invoice-match-mini--advance' : ''}`}
                  aria-label={isEntitlement
                    ? (locale === 'sl' ? 'Izberi način vnosa ugodnosti' : 'Choose entitlement input')
                    : isAdvanceSplit
                      ? (locale === 'sl' ? 'Izberi predplačila' : 'Choose advance payments')
                      : (locale === 'sl' ? 'Dopolni razliko na to metodo plačila' : 'Match remaining on this payment method')}
                  title={isEntitlement
                    ? (locale === 'sl' ? 'Ugodnost' : 'Entitlement')
                    : isAdvanceSplit
                      ? (locale === 'sl' ? 'Izberi predplačila' : 'Choose advance payments')
                      : (locale === 'sl' ? 'Dopolni razliko' : 'Match remaining')}
                  onClick={() => {
                    if (isEntitlement) {
                      openEntitlementPaymentChooser(ob, split.key, totalGross)
                      return
                    }
                    if (isAdvanceSplit) {
                      openAdvancePaymentModalForOpenBill(ob, split.key)
                      return
                    }
                    matchOpenBillPaymentSplitToRemaining(ob, split.key, totalGross)
                  }}
                >
                  {isEntitlement ? entitlementScanIcon() : isAdvanceSplit ? paymentTypeIcon('OTHER', 'Predplačilo') : matchRemainingIcon()}
                </button>
                <button
                  type="button"
                  className="billing-invoice-delete-mini"
                  aria-label={locale === 'sl' ? 'Odstrani način plačila' : 'Remove payment method'}
                  title={locale === 'sl' ? 'Odstrani način plačila' : 'Remove payment method'}
                  onClick={() => removeOpenBillPaymentSplit(ob, split.key)}
                >
                  🗑
                </button>
                {isAdvanceSplit && (
                  <div className="billing-invoice-advance-summary">
                    <strong>{advanceSelections.length > 0 ? describeAdvanceSelectionCount(advanceSelections.length) : (locale === 'sl' ? 'Predplačila niso izbrana.' : 'No advances selected.')}</strong>
                    <span>{advanceSelections.length > 0 ? currency(sumAdvanceSelectionGross(advanceSelections)) : (locale === 'sl' ? 'Kliknite za izbor predplačil.' : 'Open the picker to select advances.')}</span>
                  </div>
                )}
              </div>
            )
          }) : (
            <div className="billing-invoice-payment-empty">{locale === 'sl' ? 'Ni izbranega načina plačila.' : 'No payment method selected.'}</div>
          )}
          <button
            type="button"
            className="billing-invoice-add-dashed"
            disabled={availableMethods.length === 0}
            onClick={() => addOpenBillPaymentSplit(ob, totalGross)}
          >
            + {locale === 'sl' ? 'Dodaj način plačila' : 'Add payment method'}
          </button>
          {renderPaymentRemainingToMatch(splits, totalGross)}
        </div>
      </section>
    )
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
      <div className="billing-payee-modal-backdrop" onMouseDown={closeAdvancePaymentModal} role="presentation">
        <div className="billing-advance-picker-modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={locale === 'sl' ? 'Izberi predplačila' : 'Choose advance payments'}>
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
      </div>
    )
  }

  const renderEntitlementPaymentModal = () => {
    if (!entitlementPaymentTarget) return null
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
      <div className="billing-entitlement-modal-backdrop" onMouseDown={closeEntitlementPaymentModal} role="presentation">
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
              <span>{locale === 'sl' ? 'Ugodnost lahko uporabite kot plačilo samo pri računih, ki imajo povezavo na termin.' : 'Entitlements can only be applied as payment when the bill is linked to a booking.'}</span>
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
                    {locale === 'sl' ? 'Plačnik nima razpoložljivih kart ali paketov za to storitev.' : 'The payee has no available tickets or packs for this service.'}
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
      </div>
    )
  }

  const renderModernOpenBillLineEditor = (
    rowBill: OpenBill,
    idx: number,
    options?: { showClientColumn?: boolean; clientLabel?: string; selectable?: boolean },
  ) => {
    const item = getOpenBillItems(rowBill)[idx]
    const billServices = selectableServicesForOpenBill(rowBill)
    if (!item) return null
    const lineKey = openBillEditorLineKey(rowBill, idx, item)
    const selectable = options?.selectable !== false
    const selected = Boolean(selectedOpenBillLines[lineKey])
    return (
      <div
        key={lineKey}
        className={`billing-invoice-item-row${options?.showClientColumn ? ' billing-invoice-item-row--with-client' : ''}${selected ? ' is-selected' : ''}`}
        draggable
        onDragStart={() => setDraggedOpenBillLine({ openBillId: rowBill.id, index: idx })}
        onDragEnd={() => setDraggedOpenBillLine(null)}
      >
        <span className="billing-invoice-row-tools">
          {selectable && (
            <input
              type="checkbox"
              checked={selected}
              onChange={(event) => {
                const checked = event.target.checked
                setSelectedOpenBillLines((prev) => {
                  const next = { ...prev }
                  if (checked) next[lineKey] = true
                  else delete next[lineKey]
                  return next
                })
              }}
              onClick={(event) => event.stopPropagation()}
              aria-label={locale === 'sl' ? 'Izberi postavko za premik' : 'Select item to move'}
            />
          )}
          <span className="billing-invoice-drag-handle" aria-hidden>⠿</span>
        </span>
        <div className="billing-bill-modal-field billing-bill-modal-field--service">
          <select
            value={item.transactionServiceId}
            onChange={(e) => {
              const id = Number(e.target.value)
              const svc = billServices.find((entry) => entry.id === id)
              const next = [...getOpenBillItems(rowBill)]
              next[idx] = { ...next[idx], transactionServiceId: id, netPrice: String(svc?.netPrice ?? 0), grossPrice: grossStringFromService(svc) }
              setOpenBillItems(rowBill, next)
            }}
          >
            {billServices.map((service) => (
              <option key={service.id} value={service.id}>{serviceOptionLabel(service)}</option>
            ))}
          </select>
        </div>
        {options?.showClientColumn && (
          <div className="billing-invoice-client-chip" title={options.clientLabel}>{options.clientLabel || '—'}</div>
        )}
        <div className="billing-bill-modal-field billing-bill-modal-field--qty">
          <input
            type="number"
            min="1"
            value={item.quantity}
            onChange={(e) => {
              const next = [...getOpenBillItems(rowBill)]
              next[idx] = { ...next[idx], quantity: Number(e.target.value) }
              setOpenBillItems(rowBill, next)
            }}
          />
        </div>
        <div className="billing-bill-modal-field billing-bill-modal-field--price">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={formatCashRegisterAmount(Number(item.grossPrice || 0), locale)}
            onChange={(e) => {
              const digits = cashRegisterDigitsFromRaw(e.target.value)
              const cents = digits ? Number.parseInt(digits, 10) : 0
              const grossStr = Number.isFinite(cents) ? (cents / 100).toFixed(2) : '0'
              const next = [...getOpenBillItems(rowBill)]
              next[idx] = { ...next[idx], grossPrice: grossStr, netPrice: String(grossToNet(grossStr, item.transactionServiceId)) }
              setOpenBillItems(rowBill, next)
            }}
          />
        </div>
        <div className="billing-invoice-row-amount"><strong>{currency(lineGrossTotal(item))}</strong></div>
        <button
          type="button"
          className="billing-invoice-delete-mini"
          onClick={() => setOpenBillItems(rowBill, getOpenBillItems(rowBill).filter((_, i) => i !== idx))}
          aria-label={billingCopy.removeBillLine}
          title={billingCopy.removeBillLine}
        >
          🗑
        </button>
      </div>
    )
  }

  const renderModernBillFormLineEditor = (item: BillForm['items'][number], index: number) => (
    <div key={index} className="billing-invoice-item-row">
      <span className="billing-invoice-drag-handle" aria-hidden>⠿</span>
      <div className="billing-bill-modal-field billing-bill-modal-field--service">
        <select
          value={item.transactionServiceId}
          onChange={(e) => {
            const id = Number(e.target.value)
            const service = services.find((entry) => entry.id === id)
            const next = [...billForm.items]
            next[index] = { ...next[index], transactionServiceId: id, netPrice: String(service?.netPrice ?? 0), grossPrice: grossStringFromService(service) }
            setBillForm({ ...billForm, items: next })
          }}
        >
          {availableBillServices.map((service) => (
            <option key={service.id} value={service.id}>{serviceOptionLabel(service)}</option>
          ))}
        </select>
      </div>
      <div className="billing-bill-modal-field billing-bill-modal-field--qty">
        <input
          type="number"
          min="1"
          value={item.quantity}
          onChange={(e) => {
            const next = [...billForm.items]
            next[index] = { ...next[index], quantity: Number(e.target.value) }
            setBillForm({ ...billForm, items: next })
          }}
        />
      </div>
      <div className="billing-bill-modal-field billing-bill-modal-field--price">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={billingCopy.grossUnitPrice}
          value={formatCashRegisterAmount(Number(item.grossPrice || 0), locale)}
          onChange={(e) => {
            const digits = cashRegisterDigitsFromRaw(e.target.value)
            const cents = digits ? Number.parseInt(digits, 10) : 0
            const grossStr = Number.isFinite(cents) ? (cents / 100).toFixed(2) : '0'
            const next = [...billForm.items]
            next[index] = { ...next[index], grossPrice: grossStr, netPrice: String(grossToNet(grossStr, item.transactionServiceId)) }
            setBillForm({ ...billForm, items: next })
          }}
        />
      </div>
      <div className="billing-invoice-row-amount"><strong>{currency(lineGrossTotal(item))}</strong></div>
      <button
        type="button"
        className="billing-invoice-delete-mini"
        onClick={() => setBillForm({ ...billForm, items: billForm.items.filter((_, i) => i !== index) })}
        aria-label={billingCopy.removeBillLine}
        title={billingCopy.removeBillLine}
      >
        🗑
      </button>
    </div>
  )

  const renderCreateBillPaymentMethods = (totalGross: number) => {
    const splits = getCreateBillPaymentSplits(totalGross)
    return (
      <section className="billing-invoice-payment-card">
        <div className="billing-invoice-section-title-row">
          <h3>{locale === 'sl' ? 'Načini plačila' : 'Payment methods'}</h3>
          <span>{splits.length} {splits.length === 1 ? (locale === 'sl' ? 'način' : 'method') : (locale === 'sl' ? 'načini' : 'methods')}</span>
        </div>
        <div className="billing-invoice-payment-list">
          {splits.length > 0 ? splits.map((split) => {
            const selectedMethod = paymentMethods.find((method) => method.id === split.paymentMethodId)
            const isAdvanceSplit = isAdvancePaymentSplit(split)
            const advanceSelections = getAdvanceSelectionsForSplit(split)
            const methodOptions = selectedMethod && !createAvailablePaymentMethods.some((entry) => entry.id === selectedMethod.id)
              ? [...createAvailablePaymentMethods, selectedMethod]
              : createAvailablePaymentMethods
            const displayedAmountGross = isAdvanceSplit ? formatPaymentAmountInput(sumAdvanceSelectionGross(advanceSelections)) : split.amountGross
            return (
              <div key={split.key} className="billing-invoice-payment-row billing-invoice-payment-row--split">
                <span className="billing-invoice-payment-icon" aria-hidden>
                  {selectedMethod ? paymentTypeIcon(selectedMethod.paymentType, selectedMethod.name) : paymentTypeIcon(undefined)}
                </span>
                <select
                  value={split.paymentMethodId ?? ''}
                  onChange={(e) => {
                    const paymentMethodId = Number(e.target.value)
                    const nextMethod = paymentMethods.find((method) => method.id === paymentMethodId) || null
                    const nextAdvanceSelections = isDepositPaymentMethod(nextMethod) ? getAdvanceSelectionsForSplit(split) : []
                    updateCreateBillPaymentSplit(split.key, {
                      paymentMethodId,
                      amountGross: isDepositPaymentMethod(nextMethod) ? formatPaymentAmountInput(sumAdvanceSelectionGross(nextAdvanceSelections)) : split.amountGross,
                      advanceSelections: nextAdvanceSelections,
                    })
                    if (isDepositPaymentMethod(nextMethod)) openAdvancePaymentModalForCreate(split.key)
                  }}
                  aria-label={billingCopy.paymentMethod}
                >
                  {methodOptions.map((method) => (
                    <option key={method.id} value={method.id}>{localizedPaymentMethodName(method, locale)}</option>
                  ))}
                </select>
                <input
                  className="billing-invoice-payment-amount-input"
                  type="text"
                  inputMode="decimal"
                  value={displayedAmountGross}
                  readOnly={isAdvanceSplit}
                  onClick={() => { if (isAdvanceSplit) openAdvancePaymentModalForCreate(split.key) }}
                  onChange={(e) => {
                    if (isAdvanceSplit) return
                    updateCreateBillPaymentSplit(split.key, { amountGross: e.target.value.replace(/[^0-9.,-]/g, '').replace(',', '.') })
                  }}
                  onBlur={() => {
                    if (!isAdvanceSplit) updateCreateBillPaymentSplit(split.key, { amountGross: formatPaymentAmountInput(Number(split.amountGross || 0)) })
                  }}
                  aria-label={locale === 'sl' ? 'Znesek plačila' : 'Payment amount'}
                />
                <button
                  type="button"
                  className={`billing-invoice-match-mini${isAdvanceSplit ? ' billing-invoice-match-mini--advance' : ''}`}
                  aria-label={isAdvanceSplit ? (locale === 'sl' ? 'Izberi predplačila' : 'Choose advance payments') : (locale === 'sl' ? 'Dopolni razliko na to metodo plačila' : 'Match remaining on this payment method')}
                  title={isAdvanceSplit ? (locale === 'sl' ? 'Izberi predplačila' : 'Choose advance payments') : (locale === 'sl' ? 'Dopolni razliko' : 'Match remaining')}
                  onClick={() => {
                    if (isAdvanceSplit) {
                      openAdvancePaymentModalForCreate(split.key)
                      return
                    }
                    matchCreateBillPaymentSplitToRemaining(split.key, totalGross)
                  }}
                >
                  {isAdvanceSplit ? paymentTypeIcon('OTHER', 'Predplačilo') : matchRemainingIcon()}
                </button>
                <button
                  type="button"
                  className="billing-invoice-delete-mini"
                  onClick={() => removeCreateBillPaymentSplit(split.key)}
                  aria-label={locale === 'sl' ? 'Odstrani način plačila' : 'Remove payment method'}
                  title={locale === 'sl' ? 'Odstrani način plačila' : 'Remove payment method'}
                >
                  🗑
                </button>
                {isAdvanceSplit && (
                  <div className="billing-invoice-advance-summary">
                    <strong>{advanceSelections.length > 0 ? describeAdvanceSelectionCount(advanceSelections.length) : (locale === 'sl' ? 'Predplačila niso izbrana.' : 'No advances selected.')}</strong>
                    <span>{advanceSelections.length > 0 ? currency(sumAdvanceSelectionGross(advanceSelections)) : (locale === 'sl' ? 'Kliknite za izbor predplačil.' : 'Open the picker to select advances.')}</span>
                  </div>
                )}
              </div>
            )
          }) : <div className="billing-invoice-payment-empty">{billingCopy.selectPaymentMethod}</div>}
          <button
            type="button"
            className="billing-invoice-add-dashed"
            disabled={createAvailablePaymentMethods.length === 0}
            onClick={() => addCreateBillPaymentSplit(totalGross)}
          >
            + {locale === 'sl' ? 'Dodaj način plačila' : 'Add payment method'}
          </button>
          {renderPaymentRemainingToMatch(splits, totalGross)}
        </div>
      </section>
    )
  }

  const renderCreateBillPayeeDialog = () => {
    if (!editingCreateBillPayee) return null
    return (
      <div className="billing-payee-modal-backdrop" onMouseDown={() => setEditingCreateBillPayee(false)} role="presentation">
        <div className="billing-payee-modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={locale === 'sl' ? 'Uredi plačnika računa' : 'Edit bill payee'}>
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
            {billForm.billingTarget === 'COMPANY' && (
              <Field label={billingCopy.recipientCompany}>
                <div className="client-picker" onClick={(e) => e.stopPropagation()} style={{ minWidth: 0 }}>
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
                        {selectedRecipientCompany?.name || billingCopy.selectCompany}
                      </button>
                    )}
                    <span className="client-search-icon" aria-hidden>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                    </span>
                  </div>
                  <button
                    type="button"
                    className="secondary client-add-btn"
                    onClick={() => openAddCompanyModal({ mode: 'createBill' })}
                  >
                    +
                  </button>
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
              </Field>
            )}
            {(billForm.billingTarget === 'PERSON' || clientsLinkedToInvoiceCompany.length > 0) && (
              <Field label={billForm.billingTarget === 'COMPANY' ? billingCopy.clientOptional : billingCopy.client}>
                <select
                  value={billForm.clientId ?? ''}
                  onChange={(e) => {
                    const nextClientId = e.target.value === '' ? undefined : Number(e.target.value)
                    const pool = billForm.billingTarget === 'COMPANY' ? clientsLinkedToInvoiceCompany : clients
                    const nextClient = pool.find((client) => client.id === nextClientId)
                    setBillForm({
                      ...billForm,
                      clientId: nextClientId,
                      recipientCompanyId: billForm.billingTarget === 'COMPANY'
                        ? (billForm.recipientCompanyId ?? nextClient?.billingCompany?.id)
                        : undefined,
                    })
                  }}
                >
                  <option value="">{billingCopy.selectClient}</option>
                  {(billForm.billingTarget === 'COMPANY' ? clientsLinkedToInvoiceCompany : clients).map((client) => (
                    <option key={client.id} value={client.id}>{fullName(client)}</option>
                  ))}
                </select>
              </Field>
            )}
            <Field label={locale === 'sl' ? 'Zaposleni (opcijsko)' : 'Employee (optional)'}>
              <select value={billForm.consultantId ?? ''} onChange={(e) => setBillForm({ ...billForm, consultantId: e.target.value === '' ? undefined : Number(e.target.value) })}>
                <option value="">{locale === 'sl' ? 'Privzeto: trenutni uporabnik' : 'Default: current user'}</option>
                {(isAdmin ? users : [me]).map((user) => (
                  <option key={user.id} value={user.id}>{fullName(user)}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="billing-payee-modal-footer">
            <button type="button" className="billing-bill-modal-save-btn" onClick={() => setEditingCreateBillPayee(false)}>
              <span>{locale === 'sl' ? 'Uporabi' : 'Apply'}</span>
            </button>
          </div>
        </div>
      </div>
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
    const sortedClients = [...clients].sort((a, b) => {
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
      <div className="billing-payee-modal-backdrop" onMouseDown={() => { if (!creatingAdditionalOpenBill) setAddOpenBillContext(null) }} role="presentation">
        <div className="billing-payee-modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={locale === 'sl' ? 'Dodaj nov račun' : 'Add new bill'}>
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
                <select
                  value={ctx.recipientCompanyId ?? ''}
                  onChange={(e) => setAddOpenBillContext({
                    ...ctx,
                    recipientCompanyId: e.target.value === '' ? undefined : Number(e.target.value),
                    clientId: undefined,
                  })}
                >
                  <option value="">{billingCopy.selectCompany}</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>{company.name}</option>
                  ))}
                </select>
              </Field>
            )}
            <Field label={ctx.billingTarget === 'COMPANY' ? billingCopy.clientOptional : billingCopy.client}>
              <select
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
              </select>
            </Field>
            <Field label={locale === 'sl' ? 'Zaposleni (opcijsko)' : 'Employee (optional)'}>
              <select
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
              </select>
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
      </div>
    )
  }

  const renderOpenBillPayeeEditorDialog = () => {
    if (editingOpenBillPayeeId == null) return null
    const targetOpenBill = getOpenBillForEditor(editingOpenBillPayeeId)
    if (!targetOpenBill) return null
    const draft = getOpenBillDetailsDraft(targetOpenBill)
    const draftClient = clients.find((client) => client.id === draft.clientId) || null
    const draftCompany = companies.find((company) => company.id === draft.recipientCompanyId) || null
    const companyClients = draft.recipientCompanyId == null ? [] : clients.filter((client) => client.billingCompany?.id === draft.recipientCompanyId)
    const payeeClientOptions = draft.billingTarget === 'COMPANY'
      ? (
        companyClients.length === 0
          ? clients
          : (draftClient && !companyClients.some((client) => client.id === draftClient.id)
            ? [draftClient, ...companyClients]
            : companyClients)
      )
      : clients
    return (
      <div className="billing-payee-modal-backdrop" onMouseDown={() => setEditingOpenBillPayeeId(null)} role="presentation">
        <div className="billing-payee-modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={locale === 'sl' ? 'Uredi plačnika računa' : 'Edit bill payee'}>
          <div className="billing-payee-modal-head">
            <div>
              <h3>{locale === 'sl' ? 'Uredi plačnika računa' : 'Edit payee for this bill'}</h3>
              <p>{locale === 'sl' ? 'Spremembe veljajo samo za izbrani račun.' : 'Changes apply to this bill only.'}</p>
            </div>
            <button type="button" className="billing-bill-modal-close" onClick={() => setEditingOpenBillPayeeId(null)} aria-label="Close">×</button>
          </div>
          <div className="booking-type-switcher billing-bill-modal-target-switcher billing-payee-type-switcher" role="group" aria-label={locale === 'sl' ? 'Vrsta plačnika' : 'Payee type'}>
            <button
              type="button"
              className={draft.billingTarget === 'PERSON' ? 'booking-type-btn active' : 'booking-type-btn'}
              aria-pressed={draft.billingTarget === 'PERSON'}
              onClick={() => updateOpenBillDetailsDraft(targetOpenBill, { billingTarget: 'PERSON' })}
            >
              {billingCopy.targetPerson}
            </button>
            <button
              type="button"
              className={draft.billingTarget === 'COMPANY' ? 'booking-type-btn active' : 'booking-type-btn'}
              aria-pressed={draft.billingTarget === 'COMPANY'}
              onClick={() => updateOpenBillDetailsDraft(targetOpenBill, {
                billingTarget: 'COMPANY',
                recipientCompanyId: draft.recipientCompanyId ?? draftClient?.billingCompany?.id,
              })}
            >
              {billingCopy.targetCompany}
            </button>
          </div>
          <div className="billing-payee-modal-grid">
            {draft.billingTarget === 'COMPANY' && (
              <Field label={billingCopy.recipientCompany}>
                <div className="client-picker" onClick={(e) => e.stopPropagation()} style={{ minWidth: 0 }}>
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
                  <button
                    type="button"
                    className="secondary client-add-btn"
                    onClick={() => openAddCompanyModal({ mode: 'editOpenBill', openBillId: targetOpenBill.id })}
                  >
                    +
                  </button>
                  {recipientCompanyPickerOpen && (
                    <div className="client-dropdown-panel">
                      {draftClient?.billingCompany && (
                        <button
                          type="button"
                          className={`client-list-item ${draft.recipientCompanyId === draftClient.billingCompany.id ? 'selected' : ''}`}
                          onClick={() => {
                            updateOpenBillDetailsDraft(targetOpenBill, { recipientCompanyId: draftClient.billingCompany?.id })
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
                              updateOpenBillDetailsDraft(targetOpenBill, { recipientCompanyId: company.id })
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
              </Field>
            )}
            <Field label={draft.billingTarget === 'COMPANY' ? billingCopy.clientOptional : billingCopy.client}>
              <select
                value={draft.clientId ?? ''}
                onChange={(e) => updateOpenBillDetailsDraft(targetOpenBill, {
                  clientId: e.target.value === '' ? undefined : Number(e.target.value),
                })}
              >
                <option value="">{billingCopy.selectClient}</option>
                {payeeClientOptions.map((client) => (
                  <option key={client.id} value={client.id}>{fullName(client)}</option>
                ))}
              </select>
            </Field>
            <Field label={locale === 'sl' ? 'Zaposleni (opcijsko)' : 'Employee (optional)'}>
              <select
                value={draft.consultantId ?? ''}
                onChange={(e) => updateOpenBillDetailsDraft(targetOpenBill, {
                  consultantId: e.target.value === '' ? undefined : Number(e.target.value),
                })}
              >
                <option value="">{locale === 'sl' ? 'Privzeto: trenutni uporabnik' : 'Default: current user'}</option>
                {(isAdmin ? users : [me]).map((user) => (
                  <option key={user.id} value={user.id}>{fullName(user)}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="billing-payee-modal-footer">
            <button type="button" className="billing-bill-modal-save-btn" onClick={() => setEditingOpenBillPayeeId(null)}>
              <span>{locale === 'sl' ? 'Uporabi' : 'Apply'}</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderModernOpenBillEditor = (ob: OpenBill) => {
    const rootBill = getOpenBillEditorRoot(ob)
    const baseRelatedOpenBills = getRelatedOpenBillsForEditor(rootBill)
    const onePayeeKey = onePayeeKeyForRelatedOpenBills(baseRelatedOpenBills, rootBill)
    const temporaryOpenBills = getTemporaryOpenBillTabsForRoot(rootBill)
      .filter((entry) => !baseRelatedOpenBills.some((base) => base.id === entry.id))
    const temporaryOpenBillIdSet = new Set(temporaryOpenBills.map((entry) => entry.id))
    const relatedOpenBills = [...baseRelatedOpenBills, ...temporaryOpenBills]
    const onePayeeLocked = hasIssuedBillForOpenBillGroup(rootBill)
    const onePayeeForAll = temporaryOpenBills.length === 0 && !onePayeeLocked && Boolean(openBillOnePayeeForAll[onePayeeKey])
    const visibleTabs = onePayeeForAll ? baseRelatedOpenBills.slice(0, 1) : relatedOpenBills
    const activeBill = onePayeeForAll
      ? (baseRelatedOpenBills[0] ?? rootBill)
      : (relatedOpenBills.find((entry) => entry.id === ob.id) ?? rootBill)
    const activeItems = getOpenBillItems(activeBill)
    const combinedRows = baseRelatedOpenBills.flatMap((entry) => getOpenBillItems(entry).map((item, index) => ({ entry, item, index })))
    const displayedRows = onePayeeForAll ? combinedRows : activeItems.map((item, index) => ({ entry: activeBill, item, index }))
    const totalsItems = onePayeeForAll ? combinedRows.map((row) => row.item) : activeItems
    const detailNet = estimateNet(totalsItems)
    const detailVatRows = vatBreakdownRowsForItems(totalsItems)
    const detailTax = detailVatRows.reduce((sum, row) => sum + row.taxTotal, 0)
    const detailSubtotalGross = detailNet + detailTax
    const detailDiscountDraft = getOpenBillDiscountDraft(activeBill)
    const detailDiscountGross = calculateDiscountGross(detailSubtotalGross, detailDiscountDraft)
    const detailGross = payableGrossAfterDiscount(detailSubtotalGross, detailDiscountDraft)
    const activeBillSelectableServices = selectableServicesForOpenBill(activeBill)
    const totalOpenBills = onePayeeForAll ? 1 : relatedOpenBills.length
    const totalLineItems = relatedOpenBills.reduce((sum, entry) => sum + getOpenBillItems(entry).length, 0)
    const totalAcrossBills = relatedOpenBills.reduce((sum, entry) => sum + openBillPayableGross(entry), 0)
    const addBillSourceBill = baseRelatedOpenBills[0] ?? rootBill
    const addBillSessionId = addBillSourceBill.sessionId
      ?? getOpenBillIncludedSessions(addBillSourceBill).find((s) => Number(s.sessionId) > 0)?.sessionId
      ?? null
    const canAddAdditionalBill = addBillSessionId != null && Number(addBillSessionId) > 0 && !onePayeeForAll
    const relatedIds = new Set(relatedOpenBills.map((entry) => entry.id))
    const externalCandidateOpenBills = openBills
      .filter((entry) => !relatedIds.has(entry.id))
      .sort((a, b) => Number(b.id) - Number(a.id))
    const externalSearch = externalOpenBillSearch.trim().toLowerCase()
    const filteredExternalOpenBills = externalCandidateOpenBills.filter((entry) => {
      if (!externalSearch) return true
      const haystack = [
        `#${entry.id}`,
        formatBillingSessionIdDisplay(entry.sessionId),
        openBillClientLabel(entry),
        openBillEditorSubtitle(entry),
        formatOpenBillSession(entry.sessionInfo),
      ].join(' ').toLowerCase()
      return haystack.includes(externalSearch)
    })
    const displayedLineKeys = displayedRows.map((row) => openBillEditorLineKey(row.entry, row.index, row.item))
    const selectedDisplayedRows = displayedRows.filter((row) => selectedOpenBillLines[openBillEditorLineKey(row.entry, row.index, row.item)])
    const selectableRows = !onePayeeForAll && displayedRows.length > 0
    const allDisplayedRowsSelected = selectableRows && displayedLineKeys.every((key) => selectedOpenBillLines[key])
    const transferTargets = !onePayeeForAll ? relatedOpenBills.filter((entry) => entry.id !== activeBill.id) : []
    const selectedMoveTargetId = moveSelectedTargetOpenBillId != null && transferTargets.some((entry) => entry.id === moveSelectedTargetOpenBillId)
      ? moveSelectedTargetOpenBillId
      : (transferTargets[0]?.id ?? null)
    const selectedMoveTarget = selectedMoveTargetId == null ? null : transferTargets.find((entry) => entry.id === selectedMoveTargetId) ?? null

    const setAllDisplayedLineSelection = (checked: boolean) => {
      setSelectedOpenBillLines((prev) => {
        const next = { ...prev }
        displayedLineKeys.forEach((key) => {
          if (checked) next[key] = true
          else delete next[key]
        })
        return next
      })
    }

    const moveSelectedLinesToBill = (targetBill: OpenBill) => {
      if (selectedDisplayedRows.length === 0 || targetBill.id === activeBill.id) return
      const selectedKeys = new Set(selectedDisplayedRows.map((row) => openBillEditorLineKey(row.entry, row.index, row.item)))
      const movedItems: OpenBillEditItem[] = []
      const sourceMap = new Map<number, { bill: OpenBill; indices: Set<number> }>()

      displayedRows.forEach((row) => {
        const key = openBillEditorLineKey(row.entry, row.index, row.item)
        if (!selectedKeys.has(key)) return
        movedItems.push({ ...row.item })
        const current = sourceMap.get(row.entry.id) ?? { bill: row.entry, indices: new Set<number>() }
        current.indices.add(row.index)
        sourceMap.set(row.entry.id, current)
      })

      sourceMap.forEach(({ bill, indices }) => {
        setOpenBillItems(bill, getOpenBillItems(bill).filter((_, index) => !indices.has(index)))
      })
      setOpenBillItems(targetBill, [...getOpenBillItems(targetBill), ...movedItems])
      setSelectedOpenBillLines((prev) => {
        const next = { ...prev }
        selectedKeys.forEach((key) => { delete next[key] })
        return next
      })
      selectOpenBillEditorTab(targetBill)
    }

    return (
      <div className="billing-invoice-modern-body">
        <section className="billing-invoice-management-card billing-invoice-management-card--bookmarks">
          <div className="billing-invoice-management-head">
            <div>
              <h3>{locale === 'sl' ? 'Prejemnik računa' : 'Bill recipient'}</h3>
              <p>{locale === 'sl' ? 'Preklopite med računi ali dodajte novega.' : 'Switch between bills or add a new one.'}</p>
            </div>
            {baseRelatedOpenBills.length > 1 && temporaryOpenBills.length === 0 && !onePayeeLocked && (
              <button
                type="button"
                className="billing-invoice-one-payee-switch"
                aria-pressed={onePayeeForAll}
                onClick={() => {
                  const next = !onePayeeForAll
                  setOpenBillOnePayeeForAll((prev) => ({ ...prev, [onePayeeKey]: next }))
                  if (next && baseRelatedOpenBills[0]) selectOpenBillEditorTab(baseRelatedOpenBills[0])
                }}
              >
                <span>{locale === 'sl' ? 'Uporabi enega plačnika za vse račune' : 'Use one payee for all bills'}</span>
                <span className="calendar-payment-manager-info-dot" aria-hidden>i</span>
                <span className={`modern-switch ${onePayeeForAll ? 'on' : ''}`} aria-hidden><span /></span>
              </button>
            )}
          </div>
          <div className="billing-invoice-tabs-row billing-invoice-tabs-row--bookmarks">
            {visibleTabs.map((entry) => {
              const meta = openBillEditorTabMeta(entry)
              const selected = entry.id === activeBill.id
              const temporary = temporaryOpenBillIdSet.has(entry.id)
              return (
                <button
                  key={entry.id}
                  type="button"
                  className={`billing-invoice-bill-tab billing-invoice-bill-tab--bookmark billing-invoice-bill-tab--${temporary ? 'temporary' : (meta.target === 'COMPANY' ? 'company' : 'client')}${selected ? ' is-active' : ''}` }
                  onClick={() => selectOpenBillEditorTab(entry)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => moveOpenBillLineToBill(entry)}
                >
                  <span className="billing-invoice-tab-icon" aria-hidden>
                    {temporary ? '▯' : (meta.target === 'COMPANY' ? '▦' : '♙')}
                  </span>
                  <span className="billing-invoice-tab-copy">
                    <strong>{temporary ? (entry.reference || meta.label || `#${entry.id}`) : meta.label}</strong>
                    <small>{temporary ? (locale === 'sl' ? 'Za prenos' : 'For transfer') : meta.typeLabel}</small>
                    {!temporary && meta.serviceClientLabel && (
                      <span className="billing-invoice-tab-service-client">
                        {locale === 'sl' ? 'Klient: ' : 'Client: '}{meta.serviceClientLabel}
                      </span>
                    )}
                  </span>
                  {temporary ? (
                    <span
                      className="billing-invoice-tab-edit billing-invoice-tab-remove"
                      role="button"
                      tabIndex={0}
                      title={locale === 'sl' ? 'Odstrani začasni račun' : 'Remove temporary bill'}
                      onClick={(e) => {
                        e.stopPropagation()
                        removeTemporaryOpenBillTab(rootBill, entry.id)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          e.stopPropagation()
                          removeTemporaryOpenBillTab(rootBill, entry.id)
                        }
                      }}
                    >
                      ×
                    </span>
                  ) : (
                    <span
                      className="billing-invoice-tab-edit"
                      role="button"
                      tabIndex={0}
                      title={locale === 'sl' ? 'Uredi plačnika' : 'Edit payee'}
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingOpenBillPayeeId(entry.id)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          e.stopPropagation()
                          setEditingOpenBillPayeeId(entry.id)
                        }
                      }}
                    >
                      ✎
                    </span>
                  )}
                </button>
              )
            })}
            {!onePayeeForAll && (
              <div className="billing-invoice-add-tab-wrap">
                <button
                  type="button"
                  className="billing-invoice-add-tab billing-invoice-add-tab--bookmark"
                  onClick={() => setOpenBillAddMenuForId((current) => (current === rootBill.id ? null : rootBill.id))}
                  title={locale === 'sl' ? 'Dodaj račun ali odpri obstoječega za prenos postavk.' : 'Add a bill or open an existing one for moving items.'}
                >
                  <span>+</span>
                  <strong>{locale === 'sl' ? 'Dodaj račun' : 'Add bill'}</strong>
                </button>
                {openBillAddMenuForId === rootBill.id && (
                  <div className="billing-invoice-add-menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      disabled={!canAddAdditionalBill}
                      onClick={() => {
                        setOpenBillAddMenuForId(null)
                        openAddOpenBillForSessionModal(addBillSourceBill)
                      }}
                    >
                      <span className="billing-invoice-add-menu-icon" aria-hidden>+</span>
                      <span>
                        <strong>{locale === 'sl' ? 'Dodaj nov račun tej seji' : 'Add new bill to this session'}</strong>
                        <small>{locale === 'sl' ? 'Ustvari nov zavihek za plačnika v trenutni seji.' : 'Create a new payee tab for the current session.'}</small>
                      </span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={externalCandidateOpenBills.length === 0}
                      onClick={() => {
                        setOpenBillAddMenuForId(null)
                        setExternalOpenBillPickerForRootId(rootBill.id)
                      }}
                    >
                      <span className="billing-invoice-add-menu-icon billing-invoice-add-menu-icon--purple" aria-hidden>▣</span>
                      <span>
                        <strong>{locale === 'sl' ? 'Odpri račun iz druge seje' : 'Open bill from another session'}</strong>
                        <small>{locale === 'sl' ? 'Začasno ga dodajte samo za prenos postavk.' : 'Temporarily add it only to move line items.'}</small>
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          {temporaryOpenBills.length > 0 && (
            <div className="billing-invoice-inline-note billing-invoice-inline-note--transfer">
              <span aria-hidden>ⓘ</span>
              {locale === 'sl'
                ? 'Račun iz druge seje je odprt začasno samo za prenos postavk. Po zaprtju in ponovnem odprtju vrstice ne bo več viden, razen če ga ponovno dodate.'
                : 'The bill from another session is open temporarily only for moving items. After closing and reopening this row it will not be shown unless you add it again.'}
            </div>
          )}
          {externalOpenBillPickerForRootId === rootBill.id && (
            <div className="billing-invoice-external-picker">
              <div className="billing-invoice-external-picker-head">
                <div>
                  <strong>{locale === 'sl' ? 'Odpri račun iz druge seje' : 'Open bill from another session'}</strong>
                  <small>{locale === 'sl' ? 'Izberite obstoječi odprti račun, ki bo začasno prikazan za prenos postavk.' : 'Choose an existing open bill that will be shown temporarily for moving items.'}</small>
                </div>
                <button type="button" onClick={() => setExternalOpenBillPickerForRootId(null)} aria-label="Close">×</button>
              </div>
              <input
                value={externalOpenBillSearch}
                onChange={(event) => setExternalOpenBillSearch(event.target.value)}
                placeholder={locale === 'sl' ? 'Išči po št. računa, seji, stranki ...' : 'Search by bill no., session, client ...'}
              />
              <div className="billing-invoice-external-picker-list">
                {filteredExternalOpenBills.slice(0, 8).map((entry) => (
                  <button key={entry.id} type="button" onClick={() => addTemporaryOpenBillTab(rootBill, entry)}>
                    <span>
                      <strong>{entry.reference || `#${entry.id}`}</strong>
                      <small>{openBillClientLabel(entry)} · {formatOpenBillSession(entry.sessionInfo)}</small>
                    </span>
                    <span aria-hidden>→</span>
                  </button>
                ))}
                {filteredExternalOpenBills.length === 0 && (
                  <div className="billing-invoice-external-empty">
                    {locale === 'sl' ? 'Ni drugih odprtih računov za prenos.' : 'No other open bills are available for transfer.'}
                  </div>
                )}
              </div>
            </div>
          )}
          {onePayeeForAll && (
            <div className="billing-invoice-inline-note">
              <span aria-hidden>ⓘ</span>
              {locale === 'sl'
                ? 'Vsi klienti v tem terminu so združeni v en račun. Stolpec Klient prikazuje, komu pripada postavka.'
                : 'All clients in this session are combined into one bill. The Client column shows who used each service.'}
            </div>
          )}
        </section>

        <section className="billing-invoice-workspace-card">
          <div className="billing-invoice-items-panel">
            <div className="billing-invoice-section-title-row">
              <h3>{locale === 'sl' ? 'Postavke računa' : 'Bill items'}</h3>
              <span>{displayedRows.length} {displayedRows.length === 1 ? (locale === 'sl' ? 'postavka' : 'item') : (locale === 'sl' ? 'postavk' : 'items')}</span>
            </div>
            {transferTargets.length > 0 && (
              <div className="billing-invoice-selection-toolbar">
                <strong>{selectedDisplayedRows.length} {locale === 'sl' ? 'izbranih postavk' : 'items selected'}</strong>
                <span aria-hidden>→</span>
                <label>
                  <span>{locale === 'sl' ? 'Premakni v račun' : 'Move to bill'}</span>
                  <select
                    value={selectedMoveTargetId ?? ''}
                    onChange={(event) => setMoveSelectedTargetOpenBillId(event.target.value === '' ? null : Number(event.target.value))}
                  >
                    {transferTargets.map((entry) => {
                      const meta = openBillEditorTabMeta(entry)
                      return <option key={entry.id} value={entry.id}>{temporaryOpenBillIdSet.has(entry.id) ? (locale === 'sl' ? `Za prenos · ${meta.label}` : `For transfer · ${meta.label}`) : meta.label}</option>
                    })}
                  </select>
                </label>
                <button
                  type="button"
                  className="billing-invoice-move-selected-btn"
                  disabled={selectedDisplayedRows.length === 0 || !selectedMoveTarget}
                  onClick={() => { if (selectedMoveTarget) moveSelectedLinesToBill(selectedMoveTarget) }}
                >
                  {locale === 'sl' ? 'Premakni' : 'Move'}
                </button>
              </div>
            )}
            <div className="billing-invoice-table-head billing-invoice-table-head--with-client">
              <span className="billing-invoice-row-tools billing-invoice-row-tools--head">
                {!onePayeeForAll && displayedRows.length > 0 && (
                  <input
                    type="checkbox"
                    checked={allDisplayedRowsSelected}
                    onChange={(event) => setAllDisplayedLineSelection(event.target.checked)}
                    aria-label={locale === 'sl' ? 'Izberi vse postavke' : 'Select all items'}
                  />
                )}
              </span>
              <span>{locale === 'sl' ? 'Storitev' : 'Service'}</span>
              <span>{locale === 'sl' ? 'Klient' : 'Client'}</span>
              <span>{locale === 'sl' ? 'Količina' : 'Qty'}</span>
              <span>{locale === 'sl' ? 'Cena' : 'Price'}</span>
              <span>{locale === 'sl' ? 'Znesek' : 'Amount'}</span>
              <span />
            </div>
            <div className="billing-invoice-item-list">
              {displayedRows.length === 0 ? (
                <EmptyState title={billingCopy.noBillLinesTitle} text={billingCopy.noBillLinesText} />
              ) : displayedRows.map((row) => renderModernOpenBillLineEditor(row.entry, row.index, {
                showClientColumn: true,
                clientLabel: openBillItemServiceClientLabel(row.entry, row.item),
                selectable: !onePayeeForAll,
              }))}
              <button
                type="button"
                className="billing-invoice-add-dashed billing-invoice-add-dashed--line"
                disabled={activeBillSelectableServices.length === 0}
                onClick={() => {
                  const firstService = activeBillSelectableServices[0]
                  if (!firstService) return
                  setOpenBillItems(activeBill, [
                    ...getOpenBillItems(activeBill),
                    {
                      clientRowKey: createOpenBillClientRowKey(),
                      transactionServiceId: firstService.id,
                      quantity: 1,
                      netPrice: String(firstService.netPrice),
                      grossPrice: grossStringFromService(firstService),
                      sourceSessionBookingId: createManualOpenBillLineSourceId(),
                    },
                  ])
                }}
              >
                <strong>+ Add line item</strong>
                <small>Drag & drop items to reorder</small>
              </button>
            </div>
          </div>

          <div className="billing-invoice-payment-panel">
            {renderOpenBillEditorPaymentMethods(activeBill, detailGross)}
            {renderDiscountCard(
              detailDiscountDraft,
              detailSubtotalGross,
              (type) => setOpenBillDiscountDraft(activeBill, { type }),
              (value) => setOpenBillDiscountDraft(activeBill, { value }),
            )}
            <section className="billing-invoice-totals-card">
              <div className="billing-bill-modal-summary-line"><span>{locale === 'sl' ? 'Vmesni seštevek' : 'Subtotal'}</span><strong>{currency(detailSubtotalGross)}</strong></div>
              {detailVatRows.map((row) => (
                <div key={row.key} className="billing-bill-modal-summary-line">
                  <span>{row.label}</span>
                  <strong>{currency(row.taxTotal)}</strong>
                </div>
              ))}
              <div className="billing-bill-modal-summary-line billing-bill-modal-summary-line--discount"><span>{locale === 'sl' ? 'Popust' : 'Discount'} <span className="billing-invoice-info-dot">i</span></span><strong>- {currency(detailDiscountGross)}</strong></div>
              <div className="billing-bill-modal-summary-divider" />
              <div className="billing-bill-modal-total-line"><span>{locale === 'sl' ? 'Skupaj' : 'Grand total'}</span><strong>{currency(detailGross)}</strong></div>
            </section>
          </div>
        </section>

        <section className="billing-invoice-compact-summary" aria-label={locale === 'sl' ? 'Povzetek vseh računov' : 'All bills summary'}>
          <div><span className="billing-invoice-summary-icon billing-invoice-summary-icon--blue">▣</span><span>All bills summary</span><strong>{totalOpenBills} {totalOpenBills === 1 ? 'bill' : 'bills'}</strong></div>
          <div><span className="billing-invoice-summary-icon billing-invoice-summary-icon--green">☷</span><span>Total line items</span><strong>{totalLineItems}</strong></div>
          <div><span className="billing-invoice-summary-icon billing-invoice-summary-icon--orange">◈</span><span>Total across all bills</span><strong>{currency(totalAcrossBills)}</strong></div>
          <div><span className="billing-invoice-summary-icon billing-invoice-summary-icon--red">▤</span><span>Total unpaid</span><strong>{currency(totalAcrossBills)}</strong></div>
        </section>
        {renderOpenBillPayeeEditorDialog()}
        {renderAddOpenBillDialog()}
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

  const openBillDescription = (ob: OpenBill) => {
    const names = getOpenBillItems(ob)
      .map((item) => services.find((service) => service.id === item.transactionServiceId)?.description || '')
      .map((name) => name.trim())
      .filter(Boolean)
    const uniqueNames = Array.from(new Set(names))
    if (uniqueNames.length === 0) return '—'
    return uniqueNames.join(' · ')
  }

  const formatOpenBillDateOnly = (sessionInfo?: string) => {
    if (!sessionInfo) return '—'
    const value = String(sessionInfo).trim()
    if (value === MANUAL_OPEN_BILL_BACKEND_LABEL) return billingCopy.manualOpenBillSessionLabel
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match) {
      const [, year, month, day] = match
      return `${day}/${month}/${year}`
    }
    const slashMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
    if (slashMatch) return slashMatch[0]
    return value
  }

  const retryFiscalization = async (billId: number) => {
    if (retryingFiscalBillId) return
    setRetryingFiscalBillId(billId)
    try {
      await api.post(`/fiscal/invoices/${billId}/retry`)
      await load()
    } finally {
      setRetryingFiscalBillId(null)
    }
  }

  const sendCheckoutLink = async (bill: Bill) => {
    if (creatingCheckoutBillId) return
    setCreatingCheckoutBillId(bill.id)
    try {
      await api.post(`/billing/bills/${bill.id}/checkout-session`)
      if (billBankTransferDueAmount(bill) > 0) {
        showToast('success', 'Bank transfer folio with UPN QR sent to client email.')
      } else {
        showToast('success', 'Payment link sent to client email.')
      }
      await load()
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
      await load()
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
      await load()
    } finally {
      setMarkingPaidBillId(null)
    }
  }

  const canRefundBill = (bill: Bill) =>
    bill.paymentStatus === 'paid'
    && Number(bill.totalGross || 0) > 0
    && !bill.refundOfBillId
    && normalizeBillType(bill) === 'INVOICE'

  const refundBill = async (bill: Bill) => {
    if (refundingBillId || !canRefundBill(bill)) return
    const ok = window.confirm(`Create refund invoice for ${bill.billNumber || `#${bill.id}`}?`)
    if (!ok) return
    setRefundingBillId(bill.id)
    try {
      await api.post(`/billing/bills/${bill.id}/refund`)
      showToast('success', 'Refund invoice created.')
      await load()
    } finally {
      setRefundingBillId(null)
    }
  }

  const openFiscalLog = async (bill: Bill) => {
    setFiscalLogBill(bill)
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

  const openFolioPanel = async (bill: Bill, tab: 'invoice' | 'fiscal' = 'invoice') => {
    setDetailFolioBill(normalizeBill(bill))
    setFolioPanelTab(tab)
    await openFiscalLog(bill)
  }

  const renderOpenBillPayTypeControl = (ob: OpenBill) => (
    <div className="billing-open-paytype-icons" onClick={(e) => e.stopPropagation()}>
      {nonDepositPaymentMethods.map((method) => {
        const active = ob.paymentMethod?.id === method.id
        const label = paymentMethodChipLabel(method, locale)
        const fullLabel = localizedPaymentMethodName(method, locale)
        return (
          <button
            key={method.id}
            type="button"
            className={active ? 'billing-open-paytype-chip active' : 'billing-open-paytype-chip'}
            onClick={(e) => {
              e.stopPropagation()
              updateOpenBillPaymentMethod(ob.id, method.id)
            }}
            aria-label={fullLabel}
            title={fullLabel}
          >
            <span className="billing-open-paytype-chip-icon" aria-hidden>{paymentTypeIcon(method.paymentType, method.name)}</span>
            <span className="billing-open-paytype-chip-label">{label}</span>
          </button>
        )
      })}
    </div>
  )

  /** Plain document icon (matches open-bill “create bill” icon, no payment-status badge). */
  const renderPlainFolioPdfIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 17h8M8 13h8" />
    </svg>
  )

  const folioHistoryMobileStatusPill = (bill: Bill): { label: string; variant: 'paid' | 'payment-pending' | 'fiscal-failed' } | null => {
    if (bill.fiscalStatus === 'FAILED') return { label: 'FISCAL FAILED', variant: 'fiscal-failed' }
    if (bill.paymentStatus === 'payment_pending') return { label: 'PAYMENT PENDING', variant: 'payment-pending' }
    if (bill.paymentStatus === 'paid') return { label: 'PAID', variant: 'paid' }
    return null
  }

  return (
    <div className={overlayOnlyMode ? "stack gap-lg billing-open-bill-editor-only" : "stack gap-lg"}>
      <div className="stack gap-lg billing-page-main-stack">
          <Card className={billingTab === 'open' && isOpenBillsMobile ? 'billing-open-mobile-shell billing-modern-card' : 'billing-modern-card'}>
            <div className="billing-modern-header">
              <div className="clients-session-tabs billing-modern-tabs" style={{ marginBottom: 0 }}>
                <button type="button" className={billingTab === 'open' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setBillingTab('open')}>
                  {billingTabIcon('open')}
                  <span>{t('billingTabOpenBills')}</span>
                </button>
                <button type="button" className={billingTab === 'openPayments' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setBillingTab('openPayments')}>
                  {billingTabIcon('openPayments')}
                  <span>{t('billingTabOpenPayments')}</span>
                </button>
                {advanceBillingEnabled && (
                  <button type="button" className={billingTab === 'unusedAdvances' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setBillingTab('unusedAdvances')}>
                    {billingTabIcon('unusedAdvances')}
                    <span>{t('billingTabUnusedAdvances')}</span>
                  </button>
                )}
                <button type="button" className={billingTab === 'history' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setBillingTab('history')}>
                  {billingTabIcon('history')}
                  <span>{t('billingTabFolioHistory')}</span>
                </button>
              </div>
            </div>

            {billingTab === 'open' && (
              <div className="billing-modern-content">
                <div className="billing-modern-filter-row">
                  <div className="billing-modern-search-wrap">
                    <span className="billing-modern-search-icon" aria-hidden>⌕</span>
                    <input
                      className="clients-search-input billing-modern-search"
                      placeholder={t('billingOpenBillsSearchPlaceholder')}
                      value={openBillsSearch}
                      onChange={(e) => setOpenBillsSearch(e.target.value)}
                    />
                  </div>
                  <button type="button" className="clients-modern-new-btn" onClick={openCreateBillModal}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </svg>
                    <span>{locale === 'sl' ? 'Nov račun' : 'New Invoice'}</span>
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
                    <div className="billing-open-modern-mobile-list-head">
                      <h3>{t('billingTabOpenBills')}</h3>
                      <div className="billing-open-mobile-sort-wrap">
                        <button
                          type="button"
                          className="billing-open-modern-mobile-sort-btn"
                          aria-haspopup="menu"
                          aria-expanded={openBillsSortMenuOpen}
                          aria-label={billingCopy.sortOpenBillsAria}
                          onClick={() => setOpenBillsSortMenuOpen((prev) => !prev)}
                        >
                          <span>{openBillsSortLabel}</span>
                          <span className="billing-open-modern-mobile-sort-caret" aria-hidden>▾</span>
                        </button>
                        {openBillsSortMenuOpen ? (
                          <div className="billing-open-mobile-sort-popup" role="menu" aria-label={billingCopy.sortOpenBillsAria}>
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
                    </div>
                    <div className="billing-open-modern-mobile-cards">
                      {sortedOpenBills.map((ob) => {
                        const rowMembers = getOpenBillListGroupMembers(ob)
                        const gross = openBillListGroupGross(ob)
                        const employeeLabel = openBillListGroupEmployeeLabel(ob)
                        const clientLabel = openBillListGroupClientLabel(ob)
                        const rowDescription = Array.from(new Set(rowMembers.map((entry) => openBillDescription(entry)).filter((value) => value && value !== '—'))).join(' · ') || '—'
                        const groupBillCount = rowMembers.length
                        const sessionCount = ob.sessions?.length ?? 0
                        const rawId = String(ob.sessionDisplayId || formatBillingSessionIdDisplay(ob.sessionId) || '—')
                        const displayId = rawId.startsWith('#') ? rawId : `#${rawId}`
                        return (
                          <article key={`${openBillListGroupKey(ob)}:${ob.id}`} className="billing-open-modern-mobile-card" onClick={() => openEditInvoicePopup(ob)}>
                            <div className="billing-open-modern-mobile-card-head">
                              <div className="billing-open-modern-mobile-title-row">
                                <span className="billing-open-modern-mobile-id-chip">{displayId}</span>
                                <div className="billing-open-modern-mobile-client-wrap">
                                  <strong>{clientLabel}</strong>
                                  {(groupBillCount > 1 || sessionCount > 1) ? (
                                    <div className="billing-open-modern-mobile-subchips">
                                      {groupBillCount > 1 ? <span className="billing-open-modern-mobile-subchip">{groupBillCount} {locale === 'sl' ? 'računi' : 'bills'}</span> : null}
                                      {sessionCount > 1 ? <span className="billing-open-modern-mobile-subchip">{sessionCount} {locale === 'sl' ? 'seje' : 'sessions'}</span> : null}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                            <div className="billing-open-modern-mobile-grid">
                              <div className="billing-open-modern-mobile-cell">
                                <span className="billing-open-modern-mobile-cell-icon" aria-hidden>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="3" /><path d="M8 2v4M16 2v4M3 10h18" /></svg>
                                </span>
                                <div>
                                  <span>{billingCopy.openBillsColSession}</span>
                                  <strong>{formatOpenBillSession(ob.sessionInfo)}</strong>
                                </div>
                              </div>
                              <div className="billing-open-modern-mobile-cell">
                                <span className="billing-open-modern-mobile-cell-icon" aria-hidden>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41 11 3H4v7l9.59 9.59a2 2 0 0 0 2.82 0l4.18-4.18a2 2 0 0 0 0-2.82Z" /><path d="M7 7h.01" /></svg>
                                </span>
                                <div>
                                  <span>{locale === 'sl' ? 'Storitev' : 'Service'}</span>
                                  <strong>{rowDescription}</strong>
                                </div>
                              </div>
                              <div className="billing-open-modern-mobile-cell">
                                <span className="billing-open-modern-mobile-cell-icon" aria-hidden>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21a8 8 0 0 0-16 0" /><circle cx="12" cy="7" r="4" /></svg>
                                </span>
                                <div>
                                  <span>{locale === 'sl' ? 'Zaposleni' : 'Employee'}</span>
                                  <strong>{employeeLabel}</strong>
                                </div>
                              </div>
                            </div>
                            <div className="billing-open-modern-mobile-footer">
                              <div>
                                <span>{locale === 'sl' ? 'Odprt znesek' : 'Open amount'}</span>
                                <strong>{currency(gross)}</strong>
                              </div>
                            </div>
                            <div className="billing-open-modern-mobile-paymethod" onClick={(e) => e.stopPropagation()}>
                              <label className="billing-open-modern-mobile-paymethod-label" htmlFor={`open-bill-payment-${ob.id}`}>
                                {locale === 'sl' ? 'Izberite način plačila' : 'Select payment method'}
                              </label>
                              <div className="billing-open-modern-mobile-select-wrap">
                                <select
                                  id={`open-bill-payment-${ob.id}`}
                                  className="billing-open-modern-mobile-select"
                                  value={ob.paymentMethod?.id ?? ''}
                                  onChange={(e) => updateOpenBillPaymentMethod(ob.id, Number(e.target.value))}
                                >
                                  <option value="" disabled>{locale === 'sl' ? 'Izberite način plačila' : 'Select payment method'}</option>
                                  {nonDepositPaymentMethods.map((method) => (
                                    <option key={method.id} value={method.id}>{localizedPaymentMethodName(method, locale)}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="billing-open-modern-mobile-actions" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                className="billing-open-modern-mobile-action billing-open-modern-mobile-action--primary"
                                onClick={() => groupBillCount > 1 ? openEditInvoicePopup(ob) : createBillFromOpen(ob)}
                                disabled={groupBillCount <= 1 && (creatingFromOpenId === ob.id || !ob.paymentMethod?.id)}
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="m9 12 2 2 4-4" /></svg>
                                <span>{creatingFromOpenId === ob.id
                                  ? billingCopy.creating
                                  : (groupBillCount > 1 ? (locale === 'sl' ? 'Uredi račune' : 'Edit bills') : (locale === 'sl' ? 'Zapri račun' : 'Close Invoice'))}</span>
                              </button>
                              <button
                                type="button"
                                className="billing-open-modern-mobile-action billing-open-modern-mobile-action--danger"
                                onClick={() => deleteOpenBill(ob)}
                                disabled={deletingOpenId === ob.id || groupBillCount > 1}
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /></svg>
                                <span>{deletingOpenId === ob.id ? (locale === 'sl' ? 'Brisanje…' : 'Deleting…') : (locale === 'sl' ? 'Izbriši' : 'Delete')}</span>
                              </button>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="billing-modern-table-wrap">
                    <table className="billing-modern-table billing-open-bills-table">
                      <thead>
                        <tr>
                          <th>{billingCopy.openBillsColSessionId}</th>
                          <th>{billingCopy.client}</th>
                          <th>{billingCopy.openBillsColSession} / Description</th>
                          <th>Employee</th>
                          <th>{billingCopy.paymentMethod}</th>
                          <th>Amount</th>
                          <th>Action</th>
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
                          const rowPaymentMethod = rowMembers[0] ?? ob
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
                              <td>
                                {renderOpenBillPayTypeControl(rowPaymentMethod)}
                              </td>
                              <td className="billing-modern-amount">{currency(gross)}</td>
                              <td className="billing-modern-actions" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  className="billing-open-row-action billing-open-row-action--primary"
                                  onClick={() => groupBillCount > 1 ? openEditInvoicePopup(ob) : createBillFromOpen(ob)}
                                  disabled={groupBillCount <= 1 && (creatingFromOpenId === ob.id || items.length === 0 || !ob.paymentMethod?.id)}
                                >
                                  {creatingFromOpenId === ob.id
                                    ? billingCopy.creating
                                    : (groupBillCount > 1 ? (locale === 'sl' ? 'Uredi račune' : 'Edit bills') : (locale === 'sl' ? 'Zapri račun' : 'Close Invoice'))}
                                </button>
                                <button type="button" className="billing-open-row-action billing-open-row-action--danger" onClick={() => deleteOpenBill(ob)} disabled={deletingOpenId === ob.id || groupBillCount > 1}>
                                  {deletingOpenId === ob.id ? 'Deleting…' : 'Delete'}
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    <div className="billing-modern-footer">
                      <span>Showing 1 to {Math.min(sortedOpenBills.length, 6)} of {sortedOpenBills.length} results</span>
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
                <div className="billing-modern-filter-row billing-modern-filter-row--single">
                  <div className="billing-modern-search-wrap">
                    <span className="billing-modern-search-icon" aria-hidden>⌕</span>
                    <input
                      className="clients-search-input billing-modern-search"
                      placeholder={locale === 'sl' ? 'Iskanje po ID naročila, št. računa, plačniku ali znesku ...' : 'Search by order ID, bill number, payer, or amount...'}
                      value={openPaymentsSearch}
                      onChange={(e) => setOpenPaymentsSearch(e.target.value)}
                    />
                  </div>
                </div>

                <div className="billing-modern-stats billing-modern-stats--single">
                  <div className="billing-modern-stat-card">
                    <span className="billing-modern-stat-icon billing-modern-stat-icon--orange" aria-hidden>▧</span>
                    <div>
                      <span className="billing-modern-stat-label">{locale === 'sl' ? 'Čaka na plačilo' : 'Pending Allocation'}</span>
                      <strong>{currency(openPaymentsTotal)}</strong>
                      <small>{openPayments.length} {locale === 'sl' ? 'plačil' : 'payments'}</small>
                    </div>
                  </div>
                </div>

                {openPayments.length === 0 ? <EmptyState title={t('billingTabOpenPayments')} text={locale === 'sl' ? 'Ni odprtih plačil.' : 'No open payments.'} /> : (
                  <div className="billing-modern-table-wrap">
                    <table className="billing-modern-table billing-modern-payments-table">
                      <thead>
                        <tr>
                          <th>Order ID</th>
                          <th>Bill No.</th>
                          <th>Payer</th>
                          <th>Date</th>
                          <th>Due Date</th>
                          <th>Amount</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {openPaymentsPagination.slice.map((bill) => {
                          const dueDate = addDays(bill.issueDate, paymentDeadlineDays)
                          const dueLabel = relativeDueLabel(dueDate)
                          return (
                            <tr key={bill.id}>
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
                                  {markingPaidBillId === bill.id ? 'SAVING…' : 'MARK AS PAID'}
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    <div className="billing-modern-footer">
                      <span>
                        Showing {openPaymentsPagination.showFrom} to {openPaymentsPagination.showTo} of {openPaymentsPagination.total} results
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
                      placeholder={locale === 'sl' ? 'Iskanje po št. predplačila, stranki, ID seje ali opombah ...' : 'Search by advance no., client, session id, or notes...'}
                      value={unusedAdvancesSearch}
                      onChange={(e) => setUnusedAdvancesSearch(e.target.value)}
                    />
                  </div>
                  <button type="button" className="clients-modern-new-btn" onClick={openCreateAdvanceBillModal}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </svg>
                    <span>{locale === 'sl' ? 'Novo predplačilo' : 'New Advance'}</span>
                  </button>
                </div>

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

                {filteredUnusedAdvances.length === 0 ? <EmptyState title={t('billingTabUnusedAdvances')} text={billingCopy.unusedAdvancesEmpty} /> : (
                  <div className="billing-modern-table-wrap">
                    <table className="billing-modern-table">
                      <thead>
                        <tr>
                          <th>Advance No.</th>
                          <th>{billingCopy.client} / Company</th>
                          <th>Session Id</th>
                          <th>Original Amount</th>
                          <th>Remaining Balance</th>
                          <th>Issued Date</th>
                          <th>Action</th>
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
                                <button type="button" className="billing-open-row-action billing-open-row-action--primary" onClick={() => setSelectedUnusedAdvanceId(advance.advanceBillId)}>Apply</button>
                                <button type="button" className="billing-action-btn" onClick={() => setSelectedUnusedAdvanceId(advance.advanceBillId)}>Refund</button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    <div className="billing-modern-footer">
                      <span>
                        Showing {unusedAdvancesPagination.showFrom} to {unusedAdvancesPagination.showTo} of {unusedAdvancesPagination.total} results
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

            {billingTab === 'history' && (
              <div className="billing-modern-content">
                <div className="billing-modern-filter-row billing-modern-filter-row--history">
                  <div className="billing-modern-search-wrap">
                    <span className="billing-modern-search-icon" aria-hidden>⌕</span>
                    <input
                      className="clients-search-input billing-modern-search"
                      placeholder={billingCopy.historySearchPlaceholder}
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                    />
                  </div>
                  <div className="billing-date-range-picker" aria-label={billingCopy.historyFilterDateAria}>
                    <div className="billing-date-range-input-wrap">
                      <input ref={historyDateFromInputRef} type="date" value={historyDateFrom} onChange={(e) => setHistoryDateFrom(e.target.value)} />
                      <button
                        type="button"
                        className="billing-date-range-input-icon"
                        aria-label={locale === 'sl' ? 'Odpri izbirnik datuma od' : 'Open start date picker'}
                        onClick={() => openHistoryDatePicker(historyDateFromInputRef.current)}
                      >
                        <span aria-hidden>📅</span>
                      </button>
                    </div>
                    <span className="billing-date-range-separator">–</span>
                    <div className="billing-date-range-input-wrap">
                      <input ref={historyDateToInputRef} type="date" value={historyDateTo} onChange={(e) => setHistoryDateTo(e.target.value)} />
                      <button
                        type="button"
                        className="billing-date-range-input-icon"
                        aria-label={locale === 'sl' ? 'Odpri izbirnik datuma do' : 'Open end date picker'}
                        onClick={() => openHistoryDatePicker(historyDateToInputRef.current)}
                      >
                        <span aria-hidden>📅</span>
                      </button>
                    </div>
                  </div>
                </div>

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
                    <div><span className="billing-modern-stat-label">Refunds</span><strong>{folioStats.refundsCount}</strong><small>Total refunded folios</small></div>
                  </div>
                  <div className="billing-modern-stat-card">
                    <span className="billing-modern-stat-icon billing-modern-stat-icon--orange" aria-hidden>▣</span>
                    <div><span className="billing-modern-stat-label">Advances</span><strong>{folioStats.advancesCount}</strong><small>Total advances applied</small></div>
                  </div>
                  <div className="billing-modern-stat-card">
                    <span className="billing-modern-stat-icon billing-modern-stat-icon--purple" aria-hidden>€</span>
                    <div><span className="billing-modern-stat-label">Total Amount</span><strong>{currency(folioStats.totalAmount)}</strong><small>Across all folios</small></div>
                  </div>
                </div>

                {sortedHistoryBills.length === 0 ? <EmptyState title={billingCopy.historyEmptyTitle} text={billingCopy.historyEmptyText} /> : (
                  <div className="billing-modern-table-wrap">
                    <table className="billing-modern-table billing-modern-history-table">
                      <thead>
                        <tr>
                          <th>Folio No.</th>
                          <th>Order ID</th>
                          <th>Session Id</th>
                          <th>{billingCopy.client} / Company</th>
                          <th>Employee</th>
                          <th>Description</th>
                          <th>Issue Date</th>
                          <th>Amount</th>
                          <th>Payment Status</th>
                          <th>Fiscal Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyPagination.slice.map((bill) => (
                          <tr key={bill.id} className="billing-history-row" onClick={() => { void openFolioPanel(bill) }}>
                            <td className="billing-modern-link-cell">{bill.billNumber}{bill.refundReference ? <div className="billing-modern-muted">{bill.refundReference}</div> : null}</td>
                            <td>{displayInvoiceOrderId(bill)}</td>
                            <td>{formatBillingSessionIdDisplay(bill.sessionId)}</td>
                            <td>{bill.billingTarget === 'COMPANY' ? (bill.recipientCompany?.name || '—') : (bill.client ? fullName(bill.client) : '—')}</td>
                            <td>{fullName(bill.consultant)}</td>
                            <td>
                              <div className="billing-modern-main-text">{bill.items?.[0]?.transactionService?.description || normalizeBillType(bill)}</div>
                              <div className="billing-modern-muted">Invoice {bill.billNumber}</div>
                            </td>
                            <td>
                              <div className="billing-modern-main-text">{formatDateShort(bill.issueDate)}</div>
                              <div className="billing-modern-muted">{formatDate(bill.issueDate)}</div>
                            </td>
                            <td className="billing-modern-amount">{currency(bill.totalGross)}</td>
                            <td><span className={`billing-status-pill billing-status-pill--${paymentStatusClass(bill.paymentStatus)}`}>{paymentStatusLabel(bill.paymentStatus)}</span></td>
                            <td><span className={`billing-status-pill billing-status-pill--${fiscalStatusClass(bill)}`}>{fiscalStatusLabel(bill)}</span></td>
                            <td className="billing-modern-actions billing-modern-actions--history" onClick={(e) => e.stopPropagation()}>
                              <button type="button" className="billing-action-btn billing-action-btn--danger" onClick={() => refundBill(bill)} disabled={!canRefundBill(bill) || refundingBillId === bill.id}>{refundingBillId === bill.id ? 'Refunding…' : 'Refund'}</button>
                              <button type="button" className="billing-action-btn" onClick={() => sendCheckoutLink(bill)} disabled={creatingCheckoutBillId === bill.id}>{creatingCheckoutBillId === bill.id ? 'Sending…' : 'Send'}</button>
                              <button type="button" className="billing-action-btn" onClick={() => downloadFolioPdf(bill)}>PDF</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="billing-modern-footer">
                      <span>
                        Showing {historyPagination.showFrom} to {historyPagination.showTo} of {historyPagination.total} results
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
                )}
              </div>
            )}
          </Card>
      </div>

      {editorOnlyMode && !detailOpenBill && (
        <div className="modal-backdrop booking-side-panel-backdrop billing-bill-modal-backdrop" role="presentation">
          <div className="modal large-modal booking-side-panel billing-open-detail-panel billing-bill-modal billing-open-detail-panel--loading">
            <div className="billing-bill-modal-header">
              <div>
                <div className="billing-bill-modal-title-row">
                  <h2>{locale === 'sl' ? 'Uredi račun' : 'Edit invoice'}</h2>
                  <span className="billing-bill-modal-status billing-bill-modal-status--open">Open</span>
                </div>
                <p>{locale === 'sl' ? 'Nalaganje podatkov računa…' : 'Loading bill data…'}</p>
              </div>
              <button type="button" className="billing-bill-modal-close" onClick={closeDetailOpenBill} aria-label="Close">×</button>
            </div>
          </div>
        </div>
      )}

      {detailOpenBill && (() => {
        const detailItems = getOpenBillItems(detailOpenBill)
        const detailNet = estimateNet(detailItems)
        const detailTax = estimateTax(detailItems)
        const detailGross = detailNet + detailTax
        const detailSessionLabel = formatOpenBillSession(detailOpenBill.sessionInfo)
        const detailIncludedSessions = getOpenBillIncludedSessions(detailOpenBill)
        const activeExpandedSessionId = detailIncludedSessions.some((session) => session.sessionId === expandedBatchSessionId)
          ? expandedBatchSessionId
          : (detailIncludedSessions[0]?.sessionId ?? detailOpenBill.sessionId ?? null)
        const detailAdditionalLineIndices = openBillLineIndicesForMain(detailOpenBill)
        const detailDraft = getOpenBillDetailsDraft(detailOpenBill)
        const detailDraftClient = clients.find((client) => client.id === detailDraft.clientId) || null
        const detailDraftCompany = companies.find((company) => company.id === detailDraft.recipientCompanyId) || null
        const detailCompanyClients = detailDraft.recipientCompanyId == null
          ? []
          : clients.filter((client) => client.billingCompany?.id === detailDraft.recipientCompanyId)
        const detailHeaderRecipientLabel = detailDraft.billingTarget === 'COMPANY'
          ? (detailDraftCompany?.name || billingCopy.targetCompany)
          : (detailDraftClient ? fullName(detailDraftClient) : openBillClientLabel(detailOpenBill))
        const detailRootOpenBill = getOpenBillEditorRoot(detailOpenBill)
        const detailBaseRelatedOpenBills = getRelatedOpenBillsForEditor(detailRootOpenBill)
        const detailTemporaryOpenBills = getTemporaryOpenBillTabsForRoot(detailRootOpenBill)
        const detailRelatedOpenBills = getEditorOpenBillsWithTemporaryTabs(detailRootOpenBill)
        const detailOnePayeeForAll = detailTemporaryOpenBills.length === 0
          && isOnePayeeActiveForOpenBill(detailRootOpenBill, detailBaseRelatedOpenBills)
          && !hasIssuedBillForOpenBillGroup(detailRootOpenBill)
        const detailActionOpenBill = detailOnePayeeForAll ? (detailBaseRelatedOpenBills[0] ?? detailRootOpenBill) : detailOpenBill
        const detailActionItems = detailOnePayeeForAll
          ? detailBaseRelatedOpenBills.flatMap((entry) => getOpenBillItems(entry))
          : getOpenBillItems(detailActionOpenBill)
        const detailActionGross = estimateGross(detailActionItems)
        const detailPaymentSplits = getOpenBillPaymentSplits(detailActionOpenBill, detailActionGross || detailGross)
        const detailCloseCandidateBills = detailOnePayeeForAll ? detailBaseRelatedOpenBills : [detailActionOpenBill]
        const detailSessionsBillableForClose = openBillSessionsAreBillableForClose(detailCloseCandidateBills)
        const detailPaymentsMatchCloseTotal = paymentSplitsMatchInvoiceTotal(detailPaymentSplits, detailActionGross || detailGross)
        const detailCloseDisabledReason = !detailSessionsBillableForClose
          ? (locale === 'sl'
              ? 'Termin mora biti v statusu RESERVED, ONGOING, CHECKED OUT ali NO SHOW.'
              : 'Session must be in RESERVED, ONGOING, CHECKED OUT or NO SHOW status.')
          : !detailPaymentsMatchCloseTotal
            ? (locale === 'sl' ? 'Vsota plačil mora biti enaka znesku računa.' : 'Payment method amounts must match the invoice total.')
            : !detailPaymentSelectionValid
              ? (locale === 'sl' ? 'Izbrana predplačila niso veljavna.' : 'The selected advances are not valid.')
            : undefined
        const hasUnsavedOpenBillChanges = Object.prototype.hasOwnProperty.call(openBillEdits, detailOpenBill.id)
          || Object.prototype.hasOwnProperty.call(openBillDetailsEdits, detailOpenBill.id)
          || Object.prototype.hasOwnProperty.call(openBillPaymentEdits, detailOpenBill.id)
          || detailRelatedOpenBills.some((entry) => Object.prototype.hasOwnProperty.call(openBillEdits, entry.id)
            || Object.prototype.hasOwnProperty.call(openBillDetailsEdits, entry.id)
            || Object.prototype.hasOwnProperty.call(openBillPaymentEdits, entry.id))
        const detailAllBillTabs = [
          { key: 'current', label: detailHeaderRecipientLabel, type: detailDraft.billingTarget === 'COMPANY' ? 'company' : 'client' },
          ...detailCompanyClients
            .filter((client) => client.id !== detailDraft.clientId)
            .slice(0, 2)
            .map((client) => ({ key: `client-${client.id}`, label: fullName(client), type: 'client' as const })),
          ...companies
            .filter((company) => company.id !== detailDraft.recipientCompanyId)
            .slice(0, Math.max(0, 3 - (1 + detailCompanyClients.filter((client) => client.id !== detailDraft.clientId).slice(0, 2).length)))
            .map((company) => ({ key: `company-${company.id}`, label: company.name, type: 'company' as const })),
        ]
        const detailVisibleBillTabs = useOnePayeeForAllBills ? detailAllBillTabs.slice(0, 1) : detailAllBillTabs.slice(0, 3)
        const detailSummaryItems = useOnePayeeForAllBills ? detailItems.length : detailItems.length
        return (
          <div className="modal-backdrop booking-side-panel-backdrop billing-bill-modal-backdrop" onMouseDown={onDetailOpenBillBackdropMouseDown} role="presentation">
            <div className="modal large-modal booking-side-panel billing-open-detail-panel billing-bill-modal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="billing-bill-modal-header">
                <div>
                  <div className="billing-bill-modal-title-row">
                    <h2>{locale === 'sl' ? 'Uredi račun' : 'Edit Invoice'}</h2>
                    <span className="billing-bill-modal-status billing-bill-modal-status--open">Open</span>
                  </div>
                  <p>{openBillEditorSubtitle(detailOpenBill)}</p>
                </div>
                <button type="button" className="billing-bill-modal-close" onClick={closeDetailOpenBill} aria-label="Close">×</button>
              </div>

              {renderModernOpenBillEditor(detailOpenBill)}

              <div className="billing-bill-modal-footer">
                <button type="button" className="billing-bill-modal-delete" onClick={() => deleteOpenBill(detailOpenBill)} disabled={deletingOpenId === detailOpenBill.id}>
                  🗑 {deletingOpenId === detailOpenBill.id ? 'Deleting…' : 'Delete'}
                </button>
                <button
                  type="button"
                  className="billing-bill-modal-preview-btn"
                  onClick={() => previewOpenBillInvoice(detailActionOpenBill, detailOnePayeeForAll ? detailBaseRelatedOpenBills : undefined)}
                  disabled={previewingOpenBillId === detailActionOpenBill.id || detailActionItems.length === 0}
                >
                  <span className="billing-bill-modal-preview-btn__icon" aria-hidden>{renderPlainFolioPdfIcon()}</span>
                  <span>{previewingOpenBillId === detailActionOpenBill.id ? (locale === 'sl' ? 'Pripravljam…' : 'Preparing…') : (locale === 'sl' ? 'Predogled računa' : 'Invoice preview')}</span>
                </button>
                <div className="billing-bill-modal-footer-actions">
                  <button type="button" className="billing-bill-modal-save-btn" onClick={() => saveOpenBillEditorSet(detailActionOpenBill, detailOnePayeeForAll ? detailBaseRelatedOpenBills : detailRelatedOpenBills, detailOnePayeeForAll)} disabled={!hasUnsavedOpenBillChanges && !detailOnePayeeForAll}>
                    <span className="billing-bill-modal-save-btn__icon" aria-hidden>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
                        <path d="M17 21v-8H7v8" />
                        <path d="M7 3v5h8" />
                      </svg>
                    </span>
                    <span>Save changes</span>
                  </button>
                  <button
                    type="button"
                    className="billing-bill-modal-primary-action"
                    onClick={() => createBillFromOpen(detailActionOpenBill, detailOnePayeeForAll ? detailBaseRelatedOpenBills : undefined)}
                    disabled={creatingFromOpenId === detailActionOpenBill.id || detailActionItems.length === 0 || !detailPaymentsMatchCloseTotal || !detailSessionsBillableForClose || !detailPaymentSelectionValid}
                    title={detailCloseDisabledReason}
                  >
                    {creatingFromOpenId === detailActionOpenBill.id ? billingCopy.creating : (
                      <>
                        <span className="billing-bill-modal-primary-icon" aria-hidden>{renderPlainFolioPdfIcon()}</span>
                        {locale === 'sl' ? 'Zaključi račun' : 'Close invoice'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {showCreateBillModal && (() => {
        const createNet = estimateNet(billForm.items)
        const createVatRows = vatBreakdownRowsForItems(billForm.items)
        const createTax = createVatRows.reduce((sum, row) => sum + row.taxTotal, 0)
        const createSubtotalGross = createNet + createTax
        const createGross = billForm.billType === 'INVOICE' ? createBillPayableGross : createSubtotalGross
        const createRecipientLabel = billForm.billingTarget === 'COMPANY'
          ? (selectedRecipientCompany?.name || billingCopy.targetCompany)
          : (selectedClient ? fullName(selectedClient) : billingCopy.targetPerson)
        const createTargetLabel = billForm.billingTarget === 'COMPANY' ? billingCopy.targetCompany : billingCopy.targetPerson
        const createPaymentTotal = paymentSplitTotalGross(createPaymentSplits)
        const createPaymentDifference = createGross - createPaymentTotal
        const isCreateAdvanceBill = billForm.billType === 'ADVANCE'
        const createCloseTooltip = (billForm.billingTarget === 'PERSON' && !billForm.clientId)
            ? (locale === 'sl' ? 'Izberite klienta.' : 'Select a client.')
            : (billForm.billingTarget === 'COMPANY' && !billForm.recipientCompanyId)
              ? (locale === 'sl' ? 'Izberite podjetje.' : 'Select a company.')
              : billForm.items.length === 0
                ? (locale === 'sl' ? 'Dodajte vsaj eno postavko.' : 'Add at least one line item.')
                : !billItemsAllowedByType
                  ? (isCreateAdvanceBill
                    ? (locale === 'sl' ? 'Za predplačilo lahko izberete samo storitve s Predplačilo ON.' : 'Advance bills only accept services marked as Advance.')
                    : (locale === 'sl' ? 'Storitve s Predplačilo ON lahko uporabite samo na Novo predplačilo.' : 'Services marked as Advance can only be used on New advance.'))
                  : !createPaymentsMatchTotal
                    ? (locale === 'sl' ? 'Vsota plačil mora biti enaka znesku računa.' : 'Payment amounts must match the total.')
                    : !createAdvanceSelectionValid
                      ? (locale === 'sl' ? 'Izbrana predplačila niso veljavna.' : 'The selected advances are not valid.')
                      : undefined
        return (
          <div className="modal-backdrop booking-side-panel-backdrop billing-bill-modal-backdrop" onMouseDown={onCreateBillBackdropMouseDown} role="presentation">
            <div className="modal large-modal booking-side-panel billing-create-panel billing-bill-modal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="billing-bill-modal-header">
                <div>
                  <div className="billing-bill-modal-title-row">
                    <h2>{isCreateAdvanceBill ? (locale === 'sl' ? 'Novo predplačilo' : 'New advance') : (locale === 'sl' ? 'Nov odprti račun' : 'New open bill')}</h2>
                    <span className="billing-bill-modal-status billing-bill-modal-status--draft">{isCreateAdvanceBill ? billingCopy.billTypeAdvance : (locale === 'sl' ? 'Novo' : 'New')}</span>
                  </div>
                  <p>{createRecipientLabel}</p>
                </div>
                <button type="button" className="billing-bill-modal-close" onClick={closeCreateBillModal} aria-label="Close">×</button>
              </div>

              <div className="billing-invoice-modern-body billing-invoice-modern-body--create">
                <section className="billing-invoice-management-card">
                  <div className="billing-invoice-management-head">
                    <div>
                      <h3>{isCreateAdvanceBill ? (locale === 'sl' ? 'Upravljanje predplačila' : 'Advance management') : (locale === 'sl' ? 'Upravljanje računa' : 'Bill management')}</h3>
                      <p>{isCreateAdvanceBill ? (locale === 'sl' ? 'Plačnika in osnovne podatke predplačila uredite na kartici.' : 'Edit advance payee and details from the bill tab.') : (locale === 'sl' ? 'Plačnika in osnovne podatke uredite na kartici računa.' : 'Edit payee and bill details from the bill tab.')}</p>
                    </div>
                  </div>
                  <div className="billing-invoice-tabs-row billing-invoice-tabs-row--create">
                    {isCreateAdvanceBill && createAdvanceTabs.length > 1 ? (
                      createAdvanceTabs.map((tab) => {
                        const active = Number(billForm.clientId ?? 0) === tab.clientId
                        return (
                          <button
                            key={tab.clientId}
                            type="button"
                            className={`billing-invoice-bill-tab billing-invoice-bill-tab--client${active ? ' is-active' : ''}`}
                            onClick={() => {
                              setBillForm((prev) => ({
                                ...prev,
                                clientId: tab.clientId,
                                billingTarget: 'PERSON',
                                recipientCompanyId: undefined,
                              }))
                              if (active) setEditingCreateBillPayee(true)
                            }}
                          >
                            <span className="billing-invoice-tab-icon" aria-hidden>♙</span>
                            <span className="billing-invoice-tab-copy">
                              <strong>{tab.label}</strong>
                              <small>{tab.typeLabel}</small>
                            </span>
                            {active && <span className="billing-invoice-tab-edit" aria-hidden>✎</span>}
                          </button>
                        )
                      })
                    ) : (
                      <button
                        type="button"
                        className={`billing-invoice-bill-tab billing-invoice-bill-tab--${billForm.billingTarget === 'COMPANY' ? 'company' : 'client'} is-active`}
                        onClick={() => setEditingCreateBillPayee(true)}
                      >
                        <span className="billing-invoice-tab-icon" aria-hidden>{billForm.billingTarget === 'COMPANY' ? '▦' : '♙'}</span>
                        <span className="billing-invoice-tab-copy">
                          <strong>{createRecipientLabel}</strong>
                          <small>{createTargetLabel}</small>
                        </span>
                        <span className="billing-invoice-tab-edit" aria-hidden>✎</span>
                      </button>
                    )}
                  </div>
                </section>

                <section className="billing-invoice-workspace-card">
                  <div className="billing-invoice-items-panel">
                    <div className="billing-invoice-section-title-row">
                      <h3>{isCreateAdvanceBill ? (locale === 'sl' ? 'Postavke predplačila' : 'Advance items') : (locale === 'sl' ? 'Postavke računa' : 'Bill items')}</h3>
                      <span>{billForm.items.length} {billForm.items.length === 1 ? (locale === 'sl' ? 'postavka' : 'item') : (locale === 'sl' ? 'postavk' : 'items')}</span>
                    </div>
                    <div className="billing-invoice-table-head" aria-hidden>
                      <span />
                      <span>Service</span>
                      <span>Qty</span>
                      <span>Price</span>
                      <span>Amount</span>
                      <span />
                    </div>
                    <div className="billing-invoice-item-list">
                      {billForm.items.length === 0 ? (
                        <EmptyState
                          title={billingCopy.noBillLinesTitle}
                          text={billForm.billType === 'ADVANCE' && availableBillServices.length === 0 ? billingCopy.noAdvanceServicesText : billingCopy.noBillLinesText}
                        />
                      ) : billForm.items.map((item, index) => renderModernBillFormLineEditor(item, index))}
                      <button
                        type="button"
                        className="billing-invoice-add-dashed billing-invoice-add-dashed--line"
                        disabled={availableBillServices.length === 0}
                        onClick={() => {
                          const firstService = availableBillServices[0]
                          if (!firstService) return
                          setBillForm({
                            ...billForm,
                            items: [
                              ...billForm.items,
                              {
                                transactionServiceId: firstService.id,
                                quantity: 1,
                                netPrice: String(firstService.netPrice),
                                grossPrice: grossStringFromService(firstService),
                                sourceSessionBookingId: billForm.sessionId ?? undefined,
                              },
                            ],
                          })
                        }}
                      >
                        <strong>+ {billingCopy.addLine}</strong>
                        <small>{isCreateAdvanceBill ? (locale === 'sl' ? 'Dodajte storitve, ki imajo Predplačilo ON' : 'Add services marked as Advance') : (locale === 'sl' ? 'Dodajte eno ali več transakcijskih storitev' : 'Add one or more transaction services')}</small>
                      </button>
                    </div>
                  </div>

                  <div className="billing-invoice-payment-panel">
                    {renderCreateBillPaymentMethods(createGross)}
                    {!isCreateAdvanceBill && renderDiscountCard(
                      createBillDiscountDraft,
                      createSubtotalGross,
                      (type) => setBillForm((prev) => ({ ...prev, discountType: type })),
                      (value) => setBillForm((prev) => ({ ...prev, discountValue: value })),
                    )}
                    <section className="billing-invoice-totals-card">
                      <div className="billing-bill-modal-summary-line"><span>{locale === 'sl' ? 'Vmesni seštevek' : 'Subtotal'}</span><strong>{currency(createSubtotalGross)}</strong></div>
                      {createVatRows.map((row) => (
                        <div key={row.key} className="billing-bill-modal-summary-line">
                          <span>{row.label}</span>
                          <strong>{currency(row.taxTotal)}</strong>
                        </div>
                      ))}
                      {!isCreateAdvanceBill && (
                        <div className="billing-bill-modal-summary-line billing-bill-modal-summary-line--discount"><span>{locale === 'sl' ? 'Popust' : 'Discount'} <span className="billing-invoice-info-dot">i</span></span><strong>- {currency(createBillDiscountGross)}</strong></div>
                      )}
                      <div className="billing-bill-modal-summary-divider" />
                      <div className="billing-bill-modal-total-line"><span>{locale === 'sl' ? 'Skupaj' : 'Grand total'}</span><strong>{currency(createGross)}</strong></div>
                    </section>
                  </div>
                </section>

                <section className="billing-invoice-compact-summary" aria-label={locale === 'sl' ? 'Povzetek računa' : 'Bill summary'}>
                  <div><span className="billing-invoice-summary-icon billing-invoice-summary-icon--blue">▣</span><span>{isCreateAdvanceBill ? billingCopy.billTypeAdvance : (locale === 'sl' ? 'Računi' : 'Bills')}</span><strong>1 {isCreateAdvanceBill ? billingCopy.billTypeAdvance.toLowerCase() : (locale === 'sl' ? 'račun' : 'bill')}</strong></div>
                  <div><span className="billing-invoice-summary-icon billing-invoice-summary-icon--green">☷</span><span>{locale === 'sl' ? 'Postavke' : 'Line items'}</span><strong>{billForm.items.length}</strong></div>
                  <div><span className="billing-invoice-summary-icon billing-invoice-summary-icon--orange">◈</span><span>{locale === 'sl' ? 'Skupaj' : 'Total'}</span><strong>{currency(createGross)}</strong></div>
                  <div><span className="billing-invoice-summary-icon billing-invoice-summary-icon--red">▤</span><span>{locale === 'sl' ? 'Neplačano' : 'Unpaid'}</span><strong>{currency(createGross)}</strong></div>
                </section>
                {renderCreateBillPayeeDialog()}
              </div>

              <div className="billing-bill-modal-footer">
                <div className="billing-bill-modal-footer-actions">
                  {!isCreateAdvanceBill && (
                    <button
                      type="button"
                      className="billing-bill-modal-save-btn"
                      onClick={() => void createManualOpenBillFromCreateBillForm()}
                      disabled={creatingManualOpenBill || creatingBill || !billCanSubmit}
                      title={createCloseTooltip}
                    >
                      <span className="billing-bill-modal-save-btn__icon" aria-hidden>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
                          <path d="M17 21v-8H7v8" />
                          <path d="M7 3v5h8" />
                        </svg>
                      </span>
                      <span>{creatingManualOpenBill ? billingCopy.creating : billingCopy.createOpenBill}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="billing-bill-modal-primary-action"
                    onClick={() => void (isCreateAdvanceBill ? createBill() : createAndCloseManualOpenBill())}
                    disabled={creatingBill || creatingManualOpenBill || !billCanSubmit}
                    title={createCloseTooltip}
                  >
                    {creatingBill ? billingCopy.creating : (
                      <>
                        <span className="billing-bill-modal-primary-icon" aria-hidden>{renderPlainFolioPdfIcon()}</span>
                        {isCreateAdvanceBill ? (locale === 'sl' ? 'Ustvari predplačilo' : 'Create advance') : (locale === 'sl' ? 'Zaključi račun' : 'Close invoice')}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {renderAdvancePaymentModal()}

      {renderEntitlementPaymentModal()}

      {showAddCompanyModal && (
        <div className="modal-backdrop billing-add-company-modal-backdrop" onClick={closeAddCompanyModal}>
          <div className="modal billing-add-company-modal" onClick={(e) => e.stopPropagation()}>
            <div className="billing-bill-modal-header">
              <div>
                <div className="billing-bill-modal-title-row">
                  <h2>{billingCopy.newCompanyTitle}</h2>
                </div>
                <p>{billingCopy.newCompanySubtitle}</p>
              </div>
              <button type="button" className="billing-bill-modal-close" onClick={closeAddCompanyModal} aria-label={locale === 'sl' ? 'Zapri' : 'Close'}>×</button>
            </div>
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
            <div className="billing-add-company-modal-footer">
              <button
                type="button"
                className="billing-bill-modal-save-btn"
                onClick={createCompanyInline}
                disabled={creatingCompany || !newCompanyName.trim()}
              >
                <span className="billing-bill-modal-save-btn__icon" aria-hidden>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
                    <path d="M17 21v-8H7v8" />
                    <path d="M7 3v5h8" />
                  </svg>
                </span>
                <span>{creatingCompany ? billingCopy.creating : billingCopy.create}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {fiscalLogBill && (
        <div className="modal-backdrop booking-side-panel-backdrop" onClick={() => { setFiscalLogBill(null); setDetailFolioBill(null) }}>
          <div className="modal large-modal booking-side-panel" onClick={(e) => e.stopPropagation()}>
            <div className="booking-side-panel-header">
              <PageHeader
                title={detailFolioBill ? `Folio #${detailFolioBill.billNumber || detailFolioBill.id}` : 'Folio'}
                subtitle={`${detailFolioBill?.billingTarget === 'COMPANY' ? (detailFolioBill?.recipientCompany?.name || '—') : (detailFolioBill?.client ? fullName(detailFolioBill.client) : '—')} · ${formatDate(detailFolioBill?.issueDate || '')}`}
                actions={<button type="button" className="secondary booking-side-panel-close" onClick={() => { setFiscalLogBill(null); setDetailFolioBill(null) }} aria-label="Close">×</button>}
              />
            </div>
            <div className="booking-side-panel-body">
              <div className="booking-type-switcher" style={{ marginBottom: 12 }}>
                <button type="button" className={folioPanelTab === 'invoice' ? 'booking-type-btn active' : 'booking-type-btn'} onClick={() => setFolioPanelTab('invoice')}>Invoice</button>
                <button type="button" className={folioPanelTab === 'fiscal' ? 'booking-type-btn active' : 'booking-type-btn'} onClick={() => setFolioPanelTab('fiscal')}>Fiscal</button>
              </div>
              {folioPanelTab === 'invoice' ? (
                detailFolioBill ? (
                  <div className="stack gap-sm">
                    <div className="summary-box">
                      <strong>{`Folio #${detailFolioBill.billNumber || detailFolioBill.id}`}</strong>
                      <div className="muted" style={{ marginTop: 6 }}>
                        {detailFolioBill.billingTarget === 'COMPANY'
                          ? (detailFolioBill.recipientCompany?.name || '—')
                          : (detailFolioBill.client ? fullName(detailFolioBill.client) : '—')}
                      </div>
                      {detailFolioBill.refundReference ? (
                        <div className="muted" style={{ marginTop: 6 }}>{detailFolioBill.refundReference}</div>
                      ) : null}
                    </div>
                    <div className="inline-form" style={{ gridTemplateColumns: '1fr 1fr' }}>
                      <Field label="Order ID"><input readOnly value={displayInvoiceOrderId(detailFolioBill)} /></Field>
                      <Field label="Issued"><input readOnly value={formatDate(detailFolioBill.issueDate)} /></Field>
                    </div>
                    <div className="inline-form" style={{ gridTemplateColumns: '1fr 1fr' }}>
                      <Field label="Consultant"><input readOnly value={fullName(detailFolioBill.consultant)} /></Field>
                      <Field label="Session"><input readOnly value={formatBillingSessionIdDisplay(detailFolioBill.sessionId)} /></Field>
                    </div>
                    <div className="inline-form" style={{ gridTemplateColumns: '1fr 1fr' }}>
                      <Field label="Payment method"><input readOnly value={detailFolioBill.paymentMethod ? detailFolioBill.paymentMethod.name : '—'} /></Field>
                      <Field label="Payment status"><input readOnly value={detailFolioBill.paymentStatus || 'open'} /></Field>
                    </div>
                    <div className="summary-box">Total gross: <strong>{currency(detailFolioBill.totalGross)}</strong></div>
                    <div className="simple-table-wrap">
                      <table>
                        <thead><tr><th>Service</th><th>Qty</th><th>Gross</th></tr></thead>
                        <tbody>
                          {detailFolioBill.items?.map((item) => (
                            <tr key={item.id}>
                              <td>{billingServiceDisplayLabel(item.transactionService)}</td>
                              <td>{item.quantity}</td>
                              <td>{currency(item.grossPrice)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="form-actions" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
                      {canRefundBill(detailFolioBill) && (
                        <button type="button" className="danger secondary" onClick={() => refundBill(detailFolioBill)} disabled={refundingBillId === detailFolioBill.id}>
                          {refundingBillId === detailFolioBill.id ? 'Refunding…' : 'Refund'}
                        </button>
                      )}
                      <button type="button" className="primary" onClick={() => downloadFolioPdf(detailFolioBill)}>
                        Download folio PDF
                      </button>
                    </div>
                  </div>
                ) : null
              ) : loadingFiscalLog ? (
                <p className="muted">Loading fiscal log…</p>
              ) : fiscalLogRows.length === 0 ? (
                <EmptyState title="No fiscal log yet" text="Run Retry fiscal to capture transmission details." />
              ) : (
                <div className="stack gap-sm">
                  <div className="simple-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: 70 }}>Step</th>
                          <th>Status</th>
                          <th style={{ width: 190 }}>Time</th>
                          <th>Details</th>
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
                  <Field label="Request">
                    <textarea rows={8} readOnly value={fiscalLogRequestBody || 'No request captured yet.'} />
                  </Field>
                  <Field label="Response">
                    <textarea rows={8} readOnly value={fiscalLogResponseBody || 'No response captured yet.'} />
                  </Field>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
