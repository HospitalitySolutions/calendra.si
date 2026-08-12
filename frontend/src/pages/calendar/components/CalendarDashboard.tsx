import { DesktopSelect } from '../../../components/DesktopSelect'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../../api'
import { useToast } from '../../../components/Toast'
import { subscribeBookingUpdates } from '../../../lib/bookingRealtime'
import { bookingMatchesUnassignedDimensions, type UnassignedBookingDimension } from '../calendarUtils'

type DashboardBlockKey = 'analytics' | 'tasks' | 'notifications' | 'clients' | 'waitlist' | 'openBill' | 'advance'
type DiscountType = 'PERCENT' | 'AMOUNT'

type ResourceSelector = {
  kind: 'consultants' | 'spaces'
  options: Array<{ id: number; label: string }>
  selectedIds: number[]
  onChange: (ids: number[]) => void
}

type UnassignedSelector = {
  showConsultant: boolean
  showSpace: boolean
  selected: UnassignedBookingDimension[]
  onChange: (dimensions: UnassignedBookingDimension[]) => void
}

type CalendarDashboardProps = {
  locale: string
  user: any
  selectedDate: string
  selectedSession: any | null
  bookings: any[]
  settings: Record<string, string>
  todosEnabled: boolean
  waitlistEnabled: boolean
  canIssueOpenInvoice: boolean
  canIssueAdvanceInvoice: boolean
  visibleConsultantIds?: number[]
  visibleSpaceIds?: number[]
  resourceSelector?: ResourceSelector | null
  unassignedSelector?: UnassignedSelector | null
  onOpenClient: (clientId: number) => void
  onOpenTodo: (todoId: number) => void
  onEditSession: () => void
  onOpenFullOpenBill: (status: any, openBillId?: number | null) => void
  onOpenFullAdvance: (status: any, client?: any | null) => void
  onRefreshCalendar: () => Promise<unknown> | void
}

type NotificationItem = {
  key: string
  type: string
  title: string
  message: string
  actionUrl?: string | null
  createdAt: string
  unread: boolean
}

type BillingService = {
  id: number
  code?: string | null
  description?: string | null
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

type BillingRow = {
  key: string
  transactionServiceId: number
  quantity: number
  grossPrice: string
  sourceSessionBookingId?: number | null
  sourceAdvanceBillId?: number | null
}

type BillingDraft = {
  rows: BillingRow[]
  discountType: DiscountType
  discountValue: string
  paymentMethodId: number | null
}

const ALL_BLOCKS: Array<{ key: DashboardBlockKey; title: string; description: string }> = [
  { key: 'analytics', title: 'Analitika', description: 'Zasedenost, prihodki in število terminov za izbrani dan.' },
  { key: 'tasks', title: 'Opravila', description: 'Zamujena in današnja opravila z možnostjo hitrega zaključka.' },
  { key: 'notifications', title: 'Obvestila', description: 'Najnovejše aktivnosti rezervacij iz centra za obvestila.' },
  { key: 'clients', title: 'Stranka', description: 'Vse stranke, povezane z izbranim terminom.' },
  { key: 'waitlist', title: 'Čakalna vrsta', description: 'Stranke, ki čakajo na termin za izbrani dan.' },
  { key: 'openBill', title: 'Odprti račun', description: 'Hitro dopolnite in zaključite odprti račun izbranega termina.' },
  { key: 'advance', title: 'Predplačilo', description: 'Hitro ustvarite predplačilo za izbrani termin.' },
]

const DEFAULT_BLOCKS: DashboardBlockKey[] = ALL_BLOCKS.map((item) => item.key)

function dashboardStorageKey(user: any) {
  return `calendra.calendar.dashboard.v1:${String(user?.companyId ?? user?.tenantCode ?? 'company')}:${String(user?.id ?? 'user')}`
}

function readVisibleBlocks(user: any): DashboardBlockKey[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(dashboardStorageKey(user)) || 'null')
    if (!Array.isArray(parsed)) return DEFAULT_BLOCKS
    const known = new Set(DEFAULT_BLOCKS)
    return parsed.filter((value): value is DashboardBlockKey => known.has(value))
  } catch {
    return DEFAULT_BLOCKS
  }
}

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (name === 'pulse') return <svg {...common}><path d="M3 12h4l2-7 4 14 2-7h6" /></svg>
  if (name === 'calendar') return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>
  if (name === 'clock') return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
  if (name === 'euro') return <svg {...common}><path d="M18 7.5A6 6 0 1 0 18 16.5M5 10h10M5 14h9" /></svg>
  if (name === 'checkSquare') return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="m7 12 3 3 7-7" /></svg>
  if (name === 'bell') return <svg {...common}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
  if (name === 'users') return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
  if (name === 'queue') return <svg {...common}><circle cx="6" cy="6" r="2" /><circle cx="6" cy="12" r="2" /><circle cx="6" cy="18" r="2" /><path d="M10 6h10M10 12h10M10 18h10" /></svg>
  if (name === 'receipt') return <svg {...common}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>
  if (name === 'wallet') return <svg {...common}><path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h11" /><path d="M16 12h4v4h-4a2 2 0 1 1 0-4Z" /></svg>
  if (name === 'settings') return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.25.3.45.65.6 1 .1.36.14.73.1 1.1V11h.9v4h-.09a1.7 1.7 0 0 0-1.51 1Z" /></svg>
  if (name === 'plus') return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>
  if (name === 'trash') return <svg {...common}><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6" /></svg>
  if (name === 'external') return <svg {...common}><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
  if (name === 'close') return <svg {...common}><path d="m6 6 12 12M18 6 6 18" /></svg>
  if (name === 'chevron') return <svg {...common}><path d="m9 18 6-6-6-6" /></svg>
  if (name === 'person') return <svg {...common}><circle cx="12" cy="8" r="3" /><path d="M5.5 21a6.5 6.5 0 0 1 13 0" /></svg>
  if (name === 'card') return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h3" /></svg>
  return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></svg>
}

function formatMoney(value: number, locale: string) {
  return new Intl.NumberFormat(locale === 'sl' ? 'sl-SI' : locale === 'sr' ? 'sr-RS' : 'en-GB', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)
}

