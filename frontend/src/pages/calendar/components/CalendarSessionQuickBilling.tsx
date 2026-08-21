// @ts-nocheck
import { useEffect, useMemo, useState } from 'react'
import { api } from '../../../api'
import { PanelBody, PanelFooter } from '../../../components/panel'
import { appSessionTypeDescription } from '../../../lib/sessionTypeDisplay'

type QuickMode = 'invoice' | 'advance'

type Props = {
  mode: QuickMode
  locale: string
  session: any
  clients: any[]
  paymentStatuses: any[]
  metaTypes: any[]
  settings: Record<string, string>
  user: any
  canIssueOpenInvoice: boolean
  canIssueAdvanceInvoice: boolean
  currency?: (value: number) => string
  fullName: (person: any) => string
  showToast: (tone: string, message: string) => void
  onOpenFullInvoice: (clientId?: number | null) => void | Promise<void>
  onOpenFullAdvance: (status?: any, client?: any) => void | boolean
  createOpenBillForPaymentStatus?: (status: any, options?: { selectedOnly?: boolean; suppressToast?: boolean }) => Promise<number | null | undefined>
  onRefresh: () => void | Promise<unknown>
}

type BillingService = {
  id: number
  code?: string | null
  description?: string | null
  name?: string | null
  taxRate?: string | null
  netPrice?: number | string | null
  active?: boolean
}

type PaymentMethod = {
  id: number
  name: string
  paymentType?: string | null
  stripeEnabled?: boolean | null
}

type QuickItem = {
  transactionServiceId: number
  quantity: number
  grossPrice: number
  netPrice: number
  sourceSessionBookingId: number | null
}

type DisplayService = {
  key: string
  name: string
  durationMinutes: number
  grossPrice: number
}

function parseNumber(value: unknown) {
  const parsed = Number(String(value ?? '').replace(',', '.').trim())
  return Number.isFinite(parsed) ? parsed : 0
}

function taxMultiplier(taxRate: unknown) {
  if (taxRate === 'VAT_22') return 0.22
  if (taxRate === 'VAT_9_5') return 0.095
  return 0
}

function formatMoney(value: number, locale: string) {
  return new Intl.NumberFormat(locale === 'sl' ? 'sl-SI' : locale === 'sr' ? 'sr-RS' : 'en-GB', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)
}

function normalizeStatus(value: unknown) {
  return String(value ?? '').trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toUpperCase()
}

