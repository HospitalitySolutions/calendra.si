import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { getStoredUser } from '../auth'
import { Card, EmptyState, Field, PageHeader } from '../components/ui'
import { GuestConfigSaveIcon } from '../components/GuestConfigSaveIcon'
import { formatDate, fullName } from '../lib/format'
import { dayOptions, type DayOfWeek, type WorkingHoursConfig } from '../lib/types'

const EMPLOYEE_DAY_LABEL_KEY: Record<DayOfWeek, string> = {
  MONDAY: 'employeesDayMonday',
  TUESDAY: 'employeesDayTuesday',
  WEDNESDAY: 'employeesDayWednesday',
  THURSDAY: 'employeesDayThursday',
  FRIDAY: 'employeesDayFriday',
  SATURDAY: 'employeesDaySaturday',
  SUNDAY: 'employeesDaySunday',
}
import { useLocale, type AppLocale } from '../locale'

function EmployeeModernIcon({ name }: { name: 'search' | 'plus' }) {
  if (name === 'search') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M10.75 18.5a7.75 7.75 0 1 1 0-15.5 7.75 7.75 0 0 1 0 15.5Z" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m16.5 16.5 4 4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  )
}


function EmployeeFormIcon({ name }: { name: 'person' | 'clock' | 'calendar' | 'eye' | 'trash' }) {
  if (name === 'person') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M4.75 20a7.25 7.25 0 0 1 14.5 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'clock') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" strokeWidth="1.9" />
        <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (name === 'calendar') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 3v3M17 3v3M4.5 9h15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M6.5 5h11A2.5 2.5 0 0 1 20 7.5v10A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-10A2.5 2.5 0 0 1 6.5 5Z" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    )
  }

  if (name === 'trash') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 7h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7m2.5 0-.7 11A2 2 0 0 1 14.8 20H9.2a2 2 0 0 1-2-2L6.5 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2.75 12s3.25-6 9.25-6 9.25 6 9.25 6-3.25 6-9.25 6-9.25-6-9.25-6Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function contactMailtoHref(email: string) {
  const e = email.trim()
  return e ? `mailto:${encodeURIComponent(e)}` : ''
}

function employeeListCountLabel(count: number, locale: AppLocale): string {
  if (locale !== 'sl') return `${count} ${count === 1 ? 'employee' : 'employees'}`
  const n = Math.abs(count) % 100
  const last = n % 10
  if (n >= 11 && n <= 14) return `${count} zaposlenih`
  if (last === 1) return `${count} zaposlen`
  if (last === 2) return `${count} zaposlena`
  if (last === 3 || last === 4) return `${count} zaposleni`
  return `${count} zaposlenih`
}

type UserRole = 'ADMIN' | 'CONSULTANT'
type EmployeePermission = 'WALLET_ENTITLEMENT_SCAN'
const WALLET_SCANNER_PERMISSION: EmployeePermission = 'WALLET_ENTITLEMENT_SCAN'

function formatRoleLabel(role: UserRole, t: (key: string) => string) {
  return role === 'ADMIN' ? t('employeesFormRoleOptionAdmin') : t('employeesFormRoleOptionConsultant')
}

type Consultant = {
  id: number
  firstName: string
  lastName: string
  email: string
  role: UserRole
  consultant?: boolean
  active?: boolean
  avatarPath?: string | null
  createdAt?: string
  vatId?: string | null
  phone?: string | null
  whatsappSenderNumber?: string | null
  whatsappPhoneNumberId?: string | null
  workingHours?: WorkingHoursConfig | null
  permissions?: string[]
}

type ConsultantForm = {
  firstName: string
  lastName: string
  email: string
  password: string
  role: UserRole
  consultant: boolean
  vatId: string
  phone: string
  workingHours: WorkingHoursConfig
  permissions: EmployeePermission[]
}

type ConsultantFormSectionTab = 'permissions' | 'workingHours'

const defaultWh: WorkingHoursConfig = {
  sameForAllDays: true,
  allDays: { start: '09:00', end: '17:00' },
  byDay: {},
}

const emptyForm: ConsultantForm = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  role: 'CONSULTANT',
  consultant: true,
  vatId: '',
  phone: '',
  workingHours: { ...defaultWh, allDays: { ...defaultWh.allDays! } },
  permissions: [],
}