function parseNumber(value: unknown) {
  const normalized = String(value ?? '').replace(',', '.').trim()
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function taxMultiplier(taxRate: unknown) {
  if (taxRate === 'VAT_22') return 0.22
  if (taxRate === 'VAT_9_5') return 0.095
  return 0
}

function serviceGross(service: BillingService) {
  return Number((parseNumber(service.netPrice) * (1 + taxMultiplier(service.taxRate))).toFixed(2))
}

function serviceLabel(service: BillingService) {
  return String(service.description || service.code || `#${service.id}`).trim()
}

function isAdvancePaymentMethod(method: PaymentMethod) {
  if (String(method.paymentType || '').toUpperCase() === 'ADVANCE') return true
  const value = `${method.name || ''} ${method.paymentType || ''}`.toLowerCase()
  return value.includes('deposit') || value.includes('advance') || value.includes('predpla') || value.includes('avans') || value.includes('polog')
}

function isStripePaymentMethod(method: PaymentMethod) {
  return method.stripeEnabled === true || String(method.paymentType || '').toUpperCase() === 'CARD'
}

function makeRow(service: BillingService | undefined, sourceSessionBookingId?: number | null, grossOverride?: number): BillingRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    transactionServiceId: Number(service?.id || 0),
    quantity: 1,
    grossPrice: String(Number.isFinite(grossOverride) && Number(grossOverride) > 0 ? Number(grossOverride).toFixed(2) : serviceGross(service || { id: 0 }).toFixed(2)),
    sourceSessionBookingId: sourceSessionBookingId ?? null,
  }
}

