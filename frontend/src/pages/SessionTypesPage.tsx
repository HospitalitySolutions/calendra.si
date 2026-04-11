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
import { helpTooltip } from '../helpContent'

const SESSION_TYPES_SUBTAB_TRANSACTION = 'transaction-services'

type TypeServiceLine = { transactionServiceId: number; price: string }

function HelpHint({ helpId, t }: { helpId: string; t: (key: string) => string }) {
  const text = helpTooltip(t, helpId)
  return (
    <span className="config-help-hint" data-tooltip={text} role="img" aria-label={text} tabIndex={0}>
      ?
    </span>
  )
}

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
    return (
      <div className="stack gap-lg">
        <PageHeader title={t('tabSessionServiceTypes')} />
      </div>
    )
  }

  if (!typesModuleEnabled && !showTransactionServices) {
    return <Navigate to="/configuration" replace />
  }

  const typesPanel = (
    <Card className="settings-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <HelpHint helpId="cfg-types" t={t} />
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setEditingType(null)
            setTypeForm({ name: '', description: '', durationMinutes: 60, breakMinutes: 0, serviceLines: [] })
            setShowTypeModal(true)
          }}
        >
          New
        </button>
      </div>
      {types.length === 0 ? (
        <EmptyState title="No session types" text="Click New to create your first type." />
      ) : (
        <div className="simple-table-wrap">
          <table>
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
                    <button
                      className="linkish-btn"
                      onClick={() => {
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
                      }}
                    >
                      Edit
                    </button>
                    <button className="linkish-btn danger" onClick={() => removeType(type.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )

  const transactionServicesPanel = (
    <Card className="settings-card">
      <SectionTitle
        action={
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setEditingServiceId(null)
              setServiceForm({ code: '', description: '', taxRate: 'VAT_22', netPrice: '0.00' })
              setShowServiceModal(true)
            }}
          >
            New
          </button>
        }
      >
        {t('configBillingServicesTab')}
      </SectionTitle>
      {services.length === 0 ? (
        <EmptyState title="No transaction services" text="Click New to create your first service." />
      ) : (
        <div className="simple-table-wrap">
          <table>
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
                      <button
                        className="linkish-btn"
                        onClick={() => {
                          setEditingServiceId(s.id)
                          setServiceForm({
                            code: s.code,
                            description: s.description,
                            taxRate: s.taxRate,
                            netPrice: String(s.netPrice),
                          })
                          setShowServiceModal(true)
                        }}
                      >
                        Edit
                      </button>
                      <button className="linkish-btn danger" onClick={() => void deleteService(s.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )

  return (
    <div className="stack gap-lg">
      <PageHeader title={t('tabSessionServiceTypes')} subtitle={t('sessionTypesPageSubtitle')} />
      {typesModuleEnabled ? (
        <>
          <Card>
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
          </Card>
          {showTransactionServices ? transactionServicesPanel : typesPanel}
        </>
      ) : (
        transactionServicesPanel
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
              <div className="config-type-panel-hero full-span">
                <div>
                  <strong>{editingType ? 'Update booking rules' : 'Create a new booking type'}</strong>
                  <p>Duration is the visible session block. Break adds unavailable hatch time right after the session.</p>
                </div>
              </div>
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
                <button type="button" className="secondary" onClick={() => { setShowTypeModal(false); setEditingType(null) }}>
                  Cancel
                </button>
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
                <button type="submit">{editingServiceId ? 'Save service' : 'Create service'}</button>
                <button type="button" className="secondary" onClick={() => { setShowServiceModal(false); setEditingServiceId(null) }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
