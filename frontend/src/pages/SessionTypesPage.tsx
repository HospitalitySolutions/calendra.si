import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { getStoredUser } from '../auth'
import type { BillingService, SessionType as SessionTypeT, TaxRate } from '../lib/types'
import { taxLabels } from '../lib/types'
import { Card, EmptyState, Field, PageHeader, SectionTitle } from '../components/ui'
import { currency, formatDate } from '../lib/format'
import { useLocale, type AppLocale } from '../locale'
import { getDefaultAllowedRoute } from '../lib/packageAccess'
import { CardsMembershipsSection, type CardsMembershipsSectionHandle } from './CardsMembershipsSection'

const SESSION_TYPES_SUBTAB_TRANSACTION = 'transaction-services'
const SESSION_TYPES_SUBTAB_CARDS = 'cards-memberships'

type TypeServiceLine = { transactionServiceId: number; price: string }

/** Maps to widget + guest-app booleans on the API (see flagsFromGuestBookingMode). */
type GuestBookingMode = 'ALL' | 'WEBSITE' | 'GUEST' | 'DISABLED'

function guestBookingModeFromFlags(widget: boolean, guest: boolean): GuestBookingMode {
  if (widget && guest) return 'ALL'
  if (widget && !guest) return 'WEBSITE'
  if (!widget && guest) return 'GUEST'
  return 'DISABLED'
}

function flagsFromGuestBookingMode(mode: GuestBookingMode): {
  widgetGroupBookingEnabled: boolean
  guestBookingEnabled: boolean
} {
  switch (mode) {
    case 'ALL':
      return { widgetGroupBookingEnabled: true, guestBookingEnabled: true }
    case 'WEBSITE':
      return { widgetGroupBookingEnabled: true, guestBookingEnabled: false }
    case 'GUEST':
      return { widgetGroupBookingEnabled: false, guestBookingEnabled: true }
    case 'DISABLED':
      return { widgetGroupBookingEnabled: false, guestBookingEnabled: false }
  }
}

const GUEST_BOOKING_OPTIONS: { value: GuestBookingMode; label: string; line: string }[] = [
  { value: 'ALL', label: 'ALL', line: 'Website and guest mobile app' },
  { value: 'WEBSITE', label: 'WEBSITE', line: 'Website only' },
  { value: 'GUEST', label: 'GUEST', line: 'Guest mobile app only' },
  { value: 'DISABLED', label: 'DISABLED', line: 'Not bookable by guests' },
]

function guestBookingOptionMeta(mode: GuestBookingMode) {
  return GUEST_BOOKING_OPTIONS.find((o) => o.value === mode) ?? GUEST_BOOKING_OPTIONS[2]
}

/** Same order as the former native `<select>` (see `taxLabels`). */
const TAX_RATE_ORDER: TaxRate[] = ['VAT_0', 'VAT_9_5', 'VAT_22', 'NO_VAT']

const TAX_RATE_LINE_I18N_KEY: Record<Exclude<TaxRate, 'NO_VAT'>, string> = {
  VAT_0: 'sessionTypesTxTaxLineVat0',
  VAT_9_5: 'sessionTypesTxTaxLineVat95',
  VAT_22: 'sessionTypesTxTaxLineVat22',
}

/** Session type timing fields: integers 0–999 (max three digits). */
function clampSessionTypeInt0to999(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(999, Math.floor(n)))
}

function normalizeOptionalParticipantsField(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  const n = Number(t)
  if (!Number.isFinite(n)) return ''
  const x = Math.floor(n)
  if (x < 1) return ''
  return String(Math.min(999, x))
}

type TypeFormState = {
  name: string
  description: string
  durationMinutes: number
  breakMinutes: number
  maxParticipantsPerSession: string
  guestBookingMode: GuestBookingMode
  serviceLines: TypeServiceLine[]
}

function typeFormsEqual(a: TypeFormState, b: TypeFormState): boolean {
  if (a.name !== b.name) return false
  if (a.description !== b.description) return false
  if (a.durationMinutes !== b.durationMinutes) return false
  if (a.breakMinutes !== b.breakMinutes) return false
  if (a.maxParticipantsPerSession.trim() !== b.maxParticipantsPerSession.trim()) return false
  if (a.guestBookingMode !== b.guestBookingMode) return false
  if (a.serviceLines.length !== b.serviceLines.length) return false
  for (let i = 0; i < a.serviceLines.length; i++) {
    if (a.serviceLines[i].transactionServiceId !== b.serviceLines[i].transactionServiceId) return false
    if (a.serviceLines[i].price.trim() !== b.serviceLines[i].price.trim()) return false
  }
  return true
}

type ServiceFormState = {
  code: string
  description: string
  taxRate: TaxRate
  /** Editable gross price; API still stores net. */
  grossPrice: string
  /** Company-wide: only one service may be the advance deduction line (see ADVANCE_DEDUCTION_TRANSACTION_SERVICE_ID). */
  advanceDeduction: boolean
}

function taxRateMultiplier(taxRate: TaxRate): number {
  if (taxRate === 'VAT_22') return 0.22
  if (taxRate === 'VAT_9_5') return 0.095
  return 0
}

function netFromGross(gross: number, taxRate: TaxRate): number {
  if (Number.isNaN(gross)) return 0
  const mult = taxRateMultiplier(taxRate)
  const net = gross / (1 + mult)
  return Math.round(net * 100) / 100
}

function grossPriceStringFromNet(net: number, taxRate: TaxRate): string {
  const g = net * (1 + taxRateMultiplier(taxRate))
  return (Math.round(g * 100) / 100).toFixed(2)
}

function serviceFormsEqual(a: ServiceFormState, b: ServiceFormState): boolean {
  if (a.code !== b.code) return false
  if (a.description !== b.description) return false
  if (a.taxRate !== b.taxRate) return false
  if (a.advanceDeduction !== b.advanceDeduction) return false
  return a.grossPrice.trim() === b.grossPrice.trim()
}

function sessionTypeListCountLabel(count: number, locale: AppLocale): string {
  if (locale !== 'sl') return `${count} ${count === 1 ? 'session type' : 'session types'}`
  const n = Math.abs(count) % 100
  const last = n % 10
  if (n >= 11 && n <= 14) return `${count} tipov storitev`
  if (last === 1) return `${count} tip storitve`
  if (last === 2) return `${count} tipa storitve`
  return `${count} tipov storitev`
}

