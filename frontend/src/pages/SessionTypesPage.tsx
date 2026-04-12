import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { getStoredUser } from '../auth'
import type { BillingService, SessionType as SessionTypeT, TaxRate } from '../lib/types'
import { taxLabels } from '../lib/types'
import { Card, EmptyState, Field, PageHeader, SectionTitle } from '../components/ui'
import { currency, formatDate } from '../lib/format'
import { useLocale } from '../locale'
import { getDefaultAllowedRoute } from '../lib/packageAccess'

const SESSION_TYPES_SUBTAB_TRANSACTION = 'transaction-services'

type TypeServiceLine = { transactionServiceId: number; price: string }

export function SessionTypesPage() {
  const me = getStoredUser()!
  const isAdmin = me.role === 'ADMIN'
  const { t } = useLocale()
  const [searchParams, setSearchParams] = useSearchParams()
  const showTransactionServices = searchParams.get('subtab') === SESSION_TYPES_SUBTAB_TRANSACTION

  const setSessionTypesSubtab = useCallback(
    (next: 'types' | 'transactionServices') => {
      if (next === 'transactionServices') {
        setSearchParams({ subtab: SESSION_TYPES_SUBTAB_TRANSACTION }, { replace: true })
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
  const [serviceForm, setServiceForm] = useState<{ code: string; description: string; taxRate: TaxRate; netPrice: string }>({
    code: '',
    description: '',
    taxRate: 'VAT_22',
    netPrice: '0.00',
  })
  const [typeForm, setTypeForm] = useState<{
    name: string
    description: string
    durationMinutes: number
    breakMinutes: number
    serviceLines: TypeServiceLine[]
  }>({ name: '', description: '', durationMinutes: 60, breakMinutes: 0, serviceLines: [] })

  const [isSessionTypesNarrow, setIsSessionTypesNarrow] = useState(
    () => (typeof window !== 'undefined' ? window.matchMedia('(max-width: 450px)').matches : false),
  )
  const [openTypeMenuId, setOpenTypeMenuId] = useState<number | null>(null)
  const [openServiceMenuId, setOpenServiceMenuId] = useState<number | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 450px)')
    const apply = () => setIsSessionTypesNarrow(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

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

  const typesModuleEnabled = settings.TYPES_ENABLED !== 'false'

  const submitType = async (e: FormEvent) => {
    e.preventDefault()
    if (!isAdmin) return
    const payload = {
      name: typeForm.name,
      description: typeForm.description,
      durationMinutes: typeForm.durationMinutes,
      breakMinutes: typeForm.breakMinutes,
      services: typeForm.serviceLines.map((l) => ({
        transactionServiceId: l.transactionServiceId,
        price: l.price ? Number(l.price) : null,
      })),
    }
    if (editingType) await api.put(`/types/${editingType.id}`, payload)
    else await api.post('/types', payload)
    setEditingType(null)
    setTypeForm({ name: '', description: '', durationMinutes: 60, breakMinutes: 0, serviceLines: [] })
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
    const payload = { ...serviceForm, netPrice: Number(serviceForm.netPrice) }
    if (editingServiceId) await api.put(`/billing/services/${editingServiceId}`, payload)
    else await api.post('/billing/services', payload)
    setEditingServiceId(null)
    setServiceForm({ code: '', description: '', taxRate: 'VAT_22', netPrice: '0.00' })
    setShowServiceModal(false)
    void load()
  }

  const deleteService = async (id: number) => {
    if (!isAdmin) return
    if (!window.confirm('Delete this transaction service?')) return
    await api.delete(`/billing/services/${id}`)
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
    setTypeForm({
      name: type.name,
      description: type.description || '',
      durationMinutes: type.durationMinutes ?? 60,
      breakMinutes: type.breakMinutes ?? 0,
      serviceLines: (type.linkedServices || []).map((ls) => ({
        transactionServiceId: ls.transactionServiceId,
        price: ls.price != null ? String(ls.price) : '',
      })),
    })
    setShowTypeModal(true)
    setOpenTypeMenuId(null)
  }

  const openServiceEdit = (s: BillingService) => {
    setEditingServiceId(s.id)
    setServiceForm({
      code: s.code,
      description: s.description,
      taxRate: s.taxRate,
      netPrice: String(s.netPrice),
    })
    setShowServiceModal(true)
    setOpenServiceMenuId(null)
  }

  if (!typesModuleEnabled && !showTransactionServices) {
    return <Navigate to="/configuration" replace />
  }

  const typesPanelBody =
    types.length === 0 ? (
        <EmptyState title="No session types" text="Click New to create your first type." />
      ) : (
        <div className="clients-list-shell">
          <div className="clients-mobile-list">
            {types.map((type) => {
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
                  onClick={() => openTypeEdit(type)}
                >
                  <div className="clients-mobile-card-head">
                    <div className="clients-name-cell">
                      <div className="clients-name-stack">
                        <span className="clients-name">{type.name}</span>
                        <span className="clients-id">
                          {t('sessionTypesCardLabelDescription')}:{' '}
                          {type.description?.trim() ? type.description : '—'}
                        </span>
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
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="clients-mobile-meta">
                    <div>
                      <span>{t('sessionTypesCardLabelDuration')}</span>
                      <strong>{type.durationMinutes ?? 60} min</strong>
                    </div>
                    <div>
                      <span>{t('sessionTypesCardLabelBreak')}</span>
                      <strong>{type.breakMinutes ?? 0} min</strong>
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
                  <th>Name</th>
                  <th>Description</th>
                  <th>Duration</th>
                  <th>Break</th>
                  <th>Services</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {types.map((type) => (
                  <tr key={type.id}>
                    <td>{type.name}</td>
                    <td>{type.description || '—'}</td>
                    <td>{type.durationMinutes ?? 60} min</td>
                    <td>{type.breakMinutes ?? 0} min</td>
                    <td>
                      {!type.linkedServices || type.linkedServices.length === 0
                        ? '—'
                        : type.linkedServices
                            .map((ls) => `${ls.code} ${ls.price != null ? `(${currency(ls.price)})` : ''}`)
                            .join(', ')}
                    </td>
                    <td>{formatDate(type.createdAt)}</td>
                    <td className="table-actions">
                      <button type="button" className="linkish-btn" onClick={() => openTypeEdit(type)}>
                        Edit
                      </button>
                      <button type="button" className="linkish-btn danger" onClick={() => removeType(type.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )

  const transactionServicesPanelBody =
    services.length === 0 ? (
        <EmptyState title="No transaction services" text="Click New to create your first service." />
      ) : (
        <div className="clients-list-shell">
          <div className="clients-mobile-list">
            {services.map((s) => {
              const mult = s.taxRate === 'VAT_22' ? 0.22 : s.taxRate === 'VAT_9_5' ? 0.095 : 0
              const gross = s.netPrice * (1 + mult)
              return (
                <article
                  key={s.id}
                  className="clients-mobile-card"
                  onClick={() => openServiceEdit(s)}
                >
                  <div className="clients-mobile-card-head">
                    <div className="clients-name-cell">
                      <div className="clients-name-stack">
                        <span className="clients-name">{s.code}</span>
                        <span className="clients-id">
                          {t('sessionTypesTxLabelDescription')}:{' '}
                          {s.description?.trim() ? s.description : '—'}
                        </span>
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
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="clients-mobile-meta">
                    <div>
                      <span>{t('sessionTypesTxLabelTax')}</span>
                      <strong>{taxLabels[s.taxRate]}</strong>
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
                  <th>Code</th>
                  <th>Description</th>
                  <th>Tax</th>
                  <th>Net</th>
                  <th>Gross</th>
                  <th />
                </tr>
              </thead>
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
                        <button type="button" className="linkish-btn" onClick={() => openServiceEdit(s)}>
                          Edit
                        </button>
                        <button type="button" className="linkish-btn danger" onClick={() => void deleteService(s.id)}>
                          Delete
                        </button>
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
    setTypeForm({ name: '', description: '', durationMinutes: 60, breakMinutes: 0, serviceLines: [] })
    setShowTypeModal(true)
  }

  const openNewServiceModal = () => {
    setEditingServiceId(null)
    setServiceForm({ code: '', description: '', taxRate: 'VAT_22', netPrice: '0.00' })
    setShowServiceModal(true)
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
            <div className="clients-session-tabs" style={{ marginBottom: 0 }}>
              <button
                type="button"
                className={!showTransactionServices ? 'clients-session-tab active' : 'clients-session-tab'}
                onClick={() => setSessionTypesSubtab('types')}
              >
                {t('sessionTypesSubtabTypes')}
              </button>
              <button
                type="button"
                className={showTransactionServices ? 'clients-session-tab active' : 'clients-session-tab'}
                onClick={() => setSessionTypesSubtab('transactionServices')}
              >
                {t('configBillingServicesTab')}
              </button>
            </div>
            <button
              type="button"
              className="secondary"
              onClick={showTransactionServices ? openNewServiceModal : openNewTypeModal}
            >
              {isSessionTypesNarrow ? t('billingNewMobile') : t('billingNew')}
            </button>
          </div>
          {showTransactionServices ? transactionServicesPanelBody : typesPanelBody}
        </Card>
      ) : (
        <Card className={sessionTypesCardClass}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 12 }}>
            <button type="button" className="secondary" onClick={openNewServiceModal}>
              {isSessionTypesNarrow ? t('billingNewMobile') : t('billingNew')}
            </button>
          </div>
          {transactionServicesPanelBody}
        </Card>
      )}

      {showTypeModal ? (
        <div className="modal-backdrop booking-side-panel-backdrop" onClick={() => { setShowTypeModal(false); setEditingType(null) }}>
          <div className="modal large-modal booking-side-panel" onClick={(e) => e.stopPropagation()}>
            <div className="booking-side-panel-header">
              <PageHeader
                title={editingType ? 'Edit type' : 'New type'}
                actions={
                  <button
                    type="button"
                    className="secondary booking-side-panel-close"
                    onClick={() => { setShowTypeModal(false); setEditingType(null) }}
                    aria-label="Close"
                  >
                    ×
                  </button>
                }
              />
            </div>
            <form className="form-grid booking-side-panel-body config-type-panel-form" onSubmit={submitType}>
              <Field label="Type name">
                <input required value={typeForm.name} onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })} />
              </Field>
              <Field label="Description">
                <textarea rows={4} value={typeForm.description} onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })} />
              </Field>
              <div className="full-span config-type-panel-timing-grid">
                <Field label="Duration (minutes)" hint="Booked session block shown on the calendar.">
                  <input
                    type="number"
                    min={0}
                    step={5}
                    value={typeForm.durationMinutes}
                    onChange={(e) => setTypeForm({ ...typeForm, durationMinutes: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Break (minutes)" hint="Unavailable time shown as diagonal lines after the session.">
                  <input
                    type="number"
                    min={0}
                    step={5}
                    value={typeForm.breakMinutes}
                    onChange={(e) => setTypeForm({ ...typeForm, breakMinutes: Number(e.target.value) })}
                  />
                </Field>
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
                <p className="muted">Link one or more transaction services with optional price override. Leave price empty to use the service default.</p>
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
              <div className="form-actions full-span booking-side-panel-footer">
                <button type="submit">{editingType ? 'Save changes' : 'Create type'}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showServiceModal ? (
        <div className="modal-backdrop booking-side-panel-backdrop" onClick={() => { setShowServiceModal(false); setEditingServiceId(null) }}>
          <div className="modal large-modal booking-side-panel" onClick={(e) => e.stopPropagation()}>
            <div className="booking-side-panel-header">
              <PageHeader
                title={editingServiceId ? 'Edit transaction service' : 'New transaction service'}
                actions={
                  <button
                    type="button"
                    className="secondary booking-side-panel-close"
                    onClick={() => { setShowServiceModal(false); setEditingServiceId(null) }}
                    aria-label="Close"
                  >
                    ×
                  </button>
                }
              />
            </div>
            <form className="form-grid booking-side-panel-body" onSubmit={serviceSubmit}>
              <Field label="Transaction code">
                <input required value={serviceForm.code} onChange={(e) => setServiceForm({ ...serviceForm, code: e.target.value })} />
              </Field>
              <Field label="Description">
                <input required value={serviceForm.description} onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })} />
              </Field>
              <Field label="TAX rate">
                <select value={serviceForm.taxRate} onChange={(e) => setServiceForm({ ...serviceForm, taxRate: e.target.value as TaxRate })}>
                  {Object.entries(taxLabels).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Net price">
                <input required type="number" step="0.01" value={serviceForm.netPrice} onChange={(e) => setServiceForm({ ...serviceForm, netPrice: e.target.value })} />
              </Field>
              <div className="form-actions full-span booking-side-panel-footer">
                <button type="submit">
                  {editingServiceId ? t('sessionTypesTxModalSaveService') : t('sessionTypesTxModalCreateService')}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
