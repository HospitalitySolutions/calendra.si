import { useCallback, useEffect, useMemo, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { getStoredUser } from '../auth'
import type { BillingService, SessionType as SessionTypeT, TaxRate } from '../lib/types'
import { taxLabels } from '../lib/types'
import { Card, EmptyState, Field, PageHeader, SectionTitle } from '../components/ui'
import { currency, formatDate } from '../lib/format'
import { useLocale, type AppLocale } from '../locale'
import { getDefaultAllowedRoute } from '../lib/packageAccess'

const SESSION_TYPES_SUBTAB_TRANSACTION = 'transaction-services'

type TypeServiceLine = { transactionServiceId: number; price: string }

type TypeFormState = {
  name: string
  description: string
  durationMinutes: number
  breakMinutes: number
  maxParticipantsPerSession: string
  widgetGroupBookingEnabled: boolean
  guestBookingEnabled: boolean
  serviceLines: TypeServiceLine[]
}

function typeFormsEqual(a: TypeFormState, b: TypeFormState): boolean {
  if (a.name !== b.name) return false
  if (a.description !== b.description) return false
  if (a.durationMinutes !== b.durationMinutes) return false
  if (a.breakMinutes !== b.breakMinutes) return false
  if (a.maxParticipantsPerSession.trim() !== b.maxParticipantsPerSession.trim()) return false
  if (a.widgetGroupBookingEnabled !== b.widgetGroupBookingEnabled) return false
  if (a.guestBookingEnabled !== b.guestBookingEnabled) return false
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

export function SessionTypesPage() {
  const me = getStoredUser()!
  const isAdmin = me.role === 'ADMIN'
  const { t, locale } = useLocale()
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
  const [serviceForm, setServiceForm] = useState<ServiceFormState>({
    code: '',
    description: '',
    taxRate: 'VAT_22',
    grossPrice: '0.00',
  })
  /** Snapshot when the transaction service modal opens; footer only when dirty. */
  const [serviceFormSnapshot, setServiceFormSnapshot] = useState<ServiceFormState | null>(null)
  const [typeForm, setTypeForm] = useState<TypeFormState>({
    name: '',
    description: '',
    durationMinutes: 60,
    breakMinutes: 0,
    maxParticipantsPerSession: '',
    widgetGroupBookingEnabled: false,
    guestBookingEnabled: true,
    serviceLines: [],
  })
  /** Snapshot when the type modal opens; used to detect edits (footer only when dirty). */
  const [typeFormSnapshot, setTypeFormSnapshot] = useState<TypeFormState | null>(null)

  const [isSessionTypesNarrow, setIsSessionTypesNarrow] = useState(
    () => (typeof window !== 'undefined' ? window.matchMedia('(max-width: 450px)').matches : false),
  )
  const [openTypeMenuId, setOpenTypeMenuId] = useState<number | null>(null)
  const [openServiceMenuId, setOpenServiceMenuId] = useState<number | null>(null)
  const [typeSearch, setTypeSearch] = useState('')
  const [serviceSearch, setServiceSearch] = useState('')

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
      const hay = [s.code, s.description, String(s.id), taxLabels[s.taxRate], String(s.netPrice)].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [services, serviceSearch])

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
    const payload = {
      name: typeForm.name,
      description: typeForm.description,
      durationMinutes: typeForm.durationMinutes,
      breakMinutes: typeForm.breakMinutes,
      maxParticipantsPerSession: typeForm.maxParticipantsPerSession.trim() ? Number(typeForm.maxParticipantsPerSession) : null,
      widgetGroupBookingEnabled: typeForm.widgetGroupBookingEnabled,
      guestBookingEnabled: typeForm.guestBookingEnabled,
      services: typeForm.serviceLines.map((l) => ({
        transactionServiceId: l.transactionServiceId,
        price: l.price ? Number(l.price) : null,
      })),
    }
    if (editingType) await api.put(`/types/${editingType.id}`, payload)
    else await api.post('/types', payload)
    setEditingType(null)
    setTypeForm({ name: '', description: '', durationMinutes: 60, breakMinutes: 0, maxParticipantsPerSession: '', widgetGroupBookingEnabled: false, guestBookingEnabled: true, serviceLines: [] })
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
    if (editingServiceId) await api.put(`/billing/services/${editingServiceId}`, payload)
    else await api.post('/billing/services', payload)
    setEditingServiceId(null)
    setServiceForm({ code: '', description: '', taxRate: 'VAT_22', grossPrice: '0.00' })
    setServiceFormSnapshot(null)
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
    const next: TypeFormState = {
      name: type.name,
      description: type.description || '',
      durationMinutes: type.durationMinutes ?? 60,
      breakMinutes: type.breakMinutes ?? 0,
      maxParticipantsPerSession:
        type.maxParticipantsPerSession != null && Number(type.maxParticipantsPerSession) >= 1
          ? String(type.maxParticipantsPerSession)
          : '',
      widgetGroupBookingEnabled: type.widgetGroupBookingEnabled === true,
      guestBookingEnabled: type.guestBookingEnabled !== false,
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
    const next: ServiceFormState = {
      code: s.code,
      description: s.description,
      taxRate: s.taxRate,
      grossPrice: grossPriceStringFromNet(Number(s.netPrice), s.taxRate),
    }
    setServiceForm(next)
    setServiceFormSnapshot({ ...next })
    setShowServiceModal(true)
    setOpenServiceMenuId(null)
  }

  if (!typesModuleEnabled && !showTransactionServices) {
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
                    <span>Website booking</span>
                    <strong>{type.widgetGroupBookingEnabled ? 'On' : 'Off'}</strong>
                  </div>
                  <div>
                    <span>Guest app</span>
                    <strong>{type.guestBookingEnabled !== false ? 'On' : 'Off'}</strong>
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
                <th>Website booking</th>
                <th>Guest app</th>
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
                    <td className="clients-muted">{type.widgetGroupBookingEnabled ? 'On' : 'Off'}</td>
                    <td className="clients-muted">{type.guestBookingEnabled !== false ? 'On' : 'Off'}</td>
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
                          <span className="clients-id">ID #{s.id}</span>
                        </div>
                      </div>
                    </td>
                    <td className="clients-muted">{s.description}</td>
                    <td className="clients-muted">{taxLabels[s.taxRate]}</td>
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
    const empty: TypeFormState = { name: '', description: '', durationMinutes: 60, breakMinutes: 0, maxParticipantsPerSession: '', widgetGroupBookingEnabled: false, guestBookingEnabled: true, serviceLines: [] }
    setTypeForm(empty)
    setTypeFormSnapshot({ ...empty, serviceLines: [] })
    setShowTypeModal(true)
  }

  const openNewServiceModal = () => {
    setEditingServiceId(null)
    const empty: ServiceFormState = { code: '', description: '', taxRate: 'VAT_22', grossPrice: '0.00' }
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
                aria-selected={!showTransactionServices}
                className={!showTransactionServices ? 'clients-session-tab active' : 'clients-session-tab'}
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
            </div>
            <button
              type="button"
              className="secondary"
              onClick={showTransactionServices ? openNewServiceModal : openNewTypeModal}
            >
              {isSessionTypesNarrow ? t('billingNewMobile') : t('billingNew')}
            </button>
          </div>
          <div className="clients-toolbar">
            <div className="clients-search-wrap">
              <input
                className="clients-search-input"
                placeholder={
                  showTransactionServices
                    ? t('sessionTypesSearchServicesPlaceholder')
                    : t('sessionTypesSearchTypesPlaceholder')
                }
                value={showTransactionServices ? serviceSearch : typeSearch}
                onChange={(e) =>
                  showTransactionServices ? setServiceSearch(e.target.value) : setTypeSearch(e.target.value)
                }
              />
              <span className="clients-search-icon" aria-hidden>
                ⌕
              </span>
            </div>
            <div className={`clients-count-chip${isSessionTypesNarrow ? ' clients-count-chip--mobile-open' : ''}`}>
              {showTransactionServices
                ? transactionServiceListCountLabel(filteredServices.length, locale)
                : sessionTypeListCountLabel(filteredTypes.length, locale)}
            </div>
          </div>
          {showTransactionServices ? transactionServicesPanelBody : typesPanelBody}
        </Card>
      ) : (
        <Card className={sessionTypesCardClass}>
          <div className="section-title-row" style={{ marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>{t('configBillingServicesTab')}</h3>
            <button type="button" className="secondary" onClick={openNewServiceModal}>
              {isSessionTypesNarrow ? t('billingNewMobile') : t('billingNew')}
            </button>
          </div>
          <div className="clients-toolbar">
            <div className="clients-search-wrap">
              <input
                className="clients-search-input"
                placeholder={t('sessionTypesSearchServicesPlaceholder')}
                value={serviceSearch}
                onChange={(e) => setServiceSearch(e.target.value)}
              />
              <span className="clients-search-icon" aria-hidden>
                ⌕
              </span>
            </div>
            <div className={`clients-count-chip${isSessionTypesNarrow ? ' clients-count-chip--mobile-open' : ''}`}>
              {transactionServiceListCountLabel(filteredServices.length, locale)}
            </div>
          </div>
          {transactionServicesPanelBody}
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
                  <Field label="Group max participants" hint="Optional capacity for group sessions. When set, website booking only allows joining existing calendar group bookings for this service type.">
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={typeForm.maxParticipantsPerSession}
                      onChange={(e) => setTypeForm({ ...typeForm, maxParticipantsPerSession: e.target.value })}
                      placeholder="No limit"
                    />
                  </Field>
                  <Field label="Website booking" hint="Show this service type on the website widget. When Group max participants is set, the widget only allows joining existing calendar group bookings for this service type.">
                    <label className="inline-checkbox" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={typeForm.widgetGroupBookingEnabled}
                        onChange={(e) => setTypeForm({ ...typeForm, widgetGroupBookingEnabled: e.target.checked })}
                      />
                      <span>Enable website booking</span>
                    </label>
                  </Field>
                  <Field label="Guest app" hint="Show this service type inside the guest mobile booking flow.">
                    <label className="inline-checkbox" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={typeForm.guestBookingEnabled}
                        onChange={(e) => setTypeForm({ ...typeForm, guestBookingEnabled: e.target.checked })}
                      />
                      <span>Enable guest app booking</span>
                    </label>
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
                  <select value={serviceForm.taxRate} onChange={(e) => setServiceForm({ ...serviceForm, taxRate: e.target.value as TaxRate })}>
                    {Object.entries(taxLabels).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
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