function formatDate(value: unknown, locale: string) {
  if (!value) return '—'
  const raw = String(value)
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`
  const date = new Date(raw)
  if (!Number.isFinite(date.getTime())) return '—'
  return date.toLocaleDateString(locale === 'sl' ? 'sl-SI' : locale === 'sr' ? 'sr-RS' : 'en-GB')
}

function paymentMethodIsAdvance(method: PaymentMethod) {
  if (String(method.paymentType || '').toUpperCase() === 'ADVANCE') return true
  const value = `${method.name || ''} ${method.paymentType || ''}`.toLowerCase()
  return value.includes('deposit') || value.includes('advance') || value.includes('predpla') || value.includes('avans') || value.includes('polog')
}

function paymentMethodIsStripe(method: PaymentMethod) {
  return method.stripeEnabled === true || String(method.paymentType || '').toUpperCase() === 'CARD'
}

function paymentMethodTone(method: PaymentMethod) {
  const value = `${method.name || ''} ${method.paymentType || ''}`.toLowerCase()
  if (value.includes('cash') || value.includes('gotovin')) return 'cash'
  if (value.includes('bank') || value.includes('trr') || value.includes('transfer') || value.includes('nakaz')) return 'bank'
  return 'card'
}

function PaymentMethodIcon({ tone }: { tone: string }) {
  if (tone === 'cash') {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 9.5h.01M17.5 14.5h.01"/></svg>
  }
  if (tone === 'bank') {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 9h18M5 9V19M9 9V19M15 9V19M19 9V19M3 19h18M2 22h20M12 3l9 4H3l9-4Z"/></svg>
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/></svg>
}

function SectionIcon({ kind }: { kind: 'issued' | 'payer' | 'services' | 'discount' | 'payment' }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (kind === 'payer') return <svg {...common}><circle cx="12" cy="8" r="3.5"/><path d="M5.5 21a6.5 6.5 0 0 1 13 0"/></svg>
  if (kind === 'services') return <svg {...common}><path d="M4 8.5h16v11H4z"/><path d="M8 8.5V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2.5M4 12h16"/></svg>
  if (kind === 'discount') return <svg {...common}><path d="M20 12 12 20 4 12V4h8l8 8Z"/><circle cx="8.5" cy="8.5" r="1"/></svg>
  if (kind === 'payment') return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/></svg>
  return <svg {...common}><path d="M7 3.75h6.9l3.85 3.85v12.65H7a1.75 1.75 0 0 1-1.75-1.75v-13A1.75 1.75 0 0 1 7 3.75Z"/><path d="M13.7 3.9V7.7h3.8M8.75 11h5.25M8.75 14.3h5.25"/></svg>
}

function statusMeta(value: unknown, locale: string) {
  const key = normalizeStatus(value)
  if (key === 'PAID') return { tone: 'paid', label: locale === 'sl' ? 'Plačano' : 'Paid' }
  if (key === 'PAYMENT_PENDING' || key === 'OPEN' || key === 'PARTIALLY_PAID') return { tone: 'pending', label: locale === 'sl' ? 'Neplačano' : 'Unpaid' }
  return { tone: 'pending', label: locale === 'sl' ? 'Neplačano' : 'Unpaid' }
}

function billPaymentMethodLabel(allocation: any) {
  const explicit = String(allocation?.paymentMethod || '').trim()
  if (explicit) return explicit
  const type = normalizeStatus(allocation?.paymentMethodType)
  if (type === 'BANK_TRANSFER') return 'Bank Transfer'
  if (type === 'CASH') return 'Cash'
  if (type === 'CARD' || type === 'STRIPE') return 'Card'
  return '—'
}

function collectIssuedRows(session: any, mode: QuickMode, clients: any[], fullName: (person: any) => string) {
  const source = mode === 'advance' ? 'ADVANCE' : 'INVOICE'
  const byId = new Map<string, any>()
  const statuses = Array.isArray(session?.paymentStatuses) ? session.paymentStatuses : []
  statuses.forEach((status: any) => {
    const client = clients.find((entry: any) => Number(entry?.id) === Number(status?.clientId))
    const payerName = client ? fullName(client) : `#${status?.clientId ?? '—'}`
    ;(Array.isArray(status?.allocations) ? status.allocations : []).forEach((allocation: any) => {
      if (normalizeStatus(allocation?.source) !== source) return
      if (normalizeStatus(allocation?.paymentStatus) === 'CANCELLED') return
      const billId = Number(allocation?.billId || 0)
      const key = billId > 0 ? String(billId) : `${source}-${allocation?.billNumber || payerName}-${byId.size}`
      const existing = byId.get(key) || {
        key,
        billId: billId || null,
        billNumber: allocation?.billNumber || (mode === 'advance' ? 'Predplačilo' : 'Račun'),
        payerNames: new Set<string>(),
        amountGross: 0,
        date: allocation?.paidAt || allocation?.issuedAt || allocation?.createdAt || null,
        paymentMethod: billPaymentMethodLabel(allocation),
        paymentStatus: allocation?.paymentStatus || status?.status || 'OPEN',
      }
      existing.payerNames.add(payerName)
      existing.amountGross += parseNumber(allocation?.amountGross)
      if (!existing.date) existing.date = allocation?.paidAt || allocation?.issuedAt || allocation?.createdAt || null
      if (existing.paymentMethod === '—') existing.paymentMethod = billPaymentMethodLabel(allocation)
      if (normalizeStatus(existing.paymentStatus) !== 'PAID' && normalizeStatus(allocation?.paymentStatus || status?.status) === 'PAID') existing.paymentStatus = 'PAID'
      byId.set(key, existing)
    })
  })
  return Array.from(byId.values())
}