function dateTimeMs(value: unknown) {
  const parsed = new Date(String(value || '')).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function localDateKey(value: unknown) {
  const raw = String(value || '')
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  const d = new Date(raw)
  if (!Number.isFinite(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function timeLabel(value: unknown, locale: string) {
  const date = new Date(String(value || ''))
  if (!Number.isFinite(date.getTime())) return '—'
  return new Intl.DateTimeFormat(locale === 'sl' ? 'sl-SI' : locale === 'sr' ? 'sr-RS' : 'en-GB', { hour: '2-digit', minute: '2-digit' }).format(date)
}

function relativeTime(value: string, locale: string) {
  const ms = dateTimeMs(value)
  if (!ms) return ''
  const mins = Math.max(0, Math.floor((Date.now() - ms) / 60000))
  if (mins < 1) return locale === 'sl' ? 'zdaj' : 'now'
  if (mins < 60) return locale === 'sl' ? `pred ${mins} min` : `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return locale === 'sl' ? `pred ${hours} h` : `${hours} h ago`
  const days = Math.floor(hours / 24)
  return locale === 'sl' ? `pred ${days} d` : `${days} d ago`
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '—'
}

function normalizeClients(session: any) {
  const raw = Array.isArray(session?.clients) && session.clients.length > 0 ? session.clients : session?.client ? [session.client] : []
  const seen = new Set<number>()
  return raw.filter((client: any) => {
    const id = Number(client?.id || 0)
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function normalizeStatuses(session: any, clients: any[]) {
  const statuses = Array.isArray(session?.paymentStatuses) ? session.paymentStatuses : []
  if (statuses.length > 0) return statuses
  return clients.map((client: any) => ({
    clientId: Number(client?.id || 0),
    bookingId: Number(session?.id || 0),
    openBillId: null,
    sessionTotalGross: parseNumber(session?.price ?? session?.totalGross),
  }))
}

function DashboardCard({ title, icon, action, className = '', children }: { title: string; icon: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`calendar-day-dashboard-card ${className}`.trim()}>
      <header className="calendar-day-dashboard-card__header">
        <div className="calendar-day-dashboard-card__title"><span className="calendar-day-dashboard-card__title-icon"><Icon name={icon} size={18} /></span><h3>{title}</h3></div>
        {action ? <div className="calendar-day-dashboard-card__action">{action}</div> : null}
      </header>
      <div className="calendar-day-dashboard-card__body">{children}</div>
    </section>
  )
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="calendar-day-dashboard-empty">{children}</div>
}

function BillingRowsEditor({ rows, services, onChange, disabled }: { rows: BillingRow[]; services: BillingService[]; onChange: (rows: BillingRow[]) => void; disabled?: boolean }) {
  const update = (index: number, patch: Partial<BillingRow>) => onChange(rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row))
  const add = () => onChange([...rows, makeRow(services[0], rows[0]?.sourceSessionBookingId ?? null)])
  return (
    <div className="calendar-dashboard-billing-lines">
      <div className="calendar-dashboard-billing-lines__header"><span>Postavka</span><span>Kol.</span><span>Cena</span><span /></div>
      {rows.map((row, index) => (
        <div className="calendar-dashboard-billing-line" key={row.key}>
          <DesktopSelect value={row.transactionServiceId || ''} disabled={disabled} onChange={(event) => {
            const service = services.find((item) => Number(item.id) === Number(event.target.value))
            update(index, { transactionServiceId: Number(event.target.value), grossPrice: service ? serviceGross(service).toFixed(2) : row.grossPrice })
          }}>
            <option value="" disabled>Izberite postavko</option>
            {services.map((service) => <option value={service.id} key={service.id}>{serviceLabel(service)}</option>)}
          </DesktopSelect>
          <input type="number" min="1" step="1" value={row.quantity} disabled={disabled} onChange={(event) => update(index, { quantity: Math.max(1, Number(event.target.value || 1)) })} aria-label="Količina" />
          <div className="calendar-dashboard-money-input"><input type="number" min="0" step="0.01" value={row.grossPrice} disabled={disabled} onChange={(event) => update(index, { grossPrice: event.target.value })} aria-label="Cena" /><span>€</span></div>
          <button type="button" className="calendar-dashboard-icon-button" disabled={disabled || rows.length <= 1} onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))} aria-label="Odstrani postavko"><Icon name="trash" size={16} /></button>
        </div>
      ))}
      <button type="button" className="calendar-dashboard-text-button" disabled={disabled || services.length === 0} onClick={add}><Icon name="plus" size={16} /> Dodaj postavko</button>
    </div>
  )
}

function BillingControls({ draft, paymentMethods, subtotal, locale, onChange, disabled }: { draft: BillingDraft; paymentMethods: PaymentMethod[]; subtotal: number; locale: string; onChange: (draft: BillingDraft) => void; disabled?: boolean }) {
  const discountRaw = Math.max(0, parseNumber(draft.discountValue))
  const discount = draft.discountType === 'PERCENT' ? subtotal * Math.min(100, discountRaw) / 100 : Math.min(subtotal, discountRaw)
  return (
    <div className="calendar-dashboard-billing-controls">
      <label><span>Popust</span><div className="calendar-dashboard-inline-control"><DesktopSelect value={draft.discountType} disabled={disabled} onChange={(event) => onChange({ ...draft, discountType: event.target.value as DiscountType })}><option value="PERCENT">%</option><option value="AMOUNT">€</option></DesktopSelect><input type="number" min="0" step="0.01" value={draft.discountValue} disabled={disabled} onChange={(event) => onChange({ ...draft, discountValue: event.target.value })} /></div></label>
      <label><span>Način plačila</span><DesktopSelect value={draft.paymentMethodId ?? ''} disabled={disabled} onChange={(event) => onChange({ ...draft, paymentMethodId: Number(event.target.value) || null })}><option value="">Izberite</option>{paymentMethods.map((method) => <option value={method.id} key={method.id}>{method.name}</option>)}</DesktopSelect></label>
      <div className="calendar-dashboard-billing-total"><span>Za plačilo</span><strong>{formatMoney(Math.max(0, subtotal - discount), locale)}</strong></div>
    </div>
  )
}

function ResourcePicker({ selector }: { selector: ResourceSelector }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<number[]>(selector.selectedIds)
  useEffect(() => setDraft(selector.selectedIds), [selector.selectedIds])
  const noun = selector.kind === 'consultants' ? 'osebje' : 'prostore'
  const title = selector.kind === 'consultants' ? 'Izberi osebje' : 'Izberi prostore'
  return (
    <div className="calendar-dashboard-resource-picker">
      <button type="button" className="calendar-dashboard-secondary-button" onClick={() => setOpen((value) => !value)}>{title} ({selector.selectedIds.length}/3)</button>
      {open ? (
        <div className="calendar-dashboard-resource-picker__popover">
          <strong>{title}</strong><p>Na koledarju lahko prikažete največ tri {noun}.</p>
          <div className="calendar-dashboard-resource-picker__list">
            {selector.options.map((option) => {
              const checked = draft.includes(option.id)
              return <label key={option.id}><input type="checkbox" checked={checked} onChange={() => setDraft((current) => checked ? current.filter((id) => id !== option.id) : current.length < 3 ? [...current, option.id] : current)} /><span>{option.label}</span></label>
            })}
          </div>
          <div className="calendar-dashboard-resource-picker__actions"><button type="button" className="calendar-dashboard-link-button" onClick={() => { setDraft(selector.selectedIds); setOpen(false) }}>Prekliči</button><button type="button" className="calendar-dashboard-primary-small" disabled={draft.length !== Math.min(3, selector.options.length)} onClick={() => { selector.onChange(draft); setOpen(false) }}>Uporabi</button></div>
        </div>
      ) : null}
    </div>
  )
}

function UnassignedBookingsPicker({ selector, locale }: { selector: UnassignedSelector; locale: string }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<UnassignedBookingDimension[]>(selector.selected)
  useEffect(() => setDraft(selector.selected), [selector.selected])

  const copy = locale === 'sl'
    ? {
        title: 'Nedodeljeni termini',
        help: 'Prikažite termine brez dodeljenega zaposlenega, prostora ali obojega.',
        consultant: 'Brez dodeljenega zaposlenega',
        space: 'Brez dodeljenega prostora',
        cancel: 'Prekliči',
        apply: 'Uporabi',
        clear: 'Počisti',
      }
    : locale === 'sr'
      ? {
          title: 'Nedodeljeni termini',
          help: 'Prikažite termine bez dodeljenog zaposlenog, prostora ili oboje.',
          consultant: 'Bez dodeljenog zaposlenog',
          space: 'Bez dodeljenog prostora',
          cancel: 'Otkaži',
          apply: 'Primeni',
          clear: 'Očisti',
        }
      : {
          title: 'Unassigned sessions',
          help: 'Show sessions without an assigned employee, space, or either assignment.',
          consultant: 'No assigned employee',
          space: 'No assigned space',
          cancel: 'Cancel',
          apply: 'Apply',
          clear: 'Clear',
        }

  const toggle = (dimension: UnassignedBookingDimension) => {
    setDraft((current) => current.includes(dimension)
      ? current.filter((item) => item !== dimension)
      : [...current, dimension])
  }
  const active = selector.selected.length > 0

  return (
    <div className="calendar-dashboard-resource-picker calendar-dashboard-unassigned-picker">
      <button
        type="button"
        className={`calendar-dashboard-secondary-button calendar-dashboard-unassigned-picker__trigger${active ? ' is-active' : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="users" size={16} />
        {copy.title}{active ? ` (${selector.selected.length})` : ''}
      </button>
      {open ? (
        <div className="calendar-dashboard-resource-picker__popover calendar-dashboard-unassigned-picker__popover">
          <strong>{copy.title}</strong>
          <p>{copy.help}</p>
          <div className="calendar-dashboard-resource-picker__list">
            {selector.showConsultant ? (
              <label>
                <input type="checkbox" checked={draft.includes('consultant')} onChange={() => toggle('consultant')} />
                <span>{copy.consultant}</span>
              </label>
            ) : null}
            {selector.showSpace ? (
              <label>
                <input type="checkbox" checked={draft.includes('space')} onChange={() => toggle('space')} />
                <span>{copy.space}</span>
              </label>
            ) : null}
          </div>
          <div className="calendar-dashboard-resource-picker__actions calendar-dashboard-unassigned-picker__actions">
            {active ? (
              <button type="button" className="calendar-dashboard-link-button" onClick={() => { selector.onChange([]); setDraft([]); setOpen(false) }}>{copy.clear}</button>
            ) : null}
            <button type="button" className="calendar-dashboard-link-button" onClick={() => { setDraft(selector.selected); setOpen(false) }}>{copy.cancel}</button>
            <button type="button" className="calendar-dashboard-primary-small" disabled={draft.length === 0} onClick={() => { selector.onChange(draft); setOpen(false) }}>{copy.apply}</button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function CalendarDashboard(props: CalendarDashboardProps) {
  const {
    locale, user, selectedDate, selectedSession, bookings, settings, todosEnabled, waitlistEnabled,
    canIssueOpenInvoice, canIssueAdvanceInvoice, visibleConsultantIds = [], visibleSpaceIds = [], resourceSelector, unassignedSelector,
    onOpenClient, onOpenTodo, onEditSession, onOpenFullOpenBill, onOpenFullAdvance, onRefreshCalendar,
  } = props
  const navigate = useNavigate()
  const { showToast } = useToast()
  const selectedUnassignedDimensions = unassignedSelector?.selected
  const availableBlocks = useMemo(
    () => ALL_BLOCKS.filter((block) => waitlistEnabled || block.key !== 'waitlist'),
    [waitlistEnabled],
  )
  const [visibleBlocks, setVisibleBlocks] = useState<DashboardBlockKey[]>(() => readVisibleBlocks(user))
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [customizeDraft, setCustomizeDraft] = useState<DashboardBlockKey[]>(visibleBlocks)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [todos, setTodos] = useState<any[]>([])
  const [waitlist, setWaitlist] = useState<any[]>([])
  const [services, setServices] = useState<BillingService[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const quickPaymentMethods = useMemo(() => paymentMethods.filter((method) => {
    if (isAdvancePaymentMethod(method)) return false
    if (settings.BILLING_ONLINE_CARD_PAYMENTS_ENABLED === 'false' && isStripePaymentMethod(method)) return false
    return true
  }), [paymentMethods, settings.BILLING_ONLINE_CARD_PAYMENTS_ENABLED])
  const [openBills, setOpenBills] = useState<any[]>([])
  const [billingLoading, setBillingLoading] = useState(false)
  const [billingSaving, setBillingSaving] = useState<'open' | 'advance' | null>(null)
  const clients = useMemo(() => normalizeClients(selectedSession), [selectedSession])
  const statuses = useMemo(() => normalizeStatuses(selectedSession, clients), [selectedSession, clients])
  const [payerClientId, setPayerClientId] = useState<number | null>(null)
  const selectedClient = clients.find((client: any) => Number(client?.id) === Number(payerClientId)) || clients[0] || null
  const selectedStatus = statuses.find((status: any) => Number(status?.clientId) === Number(selectedClient?.id)) || statuses[0] || null
  const sourceBookingId = Number(selectedStatus?.bookingId ?? selectedSession?.id ?? 0) || null
  const advanceServiceIds = useMemo(() => new Set(String(settings.ADVANCE_DEDUCTION_TRANSACTION_SERVICE_ID || '').split(',').map((part) => Number(part.trim())).filter((id) => Number.isInteger(id) && id > 0)), [settings.ADVANCE_DEDUCTION_TRANSACTION_SERVICE_ID])
  const advanceServices = useMemo(() => services.filter((service) => advanceServiceIds.has(Number(service.id))), [advanceServiceIds, services])
  const normalServices = useMemo(() => services.filter((service) => service.active !== false && !advanceServiceIds.has(Number(service.id))), [advanceServiceIds, services])

  const findOpenBill = useCallback(() => {
    const explicitId = Number(selectedStatus?.openBillId || 0)
    if (explicitId > 0) {
      const exact = openBills.find((bill) => Number(bill?.id) === explicitId)
      if (exact) return exact
    }
    const candidateIds = new Set([Number(sourceBookingId || 0), Number(selectedSession?.id || 0)].filter((id) => id > 0))
    return openBills.find((bill) => candidateIds.has(Number(bill?.sessionId || 0)) || (Array.isArray(bill?.items) && bill.items.some((item: any) => candidateIds.has(Number(item?.sourceSessionBookingId || 0))))) || null
  }, [openBills, selectedSession?.id, selectedStatus?.openBillId, sourceBookingId])
  const activeOpenBill = findOpenBill()

  const [openBillDraft, setOpenBillDraft] = useState<BillingDraft>({ rows: [], discountType: 'PERCENT', discountValue: '', paymentMethodId: null })
  const [advanceDraft, setAdvanceDraft] = useState<BillingDraft>({ rows: [], discountType: 'PERCENT', discountValue: '', paymentMethodId: null })

  const loadNotifications = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications', { params: { category: 'ALL', limit: 8 } })
      setNotifications(Array.isArray(data?.items) ? data.items : [])
    } catch {
      // Keep the previous list on transient failures.
    }
  }, [])

  const loadTodos = useCallback(async () => {
    if (!todosEnabled || !selectedDate) { setTodos([]); return }
    try {
      const [overdueResult, dayResult] = await Promise.all([
        api.get('/bookings/todos/overdue').catch(() => ({ data: [] })),
        api.get('/bookings/calendar', { params: { from: selectedDate, to: selectedDate } }).catch(() => ({ data: {} })),
      ])
      const merged = [...(Array.isArray(overdueResult.data) ? overdueResult.data : []), ...(Array.isArray(dayResult.data?.todos) ? dayResult.data.todos : [])]
      const byId = new Map<number, any>()
      merged.forEach((todo) => { const id = Number(todo?.id || 0); if (id > 0) byId.set(id, todo) })
      setTodos(Array.from(byId.values()).sort((a, b) => dateTimeMs(a?.startTime) - dateTimeMs(b?.startTime)))
    } catch {
      setTodos([])
    }
  }, [selectedDate, todosEnabled])

  const loadWaitlist = useCallback(async () => {
    if (!waitlistEnabled || !selectedDate) { setWaitlist([]); return }
    try {
      const { data } = await api.get('/waitlists', { params: { view: 'ACTIVE', dateFrom: selectedDate, dateTo: selectedDate } })
      const list = Array.isArray(data) ? data : []
      setWaitlist([...list].sort((a, b) => dateTimeMs(a?.joinedAt) - dateTimeMs(b?.joinedAt)))
    } catch {
      setWaitlist([])
    }
  }, [selectedDate, waitlistEnabled])

  const loadBilling = useCallback(async () => {
    if (settings.BILLING_ENABLED === 'false') return
    setBillingLoading(true)
    try {
      const [servicesResult, paymentMethodsResult, openBillsResult] = await Promise.all([
        api.get('/billing/services').catch(() => ({ data: [] })),
        api.get('/billing/payment-methods').catch(() => ({ data: [] })),
        api.get('/billing/open-bills', { params: { size: 500 } }).catch(() => ({ data: [] })),
      ])
      setServices(Array.isArray(servicesResult.data) ? servicesResult.data : [])
      setPaymentMethods(Array.isArray(paymentMethodsResult.data) ? paymentMethodsResult.data : [])
      setOpenBills(Array.isArray(openBillsResult.data) ? openBillsResult.data : [])
    } finally {
      setBillingLoading(false)
    }
  }, [settings.BILLING_ENABLED])

  useEffect(() => {
    void loadNotifications()
    const unsubscribe = subscribeBookingUpdates(() => void loadNotifications())
    const timer = window.setInterval(() => void loadNotifications(), 60_000)
    return () => { unsubscribe(); window.clearInterval(timer) }
  }, [loadNotifications])
  useEffect(() => { void loadTodos() }, [loadTodos])
  useEffect(() => { void loadWaitlist() }, [loadWaitlist])
  useEffect(() => { void loadBilling() }, [loadBilling])
  useEffect(() => {
    const refresh = () => { void loadTodos(); void loadNotifications() }
    window.addEventListener('todos-updated', refresh)
    return () => window.removeEventListener('todos-updated', refresh)
  }, [loadNotifications, loadTodos])

  useEffect(() => {
    const firstClientId = Number(clients[0]?.id || 0)
    setPayerClientId(firstClientId > 0 ? firstClientId : null)
  }, [selectedSession?.id, clients])

  useEffect(() => {
    const bill = activeOpenBill
    if (!bill) {
      const fallbackService = normalServices[0]
      setOpenBillDraft({ rows: fallbackService ? [makeRow(fallbackService, sourceBookingId)] : [], discountType: 'PERCENT', discountValue: '', paymentMethodId: quickPaymentMethods[0]?.id ?? null })
      return
    }
    const rows = Array.isArray(bill.items) ? bill.items.map((item: any) => ({
      key: `open-${item?.id ?? Math.random()}`,
      transactionServiceId: Number(item?.transactionService?.id || 0),
      quantity: Math.max(1, Number(item?.quantity || 1)),
      grossPrice: String(parseNumber(item?.grossPrice).toFixed(2)),
      sourceSessionBookingId: item?.sourceSessionBookingId ?? sourceBookingId,
      sourceAdvanceBillId: item?.sourceAdvanceBillId ?? null,
    })) : []
    const percent = parseNumber(bill?.wholeBillDiscountPercent)
    const amount = parseNumber(bill?.discountValue)
    const existingPaymentMethodId = Number(bill?.paymentMethod?.id || 0)
    const quickPaymentMethodId = quickPaymentMethods.some((method) => Number(method.id) === existingPaymentMethodId)
      ? existingPaymentMethodId
      : Number(quickPaymentMethods[0]?.id || 0)
    setOpenBillDraft({
      rows: rows.length ? rows : (normalServices[0] ? [makeRow(normalServices[0], sourceBookingId)] : []),
      discountType: percent > 0 ? 'PERCENT' : 'AMOUNT',
      discountValue: String(percent > 0 ? percent : amount > 0 ? amount : ''),
      paymentMethodId: quickPaymentMethodId || null,
    })
  }, [activeOpenBill?.id, activeOpenBill?.items, activeOpenBill?.wholeBillDiscountPercent, activeOpenBill?.discountValue, normalServices, quickPaymentMethods, sourceBookingId])

  useEffect(() => {
    const first = advanceServices[0]
    const requestedGross = Math.max(0, parseNumber(selectedStatus?.pendingGross ?? selectedStatus?.sessionTotalGross ?? selectedSession?.price ?? selectedSession?.totalGross))
    setAdvanceDraft({ rows: first ? [makeRow(first, sourceBookingId, requestedGross || serviceGross(first))] : [], discountType: 'PERCENT', discountValue: '', paymentMethodId: quickPaymentMethods[0]?.id ?? null })
  }, [advanceServices, quickPaymentMethods, selectedSession?.id, selectedSession?.price, selectedSession?.totalGross, selectedStatus?.pendingGross, selectedStatus?.sessionTotalGross, sourceBookingId])

  const filteredDayBookings = useMemo(() => {
    const consultantSet = new Set(visibleConsultantIds.map(Number))
    const spaceSet = new Set(visibleSpaceIds.map(Number))
    const unassignedDimensions = selectedUnassignedDimensions ?? []
    return (Array.isArray(bookings) ? bookings : []).filter((booking: any) => {
      if (booking?.kind && booking.kind !== 'booked') return false
      if (localDateKey(booking?.startTime ?? booking?.start) !== selectedDate) return false
      if (!bookingMatchesUnassignedDimensions(booking, unassignedDimensions)) return false
      const consultantId = Number(booking?.consultant?.id ?? booking?.consultantId ?? 0)
      const spaceId = Number(booking?.space?.id ?? booking?.spaceId ?? 0)
      if (consultantSet.size > 0 && !consultantSet.has(consultantId)) return false
      if (spaceSet.size > 0 && !spaceSet.has(spaceId)) return false
      return true
    })
  }, [bookings, selectedDate, selectedUnassignedDimensions, visibleConsultantIds, visibleSpaceIds])

  const analytics = useMemo(() => {
    const unique = new Map<number | string, any>()
    filteredDayBookings.forEach((booking: any, index) => unique.set(booking?.id ?? `${booking?.startTime}-${index}`, booking))
    const rows = Array.from(unique.values())
    const minutes = rows.reduce((sum, booking) => {
      const start = dateTimeMs(booking?.startTime ?? booking?.start)
      const end = dateTimeMs(booking?.endTime ?? booking?.end)
      return sum + (start && end && end > start ? (end - start) / 60000 : 0)
    }, 0)
    const resourceCount = Math.max(1, visibleConsultantIds.length || visibleSpaceIds.length || 1)
    const workingMinutes = 13 * 60 * resourceCount
    const gross = rows.reduce((sum, booking) => sum + Math.max(0, parseNumber(booking?.totalGross ?? booking?.sessionTotalGross ?? booking?.price ?? booking?.grossPrice)), 0)
    const net = rows.reduce((sum, booking) => {
      const explicit = parseNumber(booking?.totalNet ?? booking?.sessionTotalNet ?? booking?.netPrice)
      return sum + (explicit > 0 ? explicit : Math.max(0, parseNumber(booking?.totalGross ?? booking?.sessionTotalGross ?? booking?.price)) / 1.22)
    }, 0)
    return { count: rows.length, minutes, occupancy: workingMinutes > 0 ? Math.min(100, Math.round(minutes / workingMinutes * 100)) : 0, gross, net }
  }, [filteredDayBookings, visibleConsultantIds.length, visibleSpaceIds.length])

  const upcomingBookings = useMemo(() => [...filteredDayBookings].sort((a, b) => dateTimeMs(a?.startTime ?? a?.start) - dateTimeMs(b?.startTime ?? b?.start)).slice(0, 5), [filteredDayBookings])

  const completeTodo = async (todoId: number) => {
    try {
      await api.patch(`/bookings/todos/${todoId}/completion`, { completed: true })
      setTodos((current) => current.filter((todo) => Number(todo?.id) !== todoId))
      window.dispatchEvent(new CustomEvent('todos-updated'))
      showToast('success', locale === 'sl' ? 'Opravilo je označeno kot zaključeno.' : 'Task completed.')
      await onRefreshCalendar()
    } catch (error: any) {
      showToast('error', error?.response?.data?.message || (locale === 'sl' ? 'Opravila ni bilo mogoče zaključiti.' : 'Could not complete task.'))
    }
  }

  const openNotification = async (item: NotificationItem) => {
    if (item.unread) {
      setNotifications((current) => current.map((entry) => entry.key === item.key ? { ...entry, unread: false } : entry))
      void api.put(`/notifications/${encodeURIComponent(item.key)}/read`).catch(() => undefined)
    }
    if (item.actionUrl) navigate(item.actionUrl)
  }

  const createOpenBill = async () => {
    if (!sourceBookingId) return null
    const { data } = await api.post(`/billing/open-bills/session/${sourceBookingId}`, null, { params: { selectedOnly: true } })
    await loadBilling()
    return data
  }

  const lineSubtotal = (draft: BillingDraft) => draft.rows.reduce((sum, row) => sum + Math.max(1, Number(row.quantity || 1)) * Math.max(0, parseNumber(row.grossPrice)), 0)
  const discountBreakdown = (draft: BillingDraft) => {
    const subtotal = lineSubtotal(draft)
    const raw = Math.max(0, parseNumber(draft.discountValue))
    const discountAmountGross = draft.discountType === 'PERCENT'
      ? subtotal * Math.min(100, raw) / 100
      : Math.min(subtotal, raw)
    const wholeBillDiscountPercent = subtotal > 0
      ? Math.min(100, discountAmountGross / subtotal * 100)
      : 0
    return {
      subtotal,
      discountAmountGross: Number(discountAmountGross.toFixed(2)),
      discountedTotalGross: Math.max(0, Number((subtotal - discountAmountGross).toFixed(2))),
      wholeBillDiscountPercent: Number(wholeBillDiscountPercent.toFixed(4)),
    }
  }
  const discountedTotal = (draft: BillingDraft) => discountBreakdown(draft).discountedTotalGross
  const discountPayload = (draft: BillingDraft) => {
    const breakdown = discountBreakdown(draft)
    return {
      // The billing backend stores the whole-bill discount as a percentage. Converting
      // a fixed € amount to its equivalent percentage keeps the quick editor total exact.
      discountType: 'PERCENT',
      discountValue: breakdown.wholeBillDiscountPercent,
      discountAmountGross: breakdown.discountAmountGross,
      discountedTotalGross: breakdown.discountedTotalGross,
      discountItemIndex: null,
      wholeBillDiscountPercent: breakdown.wholeBillDiscountPercent,
      itemDiscounts: [],
    }
  }
  const linePayload = (row: BillingRow) => {
    const service = services.find((item) => Number(item.id) === Number(row.transactionServiceId))
    const gross = Math.max(0, parseNumber(row.grossPrice))
    const net = gross / (1 + taxMultiplier(service?.taxRate))
    return {
      transactionServiceId: Number(row.transactionServiceId), quantity: Math.max(1, Number(row.quantity || 1)),
      netPrice: Number(net.toFixed(4)), grossPrice: Number(gross.toFixed(4)),
      sourceSessionBookingId: row.sourceSessionBookingId ?? sourceBookingId,
      sourceAdvanceBillId: row.sourceAdvanceBillId ?? null,
    }
  }

  const closeOpenBill = async () => {
    if (!selectedSession || !selectedClient || !sourceBookingId) return
    if (!canIssueOpenInvoice) { showToast('error', 'Nimate dovoljenja za izdajo računov.'); return }
    if (!openBillDraft.paymentMethodId) { showToast('error', 'Izberite način plačila.'); return }
    if (openBillDraft.rows.length === 0 || openBillDraft.rows.some((row) => !row.transactionServiceId)) { showToast('error', 'Dodajte vsaj eno veljavno postavko.'); return }
    setBillingSaving('open')
    try {
      const bill = activeOpenBill || await createOpenBill()
      const billId = Number(bill?.id || 0)
      if (!billId) throw new Error('Open bill could not be prepared.')
      const total = discountedTotal(openBillDraft)
      await api.put(`/billing/open-bills/${billId}`, {
        paymentMethodId: openBillDraft.paymentMethodId,
        clientId: Number(selectedClient.id),
        consultantId: Number(selectedSession?.consultant?.id ?? user?.id ?? 0) || null,
        sessionId: sourceBookingId,
        ...discountPayload(openBillDraft),
        paymentSplits: [{ paymentMethodId: openBillDraft.paymentMethodId, amountGross: total }],
        items: openBillDraft.rows.map(linePayload),
      })
      await api.post(`/billing/open-bills/${billId}/create-bill`)
      showToast('success', 'Račun je bil uspešno zaključen.')
      await Promise.all([loadBilling(), onRefreshCalendar()])
    } catch (error: any) {
      showToast('error', error?.response?.data?.message || error?.response?.data?.detail || 'Računa ni bilo mogoče zaključiti.')
    } finally {
      setBillingSaving(null)
    }
  }

  const createAdvance = async () => {
    if (!selectedSession || !selectedClient || !sourceBookingId) return
    if (!canIssueAdvanceInvoice) { showToast('error', 'Nimate dovoljenja za izdajo predplačil.'); return }
    if (settings.BILLING_ADVANCE_ENABLED === 'false') { showToast('error', 'Predplačila za to podjetje niso omogočena.'); return }
    if (!advanceDraft.paymentMethodId) { showToast('error', 'Izberite način plačila.'); return }
    if (advanceDraft.rows.length === 0 || advanceDraft.rows.some((row) => !advanceServiceIds.has(Number(row.transactionServiceId)))) { showToast('error', 'Za predplačilo izberite konfigurirano postavko predplačila.'); return }
    setBillingSaving('advance')
    try {
      const total = discountedTotal(advanceDraft)
      await api.post('/billing/bills', {
        clientId: Number(selectedClient.id),
        consultantId: Number(selectedSession?.consultant?.id ?? user?.id ?? 0) || null,
        paymentMethodId: advanceDraft.paymentMethodId,
        paymentSplits: [{ paymentMethodId: advanceDraft.paymentMethodId, amountGross: total }],
        billingTarget: 'PERSON',
        billType: 'ADVANCE',
        sessionId: sourceBookingId,
        ...discountPayload(advanceDraft),
        items: advanceDraft.rows.map((row) => { const payload = linePayload(row); delete (payload as any).sourceAdvanceBillId; return payload }),
      })
      showToast('success', 'Predplačilo je bilo uspešno ustvarjeno.')
      await Promise.all([loadBilling(), onRefreshCalendar()])
    } catch (error: any) {
      showToast('error', error?.response?.data?.message || error?.response?.data?.detail || 'Predplačila ni bilo mogoče ustvariti.')
    } finally {
      setBillingSaving(null)
    }
  }

  const saveCustomization = () => {
    const next = availableBlocks.map((block) => block.key).filter((key) => customizeDraft.includes(key))
    setVisibleBlocks(next)
    window.localStorage.setItem(dashboardStorageKey(user), JSON.stringify(next))
    setCustomizeOpen(false)
  }
  const blockVisible = (key: DashboardBlockKey) => visibleBlocks.includes(key)
  const selectedDateLabel = useMemo(() => {
    const date = new Date(`${selectedDate}T12:00:00`)
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale === 'sl' ? 'sl-SI' : locale === 'sr' ? 'sr-RS' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date) : selectedDate
  }, [locale, selectedDate])

  return (
    <aside className="calendar-day-dashboard" aria-label="Nadzorna plošča koledarja">
      <div className="calendar-day-dashboard__scroll">
        <header className="calendar-day-dashboard__top">
          <div><h2><Icon name="pulse" size={22} /> Pregled dneva</h2><p>Pregled dneva in pomembnih informacij na enem mestu.</p></div>
          <div className="calendar-day-dashboard__top-actions">{unassignedSelector ? <UnassignedBookingsPicker selector={unassignedSelector} locale={locale} /> : null}{resourceSelector ? <ResourcePicker selector={resourceSelector} /> : null}<button type="button" className="calendar-dashboard-customize-button" onClick={() => { setCustomizeDraft(visibleBlocks); setCustomizeOpen(true) }}><Icon name="settings" size={17} /> Prilagodi pregled</button></div>
        </header>

        {blockVisible('analytics') ? (
          <section className="calendar-dashboard-analytics">
            <div className="calendar-dashboard-analytics__date"><span>Izbran datum</span><strong>{selectedDateLabel}</strong></div>
            <div className="calendar-dashboard-stat"><span className="calendar-dashboard-stat__icon tone-blue"><Icon name="calendar" /></span><div><strong>{analytics.count}</strong><span>Terminov danes</span></div></div>
            <div className="calendar-dashboard-stat"><span className="calendar-dashboard-stat__icon tone-green"><Icon name="clock" /></span><div><strong>{analytics.occupancy}%</strong><span>Zasedenost · {Math.round(analytics.minutes / 60 * 10) / 10} h</span></div></div>
            <div className="calendar-dashboard-stat"><span className="calendar-dashboard-stat__icon tone-purple"><Icon name="euro" /></span><div><strong>{formatMoney(analytics.gross, locale)}</strong><span>Prihodki bruto</span></div></div>
            <div className="calendar-dashboard-stat"><span className="calendar-dashboard-stat__icon tone-orange"><Icon name="euro" /></span><div><strong>{formatMoney(analytics.net, locale)}</strong><span>Prihodki neto</span></div></div>
          </section>
        ) : null}

        <div className="calendar-day-dashboard__grid">
          {blockVisible('tasks') ? <DashboardCard title="Opravila" icon="checkSquare" action={<button type="button" className="calendar-dashboard-link-button" onClick={() => navigate('/calendar/new/todo')}><Icon name="plus" size={15} /> Novo opravilo</button>}>
            {todos.length === 0 ? <EmptyState>Ni zamujenih ali današnjih opravil.</EmptyState> : <div className="calendar-dashboard-list">{todos.slice(0, 6).map((todo) => { const overdue = dateTimeMs(todo?.startTime) > 0 && dateTimeMs(todo?.startTime) < Date.now(); return <div className={`calendar-dashboard-task-row${overdue ? ' is-overdue' : ''}`} key={todo.id}><button type="button" className="calendar-dashboard-task-check" onClick={() => void completeTodo(Number(todo.id))} aria-label="Označi kot opravljeno"><span /></button><button type="button" className="calendar-dashboard-row-main" onClick={() => onOpenTodo(Number(todo.id))}><strong>{todo?.task || 'Opravilo'}</strong><span>{overdue ? 'Zamujeno · ' : ''}{timeLabel(todo?.startTime, locale)}</span></button>{overdue ? <span className="calendar-dashboard-status-dot tone-red">Zamujeno</span> : <span className="calendar-dashboard-status-dot tone-green">Danes</span>}</div>})}</div>}
          </DashboardCard> : null}

          {blockVisible('notifications') ? <DashboardCard title="Obvestila" icon="bell" action={<button type="button" className="calendar-dashboard-link-button" onClick={() => navigate('/notifications')}>Prikaži vse <Icon name="chevron" size={14} /></button>}>
            {notifications.length === 0 ? <EmptyState>Ni novih obvestil.</EmptyState> : <div className="calendar-dashboard-list">{notifications.slice(0, 6).map((item) => <button type="button" className={`calendar-dashboard-notification-row${item.unread ? ' is-unread' : ''}`} key={item.key} onClick={() => void openNotification(item)}><span className="calendar-dashboard-notification-row__icon"><Icon name={String(item.type).includes('CANCEL') ? 'close' : 'calendar'} size={17} /></span><span className="calendar-dashboard-row-main"><strong>{item.title}</strong><span>{item.message}</span></span><time>{relativeTime(item.createdAt, locale)}</time></button>)}</div>}
          </DashboardCard> : null}

          {blockVisible('clients') ? <DashboardCard title="Stranka" icon="users" action={selectedSession ? <button type="button" className="calendar-dashboard-link-button" onClick={onEditSession}>Uredi termin <Icon name="external" size={14} /></button> : null}>
            {!selectedSession ? <EmptyState>Izberite termin na koledarju za prikaz strank.</EmptyState> : clients.length === 0 ? <EmptyState>Izbrani termin nima povezane stranke.</EmptyState> : <div className="calendar-dashboard-client-list">{clients.map((client: any) => { const name = `${client?.firstName || ''} ${client?.lastName || ''}`.trim() || client?.name || 'Stranka'; return <button type="button" className="calendar-dashboard-client-row" key={client.id} onClick={() => onOpenClient(Number(client.id))}><span className="calendar-dashboard-client-avatar">{initials(name)}</span><span className="calendar-dashboard-row-main"><strong>{name}</strong><span>{client?.phone || client?.email || 'Brez kontaktnih podatkov'}</span></span><Icon name="chevron" size={16} /></button>})}</div>}
          </DashboardCard> : null}

          {waitlistEnabled && blockVisible('waitlist') ? <DashboardCard title="Čakalna vrsta" icon="queue" action={<button type="button" className="calendar-dashboard-link-button" onClick={() => navigate('/appointments')}>Prikaži vse <Icon name="chevron" size={14} /></button>}>
            {waitlist.length === 0 ? <EmptyState>Za izbrani dan ni čakajočih strank.</EmptyState> : <div className="calendar-dashboard-list">{waitlist.slice(0, 6).map((request, index) => <button type="button" className="calendar-dashboard-waitlist-row" key={request.id} onClick={() => navigate(`/appointments?requestId=${request.id}`)}><span className="calendar-dashboard-waitlist-index">{index + 1}.</span><span className="calendar-dashboard-row-main"><strong>{request.clientName}</strong><span>{request.serviceName || request.serviceGroupName || 'Katerakoli storitev'} · {request.windows?.[0]?.timeFrom ? `${String(request.windows[0].timeFrom).slice(0, 5)}–${String(request.windows[0].timeTo || '').slice(0, 5)}` : 'fleksibilno'}</span></span><time>{request.joinedAt ? relativeTime(request.joinedAt, locale) : ''}</time></button>)}</div>}
          </DashboardCard> : null}

          {blockVisible('openBill') ? <DashboardCard title="Odprti račun" icon="receipt" className="calendar-day-dashboard-card--wide" action={selectedSession && activeOpenBill ? <button type="button" className="calendar-dashboard-link-button" onClick={() => onOpenFullOpenBill(selectedStatus, Number(activeOpenBill.id))}>Odpri celoten račun <Icon name="external" size={14} /></button> : null}>
            {!selectedSession ? <EmptyState>Izberite termin na koledarju za pripravo in zaključek odprtega računa.</EmptyState> : settings.BILLING_ENABLED === 'false' ? <EmptyState>Obračunavanje ni omogočeno.</EmptyState> : !canIssueOpenInvoice ? <EmptyState>Nimate dovoljenja za izdajo računov.</EmptyState> : <>
              <div className="calendar-dashboard-billing-context"><label><span>Plačnik</span><DesktopSelect value={selectedClient?.id ?? ''} onChange={(event) => setPayerClientId(Number(event.target.value) || null)}>{clients.map((client: any) => <option value={client.id} key={client.id}>{`${client.firstName || ''} ${client.lastName || ''}`.trim() || client.name}</option>)}</DesktopSelect></label><div><span>Termin</span><strong>{selectedSession?.title || selectedSession?.type?.description || selectedSession?.serviceName || 'Izbrani termin'}</strong></div><div><span>Stanje</span><strong className={activeOpenBill ? 'tone-orange-text' : 'tone-muted-text'}>{activeOpenBill ? `Odprt račun #${activeOpenBill.id}` : 'Račun še ni pripravljen'}</strong></div></div>
              <BillingRowsEditor rows={openBillDraft.rows} services={normalServices} onChange={(rows) => setOpenBillDraft((draft) => ({ ...draft, rows }))} disabled={billingLoading || billingSaving === 'open'} />
              <BillingControls draft={openBillDraft} paymentMethods={quickPaymentMethods} subtotal={lineSubtotal(openBillDraft)} locale={locale} onChange={setOpenBillDraft} disabled={billingLoading || billingSaving === 'open'} />
              <div className="calendar-dashboard-billing-actions">{!activeOpenBill ? <button type="button" className="calendar-dashboard-secondary-button" disabled={billingLoading || billingSaving != null} onClick={() => void createOpenBill().catch((error: any) => showToast('error', error?.response?.data?.message || 'Odprtega računa ni bilo mogoče pripraviti.'))}>Pripravi odprti račun</button> : null}<button type="button" className="calendar-dashboard-primary-button" disabled={billingLoading || billingSaving != null || !openBillDraft.paymentMethodId} onClick={() => void closeOpenBill()}>{billingSaving === 'open' ? 'Zaključujem …' : 'Zaključi račun'}</button></div>
            </>}
          </DashboardCard> : null}

          {blockVisible('advance') ? <DashboardCard title="Predplačilo" icon="wallet" className="calendar-day-dashboard-card--wide" action={selectedSession ? <button type="button" className="calendar-dashboard-link-button" onClick={() => onOpenFullAdvance(selectedStatus, selectedClient)}>Odpri celoten obrazec <Icon name="external" size={14} /></button> : null}>
            {!selectedSession ? <EmptyState>Izberite termin na koledarju za ustvarjanje predplačila.</EmptyState> : settings.BILLING_ADVANCE_ENABLED === 'false' ? <EmptyState>Predplačila niso omogočena.</EmptyState> : !canIssueAdvanceInvoice ? <EmptyState>Nimate dovoljenja za izdajo predplačil.</EmptyState> : advanceServices.length === 0 ? <EmptyState>V nastavitvah ni konfigurirane postavke za predplačilo.</EmptyState> : <>
              <div className="calendar-dashboard-billing-context"><label><span>Plačnik</span><DesktopSelect value={selectedClient?.id ?? ''} onChange={(event) => setPayerClientId(Number(event.target.value) || null)}>{clients.map((client: any) => <option value={client.id} key={client.id}>{`${client.firstName || ''} ${client.lastName || ''}`.trim() || client.name}</option>)}</DesktopSelect></label><div><span>Termin</span><strong>{selectedSession?.title || selectedSession?.type?.description || selectedSession?.serviceName || 'Izbrani termin'}</strong></div><div><span>Predviden znesek</span><strong>{formatMoney(parseNumber(selectedStatus?.pendingGross ?? selectedStatus?.sessionTotalGross), locale)}</strong></div></div>
              <BillingRowsEditor rows={advanceDraft.rows} services={advanceServices} onChange={(rows) => setAdvanceDraft((draft) => ({ ...draft, rows }))} disabled={billingLoading || billingSaving === 'advance'} />
              <BillingControls draft={advanceDraft} paymentMethods={quickPaymentMethods} subtotal={lineSubtotal(advanceDraft)} locale={locale} onChange={setAdvanceDraft} disabled={billingLoading || billingSaving === 'advance'} />
              <div className="calendar-dashboard-billing-actions"><button type="button" className="calendar-dashboard-primary-button" disabled={billingLoading || billingSaving != null || !advanceDraft.paymentMethodId} onClick={() => void createAdvance()}>{billingSaving === 'advance' ? 'Ustvarjam …' : 'Ustvari predplačilo'}</button></div>
            </>}
          </DashboardCard> : null}
        </div>

        {upcomingBookings.length > 0 ? <div className="calendar-day-dashboard__sync-note"><Icon name="calendar" size={14} /> {upcomingBookings.length} terminov na izbrani dan</div> : null}
      </div>

      {customizeOpen ? <div className="calendar-dashboard-customize-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) setCustomizeOpen(false) }}><section className="calendar-dashboard-customize-drawer" role="dialog" aria-modal="true" aria-label="Prilagodi pregled"><header><div><h2>Prilagodi pregled</h2><p>Izberite bloke, ki jih želite prikazati na nadzorni plošči.</p></div><button type="button" className="calendar-dashboard-icon-button" onClick={() => setCustomizeOpen(false)} aria-label="Zapri"><Icon name="close" /></button></header><div className="calendar-dashboard-customize-list">{availableBlocks.map((block) => { const checked = customizeDraft.includes(block.key); return <label className={`calendar-dashboard-customize-option${checked ? ' is-selected' : ''}`} key={block.key}><input type="checkbox" checked={checked} onChange={() => setCustomizeDraft((current) => checked ? current.filter((key) => key !== block.key) : [...current, block.key])} /><span className="calendar-dashboard-customize-option__check"><Icon name="checkSquare" size={17} /></span><span><strong>{block.title}</strong><small>{block.description}</small></span></label>})}</div><footer><button type="button" className="calendar-dashboard-link-button" onClick={() => setCustomizeDraft(availableBlocks.map((block) => block.key))}>Ponastavi privzeti pogled</button><div><button type="button" className="calendar-dashboard-secondary-button" onClick={() => setCustomizeOpen(false)}>Prekliči</button><button type="button" className="calendar-dashboard-primary-button" onClick={saveCustomization}>Shrani pregled</button></div></footer></section></div> : null}
    </aside>
  )
}