function normalizeWorkingHoursForApi(cfg: WorkingHoursConfig): WorkingHoursConfig {
  if (cfg.sameForAllDays) {
    return {
      sameForAllDays: true,
      allDays: cfg.allDays ? { start: cfg.allDays.start, end: cfg.allDays.end } : null,
      byDay: {},
    }
  }
  const byDay: WorkingHoursConfig['byDay'] = {}
  for (const day of dayOptions) {
    const v = cfg.byDay?.[day]
    byDay[day] = v && v.start && v.end ? { start: v.start, end: v.end } : null
  }
  return { sameForAllDays: false, allDays: null, byDay }
}

function cloneConsultantForm(f: ConsultantForm): ConsultantForm {
  return JSON.parse(JSON.stringify(f)) as ConsultantForm
}

function normalizeEmployeePermissions(permissions?: string[] | null): EmployeePermission[] {
  return permissions?.includes(WALLET_SCANNER_PERMISSION) ? [WALLET_SCANNER_PERMISSION] : []
}

function permissionsEqual(a: EmployeePermission[], b: EmployeePermission[]): boolean {
  if (a.length !== b.length) return false
  return a.every((permission) => b.includes(permission))
}

function togglePermission(form: ConsultantForm, permission: EmployeePermission): ConsultantForm {
  const enabled = form.permissions.includes(permission)
  return {
    ...form,
    permissions: enabled
      ? form.permissions.filter((item) => item !== permission)
      : [...form.permissions, permission],
  }
}

function workingHoursEqual(a: WorkingHoursConfig, b: WorkingHoursConfig): boolean {
  if (a.sameForAllDays !== b.sameForAllDays) return false
  if (a.sameForAllDays) {
    const x = a.allDays
    const y = b.allDays
    return (x?.start ?? '') === (y?.start ?? '') && (x?.end ?? '') === (y?.end ?? '')
  }
  for (const d of dayOptions) {
    const x = a.byDay?.[d]
    const y = b.byDay?.[d]
    if (!!x !== !!y) return false
    if (x && y && (x.start !== y.start || x.end !== y.end)) return false
  }
  return true
}

function consultantFormsEqual(a: ConsultantForm, b: ConsultantForm): boolean {
  return (
    a.firstName === b.firstName &&
    a.lastName === b.lastName &&
    a.email === b.email &&
    a.password === b.password &&
    a.role === b.role &&
    a.consultant === b.consultant &&
    a.vatId === b.vatId &&
    a.phone === b.phone &&
    workingHoursEqual(a.workingHours, b.workingHours) &&
    permissionsEqual(a.permissions, b.permissions)
  )
}

export type ConsultantsPageProps = {
  /** Consultant: edit own profile (same form as admin employee editor, limited fields). */
  selfService?: boolean
}

