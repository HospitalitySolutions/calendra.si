import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { getStoredUser } from '../auth'
import type { Bill, BillingService, Client, Company, OpenBill, PaymentMethod, User } from '../lib/types'
import { normalizePaymentMethod } from '../lib/types'
import { Card, EmptyState, Field, PageHeader, SectionTitle } from '../components/ui'
import { useToast } from '../components/Toast'
import { useLocale } from '../locale'
import { currency, formatDate, fullName } from '../lib/format'
type BillForm = {
  clientId?: number
  consultantId?: number
  paymentMethodId?: number
  billingTarget: 'PERSON' | 'COMPANY'
  recipientCompanyId?: number
  items: { transactionServiceId: number; quantity: number; netPrice: string }[]
}

type OpenBillEditItem = {
  transactionServiceId: number
  quantity: number
  netPrice: string
  sourceSessionBookingId?: number | null
}


/** Lines that share service + net unit price + session are combined; quantities add (same gross per unit). */
function openBillLineMergeKey(item: {
  transactionServiceId: number
  netPrice: string
  sourceSessionBookingId?: number | null
}) {
  const sid = item.sourceSessionBookingId == null ? '' : String(item.sourceSessionBookingId)
  const net = Number(item.netPrice || 0)
  const netKey = Number.isFinite(net) ? net.toFixed(4) : '0'
  return `${item.transactionServiceId}|${netKey}|${sid}`
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

const paymentTypeLabel = (value?: string | null) => value === 'BANK_TRANSFER' ? 'BANK TRANSFER' : (value || '—')
const paymentTypeIcon = (value?: string | null) =>
  value === 'CASH' ? '💵' : value === 'CARD' ? '💳' : value === 'BANK_TRANSFER' ? '🏦' : '•'
const paymentTypeBadgeLabel = (value?: string | null) =>
  value === 'BANK_TRANSFER' ? 'Transfer' : value === 'CASH' ? 'Cash' : value === 'CARD' ? 'Card' : '—'
type OpenBillsSortField = 'gross' | 'client' | 'date'
type HistorySortField = 'gross' | 'folio'
type SortDir = 'asc' | 'desc'
const OPEN_BILLS_SORT_OPTIONS: Array<{ field: OpenBillsSortField; label: string }> = [
  { field: 'gross', label: 'Gross' },
  { field: 'date', label: 'Date' },
  { field: 'client', label: 'Client' },
]
const HISTORY_SORT_OPTIONS: Array<{ field: HistorySortField; label: string }> = [
  { field: 'gross', label: 'Gross' },
  { field: 'folio', label: 'Folio no.' },
]

export function BillingPage() {
  const me = getStoredUser()!
  const { showToast } = useToast()
  const { t } = useLocale()
  const [services, setServices] = useState<BillingService[]>([])
  const [bills, setBills] = useState<Bill[]>([])
  const [openBills, setOpenBills] = useState<OpenBill[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [billForm, setBillForm] = useState<BillForm>({ items: [], billingTarget: 'PERSON' })
  const [showCreateBillModal, setShowCreateBillModal] = useState(false)
  const [creatingBill, setCreatingBill] = useState(false)
  const [creatingFromOpenId, setCreatingFromOpenId] = useState<number | null>(null)
  const [deletingOpenId, setDeletingOpenId] = useState<number | null>(null)
  const [detailOpenBill, setDetailOpenBill] = useState<OpenBill | null>(null)
  const [openBillEdits, setOpenBillEdits] = useState<Record<number, OpenBillEditItem[]>>({})
  const [openBillsSearch, setOpenBillsSearch] = useState('')
  const [historySearch, setHistorySearch] = useState('')
  const [historyIssuedDate, setHistoryIssuedDate] = useState('')
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'paid' | 'payment_pending' | 'open' | 'cancelled'>('all')
  const [billingTab, setBillingTab] = useState<'open' | 'history'>('open')
  const [newCompanyName, setNewCompanyName] = useState('')
  const [newCompanyEmail, setNewCompanyEmail] = useState('')
  const [newCompanyTelephone, setNewCompanyTelephone] = useState('')
  const [creatingCompany, setCreatingCompany] = useState(false)
  const [showAddCompanyModal, setShowAddCompanyModal] = useState(false)
  const [recipientCompanySearch, setRecipientCompanySearch] = useState('')
  const [recipientCompanyPickerOpen, setRecipientCompanyPickerOpen] = useState(false)
  const [editingRecipientCompanySearch, setEditingRecipientCompanySearch] = useState(false)
  const [retryingFiscalBillId, setRetryingFiscalBillId] = useState<number | null>(null)
  const [creatingCheckoutBillId, setCreatingCheckoutBillId] = useState<number | null>(null)
  const [importingBankStatement, setImportingBankStatement] = useState(false)
  const [markingPaidBillId, setMarkingPaidBillId] = useState<number | null>(null)
  const bankStatementInputRef = useRef<HTMLInputElement | null>(null)
  const [detailFolioBill, setDetailFolioBill] = useState<Bill | null>(null)
  const [folioPanelTab, setFolioPanelTab] = useState<'invoice' | 'fiscal'>('invoice')
  const [fiscalLogBill, setFiscalLogBill] = useState<Bill | null>(null)
  const [fiscalLogRows, setFiscalLogRows] = useState<Array<{ at?: string; title?: string; status?: string; detail?: string }>>([])
  const [fiscalLogRequestBody, setFiscalLogRequestBody] = useState('')
  const [fiscalLogResponseBody, setFiscalLogResponseBody] = useState('')
  const [loadingFiscalLog, setLoadingFiscalLog] = useState(false)
  const [openPayTypePickerFor, setOpenPayTypePickerFor] = useState<number | null>(null)
  const [openPayTypePickerPlacement, setOpenPayTypePickerPlacement] = useState<'up' | 'down'>('down')
  const [openBillsSortField, setOpenBillsSortField] = useState<OpenBillsSortField>('gross')
  const [openBillsSortDir, setOpenBillsSortDir] = useState<SortDir>('desc')
  const [openBillsSortMenuOpen, setOpenBillsSortMenuOpen] = useState(false)
  const [historySortField, setHistorySortField] = useState<HistorySortField>('gross')
  const [historySortDir, setHistorySortDir] = useState<SortDir>('desc')
  const [historySortMenuOpen, setHistorySortMenuOpen] = useState(false)
  const [splittingSessionKey, setSplittingSessionKey] = useState<string | null>(null)
  const [expandedBatchSessionId, setExpandedBatchSessionId] = useState<number | null>(null)
  const [creatingManualOpenBill, setCreatingManualOpenBill] = useState(false)
  const [isOpenBillsMobile, setIsOpenBillsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 450px)').matches : false,
  )

  const load = async () => {
    const [servicesRes, billsRes, openBillsRes, clientsRes, companiesRes, usersRes, paymentMethodsRes] = await Promise.all([
      api.get('/billing/services'),
      api.get('/billing/bills'),
      api.get('/billing/open-bills'),
      api.get('/clients'),
      api.get('/companies'),
      me.role === 'ADMIN' ? api.get('/users') : Promise.resolve({ data: [] }),
      api.get('/billing/payment-methods').catch(() => ({ data: [] })),
    ])
    setServices(servicesRes.data)
    setBills((billsRes.data || []).map((b: Bill) => ({ ...b, paymentMethod: normalizePaymentMethod(b.paymentMethod) })))
    setOpenBills((openBillsRes.data || []).map((ob: OpenBill) => ({ ...ob, paymentMethod: normalizePaymentMethod(ob.paymentMethod) })))
    setClients(clientsRes.data)
    setCompanies(companiesRes.data || [])
    setUsers(usersRes.data)
    setPaymentMethods((paymentMethodsRes.data || []).map((p: PaymentMethod) => normalizePaymentMethod(p)!))
    return {
      openBills: (openBillsRes.data || []) as OpenBill[],
    }
  }
  useEffect(() => { load() }, [])
  useEffect(() => {
    const interval = window.setInterval(() => { void load() }, 30000)
    return () => window.clearInterval(interval)
  }, [])
  useEffect(() => {
    setExpandedBatchSessionId(null)
  }, [detailOpenBill?.id])

  const normalizeOpenBill = (ob: OpenBill): OpenBill => ({ ...ob, paymentMethod: normalizePaymentMethod(ob.paymentMethod) })

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

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 450px)')
    const apply = () => setIsOpenBillsMobile(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    if (openPayTypePickerFor == null && !openBillsSortMenuOpen && !historySortMenuOpen) return
    const onDocPointerDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest('.billing-open-paytype-wrap')) return
      if (el?.closest('.billing-open-mobile-sort-wrap')) return
      setOpenPayTypePickerFor(null)
      setOpenBillsSortMenuOpen(false)
      setHistorySortMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocPointerDown)
    return () => document.removeEventListener('mousedown', onDocPointerDown)
  }, [openPayTypePickerFor, openBillsSortMenuOpen, historySortMenuOpen])

  const grossPreview = useMemo(() => billForm.items.reduce((sum, item) => {
    const service = services.find((s) => s.id === item.transactionServiceId)
    if (!service) return sum
    const net = Number(item.netPrice || 0)
    const multiplier = service.taxRate === 'VAT_22' ? 0.22 : service.taxRate === 'VAT_9_5' ? 0.095 : 0
    return sum + net * item.quantity * (1 + multiplier)
  }, 0), [billForm.items, services])

  const filteredOpenBills = useMemo(() => {
    const q = openBillsSearch.trim().toLowerCase()
    if (!q) return openBills
    return openBills.filter((ob) => {
      const sessionId = String(ob.sessionDisplayId || ob.sessionId || '').toLowerCase()
      const client = openBillClientLabel(ob).toLowerCase()
      const consultant = openBillConsultantLabel(ob).toLowerCase()
      const session = String(ob.sessionInfo || '').toLowerCase()
      const method = String(ob.paymentMethod?.name || '').toLowerCase()
      return sessionId.includes(q) || client.includes(q) || consultant.includes(q) || session.includes(q) || method.includes(q)
    })
  }, [openBills, openBillsSearch])

  const filteredHistoryBills = useMemo(() => {
    const q = historySearch.trim().toLowerCase()
    const byDate = historyIssuedDate
      ? bills.filter((bill) => String(bill.issueDate || '').slice(0, 10) === historyIssuedDate)
      : bills
    const byStatus = historyStatusFilter === 'all'
      ? byDate
      : byDate.filter((bill) => (bill.paymentStatus || 'open') === historyStatusFilter)
    if (!q) return byStatus
    return byStatus.filter((bill) => {
      const billNo = String(bill.billNumber || '').toLowerCase()
      const sessionId = String(bill.sessionId ?? '').toLowerCase()
      const client = bill.client ? fullName(bill.client).toLowerCase() : ''
      const recipientCompany = String(bill.recipientCompany?.name || '').toLowerCase()
      const consultant = fullName(bill.consultant).toLowerCase()
      const method = String(bill.paymentMethod?.name || '').toLowerCase()
      return billNo.includes(q) || sessionId.includes(q) || client.includes(q) || recipientCompany.includes(q) || consultant.includes(q) || method.includes(q)
    })
  }, [bills, historySearch, historyIssuedDate, historyStatusFilter])

  const sortedHistoryBills = useMemo(() => {
    const list = [...filteredHistoryBills]
    const factor = historySortDir === 'asc' ? 1 : -1
    list.sort((a, b) => {
      if (historySortField === 'gross') return (Number(a.totalGross || 0) - Number(b.totalGross || 0)) * factor
      const folioA = Number.parseInt(String(a.billNumber || a.id || 0).replace(/[^\d]/g, ''), 10)
      const folioB = Number.parseInt(String(b.billNumber || b.id || 0).replace(/[^\d]/g, ''), 10)
      const safeA = Number.isFinite(folioA) ? folioA : 0
      const safeB = Number.isFinite(folioB) ? folioB : 0
      return (safeA - safeB) * factor
    })
    return list
  }, [filteredHistoryBills, historySortField, historySortDir])

  function getOpenBillItems(ob: OpenBill) {
    const raw =
      openBillEdits[ob.id]
      ?? ob.items.map((i) => ({
        transactionServiceId: i.transactionService.id,
        quantity: i.quantity,
        netPrice: String(i.netPrice),
        sourceSessionBookingId: i.sourceSessionBookingId ?? null,
      }))
    return mergeDuplicateOpenBillLines(raw)
  }

  function estimateGross(items: { transactionServiceId: number; quantity: number; netPrice: string }[]) {
    return items.reduce((sum, item) => {
      const svc = services.find((s) => s.id === item.transactionServiceId)
      if (!svc) return sum
      const mult = svc.taxRate === 'VAT_22' ? 0.22 : svc.taxRate === 'VAT_9_5' ? 0.095 : 0
      return sum + Number(item.netPrice || 0) * item.quantity * (1 + mult)
    }, 0)
  }

  const sortedOpenBills = useMemo(() => {
    const list = [...filteredOpenBills]
    const factor = openBillsSortDir === 'asc' ? 1 : -1
    list.sort((a, b) => {
      if (openBillsSortField === 'gross') {
        const grossA = estimateGross(getOpenBillItems(a))
        const grossB = estimateGross(getOpenBillItems(b))
        return (grossA - grossB) * factor
      }
      if (openBillsSortField === 'client') {
        const lastA = String(a.client?.lastName || '').toLowerCase()
        const lastB = String(b.client?.lastName || '').toLowerCase()
        if (lastA !== lastB) return lastA.localeCompare(lastB) * factor
        const firstA = String(a.client?.firstName || '').toLowerCase()
        const firstB = String(b.client?.firstName || '').toLowerCase()
        return firstA.localeCompare(firstB) * factor
      }
      const tsA = Date.parse(String(a.sessionInfo || ''))
      const tsB = Date.parse(String(b.sessionInfo || ''))
      const safeA = Number.isFinite(tsA) ? tsA : 0
      const safeB = Number.isFinite(tsB) ? tsB : 0
      return (safeA - safeB) * factor
    })
    return list
  }, [filteredOpenBills, openBillsSortField, openBillsSortDir, openBillEdits, services])

  const openBillsSummaryGross = useMemo(
    () => sortedOpenBills.reduce((sum, ob) => sum + estimateGross(getOpenBillItems(ob)), 0),
    [sortedOpenBills, openBillEdits, services],
  )

  const openBillsSortLabel = `${openBillsSortField === 'gross' ? 'Gross' : openBillsSortField === 'date' ? 'Date' : 'Client'} ${openBillsSortDir === 'asc' ? '↑' : '↓'}`

  const historyCollectedTotal = useMemo(
    () => sortedHistoryBills.reduce((sum, bill) => sum + Number(bill.totalGross || 0), 0),
    [sortedHistoryBills],
  )

  const notifyBillCreationResult = (data: any, pendingLabel = 'Bill created') => {
    if (data?.paymentMethod?.paymentType === 'BANK_TRANSFER') {
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
      const { data } = await api.post('/billing/bills', { ...billForm, items: billForm.items.map((item) => ({ ...item, netPrice: Number(item.netPrice) })) })

      // Show instantly in the list.
      if (data?.id) setBills((prev) => [{ ...data, paymentMethod: normalizePaymentMethod(data.paymentMethod) }, ...prev])

      const billId = data?.id
      if (billId && data?.paymentStatus === 'paid') {
        const res = await api.get(`/billing/bills/${billId}/folio-pdf`, { responseType: 'blob' })
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
      setBillForm({ items: [], billingTarget: 'PERSON' })
      setShowCreateBillModal(false)
      if (data?.id && (data?.paymentMethod?.paymentType === 'BANK_TRANSFER' || data?.paymentMethod?.stripeEnabled)) {
        await api.post(`/billing/bills/${data.id}/checkout-session`)
      }
      notifyBillCreationResult(data)
      await load()
    } finally {
      setCreatingBill(false)
    }
  }

  const openCreateBillModal = () => {
    setBillForm({ items: [], paymentMethodId: paymentMethods[0]?.id, billingTarget: 'PERSON' })
    setShowCreateBillModal(true)
  }

  const closeCreateBillModal = () => {
    setShowCreateBillModal(false)
    setBillForm({ items: [], billingTarget: 'PERSON' })
    setRecipientCompanySearch('')
    setRecipientCompanyPickerOpen(false)
    setEditingRecipientCompanySearch(false)
  }

  const selectedClient = useMemo(() => clients.find((client) => client.id === billForm.clientId), [clients, billForm.clientId])
  const selectedClientCompany = selectedClient?.billingCompany
  const selectedRecipientCompany = useMemo(
    () => companies.find((company) => company.id === billForm.recipientCompanyId),
    [companies, billForm.recipientCompanyId],
  )
  const visibleRecipientCompanies = useMemo(() => {
    const q = recipientCompanySearch.trim().toLowerCase()
    if (!q) return companies
    return companies.filter((company) =>
      company.name.toLowerCase().includes(q)
      || (company.email || '').toLowerCase().includes(q)
      || (company.telephone || '').toLowerCase().includes(q),
    )
  }, [companies, recipientCompanySearch])
  const billCanSubmit = billForm.consultantId && billForm.paymentMethodId && billForm.items.length > 0
    && (billForm.billingTarget === 'PERSON' ? Boolean(billForm.clientId) : Boolean(billForm.recipientCompanyId))

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
      setBillForm((prev) => ({ ...prev, recipientCompanyId: data.id }))
      setNewCompanyName('')
      setNewCompanyEmail('')
      setNewCompanyTelephone('')
      setRecipientCompanyPickerOpen(false)
      setEditingRecipientCompanySearch(false)
      setShowAddCompanyModal(false)
    } finally {
      setCreatingCompany(false)
    }
  }

  const downloadFolioPdf = async (bill: Bill) => {
    const res = await api.get(`/billing/bills/${bill.id}/folio-pdf`, { responseType: 'blob' })
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

  const setOpenBillItems = (ob: OpenBill, items: OpenBillEditItem[]) => {
    setOpenBillEdits((prev) => ({ ...prev, [ob.id]: mergeDuplicateOpenBillLines(items) }))
  }

  const saveOpenBill = async (ob: OpenBill) => {
    const items = getOpenBillItems(ob)
    await api.put(`/billing/open-bills/${ob.id}`, {
      paymentMethodId: ob.paymentMethod?.id,
      items: items.map((i) => ({
        transactionServiceId: i.transactionServiceId,
        quantity: i.quantity,
        netPrice: Number(i.netPrice),
        sourceSessionBookingId: i.sourceSessionBookingId ?? null,
      })),
    })

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
        sourceSessionBookingId: row.sourceSessionBookingId ?? null,
      }
    })
    setOpenBills((prev) => prev.map((entry) => (entry.id === ob.id ? { ...entry, items: mergedItems } : entry)))
    setDetailOpenBill((prev) => (prev?.id === ob.id ? { ...prev, items: mergedItems } : prev))

    setOpenBillEdits((prev) => { const n = { ...prev }; delete n[ob.id]; return n })
    const snapshot = await load()
    const updated = snapshot.openBills.find((entry) => entry.id === ob.id) || null
    setDetailOpenBill(updated)
  }

  const deleteOpenBill = async (ob: OpenBill) => {
    if (deletingOpenId) return
    if (!window.confirm('Delete this open bill? This cannot be undone.')) return
    setDeletingOpenId(ob.id)
    try {
      await api.delete(`/billing/open-bills/${ob.id}`)
      setOpenBills((prev) => prev.filter((x) => x.id !== ob.id))
      setOpenBillEdits((prev) => { const n = { ...prev }; delete n[ob.id]; return n })
      setDetailOpenBill((prev) => (prev?.id === ob.id ? null : prev))
    } finally {
      setDeletingOpenId(null)
    }
  }

  const createBillFromOpen = async (ob: OpenBill) => {
    if (creatingFromOpenId) return
    setCreatingFromOpenId(ob.id)
    try {
      const items = getOpenBillItems(ob)
      await api.put(`/billing/open-bills/${ob.id}`, {
        paymentMethodId: ob.paymentMethod?.id,
        items: items.map((i) => ({
          transactionServiceId: i.transactionServiceId,
          quantity: i.quantity,
          netPrice: Number(i.netPrice),
          sourceSessionBookingId: i.sourceSessionBookingId ?? null,
        })),
      })
      const { data } = await api.post(`/billing/open-bills/${ob.id}/create-bill`)
      if (data?.id) setBills((prev) => [{ ...data, paymentMethod: normalizePaymentMethod(data.paymentMethod) }, ...prev])
      setOpenBills((prev) => prev.filter((x) => x.id !== ob.id))
      setOpenBillEdits((prev) => { const n = { ...prev }; delete n[ob.id]; return n })
      setDetailOpenBill((prev) => (prev?.id === ob.id ? null : prev))
      if (data?.id && data?.paymentStatus === 'paid') {
        const res = await api.get(`/billing/bills/${data.id}/folio-pdf`, { responseType: 'blob' })
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
      if (data?.id && (data?.paymentMethod?.paymentType === 'BANK_TRANSFER' || data?.paymentMethod?.stripeEnabled)) {
        await api.post(`/billing/bills/${data.id}/checkout-session`)
      }
      notifyBillCreationResult(data, 'Bill created')
      await load()
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
      setDetailOpenBill(normalized.find((entry: OpenBill) => entry.id === ob.id) || null)
    } finally {
      setSplittingSessionKey(null)
    }
  }

  const createManualOpenBillFromCreateBillForm = async () => {
    if (creatingManualOpenBill) return
    const payload = billForm.billingTarget === 'COMPANY'
      ? { recipientCompanyId: billForm.recipientCompanyId }
      : { clientId: billForm.clientId }
    if (billForm.billingTarget === 'COMPANY' && !payload.recipientCompanyId) {
      showToast('error', 'Select recipient company first.')
      return
    }
    if (billForm.billingTarget !== 'COMPANY' && !payload.clientId) {
      showToast('error', 'Select client first.')
      return
    }
    setCreatingManualOpenBill(true)
    try {
      await api.post('/billing/open-bills/manual', payload)
      const snapshot = await load()
      const refreshed = snapshot.openBills.map((entry) => normalizeOpenBill(entry))
      setOpenBills(refreshed)
      setBillingTab('open')
      setShowCreateBillModal(false)
      showToast('success', 'Open bill created.')
    } finally {
      setCreatingManualOpenBill(false)
    }
  }

  const updateOpenBillPaymentMethod = (openBillId: number, methodId: number) => {
    const selected = paymentMethods.find((p) => p.id === methodId) || null
    setOpenBills((prev) => prev.map((entry) => entry.id === openBillId ? { ...entry, paymentMethod: selected } : entry))
    setDetailOpenBill((prev) => prev?.id === openBillId ? { ...prev, paymentMethod: selected } : prev)
  }

  const taxMultiplierByServiceId = (serviceId: number) => {
    const tax = services.find((s) => s.id === serviceId)?.taxRate
    if (tax === 'VAT_22') return 0.22
    if (tax === 'VAT_9_5') return 0.095
    return 0
  }
  const netToGross = (net: string, serviceId: number) => Number(net || 0) * (1 + taxMultiplierByServiceId(serviceId))
  const grossToNet = (gross: string, serviceId: number) => {
    const divisor = 1 + taxMultiplierByServiceId(serviceId)
    if (!Number.isFinite(divisor) || divisor <= 0) return Number(gross || 0)
    return Number(gross || 0) / divisor
  }

  const isOpenBillBatched = (ob: OpenBill) => (ob.sessions?.length ?? 0) > 1

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

  const renderOpenBillLineEditor = (ob: OpenBill, idx: number) => {
    const item = getOpenBillItems(ob)[idx]
    if (!item) return null
    return (
      <div key={`line-${ob.id}-${idx}`} className="billing-open-line-card">
        <div className="billing-open-line-card-head">
          <div>
            <div className="billing-open-line-kicker">Line {idx + 1}</div>
            <div className="billing-open-line-subtitle">Service item for this bill</div>
          </div>
          <button
            type="button"
            className="danger secondary slim-btn billing-open-line-remove"
            onClick={() => setOpenBillItems(ob, getOpenBillItems(ob).filter((_, i) => i !== idx))}
          >
            Remove
          </button>
        </div>
        <div className="billing-open-line-field">
          <label>Service</label>
          <select
            value={item.transactionServiceId}
            onChange={(e) => {
              const id = Number(e.target.value)
              const svc = services.find((s) => s.id === id)
              const next = [...getOpenBillItems(ob)]
              next[idx] = { ...next[idx], transactionServiceId: id, netPrice: String(svc?.netPrice ?? 0) }
              setOpenBillItems(ob, next)
            }}
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.description}
              </option>
            ))}
          </select>
        </div>
        <div className="billing-open-line-compact-fields">
          <div className="billing-open-line-field">
            <label>Qty</label>
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
          <div className="billing-open-line-field">
            <label>Gross price</label>
            <input
              type="number"
              step="0.01"
              value={String(netToGross(item.netPrice, item.transactionServiceId).toFixed(2))}
              onChange={(e) => {
                const next = [...getOpenBillItems(ob)]
                next[idx].netPrice = String(grossToNet(e.target.value, item.transactionServiceId))
                setOpenBillItems(ob, next)
              }}
            />
          </div>
        </div>
      </div>
    )
  }

  const formatOpenBillSession = (sessionInfo?: string) => {
    if (!sessionInfo) return '—'
    const value = String(sessionInfo).trim()
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/)
    if (!match) return value
    const [, year, month, day, rest] = match
    return `${day}/${month}/${year}${rest || ''}`
  }

  const formatOpenBillDateOnly = (sessionInfo?: string) => {
    if (!sessionInfo) return '—'
    const value = String(sessionInfo).trim()
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
      if (bill.paymentMethod?.paymentType === 'BANK_TRANSFER') {
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
    setDetailFolioBill({ ...bill, paymentMethod: normalizePaymentMethod(bill.paymentMethod) })
    setFolioPanelTab(tab)
    await openFiscalLog(bill)
  }

  const renderOpenBillPayTypeControl = (ob: OpenBill) => (
    <>
      <div className="billing-open-paytype-wrap">
        <button
          type="button"
          className="billing-open-paytype-trigger"
          onClick={(e) => {
            const triggerRect = e.currentTarget.getBoundingClientRect()
            const popupHeight = Math.min(260, Math.max(120, paymentMethods.length * 32 + 20))
            const spaceBelow = window.innerHeight - triggerRect.bottom
            const spaceAbove = triggerRect.top
            const nextPlacement: 'up' | 'down' =
              spaceBelow < popupHeight && spaceAbove > spaceBelow ? 'up' : 'down'
            setOpenPayTypePickerFor((prev) => {
              if (prev === ob.id) return null
              setOpenPayTypePickerPlacement(nextPlacement)
              return ob.id
            })
          }}
          aria-haspopup="dialog"
          aria-expanded={openPayTypePickerFor === ob.id}
          aria-label="Select payment method"
          title="Select payment method"
        >
          {paymentTypeIcon(ob.paymentMethod?.paymentType)}
        </button>
        {openPayTypePickerFor === ob.id && (
          <div
            className={`billing-open-paytype-popup ${openPayTypePickerPlacement === 'up' ? 'billing-open-paytype-popup--up' : ''}`}
            role="dialog"
            aria-label="Select payment method"
          >
            {paymentMethods.map((method) => (
              <label key={method.id} className="billing-open-paytype-option">
                <input
                  type="radio"
                  name={`open-bill-paytype-${ob.id}`}
                  checked={ob.paymentMethod?.id === method.id}
                  onChange={() => {
                    updateOpenBillPaymentMethod(ob.id, method.id)
                    setOpenPayTypePickerFor(null)
                  }}
                />
                <span>{method.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <select
        className="billing-open-payment-select"
        value={ob.paymentMethod?.id ?? ''}
        onChange={(e) => updateOpenBillPaymentMethod(ob.id, Number(e.target.value))}
      >
        <option value="">Select payment method</option>
        {paymentMethods.map((method) => (
          <option key={method.id} value={method.id}>{method.name}</option>
        ))}
      </select>
    </>
  )

  const renderOpenBillPayTypePillControl = (ob: OpenBill) => (
    <div className="billing-open-paytype-wrap">
      <button
        type="button"
        className={`billing-open-mobile-paytype-pill billing-open-mobile-paytype-pill--${(ob.paymentMethod?.paymentType || 'none').toLowerCase()}`}
        onClick={(e) => {
          const triggerRect = e.currentTarget.getBoundingClientRect()
          const popupHeight = Math.min(260, Math.max(120, paymentMethods.length * 32 + 20))
          const spaceBelow = window.innerHeight - triggerRect.bottom
          const spaceAbove = triggerRect.top
          const nextPlacement: 'up' | 'down' =
            spaceBelow < popupHeight && spaceAbove > spaceBelow ? 'up' : 'down'
          setOpenPayTypePickerFor((prev) => {
            if (prev === ob.id) return null
            setOpenPayTypePickerPlacement(nextPlacement)
            return ob.id
          })
        }}
        aria-haspopup="dialog"
        aria-expanded={openPayTypePickerFor === ob.id}
        aria-label="Select payment method"
        title="Select payment method"
      >
        {paymentTypeBadgeLabel(ob.paymentMethod?.paymentType)}
      </button>
      {openPayTypePickerFor === ob.id && (
        <div
          className={`billing-open-paytype-popup ${openPayTypePickerPlacement === 'up' ? 'billing-open-paytype-popup--up' : ''}`}
          role="dialog"
          aria-label="Select payment method"
        >
          {paymentMethods.map((method) => (
            <label key={method.id} className="billing-open-paytype-option">
              <input
                type="radio"
                name={`open-bill-paytype-${ob.id}`}
                checked={ob.paymentMethod?.id === method.id}
                onChange={() => {
                  updateOpenBillPaymentMethod(ob.id, method.id)
                  setOpenPayTypePickerFor(null)
                }}
              />
              <span>{method.name}</span>
            </label>
          ))}
        </div>
      )}
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
    <div className="stack gap-lg">
      <div className="stack gap-lg">
          <Card className={(billingTab === 'open' || billingTab === 'history') && isOpenBillsMobile ? 'billing-open-mobile-shell' : ''}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div className="clients-session-tabs" style={{ marginBottom: 0 }}>
                <button type="button" className={billingTab === 'open' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setBillingTab('open')}>{t('billingTabOpenBills')}</button>
                <button type="button" className={billingTab === 'history' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setBillingTab('history')}>{t('billingTabFolioHistory')}</button>
              </div>
              {billingTab === 'open' && (
                <button type="button" className="secondary" onClick={openCreateBillModal}>{isOpenBillsMobile ? t('billingNewMobile') : t('billingNew')}</button>
              )}
            </div>

            {billingTab === 'open' && (
              <>
            <div className="billing-search-row">
              <input
                className="clients-search-input"
                placeholder={t('billingOpenBillsSearchPlaceholder')}
                value={openBillsSearch}
                onChange={(e) => setOpenBillsSearch(e.target.value)}
              />
            </div>
            {sortedOpenBills.length === 0 ? <EmptyState title={t('billingEmptyOpenTitle')} text={t('billingEmptyOpenText')} /> : (
              isOpenBillsMobile ? (
                <div className="billing-open-mobile">
                  <div className="billing-open-mobile-summary">
                    <div className="billing-open-mobile-summary-main">
                      <span className="billing-open-mobile-summary-label">Outstanding</span>
                      <strong>{currency(openBillsSummaryGross)}</strong>
                    </div>
                    <div className="billing-open-mobile-summary-side">
                      <span className="billing-open-mobile-count">{sortedOpenBills.length} bills</span>
                      <div className="billing-open-mobile-sort-wrap">
                        <button
                          type="button"
                          className="billing-open-mobile-sort-btn"
                          onClick={() => setOpenBillsSortMenuOpen((v) => !v)}
                        >
                          Sort: {openBillsSortLabel} <span className="billing-open-mobile-sort-caret">▾</span>
                        </button>
                        {openBillsSortMenuOpen && (
                          <div className="billing-open-mobile-sort-popup" role="dialog" aria-label="Sort open bills">
                            {OPEN_BILLS_SORT_OPTIONS.map((opt) => (
                              <button
                                key={opt.field}
                                type="button"
                                className={`billing-open-mobile-sort-option${openBillsSortField === opt.field ? ' active' : ''}`}
                                onClick={() => {
                                  if (openBillsSortField === opt.field) {
                                    setOpenBillsSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
                                  } else {
                                    setOpenBillsSortField(opt.field)
                                    setOpenBillsSortDir(opt.field === 'client' ? 'asc' : 'desc')
                                  }
                                  setOpenBillsSortMenuOpen(false)
                                }}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="billing-open-mobile-list">
                    {sortedOpenBills.map((ob) => {
                      const items = getOpenBillItems(ob)
                      const gross = estimateGross(items)
                      const serviceSummaryLines = Array.from(
                        items.reduce((map, item, idx) => {
                          const fallback = ob.items[idx]?.transactionService
                          const svc = services.find((s) => s.id === item.transactionServiceId) || fallback
                          const label = (svc?.code || svc?.description || 'Service').trim()
                          map.set(label, (map.get(label) ?? 0) + item.quantity)
                          return map
                        }, new Map<string, number>()),
                      ).map(([label, quantity]) => `${label} x${quantity}`)
                      return (
                        <article key={ob.id} className="billing-open-mobile-card" onClick={() => setDetailOpenBill(ob)}>
                          <div className="billing-open-mobile-card-top">
                            <div className="billing-open-mobile-client">
                              {openBillClientLabel(ob)}
                              {(ob.sessions?.length ?? 0) > 1 ? (
                                <span className="billing-open-batch-chip">{ob.sessions?.length} sessions</span>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              className="small-btn billing-open-create-icon-btn billing-open-create-icon-btn--mobile"
                              onClick={(e) => { e.stopPropagation(); void createBillFromOpen(ob) }}
                              disabled={creatingFromOpenId === ob.id || items.length === 0 || !ob.paymentMethod?.id}
                              aria-label={creatingFromOpenId === ob.id ? 'Creating bill' : 'Create bill'}
                              title={creatingFromOpenId === ob.id ? 'Creating bill' : 'Create bill'}
                            >
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <path d="M14 2v6h6" />
                                <path d="M8 17h8M8 13h8" />
                              </svg>
                            </button>
                          </div>
                          <div className="billing-open-mobile-service">
                            {(serviceSummaryLines.length > 0 ? serviceSummaryLines : ['Service x1']).map((line) => (
                              <div key={line} className="billing-open-mobile-service-line">{line}</div>
                            ))}
                          </div>
                          <div className="billing-open-mobile-info">
                            <span>{openBillConsultantLabel(ob)}</span>
                            <span>{formatOpenBillDateOnly(ob.sessionInfo)}</span>
                          </div>
                          <div className="billing-open-mobile-meta">
                            <div>
                              <span>Gross</span>
                              <strong>{currency(gross)}</strong>
                            </div>
                            <div
                              className="billing-open-payment-col billing-open-mobile-paytype"
                              data-payment-type={ob.paymentMethod?.paymentType || ''}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {renderOpenBillPayTypePillControl(ob)}
                            </div>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="simple-table-wrap clients-table-wrap billing-open-table-wrap">
                  <table className="clients-table billing-open-bills-table">
                    <thead>
                      <tr>
                        <th className="billing-open-session-id-col">Session ID</th>
                        <th className="billing-open-session-col">Session</th>
                        <th>Client</th>
                        <th className="billing-open-consultant-col">Consultant</th>
                        <th><span className="billing-open-total-word">Total </span>gross</th>
                        <th className="billing-open-payment-col">
                          <span className="billing-open-payment-label-full">Payment method</span>
                          <span className="billing-open-payment-label-compact">Pay type</span>
                        </th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedOpenBills.map((ob) => {
                        const items = getOpenBillItems(ob)
                        const gross = estimateGross(items)
                        return (
                          <tr key={ob.id} className="clients-row" onClick={() => setDetailOpenBill(ob)}>
                            <td className="billing-open-session-id-col">
                              {ob.sessionDisplayId || (ob.sessionId ? `#${ob.sessionId}` : '—')}
                              {(ob.sessions?.length ?? 0) > 1 ? <span className="billing-open-batch-chip">{ob.sessions?.length} sessions</span> : null}
                            </td>
                            <td className="billing-open-session-col">{formatOpenBillSession(ob.sessionInfo)}</td>
                            <td className="billing-open-client-col">{openBillClientLabel(ob)}</td>
                            <td className="billing-open-consultant-col">{openBillConsultantLabel(ob)}</td>
                            <td>{currency(gross)}</td>
                            <td
                              className="billing-open-payment-col"
                              data-payment-type={ob.paymentMethod?.paymentType || ''}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {renderOpenBillPayTypeControl(ob)}
                            </td>
                            <td className="clients-actions billing-open-actions-col" onClick={(e) => e.stopPropagation()}>
                              <div className="clients-actions-inner">
                                <button type="button" className="small-btn billing-open-create-btn" onClick={() => createBillFromOpen(ob)} disabled={creatingFromOpenId === ob.id || items.length === 0 || !ob.paymentMethod?.id}>
                                  {creatingFromOpenId === ob.id ? 'Creating…' : 'Create bill'}
                                </button>
                                <button
                                  type="button"
                                  className="small-btn billing-open-create-icon-btn"
                                  onClick={() => createBillFromOpen(ob)}
                                  disabled={creatingFromOpenId === ob.id || items.length === 0 || !ob.paymentMethod?.id}
                                  aria-label={creatingFromOpenId === ob.id ? 'Creating bill' : 'Create bill'}
                                  title={creatingFromOpenId === ob.id ? 'Creating bill' : 'Create bill'}
                                >
                                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <path d="M14 2v6h6" />
                                    <path d="M8 17h8M8 13h8" />
                                  </svg>
                                </button>
                                <button type="button" className="danger secondary small-btn billing-open-delete-btn" onClick={() => deleteOpenBill(ob)} disabled={deletingOpenId === ob.id}>
                                  {deletingOpenId === ob.id ? 'Deleting…' : 'Delete'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}
              </>
            )}

            {billingTab === 'history' && (
              <>
                {!isOpenBillsMobile && <SectionTitle>{t('billingTabFolioHistory')}</SectionTitle>}
            <div className="billing-search-row">
              <input
                className="clients-search-input"
                placeholder="Search folio by bill no., session ID, client, consultant, payment method..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
              <select
                value={historyStatusFilter}
                onChange={(e) => setHistoryStatusFilter(e.target.value as 'all' | 'paid' | 'payment_pending' | 'open' | 'cancelled')}
                aria-label="Filter by payment status"
              >
                <option value="all">All statuses</option>
                <option value="paid">Paid</option>
                <option value="payment_pending">Payment pending</option>
                <option value="open">Open</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <input
                type="date"
                value={historyIssuedDate}
                onChange={(e) => setHistoryIssuedDate(e.target.value)}
                aria-label="Filter by issued date"
              />
              <button type="button" className="secondary" onClick={() => bankStatementInputRef.current?.click()} disabled={importingBankStatement}>
                {importingBankStatement ? 'Importing…' : 'Import bank CSV'}
              </button>
              <input
                ref={bankStatementInputRef}
                type="file"
                accept=".csv,.txt"
                style={{ display: 'none' }}
                onChange={(e) => void importBankStatement(e.target.files?.[0] || null)}
              />
            </div>
            {sortedHistoryBills.length === 0 ? <EmptyState title="No bills yet" text="Use New under Open bills to create a bill, or convert an open bill." /> : (
              isOpenBillsMobile ? (
                <div className="billing-history-mobile">
                  <div className="billing-history-mobile-summary">
                    <div>
                      <span className="billing-open-mobile-summary-label">Collected</span>
                      <strong>{currency(historyCollectedTotal)}</strong>
                    </div>
                    <div className="billing-open-mobile-summary-side">
                      <span className="billing-open-mobile-count">{sortedHistoryBills.length} bills</span>
                      <div className="billing-open-mobile-sort-wrap">
                        <button
                          type="button"
                          className="billing-open-mobile-sort-btn"
                          onClick={() => setHistorySortMenuOpen((prev) => !prev)}
                          aria-haspopup="dialog"
                          aria-expanded={historySortMenuOpen}
                          aria-label="Sort folio history"
                        >
                          {`${historySortField === 'gross' ? 'Gross' : 'Folio no.'} ${historySortDir === 'asc' ? '↑' : '↓'}`}
                          <span className="billing-open-mobile-sort-caret">▾</span>
                        </button>
                        {historySortMenuOpen && (
                          <div className="billing-open-mobile-sort-popup" role="dialog" aria-label="Sort folio history">
                            {HISTORY_SORT_OPTIONS.map((option) => (
                              <button
                                key={option.field}
                                type="button"
                                className={`billing-open-mobile-sort-option ${historySortField === option.field ? 'active' : ''}`}
                                onClick={() => {
                                  if (historySortField === option.field) {
                                    setHistorySortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
                                  } else {
                                    setHistorySortField(option.field)
                                    setHistorySortDir('desc')
                                  }
                                  setHistorySortMenuOpen(false)
                                }}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {historyIssuedDate ? <span className="billing-history-mobile-period">{historyIssuedDate}</span> : null}
                    </div>
                  </div>
                  <div className="billing-open-mobile-list">
                    {sortedHistoryBills.map((bill) => {
                      const statusPill = folioHistoryMobileStatusPill(bill)
                      return (
                      <article key={bill.id} className="billing-open-mobile-card" onClick={() => { void openFolioPanel(bill) }}>
                        <div className="billing-open-mobile-card-top">
                          <div className="billing-open-mobile-client">
                            {`Folio #${bill.billNumber || bill.id}`}
                          </div>
                          <button
                            type="button"
                            className="small-btn billing-open-create-icon-btn billing-open-create-icon-btn--mobile"
                            onClick={(e) => { e.stopPropagation(); void downloadFolioPdf(bill) }}
                            title={`Download PDF (${bill.paymentStatus || 'open'})`}
                            aria-label={`Download PDF (${bill.paymentStatus || 'open'})`}
                          >
                            {renderPlainFolioPdfIcon()}
                          </button>
                        </div>
                        <div className="billing-open-mobile-service">
                          {bill.billingTarget === 'COMPANY'
                            ? (bill.recipientCompany?.name || '—')
                            : (bill.client ? fullName(bill.client) : '—')}
                        </div>
                        <div className="billing-open-mobile-info">
                          <span>{fullName(bill.consultant)}</span>
                          <span>{formatDate(bill.issueDate)}</span>
                        </div>
                        <div className="billing-open-mobile-meta">
                          <div>
                            <span>Gross</span>
                            <strong>{currency(bill.totalGross)}</strong>
                          </div>
                          <div className="billing-open-mobile-paytype">
                            <span className={`billing-open-mobile-paytype-pill billing-open-mobile-paytype-pill--${(bill.paymentMethod?.paymentType || 'none').toLowerCase()}`}>
                              {paymentTypeBadgeLabel(bill.paymentMethod?.paymentType)}
                            </span>
                          </div>
                        </div>
                        <div className="billing-history-mobile-actions">
                          <div className="billing-history-mobile-actions-start">
                            {statusPill ? (
                              <span className={`billing-folio-status-pill billing-folio-status-pill--${statusPill.variant}`}>
                                {statusPill.label}
                              </span>
                            ) : null}
                          </div>
                          <div className="billing-history-mobile-actions-end">
                            {(bill.paymentMethod?.paymentType === 'BANK_TRANSFER' && bill.paymentStatus === 'payment_pending') && (
                              <button className="linkish-btn" onClick={(e) => { e.stopPropagation(); void markBillPaid(bill) }} disabled={markingPaidBillId === bill.id}>
                                {markingPaidBillId === bill.id ? 'Saving…' : 'Mark paid'}
                              </button>
                            )}
                            {bill.fiscalStatus !== 'SENT' && (
                              <button className="linkish-btn" onClick={(e) => { e.stopPropagation(); void retryFiscalization(bill.id) }} disabled={retryingFiscalBillId === bill.id}>
                                {retryingFiscalBillId === bill.id ? 'Retrying…' : 'Retry'}
                              </button>
                            )}
                            {((bill.paymentMethod?.paymentType === 'BANK_TRANSFER' && bill.paymentStatus !== 'paid') || (bill.paymentMethod?.stripeEnabled && bill.paymentStatus !== 'paid')) && (
                              <button className="linkish-btn" onClick={(e) => { e.stopPropagation(); void sendCheckoutLink(bill) }} disabled={creatingCheckoutBillId === bill.id}>
                                {creatingCheckoutBillId === bill.id ? 'Sending…' : bill.paymentMethod?.paymentType === 'BANK_TRANSFER' ? 'Send folio' : 'Pay link'}
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="simple-table-wrap">
                  <table>
                    <thead><tr><th>Bill no.</th><th>Session ID</th><th>Client</th><th>Consultant</th><th>Payment method</th><th>Issued</th><th>Total gross</th><th>Payment</th><th>Fiscal</th><th /></tr></thead>
                    <tbody>
                      {sortedHistoryBills.map((bill) => (
                        <tr key={bill.id} className="billing-history-row" onClick={() => { void openFolioPanel(bill) }}>
                          <td>{bill.billNumber}</td>
                          <td>{bill.sessionId ? `#${bill.sessionId}` : '—'}</td>
                          <td>{bill.billingTarget === 'COMPANY'
                            ? (bill.recipientCompany?.name || '—')
                            : (bill.client ? fullName(bill.client) : '—')}</td>
                          <td>{fullName(bill.consultant)}</td>
                          <td>{bill.paymentMethod ? `${bill.paymentMethod.name} (${paymentTypeLabel(bill.paymentMethod.paymentType)})` : '—'}</td>
                          <td>{formatDate(bill.issueDate)}</td>
                          <td>{currency(bill.totalGross)}</td>
                          <td>{bill.paymentStatus || 'open'}</td>
                          <td>
                            {bill.fiscalStatus === 'SENT'
                              ? `SENT${bill.fiscalEor ? ` (EOR: ${bill.fiscalEor})` : ''}`
                              : bill.fiscalStatus === 'FAILED'
                                ? `FAILED${bill.fiscalLastError ? `: ${bill.fiscalLastError}` : ''}`
                                : 'NOT SENT'}
                          </td>
                          <td className="table-actions" onClick={(e) => e.stopPropagation()}>
                            {(bill.paymentMethod?.paymentType === 'BANK_TRANSFER' && bill.paymentStatus === 'payment_pending') && (
                              <button className="linkish-btn" onClick={() => markBillPaid(bill)} disabled={markingPaidBillId === bill.id}>
                                {markingPaidBillId === bill.id ? 'Saving…' : 'Mark paid'}
                              </button>
                            )}
                            {bill.fiscalStatus !== 'SENT' && (
                              <button className="linkish-btn" onClick={() => retryFiscalization(bill.id)} disabled={retryingFiscalBillId === bill.id}>
                                {retryingFiscalBillId === bill.id ? 'Retrying…' : 'Retry fiscal'}
                              </button>
                            )}
                            {((bill.paymentMethod?.paymentType === 'BANK_TRANSFER' && bill.paymentStatus !== 'paid') || (bill.paymentMethod?.stripeEnabled && bill.paymentStatus !== 'paid')) && (
                              <button className="linkish-btn" onClick={() => sendCheckoutLink(bill)} disabled={creatingCheckoutBillId === bill.id}>
                                {creatingCheckoutBillId === bill.id ? 'Sending…' : bill.paymentMethod?.paymentType === 'BANK_TRANSFER' ? 'Send folio' : 'Send payment link'}
                              </button>
                            )}
                            <button type="button" className="pdf-icon-btn" onClick={() => downloadFolioPdf(bill)} title={`Download PDF (${bill.paymentStatus || 'open'})`} aria-label={`Download PDF (${bill.paymentStatus || 'open'})`}>
                              <svg className="pdf-icon-svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <path d="M14 2v6h6" />
                                <path d="M8 17h8M8 13h8" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
              </>
            )}
          </Card>
      </div>

      {detailOpenBill && (
        <div className="modal-backdrop booking-side-panel-backdrop" onClick={() => setDetailOpenBill(null)}>
          <div className="modal large-modal booking-side-panel billing-open-detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="booking-side-panel-header">
              <PageHeader
                title="Open bill"
                subtitle={`${openBillClientLabel(detailOpenBill)} · ${formatOpenBillSession(detailOpenBill.sessionInfo)}`}
                actions={<button type="button" className="secondary booking-side-panel-close" onClick={() => setDetailOpenBill(null)} aria-label="Close">×</button>}
              />
            </div>
            <div className="booking-side-panel-body">
              {(detailOpenBill.sessions?.length ?? 0) > 1 && (
                <div className="billing-open-batch-sessions">
                  <div className="billing-open-batch-sessions-title">Batched sessions</div>
                  {detailOpenBill.sessions?.map((session) => {
                    const splitKey = `${detailOpenBill.id}:${session.sessionId}`
                    const canSplit = session.sessionId > 0
                    const expanded = expandedBatchSessionId === session.sessionId
                    return (
                      <div key={session.sessionId} className="billing-open-batch-session-block">
                        <div className="billing-open-batch-session-row">
                          <button
                            type="button"
                            className="billing-open-batch-session-toggle"
                            onClick={() =>
                              setExpandedBatchSessionId((prev) => (prev === session.sessionId ? null : session.sessionId))
                            }
                            aria-expanded={expanded}
                          >
                            <span className="billing-open-batch-session-chevron" aria-hidden>
                              {expanded ? '▾' : '▸'}
                            </span>
                            <div className="billing-open-batch-session-label">
                              <strong>{session.sessionDisplayId || `#${session.sessionId}`}</strong>
                              <span>{formatOpenBillSession(session.sessionInfo)}</span>
                            </div>
                          </button>
                          <button
                            type="button"
                            className="secondary small-btn"
                            onClick={() => void splitOpenBillSession(detailOpenBill, session.sessionId)}
                            disabled={splittingSessionKey != null || !canSplit}
                          >
                            {!canSplit ? 'Manual' : (splittingSessionKey === splitKey ? 'Splitting…' : 'Split')}
                          </button>
                        </div>
                        {expanded && (
                          <div className="billing-open-batch-session-lines">
                            {openBillLineIndicesForSession(detailOpenBill, session.sessionId).map((idx) =>
                              renderOpenBillLineEditor(detailOpenBill, idx),
                            )}
                            {openBillLineIndicesForSession(detailOpenBill, session.sessionId).length === 0 && (
                              <p className="billing-open-batch-session-empty muted">No service lines for this session yet.</p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="billing-open-lines">
                {isOpenBillBatched(detailOpenBill) && openBillLineIndicesForMain(detailOpenBill).length > 0 && (
                  <div className="billing-open-lines-other-title">Other lines (not linked to a listed session)</div>
                )}
                {(isOpenBillBatched(detailOpenBill)
                  ? openBillLineIndicesForMain(detailOpenBill)
                  : getOpenBillItems(detailOpenBill).map((_, idx) => idx)
                ).map((idx) => renderOpenBillLineEditor(detailOpenBill, idx))}
                {services.length > 0 && (
                  <button
                    type="button"
                    className="secondary small-btn billing-open-add-line"
                    disabled={isOpenBillBatched(detailOpenBill) && expandedBatchSessionId == null}
                    title={
                      isOpenBillBatched(detailOpenBill) && expandedBatchSessionId == null
                        ? 'Open a batched session above, then add a line for that session.'
                        : undefined
                    }
                    onClick={() => {
                      const nextSid = isOpenBillBatched(detailOpenBill) ? expandedBatchSessionId : null
                      if (isOpenBillBatched(detailOpenBill) && nextSid == null) return
                      setOpenBillItems(detailOpenBill, [
                        ...getOpenBillItems(detailOpenBill),
                        {
                          transactionServiceId: services[0].id,
                          quantity: 1,
                          netPrice: String(services[0].netPrice),
                          sourceSessionBookingId: nextSid,
                        },
                      ])
                    }}
                  >
                    + Add service line
                  </button>
                )}
                {isOpenBillsMobile ? (
                  <div className="billing-payment-picker">
                    <div className="billing-payment-picker-title">Payment type</div>
                    <div className="billing-payment-picker-subtitle">Choose how this bill will be paid.</div>
                    <div className="billing-payment-picker-grid">
                      {paymentMethods.map((method) => (
                        <button
                          key={method.id}
                          type="button"
                          className={`billing-payment-picker-card${detailOpenBill.paymentMethod?.id === method.id ? ' billing-payment-picker-card--active' : ''}`}
                          onClick={() => updateOpenBillPaymentMethod(detailOpenBill.id, method.id)}
                        >
                          <span className="billing-payment-picker-icon" aria-hidden>{paymentTypeIcon(method.paymentType)}</span>
                          <span className="billing-payment-picker-label">{method.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <Field label="Payment method">
                    <select
                      value={detailOpenBill.paymentMethod?.id ?? ''}
                      onChange={(e) => updateOpenBillPaymentMethod(detailOpenBill.id, Number(e.target.value))}
                    >
                      <option value="">Select payment method</option>
                      {paymentMethods.map((method) => (
                        <option key={method.id} value={method.id}>
                          {method.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <div className="billing-sticky-summary-stack">
                  <div className="billing-open-estimate billing-open-estimate--sticky">
                    <div>
                      <div className="billing-open-estimate-label">Estimated total</div>
                      <strong>{currency(estimateGross(getOpenBillItems(detailOpenBill)))}</strong>
                    </div>
                    <div className="billing-open-estimate-count">
                      <div>{getOpenBillItems(detailOpenBill).length} line items</div>
                      <div>Payment: {detailOpenBill.paymentMethod?.name || '—'}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="form-actions booking-side-panel-footer billing-open-edit-footer">
              <div className="billing-open-edit-footer-left">
                <button type="button" className="danger secondary small-btn" onClick={() => deleteOpenBill(detailOpenBill)} disabled={deletingOpenId === detailOpenBill.id}>
                  {deletingOpenId === detailOpenBill.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
              <div className="billing-open-edit-footer-right">
                {Object.prototype.hasOwnProperty.call(openBillEdits, detailOpenBill.id) && (
                  <button type="button" className="secondary small-btn" onClick={() => saveOpenBill(detailOpenBill)}>Save changes</button>
                )}
                <button type="button" className="small-btn" onClick={() => createBillFromOpen(detailOpenBill)} disabled={creatingFromOpenId === detailOpenBill.id || getOpenBillItems(detailOpenBill).length === 0 || !detailOpenBill.paymentMethod?.id}>
                  {creatingFromOpenId === detailOpenBill.id ? 'Creating…' : 'Create bill'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreateBillModal && (
        <div className="modal-backdrop booking-side-panel-backdrop" onClick={closeCreateBillModal}>
          <div className="modal large-modal booking-side-panel billing-create-panel" onClick={(e) => e.stopPropagation()}>
            <div className="booking-side-panel-header">
              <PageHeader
                title="Create bill"
                actions={<button type="button" className="secondary booking-side-panel-close" onClick={closeCreateBillModal} aria-label="Close">×</button>}
              />
            </div>
            <div className="booking-side-panel-body form-grid">
              <div className="full-span booking-type-switcher">
                <button
                  type="button"
                  className={billForm.billingTarget === 'PERSON' ? 'booking-type-btn active' : 'booking-type-btn'}
                  onClick={() => setBillForm({ ...billForm, billingTarget: 'PERSON', recipientCompanyId: undefined })}
                >
                  Individual
                </button>
                <button
                  type="button"
                  className={billForm.billingTarget === 'COMPANY' ? 'booking-type-btn active' : 'booking-type-btn'}
                  onClick={() => setBillForm({
                    ...billForm,
                    billingTarget: 'COMPANY',
                    recipientCompanyId: billForm.recipientCompanyId ?? selectedClientCompany?.id,
                  })}
                >
                  Company
                </button>
              </div>
              {billForm.billingTarget === 'COMPANY' && (
                <>
                  <Field label="Recipient company">
                    <div className="client-picker" onClick={(e) => e.stopPropagation()} style={{ minWidth: 0 }}>
                      <div className={`client-search-wrap${!editingRecipientCompanySearch ? ' client-search-wrap--compact-client' : ''}`}>
                        {editingRecipientCompanySearch ? (
                          <input
                            placeholder="Search company..."
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
                            {selectedRecipientCompany?.name || 'Select company'}
                          </button>
                        )}
                        <span className="client-search-icon" aria-hidden>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                        </span>
                      </div>
                      <button
                        type="button"
                        className="secondary client-add-btn"
                        onClick={() => {
                          setRecipientCompanyPickerOpen(false)
                          setShowAddCompanyModal(true)
                        }}
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
                              {selectedClientCompany.name} (linked to client)
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
                          {visibleRecipientCompanies.length === 0 && <span className="muted">No companies found. Use + to add one.</span>}
                        </div>
                      )}
                    </div>
                  </Field>
                </>
              )}
              <Field label={billForm.billingTarget === 'COMPANY' ? 'Client (optional)' : 'Client'}>
                <select
                  value={billForm.clientId ?? ''}
                  onChange={(e) => {
                    const nextClientId = e.target.value === '' ? undefined : Number(e.target.value)
                    const nextClient = clients.find((entry) => entry.id === nextClientId)
                    setBillForm({
                      ...billForm,
                      clientId: nextClientId,
                      recipientCompanyId: billForm.billingTarget === 'COMPANY'
                        ? (billForm.recipientCompanyId ?? nextClient?.billingCompany?.id ?? undefined)
                        : undefined,
                    })
                  }}
                >
                  <option value="">Select client</option>
                  {clients.map((client) => <option key={client.id} value={client.id}>{fullName(client)}</option>)}
                </select>
              </Field>
              <Field label="Consultant"><select value={billForm.consultantId ?? ''} onChange={(e) => setBillForm({ ...billForm, consultantId: Number(e.target.value) })}><option value="">Select consultant</option>{(me.role === 'ADMIN' ? users : [me]).map((user) => <option key={user.id} value={user.id}>{fullName(user)}</option>)}</select></Field>
              <div className="full-span stack gap-sm">
                <SectionTitle action={<button type="button" className="secondary small-btn" onClick={() => setBillForm({ ...billForm, items: [...billForm.items, { transactionServiceId: services[0]?.id, quantity: 1, netPrice: String(services[0]?.netPrice ?? 0) }] })}>Add line</button>}>Bill lines</SectionTitle>
                {billForm.items.length === 0 ? <EmptyState title="No bill lines" text="Add one or more transaction services." /> : billForm.items.map((item, index) => (
                  <div key={index} className="inline-form billing-row">
                    <select value={item.transactionServiceId} onChange={(e) => {
                      const id = Number(e.target.value)
                      const service = services.find((entry) => entry.id === id)
                      const next = [...billForm.items]
                      next[index] = { ...next[index], transactionServiceId: id, netPrice: String(service?.netPrice ?? 0) }
                      setBillForm({ ...billForm, items: next })
                    }}>
                      {services.map((service) => <option key={service.id} value={service.id}>{service.code} · {service.description}</option>)}
                    </select>
                    <input type="number" min="1" value={item.quantity} onChange={(e) => {
                      const next = [...billForm.items]
                      next[index].quantity = Number(e.target.value)
                      setBillForm({ ...billForm, items: next })
                    }} />
                    <input type="number" step="0.01" value={item.netPrice} onChange={(e) => {
                      const next = [...billForm.items]
                      next[index].netPrice = e.target.value
                      setBillForm({ ...billForm, items: next })
                    }} />
                    <button type="button" className="danger secondary slim-btn" onClick={() => setBillForm({ ...billForm, items: billForm.items.filter((_, i) => i !== index) })}>Remove</button>
                  </div>
                ))}
              </div>
              {isOpenBillsMobile ? (
                <div className="full-span billing-payment-picker">
                  <div className="billing-payment-picker-title">Payment type</div>
                  <div className="billing-payment-picker-subtitle">Choose how this bill will be paid.</div>
                  <div className="billing-payment-picker-grid">
                    {paymentMethods.map((method) => (
                      <button
                        key={method.id}
                        type="button"
                        className={`billing-payment-picker-card${billForm.paymentMethodId === method.id ? ' billing-payment-picker-card--active' : ''}`}
                        onClick={() => setBillForm({ ...billForm, paymentMethodId: method.id })}
                      >
                        <span className="billing-payment-picker-icon" aria-hidden>{paymentTypeIcon(method.paymentType)}</span>
                        <span className="billing-payment-picker-label">{method.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <Field label="Payment method">
                  <select value={billForm.paymentMethodId ?? ''} onChange={(e) => setBillForm({ ...billForm, paymentMethodId: Number(e.target.value) })}>
                    <option value="">Select payment method</option>
                    {paymentMethods.map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}
                  </select>
                </Field>
              )}
              <div className="full-span billing-sticky-summary-stack">
                <div className="billing-open-estimate billing-open-estimate--sticky full-span">
                  <div>
                    <div className="billing-open-estimate-label">Estimated total</div>
                    <strong>{currency(grossPreview)}</strong>
                  </div>
                  <div className="billing-open-estimate-count">
                    <div>{billForm.items.length} line items</div>
                    <div>
                      Payment: {paymentMethods.find((method) => method.id === billForm.paymentMethodId)?.name || '—'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="form-actions booking-side-panel-footer" style={{ justifyContent: 'space-between' }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void createManualOpenBillFromCreateBillForm()}
                  disabled={creatingManualOpenBill}
                >
                  {creatingManualOpenBill ? 'Creating…' : 'Create Open Bill'}
                </button>
                <button
                  type="button"
                  onClick={createBill}
                  disabled={creatingBill || !billCanSubmit}
                >
                  {creatingBill ? 'Creating…' : 'Create bill'}
                </button>
            </div>
          </div>
        </div>
      )}

      {showAddCompanyModal && (
        <div className="modal-backdrop" onClick={() => setShowAddCompanyModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <PageHeader title="New company" subtitle="Required: company name." />
            <div className="form-grid">
              <Field label="Company name">
                <input value={newCompanyName} onChange={(e) => setNewCompanyName(e.target.value)} placeholder="Company name" />
              </Field>
              <Field label="Email">
                <input type="email" value={newCompanyEmail} onChange={(e) => setNewCompanyEmail(e.target.value)} placeholder="Email (optional)" />
              </Field>
              <Field label="Telephone">
                <input value={newCompanyTelephone} onChange={(e) => setNewCompanyTelephone(e.target.value)} placeholder="Telephone (optional)" />
              </Field>
              <div className="form-actions full-span">
                <button type="button" onClick={createCompanyInline} disabled={creatingCompany || !newCompanyName.trim()}>
                  {creatingCompany ? 'Creating…' : 'Create'}
                </button>
                <button type="button" className="secondary" onClick={() => setShowAddCompanyModal(false)}>Cancel</button>
              </div>
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
                    </div>
                    <div className="inline-form" style={{ gridTemplateColumns: '1fr 1fr' }}>
                      <Field label="Consultant"><input readOnly value={fullName(detailFolioBill.consultant)} /></Field>
                      <Field label="Issued"><input readOnly value={formatDate(detailFolioBill.issueDate)} /></Field>
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
                              <td>{item.transactionService?.code || '—'}</td>
                              <td>{item.quantity}</td>
                              <td>{currency(item.grossPrice)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button type="button" className="primary" style={{ marginTop: 12 }} onClick={() => downloadFolioPdf(detailFolioBill)}>
                      Download folio PDF
                    </button>
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
