import { useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { getStoredUser } from '../auth'
import type { PaymentMethod, PaymentType, SessionType as SessionTypeT } from '../lib/types'
import { normalizePaymentMethod } from '../lib/types'
import { Card, EmptyState, Field, PageHeader, SectionTitle } from '../components/ui'
import { useToast } from '../components/Toast'
import { currency, formatDate } from '../lib/format'
import { ConfigurationNotificationsSection } from './ConfigurationNotificationsSection'
import { FolioLayoutEditor } from './FolioLayoutEditor'
import { SecurityPage } from './SecurityPage'
import { useLocale } from '../locale'
import { getDefaultAllowedRoute } from '../lib/packageAccess'
import { helpTooltip } from '../helpContent'

type Tab = 'company' | 'booking' | 'billing' | 'guestApp' | 'notifications' | 'modules' | 'security'
type BookingSubtab = 'tasks' | 'spaces'
type BillingSubtab = 'settings' | 'paymentMethods' | 'paypal' | 'fiscal' | 'folioLayout'
type PersonalTaskPreset = { id: string; name: string; color: string }

type ConfigNavIcon = 'company' | 'booking' | 'billing' | 'guestApp' | 'notifications' | 'modules' | 'security'

type ConfigNavItem = { id: Tab; icon: ConfigNavIcon }

function ConfigTabIcon({ kind }: { kind: ConfigNavIcon }) {
  if (kind === 'company') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 21h18" />
        <path d="M5 21V7l7-4 7 4v14" />
        <path d="M9 21v-6h6v6" />
      </svg>
    )
  }
  if (kind === 'booking') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    )
  }
  if (kind === 'billing') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
        <path d="M7 15h2M12 15h5" />
      </svg>
    )
  }
  if (kind === 'guestApp') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="7" y="2" width="10" height="20" rx="2" />
        <path d="M11 18h2" />
        <path d="M9 5h6" />
      </svg>
    )
  }
  if (kind === 'notifications') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    )
  }
  if (kind === 'modules') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    )
  }
  if (kind === 'security') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 2l7 4v6c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-4Z" />
        <path d="M9.5 12.5l1.5 1.5 3.5-4" />
      </svg>
    )
  }
  const _exhaustive: never = kind
  void _exhaustive
  return null
}

function HelpHint({ helpId, t }: { helpId: string; t: (key: string) => string }) {
  const text = helpTooltip(t, helpId)
  return (
    <span className="config-help-hint" data-tooltip={text} role="img" aria-label={text} tabIndex={0}>
      ?
    </span>
  )
}

function useQuery() {
  const { search } = useLocation()
  return useMemo(() => new URLSearchParams(search), [search])
}

type Space = { id: number; name: string; description?: string; createdAt?: string }
const toTimeInputValue = (value: string | undefined, fallback: string) => {
  const v = (value || '').trim()
  if (/^\d{2}:\d{2}$/.test(v)) return v
  if (/^\d{2}:\d{2}:\d{2}$/.test(v)) return v.slice(0, 5)
  return fallback
}

function spaceListInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase()
  const s = name.trim()
  if (s.length >= 2) return s.slice(0, 2).toUpperCase()
  return (s.charAt(0) || 'S').toUpperCase()
}
const WORKING_HOURS_FALLBACK_KEY = 'workingHoursFallback'
const getWorkingHoursFallback = () => {
  try {
    const raw = localStorage.getItem(WORKING_HOURS_FALLBACK_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed ? parsed as Record<string, string> : {}
  } catch {
    return {}
  }
}
const setWorkingHoursFallback = (start: string, end: string) => {
  try {
    localStorage.setItem(WORKING_HOURS_FALLBACK_KEY, JSON.stringify({
      WORKING_HOURS_START: start,
      WORKING_HOURS_END: end,
    }))
  } catch {
    // ignore storage errors
  }
}

const PERSONAL_TASK_PRESETS_KEY = 'PERSONAL_TASK_PRESETS_JSON'
const DEFAULT_PERSONAL_TASK_COLOR = '#F59E0B'
const normalizeHexColor = (value: string | undefined) => {
  const v = String(value || '').trim()
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : DEFAULT_PERSONAL_TASK_COLOR
}
const parsePersonalTaskPresets = (raw: string | undefined): PersonalTaskPreset[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const out: PersonalTaskPreset[] = []
    for (const row of parsed) {
      const name = String(row?.name || '').trim()
      if (!name) continue
      out.push({
        id: String(row?.id || `${Date.now()}-${Math.random()}`),
        name,
        color: normalizeHexColor(row?.color),
      })
    }
    return out
  } catch {
    return []
  }
}
const serializePersonalTaskPresets = (presets: PersonalTaskPreset[]) => JSON.stringify(
  presets.map((p) => ({ id: p.id, name: p.name.trim(), color: normalizeHexColor(p.color) })),
)
const REGISTERED_PREMISES_KEY = 'FISCAL_REGISTERED_PREMISES_JSON'
const parseRegisteredPremises = (raw: string | undefined): string[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const normalize = (v: any): string => {
      if (typeof v === 'string' || typeof v === 'number') return String(v).trim()
      if (v && typeof v === 'object') {
        const candidate = v.id ?? v.premiseId ?? v.businessPremiseId ?? v.value
        if (candidate != null) return String(candidate).trim()
      }
      return ''
    }
    return parsed
      .map(normalize)
      .filter((v) => v.length > 0)
      .filter((v) => v.toLowerCase() !== '[object object]')
  } catch {
    return []
  }
}

type GuestAppSettingsForm = {
  guestAppEnabled: boolean
  publicDiscoverable: boolean
  publicName: string
  publicDescription: string
  publicCity: string
  defaultLanguage: 'sl' | 'en'
}

type GuestBookingRulesForm = {
  cancelUntilHours: string
  rescheduleUntilHours: string
  lateCancelConsumesCredit: boolean
  noShowConsumesCredit: boolean
  sameDayBankTransferAllowed: boolean
  bankTransferReservesSlot: boolean
  allowBankTransferFor: string[]
  allowCardFor: string[]
}

type GuestAdminProductType = 'CLASS_TICKET' | 'PACK' | 'MEMBERSHIP'

type GuestAdminProduct = {
  id: number
  name: string
  description?: string | null
  productType: GuestAdminProductType
  priceGross: number
  currency: string
  active: boolean
  guestVisible: boolean
  bookable: boolean
  usageLimit?: number | null
  validityDays?: number | null
  autoRenews: boolean
  sortOrder: number
  sessionTypeId?: number | null
  sessionTypeName?: string | null
  createdAt?: string
  updatedAt?: string
}

type GuestProductFormState = {
  name: string
  description: string
  productType: GuestAdminProductType
  priceGross: string
  currency: string
  active: boolean
  guestVisible: boolean
  bookable: boolean
  usageLimit: string
  validityDays: string
  autoRenews: boolean
  sortOrder: string
  sessionTypeId: string
}

const ADMIN_GUEST_PRODUCT_TYPES: GuestAdminProductType[] = ['PACK', 'MEMBERSHIP', 'CLASS_TICKET']

const defaultGuestProductForm = (): GuestProductFormState => ({
  name: '',
  description: '',
  productType: 'PACK',
  priceGross: '0.00',
  currency: 'EUR',
  active: true,
  guestVisible: true,
  bookable: false,
  usageLimit: '',
  validityDays: '',
  autoRenews: false,
  sortOrder: '0',
  sessionTypeId: '',
})

const normalizeGuestProductFormForType = (
  current: GuestProductFormState,
  nextProductType: GuestAdminProductType,
): GuestProductFormState => ({
  ...current,
  productType: nextProductType,
  usageLimit: nextProductType === 'CLASS_TICKET' ? '1' : current.usageLimit,
  sessionTypeId: nextProductType === 'CLASS_TICKET' ? current.sessionTypeId : current.sessionTypeId,
  autoRenews: nextProductType === 'MEMBERSHIP' ? current.autoRenews : false,
})