export function CalendarSessionQuickBilling({
  mode,
  locale,
  session,
  clients,
  paymentStatuses,
  metaTypes,
  settings,
  user,
  canIssueOpenInvoice,
  canIssueAdvanceInvoice,
  currency,
  fullName,
  showToast,
  onOpenFullInvoice,
  onOpenFullAdvance,
  createOpenBillForPaymentStatus,
  onRefresh,
}: Props) {
  const [billingServices, setBillingServices] = useState<BillingService[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [openBills, setOpenBills] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null)
  const [paymentMethodId, setPaymentMethodId] = useState<number | null>(null)
  const [discountOpen, setDiscountOpen] = useState(false)
  const [discountType, setDiscountType] = useState<'PERCENT' | 'AMOUNT'>('PERCENT')
  const [discountValue, setDiscountValue] = useState('')
  const [localIssuedRows, setLocalIssuedRows] = useState<any[]>([])

  const availableClients = useMemo(() => {
    const source = Array.isArray(clients) ? clients.filter(Boolean) : []
    if (source.length > 0) return source
    return session?.client ? [session.client] : []
  }, [clients, session?.client])

  const availableClientKey = availableClients.map((client: any) => Number(client?.id || 0)).join(',')

  useEffect(() => {
    const firstId = Number(availableClients[0]?.id || 0)
    setSelectedClientId(firstId > 0 ? firstId : null)
    setDiscountOpen(false)
    setDiscountType('PERCENT')
    setDiscountValue('')
    setLocalIssuedRows([])
  }, [session?.id, mode, availableClientKey])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const [servicesResult, methodsResult, openBillsResult] = await Promise.all([
          api.get('/billing/services').catch(() => ({ data: [] })),
          api.get('/billing/payment-methods').catch(() => ({ data: [] })),
          mode === 'invoice' ? api.get('/billing/open-bills', { params: { size: 500 } }).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        ])
        if (cancelled) return
        setBillingServices(Array.isArray(servicesResult.data) ? servicesResult.data : [])
        const methods = Array.isArray(methodsResult.data) ? methodsResult.data : []
        setPaymentMethods(methods)
        setOpenBills(Array.isArray(openBillsResult.data) ? openBillsResult.data : [])
        const visible = methods.filter((method: PaymentMethod) => {
          if (paymentMethodIsAdvance(method)) return false
          if (settings.BILLING_ONLINE_CARD_PAYMENTS_ENABLED === 'false' && paymentMethodIsStripe(method)) return false
          return true
        })
        setPaymentMethodId((current) => current && visible.some((entry: PaymentMethod) => Number(entry.id) === Number(current)) ? current : (visible[0]?.id ?? null))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [mode, session?.id, settings.BILLING_ONLINE_CARD_PAYMENTS_ENABLED])

  const visiblePaymentMethods = useMemo(() => paymentMethods.filter((method) => {
    if (paymentMethodIsAdvance(method)) return false
    if (settings.BILLING_ONLINE_CARD_PAYMENTS_ENABLED === 'false' && paymentMethodIsStripe(method)) return false
    return true
  }), [paymentMethods, settings.BILLING_ONLINE_CARD_PAYMENTS_ENABLED])

  const selectedClient = availableClients.find((client: any) => Number(client?.id) === Number(selectedClientId)) || availableClients[0] || null
  const paymentStatusRows = Array.isArray(paymentStatuses) ? paymentStatuses : []
  const selectedStatus = paymentStatusRows.find((status: any) => Number(status?.clientId) === Number(selectedClient?.id))
    || (availableClients.length === 1 ? paymentStatusRows[0] : null)
    || null
  // In a group/multi-client session, billing actions must stay scoped to the selected payer tab.
  // Do not fall back to the parent session or another participant's payment booking.
  const sourceBookingId = Number(selectedStatus?.bookingId ?? (availableClients.length === 1 ? session?.id : 0)) || null

  const advanceServiceIds = useMemo(() => new Set(
    String(settings.ADVANCE_DEDUCTION_TRANSACTION_SERVICE_ID || '')
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((id) => Number.isInteger(id) && id > 0),
  ), [settings.ADVANCE_DEDUCTION_TRANSACTION_SERVICE_ID])

  const sessionServiceRefs = useMemo(() => {
    if (Array.isArray(session?.services) && session.services.length > 0) {
      return [...session.services].sort((a: any, b: any) => Number(a?.position ?? 0) - Number(b?.position ?? 0))
    }
    if (session?.type || session?.typeId) return [{ type: session.type, typeId: session?.type?.id ?? session?.typeId }]
    return []
  }, [session])

  const advanceServiceByTaxRate = useMemo(() => {
    const byTaxRate = new Map<string, BillingService>()
    billingServices.forEach((service) => {
      if (!advanceServiceIds.has(Number(service.id))) return
      const taxRate = String(service.taxRate || '').trim().toUpperCase()
      if (!taxRate || byTaxRate.has(taxRate)) return
      byTaxRate.set(taxRate, service)
    })
    return byTaxRate
  }, [advanceServiceIds, billingServices])

  const derived = useMemo(() => {
    const display: DisplayService[] = []
    const items: QuickItem[] = []
    sessionServiceRefs.forEach((ref: any, index: number) => {
      const typeId = Number(ref?.type?.id ?? ref?.typeId)
      const type = metaTypes.find((entry: any) => Number(entry?.id) === typeId) || ref?.type || {}
      const allLinked = (Array.isArray(type?.linkedServices) ? type.linkedServices : []).filter((link: any) => {
        const transactionServiceId = Number(link?.transactionServiceId)
        return Number.isInteger(transactionServiceId) && transactionServiceId > 0
      })

      // Normal invoices continue to use the booked service's regular mapped
      // transaction service(s). Advance invoices are different: the booked
      // service determines the VAT rate and price, while the invoice line uses
      // the single Predplačilo-enabled transaction service for that same VAT
      // rate. This keeps advances VAT-correct without requiring every booked
      // service itself to be marked as Predplačilo.
      const regularLinked = allLinked.filter((link: any) => !advanceServiceIds.has(Number(link?.transactionServiceId)))
      const sourceLinked = mode === 'advance'
        ? (regularLinked.length > 0 ? regularLinked : allLinked)
        : regularLinked
      if (sourceLinked.length === 0) return

      const sourceParts = sourceLinked.map((link: any) => {
        const serviceId = Number(link?.transactionServiceId)
        const service = billingServices.find((entry) => Number(entry.id) === serviceId)
        const gross = Math.max(0, parseNumber(link?.unitGross ?? link?.price))
        return { link, serviceId, service, gross }
      })
      if (sourceParts.some((part) => !part.service)) return

      const duration = Math.max(1, Number(ref?.durationMinutesOverride ?? ref?.durationMinutes ?? type?.durationMinutes ?? 60) || 60)
      const defaultGross = sourceParts.reduce((sum: number, part: any) => sum + part.gross, 0)
      const rawOverrideGross = Number(ref?.grossPriceOverride ?? ref?.grossPrice)
      const overrideGross = Number.isFinite(rawOverrideGross) ? Math.max(0, rawOverrideGross) : null
      const displayGross = overrideGross != null ? overrideGross : defaultGross
      const name = appSessionTypeDescription(type, String(type?.name || ref?.serviceName || (locale === 'sl' ? 'Storitev' : 'Service')).trim())

      if (mode === 'advance') {
        const advanceParts = sourceParts.map((part: any) => {
          const taxRate = String(part.service?.taxRate || '').trim().toUpperCase()
          const advanceService = taxRate ? advanceServiceByTaxRate.get(taxRate) : null
          return { ...part, taxRate, advanceService }
        })
        // Do not show the booked service unless every VAT component has a
        // matching Predplačilo service. In the normal one-service/one-VAT case
        // this means exactly the requested VAT-rate match.
        if (advanceParts.some((part: any) => !part.advanceService)) return

        display.push({ key: `${typeId || 'service'}-${index}`, name, durationMinutes: duration, grossPrice: displayGross })

        const defaultTotal = advanceParts.reduce((sum: number, part: any) => sum + part.gross, 0)
        advanceParts.forEach((part: any, partIndex: number) => {
          let gross = part.gross
          if (overrideGross != null) {
            if (advanceParts.length === 1) {
              gross = overrideGross
            } else if (defaultTotal > 0) {
              // Preserve the booked total when a legacy service contains more
              // than one VAT component by allocating its override proportionally.
              gross = overrideGross * (part.gross / defaultTotal)
            } else {
              gross = partIndex === 0 ? overrideGross : 0
            }
          }
          const taxRate = part.advanceService?.taxRate
          const net = gross / (1 + taxMultiplier(taxRate))
          items.push({
            transactionServiceId: Number(part.advanceService.id),
            quantity: 1,
            grossPrice: Number(gross.toFixed(4)),
            netPrice: Number(net.toFixed(4)),
            sourceSessionBookingId: sourceBookingId,
          })
        })
        return
      }

      display.push({ key: `${typeId || 'service'}-${index}`, name, durationMinutes: duration, grossPrice: displayGross })
      sourceParts.forEach((part: any) => {
        let gross = part.gross
        if (overrideGross != null && sourceParts.length === 1) gross = overrideGross
        const netFromLink = parseNumber(part.link?.price)
        const net = netFromLink > 0 ? netFromLink : gross / (1 + taxMultiplier(part.service?.taxRate))
        items.push({
          transactionServiceId: part.serviceId,
          quantity: 1,
          grossPrice: Number(gross.toFixed(4)),
          netPrice: Number(net.toFixed(4)),
          sourceSessionBookingId: sourceBookingId,
        })
      })
    })
    return { display, items }
  }, [advanceServiceByTaxRate, advanceServiceIds, billingServices, locale, metaTypes, mode, sessionServiceRefs, sourceBookingId])

  const activeOpenBill = useMemo(() => {
    if (mode !== 'invoice') return null
    const explicitId = Number(selectedStatus?.openBillId || 0)
    if (explicitId > 0) {
      const exact = openBills.find((bill: any) => Number(bill?.id) === explicitId)
      if (exact) return exact
    }
    if (availableClients.length > 1) return null
    const candidateIds = new Set([Number(sourceBookingId || 0), Number(session?.id || 0)].filter((id) => id > 0))
    return openBills.find((bill: any) => candidateIds.has(Number(bill?.sessionId || 0)) || (Array.isArray(bill?.items) && bill.items.some((item: any) => candidateIds.has(Number(item?.sourceSessionBookingId || 0))))) || null
  }, [availableClients.length, mode, openBills, selectedStatus?.openBillId, session?.id, sourceBookingId])

  useEffect(() => {
    if (mode !== 'invoice' || !activeOpenBill) return
    const existingMethodId = Number(activeOpenBill?.paymentMethod?.id || 0)
    if (existingMethodId > 0 && visiblePaymentMethods.some((entry) => Number(entry.id) === existingMethodId)) setPaymentMethodId(existingMethodId)
    const percent = Math.max(0, parseNumber(activeOpenBill?.wholeBillDiscountPercent))
    if (percent > 0) {
      setDiscountOpen(true)
      setDiscountType('PERCENT')
      setDiscountValue(String(percent))
    }
  }, [activeOpenBill?.id, mode, visiblePaymentMethods])

  const invoiceItems: QuickItem[] = useMemo(() => {
    if (mode !== 'invoice' || !activeOpenBill || !Array.isArray(activeOpenBill.items)) return derived.items
    const rows = activeOpenBill.items
      .filter((item: any) => item?.sourceAdvanceBillId == null && !advanceServiceIds.has(Number(item?.transactionService?.id)))
      .map((item: any) => {
        const serviceId = Number(item?.transactionService?.id || 0)
        const service = billingServices.find((entry) => Number(entry.id) === serviceId)
        const gross = Math.max(0, parseNumber(item?.grossPrice))
        const net = parseNumber(item?.netPrice) || (gross / (1 + taxMultiplier(service?.taxRate)))
        return {
          transactionServiceId: serviceId,
          quantity: Math.max(1, Number(item?.quantity || 1)),
          grossPrice: Number(gross.toFixed(4)),
          netPrice: Number(net.toFixed(4)),
          sourceSessionBookingId: Number(item?.sourceSessionBookingId ?? sourceBookingId) || sourceBookingId,
        }
      })
      .filter((item: QuickItem) => item.transactionServiceId > 0)
    return rows.length > 0 ? rows : derived.items
  }, [activeOpenBill, advanceServiceIds, billingServices, derived.items, mode, sourceBookingId])

  const quickItems = mode === 'invoice' ? invoiceItems : derived.items
  const subtotal = quickItems.reduce((sum, item) => sum + item.quantity * item.grossPrice, 0)
  const rawDiscount = Math.max(0, parseNumber(discountValue))
  const discountAmount = mode === 'invoice' && discountOpen
    ? (discountType === 'PERCENT' ? subtotal * Math.min(100, rawDiscount) / 100 : Math.min(subtotal, rawDiscount))
    : 0
  const total = Math.max(0, Number((subtotal - discountAmount).toFixed(2)))
  const wholeBillDiscountPercent = subtotal > 0 ? Number((discountAmount / subtotal * 100).toFixed(4)) : 0

  const issuedRows = useMemo(() => {
    const base = collectIssuedRows(session, mode, availableClients, fullName)
    const merged = [...localIssuedRows, ...base]
    const seen = new Set<string>()
    return merged.filter((row: any) => {
      const key = String(row?.billId || row?.billNumber || row?.key)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [availableClients, fullName, localIssuedRows, mode, session])

  const payeeDraft = (Array.isArray(session?.payees) ? session.payees : []).find((entry: any) => Number(entry?.clientId) === Number(selectedClient?.id)) || null
  const payeeLabel = (client: any) => {
    const draft = (Array.isArray(session?.payees) ? session.payees : []).find((entry: any) => Number(entry?.clientId) === Number(client?.id))
    if (draft?.payeeType === 'COMPANY') return String(draft?.companyName || draft?.recipientCompanyName || fullName(client) || `#${client?.id}`).trim()
    return fullName(client) || `#${client?.id}`
  }

  const refreshBilling = async () => {
    if (mode === 'invoice') {
      const { data } = await api.get('/billing/open-bills', { params: { size: 500 } }).catch(() => ({ data: [] }))
      setOpenBills(Array.isArray(data) ? data : [])
    }
    await onRefresh?.()
  }

  const closeInvoice = async () => {
    if (!canIssueOpenInvoice) {
      showToast('error', locale === 'sl' ? 'Nimate dovoljenja za izdajo računov.' : 'You do not have permission to issue invoices.')
      return
    }
    if (!sourceBookingId || !selectedClient || !selectedStatus?.bookingId) {
      showToast('error', locale === 'sl' ? 'Za izbranega plačnika ni mogoče določiti računa termina.' : 'The session invoice for the selected payer could not be resolved.')
      return
    }
    if (!paymentMethodId) {
      showToast('error', locale === 'sl' ? 'Izberite način plačila.' : 'Select a payment method.')
      return
    }
    if (quickItems.length === 0) {
      showToast('error', locale === 'sl' ? 'Za izbranega plačnika ni storitev za obračun.' : 'There are no services to bill for this payer.')
      return
    }
    setSaving(true)
    try {
      const openBillId = activeOpenBill?.id
        ? Number(activeOpenBill.id)
        : Number(await createOpenBillForPaymentStatus?.(selectedStatus, { selectedOnly: true, suppressToast: true }) || 0)
      if (!openBillId) throw new Error(locale === 'sl' ? 'Odprtega računa ni bilo mogoče pripraviti.' : 'Could not prepare the open invoice.')
      const payload: any = {
        paymentMethodId,
        clientId: Number(selectedClient.id),
        consultantId: Number(session?.consultant?.id ?? user?.id ?? 0) || null,
        sessionId: sourceBookingId,
        discountType: 'PERCENT',
        discountValue: wholeBillDiscountPercent,
        discountAmountGross: Number(discountAmount.toFixed(2)),
        discountedTotalGross: total,
        discountItemIndex: null,
        wholeBillDiscountPercent,
        itemDiscounts: [],
        paymentSplits: [{ paymentMethodId, amountGross: total }],
        items: quickItems.map((item) => ({ ...item, sourceAdvanceBillId: null })),
      }
      if (payeeDraft?.payeeType === 'COMPANY' && Number(payeeDraft?.companyId || 0) > 0) {
        payload.billingTarget = 'COMPANY'
        payload.recipientCompanyId = Number(payeeDraft.companyId)
      } else {
        payload.billingTarget = 'PERSON'
      }
      await api.put(`/billing/open-bills/${openBillId}`, payload)
      const { data: bill } = await api.post(`/billing/open-bills/${openBillId}/create-bill`)
      const method = visiblePaymentMethods.find((entry) => Number(entry.id) === Number(paymentMethodId))
      setLocalIssuedRows((current) => [{
        key: `local-invoice-${bill?.id || Date.now()}`,
        billId: bill?.id || null,
        billNumber: bill?.billNumber || `#${bill?.id || ''}`,
        payerNames: new Set([payeeLabel(selectedClient)]),
        amountGross: parseNumber(bill?.totalGross ?? total),
        date: bill?.folioDate || bill?.createdAt || new Date().toISOString(),
        paymentMethod: method?.name || '—',
        paymentStatus: bill?.paymentStatus || 'PAID',
      }, ...current])
      showToast('success', locale === 'sl' ? 'Račun je bil uspešno zaključen.' : 'Invoice closed successfully.')
      await refreshBilling()
    } catch (error: any) {
      showToast('error', error?.response?.data?.message || error?.response?.data?.detail || error?.message || (locale === 'sl' ? 'Računa ni bilo mogoče zaključiti.' : 'Could not close the invoice.'))
    } finally {
      setSaving(false)
    }
  }

  const closeAdvance = async () => {
    if (!canIssueAdvanceInvoice) {
      showToast('error', locale === 'sl' ? 'Nimate dovoljenja za izdajo predplačil.' : 'You do not have permission to issue advances.')
      return
    }
    if (settings.BILLING_ADVANCE_ENABLED === 'false') {
      showToast('error', locale === 'sl' ? 'Predplačila niso omogočena.' : 'Advances are disabled.')
      return
    }
    if (!sourceBookingId || !selectedClient) return
    if (!paymentMethodId) {
      showToast('error', locale === 'sl' ? 'Izberite način plačila.' : 'Select a payment method.')
      return
    }
    if (quickItems.length === 0 || quickItems.some((item) => !advanceServiceIds.has(Number(item.transactionServiceId)))) {
      showToast('error', locale === 'sl' ? 'Za izbrani termin ni storitve z omogočenim predplačilom in ujemajočo stopnjo DDV.' : 'No advance-enabled service with a matching VAT rate is available for this session.')
      return
    }
    setSaving(true)
    try {
      const paymentMethod = visiblePaymentMethods.find((entry) => Number(entry.id) === Number(paymentMethodId))
      const payload: any = {
        clientId: Number(selectedClient.id),
        consultantId: Number(session?.consultant?.id ?? user?.id ?? 0) || null,
        paymentMethodId,
        paymentSplits: [{ paymentMethodId, amountGross: subtotal }],
        billingTarget: 'PERSON',
        billType: 'ADVANCE',
        sessionId: sourceBookingId,
        discountType: 'PERCENT',
        discountValue: 0,
        discountAmountGross: 0,
        discountedTotalGross: subtotal,
        discountItemIndex: null,
        wholeBillDiscountPercent: 0,
        itemDiscounts: [],
        items: quickItems.map((item) => ({
          transactionServiceId: item.transactionServiceId,
          quantity: item.quantity,
          netPrice: item.netPrice,
          grossPrice: item.grossPrice,
          sourceSessionBookingId: item.sourceSessionBookingId,
        })),
      }
      if (payeeDraft?.payeeType === 'COMPANY' && Number(payeeDraft?.companyId || 0) > 0) {
        payload.billingTarget = 'COMPANY'
        payload.recipientCompanyId = Number(payeeDraft.companyId)
      }
      const { data: bill } = await api.post('/billing/bills', payload)
      setLocalIssuedRows((current) => [{
        key: `local-advance-${bill?.id || Date.now()}`,
        billId: bill?.id || null,
        billNumber: bill?.billNumber || `#${bill?.id || ''}`,
        payerNames: new Set([payeeLabel(selectedClient)]),
        amountGross: parseNumber(bill?.totalGross ?? subtotal),
        date: bill?.folioDate || bill?.createdAt || new Date().toISOString(),
        paymentMethod: paymentMethod?.name || '—',
        paymentStatus: bill?.paymentStatus || 'OPEN',
      }, ...current])
      showToast('success', locale === 'sl' ? 'Predplačilo je bilo uspešno ustvarjeno.' : 'Advance created successfully.')
      await refreshBilling()
    } catch (error: any) {
      showToast('error', error?.response?.data?.message || error?.response?.data?.detail || error?.message || (locale === 'sl' ? 'Predplačila ni bilo mogoče ustvariti.' : 'Could not create the advance.'))
    } finally {
      setSaving(false)
    }
  }

  const heading = (kind: 'issued' | 'payer' | 'services' | 'discount' | 'payment', text: string) => (
    <div className="calendar-quick-billing__section-title">
      <span className="calendar-quick-billing__section-icon"><SectionIcon kind={kind} /></span>
      <h3>{text}</h3>
    </div>
  )

  return (
    <>
      <PanelBody className="calendar-quick-billing" sectioned={false}>
        <section className="calendar-quick-billing__section calendar-quick-billing__issued">
          {heading('issued', mode === 'advance'
            ? (locale === 'sl' ? 'Že izdana predplačila' : 'Issued advances')
            : (locale === 'sl' ? 'Že izdani računi' : 'Issued invoices'))}
          {issuedRows.length > 0 ? (
            <div className="calendar-quick-billing__issued-table">
              <div className="calendar-quick-billing__issued-head">
                <span>{mode === 'advance' ? (locale === 'sl' ? 'Predplačilo št.' : 'Advance no.') : (locale === 'sl' ? 'Račun št.' : 'Invoice no.')}</span>
                <span>{locale === 'sl' ? 'Plačnik' : 'Payer'}</span>
                <span>{locale === 'sl' ? 'Znesek' : 'Amount'}</span>
                <span>{locale === 'sl' ? 'Datum' : 'Date'}</span>
                <span>{locale === 'sl' ? 'Način plačila' : 'Payment'}</span>
                <span>{locale === 'sl' ? 'Status' : 'Status'}</span>
              </div>
              {issuedRows.map((row: any) => {
                const meta = statusMeta(row.paymentStatus, locale)
                return (
                  <div className="calendar-quick-billing__issued-row" key={row.key}>
                    <span>{row.billNumber || `#${row.billId || '—'}`}</span>
                    <span>{Array.from(row.payerNames || []).join(', ') || '—'}</span>
                    <span>{currency ? currency(row.amountGross) : formatMoney(row.amountGross, locale)}</span>
                    <span>{formatDate(row.date, locale)}</span>
                    <span>{row.paymentMethod || '—'}</span>
                    <span><em className={`calendar-quick-billing__status calendar-quick-billing__status--${meta.tone}`}>{meta.label}</em></span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="calendar-quick-billing__empty-inline">{mode === 'advance'
              ? (locale === 'sl' ? 'Za termin še ni izdanih predplačil.' : 'No advances have been issued for this session.')
              : (locale === 'sl' ? 'Za termin še ni izdanih računov.' : 'No invoices have been issued for this session.')}</div>
          )}
        </section>

        <section className="calendar-quick-billing__section">
          {heading('payer', locale === 'sl' ? 'Plačnik' : 'Payer')}
          <div className="calendar-quick-billing__payer-tabs">
            {availableClients.map((client: any) => (
              <button
                key={client.id}
                type="button"
                className={Number(client.id) === Number(selectedClient?.id) ? 'is-active' : ''}
                onClick={() => setSelectedClientId(Number(client.id))}
              >
                {payeeLabel(client)}
              </button>
            ))}
          </div>
        </section>

        <section className="calendar-quick-billing__section">
          {heading('services', locale === 'sl' ? 'Storitve' : 'Services')}
          {derived.display.length > 0 ? (
            <div className="calendar-quick-billing__services-list">
              {derived.display.map((service) => (
                <div className="calendar-quick-billing__service-row" key={service.key}>
                  <div>
                    <strong>{service.name}</strong>
                    <span>{locale === 'sl' ? 'Trajanje' : 'Duration'}: {service.durationMinutes} min</span>
                  </div>
                  <strong>{currency ? currency(service.grossPrice) : formatMoney(service.grossPrice, locale)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="calendar-quick-billing__empty-inline">{mode === 'advance'
              ? (locale === 'sl' ? 'Za termin ni storitve z omogočenim predplačilom in ujemajočo stopnjo DDV.' : 'No advance-enabled service with a matching VAT rate is available for this session.')
              : (locale === 'sl' ? 'Za izbranega plačnika ni storitev za obračun.' : 'There are no services to bill for this payer.')}</div>
          )}
        </section>

        {mode === 'invoice' && (
          <section className="calendar-quick-billing__section">
            {heading('discount', locale === 'sl' ? 'Popust' : 'Discount')}
            {!discountOpen ? (
              <button type="button" className="calendar-quick-billing__discount-add" onClick={() => setDiscountOpen(true)}>
                <SectionIcon kind="discount" />
                {locale === 'sl' ? 'Dodaj popust' : 'Add discount'}
              </button>
            ) : (
              <div className="calendar-quick-billing__discount-editor">
                <div className="calendar-quick-billing__discount-types">
                  <button type="button" className={discountType === 'PERCENT' ? 'is-active' : ''} onClick={() => setDiscountType('PERCENT')}>%</button>
                  <button type="button" className={discountType === 'AMOUNT' ? 'is-active' : ''} onClick={() => setDiscountType('AMOUNT')}>€</button>
                </div>
                <input
                  type="number"
                  min="0"
                  max={discountType === 'PERCENT' ? 100 : undefined}
                  step="0.01"
                  value={discountValue}
                  onChange={(event) => setDiscountValue(event.target.value)}
                  placeholder="0"
                />
                <button type="button" className="calendar-quick-billing__discount-remove" onClick={() => { setDiscountOpen(false); setDiscountValue('') }} aria-label={locale === 'sl' ? 'Odstrani popust' : 'Remove discount'}>×</button>
              </div>
            )}
          </section>
        )}

        <section className="calendar-quick-billing__section">
          {heading('payment', locale === 'sl' ? 'Načini plačila' : 'Payment methods')}
          <div className="calendar-quick-billing__payment-methods">
            {visiblePaymentMethods.map((method) => {
              const tone = paymentMethodTone(method)
              const selected = Number(paymentMethodId) === Number(method.id)
              return (
                <button
                  type="button"
                  key={method.id}
                  className={`${selected ? 'is-active ' : ''}calendar-quick-billing__payment-method calendar-quick-billing__payment-method--${tone}`}
                  onClick={() => setPaymentMethodId(Number(method.id))}
                >
                  <span><PaymentMethodIcon tone={tone} /></span>
                  <strong>{method.name}</strong>
                </button>
              )
            })}
          </div>
        </section>

        <div className="calendar-quick-billing__total">
          <strong>{locale === 'sl' ? 'Skupaj' : 'Total'}</strong>
          <strong>{currency ? currency(mode === 'invoice' ? total : subtotal) : formatMoney(mode === 'invoice' ? total : subtotal, locale)}</strong>
        </div>
      </PanelBody>

      <PanelFooter>
        <button
          type="button"
          className="calendar-quick-billing__edit-button"
          onClick={() => {
            if (mode === 'advance') onOpenFullAdvance(selectedStatus, selectedClient)
            else void onOpenFullInvoice(Number(selectedClient?.id || 0) || null)
          }}
        >
          {mode === 'advance'
            ? (locale === 'sl' ? 'Uredi predplačilo' : 'Edit advance')
            : (locale === 'sl' ? 'Uredi račun' : 'Edit invoice')}
        </button>
        <button
          type="button"
          className="calendar-quick-billing__close-button"
          disabled={loading || saving || !paymentMethodId || derived.display.length === 0}
          onClick={() => void (mode === 'advance' ? closeAdvance() : closeInvoice())}
        >
          <span aria-hidden>✓</span>
          {saving
            ? (locale === 'sl' ? 'Zaključujem …' : 'Closing …')
            : mode === 'advance'
              ? (locale === 'sl' ? 'Zaključi predplačilo' : 'Close advance')
              : (locale === 'sl' ? 'Zaključi račun' : 'Close invoice')}
        </button>
      </PanelFooter>
    </>
  )
}
