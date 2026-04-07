import type { Bill, PaymentMethod } from '../../lib/types'

export type BillForm = {
  clientId?: number
  consultantId?: number
  paymentMethodId?: number
  billingTarget: 'PERSON' | 'COMPANY'
  recipientCompanyId?: number
  items: { transactionServiceId: number; quantity: number; netPrice: string }[]
}

export type OpenBillEditItem = {
  transactionServiceId: number
  quantity: number
  netPrice: string
  sourceSessionBookingId?: number | null
}

/** Lines that share service + net unit price + session are combined; quantities add (same gross per unit). */
export function openBillLineMergeKey(item: {
  transactionServiceId: number
  netPrice: string
  sourceSessionBookingId?: number | null
}) {
  const sid = item.sourceSessionBookingId == null ? '' : String(item.sourceSessionBookingId)
  const net = Number(item.netPrice || 0)
  const netKey = Number.isFinite(net) ? net.toFixed(4) : '0'
  return `${item.transactionServiceId}|${netKey}|${sid}`
}

export function mergeDuplicateOpenBillLines(items: OpenBillEditItem[]): OpenBillEditItem[] {
  if (items.length < 2) return items
  const byKey = new Map<string, OpenBillEditItem>()
  const order: string[] = []
  for (const item of items) {
    const key = openBillLineMergeKey(item)
    const cur = byKey.get(key)
    if (!cur) {
      byKey.set(key, {
        transactionServiceId: item.transactionServiceId,
        quantity: item.quantity,
        netPrice: String(item.netPrice),
        sourceSessionBookingId: item.sourceSessionBookingId ?? null,
      })
      order.push(key)
    } else {
      cur.quantity = cur.quantity + item.quantity
    }
  }
  return order.map((k) => byKey.get(k)!)
}

export const paymentTypeLabel = (value?: string | null) => value === 'BANK_TRANSFER' ? 'BANK TRANSFER' : (value || '—')
export const paymentTypeIcon = (value?: string | null) =>
  value === 'CASH' ? '💵' : value === 'CARD' ? '💳' : value === 'BANK_TRANSFER' ? '🏦' : '•'
export const paymentTypeBadgeLabel = (value?: string | null) =>
  value === 'BANK_TRANSFER' ? 'Transfer' : value === 'CASH' ? 'Cash' : value === 'CARD' ? 'Card' : '—'

export type OpenBillsSortField = 'gross' | 'client' | 'date'
export type HistorySortField = 'gross' | 'folio'
export type SortDir = 'asc' | 'desc'

export const OPEN_BILLS_SORT_OPTIONS: Array<{ field: OpenBillsSortField; label: string }> = [
  { field: 'gross', label: 'Gross' },
  { field: 'date', label: 'Date' },
  { field: 'client', label: 'Client' },
]

export const HISTORY_SORT_OPTIONS: Array<{ field: HistorySortField; label: string }> = [
  { field: 'gross', label: 'Gross' },
  { field: 'folio', label: 'Folio no.' },
]

export function folioHistoryMobileStatusPill(bill: Bill): { label: string; variant: 'paid' | 'payment-pending' | 'fiscal-failed' } | null {
  if (bill.fiscalStatus === 'FAILED') return { label: 'FISCAL FAILED', variant: 'fiscal-failed' }
  if (bill.paymentStatus === 'payment_pending') return { label: 'PAYMENT PENDING', variant: 'payment-pending' }
  if (bill.paymentStatus === 'paid') return { label: 'PAID', variant: 'paid' }
  return null
}

export function getPayTypePopupPlacement(trigger: HTMLElement, optionCount: number): 'up' | 'down' {
  const popupHeight = Math.min(260, Math.max(120, optionCount * 32 + 20))
  const spaceBelow = window.innerHeight - trigger.getBoundingClientRect().bottom
  const spaceAbove = trigger.getBoundingClientRect().top
  return spaceBelow < popupHeight && spaceAbove > spaceBelow ? 'up' : 'down'
}

export type BillingPageCopy = {
  newCompanyTitle: string
  newCompanySubtitle: string
  companyName: string
  email: string
  telephone: string
  emailOptional: string
  telephoneOptional: string
  creating: string
  create: string
}

export function getBillingCopy(locale: string): BillingPageCopy {
  if (locale === 'sl') {
    return {
      newCompanyTitle: 'Novo podjetje',
      newCompanySubtitle: 'Obvezno je samo ime podjetja.',
      companyName: 'Ime podjetja',
      email: 'E-pošta',
      telephone: 'Telefon',
      emailOptional: 'E-pošta (neobvezno)',
      telephoneOptional: 'Telefon (neobvezno)',
      creating: 'Ustvarjam…',
      create: 'Ustvari',
    }
  }
  return {
    newCompanyTitle: 'New company',
    newCompanySubtitle: 'Required: company name.',
    companyName: 'Company name',
    email: 'Email',
    telephone: 'Telephone',
    emailOptional: 'Email (optional)',
    telephoneOptional: 'Telephone (optional)',
    creating: 'Creating…',
    create: 'Create',
  }
}

export function isPaymentMethodSelected(current: PaymentMethod | null | undefined, nextId: number) {
  return current?.id === nextId
}
