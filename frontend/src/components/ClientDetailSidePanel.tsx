import { useEffect, useMemo, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { api } from '../api'
import { getStoredUser } from '../auth'
import type { Client, ClientMessage, Company, User } from '../lib/types'
import { EmptyState, Field, PageHeader, SectionTitle } from './ui'
import { formatDateTime, fullName } from '../lib/format'
import { useLocale } from '../locale'

type UserSummary = Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'role'>
type ConsultantSummary = UserSummary & { consultant?: boolean }

type ClientSession = {
  id: number
  startTime: string
  endTime: string
  consultantFirstName: string
  consultantLastName: string
  paid: boolean
}

const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

function slovenianTerminCountForm(count: number): string {
  const n = Math.abs(count) % 100
  if (n >= 11 && n <= 14) return 'terminov'
  const last = n % 10
  if (last === 1) return 'termin'
  if (last >= 2 && last <= 4) return count >= 3 ? 'termini' : 'termina'
  return 'terminov'
}

type Draft = {
  firstName: string
  lastName: string
  email: string
  phone: string
  billingCompanyId: number | null
  assignedToId: number | null
}

export function ClientDetailSidePanel({
  clientId,
  onClose,
  /** When false, hide anonymize / deactivate (e.g. opened from calendar book session). */
  showLifecycleActions = true,
}: {
  clientId: number | null
  onClose: () => void
  showLifecycleActions?: boolean
}) {
  const me = getStoredUser()!
  const { locale, t } = useLocale()
  const copy = locale === 'sl' ? {
    details: 'Podrobnosti',
    client: 'STRANKA',
    inactive: 'Neaktivna',
    firstName: 'Ime',
    lastName: 'Priimek',
    email: 'E-pošta',
    phone: 'Telefon',
    linkedCompany: 'Povezano podjetje',
    assignedConsultant: 'Dodeljeni zaposleni',
    unassignedConsultant: 'Nedodeljen',
    batchPayment: 'Paketno plačilo',
    toggleOn: 'VKLOPLJENO',
    toggleOff: 'IZKLOPLJENO',
    batchPaymentSaving: 'Shranjujem…',
    sessions: 'Termini',
    future: 'Prihodnji',
    past: 'Pretekli',
    sessionsCount: (count: number) => `${count} ${slovenianTerminCountForm(count)}`,
    loading: 'Nalagam…',
    loadingSessions: 'Nalagam termine…',
    noUpcomingTitle: 'Ni prihodnjih terminov',
    noUpcomingText: 'Tukaj se prikažejo rezervirani termini z začetkom po trenutnem času.',
    noPastTitle: 'Ni preteklih terminov',
    noPastText: 'Tukaj se prikažejo termini z začetkom pred ali ob trenutnem času.',
    liveSession: 'Termin v živo',
    start: 'Začetek',
    end: 'Konec',
    messages: 'Sporočila',
    messagesSubtitle: 'Nedavna sporočila, shranjena iz Analitika → Prejeto.',
    loadingMessages: 'Nalagam sporočila…',
    noMessagesTitle: 'Sporočil še ni',
    noMessagesText: 'Sporočila, poslana iz zavihka Prejeto, se bodo prikazala tukaj.',
    emailMessage: 'E-poštno sporočilo',
    whatsappMessage: 'WhatsApp sporočilo',
    viberMessage: 'Viber sporočilo',
    sent: 'Poslano',
    delivered: 'Dostavljeno',
    read: 'Prebrano',
    received: 'Prejeto',
    failed: 'Napaka',
    when: 'Kdaj',
    to: 'Za',
    anonymize: 'Anonimiziraj',
    anonymizing: 'Anonimiziram...',
    yesAnonymize: 'Da, anonimiziraj',
    saveChanges: 'Shrani spremembe',
    savingChanges: 'Shranjujem spremembe…',
    saving: 'Shranjujem...',
    deactivate: 'Deaktiviraj',
    activate: 'Aktiviraj',
  } : {
    details: 'Details',
    client: 'CLIENT',
    inactive: 'Inactive',
    firstName: 'First name',
    lastName: 'Last name',
    email: 'Email',
    phone: 'Phone',
    linkedCompany: 'Linked company',
    assignedConsultant: 'Assigned consultant',
    unassignedConsultant: 'Unassigned',
    batchPayment: 'Batch payment',
    toggleOn: 'ON',
    toggleOff: 'OFF',
    batchPaymentSaving: 'Saving…',
    sessions: 'Sessions',
    future: 'Future',
    past: 'Past',
    sessionsCount: (count: number) => `${count} sessions`,
    loading: 'Loading…',
    loadingSessions: 'Loading sessions…',
    noUpcomingTitle: 'No upcoming sessions',
    noUpcomingText: 'Booked sessions with a start time after now appear here.',
    noPastTitle: 'No past sessions',
    noPastText: 'Sessions with a start time before or at now appear here.',
    liveSession: 'Live session',
    start: 'Start',
    end: 'End',
    messages: 'Messages',
    messagesSubtitle: 'Recent messages saved from Analytics → Inbox.',
    loadingMessages: 'Loading messages…',
    noMessagesTitle: 'No messages yet',
    noMessagesText: 'Messages sent from the Inbox tab will appear here.',
    emailMessage: 'Email message',
    whatsappMessage: 'WhatsApp message',
    viberMessage: 'Viber message',
    sent: 'Sent',
    delivered: 'Delivered',
    read: 'Read',
    received: 'Received',
    failed: 'Failed',
    when: 'When',
    to: 'To',
    anonymize: 'Anonymize',
    anonymizing: 'Anonymizing...',
    yesAnonymize: 'Yes, anonymize',
    saveChanges: 'Save changes',
    savingChanges: 'Saving changes…',
    saving: 'Saving...',
    deactivate: 'Deactivate',
    activate: 'Activate',
  }
  const isAdmin = me.role === 'ADMIN'
  const [detailClient, setDetailClient] = useState<Client | null>(null)
  const [loadError, setLoadError] = useState('')
  const [companies, setCompanies] = useState<Company[]>([])
  const [consultants, setConsultants] = useState<ConsultantSummary[]>([])
  const [detailSessions, setDetailSessions] = useState<ClientSession[]>([])
  const [detailMessages, setDetailMessages] = useState<ClientMessage[]>([])
  const [detailMessagesLoading, setDetailMessagesLoading] = useState(false)
  const [detailSessionsLoading, setDetailSessionsLoading] = useState(false)
  const [detailSessionsError, setDetailSessionsError] = useState('')
  const [sessionTab, setSessionTab] = useState<'future' | 'past'>('future')
  const [detailEditField, setDetailEditField] = useState<'firstName' | 'lastName' | 'email' | 'phone' | null>(null)
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false)
  const [consultantPickerOpen, setConsultantPickerOpen] = useState(false)
  const companySelectRef = useRef<HTMLDivElement>(null)
  const consultantSelectRef = useRef<HTMLDivElement>(null)
  const [detailEditDraft, setDetailEditDraft] = useState<Draft>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    billingCompanyId: null,
    assignedToId: null,
  })
  const [savingDetailEdit, setSavingDetailEdit] = useState(false)
  const [savingBatchPaymentClient, setSavingBatchPaymentClient] = useState(false)
  const [panelError, setPanelError] = useState('')
  const [confirmAnonymize, setConfirmAnonymize] = useState(false)
  const [anonymizing, setAnonymizing] = useState(false)
  const [activating, setActivating] = useState(false)

  useEffect(() => {
    if (!clientId) {
      setDetailClient(null)
      setLoadError('')
      setDetailEditField(null)
      setCompanyPickerOpen(false)
      setConsultantPickerOpen(false)
      return
    }
    let cancelled = false
    setLoadError('')
    api
      .get<Client[]>('/clients')
      .then((res) => {
        if (cancelled) return
        const c = (res.data ?? []).find((entry) => entry.id === clientId)
        if (!c) {
          setLoadError('Client not found.')
          setDetailClient(null)
          return
        }
        setDetailClient(c)
        setDetailEditDraft({
          firstName: c.firstName ?? '',
          lastName: c.lastName ?? '',
          email: c.email ?? '',
          phone: c.phone ?? '',
          billingCompanyId: c.billingCompany?.id ?? null,
          assignedToId: c.assignedTo?.id ?? null,
        })
        setSessionTab('future')
        setConfirmAnonymize(false)
        setDetailEditField(null)
        setCompanyPickerOpen(false)
        setConsultantPickerOpen(false)
        setPanelError('')
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('Failed to load client.')
          setDetailClient(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [clientId])

  useEffect(() => {
    if (!clientId) return
    api
      .get<Company[]>('/companies', { params: {} })
      .then((res) => setCompanies(res.data ?? []))
      .catch(() => setCompanies([]))
  }, [clientId])

  useEffect(() => {
    if (!isAdmin) return
    api
      .get('/users')
      .then((res) => setConsultants((res.data ?? []).filter((u: ConsultantSummary) => u.consultant)))
      .catch(() => setConsultants([]))
  }, [isAdmin])

  useEffect(() => {
    if (!companyPickerOpen && !consultantPickerOpen) return
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node
      const c = companySelectRef.current
      const k = consultantSelectRef.current
      if (companyPickerOpen && c && !c.contains(t)) setCompanyPickerOpen(false)
      if (consultantPickerOpen && k && !k.contains(t)) setConsultantPickerOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCompanyPickerOpen(false)
        setConsultantPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [companyPickerOpen, consultantPickerOpen])

  useEffect(() => {
    if (!detailClient) return
    let cancelled = false
    setDetailSessionsLoading(true)
    setDetailSessionsError('')
    setDetailSessions([])
    api
      .get<ClientSession[]>(`/clients/${detailClient.id}/bookings`)
      .then((res) => {
        if (!cancelled) setDetailSessions(res.data ?? [])
      })
      .catch(() => {
        if (!cancelled) setDetailSessionsError('Failed to load sessions.')
      })
      .finally(() => {
        if (!cancelled) setDetailSessionsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [detailClient])

  useEffect(() => {
    if (!detailClient) return
    let cancelled = false
    setDetailMessagesLoading(true)
    setDetailMessages([])
    api
      .get<ClientMessage[]>(`/inbox/clients/${detailClient.id}/messages`, { params: { limit: 5 } })
      .then((res) => {
        if (!cancelled) setDetailMessages(res.data ?? [])
      })
      .catch(() => {
        if (!cancelled) setDetailMessages([])
      })
      .finally(() => {
        if (!cancelled) setDetailMessagesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [detailClient])

  const futureSessions = useMemo(() => {
    const now = new Date()
    return detailSessions
      .filter((s) => new Date(s.startTime) > now)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  }, [detailSessions])

  const pastSessions = useMemo(() => {
    const now = new Date()
    return detailSessions
      .filter((s) => new Date(s.startTime) <= now)
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
  }, [detailSessions])

  const clientDetailHasChanges = useMemo(() => {
    if (!detailClient) return false
    return (
      (detailEditDraft.firstName ?? '') !== (detailClient.firstName ?? '') ||
      (detailEditDraft.lastName ?? '') !== (detailClient.lastName ?? '') ||
      (detailEditDraft.email ?? '') !== (detailClient.email ?? '') ||
      (detailEditDraft.phone ?? '') !== (detailClient.phone ?? '') ||
      (detailEditDraft.billingCompanyId ?? null) !== (detailClient.billingCompany?.id ?? null) ||
      (isAdmin && (detailEditDraft.assignedToId ?? null) !== (detailClient.assignedTo?.id ?? null))
    )
  }, [detailClient, detailEditDraft, isAdmin])

  const saveDetailClientInline = async () => {
    if (!detailClient || savingDetailEdit) return
    setSavingDetailEdit(true)
    setPanelError('')
    try {
      const payload = {
        firstName: detailEditDraft.firstName.trim(),
        lastName: detailEditDraft.lastName.trim(),
        email: detailEditDraft.email.trim() || null,
        phone: detailEditDraft.phone.trim() || null,
        billingCompanyId: detailEditDraft.billingCompanyId,
        batchPaymentEnabled: detailClient.batchPaymentEnabled ?? false,
        ...(isAdmin ? { assignedToId: detailEditDraft.assignedToId ?? null } : {}),
      }
      const response = await api.put<Client>(`/clients/${detailClient.id}`, payload)
      setDetailClient(response.data)
      setDetailEditDraft({
        firstName: response.data.firstName ?? '',
        lastName: response.data.lastName ?? '',
        email: response.data.email ?? '',
        phone: response.data.phone ?? '',
        billingCompanyId: response.data.billingCompany?.id ?? null,
        assignedToId: response.data.assignedTo?.id ?? null,
      })
      setDetailEditField(null)
      window.dispatchEvent(new Event('clients-updated'))
    } catch (error: any) {
      setPanelError(error?.response?.data?.message || 'Failed to save client.')
    } finally {
      setSavingDetailEdit(false)
    }
  }

  const toggleClientBatchPayment = async () => {
    if (!detailClient || savingBatchPaymentClient) return
    setSavingBatchPaymentClient(true)
    setPanelError('')
    try {
      const response = await api.put<Client>(`/clients/${detailClient.id}`, {
        firstName: detailClient.firstName?.trim() ?? '',
        lastName: detailClient.lastName?.trim() ?? '',
        email: detailClient.email?.trim() || null,
        phone: detailClient.phone?.trim() || null,
        billingCompanyId: detailClient.billingCompany?.id ?? null,
        batchPaymentEnabled: !(detailClient.batchPaymentEnabled ?? false),
        ...(isAdmin ? { assignedToId: detailEditDraft.assignedToId ?? null } : {}),
      })
      setDetailClient(response.data)
      window.dispatchEvent(new Event('clients-updated'))
    } catch (error: any) {
      setPanelError(error?.response?.data?.message || 'Failed to update batch payment setting.')
    } finally {
      setSavingBatchPaymentClient(false)
    }
  }

  const anonymizeClient = async () => {
    if (!detailClient || detailClient.anonymized) return
    setPanelError('')
    setAnonymizing(true)
    try {
      const response = await api.post<Client>(`/clients/${detailClient.id}/anonymize`)
      setDetailClient(response.data)
      setConfirmAnonymize(false)
      window.dispatchEvent(new Event('clients-updated'))
    } catch (error: any) {
      setPanelError(error?.response?.data?.message || 'Failed to anonymize client.')
    } finally {
      setAnonymizing(false)
    }
  }

  const toggleActive = async () => {
    if (!detailClient) return
    setActivating(true)
    setPanelError('')
    try {
      const action = detailClient.active !== false ? 'deactivate' : 'activate'
      const response = await api.patch<Client>(`/clients/${detailClient.id}/${action}`)
      setDetailClient(response.data)
      window.dispatchEvent(new Event('clients-updated'))
    } catch (error: any) {
      setPanelError(error?.response?.data?.message || 'Failed to update client status.')
    } finally {
      setActivating(false)
    }
  }

  const linkedCompanyTriggerLabel = useMemo(() => {
    if (detailEditDraft.billingCompanyId == null) return locale === 'sl' ? 'Brez povezanega podjetja' : 'No linked company'
    return (
      companies.find((c) => c.id === detailEditDraft.billingCompanyId)?.name ??
      (locale === 'sl' ? 'Brez povezanega podjetja' : 'No linked company')
    )
  }, [detailEditDraft.billingCompanyId, companies, locale])

  const assignedConsultantTriggerLabel = useMemo(() => {
    if (detailEditDraft.assignedToId == null) return copy.unassignedConsultant
    const u = consultants.find((c) => c.id === detailEditDraft.assignedToId)
    return u ? `${fullName(u)} (${u.email})` : copy.unassignedConsultant
  }, [detailEditDraft.assignedToId, consultants, copy.unassignedConsultant])

  const renderClientEditableField = (key: 'firstName' | 'lastName' | 'email' | 'phone', label: string, wide = false) => {
    if (!detailClient) return null
    const isEditing = detailEditField === key
    return (
      <div
        className={`clients-detail-field-card${wide ? ' clients-detail-field-card--wide' : ''}${isEditing ? ' clients-detail-field-card--editing' : ''}`}
        onClick={() => {
          if (detailEditField !== key) setDetailEditField(key)
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          if (detailEditField === key) return
          e.preventDefault()
          setDetailEditField(key)
        }}
      >
        <span>{label}</span>
        {!isEditing ? (
          <strong>{(detailClient[key] as string | undefined) || '—'}</strong>
        ) : (
          <div className="clients-detail-inline-edit" onClick={(e) => e.stopPropagation()}>
            <input
              autoFocus
              value={detailEditDraft[key] ?? ''}
              onChange={(e) => setDetailEditDraft({ ...detailEditDraft, [key]: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void saveDetailClientInline()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setDetailEditField(null)
                }
              }}
            />
          </div>
        )}
      </div>
    )
  }


  if (!clientId) return null

  return (
    <div
      className={`modal-backdrop${isNativeAndroid ? ' modal-backdrop-center-android' : ' booking-side-panel-backdrop calendar-client-detail-backdrop'}`}
      onClick={onClose}
    >
      <div
        className={`modal large-modal${isNativeAndroid ? '' : ' booking-side-panel clients-detail-side-panel clients-detail-panel-modern'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="booking-side-panel-header">
          <PageHeader
            title={copy.details}
            subtitle={copy.client}
            actions={
              <button type="button" className="secondary booking-side-panel-close" onClick={onClose} aria-label="Close">
                ×
              </button>
            }
          />
        </div>
        <div className={isNativeAndroid ? undefined : 'booking-side-panel-body'}>
          {loadError ? (
            <div className="error" style={{ marginBottom: 12 }}>
              {loadError}
            </div>
          ) : null}
          {panelError ? (
            <div className="error" style={{ marginBottom: 12 }}>
              {panelError}
            </div>
          ) : null}
          {!detailClient && !loadError ? (
            <div className="muted">{copy.loading}</div>
          ) : detailClient ? (
            <div className="clients-detail-shell">
              <div className="clients-detail-hero clients-detail-head-card">
                <span className="clients-name-avatar clients-detail-avatar" aria-hidden>
                  {(detailClient.firstName?.[0] || '').toUpperCase()}
                  {(detailClient.lastName?.[0] || '').toUpperCase()}
                </span>
                <div className="clients-name-stack">
                  <span className="clients-name">
                    {fullName(detailClient)}
                    {detailClient.active === false && <span className="clients-inactive-badge">{copy.inactive}</span>}
                  </span>
                  <span className="clients-id">ID #{detailClient.id}</span>
                </div>
              </div>

              <div className="clients-detail-fields">
                {renderClientEditableField('firstName', copy.firstName)}
                {renderClientEditableField('lastName', copy.lastName)}
                {renderClientEditableField('email', copy.email, true)}
                {renderClientEditableField('phone', copy.phone, true)}
                <div className="clients-detail-field-card clients-detail-field-card--wide clients-detail-guest-pickers">
                  <Field label={copy.linkedCompany}>
                    <div className={`guest-booking-select${companyPickerOpen ? ' is-open' : ''}`} ref={companySelectRef}>
                      <button
                        type="button"
                        className="guest-booking-select-trigger"
                        aria-haspopup="listbox"
                        aria-expanded={companyPickerOpen}
                        disabled={savingDetailEdit}
                        onClick={() => {
                          setConsultantPickerOpen(false)
                          setCompanyPickerOpen((o) => !o)
                        }}
                      >
                        <span className="guest-booking-select-trigger-main">
                          <span className="guest-booking-select-value">{linkedCompanyTriggerLabel}</span>
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
                      {companyPickerOpen ? (
                        <ul className="guest-booking-select-menu" role="listbox">
                          <li role="presentation">
                            <button
                              type="button"
                              role="option"
                              aria-selected={detailEditDraft.billingCompanyId == null}
                              className={`guest-booking-select-option${detailEditDraft.billingCompanyId == null ? ' is-selected' : ''}`}
                              onClick={() => {
                                setDetailEditDraft({ ...detailEditDraft, billingCompanyId: null })
                                setCompanyPickerOpen(false)
                              }}
                            >
                              <span className="guest-booking-select-option-label">
                                {locale === 'sl' ? 'Brez povezanega podjetja' : 'No linked company'}
                              </span>
                            </button>
                          </li>
                          {companies.map((company) => {
                            const selected = detailEditDraft.billingCompanyId === company.id
                            return (
                              <li key={company.id} role="presentation">
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={selected}
                                  className={`guest-booking-select-option${selected ? ' is-selected' : ''}`}
                                  onClick={() => {
                                    setDetailEditDraft({ ...detailEditDraft, billingCompanyId: company.id })
                                    setCompanyPickerOpen(false)
                                  }}
                                >
                                  <span className="guest-booking-select-option-label">{company.name}</span>
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      ) : null}
                    </div>
                  </Field>
                  {isAdmin ? (
                    <Field label={copy.assignedConsultant}>
                      <div className={`guest-booking-select${consultantPickerOpen ? ' is-open' : ''}`} ref={consultantSelectRef}>
                        <button
                          type="button"
                          className="guest-booking-select-trigger"
                          aria-haspopup="listbox"
                          aria-expanded={consultantPickerOpen}
                          disabled={savingDetailEdit}
                          onClick={() => {
                            setCompanyPickerOpen(false)
                            setConsultantPickerOpen((o) => !o)
                          }}
                        >
                          <span className="guest-booking-select-trigger-main">
                            <span className="guest-booking-select-value">{assignedConsultantTriggerLabel}</span>
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
                        {consultantPickerOpen ? (
                          <ul className="guest-booking-select-menu" role="listbox">
                            <li role="presentation">
                              <button
                                type="button"
                                role="option"
                                aria-selected={detailEditDraft.assignedToId == null}
                                className={`guest-booking-select-option${detailEditDraft.assignedToId == null ? ' is-selected' : ''}`}
                                onClick={() => {
                                  setDetailEditDraft({ ...detailEditDraft, assignedToId: null })
                                  setConsultantPickerOpen(false)
                                }}
                              >
                                <span className="guest-booking-select-option-label">{copy.unassignedConsultant}</span>
                              </button>
                            </li>
                            {consultants.map((u) => {
                              const selected = detailEditDraft.assignedToId === u.id
                              return (
                                <li key={u.id} role="presentation">
                                  <button
                                    type="button"
                                    role="option"
                                    aria-selected={selected}
                                    className={`guest-booking-select-option${selected ? ' is-selected' : ''}`}
                                    onClick={() => {
                                      setDetailEditDraft({ ...detailEditDraft, assignedToId: u.id })
                                      setConsultantPickerOpen(false)
                                    }}
                                  >
                                    <span className="guest-booking-select-option-label">
                                      {fullName(u)} ({u.email})
                                    </span>
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        ) : null}
                      </div>
                    </Field>
                  ) : null}
                </div>
                <div className="clients-detail-batch-switch-row clients-detail-field-card clients-detail-field-card--wide">
                  <span>{copy.batchPayment}</span>
                  <button
                    type="button"
                    className={`clients-batch-switch${detailClient.batchPaymentEnabled ? ' clients-batch-switch--on' : ''}`}
                    onClick={() => void toggleClientBatchPayment()}
                    disabled={savingBatchPaymentClient}
                    aria-pressed={detailClient.batchPaymentEnabled ?? false}
                  >
                    {savingBatchPaymentClient ? copy.batchPaymentSaving : detailClient.batchPaymentEnabled ? copy.toggleOn : copy.toggleOff}
                  </button>
                </div>
              </div>

              <div className="clients-detail-sessions-card clients-detail-sessions-card--modern">
                <div className="clients-detail-session-tabs-row">
                  <div className="clients-session-tabs">
                    <button
                      type="button"
                      className={sessionTab === 'future' ? 'clients-session-tab active' : 'clients-session-tab'}
                      onClick={() => setSessionTab('future')}
                      aria-pressed={sessionTab === 'future'}
                    >
                      {copy.future}
                    </button>
                    <button
                      type="button"
                      className={sessionTab === 'past' ? 'clients-session-tab active' : 'clients-session-tab'}
                      onClick={() => setSessionTab('past')}
                      aria-pressed={sessionTab === 'past'}
                    >
                      {copy.past}
                    </button>
                  </div>
                  <span
                    className="clients-detail-sessions-tab-count"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    {detailSessionsLoading
                      ? '…'
                      : copy.sessionsCount(sessionTab === 'future' ? futureSessions.length : pastSessions.length)}
                  </span>
                </div>
                {detailSessionsError && <div className="error">{detailSessionsError}</div>}
                {detailSessionsLoading ? (
                  <div className="muted">{copy.loadingSessions}</div>
                ) : sessionTab === 'future' ? (
                  futureSessions.length === 0 ? (
                    <div className="clients-detail-empty-card">
                      <EmptyState title={copy.noUpcomingTitle} text={copy.noUpcomingText} />
                    </div>
                  ) : (
                    <div className="clients-detail-session-list">
                      {futureSessions.map((s) => (
                        <article key={s.id} className="clients-detail-session-card">
                          <div className="clients-detail-session-top clients-detail-session-top--modern">
                            <span className="clients-detail-session-no">#{s.id}</span>
                            <div className="clients-detail-session-heading">
                              <strong>{fullName({ firstName: s.consultantFirstName, lastName: s.consultantLastName })}</strong>
                              <span>{copy.liveSession}</span>
                            </div>
                          </div>
                          <div className="clients-detail-session-times">
                            <div>
                              <span>{copy.start}</span>
                              <strong>{formatDateTime(s.startTime)}</strong>
                            </div>
                            <div>
                              <span>{copy.end}</span>
                              <strong>{formatDateTime(s.endTime)}</strong>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )
                ) : pastSessions.length === 0 ? (
                  <div className="clients-detail-empty-card">
                    <EmptyState title={copy.noPastTitle} text={copy.noPastText} />
                  </div>
                ) : (
                  <div className="clients-detail-session-list">
                    {pastSessions.map((s) => (
                      <article key={s.id} className="clients-detail-session-card">
                        <div className="clients-detail-session-top clients-detail-session-top--modern">
                          <span className="clients-detail-session-no">#{s.id}</span>
                          <div className="clients-detail-session-heading">
                            <strong>{fullName({ firstName: s.consultantFirstName, lastName: s.consultantLastName })}</strong>
                            <span>{copy.liveSession}</span>
                          </div>
                        </div>
                        <div className="clients-detail-session-times">
                          <div>
                            <span>{copy.start}</span>
                            <strong>{formatDateTime(s.startTime)}</strong>
                          </div>
                          <div>
                            <span>{copy.end}</span>
                            <strong>{formatDateTime(s.endTime)}</strong>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>

              <div className="clients-detail-sessions-card clients-detail-sessions-card--modern">
                <SectionTitle>{copy.messages}</SectionTitle>
                <p className="muted" style={{ marginTop: -6, marginBottom: 10 }}>
                  {copy.messagesSubtitle}
                </p>
                {detailMessagesLoading ? (
                  <div className="muted">{copy.loadingMessages}</div>
                ) : detailMessages.length === 0 ? (
                  <div className="clients-detail-empty-card">
                    <EmptyState title={copy.noMessagesTitle} text={copy.noMessagesText} />
                  </div>
                ) : (
                  <div className="clients-detail-session-list">
                    {detailMessages.map((message) => (
                      <article key={message.id} className="clients-detail-session-card">
                        <div className="clients-detail-session-top clients-detail-session-top--modern">
                          <span className="clients-detail-session-no">{message.channel === 'WHATSAPP' ? 'WA' : message.channel === 'VIBER' ? 'VB' : 'EM'}</span>
                          <div className="clients-detail-session-heading">
                            <strong>{message.subject || (message.channel === 'EMAIL' ? copy.emailMessage : message.channel === 'WHATSAPP' ? copy.whatsappMessage : copy.viberMessage)}</strong>
                            <span>{message.status === 'SENT' ? copy.sent : message.status === 'DELIVERED' ? copy.delivered : message.status === 'READ' ? copy.read : message.status === 'RECEIVED' ? copy.received : copy.failed}</span>
                          </div>
                        </div>
                        <div className="clients-detail-session-times">
                          <div>
                            <span>{copy.when}</span>
                            <strong>{formatDateTime(message.sentAt || message.createdAt)}</strong>
                          </div>
                          <div>
                            <span>{copy.to}</span>
                            <strong>{message.recipient}</strong>
                          </div>
                        </div>
                        <div className="muted" style={{ whiteSpace: 'pre-wrap' }}>{message.body}</div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
        {detailClient ? (
          <div
            className={`${isNativeAndroid ? 'form-actions' : 'form-actions booking-side-panel-footer'} clients-detail-footer`}
            style={{ marginTop: isNativeAndroid ? 16 : 0 }}
          >
            <div className="clients-detail-footer-left">
              {showLifecycleActions &&
                !detailClient.anonymized &&
                (confirmAnonymize ? (
                  <>
                    <button type="button" className="danger secondary" onClick={() => setConfirmAnonymize(false)} disabled={anonymizing}>{t('cancel')}</button>
                    <button type="button" className="danger" onClick={() => void anonymizeClient()} disabled={anonymizing}>
                      {anonymizing ? copy.anonymizing : copy.yesAnonymize}
                    </button>
                  </>
                ) : (
                  <button type="button" className="danger secondary" onClick={() => setConfirmAnonymize(true)}>
                    {copy.anonymize}
                  </button>
                ))}
            </div>
            <div className="clients-detail-footer-center">
              {clientDetailHasChanges && (
                <button type="button" onClick={() => void saveDetailClientInline()} disabled={savingDetailEdit}>
                  {savingDetailEdit ? copy.savingChanges : copy.saveChanges}
                </button>
              )}
            </div>
            <div className="clients-detail-footer-right">
              {showLifecycleActions && (
                <button type="button" className="secondary" onClick={() => void toggleActive()} disabled={activating}>
                  {activating ? copy.saving : detailClient.active !== false ? copy.deactivate : copy.activate}
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