const parsePositiveIntegerInput = (value: string): number | null => {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number.parseInt(trimmed, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

const productTypeLabel = (productType: GuestAdminProductType) => GUEST_PRODUCT_TYPE_LABELS[productType] || productType

const GUEST_APP_SETTINGS_KEY = 'GUEST_APP_SETTINGS_JSON'
const GUEST_BOOKING_RULES_KEY = 'GUEST_BOOKING_RULES_JSON'
const GUEST_PRODUCT_TYPES = ['SESSION_SINGLE', 'CLASS_TICKET', 'PACK', 'MEMBERSHIP'] as const
const GUEST_PRODUCT_TYPE_LABELS: Record<string, string> = {
  SESSION_SINGLE: 'Single session',
  CLASS_TICKET: 'Class ticket',
  PACK: 'Pack',
  MEMBERSHIP: 'Membership',
}

const defaultGuestAppSettings = (): GuestAppSettingsForm => ({
  guestAppEnabled: true,
  publicDiscoverable: false,
  publicName: '',
  publicDescription: '',
  publicCity: '',
  defaultLanguage: 'sl',
})

const defaultGuestBookingRules = (): GuestBookingRulesForm => ({
  cancelUntilHours: '24',
  rescheduleUntilHours: '12',
  lateCancelConsumesCredit: true,
  noShowConsumesCredit: true,
  sameDayBankTransferAllowed: false,
  bankTransferReservesSlot: false,
  allowBankTransferFor: ['PACK', 'MEMBERSHIP'],
  allowCardFor: ['SESSION_SINGLE', 'CLASS_TICKET', 'PACK', 'MEMBERSHIP'],
})

const parseGuestAppSettings = (raw: string | undefined): GuestAppSettingsForm => {
  if (!raw) return defaultGuestAppSettings()
  try {
    const parsed = JSON.parse(raw)
    return {
      guestAppEnabled: parsed?.guestAppEnabled !== false,
      publicDiscoverable: parsed?.publicDiscoverable === true,
      publicName: String(parsed?.publicName || ''),
      publicDescription: String(parsed?.publicDescription || ''),
      publicCity: String(parsed?.publicCity || ''),
      defaultLanguage: parsed?.defaultLanguage === 'en' ? 'en' : 'sl',
    }
  } catch {
    return defaultGuestAppSettings()
  }
}

const parseGuestBookingRules = (raw: string | undefined): GuestBookingRulesForm => {
  if (!raw) return defaultGuestBookingRules()
  try {
    const parsed = JSON.parse(raw)
    const normalizeAllowed = (value: any, fallback: string[]) => Array.isArray(value)
      ? value.map((row) => String(row || '').trim()).filter(Boolean)
      : fallback
    return {
      cancelUntilHours: String(parsed?.cancelUntilHours ?? 24),
      rescheduleUntilHours: String(parsed?.rescheduleUntilHours ?? 12),
      lateCancelConsumesCredit: parsed?.lateCancelConsumesCredit !== false,
      noShowConsumesCredit: parsed?.noShowConsumesCredit !== false,
      sameDayBankTransferAllowed: parsed?.sameDayBankTransferAllowed === true,
      bankTransferReservesSlot: parsed?.bankTransferReservesSlot === true,
      allowBankTransferFor: normalizeAllowed(parsed?.allowBankTransferFor, ['PACK', 'MEMBERSHIP']),
      allowCardFor: normalizeAllowed(parsed?.allowCardFor, ['SESSION_SINGLE', 'CLASS_TICKET', 'PACK', 'MEMBERSHIP']),
    }
  } catch {
    return defaultGuestBookingRules()
  }
}

const serializeGuestAppSettings = (value: GuestAppSettingsForm) => JSON.stringify({
  guestAppEnabled: value.guestAppEnabled,
  publicDiscoverable: value.publicDiscoverable,
  publicName: value.publicName.trim(),
  publicDescription: value.publicDescription.trim(),
  publicCity: value.publicCity.trim(),
  defaultLanguage: value.defaultLanguage,
})

const serializeGuestBookingRules = (value: GuestBookingRulesForm) => JSON.stringify({
  cancelUntilHours: Math.max(0, Number(value.cancelUntilHours || 0)),
  rescheduleUntilHours: Math.max(0, Number(value.rescheduleUntilHours || 0)),
  lateCancelConsumesCredit: value.lateCancelConsumesCredit,
  noShowConsumesCredit: value.noShowConsumesCredit,
  sameDayBankTransferAllowed: value.sameDayBankTransferAllowed,
  bankTransferReservesSlot: value.bankTransferReservesSlot,
  allowBankTransferFor: value.allowBankTransferFor,
  allowCardFor: value.allowCardFor,
})

const toggleAllowedProductType = (current: string[], productType: string) =>
  current.includes(productType) ? current.filter((item) => item !== productType) : [...current, productType]

export function ConfigurationPage() {
  const me = getStoredUser()!
  const isAdmin = me.role === 'ADMIN'
  const navigate = useNavigate()
  const query = useQuery()
  const { t } = useLocale()
  const { showToast } = useToast()

  const [tab, setTab] = useState<Tab>('company')
  const [bookingSubtab, setBookingSubtab] = useState<BookingSubtab>('spaces')
  const [billingSubtab, setBillingSubtab] = useState<BillingSubtab>('paymentMethods')
  const [startingPaypalOnboarding, setStartingPaypalOnboarding] = useState(false)

  const [settings, setSettings] = useState<Record<string, string>>({})
  const [savingSettings, setSavingSettings] = useState(false)
  const [guestAppSettings, setGuestAppSettings] = useState<GuestAppSettingsForm>(defaultGuestAppSettings)
  const [guestBookingRules, setGuestBookingRules] = useState<GuestBookingRulesForm>(defaultGuestBookingRules)
  const [guestProducts, setGuestProducts] = useState<GuestAdminProduct[]>([])
  const [guestSessionTypes, setGuestSessionTypes] = useState<SessionTypeT[]>([])
  const [showGuestProductModal, setShowGuestProductModal] = useState(false)
  const [editingGuestProductId, setEditingGuestProductId] = useState<number | null>(null)
  const [savingGuestProduct, setSavingGuestProduct] = useState(false)
  const [guestProductForm, setGuestProductForm] = useState<GuestProductFormState>(defaultGuestProductForm)

  const [spaces, setSpaces] = useState<Space[]>([])
  const [editingSpace, setEditingSpace] = useState<Space | null>(null)
  const [showSpaceModal, setShowSpaceModal] = useState(false)
  const [openSpaceMenuId, setOpenSpaceMenuId] = useState<number | null>(null)
  const [spaceForm, setSpaceForm] = useState({ name: '', description: '' })
  const [personalTaskPresets, setPersonalTaskPresets] = useState<PersonalTaskPreset[]>([])
  const [showTaskPresetModal, setShowTaskPresetModal] = useState(false)
  const [editingTaskPresetId, setEditingTaskPresetId] = useState<string | null>(null)
  const [savingTaskPreset, setSavingTaskPreset] = useState(false)
  const [taskPresetForm, setTaskPresetForm] = useState<{ name: string; color: string }>({ name: '', color: DEFAULT_PERSONAL_TASK_COLOR })
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [showPaymentMethodModal, setShowPaymentMethodModal] = useState(false)
  const [editingPaymentMethodId, setEditingPaymentMethodId] = useState<number | null>(null)
  const [paymentMethodForm, setPaymentMethodForm] = useState<{
    name: string
    paymentType: PaymentType
    fiscalized: boolean
    stripeEnabled: boolean
    guestEnabled: boolean
    guestDisplayOrder: number
  }>({ name: '', paymentType: 'CASH', fiscalized: true, stripeEnabled: false, guestEnabled: false, guestDisplayOrder: 0 })
  const [registeringPremise, setRegisteringPremise] = useState(false)
  const [premiseRegisterResult, setPremiseRegisterResult] = useState<string>('')
  const [certificateMeta, setCertificateMeta] = useState<{ uploaded: boolean; fileName?: string; uploadedAt?: string; expiresAt?: string } | null>(null)
  const [certificateFile, setCertificateFile] = useState<File | null>(null)
  const [uploadingCertificate, setUploadingCertificate] = useState(false)
  const [registeringPremiseId, setRegisteringPremiseId] = useState<string | null>(null)
  const [premisePickerOpen, setPremisePickerOpen] = useState(false)

  useEffect(() => {
    if (!isAdmin) return
    const q = query.get('tab')
    if (q === 'sessionTypes') {
      navigate('/session-types', { replace: true })
      return
    }
    if (q === 'consultants') {
      navigate('/consultants', { replace: true })
      return
    }
    if (q === 'services') {
      navigate('/session-types?subtab=transaction-services', { replace: true })
      return
    }
    if (
      q === 'company' ||
      q === 'booking' ||
      q === 'billing' ||
      q === 'guestApp' ||
      q === 'notifications' ||
      q === 'modules' ||
      q === 'security'
    ) {
      setTab(q)
    }
    const billingQuery = query.get('subtab')
    if (billingQuery === 'settings' || billingQuery === 'paymentMethods' || billingQuery === 'paypal' || billingQuery === 'fiscal' || billingQuery === 'folioLayout') {
      setBillingSubtab(billingQuery)
    }
  }, [query, navigate, isAdmin])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 800px)')
    const onNarrow = () => {
      if (mq.matches) setBillingSubtab((cur) => (cur === 'folioLayout' ? 'paymentMethods' : cur))
    }
    onNarrow()
    mq.addEventListener('change', onNarrow)
    return () => mq.removeEventListener('change', onNarrow)
  }, [])

  const setTabAndUrl = (next: Tab) => {
    setTab(next)
    navigate(`/configuration?tab=${next}`)
  }

  const load = async () => {
    const [settingsRes, spacesRes, paymentMethodsRes, certificateMetaRes, guestProductsRes, sessionTypesRes, paypalConfigRes] = await Promise.all([
      api.get('/settings'),
      api.get('/spaces').catch(() => ({ data: [] })),
      api.get('/billing/payment-methods').catch(() => ({ data: [] })),
      api.get('/fiscal/certificate/meta').catch(() => ({ data: { uploaded: false } })),
      api.get('/guest/admin/products').catch(() => ({ data: [] })),
      api.get('/types').catch(() => ({ data: [] })),
      api.get('/paypal/onboarding/config').catch(() => ({ data: null })),
    ])
    const paypalData = paypalConfigRes.data || {}
    const settingsData = {
      ...(settingsRes.data || {}),
      ...(paypalData.merchantId ? { PAYPAL_MERCHANT_ID: paypalData.merchantId } : {}),
      ...(paypalData.trackingId ? { PAYPAL_TRACKING_ID: paypalData.trackingId } : {}),
      ...(paypalData.status ? { PAYPAL_ONBOARDING_STATUS: paypalData.status } : {}),
      PAYPAL_CREDENTIALS_CONFIGURED: paypalData.credentialsConfigured ? 'true' : 'false',
    }
    const fallback = getWorkingHoursFallback()
    setSettings({ ...settingsData, ...((!settingsData.WORKING_HOURS_START && !settingsData.WORKING_HOURS_END) ? fallback : {}) })
    setGuestAppSettings(parseGuestAppSettings(settingsData[GUEST_APP_SETTINGS_KEY]))
    setGuestBookingRules(parseGuestBookingRules(settingsData[GUEST_BOOKING_RULES_KEY]))
    setPersonalTaskPresets(parsePersonalTaskPresets(settingsData[PERSONAL_TASK_PRESETS_KEY]))
    setSpaces(spacesRes.data || [])
    setPaymentMethods((paymentMethodsRes.data || []).map((p: PaymentMethod) => normalizePaymentMethod(p)!))
    setCertificateMeta(certificateMetaRes.data || { uploaded: false })
    setGuestProducts(guestProductsRes.data || [])
    setGuestSessionTypes(sessionTypesRes.data || [])
  }

  useEffect(() => {
    if (isAdmin) void load()
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin) return
    const merchantId = query.get('merchantIdInPayPal') || query.get('merchantId') || query.get('merchant_id')
    const trackingId = query.get('tracking_id') || query.get('trackingId')
    if (!merchantId && !trackingId) return

    let cancelled = false
    ;(async () => {
      try {
        await api.post('/paypal/onboarding/complete', { merchantId, trackingId })
        if (!cancelled) {
          await load()
          setTab('billing')
          setBillingSubtab('paypal')
          showToast('success', merchantId ? 'PayPal seller connected.' : 'PayPal onboarding returned. Please review the merchant ID below and save if needed.')
          navigate('/configuration?tab=billing&subtab=paypal', { replace: true })
        }
      } catch (err: any) {
        if (!cancelled) {
          showToast('error', err?.response?.data?.message || 'Failed to save PayPal onboarding result.')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isAdmin, query, navigate, showToast])

  const personalModuleEnabled = settings.PERSONAL_ENABLED !== 'false'
  const spacesModuleEnabled = settings.SPACES_ENABLED === 'true'
  const bookingSubtabsAvailable = personalModuleEnabled || spacesModuleEnabled

  const configNavItems = useMemo(
    (): ConfigNavItem[] => [
      { id: 'company', icon: 'company' },
      { id: 'booking', icon: 'booking' },
      { id: 'billing', icon: 'billing' },
      { id: 'guestApp', icon: 'guestApp' },
      { id: 'notifications', icon: 'notifications' },
      { id: 'modules', icon: 'modules' },
      { id: 'security', icon: 'security' },
    ],
    [],
  )

  useEffect(() => {
    const order: BookingSubtab[] = []
    if (personalModuleEnabled) order.push('tasks')
    if (spacesModuleEnabled) order.push('spaces')
    if (order.length === 0) return
    if (!order.includes(bookingSubtab)) {
      setBookingSubtab(order[0]!)
    }
  }, [personalModuleEnabled, spacesModuleEnabled, bookingSubtab])

  useEffect(() => {
    setOpenSpaceMenuId(null)
  }, [bookingSubtab])

  useEffect(() => {
    if (openSpaceMenuId == null) return
    const onDoc = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('.config-entity-menu-wrap')) return
      setOpenSpaceMenuId(null)
    }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [openSpaceMenuId])

  const saveSettings = async () => {
    if (!isAdmin) return
    setSavingSettings(true)
    try {
      const normalizedStart = toTimeInputValue(settings.WORKING_HOURS_START, '05:00')
      const normalizedEnd = toTimeInputValue(settings.WORKING_HOURS_END, '23:00')
      const payload = {
        ...settings,
        WORKING_HOURS_START: normalizedStart,
        WORKING_HOURS_END: normalizedEnd,
        [PERSONAL_TASK_PRESETS_KEY]: serializePersonalTaskPresets(personalTaskPresets),
        [GUEST_APP_SETTINGS_KEY]: serializeGuestAppSettings(guestAppSettings),
        [GUEST_BOOKING_RULES_KEY]: serializeGuestBookingRules(guestBookingRules),
      }
      const { data } = await api.put('/settings', payload)
      setWorkingHoursFallback(normalizedStart, normalizedEnd)
      const responseHasPresets = Object.prototype.hasOwnProperty.call(data || {}, PERSONAL_TASK_PRESETS_KEY)
      const persistedPresetsRaw = responseHasPresets ? data?.[PERSONAL_TASK_PRESETS_KEY] : payload[PERSONAL_TASK_PRESETS_KEY]
      setSettings({
        ...payload,
        ...data,
        WORKING_HOURS_START: data?.WORKING_HOURS_START || normalizedStart,
        WORKING_HOURS_END: data?.WORKING_HOURS_END || normalizedEnd,
        [PERSONAL_TASK_PRESETS_KEY]: String(persistedPresetsRaw || ''),
      })
      setPersonalTaskPresets(parsePersonalTaskPresets(String(persistedPresetsRaw || '')))
      window.dispatchEvent(new Event('settings-updated'))
      showToast('success', t('configConfigurationSaved'))
    } catch (e: any) {
      window.alert(e?.response?.data?.message || 'Failed to save configuration.')
    } finally {
      setSavingSettings(false)
    }
  }

  const paypalStatusLabel = useMemo(() => {
    const status = (settings.PAYPAL_ONBOARDING_STATUS || '').trim()
    if (!status || status === 'NOT_CONNECTED') return 'Not connected'
    if (status === 'ONBOARDING_LINK_CREATED') return 'Onboarding link created'
    if (status === 'ONBOARDING_RETURNED') return 'Connected'
    return status.replace(/_/g, ' ')
  }, [settings.PAYPAL_ONBOARDING_STATUS])

  const startPaypalOnboarding = async () => {
    setStartingPaypalOnboarding(true)
    try {
      const returnUrl = `${window.location.origin}/configuration?tab=billing&subtab=paypal`
      const { data } = await api.post('/paypal/onboarding/start', { returnUrl })
      if (!data?.actionUrl) throw new Error('PayPal did not return an onboarding URL.')
      setSettings((prev) => ({
        ...prev,
        PAYPAL_TRACKING_ID: data.trackingId || prev.PAYPAL_TRACKING_ID || '',
        PAYPAL_ONBOARDING_STATUS: 'ONBOARDING_LINK_CREATED',
      }))
      window.open(data.actionUrl, '_blank', 'noopener,noreferrer')
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || err?.message || 'Failed to start PayPal onboarding.')
    } finally {
      setStartingPaypalOnboarding(false)
    }
  }

  const savePaypalConfiguration = async () => {
    setSavingSettings(true)
    try {
      const { data } = await api.put('/paypal/onboarding/config', {
        merchantId: settings.PAYPAL_MERCHANT_ID || '',
        trackingId: settings.PAYPAL_TRACKING_ID || '',
      })
      setSettings((prev) => ({
        ...prev,
        PAYPAL_MERCHANT_ID: data?.merchantId || '',
        PAYPAL_TRACKING_ID: data?.trackingId || '',
        PAYPAL_ONBOARDING_STATUS: data?.status || prev.PAYPAL_ONBOARDING_STATUS || 'NOT_CONNECTED',
      }))
      showToast('success', 'PayPal configuration saved.')
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || 'Failed to save PayPal configuration.')
    } finally {
      setSavingSettings(false)
    }
  }

  const saveGuestAppConfiguration = async () => {
    if (!isAdmin) return
    setSavingSettings(true)
    try {
      const normalizedStart = toTimeInputValue(settings.WORKING_HOURS_START, '05:00')
      const normalizedEnd = toTimeInputValue(settings.WORKING_HOURS_END, '23:00')
      const payload = {
        ...settings,
        WORKING_HOURS_START: normalizedStart,
        WORKING_HOURS_END: normalizedEnd,
        [PERSONAL_TASK_PRESETS_KEY]: serializePersonalTaskPresets(personalTaskPresets),
        [GUEST_APP_SETTINGS_KEY]: serializeGuestAppSettings(guestAppSettings),
        [GUEST_BOOKING_RULES_KEY]: serializeGuestBookingRules(guestBookingRules),
      }
      const { data } = await api.put('/settings', payload)
      setSettings({
        ...payload,
        ...data,
        WORKING_HOURS_START: data?.WORKING_HOURS_START || normalizedStart,
        WORKING_HOURS_END: data?.WORKING_HOURS_END || normalizedEnd,
      })
      const paymentMethodResponses = await Promise.all(
        paymentMethods.map((method) => api.put(`/billing/payment-methods/${method.id}`, {
          name: method.name,
          paymentType: method.paymentType,
          fiscalized: method.fiscalized,
          stripeEnabled: method.stripeEnabled,
          guestEnabled: method.guestEnabled,
          guestDisplayOrder: method.guestDisplayOrder,
        })),
      )
      setPaymentMethods(paymentMethodResponses.map((res) => normalizePaymentMethod(res.data)!).filter(Boolean))
      window.dispatchEvent(new Event('settings-updated'))
      showToast('success', t('configConfigurationSaved'))
    } catch (e: any) {
      window.alert(e?.response?.data?.message || 'Failed to save guest app configuration.')
    } finally {
      setSavingSettings(false)
    }
  }

  const saveTaskPresets = async (nextPresets: PersonalTaskPreset[]) => {
    const normalizedStart = toTimeInputValue(settings.WORKING_HOURS_START, '05:00')
    const normalizedEnd = toTimeInputValue(settings.WORKING_HOURS_END, '23:00')
    const payload = {
      ...settings,
      WORKING_HOURS_START: normalizedStart,
      WORKING_HOURS_END: normalizedEnd,
      [PERSONAL_TASK_PRESETS_KEY]: serializePersonalTaskPresets(nextPresets),
      [GUEST_APP_SETTINGS_KEY]: serializeGuestAppSettings(guestAppSettings),
      [GUEST_BOOKING_RULES_KEY]: serializeGuestBookingRules(guestBookingRules),
    }
    const { data } = await api.put('/settings', payload)
    const responseHasPresets = Object.prototype.hasOwnProperty.call(data || {}, PERSONAL_TASK_PRESETS_KEY)
    const persistedPresetsRaw = responseHasPresets ? data?.[PERSONAL_TASK_PRESETS_KEY] : payload[PERSONAL_TASK_PRESETS_KEY]
    setSettings({
      ...payload,
      ...data,
      WORKING_HOURS_START: data?.WORKING_HOURS_START || normalizedStart,
      WORKING_HOURS_END: data?.WORKING_HOURS_END || normalizedEnd,
      [PERSONAL_TASK_PRESETS_KEY]: String(persistedPresetsRaw || ''),
    })
    const parsed = parsePersonalTaskPresets(String(persistedPresetsRaw || ''))
    setPersonalTaskPresets(parsed.length > 0 || nextPresets.length === 0 ? parsed : nextPresets)
    window.dispatchEvent(new Event('settings-updated'))
    showToast('success', t('configConfigurationSaved'))
  }

  const openNewTaskPresetModal = () => {
    setEditingTaskPresetId(null)
    setTaskPresetForm({ name: '', color: DEFAULT_PERSONAL_TASK_COLOR })
    setShowTaskPresetModal(true)
  }

  const openEditTaskPresetModal = (preset: PersonalTaskPreset) => {
    setEditingTaskPresetId(preset.id)
    setTaskPresetForm({ name: preset.name, color: normalizeHexColor(preset.color) })
    setShowTaskPresetModal(true)
  }

  const submitTaskPreset = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = taskPresetForm.name.trim()
    if (!name) return
    const color = normalizeHexColor(taskPresetForm.color)
    const duplicate = personalTaskPresets.find((p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== editingTaskPresetId)
    if (duplicate) {
      window.alert('A task preset with this name already exists.')
      return
    }
    const next = editingTaskPresetId
      ? personalTaskPresets.map((p) => p.id === editingTaskPresetId ? { ...p, name, color } : p)
      : [...personalTaskPresets, { id: `${Date.now()}-${Math.random()}`, name, color }]
    setSavingTaskPreset(true)
    try {
      await saveTaskPresets(next)
      setShowTaskPresetModal(false)
      setEditingTaskPresetId(null)
      setTaskPresetForm({ name: '', color: DEFAULT_PERSONAL_TASK_COLOR })
    } catch (e: any) {
      window.alert(e?.response?.data?.message || 'Failed to save predefined personal task.')
    } finally {
      setSavingTaskPreset(false)
    }
  }

  const deleteTaskPreset = async (id: string) => {
    if (!window.confirm('Delete this predefined personal task?')) return
    const next = personalTaskPresets.filter((p) => p.id !== id)
    setSavingTaskPreset(true)
    try {
      await saveTaskPresets(next)
    } catch (e: any) {
      window.alert(e?.response?.data?.message || 'Failed to delete predefined personal task.')
    } finally {
      setSavingTaskPreset(false)
    }
  }

  const openNewGuestProductModal = () => {
    setEditingGuestProductId(null)
    setGuestProductForm(defaultGuestProductForm())
    setShowGuestProductModal(true)
  }

  const openEditGuestProductModal = (product: GuestAdminProduct) => {
    setEditingGuestProductId(product.id)
    setGuestProductForm(normalizeGuestProductFormForType({
      name: product.name,
      description: product.description || '',
      productType: product.productType,
      priceGross: Number(product.priceGross ?? 0).toFixed(2),
      currency: product.currency || 'EUR',
      active: product.active,
      guestVisible: product.guestVisible,
      bookable: product.bookable,
      usageLimit: product.usageLimit == null ? '' : String(product.usageLimit),
      validityDays: product.validityDays == null ? '' : String(product.validityDays),
      autoRenews: product.autoRenews,
      sortOrder: String(product.sortOrder ?? 0),
      sessionTypeId: product.sessionTypeId == null ? '' : String(product.sessionTypeId),
    }, product.productType))
    setShowGuestProductModal(true)
  }

  const submitGuestProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isAdmin) return
    const isClassTicket = guestProductForm.productType === 'CLASS_TICKET'
    const payload = {
      name: guestProductForm.name.trim(),
      description: guestProductForm.description.trim(),
      productType: guestProductForm.productType,
      priceGross: Number.parseFloat(guestProductForm.priceGross || '0') || 0,
      currency: guestProductForm.currency.trim().toUpperCase() || 'EUR',
      active: guestProductForm.active,
      guestVisible: guestProductForm.guestVisible,
      bookable: guestProductForm.bookable,
      usageLimit: isClassTicket ? 1 : parsePositiveIntegerInput(guestProductForm.usageLimit),
      validityDays: parsePositiveIntegerInput(guestProductForm.validityDays),
      autoRenews: guestProductForm.productType === 'MEMBERSHIP' ? guestProductForm.autoRenews : false,
      sortOrder: Number.parseInt(guestProductForm.sortOrder || '0', 10) || 0,
      sessionTypeId: guestProductForm.sessionTypeId ? Number.parseInt(guestProductForm.sessionTypeId, 10) : null,
    }
    setSavingGuestProduct(true)
    try {
      if (editingGuestProductId) await api.put(`/guest/admin/products/${editingGuestProductId}`, payload)
      else await api.post('/guest/admin/products', payload)
      setShowGuestProductModal(false)
      setEditingGuestProductId(null)
      setGuestProductForm(defaultGuestProductForm())
      await load()
      showToast('success', editingGuestProductId ? 'Card updated.' : 'Card created.')
    } catch (e: any) {
      window.alert(e?.response?.data?.message || 'Failed to save card.')
    } finally {
      setSavingGuestProduct(false)
    }
  }

  const toggleGuestProductActive = async (product: GuestAdminProduct, active: boolean) => {
    if (!isAdmin) return
    try {
      await api.put(`/guest/admin/products/${product.id}`, {
        name: product.name,
        description: product.description || '',
        productType: product.productType,
        priceGross: product.priceGross,
        currency: product.currency,
        active,
        guestVisible: product.guestVisible,
        bookable: product.bookable,
        usageLimit: product.usageLimit ?? null,
        validityDays: product.validityDays ?? null,
        autoRenews: product.autoRenews,
        sortOrder: product.sortOrder,
        sessionTypeId: product.sessionTypeId ?? null,
      })
      await load()
      showToast('success', active ? 'Card activated.' : 'Card archived.')
    } catch (e: any) {
      window.alert(e?.response?.data?.message || 'Failed to update card status.')
    }
  }

  const deleteGuestProduct = async (product: GuestAdminProduct) => {
    if (!isAdmin) return
    if (!window.confirm(`Delete ${product.name}? This only works if it has never been sold.`)) return
    try {
      await api.delete(`/guest/admin/products/${product.id}`)
      await load()
      showToast('success', 'Card deleted.')
    } catch (e: any) {
      window.alert(e?.response?.data?.message || 'Failed to delete card.')
    }
  }

  const submitSpace = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isAdmin) return
    if (editingSpace) await api.put(`/spaces/${editingSpace.id}`, spaceForm)
    else await api.post('/spaces', spaceForm)
    setEditingSpace(null)
    setSpaceForm({ name: '', description: '' })
    setShowSpaceModal(false)
    load()
  }

  const removeSpace = async (id: number) => {
    if (!isAdmin) return
    if (!window.confirm('Delete this space?')) return
    await api.delete(`/spaces/${id}`)
    load()
  }

  const submitPaymentMethod = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isAdmin) return
    const payload = {
      name: paymentMethodForm.name.trim(),
      paymentType: paymentMethodForm.paymentType,
      fiscalized: paymentMethodForm.fiscalized,
      stripeEnabled: paymentMethodForm.stripeEnabled,
      guestEnabled: paymentMethodForm.guestEnabled,
      guestDisplayOrder: paymentMethodForm.guestDisplayOrder,
    }
    if (editingPaymentMethodId) await api.put(`/billing/payment-methods/${editingPaymentMethodId}`, payload)
    else await api.post('/billing/payment-methods', payload)
    setEditingPaymentMethodId(null)
    setPaymentMethodForm({ name: '', paymentType: 'CASH', fiscalized: true, stripeEnabled: false, guestEnabled: false, guestDisplayOrder: 0 })
    setShowPaymentMethodModal(false)
    load()
  }

  const deletePaymentMethod = async (id: number) => {
    if (!isAdmin) return
    if (!window.confirm('Delete this payment method?')) return
    await api.delete(`/billing/payment-methods/${id}`)
    load()
  }

  const openPaymentMethodEdit = (method: PaymentMethod) => {
    setEditingPaymentMethodId(method.id)
    setPaymentMethodForm({
      name: method.name,
      paymentType: method.paymentType,
      fiscalized: method.fiscalized,
      stripeEnabled: method.stripeEnabled,
      guestEnabled: method.guestEnabled,
      guestDisplayOrder: method.guestDisplayOrder,
    })
    setShowPaymentMethodModal(true)
  }

  const registerBusinessPremise = async () => {
    if (!isAdmin || registeringPremise) return
    const premiseId = (settings.FISCAL_BUSINESS_PREMISE_ID || '').trim()
    if (!premiseId) {
      setPremiseRegisterResult(t('configFiscalPremiseRequired'))
      return
    }
    setRegisteringPremise(true)
    setRegisteringPremiseId(premiseId)
    setPremiseRegisterResult('')
    try {
      const { data } = await api.post('/fiscal/premises/register')
      if (data?.success) {
        const existing = parseRegisteredPremises(settings[REGISTERED_PREMISES_KEY])
        const next = existing.includes(premiseId) ? existing : [...existing, premiseId]
        const premisesJson = JSON.stringify(next)
        await api.put('/settings', { [REGISTERED_PREMISES_KEY]: premisesJson })
        setSettings((prev) => ({ ...prev, [REGISTERED_PREMISES_KEY]: premisesJson }))
        setPremiseRegisterResult(`${t('configFiscalRegisteredSuccess')} ${data.messageId || 'n/a'}`)
      } else {
        setPremiseRegisterResult(`${t('configFiscalRegistrationFailed')} ${data?.error || t('configFiscalUnknownError')}`)
      }
    } catch (e: any) {
      setPremiseRegisterResult(`${t('configFiscalRegistrationFailed')} ${e?.response?.data?.message || e?.message || t('configFiscalUnknownError')}`)
    } finally {
      setRegisteringPremise(false)
      setRegisteringPremiseId(null)
    }
  }

  const uploadCertificate = async () => {
    if (uploadingCertificate) return
    if (!certificateFile) {
      window.alert('Please choose a certificate file first (.p12 or .pfx).')
      return
    }
    setUploadingCertificate(true)
    try {
      const formData = new FormData()
      formData.append('file', certificateFile)
      const { data } = await api.post('/fiscal/certificate', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      setCertificateMeta(data)
      setCertificateFile(null)
    } catch (e: any) {
      window.alert(e?.response?.data?.message || 'Failed to upload certificate.')
    } finally {
      setUploadingCertificate(false)
    }
  }

  const removeCertificate = async () => {
    if (!window.confirm('Remove uploaded fiscal certificate?')) return
    await api.delete('/fiscal/certificate')
    setCertificateMeta({ uploaded: false })
  }

  const registeredPremises = parseRegisteredPremises(settings[REGISTERED_PREMISES_KEY])
  const selectedPremiseId = (settings.FISCAL_BUSINESS_PREMISE_ID || '').trim()
  const selectedPremiseConfirmed = selectedPremiseId.length > 0 && registeredPremises.includes(selectedPremiseId)

  if (!isAdmin) {
    return <Navigate to={getDefaultAllowedRoute(me.packageType)} replace />
  }

  return (
    <div className="stack gap-lg">
      <div className="config-shell">
        <aside className="config-nav">
          <div className="config-nav-title">{t('settingsGroup')}</div>
          {configNavItems.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={tab === entry.id ? 'config-nav-item active' : 'config-nav-item'}
              onClick={() => setTabAndUrl(entry.id)}
            >
              <ConfigTabIcon kind={entry.icon} />
              <span>
                {entry.id === 'company'
                  ? t('tabCompany')
                  : entry.id === 'booking'
                    ? t('tabBooking')
                    : entry.id === 'billing'
                      ? t('tabBilling')
                      : entry.id === 'guestApp'
                        ? t('tabGuestApp')
                        : entry.id === 'notifications'
                        ? t('tabNotifications')
                        : entry.id === 'modules'
                          ? t('tabModules')
                          : t('tabSecurity')}
              </span>
            </button>
          ))}
        </aside>
        <div className="config-content">
      {tab === 'company' ? (
        <Card className="settings-card">
          <div className="form-grid">
            <div className="full-span">
              <strong>Company</strong>
              <p className="muted">Used on invoice PDFs. Only one company profile is stored.</p>
            </div>

            <Field label="Company name"><input value={settings.COMPANY_NAME || ''} onChange={(e) => setSettings({ ...settings, COMPANY_NAME: e.target.value })} /></Field>
            <Field label="Address"><input value={settings.COMPANY_ADDRESS || ''} onChange={(e) => setSettings({ ...settings, COMPANY_ADDRESS: e.target.value })} /></Field>
            <Field label="Postal code"><input value={settings.COMPANY_POSTAL_CODE || ''} onChange={(e) => setSettings({ ...settings, COMPANY_POSTAL_CODE: e.target.value })} /></Field>
            <Field label="City"><input value={settings.COMPANY_CITY || ''} onChange={(e) => setSettings({ ...settings, COMPANY_CITY: e.target.value })} /></Field>
            <Field label="VAT ID"><input value={settings.COMPANY_VAT_ID || ''} onChange={(e) => setSettings({ ...settings, COMPANY_VAT_ID: e.target.value })} /></Field>
            <Field label="IBAN"><input value={settings.COMPANY_IBAN || ''} onChange={(e) => setSettings({ ...settings, COMPANY_IBAN: e.target.value })} /></Field>
            <Field label="BIC / SWIFT (optional)"><input value={settings.COMPANY_BIC || ''} onChange={(e) => setSettings({ ...settings, COMPANY_BIC: e.target.value })} /></Field>
            <Field label="Bank QR purpose code" hint="Defaults to OTHR for UPN QR."><input value={settings.BANK_QR_PURPOSE_CODE || 'OTHR'} onChange={(e) => setSettings({ ...settings, BANK_QR_PURPOSE_CODE: e.target.value })} /></Field>
            <Field label="Bank QR purpose text" hint="Printed into the payment QR payload before the folio number."><input value={settings.BANK_QR_PURPOSE_TEXT || 'PLACILO FOLIA'} onChange={(e) => setSettings({ ...settings, BANK_QR_PURPOSE_TEXT: e.target.value })} /></Field>
            <Field label="Email (optional)"><input value={settings.COMPANY_EMAIL || ''} onChange={(e) => setSettings({ ...settings, COMPANY_EMAIL: e.target.value })} /></Field>
            <Field label="Telephone (optional)"><input value={settings.COMPANY_TELEPHONE || ''} onChange={(e) => setSettings({ ...settings, COMPANY_TELEPHONE: e.target.value })} /></Field>

            <div className="form-actions full-span">
              <button onClick={saveSettings} disabled={savingSettings}>{savingSettings ? 'Saving…' : 'Save configuration'}</button>
            </div>
          </div>
        </Card>
      ) : tab === 'booking' ? (
        <div className="stack gap-lg">
          <Card className="settings-card">
            <SectionTitle>{t('configBookingScheduleSection')}</SectionTitle>
            <div className="stack gap-sm">
              <label className="config-setting-row">
                <span className="field-label config-label-with-help"><HelpHint helpId="cfg-session-length" t={t} />{t('configModulesSessionLengthLabel')}</span>
                <input type="number" min="15" step="15" value={settings.SESSION_LENGTH_MINUTES || '60'} onChange={(e) => setSettings({ ...settings, SESSION_LENGTH_MINUTES: e.target.value })} />
              </label>
              <label className="config-setting-row">
                <span className="field-label config-label-with-help"><HelpHint helpId="cfg-work-from" t={t} />{t('configModulesWorkFromLabel')}</span>
                <input type="time" value={toTimeInputValue(settings.WORKING_HOURS_START, '05:00')} onChange={(e) => setSettings({ ...settings, WORKING_HOURS_START: e.target.value })} />
              </label>
              <label className="config-setting-row">
                <span className="field-label config-label-with-help"><HelpHint helpId="cfg-work-to" t={t} />{t('configModulesWorkToLabel')}</span>
                <input type="time" value={toTimeInputValue(settings.WORKING_HOURS_END, '23:00')} onChange={(e) => setSettings({ ...settings, WORKING_HOURS_END: e.target.value })} />
              </label>
            </div>
            <div className="form-actions config-modules-save">
              <button onClick={saveSettings} disabled={savingSettings}>{savingSettings ? t('formSaving') : t('configSaveConfiguration')}</button>
            </div>
          </Card>
          {bookingSubtabsAvailable ? (
          <div className="config-booking-subtabs">
            <div className="clients-session-tabs" style={{ marginBottom: 0 }}>
              {personalModuleEnabled ? (
                <button type="button" className={bookingSubtab === 'tasks' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setBookingSubtab('tasks')}>{t('configBookingTasksTab')}</button>
              ) : null}
              {spacesModuleEnabled ? (
                <button type="button" className={bookingSubtab === 'spaces' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setBookingSubtab('spaces')}>{t('configBookingSpacesTab')}</button>
              ) : null}
            </div>
          </div>
          ) : null}

          {bookingSubtab === 'tasks' && personalModuleEnabled ? <div>
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <HelpHint helpId="cfg-personal-tasks" t={t} />
                <button type="button" className="secondary" onClick={openNewTaskPresetModal}>New</button>
              </div>
              {personalTaskPresets.length === 0 ? (
                <EmptyState title="No predefined personal tasks" text="Click New to create your first personal task preset." />
              ) : (
                <div className="simple-table-wrap">
                  <table>
                    <thead><tr><th>Name</th><th>Color</th><th /></tr></thead>
                    <tbody>
                      {personalTaskPresets.map((preset) => (
                        <tr key={preset.id}>
                          <td>{preset.name}</td>
                          <td>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ width: 16, height: 16, borderRadius: 4, background: preset.color, border: '1px solid rgba(255,255,255,0.35)' }} />
                              <span>{preset.color}</span>
                            </div>
                          </td>
                          <td className="table-actions">
                            <button className="linkish-btn" onClick={() => openEditTaskPresetModal(preset)}>Edit</button>
                            <button className="linkish-btn danger" onClick={() => deleteTaskPreset(preset.id)} disabled={savingTaskPreset}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) }
            </Card>
          </div> : null}

          {showTaskPresetModal && (
            <div className="modal-backdrop booking-side-panel-backdrop" onClick={() => { if (!savingTaskPreset) { setShowTaskPresetModal(false); setEditingTaskPresetId(null) } }}>
              <div className="modal large-modal booking-side-panel" onClick={(e) => e.stopPropagation()}>
                <div className="booking-side-panel-header">
                  <PageHeader
                    title={editingTaskPresetId ? 'Edit predefined personal task' : 'New predefined personal task'}
                    actions={<button type="button" className="secondary booking-side-panel-close" onClick={() => { if (!savingTaskPreset) { setShowTaskPresetModal(false); setEditingTaskPresetId(null) } }} aria-label="Close">×</button>}
                  />
                </div>
                <form className="form-grid booking-side-panel-body" onSubmit={submitTaskPreset}>
                  <Field label="Task name">
                    <input required value={taskPresetForm.name} onChange={(e) => setTaskPresetForm({ ...taskPresetForm, name: e.target.value })} />
                  </Field>
                  <Field label="Color">
                    <input type="color" value={normalizeHexColor(taskPresetForm.color)} onChange={(e) => setTaskPresetForm({ ...taskPresetForm, color: e.target.value })} />
                  </Field>
                  <div className="form-actions full-span booking-side-panel-footer">
                    <button type="submit" disabled={savingTaskPreset}>{savingTaskPreset ? 'Saving…' : (editingTaskPresetId ? 'Save' : 'Create')}</button>
                    <button type="button" className="secondary" disabled={savingTaskPreset} onClick={() => { setShowTaskPresetModal(false); setEditingTaskPresetId(null) }}>Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}
          {bookingSubtab === 'spaces' && spacesModuleEnabled ? <div>
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <HelpHint helpId="cfg-spaces" t={t} />
                <button type="button" className="secondary" onClick={() => { setEditingSpace(null); setSpaceForm({ name: '', description: '' }); setShowSpaceModal(true) }}>New</button>
              </div>
              {spaces.length === 0 ? <EmptyState title="No spaces" text="Click New to create your first space." /> : (
                <div className="config-entity-list-shell">
                  <div className="config-entity-mobile-list">
                    {spaces.map((space) => (
                      <article key={space.id} className="config-entity-mobile-card">
                        <div className="config-entity-mobile-card-head">
                          <div className="config-entity-name-row">
                            <span className="config-entity-avatar" aria-hidden>
                              {spaceListInitials(space.name)}
                            </span>
                            <div className="config-entity-name-stack">
                              <span className="config-entity-title">{space.name}</span>
                              <span className="config-entity-sub">ID #{space.id}</span>
                            </div>
                          </div>
                          <div className="config-entity-menu-wrap">
                            <button
                              type="button"
                              className="secondary config-entity-menu-trigger"
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenSpaceMenuId((prev) => (prev === space.id ? null : space.id))
                              }}
                              aria-label="Space actions"
                              aria-expanded={openSpaceMenuId === space.id}
                            >
                              ...
                            </button>
                            {openSpaceMenuId === space.id && (
                              <div className="config-entity-menu-popover" role="dialog" aria-label="Space actions">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setOpenSpaceMenuId(null)
                                    setEditingSpace(space)
                                    setSpaceForm({ name: space.name, description: space.description || '' })
                                    setShowSpaceModal(true)
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="danger"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setOpenSpaceMenuId(null)
                                    void removeSpace(space.id)
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="config-entity-mobile-meta">
                          <div>
                            <span>Description</span>
                            <strong>{space.description || '—'}</strong>
                          </div>
                          <div>
                            <span>Created</span>
                            <strong>{formatDate(space.createdAt)}</strong>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="simple-table-wrap config-entity-table-desktop">
                    <table>
                      <thead><tr><th>Name</th><th>Description</th><th>Created</th><th /></tr></thead>
                      <tbody>
                        {spaces.map((space) => (
                          <tr key={space.id}>
                            <td>{space.name}</td>
                            <td>{space.description || '—'}</td>
                            <td>{formatDate(space.createdAt)}</td>
                            <td className="table-actions">
                              <button className="linkish-btn" onClick={() => { setEditingSpace(space); setSpaceForm({ name: space.name, description: space.description || '' }); setShowSpaceModal(true) }}>Edit</button>
                              <button className="linkish-btn danger" onClick={() => removeSpace(space.id)}>Delete</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Card>
          </div> : null}

          {showSpaceModal && (
            <div className="modal-backdrop booking-side-panel-backdrop" onClick={() => { setShowSpaceModal(false); setEditingSpace(null) }}>
              <div className="modal large-modal booking-side-panel" onClick={(e) => e.stopPropagation()}>
                <div className="booking-side-panel-header">
                  <PageHeader title={editingSpace ? 'Edit space' : 'New space'} actions={<button type="button" className="secondary booking-side-panel-close" onClick={() => { setShowSpaceModal(false); setEditingSpace(null) }} aria-label="Close">×</button>} />
                </div>
                <form className="form-grid booking-side-panel-body" onSubmit={submitSpace}>
                  <Field label="Space name"><input required value={spaceForm.name} onChange={(e) => setSpaceForm({ ...spaceForm, name: e.target.value })} /></Field>
                  <Field label="Description"><textarea rows={6} value={spaceForm.description} onChange={(e) => setSpaceForm({ ...spaceForm, description: e.target.value })} /></Field>
                  <div className="form-actions full-span booking-side-panel-footer">
                    <button type="submit">{editingSpace ? 'Save changes' : 'Create space'}</button>
                    <button type="button" className="secondary" onClick={() => { setShowSpaceModal(false); setEditingSpace(null) }}>Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </div>
      ) : tab === 'billing' ? (
        <div className="stack gap-lg">
          <Card>
            <div className="clients-session-tabs" style={{ marginBottom: 0 }}>
              <button type="button" className={billingSubtab === 'settings' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setBillingSubtab('settings')}>
                {t('configBillingSettingsTab')}
              </button>
              <button type="button" className={billingSubtab === 'paymentMethods' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setBillingSubtab('paymentMethods')}>
                {t('configBillingPaymentMethodsTab')}
              </button>
              <button type="button" className={billingSubtab === 'paypal' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setBillingSubtab('paypal')}>
                PayPal
              </button>
              <button type="button" className={billingSubtab === 'fiscal' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setBillingSubtab('fiscal')}>
                {t('configBillingFiscalTab')}
              </button>
              <button type="button" className={`${billingSubtab === 'folioLayout' ? 'clients-session-tab active' : 'clients-session-tab'} config-billing-tab--folio-layout`} onClick={() => setBillingSubtab('folioLayout')}>
                Folio layout
              </button>
            </div>
          </Card>
          {billingSubtab === 'settings' ? (
            <Card className="settings-card">
              <SectionTitle>Invoices</SectionTitle>
              <div className="form-grid">
                <Field label="Invoice counter" hint="The next invoice number to use. Supports alphanumeric values (e.g. 1, INV-0007).">
                  <input value={settings.INVOICE_COUNTER ?? ''} onChange={(e) => setSettings({ ...settings, INVOICE_COUNTER: e.target.value })} />
                </Field>
                <Field label="Payment deadline (days)" hint="Due date is issue date + this number of days.">
                  <input type="number" min="0" step="1" value={settings.PAYMENT_DEADLINE_DAYS ?? ''} onChange={(e) => setSettings({ ...settings, PAYMENT_DEADLINE_DAYS: e.target.value })} />
                </Field>
                <div className="form-actions full-span">
                  <button type="button" onClick={saveSettings} disabled={savingSettings}>{savingSettings ? t('formSaving') : t('configSaveConfiguration')}</button>
                </div>
              </div>
            </Card>
          ) : billingSubtab === 'paymentMethods' ? (
          <Card>
            <SectionTitle action={<button type="button" className="secondary" onClick={() => { setEditingPaymentMethodId(null); setPaymentMethodForm({ name: '', paymentType: 'CASH', fiscalized: true, stripeEnabled: false, guestEnabled: false, guestDisplayOrder: 0 }); setShowPaymentMethodModal(true) }}>New</button>} />
            {paymentMethods.length === 0 ? (
              <EmptyState title="No payment methods" text="Click New to create your first payment method." />
            ) : (
              <div className="simple-table-wrap clients-table-wrap clients-table-desktop">
                <table className="clients-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Payment type</th>
                      <th>Fiscal</th>
                      <th>Stripe</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {paymentMethods.map((method) => (
                      <tr
                        key={method.id}
                        className="clients-row clients-row--clickable"
                        role="button"
                        tabIndex={0}
                        onClick={() => openPaymentMethodEdit(method)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            openPaymentMethodEdit(method)
                          }
                        }}
                      >
                        <td>{method.name}</td>
                        <td className="clients-muted">{method.paymentType === 'BANK_TRANSFER' ? 'BANK TRANSFER' : method.paymentType}</td>
                        <td className="clients-muted">{method.fiscalized ? 'On' : 'Off'}</td>
                        <td className="clients-muted">{method.stripeEnabled ? 'On' : 'Off'}</td>
                        <td className="clients-actions">
                          <div className="clients-actions-inner">
                            <button
                              type="button"
                              className="secondary clients-action-btn clients-action-btn-danger"
                              onClick={(e) => {
                                e.stopPropagation()
                                void deletePaymentMethod(method.id)
                              }}
                            >
                              {t('formDelete')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          ) : billingSubtab === 'paypal' ? (
            <Card className="settings-card">
              <SectionTitle>PayPal</SectionTitle>
              <p className="muted">Place PayPal onboarding and the tenancy merchant ID here. This is the value the guest checkout flow uses for the selected tenancy.</p>
              <div className="form-grid">
                <Field label="Connection status" hint="Updated when onboarding is started or when PayPal returns to this screen.">
                  <input value={paypalStatusLabel} readOnly />
                </Field>
                <Field label="Sandbox / live credentials" hint="These are backend env/secrets only. Merchant users never enter client credentials here.">
                  <input value={settings.PAYPAL_CREDENTIALS_CONFIGURED === 'true' ? 'Configured on backend' : 'Backend credentials required'} readOnly />
                </Field>
                <Field label="PayPal merchant ID" hint="Saved for this tenancy after seller onboarding. Guests pay the selected tenancy's PayPal account.">
                  <input value={settings.PAYPAL_MERCHANT_ID || ''} onChange={(e) => setSettings({ ...settings, PAYPAL_MERCHANT_ID: e.target.value })} placeholder="Example: 9ABCD12345EFG" />
                </Field>
                <Field label="Tracking ID" hint="Generated automatically when you click Connect PayPal. Keep it to look up onboarding later.">
                  <input value={settings.PAYPAL_TRACKING_ID || ''} onChange={(e) => setSettings({ ...settings, PAYPAL_TRACKING_ID: e.target.value })} placeholder="Auto-generated by PayPal onboarding" />
                </Field>
                <div className="full-span" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  <button type="button" onClick={startPaypalOnboarding} disabled={startingPaypalOnboarding}>{startingPaypalOnboarding ? 'Opening PayPal…' : 'Connect PayPal'}</button>
                  <button type="button" className="secondary" onClick={savePaypalConfiguration} disabled={savingSettings}>{savingSettings ? t('formSaving') : 'Save PayPal configuration'}</button>
                </div>
                <div className="full-span muted" style={{ marginTop: 4 }}>
                  Clicking <strong>Connect PayPal</strong> opens PayPal seller onboarding in a new tab and returns here afterwards. If PayPal already gave you a merchant ID, you can also paste it manually and save it here.
                </div>
              </div>
            </Card>
          ) : billingSubtab === 'fiscal' ? (
            <Card className="settings-card">
              <SectionTitle>{t('configFiscalTitle')}</SectionTitle>
              <div className="form-grid">
                <Field label={t('configFiscalEnvironment')}>
                  <select value={settings.FISCAL_ENVIRONMENT || 'TEST'} onChange={(e) => setSettings({ ...settings, FISCAL_ENVIRONMENT: e.target.value })}>
                    <option value="TEST">TEST</option>
                    <option value="PROD">PROD</option>
                  </select>
                </Field>
                <Field label={t('configFiscalTaxNumberFromVat')}>
                  <input value={(settings.COMPANY_VAT_ID || '').replace(/^SI/i, '')} readOnly />
                </Field>
                <div className="field">
                  <label className="field-label">{t('configFiscalBusinessPremiseId')}</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <div className="client-picker" style={{ minWidth: 0 }}>
                      <div className="client-search-wrap">
                        <input
                          placeholder={t('configFiscalBusinessPremiseId')}
                          value={settings.FISCAL_BUSINESS_PREMISE_ID || ''}
                          onChange={(e) => {
                            setSettings({ ...settings, FISCAL_BUSINESS_PREMISE_ID: e.target.value })
                          }}
                          onFocus={() => setPremisePickerOpen(false)}
                        />
                        <button
                          type="button"
                          className="client-search-icon"
                          aria-label="Show registered premises"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setPremisePickerOpen((v) => !v)}
                          style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', pointerEvents: 'auto' }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                        </button>
                      </div>
                      {premisePickerOpen && (
                        <div className="client-dropdown-panel" onMouseDown={(e) => e.preventDefault()}>
                          {registeredPremises.slice(0, 20).map((id) => (
                            <button
                              key={id}
                              type="button"
                              className={`client-list-item ${selectedPremiseId === id ? 'selected' : ''}`}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setSettings({ ...settings, FISCAL_BUSINESS_PREMISE_ID: id })
                                setPremisePickerOpen(false)
                              }}
                            >
                              {id}
                            </button>
                          ))}
                          {registeredPremises.length === 0 && (
                            <span className="muted">{t('configFiscalNoRegisteredPremises')}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <button type="button" className="secondary" onClick={registerBusinessPremise} disabled={registeringPremise}>
                      {registeringPremise && registeringPremiseId === selectedPremiseId ? t('configFiscalRegistering') : t('configFiscalRegister')}
                    </button>
                  </div>
                  {selectedPremiseConfirmed && <p className="muted" style={{ marginTop: 6 }}>✓ {t('configFiscalConfirmedPremise')}</p>}
                </div>
                <Field label={t('configFiscalElectronicDeviceId')}><input value={settings.FISCAL_DEVICE_ID || ''} onChange={(e) => setSettings({ ...settings, FISCAL_DEVICE_ID: e.target.value })} /></Field>
                <Field label={t('configFiscalCadastralNumber')}><input value={settings.FISCAL_CADASTRAL_NUMBER || ''} onChange={(e) => setSettings({ ...settings, FISCAL_CADASTRAL_NUMBER: e.target.value })} /></Field>
                <Field label={t('configFiscalBuildingNumber')}><input value={settings.FISCAL_BUILDING_NUMBER || ''} onChange={(e) => setSettings({ ...settings, FISCAL_BUILDING_NUMBER: e.target.value })} /></Field>
                <Field label={t('configFiscalBuildingSectionNumber')}><input value={settings.FISCAL_BUILDING_SECTION_NUMBER || ''} onChange={(e) => setSettings({ ...settings, FISCAL_BUILDING_SECTION_NUMBER: e.target.value })} /></Field>
                <Field label={t('configFiscalHouseNumber')}><input value={settings.FISCAL_HOUSE_NUMBER || ''} onChange={(e) => setSettings({ ...settings, FISCAL_HOUSE_NUMBER: e.target.value })} /></Field>
                <Field label={t('configFiscalHouseNumberAdditional')}><input value={settings.FISCAL_HOUSE_NUMBER_ADDITIONAL || ''} onChange={(e) => setSettings({ ...settings, FISCAL_HOUSE_NUMBER_ADDITIONAL: e.target.value })} /></Field>
                <Field label={t('configFiscalSoftwareSupplierTaxOptional')}><input value={settings.FISCAL_SOFTWARE_SUPPLIER_TAX_NUMBER || ''} onChange={(e) => setSettings({ ...settings, FISCAL_SOFTWARE_SUPPLIER_TAX_NUMBER: e.target.value })} /></Field>
                <Field label={t('configFiscalCertificatePassword')}><input type="password" value={settings.FISCAL_CERTIFICATE_PASSWORD || ''} onChange={(e) => setSettings({ ...settings, FISCAL_CERTIFICATE_PASSWORD: e.target.value })} /></Field>
                <Field label={t('configFiscalCertificateFile')}>
                  <input type="file" accept=".p12,.pfx,application/x-pkcs12" onChange={(e) => setCertificateFile(e.target.files?.[0] || null)} />
                </Field>
                {(settings.FISCAL_ENVIRONMENT || 'TEST') === 'TEST' ? (
                  <p className="muted full-span">
                    TEST fiscal URLs are managed globally in the Platform Admin Console.
                  </p>
                ) : (
                  <>
                    <Field label={t('configFiscalProdInvoiceUrl')}><input value={settings.FISCAL_PROD_INVOICE_URL || ''} onChange={(e) => setSettings({ ...settings, FISCAL_PROD_INVOICE_URL: e.target.value })} /></Field>
                    <Field label={t('configFiscalProdPremiseUrl')}><input value={settings.FISCAL_PROD_PREMISE_URL || ''} onChange={(e) => setSettings({ ...settings, FISCAL_PROD_PREMISE_URL: e.target.value })} /></Field>
                  </>
                )}

                <div className="form-actions full-span">
                  <button onClick={saveSettings} disabled={savingSettings}>{savingSettings ? t('formSaving') : t('configFiscalSaveSettings')}</button>
                  <button type="button" className="secondary" onClick={uploadCertificate} disabled={uploadingCertificate}>
                    {uploadingCertificate ? t('configFiscalUploadingCertificate') : t('configFiscalUploadCertificate')}
                  </button>
                  {certificateMeta?.uploaded && (
                    <button type="button" className="secondary" onClick={removeCertificate}>{t('configFiscalRemoveCertificate')}</button>
                  )}
                </div>
                {certificateMeta?.uploaded && (
                  <p className="muted full-span">
                    {t('configFiscalUploadedCertificate')}: {certificateMeta.fileName || 'certificate'}
                    {certificateMeta.uploadedAt ? ` (${t('configFiscalUploadedAt')}: ${certificateMeta.uploadedAt})` : ''}
                    {certificateMeta.expiresAt ? ` (${t('configFiscalExpiresAt')}: ${certificateMeta.expiresAt})` : ''}
                  </p>
                )}
                {premiseRegisterResult && <p className="muted full-span">{premiseRegisterResult}</p>}
              </div>
            </Card>
          ) : (
            <Card>
              <FolioLayoutEditor />
            </Card>
          )}

          {showPaymentMethodModal && (
            <div className="modal-backdrop booking-side-panel-backdrop" onClick={() => { setShowPaymentMethodModal(false); setEditingPaymentMethodId(null) }}>
              <div className="modal large-modal booking-side-panel" onClick={(e) => e.stopPropagation()}>
                <div className="booking-side-panel-header">
                  <PageHeader title={editingPaymentMethodId ? 'Edit payment method' : 'New payment method'} actions={<button type="button" className="secondary booking-side-panel-close" onClick={() => { setShowPaymentMethodModal(false); setEditingPaymentMethodId(null) }} aria-label="Close">×</button>} />
                </div>
                <form className="form-grid booking-side-panel-body" onSubmit={submitPaymentMethod}>
                  <Field label="Name"><input required value={paymentMethodForm.name} onChange={(e) => setPaymentMethodForm({ ...paymentMethodForm, name: e.target.value })} /></Field>
                  <Field label="Payment type">
                    <select
                      value={paymentMethodForm.paymentType}
                      onChange={(e) => {
                        const paymentType = e.target.value as PaymentType
                        setPaymentMethodForm({
                          ...paymentMethodForm,
                          paymentType,
                          fiscalized: paymentType !== 'CARD',
                          stripeEnabled: paymentType === 'CARD',
                        })
                      }}
                    >
                      <option value="CASH">CASH</option>
                      <option value="CARD">CARD</option>
                      <option value="BANK_TRANSFER">BANK TRANSFER</option>
                    </select>
                  </Field>
                  <Field label="Fiscalized">
                    <div className="online-live-toggle" style={{ maxWidth: 200 }}>
                      <button
                        type="button"
                        className={!paymentMethodForm.fiscalized ? 'toggle-btn active' : 'toggle-btn'}
                        onClick={() => setPaymentMethodForm({ ...paymentMethodForm, fiscalized: false })}
                      >
                        OFF
                      </button>
                      <button
                        type="button"
                        className={paymentMethodForm.fiscalized ? 'toggle-btn active' : 'toggle-btn'}
                        onClick={() => setPaymentMethodForm({ ...paymentMethodForm, fiscalized: true })}
                      >
                        ON
                      </button>
                    </div>
                    <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>When ON, creating a bill sends the invoice to the fiscal service.</p>
                  </Field>
                  <Field label="Stripe (card only)">
                    <div className="online-live-toggle" style={{ maxWidth: 200 }}>
                      <button
                        type="button"
                        className={!paymentMethodForm.stripeEnabled ? 'toggle-btn active' : 'toggle-btn'}
                        onClick={() => setPaymentMethodForm({ ...paymentMethodForm, stripeEnabled: false })}
                        disabled={paymentMethodForm.paymentType !== 'CARD'}
                      >
                        OFF
                      </button>
                      <button
                        type="button"
                        className={paymentMethodForm.stripeEnabled ? 'toggle-btn active' : 'toggle-btn'}
                        onClick={() => setPaymentMethodForm({ ...paymentMethodForm, stripeEnabled: true })}
                        disabled={paymentMethodForm.paymentType !== 'CARD'}
                      >
                        ON
                      </button>
                    </div>
                    <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>
                      {paymentMethodForm.paymentType === 'CARD'
                        ? 'When ON, card bills use Stripe payment links (Checkout) until paid.'
                        : 'Bank transfer folios use your own company IBAN and UPN QR from Configuration, not Stripe.'}
                    </p>
                  </Field>
                  <div className="form-actions full-span booking-side-panel-footer">
                    <button type="submit">{editingPaymentMethodId ? 'Save changes' : 'Create method'}</button>
                    <button type="button" className="secondary" onClick={() => { setShowPaymentMethodModal(false); setEditingPaymentMethodId(null) }}>Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      
      ) : tab === 'guestApp' ? (
        <div className="stack gap-lg">
          <Card className="settings-card">
            <SectionTitle>Guest app</SectionTitle>
            <p className="muted">Manage the guest-facing mobile app settings already used by the native guest app and guest backend.</p>
            <div className="form-grid">
              <Field label="Tenant code" hint="Guests use this code to join your tenant from the mobile app.">
                <input value={me.tenantCode || ''} readOnly />
              </Field>
              <Field label="Guest app enabled" hint="When OFF, guests cannot join or use this tenant in the guest app.">
                <div className="online-live-toggle" style={{ maxWidth: 220 }}>
                  <button type="button" className={!guestAppSettings.guestAppEnabled ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setGuestAppSettings({ ...guestAppSettings, guestAppEnabled: false })}>OFF</button>
                  <button type="button" className={guestAppSettings.guestAppEnabled ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setGuestAppSettings({ ...guestAppSettings, guestAppEnabled: true })}>ON</button>
                </div>
              </Field>
              <Field label="Public discoverable" hint="When ON, this tenant can appear in guest-app public search results.">
                <div className="online-live-toggle" style={{ maxWidth: 220 }}>
                  <button type="button" className={!guestAppSettings.publicDiscoverable ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setGuestAppSettings({ ...guestAppSettings, publicDiscoverable: false })}>OFF</button>
                  <button type="button" className={guestAppSettings.publicDiscoverable ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setGuestAppSettings({ ...guestAppSettings, publicDiscoverable: true })}>ON</button>
                </div>
              </Field>
              <Field label="Default language">
                <select value={guestAppSettings.defaultLanguage} onChange={(e) => setGuestAppSettings({ ...guestAppSettings, defaultLanguage: e.target.value === 'en' ? 'en' : 'sl' })}>
                  <option value="sl">Slovenian</option>
                  <option value="en">English</option>
                </select>
              </Field>
              <Field label="Public name"><input value={guestAppSettings.publicName} onChange={(e) => setGuestAppSettings({ ...guestAppSettings, publicName: e.target.value })} /></Field>
              <Field label="Public city"><input value={guestAppSettings.publicCity} onChange={(e) => setGuestAppSettings({ ...guestAppSettings, publicCity: e.target.value })} /></Field>
              <Field label="Public description" hint="Shown when a guest resolves the tenant code or sees this tenant in public search.">
                <textarea rows={3} value={guestAppSettings.publicDescription} onChange={(e) => setGuestAppSettings({ ...guestAppSettings, publicDescription: e.target.value })} />
              </Field>
            </div>
          </Card>

          <Card className="settings-card">
            <SectionTitle>Booking and payment rules</SectionTitle>
            <p className="muted">These rules are already enforced by the guest booking and checkout backend.</p>
            <div className="form-grid">
              <Field label="Cancel until (hours before)">
                <input type="number" min="0" step="1" value={guestBookingRules.cancelUntilHours} onChange={(e) => setGuestBookingRules({ ...guestBookingRules, cancelUntilHours: e.target.value })} />
              </Field>
              <Field label="Reschedule until (hours before)">
                <input type="number" min="0" step="1" value={guestBookingRules.rescheduleUntilHours} onChange={(e) => setGuestBookingRules({ ...guestBookingRules, rescheduleUntilHours: e.target.value })} />
              </Field>
              <Field label="Late cancel consumes credit">
                <div className="online-live-toggle" style={{ maxWidth: 220 }}>
                  <button type="button" className={!guestBookingRules.lateCancelConsumesCredit ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setGuestBookingRules({ ...guestBookingRules, lateCancelConsumesCredit: false })}>OFF</button>
                  <button type="button" className={guestBookingRules.lateCancelConsumesCredit ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setGuestBookingRules({ ...guestBookingRules, lateCancelConsumesCredit: true })}>ON</button>
                </div>
              </Field>
              <Field label="No-show consumes credit">
                <div className="online-live-toggle" style={{ maxWidth: 220 }}>
                  <button type="button" className={!guestBookingRules.noShowConsumesCredit ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setGuestBookingRules({ ...guestBookingRules, noShowConsumesCredit: false })}>OFF</button>
                  <button type="button" className={guestBookingRules.noShowConsumesCredit ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setGuestBookingRules({ ...guestBookingRules, noShowConsumesCredit: true })}>ON</button>
                </div>
              </Field>
              <Field label="Same-day bank transfer allowed">
                <div className="online-live-toggle" style={{ maxWidth: 220 }}>
                  <button type="button" className={!guestBookingRules.sameDayBankTransferAllowed ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setGuestBookingRules({ ...guestBookingRules, sameDayBankTransferAllowed: false })}>OFF</button>
                  <button type="button" className={guestBookingRules.sameDayBankTransferAllowed ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setGuestBookingRules({ ...guestBookingRules, sameDayBankTransferAllowed: true })}>ON</button>
                </div>
              </Field>
              <Field label="Bank transfer reserves slot">
                <div className="online-live-toggle" style={{ maxWidth: 220 }}>
                  <button type="button" className={!guestBookingRules.bankTransferReservesSlot ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setGuestBookingRules({ ...guestBookingRules, bankTransferReservesSlot: false })}>OFF</button>
                  <button type="button" className={guestBookingRules.bankTransferReservesSlot ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setGuestBookingRules({ ...guestBookingRules, bankTransferReservesSlot: true })}>ON</button>
                </div>
              </Field>

              <div className="full-span" style={{ marginTop: 8 }}>
                <strong>Allowed product types by payment method</strong>
                <p className="muted">These toggles control which guest product types can be paid by card or bank transfer.</p>
              </div>

              <div className="field full-span">
                <span className="field-label">Card allowed for</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {GUEST_PRODUCT_TYPES.map((productType) => (
                    <label key={`card-${productType}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={guestBookingRules.allowCardFor.includes(productType)}
                        onChange={() => setGuestBookingRules({ ...guestBookingRules, allowCardFor: toggleAllowedProductType(guestBookingRules.allowCardFor, productType) })}
                      />
                      <span>{GUEST_PRODUCT_TYPE_LABELS[productType]}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="field full-span">
                <span className="field-label">Bank transfer allowed for</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {GUEST_PRODUCT_TYPES.map((productType) => (
                    <label key={`bank-${productType}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={guestBookingRules.allowBankTransferFor.includes(productType)}
                        onChange={() => setGuestBookingRules({ ...guestBookingRules, allowBankTransferFor: toggleAllowedProductType(guestBookingRules.allowBankTransferFor, productType) })}
                      />
                      <span>{GUEST_PRODUCT_TYPE_LABELS[productType]}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card className="settings-card">
            <SectionTitle action={<button type="button" className="secondary" onClick={openNewGuestProductModal}>New card</button>}>Cards & memberships</SectionTitle>
            <p className="muted">Create memberships, visit packs, and class tickets sold in the guest mobile Wallet. Add a service type to restrict where the entitlement can be used.</p>
            {guestProducts.length === 0 ? (
              <EmptyState title="No cards yet" text="Create your first membership or visit pack to start selling it in the guest app wallet." />
            ) : (
              <div className="simple-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Service type</th>
                      <th>Price</th>
                      <th>Validity</th>
                      <th>Uses</th>
                      <th>Guest app</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {guestProducts.map((product) => (
                      <tr key={product.id}>
                        <td>
                          <div style={{ display: 'grid', gap: 4 }}>
                            <strong>{product.name}</strong>
                            <span className="muted">
                              {product.autoRenews ? 'Auto-renew enabled · ' : ''}
                              {product.bookable ? 'Requires slot in checkout' : 'Wallet product'}
                            </span>
                          </div>
                        </td>
                        <td>{productTypeLabel(product.productType)}</td>
                        <td>{product.sessionTypeName || 'Any service type'}</td>
                        <td>{currency(product.priceGross)}</td>
                        <td>{product.validityDays ? `${product.validityDays} days` : 'No expiry'}</td>
                        <td>{product.usageLimit ?? 'Unlimited'}</td>
                        <td>{product.guestVisible ? 'Visible' : 'Hidden'}</td>
                        <td>{product.active ? 'Active' : 'Archived'}</td>
                        <td className="table-actions">
                          <button className="linkish-btn" onClick={() => openEditGuestProductModal(product)}>Edit</button>
                          <button className="linkish-btn" onClick={() => void toggleGuestProductActive(product, !product.active)}>{product.active ? 'Archive' : 'Activate'}</button>
                          <button className="linkish-btn danger" onClick={() => void deleteGuestProduct(product)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {showGuestProductModal && (
            <div className="modal-backdrop booking-side-panel-backdrop" onClick={() => { if (!savingGuestProduct) { setShowGuestProductModal(false); setEditingGuestProductId(null) } }}>
              <div className="modal large-modal booking-side-panel" onClick={(e) => e.stopPropagation()}>
                <div className="booking-side-panel-header">
                  <PageHeader
                    title={editingGuestProductId ? 'Edit card' : 'New card'}
                    actions={<button type="button" className="secondary booking-side-panel-close" onClick={() => { if (!savingGuestProduct) { setShowGuestProductModal(false); setEditingGuestProductId(null) } }} aria-label="Close">×</button>}
                  />
                </div>
                <form className="form-grid booking-side-panel-body" onSubmit={submitGuestProduct}>
                  <Field label="Name">
                    <input required value={guestProductForm.name} onChange={(e) => setGuestProductForm({ ...guestProductForm, name: e.target.value })} />
                  </Field>
                  <Field label="Card type">
                    <select value={guestProductForm.productType} onChange={(e) => setGuestProductForm((current) => normalizeGuestProductFormForType(current, e.target.value as GuestAdminProductType))}>
                      {ADMIN_GUEST_PRODUCT_TYPES.map((productType) => (
                        <option key={productType} value={productType}>{productTypeLabel(productType)}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Price gross">
                    <input type="number" min="0" step="0.01" value={guestProductForm.priceGross} onChange={(e) => setGuestProductForm({ ...guestProductForm, priceGross: e.target.value })} />
                  </Field>
                  <Field label="Currency">
                    <input maxLength={3} value={guestProductForm.currency} onChange={(e) => setGuestProductForm({ ...guestProductForm, currency: e.target.value.toUpperCase() })} />
                  </Field>
                  <Field
                    label="Service type"
                    hint={guestProductForm.productType === 'CLASS_TICKET'
                      ? 'Required for class tickets.'
                      : 'Optional. When selected, this card can only be used for that service type.'}
                  >
                    <select
                      required={guestProductForm.productType === 'CLASS_TICKET'}
                      value={guestProductForm.sessionTypeId}
                      onChange={(e) => setGuestProductForm({ ...guestProductForm, sessionTypeId: e.target.value })}
                    >
                      {guestProductForm.productType !== 'CLASS_TICKET' && <option value="">Any service type</option>}
                      {guestSessionTypes.map((sessionType) => (
                        <option key={sessionType.id} value={sessionType.id}>{sessionType.name}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Sort order">
                    <input type="number" step="1" value={guestProductForm.sortOrder} onChange={(e) => setGuestProductForm({ ...guestProductForm, sortOrder: e.target.value })} />
                  </Field>
                  <Field label="Validity (days)" hint="Leave empty for no expiry.">
                    <input type="number" min="1" step="1" value={guestProductForm.validityDays} onChange={(e) => setGuestProductForm({ ...guestProductForm, validityDays: e.target.value })} />
                  </Field>
                  {guestProductForm.productType !== 'CLASS_TICKET' && (
                    <Field label="Usage limit" hint="Leave empty for unlimited usage.">
                      <input type="number" min="1" step="1" value={guestProductForm.usageLimit} onChange={(e) => setGuestProductForm({ ...guestProductForm, usageLimit: e.target.value })} />
                    </Field>
                  )}
                  <Field label="Description" hint="Shown in the guest mobile wallet buy screen.">
                    <textarea rows={4} value={guestProductForm.description} onChange={(e) => setGuestProductForm({ ...guestProductForm, description: e.target.value })} />
                  </Field>
                  <Field label="Visible in guest app">
                    <div className="online-live-toggle" style={{ maxWidth: 200 }}>
                      <button type="button" className={!guestProductForm.guestVisible ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setGuestProductForm({ ...guestProductForm, guestVisible: false })}>OFF</button>
                      <button type="button" className={guestProductForm.guestVisible ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setGuestProductForm({ ...guestProductForm, guestVisible: true })}>ON</button>
                    </div>
                  </Field>
                  <Field label="Active">
                    <div className="online-live-toggle" style={{ maxWidth: 200 }}>
                      <button type="button" className={!guestProductForm.active ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setGuestProductForm({ ...guestProductForm, active: false })}>OFF</button>
                      <button type="button" className={guestProductForm.active ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setGuestProductForm({ ...guestProductForm, active: true })}>ON</button>
                    </div>
                  </Field>
                  <Field label="Requires booking slot" hint="Only turn this on if the guest should choose a slot during checkout. Most memberships and packs should keep this OFF.">
                    <div className="online-live-toggle" style={{ maxWidth: 200 }}>
                      <button type="button" className={!guestProductForm.bookable ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setGuestProductForm({ ...guestProductForm, bookable: false })}>OFF</button>
                      <button type="button" className={guestProductForm.bookable ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setGuestProductForm({ ...guestProductForm, bookable: true })}>ON</button>
                    </div>
                  </Field>
                  {guestProductForm.productType === 'MEMBERSHIP' && (
                    <Field label="Auto-renew" hint="Available for memberships. Guests can later change this in their wallet.">
                      <div className="online-live-toggle" style={{ maxWidth: 200 }}>
                        <button type="button" className={!guestProductForm.autoRenews ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setGuestProductForm({ ...guestProductForm, autoRenews: false })}>OFF</button>
                        <button type="button" className={guestProductForm.autoRenews ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setGuestProductForm({ ...guestProductForm, autoRenews: true })}>ON</button>
                      </div>
                    </Field>
                  )}
                  <div className="form-actions full-span booking-side-panel-footer">
                    <button type="submit" disabled={savingGuestProduct}>{savingGuestProduct ? 'Saving…' : (editingGuestProductId ? 'Save changes' : 'Create card')}</button>
                    <button type="button" className="secondary" disabled={savingGuestProduct} onClick={() => { setShowGuestProductModal(false); setEditingGuestProductId(null) }}>Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <Card className="settings-card">
            <SectionTitle>Guest payment methods</SectionTitle>
            <p className="muted">Only methods enabled here are available to guests during checkout.</p>
            {paymentMethods.length === 0 ? (
              <EmptyState title="No payment methods yet" text="Create payment methods in Billing → Payment methods, then enable the ones that should appear in the guest app." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Stripe</th>
                      <th>Guest app</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentMethods.map((method) => (
                      <tr key={method.id}>
                        <td>{method.name}</td>
                        <td>{method.paymentType}</td>
                        <td>{method.paymentType === 'CARD' ? (method.stripeEnabled ? 'ON' : 'OFF') : '—'}</td>
                        <td>
                          <div className="online-live-toggle" style={{ maxWidth: 180 }}>
                            <button
                              type="button"
                              className={!method.guestEnabled ? 'toggle-btn active' : 'toggle-btn'}
                              onClick={() => setPaymentMethods(paymentMethods.map((pm) => pm.id === method.id ? { ...pm, guestEnabled: false } : pm))}
                            >
                              OFF
                            </button>
                            <button
                              type="button"
                              className={method.guestEnabled ? 'toggle-btn active' : 'toggle-btn'}
                              onClick={() => setPaymentMethods(paymentMethods.map((pm) => pm.id === method.id ? { ...pm, guestEnabled: true } : pm))}
                            >
                              ON
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="form-actions" style={{ marginTop: 16 }}>
              <button onClick={saveGuestAppConfiguration} disabled={savingSettings}>{savingSettings ? t('formSaving') : t('configSaveConfiguration')}</button>
            </div>
          </Card>
        </div>
) : tab === 'notifications' ? (
        <ConfigurationNotificationsSection
          settings={settings}
          setSettings={setSettings}
          savingSettings={savingSettings}
          onSave={saveSettings}
          t={t}
        />
      ) : tab === 'modules' ? (
        <Card className="settings-card">
          <SectionTitle>{t('tabModules')}</SectionTitle>
          <p className="muted">{t('configModulesSectionIntro')}</p>
          <div className="config-booking-modules" style={{ marginTop: 4 }}>
            <div className="stack gap-sm">
              <div className="config-module-row">
                <div className="config-module-name">
                  <HelpHint helpId="cfg-mod-spaces" t={t} />
                  <strong>{t('configModulesSpacesLabel')}</strong>
                </div>
                <button type="button" className={settings.SPACES_ENABLED === 'true' ? 'small-btn' : 'secondary small-btn'} onClick={() => setSettings({ ...settings, SPACES_ENABLED: String(settings.SPACES_ENABLED !== 'true') })}>{settings.SPACES_ENABLED === 'true' ? t('configToggleOn') : t('configToggleOff')}</button>
              </div>
              <div className="config-module-row">
                <div className="config-module-name">
                  <HelpHint helpId="cfg-mod-availability" t={t} />
                  <strong>{t('configModulesAvailabilityLabel')}</strong>
                </div>
                <button type="button" className={settings.BOOKABLE_ENABLED === 'true' ? 'small-btn' : 'secondary small-btn'} onClick={() => setSettings({ ...settings, BOOKABLE_ENABLED: String(settings.BOOKABLE_ENABLED !== 'true') })}>{settings.BOOKABLE_ENABLED === 'true' ? t('configToggleOn') : t('configToggleOff')}</button>
              </div>
              <div className="config-module-row">
                <div className="config-module-name">
                  <HelpHint helpId="cfg-mod-ai" t={t} />
                  <strong>{t('configModulesAiLabel')}</strong>
                </div>
                <button type="button" className={settings.AI_BOOKING_ENABLED !== 'false' ? 'small-btn' : 'secondary small-btn'} onClick={() => setSettings({ ...settings, AI_BOOKING_ENABLED: String(settings.AI_BOOKING_ENABLED === 'false') })}>{settings.AI_BOOKING_ENABLED !== 'false' ? t('configToggleOn') : t('configToggleOff')}</button>
              </div>
              <div className="config-module-row">
                <div className="config-module-name">
                  <HelpHint helpId="cfg-mod-personal" t={t} />
                  <strong>{t('configModulesPersonalLabel')}</strong>
                </div>
                <button
                  type="button"
                  className={settings.PERSONAL_ENABLED !== 'false' ? 'small-btn' : 'secondary small-btn'}
                  onClick={() =>
                    setSettings({
                      ...settings,
                      PERSONAL_ENABLED: String(settings.PERSONAL_ENABLED === 'false'),
                    })
                  }
                >
                  {settings.PERSONAL_ENABLED !== 'false' ? t('configToggleOn') : t('configToggleOff')}
                </button>
              </div>
              <div className="config-module-row">
                <div className="config-module-name">
                  <HelpHint helpId="cfg-mod-todos" t={t} />
                  <strong>{t('configModulesTodosLabel')}</strong>
                </div>
                <button
                  type="button"
                  className={settings.TODOS_ENABLED !== 'false' ? 'small-btn' : 'secondary small-btn'}
                  onClick={() =>
                    setSettings({
                      ...settings,
                      TODOS_ENABLED: String(settings.TODOS_ENABLED === 'false'),
                    })
                  }
                >
                  {settings.TODOS_ENABLED !== 'false' ? t('configToggleOn') : t('configToggleOff')}
                </button>
              </div>
              <div className="config-module-row">
                <div className="config-module-name">
                  <HelpHint helpId="cfg-mod-multi-space" t={t} />
                  <strong>{t('configModulesMultipleSessionsPerSpaceLabel')}</strong>
                </div>
                <button
                  type="button"
                  className={settings.MULTIPLE_SESSIONS_PER_SPACE_ENABLED === 'true' ? 'small-btn' : 'secondary small-btn'}
                  onClick={() =>
                    setSettings({
                      ...settings,
                      MULTIPLE_SESSIONS_PER_SPACE_ENABLED: String(settings.MULTIPLE_SESSIONS_PER_SPACE_ENABLED !== 'true'),
                    })
                  }
                >
                  {settings.MULTIPLE_SESSIONS_PER_SPACE_ENABLED === 'true' ? t('configToggleOn') : t('configToggleOff')}
                </button>
              </div>
              <div className="config-module-row">
                <div className="config-module-name">
                  <HelpHint helpId="cfg-mod-multi-client" t={t} />
                  <strong>{t('configModulesMultipleClientsPerSessionLabel')}</strong>
                </div>
                <button
                  type="button"
                  className={settings.MULTIPLE_CLIENTS_PER_SESSION_ENABLED === 'true' ? 'small-btn' : 'secondary small-btn'}
                  onClick={() =>
                    setSettings({
                      ...settings,
                      MULTIPLE_CLIENTS_PER_SESSION_ENABLED: String(settings.MULTIPLE_CLIENTS_PER_SESSION_ENABLED !== 'true'),
                    })
                  }
                >
                  {settings.MULTIPLE_CLIENTS_PER_SESSION_ENABLED === 'true' ? t('configToggleOn') : t('configToggleOff')}
                </button>
              </div>
              <div className="config-module-row">
                <div className="config-module-name">
                  <HelpHint helpId="cfg-mod-groups" t={t} />
                  <strong>{t('configModulesGroupBookingLabel')}</strong>
                </div>
                <button
                  type="button"
                  className={settings.GROUP_BOOKING_ENABLED === 'true' ? 'small-btn' : 'secondary small-btn'}
                  onClick={() =>
                    setSettings({
                      ...settings,
                      GROUP_BOOKING_ENABLED: String(settings.GROUP_BOOKING_ENABLED !== 'true'),
                    })
                  }
                >
                  {settings.GROUP_BOOKING_ENABLED === 'true' ? t('configToggleOn') : t('configToggleOff')}
                </button>
              </div>
            </div>
            <div className="form-actions config-modules-save">
              <button onClick={saveSettings} disabled={savingSettings}>{savingSettings ? t('formSaving') : t('configSaveConfiguration')}</button>
            </div>
          </div>
        </Card>
      ) : tab === 'security' ? (
        <SecurityPage embedded />
      ) : null}
        </div>
      </div>
    </div>
  )
}

