import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { getStoredUser } from '../auth'
import { Card, EmptyState, Field, PageHeader } from '../components/ui'
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

function contactMailtoHref(email: string) {
  const e = email.trim()
  return e ? `mailto:${encodeURIComponent(e)}` : ''
}

function employeeListCountLabel(count: number, locale: AppLocale): string {
  if (locale !== 'sl') return `${count} ${count === 1 ? 'user' : 'users'}`
  const n = Math.abs(count) % 100
  const last = n % 10
  if (n >= 11 && n <= 14) return `${count} uporabnikov`
  if (last === 1) return `${count} uporabnik`
  if (last === 2) return `${count} uporabnika`
  if (last === 3 || last === 4) return `${count} uporabniki`
  return `${count} uporabnikov`
}

type UserRole = 'ADMIN' | 'CONSULTANT'

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
  createdAt?: string
  vatId?: string | null
  phone?: string | null
  whatsappSenderNumber?: string | null
  whatsappPhoneNumberId?: string | null
  workingHours?: WorkingHoursConfig | null
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
    workingHoursEqual(a.workingHours, b.workingHours)
  )
}

export function ConsultantsPage() {
  const { t, locale } = useLocale()
  const user = getStoredUser()
  const isAdmin = user?.role === 'ADMIN' || user?.role === ('ROLE_ADMIN' as any)
  const [consultants, setConsultants] = useState<Consultant[]>([])
  const [editing, setEditing] = useState<Consultant | null>(null)
  const [showFormPanel, setShowFormPanel] = useState(false)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<ConsultantForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isConsultantsMobile, setIsConsultantsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 450px)').matches : false,
  )
  const [formSectionTab, setFormSectionTab] = useState<ConsultantFormSectionTab>('workingHours')
  const formBaselineRef = useRef<ConsultantForm | null>(null)

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

  useEffect(() => {
    loadConsultants()
  }, [])

  const filteredConsultants = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return consultants

    return consultants.filter((consultant) => {
      const nm = `${consultant.firstName} ${consultant.lastName}`.toLowerCase()
      const roleLabel = formatRoleLabel(consultant.role, t).toLowerCase()
      return (
        nm.includes(q) ||
        consultant.email.toLowerCase().includes(q) ||
        consultant.role.toLowerCase().includes(q) ||
        roleLabel.includes(q)
      )
    })
  }, [consultants, search, t])

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
    setShowFormPanel(true)
  }

  const startEdit = (c: Consultant) => {
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
    }
    setForm(next)
    formBaselineRef.current = cloneConsultantForm(next)
    setErrorMessage('')
    setSuccessMessage('')
    setFormSectionTab('workingHours')
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
    if (!isAdmin) {
      setErrorMessage('You are not allowed to create consultants. Please log in again as admin.')
      return
    }

    setErrorMessage('')
    setSuccessMessage('')
    setSaving(true)

    try {
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
        setErrorMessage('You are not allowed to create consultants. Please log in again as admin.')
      } else if (status === 400) {
        setErrorMessage(backendMessage || 'Please check the entered fields.')
      } else {
        setErrorMessage(editing ? 'Failed to update consultant.' : 'Failed to create consultant.')
      }
    } finally {
      setSaving(false)
    }
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

  return (
    <div className="stack gap-lg">
      <div>
        <Card className={isConsultantsMobile ? 'clients-mobile-shell' : ''}>
          <div className="section-title-row" style={{ marginBottom: 12 }}>
            <h3>{t('tabConsultants')}</h3>
            <button type="button" className="secondary" onClick={startCreate}>
              {isConsultantsMobile ? t('billingNewMobile') : t('billingNew')}
            </button>
          </div>
          <div className="clients-toolbar">
            <div className="clients-search-wrap">
              <input
                className="clients-search-input"
                placeholder={t('employeesSearchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <span className="clients-search-icon" aria-hidden>
                ⌕
              </span>
            </div>
            <div className={`clients-count-chip${isConsultantsMobile ? ' clients-count-chip--mobile-open' : ''}`}>
              {employeeListCountLabel(filteredConsultants.length, locale)}
            </div>
          </div>
          {errorMessage && !showFormPanel && <div className="error">{errorMessage}</div>}
          {filteredConsultants.length === 0 ? (
            <EmptyState title={t('employeesEmptyTitle')} text={t('employeesEmptyText')} />
          ) : (
            <div className="clients-list-shell">
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
                          {(c.firstName?.[0] || '').toUpperCase()}
                          {(c.lastName?.[0] || '').toUpperCase()}
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
                      <div style={{ gridColumn: '1 / -1' }}>
                        <span>{t('employeesMetaCreated')}</span>
                        <strong>{formatDate(c.createdAt)}</strong>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="simple-table-wrap clients-table-wrap clients-table-desktop">
                <table className="clients-table">
                  <thead>
                    <tr>
                      <th>{t('employeesTableName')}</th>
                      <th>{t('loginEmailLabel')}</th>
                      <th>{t('employeesTableRole')}</th>
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
                              {(c.firstName?.[0] || '').toUpperCase()}
                              {(c.lastName?.[0] || '').toUpperCase()}
                            </span>
                            <div className="clients-name-stack">
                              <span className="clients-name">{fullName(c)}</span>
                              <span className="clients-id">ID #{c.id}</span>
                            </div>
                          </div>
                        </td>
                        <td className="clients-muted">{c.email}</td>
                        <td className="clients-muted">{formatRoleLabel(c.role, t)}</td>
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
      {showFormPanel && (
        <div className="modal-backdrop booking-side-panel-backdrop" onClick={() => setShowFormPanel(false)}>
          <div className="modal large-modal booking-side-panel" onClick={(e) => e.stopPropagation()}>
            <div className="booking-side-panel-header">
              <PageHeader
                title={editing ? 'Edit consultant' : 'New consultant'}
                actions={
                  <button type="button" className="secondary booking-side-panel-close" onClick={() => setShowFormPanel(false)} aria-label="Close">
                    ×
                  </button>
                }
              />
            </div>
            <div className="consultant-panel-stack">
              <form id="consultant-edit-form" className="form-grid booking-side-panel-body" onSubmit={handleSubmit}>
              {errorMessage && <div className="error full-span">{errorMessage}</div>}
              <Field label={t('signupFirstName')}>
                <input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              </Field>
              <Field label={t('signupLastName')}>
                <input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </Field>
              <Field label={t('loginEmailLabel')}>
                <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field label={t('employeesFormPassword')} hint={editing ? t('employeesFormPasswordHintEdit') : undefined}>
                <input required={!editing} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </Field>
              <Field label={t('employeesFormPhone')}>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder={t('employeesFormPhonePlaceholder')} />
              </Field>
              <Field label={t('employeesFormVatId')}>
                <input value={form.vatId} onChange={(e) => setForm({ ...form, vatId: e.target.value })} placeholder={t('employeesFormVatPlaceholder')} />
              </Field>
              <Field label={t('employeesFormRole')}>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
                  <option value="CONSULTANT">{t('employeesFormRoleOptionConsultant')}</option>
                  <option value="ADMIN">{t('employeesFormRoleOptionAdmin')}</option>
                </select>
              </Field>
              <div className="clients-detail-batch-switch-row full-span">
                <span>{t('employeesFormConsultantShort')}</span>
                <button
                  type="button"
                  className={`clients-batch-switch${form.consultant || form.role === 'CONSULTANT' ? ' clients-batch-switch--on' : ''}`}
                  disabled={form.role === 'CONSULTANT'}
                  aria-pressed={form.consultant || form.role === 'CONSULTANT'}
                  onClick={() => {
                    if (form.role === 'CONSULTANT') return
                    setForm({ ...form, consultant: !form.consultant })
                  }}
                >
                  {form.consultant || form.role === 'CONSULTANT' ? t('configToggleOn') : t('configToggleOff')}
                </button>
              </div>

              <div className="full-span clients-session-tabs consultant-form-tabs" role="tablist" aria-label={t('employeesFormTabsAria')}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={formSectionTab === 'workingHours'}
                  className={`clients-session-tab${formSectionTab === 'workingHours' ? ' active' : ''}`}
                  onClick={() => setFormSectionTab('workingHours')}
                >
                  {t('employeesFormTabWorkingHours')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={formSectionTab === 'permissions'}
                  className={`clients-session-tab${formSectionTab === 'permissions' ? ' active' : ''}`}
                  onClick={() => setFormSectionTab('permissions')}
                >
                  {t('employeesFormTabPermissions')}
                </button>
              </div>

              {formSectionTab === 'permissions' && (
                <div className="full-span" role="tabpanel">
                  <p className="muted" style={{ fontSize: '0.9rem', margin: 0, lineHeight: 1.5 }}>
                    {t('employeesPermissionsPlaceholder')}
                  </p>
                </div>
              )}

              {formSectionTab === 'workingHours' && (
                <>
                  <div className="full-span consultant-wh-card">
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

              {successMessage && <div className="success full-span">{successMessage}</div>}
              </form>
              <div className="form-actions booking-side-panel-footer consultant-form-footer">
                {editing && (
                  <button type="button" className="danger secondary" disabled={saving || deleting} onClick={() => void removeEditing()}>
                    {deleting ? t('employeesFormDeleting') : t('employeesFormDelete')}
                  </button>
                )}
                {isFormDirty && (
                  <button form="consultant-edit-form" type="submit" disabled={saving || deleting}>
                    {saving ? t('employeesFormSaving') : editing ? t('employeesFormSaveChanges') : t('employeesFormCreate')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