export function ConsultantsPage({ selfService = false }: ConsultantsPageProps) {
  const { t, locale } = useLocale()
  const navigate = useNavigate()
  const user = getStoredUser()
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN' || user?.role === ('ROLE_ADMIN' as any) || user?.role === ('ROLE_SUPER_ADMIN' as any)
  const [consultants, setConsultants] = useState<Consultant[]>([])
  const [editing, setEditing] = useState<Consultant | null>(null)
  const [showFormPanel, setShowFormPanel] = useState(false)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<'active' | 'inactive'>('active')
  const [form, setForm] = useState<ConsultantForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isConsultantsMobile, setIsConsultantsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 450px)').matches : false,
  )
  const [formSectionTab, setFormSectionTab] = useState<ConsultantFormSectionTab>('workingHours')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const formBaselineRef = useRef<ConsultantForm | null>(null)
  const [loadingSelfProfile, setLoadingSelfProfile] = useState(false)
  const [activatingEmployeeId, setActivatingEmployeeId] = useState<number | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 450px)')
    const apply = () => setIsConsultantsMobile(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  async function loadConsultants() {
    if (!isAdmin) {
      setConsultants([])
      setErrorMessage('You are not allowed to view consultants. Please log in again as admin.')
      return
    }

    setErrorMessage('')

    try {
      const response = await api.get(`/users`)
      setConsultants(response.data ?? [])
    } catch (error: any) {
      console.error('Failed to load consultants', error)

      if (error?.response?.status === 403) {
        setErrorMessage('You are not allowed to view consultants. Please log in again as admin.')
      } else {
        setErrorMessage('Failed to load consultants.')
      }
    }
  }

  const toggleConsultantActiveById = async (consultantId: number, currentlyActive: boolean) => {
    if (!isAdmin) return
    setActivatingEmployeeId(consultantId)
    setErrorMessage('')
    try {
      const action = currentlyActive ? 'deactivate' : 'activate'
      await api.patch(`/users/${consultantId}/${action}`)
      await loadConsultants()
      window.dispatchEvent(new Event('users-updated'))
    } catch (error: any) {
      const backendMessage = error?.response?.data?.message
      setErrorMessage(backendMessage || (locale === 'sl' ? 'Stanja zaposlenega ni bilo mogoče posodobiti.' : 'Failed to update employee status.'))
    } finally {
      setActivatingEmployeeId(null)
    }
  }

  useEffect(() => {
    if (selfService) return
    loadConsultants()
  }, [selfService])

  useEffect(() => {
    if (!selfService) return
    let cancelled = false
    const run = async () => {
      setLoadingSelfProfile(true)
      setErrorMessage('')
      try {
        const { data } = await api.get<Consultant>('/users/profile')
        if (cancelled || !data) return
        populateFormFromConsultant(data)
        setShowFormPanel(true)
      } catch (error: any) {
        if (!cancelled) {
          const backendMessage = error?.response?.data?.message
          setErrorMessage(backendMessage || 'Failed to load your profile.')
        }
      } finally {
        if (!cancelled) setLoadingSelfProfile(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial self profile load only
  }, [selfService])

  const filteredConsultants = useMemo(() => {
    const byStatus = consultants.filter((consultant) =>
      activeFilter === 'inactive' ? consultant.active === false : consultant.active !== false,
    )
    const q = search.trim().toLowerCase()
    if (!q) return byStatus

    return byStatus.filter((consultant) => {
      const nm = `${consultant.firstName} ${consultant.lastName}`.toLowerCase()
      const roleLabel = formatRoleLabel(consultant.role, t).toLowerCase()
      return (
        nm.includes(q) ||
        consultant.email.toLowerCase().includes(q) ||
        consultant.role.toLowerCase().includes(q) ||
        roleLabel.includes(q)
      )
    })
  }, [consultants, search, activeFilter, t])

  const startCreate = () => {
    setEditing(null)
    const next: ConsultantForm = {
      ...emptyForm,
      workingHours: {
        sameForAllDays: true,
        allDays: { start: '09:00', end: '17:00' },
        byDay: {},
      },
    }
    setForm(next)
    formBaselineRef.current = cloneConsultantForm(next)
    setErrorMessage('')
    setSuccessMessage('')
    setFormSectionTab('workingHours')
    setPasswordVisible(false)
    setShowFormPanel(true)
  }

  const populateFormFromConsultant = (c: Consultant) => {
    setEditing(c)
    const wh = c.workingHours
    const next: ConsultantForm = {
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      password: '',
      role: c.role,
      consultant: c.consultant ?? c.role === 'CONSULTANT',
      vatId: c.vatId ?? '',
      phone: c.phone ?? c.whatsappSenderNumber ?? '',
      workingHours: wh
        ? {
            sameForAllDays: wh.sameForAllDays,
            allDays: wh.allDays ? { ...wh.allDays } : { start: '09:00', end: '17:00' },
            byDay: { ...(wh.byDay || {}) },
          }
        : {
            sameForAllDays: true,
            allDays: { start: '09:00', end: '17:00' },
            byDay: {},
          },
      permissions: normalizeEmployeePermissions(c.permissions),
    }
    setForm(next)
    formBaselineRef.current = cloneConsultantForm(next)
    setErrorMessage('')
    setSuccessMessage('')
    setFormSectionTab('workingHours')
    setPasswordVisible(false)
  }

  const startEdit = (c: Consultant) => {
    populateFormFromConsultant(c)
    setShowFormPanel(true)
  }

  const isFormDirty = useMemo(() => {
    if (!showFormPanel || !formBaselineRef.current) return false
    return !consultantFormsEqual(form, formBaselineRef.current)
  }, [form, showFormPanel])

  const removeEditing = async () => {
    if (!editing) return
    if (!window.confirm(`Delete consultant ${fullName(editing)}? This cannot be undone.`)) return
    setDeleting(true)
    setErrorMessage('')
    setSuccessMessage('')
    try {
      await api.delete(`/users/${editing.id}`)
      setShowFormPanel(false)
      setEditing(null)
      setForm(emptyForm)
      await loadConsultants()
      window.dispatchEvent(new Event('users-updated'))
    } catch (error: any) {
      const backendMessage = error?.response?.data?.message
      setErrorMessage(backendMessage || 'Failed to delete consultant.')
    } finally {
      setDeleting(false)
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!isFormDirty) return
    if (!selfService && !isAdmin) {
      setErrorMessage('You are not allowed to create consultants. Please log in again as admin.')
      return
    }

    setErrorMessage('')
    setSuccessMessage('')
    setSaving(true)

    try {
      if (selfService && editing) {
        const payload = {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password || null,
          vatId: form.vatId.trim() || null,
          phone: form.phone.trim() || null,
          workingHours: normalizeWorkingHoursForApi(form.workingHours),
        }
        const { data: updated } = await api.put<Consultant>('/users/profile', payload)
        populateFormFromConsultant(updated)
        try {
          const authRes = await api.get<{ user: unknown }>('/auth/me')
          if (authRes.data?.user) {
            sessionStorage.setItem('user', JSON.stringify(authRes.data.user))
          }
        } catch {
          // Header may show stale name until next full reload; profile form is already saved.
        }
        setSuccessMessage(t('employeesSelfProfileSaved'))
        window.dispatchEvent(new Event('users-updated'))
        return
      }

      const payload: Record<string, unknown> = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password || null,
        role: form.role,
        consultant: form.consultant || form.role === 'CONSULTANT',
        vatId: form.vatId.trim() || null,
        phone: form.phone.trim() || null,
        workingHours: normalizeWorkingHoursForApi(form.workingHours),
        permissions: form.permissions,
      }

      if (editing) {
        await api.put(`/users/${editing.id}`, payload)
        setSuccessMessage('Consultant updated successfully.')
      } else {
        await api.post(`/users`, { ...payload, password: form.password })
        setSuccessMessage('Consultant created successfully.')
      }

      setEditing(null)
      setForm(emptyForm)
      setShowFormPanel(false)
      await loadConsultants()
      window.dispatchEvent(new Event('users-updated'))
    } catch (error: any) {
      const status = error?.response?.status
      const backendMessage = error?.response?.data?.message

      if (status === 403) {
        setErrorMessage(
          selfService
            ? backendMessage || 'You are not allowed to update this profile.'
            : 'You are not allowed to create consultants. Please log in again as admin.',
        )
      } else if (status === 400) {
        setErrorMessage(backendMessage || 'Please check the entered fields.')
      } else {
        setErrorMessage(
          selfService
            ? backendMessage || 'Failed to update profile.'
            : editing
              ? 'Failed to update consultant.'
              : 'Failed to create consultant.',
        )
      }
    } finally {
      setSaving(false)
    }
  }

  const dismissFormPanel = () => {
    setShowFormPanel(false)
    if (selfService) navigate('/calendar')
  }

  const setDayHours = (day: DayOfWeek, patch: { start?: string; end?: string } | null) => {
    setForm((f) => {
      const next: WorkingHoursConfig = {
        sameForAllDays: false,
        allDays: null,
        byDay: { ...(f.workingHours.byDay || {}) },
      }
      if (patch == null) {
        next.byDay![day] = null
      } else {
        const prev = f.workingHours.byDay?.[day] || { start: '09:00', end: '17:00' }
        next.byDay![day] = { start: patch.start ?? prev.start, end: patch.end ?? prev.end }
      }
      return { ...f, workingHours: next }
    })
  }

  const activeStatusLabel = locale === 'sl' ? 'Aktivna' : 'Active'
  const inactiveStatusLabel = locale === 'sl' ? 'Neaktivna' : 'Inactive'
  const formTitle = selfService ? t('myProfileTitle') : editing ? (locale === 'sl' ? 'Uredi zaposlenega' : 'Edit employee') : (locale === 'sl' ? 'Novi zaposleni' : 'New employee')
  const cancelLabel = locale === 'sl' ? 'Prekliči' : 'Cancel'
  const closeLabel = locale === 'sl' ? 'Zapri' : 'Close'
  const formPrimaryLabel = saving ? t('employeesFormSaving') : editing ? t('employeesFormSaveChanges') : (locale === 'sl' ? 'Ustvari' : 'Create')
  const formPrimaryDisabled = saving || deleting || (!!editing && !isFormDirty)
  const consultantToggleOn = form.consultant || form.role === 'CONSULTANT'
  const statusHeader = locale === 'sl' ? 'Status' : 'Status'
  const myUserId = user?.id

  return (
    <div className="stack gap-lg">
      {selfService && !showFormPanel && <PageHeader title={t('myProfileTitle')} />}
      {selfService && loadingSelfProfile && <div className="muted">{t('employeesSelfProfileLoading')}</div>}
      {selfService && !loadingSelfProfile && !showFormPanel && errorMessage && <div className="error">{errorMessage}</div>}
      {!selfService && (
        <div>
          <Card className={`clients-modern-card employees-modern-card${isConsultantsMobile ? ' clients-mobile-shell' : ''}`}>
            <div className="clients-toolbar clients-modern-toolbar employees-modern-toolbar">
              <div className="clients-search-wrap">
                <EmployeeModernIcon name="search" />
                <input
                  className="clients-search-input"
                  placeholder={t('employeesSearchPlaceholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="clients-toolbar-actions employees-toolbar-actions">
                <div className="clients-session-tabs clients-filter-tabs" style={{ marginBottom: 0 }}>
                  <button
                    type="button"
                    className="clients-session-tab active"
                    onClick={() => setActiveFilter((prev) => (prev === 'active' ? 'inactive' : 'active'))}
                    aria-pressed={activeFilter === 'active'}
                  >
                    <span className={activeFilter === 'active' ? 'clients-filter-dot clients-filter-dot--active' : 'clients-filter-dot clients-filter-dot--inactive'} />
                    {activeFilter === 'active' ? activeStatusLabel : inactiveStatusLabel}
                  </button>
                </div>
                <div className={`clients-count-chip${isConsultantsMobile ? ' clients-count-chip--mobile-open' : ''}`}>
                  {employeeListCountLabel(filteredConsultants.length, locale)}
                </div>
                <button type="button" className="clients-modern-new-btn employees-modern-new-btn" onClick={startCreate}>
                  <EmployeeModernIcon name="plus" />
                  <span>{isConsultantsMobile ? t('billingNewMobile') : t('billingNew')}</span>
                </button>
              </div>
            </div>
            {errorMessage && !showFormPanel && <div className="error">{errorMessage}</div>}
            {filteredConsultants.length === 0 ? (
              <EmptyState title={t('employeesEmptyTitle')} text={t('employeesEmptyText')} />
            ) : (
              <div className="clients-list-shell employees-list-shell">
                <div className="clients-mobile-list">
                  {filteredConsultants.map((c) => (
                    <article
                      key={c.id}
                      className="clients-mobile-card"
                      onClick={() => startEdit(c)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          startEdit(c)
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="clients-mobile-card-head">
                        <div className="clients-name-cell">
                          <span className="clients-name-avatar" aria-hidden>
                            {c.avatarPath ? (
                              <img className="clients-name-avatar-image" src={c.avatarPath} alt="" />
                            ) : (
                              <>
                                {(c.firstName?.[0] || '').toUpperCase()}
                                {(c.lastName?.[0] || '').toUpperCase()}
                              </>
                            )}
                          </span>
                          <div className="clients-name-stack">
                            <span className="clients-name">{fullName(c)}</span>
                            <span className="clients-id">ID #{c.id}</span>
                          </div>
                        </div>
                      </div>
                      <div className="clients-mobile-meta">
                        <div>
                          <span>{t('loginEmailLabel')}</span>
                          {c.email?.trim() ? (
                            <strong>
                              <a
                                href={contactMailtoHref(c.email)}
                                className="clients-contact-link"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {c.email.trim()}
                              </a>
                            </strong>
                          ) : (
                            <strong>—</strong>
                          )}
                        </div>
                        <div>
                          <span>{t('employeesMetaRole')}</span>
                          <strong>{formatRoleLabel(c.role, t)}</strong>
                        </div>
                        <div>
                          <span>{statusHeader}</span>
                          <strong>
                            <button
                              type="button"
                              className={`clients-status-pill clients-status-pill-btn${c.active === false ? ' clients-status-pill--inactive' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                void toggleConsultantActiveById(c.id, c.active !== false)
                              }}
                              disabled={
                                activatingEmployeeId === c.id ||
                                (myUserId != null && c.id === myUserId && c.active !== false)
                              }
                            >
                              <span />
                              {c.active === false ? inactiveStatusLabel : activeStatusLabel}
                            </button>
                          </strong>
                        </div>
                        <div>
                          <span>{t('employeesMetaCreated')}</span>
                          <strong>{formatDate(c.createdAt)}</strong>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="simple-table-wrap clients-table-wrap clients-table-desktop">
                  <table className="clients-table employees-table">
                    <thead>
                      <tr>
                        <th>{t('employeesTableName')}</th>
                        <th>{t('loginEmailLabel')}</th>
                        <th>{t('employeesTableRole')}</th>
                        <th>{statusHeader}</th>
                        <th>{t('employeesTableCreated')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredConsultants.map((c) => (
                        <tr
                          key={c.id}
                          className="clients-row clients-row--clickable"
                          onClick={() => startEdit(c)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              startEdit(c)
                            }
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          <td>
                            <div className="clients-name-cell">
                              <span className="clients-name-avatar" aria-hidden>
                                {c.avatarPath ? (
                                  <img className="clients-name-avatar-image" src={c.avatarPath} alt="" />
                                ) : (
                                  <>
                                    {(c.firstName?.[0] || '').toUpperCase()}
                                    {(c.lastName?.[0] || '').toUpperCase()}
                                  </>
                                )}
                              </span>
                              <div className="clients-name-stack">
                                <span className="clients-name">{fullName(c)}</span>
                                <span className="clients-id">ID #{c.id}</span>
                              </div>
                            </div>
                          </td>
                          <td className="clients-muted">{c.email}</td>
                          <td className="clients-muted">{formatRoleLabel(c.role, t)}</td>
                          <td>
                            <button
                              type="button"
                              className={`clients-status-pill clients-status-pill-btn${c.active === false ? ' clients-status-pill--inactive' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                void toggleConsultantActiveById(c.id, c.active !== false)
                              }}
                              disabled={
                                activatingEmployeeId === c.id ||
                                (myUserId != null && c.id === myUserId && c.active !== false)
                              }
                            >
                              <span />
                              {c.active === false ? inactiveStatusLabel : activeStatusLabel}
                            </button>
                          </td>
                          <td className="clients-muted">{formatDate(c.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
      {showFormPanel && (
        <div className="modal-backdrop booking-side-panel-backdrop employees-form-popup-backdrop" onClick={dismissFormPanel}>
          <div className="modal large-modal booking-side-panel employees-form-popup" onClick={(e) => e.stopPropagation()}>
            <div className="booking-side-panel-header employees-form-popup-header">
              <div className="employees-form-title-wrap">
                <span className="employees-form-title-icon" aria-hidden>
                  <EmployeeFormIcon name="person" />
                </span>
                <h2>{formTitle}</h2>
              </div>
              <button type="button" className="secondary booking-side-panel-close employees-form-close" onClick={dismissFormPanel} aria-label={closeLabel}>
                ×
              </button>
            </div>
            <div className="consultant-panel-stack employees-form-popup-stack">
              <form id="consultant-edit-form" className="form-grid booking-side-panel-body employees-form-popup-body" onSubmit={handleSubmit}>
                {errorMessage && <div className="error full-span employees-form-alert">{errorMessage}</div>}
                <Field label={t('signupFirstName')}>
                  <input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder={locale === 'sl' ? 'Vnesite ime' : 'Enter first name'} />
                </Field>
                <Field label={t('signupLastName')}>
                  <input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder={locale === 'sl' ? 'Vnesite priimek' : 'Enter last name'} />
                </Field>
                <Field label={t('loginEmailLabel')}>
                  <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder={locale === 'sl' ? 'Vnesite e-pošto' : 'Enter email'} />
                </Field>
                <Field label={t('employeesFormPassword')} hint={editing || selfService ? t('employeesFormPasswordHintEdit') : undefined}>
                  <div className="employees-password-input-wrap">
                    <input
                      required={!editing && !selfService}
                      type={passwordVisible ? 'text' : 'password'}
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder={editing || selfService ? (locale === 'sl' ? 'Vnesite novo geslo' : 'Enter new password') : (locale === 'sl' ? 'Vnesite geslo' : 'Enter password')}
                    />
                    <button
                      type="button"
                      className="employees-password-toggle"
                      aria-label={passwordVisible ? (locale === 'sl' ? 'Skrij geslo' : 'Hide password') : (locale === 'sl' ? 'Prikaži geslo' : 'Show password')}
                      aria-pressed={passwordVisible}
                      onClick={() => setPasswordVisible((visible) => !visible)}
                    >
                      <EmployeeFormIcon name="eye" />
                    </button>
                  </div>
                </Field>
                <Field label={t('employeesFormPhone')}>
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder={t('employeesFormPhonePlaceholder')} />
                </Field>
                <Field label={t('employeesFormVatId')}>
                  <input value={form.vatId} onChange={(e) => setForm({ ...form, vatId: e.target.value })} placeholder={t('employeesFormVatPlaceholder')} />
                </Field>
                {!selfService && (
                  <>
                    <Field label={t('employeesFormRole')}>
                      <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
                        <option value="CONSULTANT">{t('employeesFormRoleOptionConsultant')}</option>
                        <option value="ADMIN">{t('employeesFormRoleOptionAdmin')}</option>
                      </select>
                    </Field>
                    <div className="employee-form-consultant-row full-span">
                      <span>{t('employeesFormConsultantShort')}</span>
                      <button
                        type="button"
                        className={`employee-form-status-switch${consultantToggleOn ? ' employee-form-status-switch--on' : ''}`}
                        disabled={form.role === 'CONSULTANT'}
                        aria-pressed={consultantToggleOn}
                        onClick={() => {
                          if (form.role === 'CONSULTANT') return
                          setForm({ ...form, consultant: !form.consultant })
                        }}
                      >
                        <span className="employee-form-status-switch-text">
                          {consultantToggleOn ? t('configToggleOn') : t('configToggleOff')}
                        </span>
                        <span className="employee-form-status-switch-track" aria-hidden>
                          <span />
                        </span>
                      </button>
                    </div>
                  </>
                )}

                {!selfService && (
                  <div className="full-span clients-session-tabs consultant-form-tabs employee-form-tabs" role="tablist" aria-label={t('employeesFormTabsAria')}>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={formSectionTab === 'workingHours'}
                      className={`clients-session-tab${formSectionTab === 'workingHours' ? ' active' : ''}`}
                      onClick={() => setFormSectionTab('workingHours')}
                    >
                      <EmployeeFormIcon name="clock" />
                      {t('employeesFormTabWorkingHours')}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={formSectionTab === 'permissions'}
                      className={`clients-session-tab${formSectionTab === 'permissions' ? ' active' : ''}`}
                      onClick={() => setFormSectionTab('permissions')}
                    >
                      <EmployeeFormIcon name="calendar" />
                      {t('employeesFormTabPermissions')}
                    </button>
                  </div>
                )}

                {!selfService && formSectionTab === 'permissions' && (
                  <div className="full-span consultant-permissions-card employee-form-permissions-card" role="tabpanel">
                    <div>
                      <strong>{t('employeesPermissionWalletScannerTitle')}</strong>
                      <p className="muted" style={{ margin: '0.25rem 0 0', lineHeight: 1.45 }}>
                        {t('employeesPermissionWalletScannerText')}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={`employee-form-status-switch${form.permissions.includes(WALLET_SCANNER_PERMISSION) ? ' employee-form-status-switch--on' : ''}`}
                      aria-pressed={form.permissions.includes(WALLET_SCANNER_PERMISSION)}
                      onClick={() => setForm((current) => togglePermission(current, WALLET_SCANNER_PERMISSION))}
                    >
                      <span className="employee-form-status-switch-text">
                        {form.permissions.includes(WALLET_SCANNER_PERMISSION) ? t('configToggleOn') : t('configToggleOff')}
                      </span>
                      <span className="employee-form-status-switch-track" aria-hidden>
                        <span />
                      </span>
                    </button>
                  </div>
                )}

                {(selfService || formSectionTab === 'workingHours') && (
                  <>
                    <div className="full-span consultant-wh-card employee-form-working-card">
                      <div className="consultant-wh-card-header">
                        <span className="consultant-wh-card-header-label" id="consultant-wh-same-hours-label">
                          {t('employeesFormSameHoursEveryDay')}
                        </span>
                        <label className="consultant-wh-header-toggle repeats-toggle-switch">
                          <input
                            type="checkbox"
                            role="switch"
                            aria-labelledby="consultant-wh-same-hours-label"
                            aria-checked={form.workingHours.sameForAllDays}
                            checked={form.workingHours.sameForAllDays}
                            onChange={(e) => {
                              const same = e.target.checked
                              setForm((f) => {
                                const base = f.workingHours.allDays || { start: '09:00', end: '17:00' }
                                if (same) {
                                  return {
                                    ...f,
                                    workingHours: {
                                      sameForAllDays: true,
                                      allDays: { ...base },
                                      byDay: {},
                                    },
                                  }
                                }
                                const byDay: WorkingHoursConfig['byDay'] = {}
                                for (const d of dayOptions) {
                                  byDay[d] = { start: base.start, end: base.end }
                                }
                                return {
                                  ...f,
                                  workingHours: {
                                    sameForAllDays: false,
                                    allDays: null,
                                    byDay,
                                  },
                                }
                              })
                            }}
                          />
                          <span className="repeats-toggle-slider" aria-hidden />
                        </label>
                      </div>
                      <div className="consultant-wh-rows">
                        {form.workingHours.sameForAllDays ? (
                          <div className="consultant-wh-row">
                            <div className="consultant-wh-day-col">
                              <span className="consultant-wh-all-days-label">{t('employeesFormAllDays')}</span>
                            </div>
                            <div className="consultant-wh-time-col">
                              <label className="consultant-wh-time-label" htmlFor="wh-all-start">
                                {t('employeesFormStart')}
                              </label>
                              <div className="consultant-wh-time-input-wrap">
                                <input
                                  id="wh-all-start"
                                  className="consultant-wh-time-input"
                                  type="time"
                                  value={(form.workingHours.allDays?.start ?? '09:00').slice(0, 5)}
                                  onChange={(e) => {
                                    const v = e.target.value
                                    setForm((f) => ({
                                      ...f,
                                      workingHours: {
                                        ...f.workingHours,
                                        allDays: {
                                          start: v,
                                          end: (f.workingHours.allDays?.end || '17:00').slice(0, 5),
                                        },
                                      },
                                    }))
                                  }}
                                />
                                <span className="consultant-wh-time-icon" aria-hidden />
                              </div>
                            </div>
                            <div className="consultant-wh-time-col">
                              <label className="consultant-wh-time-label" htmlFor="wh-all-end">
                                {t('employeesFormEnd')}
                              </label>
                              <div className="consultant-wh-time-input-wrap">
                                <input
                                  id="wh-all-end"
                                  className="consultant-wh-time-input"
                                  type="time"
                                  value={(form.workingHours.allDays?.end ?? '17:00').slice(0, 5)}
                                  onChange={(e) => {
                                    const v = e.target.value
                                    setForm((f) => ({
                                      ...f,
                                      workingHours: {
                                        ...f.workingHours,
                                        allDays: {
                                          start: (f.workingHours.allDays?.start || '09:00').slice(0, 5),
                                          end: v,
                                        },
                                      },
                                    }))
                                  }}
                                />
                                <span className="consultant-wh-time-icon" aria-hidden />
                              </div>
                            </div>
                          </div>
                        ) : (
                          dayOptions.map((day) => {
                            const wh = form.workingHours
                            const row = wh.byDay?.[day]
                            const active = !!(row?.start && row?.end)
                            const startVal = (row?.start ?? '09:00').slice(0, 5)
                            const endVal = (row?.end ?? '17:00').slice(0, 5)
                            const idBase = `wh-${day.toLowerCase()}`
                            return (
                              <div
                                key={day}
                                className={`consultant-wh-row${active ? '' : ' consultant-wh-row--inactive'}`}
                              >
                                <div className="consultant-wh-day-col">
                                  <label className="consultant-wh-day-check">
                                    <input
                                      type="checkbox"
                                      checked={active}
                                      onChange={(e) => {
                                        if (e.target.checked) setDayHours(day, { start: '09:00', end: '17:00' })
                                        else setDayHours(day, null)
                                      }}
                                    />
                                    <span>{t(EMPLOYEE_DAY_LABEL_KEY[day])}</span>
                                  </label>
                                </div>
                                <div className="consultant-wh-time-col">
                                  <label className="consultant-wh-time-label" htmlFor={`${idBase}-start`}>
                                    {t('employeesFormStart')}
                                  </label>
                                  <div className="consultant-wh-time-input-wrap">
                                    <input
                                      id={`${idBase}-start`}
                                      className="consultant-wh-time-input"
                                      type="time"
                                      disabled={!active}
                                      value={startVal}
                                      onChange={(e) => setDayHours(day, { start: e.target.value, end: row?.end || '17:00' })}
                                    />
                                    <span className="consultant-wh-time-icon" aria-hidden />
                                  </div>
                                </div>
                                <div className="consultant-wh-time-col">
                                  <label className="consultant-wh-time-label" htmlFor={`${idBase}-end`}>
                                    {t('employeesFormEnd')}
                                  </label>
                                  <div className="consultant-wh-time-input-wrap">
                                    <input
                                      id={`${idBase}-end`}
                                      className="consultant-wh-time-input"
                                      type="time"
                                      disabled={!active}
                                      value={endVal}
                                      onChange={(e) => setDayHours(day, { start: row?.start || '09:00', end: e.target.value })}
                                    />
                                    <span className="consultant-wh-time-icon" aria-hidden />
                                  </div>
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </div>
                  </>
                )}

                {successMessage && <div className="success full-span employees-form-alert">{successMessage}</div>}
              </form>
              <div className="form-actions booking-side-panel-footer consultant-form-footer employees-form-popup-footer">
                <div className="employees-form-footer-left">
                  {editing && !selfService ? (
                    <button type="button" className="danger secondary employees-form-delete-btn" disabled={saving || deleting} onClick={() => void removeEditing()}>
                      <EmployeeFormIcon name="trash" />
                      {deleting ? t('employeesFormDeleting') : t('employeesFormDelete')}
                    </button>
                  ) : (
                    <button type="button" className="secondary employees-form-cancel-btn" disabled={saving || deleting} onClick={dismissFormPanel}>
                      {cancelLabel}
                    </button>
                  )}
                </div>
                <button form="consultant-edit-form" type="submit" className="gapp-primary-button" disabled={formPrimaryDisabled}>
                  <GuestConfigSaveIcon />
                  {formPrimaryLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