function transactionServiceListCountLabel(count: number, locale: AppLocale): string {
  if (locale !== 'sl') return `${count} ${count === 1 ? 'service' : 'services'}`
  const n = Math.abs(count) % 100
  const last = n % 10
  if (n >= 11 && n <= 14) return `${count} storitev`
  if (last === 1) return `${count} storitev`
  if (last === 2) return `${count} storitvi`
  if (last === 3 || last === 4) return `${count} storitve`
  return `${count} storitev`
}

function guestCardListCountLabel(count: number, locale: AppLocale): string {
  if (locale !== 'sl') return `${count} ${count === 1 ? 'card' : 'cards'}`
  const n = Math.abs(count) % 100
  const last = n % 10
  if (n >= 11 && n <= 14) return `${count} kartic`
  if (last === 1) return `${count} kartica`
  if (last === 2) return `${count} kartici`
  return `${count} kartic`
}

export function SessionTypesPage() {
  const me = getStoredUser()!
  const isAdmin = me.role === 'ADMIN'
  const { t, locale } = useLocale()
  const [searchParams, setSearchParams] = useSearchParams()
  const showCardsMemberships = searchParams.get('subtab') === SESSION_TYPES_SUBTAB_CARDS
  const showTransactionServices = searchParams.get('subtab') === SESSION_TYPES_SUBTAB_TRANSACTION

  const setSessionTypesSubtab = useCallback(
    (next: 'types' | 'transactionServices' | 'cardsMemberships') => {
      if (next === 'transactionServices') {
        setSearchParams({ subtab: SESSION_TYPES_SUBTAB_TRANSACTION }, { replace: true })
      } else if (next === 'cardsMemberships') {
        setSearchParams({ subtab: SESSION_TYPES_SUBTAB_CARDS }, { replace: true })
      } else {
        setSearchParams({}, { replace: true })
      }
    },
    [setSearchParams],
  )

  const [boot, setBoot] = useState(true)
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [types, setTypes] = useState<SessionTypeT[]>([])
  const [services, setServices] = useState<BillingService[]>([])
  const [editingType, setEditingType] = useState<SessionTypeT | null>(null)
  const [showTypeModal, setShowTypeModal] = useState(false)
  const [editingServiceId, setEditingServiceId] = useState<number | null>(null)
  const [showServiceModal, setShowServiceModal] = useState(false)
  const [serviceForm, setServiceForm] = useState<ServiceFormState>({
    code: '',
    description: '',
    taxRate: 'VAT_22',
    grossPrice: '0.00',
    advanceDeduction: false,
  })
  /** Snapshot when the transaction service modal opens; footer only when dirty. */
  const [serviceFormSnapshot, setServiceFormSnapshot] = useState<ServiceFormState | null>(null)
  const [typeForm, setTypeForm] = useState<TypeFormState>({
    name: '',
    description: '',
    durationMinutes: 60,
    breakMinutes: 0,
    maxParticipantsPerSession: '',
    guestBookingMode: 'GUEST',
    serviceLines: [],
  })
  /** Snapshot when the type modal opens; used to detect edits (footer only when dirty). */
  const [typeFormSnapshot, setTypeFormSnapshot] = useState<TypeFormState | null>(null)
  const [guestBookingPickerOpen, setGuestBookingPickerOpen] = useState(false)
  const guestBookingSelectRef = useRef<HTMLDivElement>(null)
  const [taxRatePickerOpen, setTaxRatePickerOpen] = useState(false)
  const taxRateSelectRef = useRef<HTMLDivElement>(null)
  const sessionTypeDescriptionRef = useRef<HTMLTextAreaElement>(null)

  const [isSessionTypesNarrow, setIsSessionTypesNarrow] = useState(
    () => (typeof window !== 'undefined' ? window.matchMedia('(max-width: 450px)').matches : false),
  )
  const [openTypeMenuId, setOpenTypeMenuId] = useState<number | null>(null)
  const [openServiceMenuId, setOpenServiceMenuId] = useState<number | null>(null)
  const [typeSearch, setTypeSearch] = useState('')
  const [serviceSearch, setServiceSearch] = useState('')
  const [cardSearch, setCardSearch] = useState('')
  const [guestCardsFilteredCount, setGuestCardsFilteredCount] = useState(0)
  const cardsMembershipsRef = useRef<CardsMembershipsSectionHandle>(null)

  const onGuestCardsFilteredCount = useCallback((n: number) => {
    setGuestCardsFilteredCount(n)
  }, [])

  useEffect(() => {
    if (!showCardsMemberships) {
      setCardSearch('')
      setGuestCardsFilteredCount(0)
    }
  }, [showCardsMemberships])

  const taxRateSelectOptions = useMemo(
    () =>
      TAX_RATE_ORDER.map((value) =>
        value === 'NO_VAT'
          ? { value, label: t('sessionTypesTxTaxOptionNoVat'), line: '' as const }
          : { value, label: taxLabels[value], line: t(TAX_RATE_LINE_I18N_KEY[value]) },
      ),
    [t],
  )

  const taxRateOptionSelected = useMemo(
    () => taxRateSelectOptions.find((o) => o.value === serviceForm.taxRate) ?? taxRateSelectOptions[2],
    [taxRateSelectOptions, serviceForm.taxRate],
  )

  const transactionServiceTaxDisplay = useCallback(
    (rate: TaxRate) => (rate === 'NO_VAT' ? t('sessionTypesTxTaxOptionNoVat') : taxLabels[rate]),
    [t],
  )

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 450px)')
    const apply = () => setIsSessionTypesNarrow(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    if (!showTypeModal) setGuestBookingPickerOpen(false)
  }, [showTypeModal])

  useEffect(() => {
    if (!showServiceModal) setTaxRatePickerOpen(false)
  }, [showServiceModal])

  const syncSessionTypeDescriptionHeight = useCallback(() => {
    const el = sessionTypeDescriptionRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  useLayoutEffect(() => {
    if (!showTypeModal) return
    syncSessionTypeDescriptionHeight()
  }, [showTypeModal, typeForm.description, syncSessionTypeDescriptionHeight])

  useEffect(() => {
    if (!guestBookingPickerOpen) return
    const onPointerDown = (e: MouseEvent) => {
      const root = guestBookingSelectRef.current
      if (root && !root.contains(e.target as Node)) setGuestBookingPickerOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGuestBookingPickerOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [guestBookingPickerOpen])

  useEffect(() => {
    if (!taxRatePickerOpen) return
    const onPointerDown = (e: MouseEvent) => {
      const root = taxRateSelectRef.current
      if (root && !root.contains(e.target as Node)) setTaxRatePickerOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTaxRatePickerOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [taxRatePickerOpen])

  useEffect(() => {
    if (openTypeMenuId == null) return
    const onDocPointerDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest('.clients-card-menu-wrap')) return
      setOpenTypeMenuId(null)
    }
    document.addEventListener('mousedown', onDocPointerDown)
    return () => document.removeEventListener('mousedown', onDocPointerDown)
  }, [openTypeMenuId])

  useEffect(() => {
    if (openServiceMenuId == null) return
    const onDocPointerDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest('.clients-card-menu-wrap')) return
      setOpenServiceMenuId(null)
    }
    document.addEventListener('mousedown', onDocPointerDown)
    return () => document.removeEventListener('mousedown', onDocPointerDown)
  }, [openServiceMenuId])

  const load = async () => {
    const [settingsRes, typesRes, servicesRes] = await Promise.all([
      api.get('/settings'),
      api.get('/types').catch(() => ({ data: [] })),
      api.get('/billing/services').catch(() => ({ data: [] })),
    ])
    setSettings(settingsRes.data || {})
    setTypes(typesRes.data || [])
    setServices(servicesRes.data || [])
  }

  useEffect(() => {
    if (!isAdmin) return
    void load().finally(() => setBoot(false))
  }, [isAdmin])

  const filteredTypes = useMemo(() => {
    const q = typeSearch.trim().toLowerCase()
    if (!q) return types
    return types.filter((type) => {
      const linked = (type.linkedServices || [])
        .map((ls) => `${ls.code} ${ls.price != null ? String(ls.price) : ''}`)
        .join(' ')
      const hay = [type.name, type.description ?? '', String(type.id), linked].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [types, typeSearch])

  const filteredServices = useMemo(() => {
    const q = serviceSearch.trim().toLowerCase()
    if (!q) return services
    return services.filter((s) => {
      const taxHay =
        s.taxRate === 'NO_VAT'
          ? `${taxLabels[s.taxRate]} ${t('sessionTypesTxTaxOptionNoVat')}`
          : taxLabels[s.taxRate]
      const hay = [s.code, s.description, String(s.id), taxHay, String(s.netPrice)].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [services, serviceSearch, t])

  const typesModuleEnabled = settings.TYPES_ENABLED !== 'false'

  const isTypeFormDirty = useMemo(() => {
    if (!typeFormSnapshot) return false
    return !typeFormsEqual(typeForm, typeFormSnapshot)
  }, [typeForm, typeFormSnapshot])

  const isServiceFormDirty = useMemo(() => {
    if (!serviceFormSnapshot) return false
    return !serviceFormsEqual(serviceForm, serviceFormSnapshot)
  }, [serviceForm, serviceFormSnapshot])

  const transactionServiceNetComputed = useMemo(
    () => netFromGross(Number(serviceForm.grossPrice), serviceForm.taxRate),
    [serviceForm.grossPrice, serviceForm.taxRate],
  )

  const submitType = async (e: FormEvent) => {
    e.preventDefault()
    if (!isAdmin) return
    if (!isTypeFormDirty) return
    const { widgetGroupBookingEnabled, guestBookingEnabled } = flagsFromGuestBookingMode(typeForm.guestBookingMode)
    const maxParticipantsTrimmed = typeForm.maxParticipantsPerSession.trim()
    const maxParticipantsParsed =
      maxParticipantsTrimmed === ''
        ? null
        : (() => {
            const n = Number(maxParticipantsTrimmed)
            if (!Number.isFinite(n)) return null
            return Math.min(999, Math.max(1, Math.floor(n)))
          })()

    const payload = {
      name: typeForm.name,
      description: typeForm.description,
      durationMinutes: clampSessionTypeInt0to999(typeForm.durationMinutes),
      breakMinutes: clampSessionTypeInt0to999(typeForm.breakMinutes),
      maxParticipantsPerSession: maxParticipantsParsed,
      widgetGroupBookingEnabled,
      guestBookingEnabled,
      services: typeForm.serviceLines.map((l) => ({
        transactionServiceId: l.transactionServiceId,
        price: l.price ? Number(l.price) : null,
      })),
    }
    if (editingType) await api.put(`/types/${editingType.id}`, payload)
    else await api.post('/types', payload)
    setEditingType(null)
    setTypeForm({ name: '', description: '', durationMinutes: 60, breakMinutes: 0, maxParticipantsPerSession: '', guestBookingMode: 'GUEST', serviceLines: [] })
    setTypeFormSnapshot(null)
    setShowTypeModal(false)
    void load()
  }

  const removeType = async (id: number) => {
    if (!isAdmin) return
    if (!window.confirm('Delete this type?')) return
    await api.delete(`/types/${id}`)
    void load()
  }

  const serviceSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!isAdmin) return
    if (!isServiceFormDirty) return
    const netPrice = netFromGross(Number(serviceForm.grossPrice), serviceForm.taxRate)
    const payload = {
      code: serviceForm.code,
      description: serviceForm.description,
      taxRate: serviceForm.taxRate,
      netPrice,
    }
    const wasAdvance = serviceFormSnapshot?.advanceDeduction === true
    const wantAdvance = serviceForm.advanceDeduction === true

    let savedId: number
    if (editingServiceId) {
      await api.put(`/billing/services/${editingServiceId}`, payload)
      savedId = editingServiceId
    } else {
      const { data } = await api.post<{ id: number }>('/billing/services', payload)
      savedId = data.id
    }

    const prevSettingId = (settings.ADVANCE_DEDUCTION_TRANSACTION_SERVICE_ID || '').trim()

    if (wantAdvance) {
      const { data: nextSettings } = await api.put<Record<string, string>>('/settings', {
        ADVANCE_DEDUCTION_TRANSACTION_SERVICE_ID: String(savedId),
      })
      setSettings(nextSettings)
    } else if (wasAdvance && prevSettingId === String(savedId)) {
      const { data: nextSettings } = await api.put<Record<string, string>>('/settings', {
        ADVANCE_DEDUCTION_TRANSACTION_SERVICE_ID: '',
      })
      setSettings(nextSettings)
    }

    setEditingServiceId(null)
    setServiceForm({ code: '', description: '', taxRate: 'VAT_22', grossPrice: '0.00', advanceDeduction: false })
    setServiceFormSnapshot(null)
    setShowServiceModal(false)
    void load()
  }

  const deleteService = async (id: number) => {
    if (!isAdmin) return
    if (!window.confirm('Delete this transaction service?')) return
    await api.delete(`/billing/services/${id}`)
    const prevSettingId = (settings.ADVANCE_DEDUCTION_TRANSACTION_SERVICE_ID || '').trim()
    if (prevSettingId === String(id)) {
      const { data: nextSettings } = await api.put<Record<string, string>>('/settings', {
        ADVANCE_DEDUCTION_TRANSACTION_SERVICE_ID: '',
      })
      setSettings(nextSettings)
    }
    void load()
  }

  if (!isAdmin) {
    return <Navigate to={getDefaultAllowedRoute(me.packageType)} replace />
  }

  if (boot) {
    return <div className="stack gap-lg" aria-busy="true" />
  }

  const openTypeEdit = (type: SessionTypeT) => {
    setEditingType(type)
    const next: TypeFormState = {
      name: type.name,
      description: type.description || '',
      durationMinutes: clampSessionTypeInt0to999(type.durationMinutes ?? 60),
      breakMinutes: clampSessionTypeInt0to999(type.breakMinutes ?? 0),
      maxParticipantsPerSession:
        type.maxParticipantsPerSession != null && Number(type.maxParticipantsPerSession) >= 1
          ? normalizeOptionalParticipantsField(String(type.maxParticipantsPerSession))
          : '',
      guestBookingMode: guestBookingModeFromFlags(
        type.widgetGroupBookingEnabled === true,
        type.guestBookingEnabled !== false,
      ),
      serviceLines: (type.linkedServices || []).map((ls) => ({
        transactionServiceId: ls.transactionServiceId,
        price: ls.price != null ? String(ls.price) : '',
      })),
    }
    setTypeForm(next)
    setTypeFormSnapshot({
      ...next,
      serviceLines: next.serviceLines.map((l) => ({ ...l })),
    })
    setShowTypeModal(true)
    setOpenTypeMenuId(null)
  }

  const openServiceEdit = (s: BillingService) => {
    setEditingServiceId(s.id)
    const advanceId = (settings.ADVANCE_DEDUCTION_TRANSACTION_SERVICE_ID || '').trim()
    const next: ServiceFormState = {
      code: s.code,
      description: s.description,
      taxRate: s.taxRate,
      grossPrice: grossPriceStringFromNet(Number(s.netPrice), s.taxRate),
      advanceDeduction: advanceId !== '' && advanceId === String(s.id),
    }
    setServiceForm(next)
    setServiceFormSnapshot({ ...next })
    setShowServiceModal(true)
    setOpenServiceMenuId(null)
  }

  if (!typesModuleEnabled && !showTransactionServices && !showCardsMemberships) {
    return <Navigate to="/configuration" replace />
  }

  const typesPanelBody =
    types.length === 0 ? (
      <EmptyState title={t('sessionTypesEmptyTypesTitle')} text={t('sessionTypesEmptyTypesText')} />
    ) : filteredTypes.length === 0 ? (
      <EmptyState title={t('calendarFilterSearchNoResults')} text={t('sessionTypesSearchNoMatchesText')} />
    ) : (
      <div className="clients-list-shell">
        <div className="clients-mobile-list">
          {filteredTypes.map((type) => {
            const linkedSummary =
              !type.linkedServices || type.linkedServices.length === 0
                ? '—'
                : type.linkedServices
                    .map((ls) => `${ls.code}${ls.price != null ? ` (${currency(ls.price)})` : ''}`)
                    .join(', ')
            return (
              <article
                key={type.id}
                className="clients-mobile-card"
                role="button"
                tabIndex={0}
                onClick={() => openTypeEdit(type)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openTypeEdit(type)
                  }
                }}
              >
                <div className="clients-mobile-card-head">
                  <div className="clients-name-cell">
                    <div className="clients-name-stack">
                      <span className="clients-name">{type.name}</span>
                      <span className="clients-id">ID #{type.id}</span>
                    </div>
                  </div>
                  <div className="clients-card-menu-wrap">
                    <button
                      type="button"
                      className="secondary clients-card-menu-trigger"
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenTypeMenuId((prev) => (prev === type.id ? null : type.id))
                      }}
                      aria-label="Session type actions"
                      aria-expanded={openTypeMenuId === type.id}
                    >
                      ...
                    </button>
                    {openTypeMenuId === type.id && (
                      <div className="clients-card-menu-popover" role="dialog" aria-label="Session type actions">
                        <button
                          type="button"
                          className="danger"
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenTypeMenuId(null)
                            void removeType(type.id)
                          }}
                        >
                          {t('formDelete')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="clients-mobile-meta">
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span>{t('sessionTypesCardLabelDescription')}</span>
                    <strong>{type.description?.trim() ? type.description : '—'}</strong>
                  </div>
                  <div>
                    <span>{t('sessionTypesCardLabelDuration')}</span>
                    <strong>{type.durationMinutes ?? 60} min</strong>
                  </div>
                  <div>
                    <span>{t('sessionTypesCardLabelBreak')}</span>
                    <strong>{type.breakMinutes ?? 0} min</strong>
                  </div>
                  <div>
                    <span>Group max participants</span>
                    <strong>{type.maxParticipantsPerSession ?? '—'}</strong>
                  </div>
                  <div>
                    <span>Guest booking</span>
                    <strong>
                      {guestBookingModeFromFlags(
                        type.widgetGroupBookingEnabled === true,
                        type.guestBookingEnabled !== false,
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>{t('sessionTypesCardLabelServices')}</span>
                    <strong title={linkedSummary === '—' ? undefined : linkedSummary}>{linkedSummary}</strong>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
        <div className="simple-table-wrap clients-table-wrap clients-table-desktop session-types-table-wrap">
          <table className="clients-table session-types-table">
            <thead>
              <tr>
                <th>{t('employeesTableName')}</th>
                <th>{t('sessionTypesCardLabelDescription')}</th>
                <th>{t('sessionTypesCardLabelDuration')}</th>
                <th>{t('sessionTypesCardLabelBreak')}</th>
                <th>Group max participants</th>
                <th>Guest booking</th>
                <th>{t('sessionTypesCardLabelServices')}</th>
                <th>{t('employeesTableCreated')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredTypes.map((type) => {
                const linkedCell =
                  !type.linkedServices || type.linkedServices.length === 0
                    ? '—'
                    : type.linkedServices
                        .map((ls) => `${ls.code} ${ls.price != null ? `(${currency(ls.price)})` : ''}`)
                        .join(', ')
                return (
                  <tr
                    key={type.id}
                    className="clients-row clients-row--clickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => openTypeEdit(type)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openTypeEdit(type)
                      }
                    }}
                  >
                    <td>
                      <div className="clients-name-cell">
                        <div className="clients-name-stack">
                          <span className="clients-name">{type.name}</span>
                          <span className="clients-id">ID #{type.id}</span>
                        </div>
                      </div>
                    </td>
                    <td className="clients-muted">{type.description?.trim() ? type.description : '—'}</td>
                    <td className="clients-muted">{type.durationMinutes ?? 60} min</td>
                    <td className="clients-muted">{type.breakMinutes ?? 0} min</td>
                    <td className="clients-muted">{type.maxParticipantsPerSession ?? '—'}</td>
                    <td className="clients-muted">
                      {guestBookingModeFromFlags(
                        type.widgetGroupBookingEnabled === true,
                        type.guestBookingEnabled !== false,
                      )}
                    </td>
                    <td className="clients-muted">{linkedCell}</td>
                    <td className="clients-muted">{formatDate(type.createdAt)}</td>
                    <td className="clients-actions">
                      <div className="clients-actions-inner">
                        <button
                          type="button"
                          className="secondary clients-action-btn clients-action-btn-danger"
                          onClick={(e) => {
                            e.stopPropagation()
                            void removeType(type.id)
                          }}
                        >
                          {t('formDelete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )

  const transactionServicesPanelBody =
    services.length === 0 ? (
      <EmptyState title={t('sessionTypesEmptyServicesTitle')} text={t('sessionTypesEmptyServicesText')} />
    ) : filteredServices.length === 0 ? (
      <EmptyState title={t('calendarFilterSearchNoResults')} text={t('sessionTypesSearchNoMatchesText')} />
    ) : (
      <div className="clients-list-shell">
        <div className="clients-mobile-list">
          {filteredServices.map((s) => {
            const mult = s.taxRate === 'VAT_22' ? 0.22 : s.taxRate === 'VAT_9_5' ? 0.095 : 0
            const gross = s.netPrice * (1 + mult)
            const advanceBadge = (settings.ADVANCE_DEDUCTION_TRANSACTION_SERVICE_ID || '').trim() === String(s.id)
            return (
              <article
                key={s.id}
                className="clients-mobile-card"
                role="button"
                tabIndex={0}
                onClick={() => openServiceEdit(s)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    openServiceEdit(s)
                  }
                }}
              >
                <div className="clients-mobile-card-head">
                  <div className="clients-name-cell">
                    <div className="clients-name-stack">
                      <span className="clients-name">{s.code}</span>
                      {advanceBadge ? (
                        <span className="billing-open-batch-chip" style={{ marginLeft: 6 }}>
                          {t('sessionTypesTxAdvanceBadge')}
                        </span>
                      ) : null}
                      <span className="clients-id">ID #{s.id}</span>
                    </div>
                  </div>
                  <div className="clients-card-menu-wrap">
                    <button
                      type="button"
                      className="secondary clients-card-menu-trigger"
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenServiceMenuId((prev) => (prev === s.id ? null : s.id))
                      }}
                      aria-label="Transaction service actions"
                      aria-expanded={openServiceMenuId === s.id}
                    >
                      ...
                    </button>
                    {openServiceMenuId === s.id && (
                      <div className="clients-card-menu-popover" role="dialog" aria-label="Transaction service actions">
                        <button
                          type="button"
                          className="danger"
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenServiceMenuId(null)
                            void deleteService(s.id)
                          }}
                        >
                          {t('formDelete')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="clients-mobile-meta">
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span>{t('sessionTypesTxLabelDescription')}</span>
                    <strong>{s.description?.trim() ? s.description : '—'}</strong>
                  </div>
                  <div>
                    <span>{t('sessionTypesTxLabelTax')}</span>
                    <strong>{transactionServiceTaxDisplay(s.taxRate)}</strong>
                  </div>
                  <div>
                    <span>{t('sessionTypesTxLabelNet')}</span>
                    <strong>{currency(s.netPrice)}</strong>
                  </div>
                  <div>
                    <span>{t('sessionTypesTxLabelGross')}</span>
                    <strong>{currency(gross)}</strong>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
        <div className="simple-table-wrap clients-table-wrap clients-table-desktop session-types-table-wrap">
          <table className="clients-table session-types-table">
            <thead>
              <tr>
                <th>{t('sessionTypesTableServiceCode')}</th>
                <th>{t('sessionTypesTxLabelDescription')}</th>
                <th>{t('sessionTypesTxLabelTax')}</th>
                <th>{t('sessionTypesTxLabelNet')}</th>
                <th>{t('sessionTypesTxLabelGross')}</th>
                <th>{t('employeesTableCreated')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredServices.map((s) => {
                const mult = s.taxRate === 'VAT_22' ? 0.22 : s.taxRate === 'VAT_9_5' ? 0.095 : 0
                const gross = s.netPrice * (1 + mult)
                const advanceBadge = (settings.ADVANCE_DEDUCTION_TRANSACTION_SERVICE_ID || '').trim() === String(s.id)
                return (
                  <tr
                    key={s.id}
                    className="clients-row clients-row--clickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => openServiceEdit(s)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openServiceEdit(s)
                      }
                    }}
                  >
                    <td>
                      <div className="clients-name-cell">
                        <div className="clients-name-stack">
                          <span className="clients-name">{s.code}</span>
                          {advanceBadge ? (
                            <span className="billing-open-batch-chip" style={{ marginLeft: 6 }}>
                              {t('sessionTypesTxAdvanceBadge')}
                            </span>
                          ) : null}
                          <span className="clients-id">ID #{s.id}</span>
                        </div>
                      </div>
                    </td>
                    <td className="clients-muted">{s.description}</td>
                    <td className="clients-muted">{transactionServiceTaxDisplay(s.taxRate)}</td>
                    <td className="clients-muted">{currency(s.netPrice)}</td>
                    <td className="clients-muted">{currency(gross)}</td>
                    <td className="clients-muted">{formatDate(s.createdAt)}</td>
                    <td className="clients-actions">
                      <div className="clients-actions-inner">
                        <button
                          type="button"
                          className="secondary clients-action-btn clients-action-btn-danger"
                          onClick={(e) => {
                            e.stopPropagation()
                            void deleteService(s.id)
                          }}
                        >
                          {t('formDelete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )

  const openNewTypeModal = () => {
    setEditingType(null)
    const empty: TypeFormState = {
      name: '',
      description: '',
      durationMinutes: 60,
      breakMinutes: 0,
      maxParticipantsPerSession: '',
      guestBookingMode: 'GUEST',
      serviceLines: [],
    }
    setTypeForm(empty)
    setTypeFormSnapshot({ ...empty, serviceLines: [] })
    setShowTypeModal(true)
  }

  const openNewServiceModal = () => {
    setEditingServiceId(null)
    const empty: ServiceFormState = { code: '', description: '', taxRate: 'VAT_22', grossPrice: '0.00', advanceDeduction: false }
    setServiceForm(empty)
    setServiceFormSnapshot({ ...empty })
    setShowServiceModal(true)
  }

  const dismissTypeModal = () => {
    setShowTypeModal(false)
    setEditingType(null)
    setTypeFormSnapshot(null)
  }

  const dismissServiceModal = () => {
    setShowServiceModal(false)
    setEditingServiceId(null)
    setServiceFormSnapshot(null)
  }

  /** Close only when the press starts on the dimmed overlay, not when a click is synthesized
   *  after text selection (mousedown in the form, mouseup on the backdrop — common on wide screens). */
  const onTypeModalBackdropMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) dismissTypeModal()
  }

  const onServiceModalBackdropMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) dismissServiceModal()
  }

  const sessionTypesCardClass = `settings-card${isSessionTypesNarrow ? ' clients-mobile-shell' : ''}`

  return (
    <div className="stack gap-lg">
      {typesModuleEnabled ? (
        <Card className={sessionTypesCardClass}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <div className="clients-session-tabs" style={{ marginBottom: 0 }} role="tablist" aria-label={t('sessionTypesSubtabsAria')}>
              <button
                type="button"
                role="tab"
                aria-selected={!showTransactionServices && !showCardsMemberships}
                className={!showTransactionServices && !showCardsMemberships ? 'clients-session-tab active' : 'clients-session-tab'}
                onClick={() => setSessionTypesSubtab('types')}
              >
                {t('sessionTypesSubtabTypes')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={showTransactionServices}
                className={showTransactionServices ? 'clients-session-tab active' : 'clients-session-tab'}
                onClick={() => setSessionTypesSubtab('transactionServices')}
              >
                {t('configBillingServicesTab')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={showCardsMemberships}
                className={showCardsMemberships ? 'clients-session-tab active' : 'clients-session-tab'}
                onClick={() => setSessionTypesSubtab('cardsMemberships')}
              >
                {t('sessionTypesSubtabCards')}
              </button>
            </div>
            <button
              type="button"
              className="secondary"
              onClick={
                showCardsMemberships
                  ? () => cardsMembershipsRef.current?.openNew()
                  : showTransactionServices
                    ? openNewServiceModal
                    : openNewTypeModal
              }
            >
              {isSessionTypesNarrow ? t('billingNewMobile') : t('billingNew')}
            </button>
          </div>
          <div className="clients-toolbar">
            <div className="clients-search-wrap">
              <input
                className="clients-search-input"
                placeholder={
                  showCardsMemberships
                    ? t('sessionTypesSearchCardsPlaceholder')
                    : showTransactionServices
                      ? t('sessionTypesSearchServicesPlaceholder')
                      : t('sessionTypesSearchTypesPlaceholder')
                }
                value={
                  showCardsMemberships ? cardSearch : showTransactionServices ? serviceSearch : typeSearch
                }
                onChange={(e) =>
                  showCardsMemberships
                    ? setCardSearch(e.target.value)
                    : showTransactionServices
                      ? setServiceSearch(e.target.value)
                      : setTypeSearch(e.target.value)
                }
              />
              <span className="clients-search-icon" aria-hidden>
                ⌕
              </span>
            </div>
            <div className={`clients-count-chip${isSessionTypesNarrow ? ' clients-count-chip--mobile-open' : ''}`}>
              {showCardsMemberships
                ? guestCardListCountLabel(guestCardsFilteredCount, locale)
                : showTransactionServices
                  ? transactionServiceListCountLabel(filteredServices.length, locale)
                  : sessionTypeListCountLabel(filteredTypes.length, locale)}
            </div>
          </div>
          {showCardsMemberships ? (
            <CardsMembershipsSection
              ref={cardsMembershipsRef}
              sessionTypes={types}
              searchQuery={cardSearch}
              onFilteredCountChange={onGuestCardsFilteredCount}
            />
          ) : showTransactionServices ? (
            transactionServicesPanelBody
          ) : (
            typesPanelBody
          )}
        </Card>
      ) : (
        <Card className={sessionTypesCardClass}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <div className="clients-session-tabs" style={{ marginBottom: 0 }} role="tablist" aria-label={t('sessionTypesSubtabsAria')}>
              <button
                type="button"
                role="tab"
                aria-selected={showTransactionServices && !showCardsMemberships}
                className={showTransactionServices && !showCardsMemberships ? 'clients-session-tab active' : 'clients-session-tab'}
                onClick={() => setSessionTypesSubtab('transactionServices')}
              >
                {t('configBillingServicesTab')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={showCardsMemberships}
                className={showCardsMemberships ? 'clients-session-tab active' : 'clients-session-tab'}
                onClick={() => setSessionTypesSubtab('cardsMemberships')}
              >
                {t('sessionTypesSubtabCards')}
              </button>
            </div>
            <button
              type="button"
              className="secondary"
              onClick={showCardsMemberships ? () => cardsMembershipsRef.current?.openNew() : openNewServiceModal}
            >
              {isSessionTypesNarrow ? t('billingNewMobile') : t('billingNew')}
            </button>
          </div>
          <div className="clients-toolbar">
            <div className="clients-search-wrap">
              <input
                className="clients-search-input"
                placeholder={
                  showCardsMemberships
                    ? t('sessionTypesSearchCardsPlaceholder')
                    : t('sessionTypesSearchServicesPlaceholder')
                }
                value={showCardsMemberships ? cardSearch : serviceSearch}
                onChange={(e) =>
                  showCardsMemberships ? setCardSearch(e.target.value) : setServiceSearch(e.target.value)
                }
              />
              <span className="clients-search-icon" aria-hidden>
                ⌕
              </span>
            </div>
            <div className={`clients-count-chip${isSessionTypesNarrow ? ' clients-count-chip--mobile-open' : ''}`}>
              {showCardsMemberships
                ? guestCardListCountLabel(guestCardsFilteredCount, locale)
                : transactionServiceListCountLabel(filteredServices.length, locale)}
            </div>
          </div>
          {showCardsMemberships ? (
            <CardsMembershipsSection
              ref={cardsMembershipsRef}
              sessionTypes={types}
              searchQuery={cardSearch}
              onFilteredCountChange={onGuestCardsFilteredCount}
            />
          ) : (
            transactionServicesPanelBody
          )}
        </Card>
      )}

      {showTypeModal ? (
        <div className="modal-backdrop booking-side-panel-backdrop" onMouseDown={onTypeModalBackdropMouseDown} role="presentation">
          <div className="modal large-modal booking-side-panel" onMouseDown={(e) => e.stopPropagation()}>
            <div className="booking-side-panel-header">
              <PageHeader
                title={editingType ? 'Edit type' : 'New type'}
                actions={
                  <button
                    type="button"
                    className="secondary booking-side-panel-close"
                    onClick={dismissTypeModal}
                    aria-label="Close"
                  >
                    ×
                  </button>
                }
              />
            </div>
            <div className="consultant-panel-stack">
              <form
                id="session-type-edit-form"
                className="form-grid booking-side-panel-body config-type-panel-form"
                onSubmit={submitType}
              >
                <Field label="Type name">
                  <input required value={typeForm.name} onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })} />
                </Field>
                <Field label="Description">
                  <textarea
                    ref={sessionTypeDescriptionRef}
                    className="session-type-description-autogrow"
                    rows={1}
                    value={typeForm.description}
                    onChange={(e) => {
                      const el = e.target
                      setTypeForm({ ...typeForm, description: el.value })
                      el.style.height = '0px'
                      el.style.height = `${el.scrollHeight}px`
                    }}
                  />
                </Field>
                <div className="full-span config-type-panel-timing-grid">
                  <div className="config-type-panel-timing-numbers">
                    <Field label="Duration (minutes)">
                      <input
                        type="number"
                        min={0}
                        max={999}
                        step={1}
                        inputMode="numeric"
                        value={typeForm.durationMinutes}
                        onChange={(e) =>
                          setTypeForm({
                            ...typeForm,
                            durationMinutes: clampSessionTypeInt0to999(Number(e.target.value)),
                          })
                        }
                      />
                    </Field>
                    <Field label="Break (minutes)">
                      <input
                        type="number"
                        min={0}
                        max={999}
                        step={1}
                        inputMode="numeric"
                        value={typeForm.breakMinutes}
                        onChange={(e) =>
                          setTypeForm({
                            ...typeForm,
                            breakMinutes: clampSessionTypeInt0to999(Number(e.target.value)),
                          })
                        }
                      />
                    </Field>
                    <Field label="Group max participants">
                      <input
                        type="number"
                        min={1}
                        max={999}
                        step={1}
                        inputMode="numeric"
                        value={typeForm.maxParticipantsPerSession}
                        onChange={(e) =>
                          setTypeForm({
                            ...typeForm,
                            maxParticipantsPerSession: normalizeOptionalParticipantsField(e.target.value),
                          })
                        }
                        placeholder="No limit"
                      />
                    </Field>
                  </div>
                  <div className="full-span">
                    <Field label="Guest booking">
                      <div
                        className={`guest-booking-select${guestBookingPickerOpen ? ' is-open' : ''}`}
                        ref={guestBookingSelectRef}
                      >
                        <button
                          type="button"
                          className="guest-booking-select-trigger"
                          aria-haspopup="listbox"
                          aria-expanded={guestBookingPickerOpen}
                          onClick={() => setGuestBookingPickerOpen((o) => !o)}
                        >
                          <span className="guest-booking-select-trigger-main">
                            <span className="guest-booking-select-value">
                              {guestBookingOptionMeta(typeForm.guestBookingMode).label}
                            </span>
                            <span className="guest-booking-select-line">
                              {guestBookingOptionMeta(typeForm.guestBookingMode).line}
                            </span>
                          </span>
                          <span className="guest-booking-select-chevron" aria-hidden>
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                              <path
                                d="M5.5 8.25 10 12.75 14.5 8.25"
                                stroke="currentColor"
                                strokeWidth="1.75"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>
                        </button>
                        {guestBookingPickerOpen ? (
                          <ul className="guest-booking-select-menu" role="listbox">
                            {GUEST_BOOKING_OPTIONS.map((opt) => {
                              const selected = typeForm.guestBookingMode === opt.value
                              return (
                                <li key={opt.value} role="presentation">
                                  <button
                                    type="button"
                                    role="option"
                                    aria-selected={selected}
                                    className={`guest-booking-select-option${selected ? ' is-selected' : ''}`}
                                    onClick={() => {
                                      setTypeForm({ ...typeForm, guestBookingMode: opt.value })
                                      setGuestBookingPickerOpen(false)
                                    }}
                                  >
                                    <span className="guest-booking-select-option-label">{opt.label}</span>
                                    <span className="guest-booking-select-option-line">{opt.line}</span>
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        ) : null}
                      </div>
                    </Field>
                  </div>
                </div>
                <div className="full-span stack gap-sm config-type-panel-services">
                  <SectionTitle
                    action={
                      <button
                        type="button"
                        className="secondary small-btn"
                        disabled={services.length === 0}
                        onClick={() => {
                          const s = services[0]
                          if (s) {
                            setTypeForm({
                              ...typeForm,
                              serviceLines: [...typeForm.serviceLines, { transactionServiceId: s.id, price: String(s.netPrice) }],
                            })
                          }
                        }}
                      >
                        Add service
                      </button>
                    }
                  >
                    Transaction services
                  </SectionTitle>
                  {typeForm.serviceLines.length === 0 ? (
                    <EmptyState title="No services linked" text="Add one or more transaction services." />
                  ) : (
                    typeForm.serviceLines.map((line, idx) => (
                      <div key={idx} className="inline-form billing-row config-type-service-row">
                        <select
                          value={line.transactionServiceId}
                          onChange={(e) => {
                            const id = Number(e.target.value)
                            const svc = services.find((s) => s.id === id)
                            const next = [...typeForm.serviceLines]
                            next[idx] = { transactionServiceId: id, price: svc ? String(svc.netPrice) : '' }
                            setTypeForm({ ...typeForm, serviceLines: next })
                          }}
                        >
                          {services.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.code} · {s.description}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Price (optional)"
                          value={line.price}
                          onChange={(e) => {
                            const next = [...typeForm.serviceLines]
                            next[idx].price = e.target.value
                            setTypeForm({ ...typeForm, serviceLines: next })
                          }}
                        />
                        <button
                          type="button"
                          className="danger secondary slim-btn"
                          onClick={() =>
                            setTypeForm({ ...typeForm, serviceLines: typeForm.serviceLines.filter((_, i) => i !== idx) })
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </form>
              {isTypeFormDirty ? (
                <div className="form-actions full-span booking-side-panel-footer">
                  <button form="session-type-edit-form" type="submit">
                    {editingType ? 'Save changes' : 'Create type'}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {showServiceModal ? (
        <div className="modal-backdrop booking-side-panel-backdrop" onMouseDown={onServiceModalBackdropMouseDown} role="presentation">
          <div className="modal large-modal booking-side-panel" onMouseDown={(e) => e.stopPropagation()}>
            <div className="booking-side-panel-header">
              <PageHeader
                title={editingServiceId ? t('sessionTypesTxModalEditTitle') : t('sessionTypesTxModalNewTitle')}
                actions={
                  <button
                    type="button"
                    className="secondary booking-side-panel-close"
                    onClick={dismissServiceModal}
                    aria-label="Close"
                  >
                    ×
                  </button>
                }
              />
            </div>
            <div className="consultant-panel-stack">
              <form
                id="transaction-service-edit-form"
                className="form-grid booking-side-panel-body"
                onSubmit={serviceSubmit}
              >
                <Field label={t('sessionTypesTxFieldCode')}>
                  <input required value={serviceForm.code} onChange={(e) => setServiceForm({ ...serviceForm, code: e.target.value })} />
                </Field>
                <Field label={t('sessionTypesTxLabelDescription')}>
                  <input required value={serviceForm.description} onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })} />
                </Field>
                <Field label={t('sessionTypesTxFieldTax')}>
                  <div className={`guest-booking-select${taxRatePickerOpen ? ' is-open' : ''}`} ref={taxRateSelectRef}>
                    <button
                      type="button"
                      className="guest-booking-select-trigger"
                      aria-haspopup="listbox"
                      aria-expanded={taxRatePickerOpen}
                      onClick={() => setTaxRatePickerOpen((o) => !o)}
                    >
                      <span className="guest-booking-select-trigger-main">
                        <span className="guest-booking-select-value">{taxRateOptionSelected.label}</span>
                        {taxRateOptionSelected.line ? (
                          <span className="guest-booking-select-line">{taxRateOptionSelected.line}</span>
                        ) : null}
                      </span>
                      <span className="guest-booking-select-chevron" aria-hidden>
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                          <path
                            d="M5.5 8.25 10 12.75 14.5 8.25"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    </button>
                    {taxRatePickerOpen ? (
                      <ul className="guest-booking-select-menu" role="listbox">
                        {taxRateSelectOptions.map((opt) => {
                          const selected = serviceForm.taxRate === opt.value
                          return (
                            <li key={opt.value} role="presentation">
                              <button
                                type="button"
                                role="option"
                                aria-selected={selected}
                                className={`guest-booking-select-option${selected ? ' is-selected' : ''}`}
                                onClick={() => {
                                  setServiceForm({ ...serviceForm, taxRate: opt.value })
                                  setTaxRatePickerOpen(false)
                                }}
                              >
                                <span className="guest-booking-select-option-label">{opt.label}</span>
                                {opt.line ? <span className="guest-booking-select-option-line">{opt.line}</span> : null}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    ) : null}
                  </div>
                </Field>
                <Field label={t('sessionTypesTxFieldGross')}>
                  <input
                    required
                    type="number"
                    step="0.01"
                    min={0}
                    value={serviceForm.grossPrice}
                    onChange={(e) => setServiceForm({ ...serviceForm, grossPrice: e.target.value })}
                  />
                </Field>
                <div className="full-span">
                  <label className="toggle-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <strong>{t('sessionTypesTxAdvanceSwitch')}</strong>
                      <p className="muted" style={{ margin: '4px 0 0' }}>
                        {t('sessionTypesTxAdvanceHint')}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={serviceForm.advanceDeduction}
                      onChange={(e) => setServiceForm({ ...serviceForm, advanceDeduction: e.target.checked })}
                      aria-label={t('sessionTypesTxAdvanceSwitch')}
                    />
                  </label>
                </div>
                <div className="full-span">
                  <Field label={t('sessionTypesTxLabelNet')}>
                    <input readOnly tabIndex={-1} value={currency(transactionServiceNetComputed)} />
                  </Field>
                </div>
              </form>
              {isServiceFormDirty ? (
                <div className="form-actions full-span booking-side-panel-footer">
                  <button form="transaction-service-edit-form" type="submit">
                    {editingServiceId ? t('sessionTypesTxModalSaveService') : t('sessionTypesTxModalCreateService')}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
