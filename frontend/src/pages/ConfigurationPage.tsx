import { useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { getStoredUser } from '../auth'
import type {
  BillingService,
  PaymentMethod,
  PaymentType,
  SessionType as SessionTypeT,
  TaxRate,
} from '../lib/types'
import { normalizePaymentMethod } from '../lib/types'
import { taxLabels } from '../lib/types'
import { Card, EmptyState, Field, PageHeader, SectionTitle } from '../components/ui'
import { useToast } from '../components/Toast'
import { currency, formatDate } from '../lib/format'
import { ConfigurationNotificationsSection } from './ConfigurationNotificationsSection'
import { FolioLayoutEditor } from './FolioLayoutEditor'
import { SecurityPage } from './SecurityPage'
import { useLocale } from '../locale'
import { getDefaultAllowedRoute } from '../lib/packageAccess'

type Tab = 'company' | 'booking' | 'billing' | 'notifications' | 'security'
type BookingSubtab = 'modules' | 'tasks' | 'spaces' | 'types'
type BillingSubtab = 'paymentMethods' | 'services' | 'fiscal' | 'folioLayout'
type PersonalTaskPreset = { id: string; name: string; color: string }

const CONFIG_TABS: Array<{ id: Tab; label: string; icon: 'company' | 'booking' | 'billing' | 'notifications' | 'security' }> = [
  { id: 'company', label: 'Company', icon: 'company' },
  { id: 'booking', label: 'Booking', icon: 'booking' },
  { id: 'billing', label: 'Billing', icon: 'billing' },
  { id: 'notifications', label: 'Notifications', icon: 'notifications' },
  { id: 'security', label: 'Security', icon: 'security' },
]

function ConfigTabIcon({ kind }: { kind: 'company' | 'booking' | 'billing' | 'notifications' | 'security' }) {
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
  if (kind === 'notifications') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
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

function HelpHint({ text }: { text: string }) {
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
type TypeServiceLine = { transactionServiceId: number; price: string }
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

export function ConfigurationPage() {
  const me = getStoredUser()!
  const isAdmin = me.role === 'ADMIN'
  const navigate = useNavigate()
  const query = useQuery()
  const { t } = useLocale()
  const { showToast } = useToast()

  const [tab, setTab] = useState<Tab>('company')
  const [bookingSubtab, setBookingSubtab] = useState<BookingSubtab>('modules')
  const [billingSubtab, setBillingSubtab] = useState<BillingSubtab>('paymentMethods')

  const visibleTabs = CONFIG_TABS

  const [settings, setSettings] = useState<Record<string, string>>({})
  const [savingSettings, setSavingSettings] = useState(false)

  const [spaces, setSpaces] = useState<Space[]>([])
  const [types, setTypes] = useState<SessionTypeT[]>([])
  const [services, setServices] = useState<BillingService[]>([])
  const [editingSpace, setEditingSpace] = useState<Space | null>(null)
  const [editingType, setEditingType] = useState<SessionTypeT | null>(null)
  const [editingServiceId, setEditingServiceId] = useState<number | null>(null)
  const [showServiceModal, setShowServiceModal] = useState(false)
  const [showSpaceModal, setShowSpaceModal] = useState(false)
  const [showTypeModal, setShowTypeModal] = useState(false)
  const [openSpaceMenuId, setOpenSpaceMenuId] = useState<number | null>(null)
  const [spaceForm, setSpaceForm] = useState({ name: '', description: '' })
  const [typeForm, setTypeForm] = useState<{ name: string; description: string; durationMinutes: number; breakMinutes: number; serviceLines: TypeServiceLine[] }>({ name: '', description: '', durationMinutes: 60, breakMinutes: 0, serviceLines: [] })
  const [serviceForm, setServiceForm] = useState<{ code: string; description: string; taxRate: TaxRate; netPrice: string }>({ code: '', description: '', taxRate: 'VAT_22', netPrice: '0.00' })
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
  }>({ name: '', paymentType: 'CASH', fiscalized: true, stripeEnabled: false })
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
    if (q === 'consultants') {
      navigate('/consultants', { replace: true })
      return
    }
    if (q === 'company' || q === 'booking' || q === 'billing' || q === 'notifications' || q === 'security') setTab(q)
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
    const [settingsRes, spacesRes, typesRes, servicesRes, paymentMethodsRes, certificateMetaRes] = await Promise.all([
      api.get('/settings'),
      api.get('/spaces').catch(() => ({ data: [] })),
      api.get('/types').catch(() => ({ data: [] })),
      api.get('/billing/services').catch(() => ({ data: [] })),
      api.get('/billing/payment-methods').catch(() => ({ data: [] })),
      api.get('/fiscal/certificate/meta').catch(() => ({ data: { uploaded: false } })),
    ])
    const settingsData = settingsRes.data || {}
    const fallback = getWorkingHoursFallback()
    setSettings({ ...settingsData, ...((!settingsData.WORKING_HOURS_START && !settingsData.WORKING_HOURS_END) ? fallback : {}) })
    setPersonalTaskPresets(parsePersonalTaskPresets(settingsData[PERSONAL_TASK_PRESETS_KEY]))
    setSpaces(spacesRes.data || [])
    setTypes(typesRes.data || [])
    setServices(servicesRes.data || [])
    setPaymentMethods((paymentMethodsRes.data || []).map((p: PaymentMethod) => normalizePaymentMethod(p)!))
    setCertificateMeta(certificateMetaRes.data || { uploaded: false })
  }

  useEffect(() => {
    if (isAdmin) void load()
  }, [isAdmin])

  const personalModuleEnabled = settings.PERSONAL_ENABLED !== 'false'

  useEffect(() => {
    if (!personalModuleEnabled && bookingSubtab === 'tasks') {
      setBookingSubtab('modules')
    }
  }, [personalModuleEnabled, bookingSubtab])

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

  const saveTaskPresets = async (nextPresets: PersonalTaskPreset[]) => {
    const normalizedStart = toTimeInputValue(settings.WORKING_HOURS_START, '05:00')
    const normalizedEnd = toTimeInputValue(settings.WORKING_HOURS_END, '23:00')
    const payload = {
      ...settings,
      WORKING_HOURS_START: normalizedStart,
      WORKING_HOURS_END: normalizedEnd,
      [PERSONAL_TASK_PRESETS_KEY]: serializePersonalTaskPresets(nextPresets),
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

  const serviceSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isAdmin) return
    const payload = { ...serviceForm, netPrice: Number(serviceForm.netPrice) }
    if (editingServiceId) await api.put(`/billing/services/${editingServiceId}`, payload)
    else await api.post('/billing/services', payload)
    setEditingServiceId(null)
    setServiceForm({ code: '', description: '', taxRate: 'VAT_22', netPrice: '0.00' })
    setShowServiceModal(false)
    load()
  }

  const deleteService = async (id: number) => {
    if (!isAdmin) return
    if (!window.confirm('Delete this transaction service?')) return
    await api.delete(`/billing/services/${id}`)
    load()
  }

  const submitType = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isAdmin) return
    const payload = {
      name: typeForm.name,
      description: typeForm.description,
      durationMinutes: typeForm.durationMinutes,
      breakMinutes: typeForm.breakMinutes,
      services: typeForm.serviceLines.map((l) => ({ transactionServiceId: l.transactionServiceId, price: l.price ? Number(l.price) : null })),
    }
    if (editingType) await api.put(`/types/${editingType.id}`, payload)
    else await api.post('/types', payload)
    setEditingType(null)
    setTypeForm({ name: '', description: '', durationMinutes: 60, breakMinutes: 0, serviceLines: [] })
    setShowTypeModal(false)
    load()
  }

  const removeType = async (id: number) => {
    if (!isAdmin) return
    if (!window.confirm('Delete this type?')) return
    await api.delete(`/types/${id}`)
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
    }
    if (editingPaymentMethodId) await api.put(`/billing/payment-methods/${editingPaymentMethodId}`, payload)
    else await api.post('/billing/payment-methods', payload)
    setEditingPaymentMethodId(null)
    setPaymentMethodForm({ name: '', paymentType: 'CASH', fiscalized: true, stripeEnabled: false })
    setShowPaymentMethodModal(false)
    load()
  }

  const deletePaymentMethod = async (id: number) => {
    if (!isAdmin) return
    if (!window.confirm('Delete this payment method?')) return
    await api.delete(`/billing/payment-methods/${id}`)
    load()
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
          {visibleTabs.map((entry) => (
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
                      : entry.id === 'notifications'
                        ? t('tabNotifications')
                        : t('tabSecurity')}
              </span>
            </button>
          ))}
        </aside>
        <div className="config-content">
      {tab === 'company' ? (
        <Card className="settings-card">
          <SectionTitle>Invoices</SectionTitle>
          <div className="form-grid">
            <Field label="Invoice counter" hint="The next invoice number to use. Supports alphanumeric values (e.g. 1, INV-0007).">
              <input value={settings.INVOICE_COUNTER || '1'} onChange={(e) => setSettings({ ...settings, INVOICE_COUNTER: e.target.value })} />
            </Field>
            <Field label="Payment deadline (days)" hint="Due date is issue date + this number of days.">
              <input type="number" min="0" step="1" value={settings.PAYMENT_DEADLINE_DAYS || '15'} onChange={(e) => setSettings({ ...settings, PAYMENT_DEADLINE_DAYS: e.target.value })} />
            </Field>

            <div className="full-span" style={{ marginTop: 8 }}>
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
          <div className="config-booking-subtabs">
            <div className="clients-session-tabs" style={{ marginBottom: 0 }}>
              <button type="button" className={bookingSubtab === 'modules' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setBookingSubtab('modules')}>{t('configBookingModulesTab')}</button>
              {personalModuleEnabled ? (
                <button type="button" className={bookingSubtab === 'tasks' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setBookingSubtab('tasks')}>{t('configBookingTasksTab')}</button>
              ) : null}
              <button type="button" className={bookingSubtab === 'spaces' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setBookingSubtab('spaces')}>{t('configBookingSpacesTab')}</button>
              <button type="button" className={bookingSubtab === 'types' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setBookingSubtab('types')}>{t('configBookingTypesTab')}</button>
            </div>
          </div>
          {bookingSubtab === 'modules' && (
            <div className="config-booking-modules">
              <div className="stack gap-sm">
                <div className="config-module-row">
                  <div className="config-module-name">
                    <HelpHint text={t('configModulesSpacesHelp')} />
                    <strong>{t('configModulesSpacesLabel')}</strong>
                  </div>
                  <button type="button" className={settings.SPACES_ENABLED === 'true' ? 'small-btn' : 'secondary small-btn'} onClick={() => setSettings({ ...settings, SPACES_ENABLED: String(settings.SPACES_ENABLED !== 'true') })}>{settings.SPACES_ENABLED === 'true' ? t('configToggleOn') : t('configToggleOff')}</button>
                </div>
                <div className="config-module-row">
                  <div className="config-module-name">
                    <HelpHint text={t('configModulesTypesHelp')} />
                    <strong>{t('configModulesTypesLabel')}</strong>
                  </div>
                  <button type="button" className={settings.TYPES_ENABLED === 'true' ? 'small-btn' : 'secondary small-btn'} onClick={() => setSettings({ ...settings, TYPES_ENABLED: String(settings.TYPES_ENABLED !== 'true') })}>{settings.TYPES_ENABLED === 'true' ? t('configToggleOn') : t('configToggleOff')}</button>
                </div>
                <div className="config-module-row">
                  <div className="config-module-name">
                    <HelpHint text={t('configModulesAvailabilityHelp')} />
                    <strong>{t('configModulesAvailabilityLabel')}</strong>
                  </div>
                  <button type="button" className={settings.BOOKABLE_ENABLED === 'true' ? 'small-btn' : 'secondary small-btn'} onClick={() => setSettings({ ...settings, BOOKABLE_ENABLED: String(settings.BOOKABLE_ENABLED !== 'true') })}>{settings.BOOKABLE_ENABLED === 'true' ? t('configToggleOn') : t('configToggleOff')}</button>
                </div>
                <div className="config-module-row">
                  <div className="config-module-name">
                    <HelpHint text={t('configModulesAiHelp')} />
                    <strong>{t('configModulesAiLabel')}</strong>
                  </div>
                  <button type="button" className={settings.AI_BOOKING_ENABLED !== 'false' ? 'small-btn' : 'secondary small-btn'} onClick={() => setSettings({ ...settings, AI_BOOKING_ENABLED: String(settings.AI_BOOKING_ENABLED === 'false') })}>{settings.AI_BOOKING_ENABLED !== 'false' ? t('configToggleOn') : t('configToggleOff')}</button>
                </div>
                <div className="config-module-row">
                  <div className="config-module-name">
                    <HelpHint text={t('configModulesPersonalHelp')} />
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
                    <HelpHint text={t('configModulesTodosHelp')} />
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
                <label className="config-setting-row">
                  <span className="field-label config-label-with-help"><HelpHint text={t('configModulesSessionLengthHelp')} />{t('configModulesSessionLengthLabel')}</span>
                  <input type="number" min="15" step="15" value={settings.SESSION_LENGTH_MINUTES || '60'} onChange={(e) => setSettings({ ...settings, SESSION_LENGTH_MINUTES: e.target.value })} />
                </label>
                <label className="config-setting-row">
                  <span className="field-label config-label-with-help"><HelpHint text={t('configModulesWorkFromHelp')} />{t('configModulesWorkFromLabel')}</span>
                  <input type="time" value={toTimeInputValue(settings.WORKING_HOURS_START, '05:00')} onChange={(e) => setSettings({ ...settings, WORKING_HOURS_START: e.target.value })} />
                </label>
                <label className="config-setting-row">
                  <span className="field-label config-label-with-help"><HelpHint text={t('configModulesWorkToHelp')} />{t('configModulesWorkToLabel')}</span>
                  <input type="time" value={toTimeInputValue(settings.WORKING_HOURS_END, '23:00')} onChange={(e) => setSettings({ ...settings, WORKING_HOURS_END: e.target.value })} />
                </label>
              </div>
              <div className="form-actions config-modules-save">
                <button onClick={saveSettings} disabled={savingSettings}>{savingSettings ? t('formSaving') : t('configSaveConfiguration')}</button>
              </div>
            </div>
          )}

          {bookingSubtab === 'tasks' && <div>
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <HelpHint text={t('configPersonalTasksHelp')} />
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
          </div>}

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
          {bookingSubtab === 'spaces' && <div>
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <HelpHint text={t('configSpacesHelp')} />
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
          </div>}

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

          {bookingSubtab === 'types' && <div>
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <HelpHint text={t('configTypesHelp')} />
                <button type="button" className="secondary" onClick={() => { setEditingType(null); setTypeForm({ name: '', description: '', durationMinutes: 60, breakMinutes: 0, serviceLines: [] }); setShowTypeModal(true) }}>New</button>
              </div>
              {types.length === 0 ? <EmptyState title="No session types" text="Click New to create your first type." /> : (
                <div className="simple-table-wrap">
                  <table>
                    <thead><tr><th>Name</th><th>Description</th><th>Duration</th><th>Break</th><th>Services</th><th>Created</th><th /></tr></thead>
                    <tbody>
                      {types.map((type) => (
                        <tr key={type.id}>
                          <td>{type.name}</td>
                          <td>{type.description || '—'}</td>
                          <td>{type.durationMinutes ?? 60} min</td>
                          <td>{type.breakMinutes ?? 0} min</td>
                          <td>
                            {(!type.linkedServices || type.linkedServices.length === 0) ? '—' : type.linkedServices.map((ls) => `${ls.code} ${ls.price != null ? `(${currency(ls.price)})` : ''}`).join(', ')}
                          </td>
                          <td>{formatDate(type.createdAt)}</td>
                          <td className="table-actions">
                            <button className="linkish-btn" onClick={() => {
                              setEditingType(type)
                              setTypeForm({
                                name: type.name,
                                description: type.description || '',
                                durationMinutes: type.durationMinutes ?? 60,
                                breakMinutes: type.breakMinutes ?? 0,
                                serviceLines: (type.linkedServices || []).map((ls) => ({ transactionServiceId: ls.transactionServiceId, price: ls.price != null ? String(ls.price) : '' })),
                              })
                              setShowTypeModal(true)
                            }}>Edit</button>
                            <button className="linkish-btn danger" onClick={() => removeType(type.id)}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>}

          {showTypeModal && (
            <div className="modal-backdrop booking-side-panel-backdrop" onClick={() => { setShowTypeModal(false); setEditingType(null) }}>
              <div className="modal large-modal booking-side-panel" onClick={(e) => e.stopPropagation()}>
                <div className="booking-side-panel-header">
                  <PageHeader title={editingType ? 'Edit type' : 'New type'} actions={<button type="button" className="secondary booking-side-panel-close" onClick={() => { setShowTypeModal(false); setEditingType(null) }} aria-label="Close">×</button>} />
                </div>
                <form className="form-grid booking-side-panel-body config-type-panel-form" onSubmit={submitType}>
                  <div className="config-type-panel-hero full-span">
                    <div>
                      <strong>{editingType ? 'Update booking rules' : 'Create a new booking type'}</strong>
                      <p>Duration is the visible session block. Break adds unavailable hatch time right after the session.</p>
                    </div>
                  </div>
                  <Field label="Type name"><input required value={typeForm.name} onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })} /></Field>
                  <Field label="Description"><textarea rows={4} value={typeForm.description} onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })} /></Field>
                  <div className="full-span config-type-panel-timing-grid">
                    <Field label="Duration (minutes)" hint="Booked session block shown on the calendar.">
                      <input type="number" min="0" step="5" value={typeForm.durationMinutes} onChange={(e) => setTypeForm({ ...typeForm, durationMinutes: Number(e.target.value) })} />
                    </Field>
                    <Field label="Break (minutes)" hint="Unavailable time shown as diagonal lines after the session.">
                      <input type="number" min="0" step="5" value={typeForm.breakMinutes} onChange={(e) => setTypeForm({ ...typeForm, breakMinutes: Number(e.target.value) })} />
                    </Field>
                  </div>
                  <div className="full-span stack gap-sm config-type-panel-services">
                    <SectionTitle action={<button type="button" className="secondary small-btn" disabled={services.length === 0} onClick={() => { const s = services[0]; if (s) setTypeForm({ ...typeForm, serviceLines: [...typeForm.serviceLines, { transactionServiceId: s.id, price: String(s.netPrice) }] }) }}>Add service</button>}>Transaction services</SectionTitle>
                    <p className="muted">Link one or more transaction services with optional price override. Leave price empty to use the service default.</p>
                    {typeForm.serviceLines.length === 0 ? <EmptyState title="No services linked" text="Add one or more transaction services." /> : typeForm.serviceLines.map((line, idx) => (
                      <div key={idx} className="inline-form billing-row config-type-service-row">
                        <select value={line.transactionServiceId} onChange={(e) => {
                          const id = Number(e.target.value)
                          const svc = services.find((s) => s.id === id)
                          const next = [...typeForm.serviceLines]
                          next[idx] = { transactionServiceId: id, price: svc ? String(svc.netPrice) : '' }
                          setTypeForm({ ...typeForm, serviceLines: next })
                        }}>
                          {services.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.description}</option>)}
                        </select>
                        <input type="number" step="0.01" placeholder="Price (optional)" value={line.price} onChange={(e) => {
                          const next = [...typeForm.serviceLines]
                          next[idx].price = e.target.value
                          setTypeForm({ ...typeForm, serviceLines: next })
                        }} />
                        <button type="button" className="danger secondary slim-btn" onClick={() => setTypeForm({ ...typeForm, serviceLines: typeForm.serviceLines.filter((_, i) => i !== idx) })}>Remove</button>
                      </div>
                    ))}
                  </div>
                  <div className="form-actions full-span booking-side-panel-footer">
                    <button type="submit">{editingType ? 'Save changes' : 'Create type'}</button>
                    <button type="button" className="secondary" onClick={() => { setShowTypeModal(false); setEditingType(null) }}>Cancel</button>
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
              <button type="button" className={billingSubtab === 'paymentMethods' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setBillingSubtab('paymentMethods')}>
                {t('configBillingPaymentMethodsTab')}
              </button>
              <button type="button" className={billingSubtab === 'services' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setBillingSubtab('services')}>
                {t('configBillingServicesTab')}
              </button>
              <button type="button" className={billingSubtab === 'fiscal' ? 'clients-session-tab active' : 'clients-session-tab'} onClick={() => setBillingSubtab('fiscal')}>
                {t('configBillingFiscalTab')}
              </button>
              <button type="button" className={`${billingSubtab === 'folioLayout' ? 'clients-session-tab active' : 'clients-session-tab'} config-billing-tab--folio-layout`} onClick={() => setBillingSubtab('folioLayout')}>
                Folio layout
              </button>
            </div>
          </Card>
          {billingSubtab === 'paymentMethods' ? (
          <Card>
            <SectionTitle action={<button type="button" className="secondary" onClick={() => { setEditingPaymentMethodId(null); setPaymentMethodForm({ name: '', paymentType: 'CASH', fiscalized: true, stripeEnabled: false }); setShowPaymentMethodModal(true) }}>New</button>} />
            {paymentMethods.length === 0 ? (
              <EmptyState title="No payment methods" text="Click New to create your first payment method." />
            ) : (
              <div className="simple-table-wrap">
                <table>
                  <thead><tr><th>Name</th><th>Payment type</th><th>Fiscal</th><th>Stripe</th><th /></tr></thead>
                  <tbody>
                    {paymentMethods.map((method) => (
                      <tr key={method.id}>
                        <td>{method.name}</td>
                        <td>{method.paymentType === 'BANK_TRANSFER' ? 'BANK TRANSFER' : method.paymentType}</td>
                        <td>{method.fiscalized ? 'On' : 'Off'}</td>
                        <td>{method.stripeEnabled ? 'On' : 'Off'}</td>
                        <td className="table-actions">
                          <button
                            className="linkish-btn"
                            onClick={() => {
                              setEditingPaymentMethodId(method.id)
                              setPaymentMethodForm({
                                name: method.name,
                                paymentType: method.paymentType,
                                fiscalized: method.fiscalized,
                                stripeEnabled: method.stripeEnabled,
                              })
                              setShowPaymentMethodModal(true)
                            }}
                          >
                            Edit
                          </button>
                          <button className="linkish-btn danger" onClick={() => deletePaymentMethod(method.id)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          ) : billingSubtab === 'services' ? (
            <Card>
              <SectionTitle action={<button type="button" className="secondary" onClick={() => { setEditingServiceId(null); setServiceForm({ code: '', description: '', taxRate: 'VAT_22', netPrice: '0.00' }); setShowServiceModal(true) }}>New</button>} />
              {services.length === 0 ? <EmptyState title="No transaction services" text="Click New to create your first service." /> : (
                <div className="simple-table-wrap">
                  <table>
                    <thead><tr><th>Code</th><th>Description</th><th>Tax</th><th>Net</th><th>Gross</th><th /></tr></thead>
                    <tbody>
                      {services.map((s) => {
                        const mult = s.taxRate === 'VAT_22' ? 0.22 : s.taxRate === 'VAT_9_5' ? 0.095 : 0
                        const gross = s.netPrice * (1 + mult)
                        return (
                          <tr key={s.id}>
                            <td>{s.code}</td>
                            <td>{s.description}</td>
                            <td>{taxLabels[s.taxRate]}</td>
                            <td>{currency(s.netPrice)}</td>
                            <td>{currency(gross)}</td>
                            <td className="table-actions">
                              <button className="linkish-btn" onClick={() => { setEditingServiceId(s.id); setServiceForm({ code: s.code, description: s.description, taxRate: s.taxRate, netPrice: String(s.netPrice) }); setShowServiceModal(true) }}>Edit</button>
                              <button className="linkish-btn danger" onClick={() => deleteService(s.id)}>Delete</button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
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

          {showServiceModal && (
            <div className="modal-backdrop booking-side-panel-backdrop" onClick={() => { setShowServiceModal(false); setEditingServiceId(null) }}>
              <div className="modal large-modal booking-side-panel" onClick={(e) => e.stopPropagation()}>
                <div className="booking-side-panel-header">
                  <PageHeader title={editingServiceId ? 'Edit transaction service' : 'New transaction service'} actions={<button type="button" className="secondary booking-side-panel-close" onClick={() => { setShowServiceModal(false); setEditingServiceId(null) }} aria-label="Close">×</button>} />
                </div>
                <form className="form-grid booking-side-panel-body" onSubmit={serviceSubmit}>
                  <Field label="Transaction code"><input required value={serviceForm.code} onChange={(e) => setServiceForm({ ...serviceForm, code: e.target.value })} /></Field>
                  <Field label="Description"><input required value={serviceForm.description} onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })} /></Field>
                  <Field label="TAX rate"><select value={serviceForm.taxRate} onChange={(e) => setServiceForm({ ...serviceForm, taxRate: e.target.value as TaxRate })}>{Object.entries(taxLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                  <Field label="Net price"><input required type="number" step="0.01" value={serviceForm.netPrice} onChange={(e) => setServiceForm({ ...serviceForm, netPrice: e.target.value })} /></Field>
                  <div className="form-actions full-span booking-side-panel-footer">
                    <button type="submit">{editingServiceId ? 'Save service' : 'Create service'}</button>
                    <button type="button" className="secondary" onClick={() => { setShowServiceModal(false); setEditingServiceId(null) }}>Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      ) : tab === 'notifications' ? (
        <ConfigurationNotificationsSection
          settings={settings}
          setSettings={setSettings}
          savingSettings={savingSettings}
          onSave={saveSettings}
          t={t}
        />
      ) : tab === 'security' ? (
        <SecurityPage embedded />
      ) : null}
        </div>
      </div>
    </div>
  )
}

