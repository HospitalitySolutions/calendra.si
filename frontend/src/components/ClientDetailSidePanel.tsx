import { useEffect, useMemo, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { api } from '../api'
import { getStoredUser } from '../auth'
import type { Client, ClientMessage, Company, User } from '../lib/types'
import { EmptyState, PageHeader, SectionTitle } from './ui'
import { formatDateTime, fullName } from '../lib/format'

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

type Draft = {
  firstName: string
  lastName: string
  email: string
  phone: string
  billingCompanyId: number | null
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
  const [detailEditField, setDetailEditField] = useState<'firstName' | 'lastName' | 'email' | 'phone' | 'billingCompanyId' | null>(null)
  const [detailEditDraft, setDetailEditDraft] = useState<Draft>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    billingCompanyId: null,
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
        })
        setSessionTab('future')
        setConfirmAnonymize(false)
        setDetailEditField(null)
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
      (detailEditDraft.billingCompanyId ?? null) !== (detailClient.billingCompany?.id ?? null)
    )
  }, [detailClient, detailEditDraft])

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
        assignedToId: detailClient.assignedTo?.id ?? consultants[0]?.id,
      }
      const response = await api.put<Client>(`/clients/${detailClient.id}`, payload)
      setDetailClient(response.data)
      setDetailEditDraft({
        firstName: response.data.firstName ?? '',
        lastName: response.data.lastName ?? '',
        email: response.data.email ?? '',
        phone: response.data.phone ?? '',
        billingCompanyId: response.data.billingCompany?.id ?? null,
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
        assignedToId: detailClient.assignedTo?.id ?? consultants[0]?.id,
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

  const renderClientEditableField = (
    key: 'firstName' | 'lastName' | 'email' | 'phone' | 'billingCompanyId',
    label: string,
    wide = false,
  ) => {
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
          <strong>
            {key === 'billingCompanyId'
              ? (detailClient.billingCompany?.name || '—')
              : ((detailClient[key as 'firstName' | 'lastName' | 'email' | 'phone'] as string | undefined) || '—')}
          </strong>
        ) : (
          <div className="clients-detail-inline-edit" onClick={(e) => e.stopPropagation()}>
            {key === 'billingCompanyId' ? (
              <select
                autoFocus
                value={detailEditDraft.billingCompanyId ?? ''}
                onChange={(e) =>
                  setDetailEditDraft({ ...detailEditDraft, billingCompanyId: e.target.value ? Number(e.target.value) : null })
                }
              >
                <option value="">No linked company</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            ) : (
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
            )}
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
            title="Details"
            subtitle="CLIENT"
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
            <div className="muted">Loading…</div>
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
                    {detailClient.active === false && <span className="clients-inactive-badge">Inactive</span>}
                  </span>
                  <span className="clients-id">ID #{detailClient.id}</span>
                </div>
              </div>

              <div className="clients-detail-fields">
                {renderClientEditableField('firstName', 'First name')}
                {renderClientEditableField('lastName', 'Last name')}
                {renderClientEditableField('email', 'Email', true)}
                {renderClientEditableField('phone', 'Phone', true)}
                {renderClientEditableField('billingCompanyId', 'Linked company', true)}
                <div className="clients-detail-batch-switch-row clients-detail-field-card clients-detail-field-card--wide">
                  <span>Batch payment</span>
                  <button
                    type="button"
                    className={`clients-batch-switch${detailClient.batchPaymentEnabled ? ' clients-batch-switch--on' : ''}`}
                    onClick={() => void toggleClientBatchPayment()}
                    disabled={savingBatchPaymentClient}
                    aria-pressed={detailClient.batchPaymentEnabled ?? false}
                  >
                    {savingBatchPaymentClient ? 'Saving…' : detailClient.batchPaymentEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>

              <div className="clients-detail-sessions-card clients-detail-sessions-card--modern">
                <SectionTitle>Sessions</SectionTitle>
                <p className="muted" style={{ marginTop: -6, marginBottom: 10 }}>
                  View future and past bookings linked to this client.
                </p>
                <div className="clients-detail-session-tabs-row">
                  <div className="clients-session-tabs">
                    <button
                      type="button"
                      className={sessionTab === 'future' ? 'clients-session-tab active' : 'clients-session-tab'}
                      onClick={() => setSessionTab('future')}
                      aria-pressed={sessionTab === 'future'}
                    >
                      Future
                    </button>
                    <button
                      type="button"
                      className={sessionTab === 'past' ? 'clients-session-tab active' : 'clients-session-tab'}
                      onClick={() => setSessionTab('past')}
                      aria-pressed={sessionTab === 'past'}
                    >
                      Past
                    </button>
                  </div>
                  <span
                    className="clients-detail-sessions-tab-count"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    {detailSessionsLoading
                      ? '…'
                      : `${sessionTab === 'future' ? futureSessions.length : pastSessions.length} sessions`}
                  </span>
                </div>
                {detailSessionsError && <div className="error">{detailSessionsError}</div>}
                {detailSessionsLoading ? (
                  <div className="muted">Loading sessions…</div>
                ) : sessionTab === 'future' ? (
                  futureSessions.length === 0 ? (
                    <div className="clients-detail-empty-card">
                      <EmptyState title="No upcoming sessions" text="Booked sessions with a start time after now appear here." />
                    </div>
                  ) : (
                    <div className="clients-detail-session-list">
                      {futureSessions.map((s) => (
                        <article key={s.id} className="clients-detail-session-card">
                          <div className="clients-detail-session-top clients-detail-session-top--modern">
                            <span className="clients-detail-session-no">#{s.id}</span>
                            <div className="clients-detail-session-heading">
                              <strong>{fullName({ firstName: s.consultantFirstName, lastName: s.consultantLastName })}</strong>
                              <span>Live session</span>
                            </div>
                          </div>
                          <div className="clients-detail-session-times">
                            <div>
                              <span>Start</span>
                              <strong>{formatDateTime(s.startTime)}</strong>
                            </div>
                            <div>
                              <span>End</span>
                              <strong>{formatDateTime(s.endTime)}</strong>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )
                ) : pastSessions.length === 0 ? (
                  <div className="clients-detail-empty-card">
                    <EmptyState title="No past sessions" text="Sessions with a start time before or at now appear here." />
                  </div>
                ) : (
                  <div className="clients-detail-session-list">
                    {pastSessions.map((s) => (
                      <article key={s.id} className="clients-detail-session-card">
                        <div className="clients-detail-session-top clients-detail-session-top--modern">
                          <span className="clients-detail-session-no">#{s.id}</span>
                          <div className="clients-detail-session-heading">
                            <strong>{fullName({ firstName: s.consultantFirstName, lastName: s.consultantLastName })}</strong>
                            <span>Live session</span>
                          </div>
                        </div>
                        <div className="clients-detail-session-times">
                          <div>
                            <span>Start</span>
                            <strong>{formatDateTime(s.startTime)}</strong>
                          </div>
                          <div>
                            <span>End</span>
                            <strong>{formatDateTime(s.endTime)}</strong>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>

              <div className="clients-detail-sessions-card clients-detail-sessions-card--modern">
                <SectionTitle>Messages</SectionTitle>
                <p className="muted" style={{ marginTop: -6, marginBottom: 10 }}>
                  Recent messages saved from Analytics → Inbox.
                </p>
                {detailMessagesLoading ? (
                  <div className="muted">Loading messages…</div>
                ) : detailMessages.length === 0 ? (
                  <div className="clients-detail-empty-card">
                    <EmptyState title="No messages yet" text="Messages sent from the Inbox tab will appear here." />
                  </div>
                ) : (
                  <div className="clients-detail-session-list">
                    {detailMessages.map((message) => (
                      <article key={message.id} className="clients-detail-session-card">
                        <div className="clients-detail-session-top clients-detail-session-top--modern">
                          <span className="clients-detail-session-no">{message.channel === 'WHATSAPP' ? 'WA' : message.channel === 'VIBER' ? 'VB' : 'EM'}</span>
                          <div className="clients-detail-session-heading">
                            <strong>{message.subject || (message.channel === 'EMAIL' ? 'Email message' : message.channel === 'WHATSAPP' ? 'WhatsApp message' : 'Viber message')}</strong>
                            <span>{message.status === 'SENT' ? 'Sent' : 'Failed'}</span>
                          </div>
                        </div>
                        <div className="clients-detail-session-times">
                          <div>
                            <span>When</span>
                            <strong>{formatDateTime(message.sentAt || message.createdAt)}</strong>
                          </div>
                          <div>
                            <span>To</span>
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
                    <button type="button" className="danger secondary" onClick={() => setConfirmAnonymize(false)} disabled={anonymizing}>
                      Cancel
                    </button>
                    <button type="button" className="danger" onClick={() => void anonymizeClient()} disabled={anonymizing}>
                      {anonymizing ? 'Anonymizing...' : 'Yes, anonymize'}
                    </button>
                  </>
                ) : (
                  <button type="button" className="danger secondary" onClick={() => setConfirmAnonymize(true)}>
                    Anonymize
                  </button>
                ))}
            </div>
            <div className="clients-detail-footer-center">
              {clientDetailHasChanges && (
                <button type="button" onClick={() => void saveDetailClientInline()} disabled={savingDetailEdit}>
                  {savingDetailEdit ? 'Saving changes…' : 'Save changes'}
                </button>
              )}
            </div>
            <div className="clients-detail-footer-right">
              {showLifecycleActions && (
                <button type="button" className="secondary" onClick={() => void toggleActive()} disabled={activating}>
                  {activating ? 'Saving...' : detailClient.active !== false ? 'Deactivate' : 'Activate'}
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
