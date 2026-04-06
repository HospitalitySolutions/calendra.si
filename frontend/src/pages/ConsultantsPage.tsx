import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { getStoredUser } from '../auth'
import { Card, EmptyState, Field, PageHeader, SectionTitle } from '../components/ui'
import { formatDate, fullName } from '../lib/format'
import { dayOptions, type DayOfWeek, type WorkingHoursConfig } from '../lib/types'

type UserRole = 'ADMIN' | 'CONSULTANT'

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

export function ConsultantsPage() {
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
      return nm.includes(q) || consultant.email.toLowerCase().includes(q) || consultant.role.toLowerCase().includes(q)
    })
  }, [consultants, search])

  const startCreate = () => {
    setEditing(null)
    setForm({
      ...emptyForm,
      workingHours: {
        sameForAllDays: true,
        allDays: { start: '09:00', end: '17:00' },
        byDay: {},
      },
    })
    setErrorMessage('')
    setSuccessMessage('')
    setShowFormPanel(true)
  }

  const startEdit = (c: Consultant) => {
    setEditing(c)
    const wh = c.workingHours
    setForm({
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
    })
    setErrorMessage('')
    setSuccessMessage('')
    setShowFormPanel(true)
  }

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
        <Card>
          <SectionTitle action={<button type="button" className="secondary" onClick={startCreate}>New</button>} />
          <div className="clients-toolbar">
            <div className="clients-search-wrap">
              <input
                className="clients-search-input"
                placeholder="Search consultants..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <span className="clients-search-icon" aria-hidden>
                ⌕
              </span>
            </div>
            <div className="clients-count-chip">{filteredConsultants.length} users</div>
          </div>
          {errorMessage && !showFormPanel && <div className="error">{errorMessage}</div>}
          {filteredConsultants.length === 0 ? (
            <EmptyState title="No consultants" text="Click New to create your first consultant." />
          ) : (
            <div className="simple-table-wrap clients-table-wrap">
              <table className="clients-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Created</th>
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
                      <td className="clients-muted">{c.role}</td>
                      <td className="clients-muted">{formatDate(c.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                subtitle="Company working hours in Settings control the calendar grid. Consultant hours below define when they are available (green availability on the calendar when bookable mode is on)."
                actions={
                  <button type="button" className="secondary booking-side-panel-close" onClick={() => setShowFormPanel(false)} aria-label="Close">
                    ×
                  </button>
                }
              />
            </div>
            <form className="form-grid booking-side-panel-body" onSubmit={handleSubmit}>
              {errorMessage && <div className="error full-span">{errorMessage}</div>}
              <Field label="First name">
                <input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
              </Field>
              <Field label="Last name">
                <input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
              </Field>
              <Field label="Email">
                <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field label="VAT ID" hint="For billing integrations (optional).">
                <input value={form.vatId} onChange={(e) => setForm({ ...form, vatId: e.target.value })} placeholder="e.g. SI12345678" />
              </Field>
              <Field label="Phone" hint="Used as this consultant's WhatsApp sender reference in the app.">
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="e.g. +38640111222" />
              </Field>
              <Field label="Password" hint={editing ? 'Leave blank to keep the current password.' : undefined}>
                <input required={!editing} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </Field>
              <Field label="Role">
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
                  <option value="CONSULTANT">CONSULTANT</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </Field>
              <label className="toggle-row full-span">
                <input
                  type="checkbox"
                  checked={form.consultant || form.role === 'CONSULTANT'}
                  onChange={(e) => setForm({ ...form, consultant: e.target.checked })}
                  disabled={form.role === 'CONSULTANT'}
                />
                <span>Consultant (appears in booking dropdowns)</span>
              </label>

              <div className="full-span">
                <strong className="muted">Availability (this consultant)</strong>
                <p className="muted" style={{ fontSize: '0.9rem', margin: '6px 0 0' }}>
                  Shown as green availability on the calendar (Booking / Availability modes, bookable slots enabled). Times are clipped to the company
                  calendar grid from Settings.
                </p>
              </div>
              <div className="full-span">
                <label className="toggle-row">
                  <input
                    type="checkbox"
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
                  <span>Same hours every day (Mon–Sun)</span>
                </label>
              </div>
              {form.workingHours.sameForAllDays ? (
                <div className="full-span form-row-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Field label="Start">
                    <input
                      type="time"
                      value={(form.workingHours.allDays?.start || '09:00').slice(0, 5)}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          workingHours: {
                            ...f.workingHours,
                            allDays: { start: e.target.value, end: f.workingHours.allDays?.end || '17:00' },
                          },
                        }))
                      }
                    />
                  </Field>
                  <Field label="End">
                    <input
                      type="time"
                      value={(form.workingHours.allDays?.end || '17:00').slice(0, 5)}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          workingHours: {
                            ...f.workingHours,
                            allDays: { start: f.workingHours.allDays?.start || '09:00', end: e.target.value },
                          },
                        }))
                      }
                    />
                  </Field>
                </div>
              ) : (
                <div className="full-span stack gap-sm" style={{ gap: 8 }}>
                  {dayOptions.map((day) => {
                    const row = form.workingHours.byDay?.[day]
                    const active = !!(row && row.start && row.end)
                    return (
                      <div key={day} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', gap: 8, alignItems: 'end' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={(e) => {
                              if (e.target.checked) setDayHours(day, { start: '09:00', end: '17:00' })
                              else setDayHours(day, null)
                            }}
                          />
                          <span>{day.charAt(0) + day.slice(1).toLowerCase()}</span>
                        </label>
                        <Field label="Start">
                          <input
                            type="time"
                            disabled={!active}
                            value={(row?.start || '09:00').slice(0, 5)}
                            onChange={(e) => setDayHours(day, { start: e.target.value, end: row?.end || '17:00' })}
                          />
                        </Field>
                        <Field label="End">
                          <input
                            type="time"
                            disabled={!active}
                            value={(row?.end || '17:00').slice(0, 5)}
                            onChange={(e) => setDayHours(day, { start: row?.start || '09:00', end: e.target.value })}
                          />
                        </Field>
                      </div>
                    )
                  })}
                </div>
              )}

              {successMessage && <div className="success full-span">{successMessage}</div>}
              <div className="form-actions full-span booking-side-panel-footer" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  {editing && (
                    <button type="button" className="danger secondary" disabled={saving || deleting} onClick={() => void removeEditing()}>
                      {deleting ? 'Deleting…' : 'Delete'}
                    </button>
                  )}
                </div>
                <div className="row gap" style={{ gap: 12 }}>
                  <button type="submit" disabled={saving || deleting}>
                    {saving ? 'Saving...' : editing ? 'Save changes' : 'Create consultant'}
                  </button>
                  <button type="button" className="secondary" onClick={() => setShowFormPanel(false)} disabled={saving || deleting}>
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
