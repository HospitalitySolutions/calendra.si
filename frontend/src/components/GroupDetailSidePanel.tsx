import { useEffect, useMemo, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { api } from '../api'
import { getStoredUser } from '../auth'
import type { Client, ClientGroup, Company } from '../lib/types'
import { EmptyState, PageHeader } from './ui'
import { fullName, parseClientNameInput } from '../lib/format'
import { useLocale } from '../locale'

const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

export type GroupSessionBookingContext = {
  bookingId: number
  sessionGroupEmailOverride: string | null | undefined
  sessionGroupBillingCompany: { id: number; name: string } | null | undefined
}

function uniqPositiveClientIds(ids: number[]): number[] {
  return Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0)))
}

export function GroupDetailSidePanel({
  groupId,
  bookingSessionContext,
  onSaveSessionOverrides,
  /** When true (calendar group details), members can be added/removed and new clients created. */
  manageMembersFromCalendar = false,
  /** Session-only member list; persisted via `onSessionMembersPersist`, not PUT /groups/members. */
  sessionMembersOverride,
  onSessionMembersPersist,
  /** Booking form consultant — required for admin when creating a client from this panel. */
  consultantIdForNewClient,
  onAfterMembersChange,
  onClose,
}: {
  groupId: number | null
  /** When set, email / company are session-only edits (saved to booking, not PUT /groups). */
  bookingSessionContext?: GroupSessionBookingContext | null
  onSaveSessionOverrides?: (payload: {
    groupEmailOverride: string
    groupBillingCompanyIdOverride: number
  }) => Promise<void>
  manageMembersFromCalendar?: boolean
  /** When set (calendar), chips reflect this session only; use with `onSessionMembersPersist`. */
  sessionMembersOverride?: Client[] | null
  onSessionMembersPersist?: (clientIds: number[]) => Promise<void>
  consultantIdForNewClient?: number | null
  onAfterMembersChange?: () => void
  onClose: () => void
}) {
  const { locale } = useLocale()
  const copy =
    locale === 'sl'
      ? {
          details: 'Podrobnosti',
          group: 'SKUPINA',
          loading: 'Nalagam…',
          loadError: 'Skupine ni mogoče naložiti.',
          members: 'Člani',
          email: 'E-pošta',
          linkedCompany: 'Povezano podjetje',
          noMembers: 'Ni članov.',
          sessionHint:
            'Spremembe veljajo samo za ta termin in ne spremenijo skupine v Stranke → Skupine.',
          saveSession: 'Shrani za ta termin',
          saving: 'Shranjujem…',
          noneCompany: '— brez —',
          searchMembersPlaceholder: 'Išči stranke za dodajanje…',
          addMember: 'Dodaj člana',
          createAndAdd: 'Ustvari in dodaj',
          newClientTitle: 'Nova stranka',
          newClientCreate: 'Ustvari',
          newClientCancel: 'Prekliči',
          memberErrorConsultant: 'Izberite zaposlenega v obrazcu, preden ustvarite stranko.',
          memberErrorCreate: 'Ustvarjanje stranke ni uspelo.',
          groupMemberSearchNoResults: 'Ni strank, ki bi ustrezale iskanju.',
          addSelectedMembers: (n: number) => `Dodaj ${n} označenih`,
          addMembersPickFirst: 'Izberite stranke',
          removeMember: 'Odstrani',
        }
      : {
          details: 'Details',
          group: 'GROUP',
          loading: 'Loading…',
          loadError: 'Could not load group.',
          members: 'Members',
          email: 'Email',
          linkedCompany: 'Linked company',
          noMembers: 'No members.',
          sessionHint:
            'Changes apply only to this session and do not change the group under Clients → Groups.',
          saveSession: 'Save for this session',
          saving: 'Saving…',
          noneCompany: '— none —',
          searchMembersPlaceholder: 'Search clients to add…',
          addMember: 'Add member',
          createAndAdd: 'Create and add',
          newClientTitle: 'New client',
          newClientCreate: 'Create',
          newClientCancel: 'Cancel',
          memberErrorConsultant: 'Choose a consultant on the form before creating a client.',
          memberErrorCreate: 'Could not create client.',
          groupMemberSearchNoResults: 'No clients match your search.',
          addSelectedMembers: (n: number) => `Add ${n} selected`,
          addMembersPickFirst: 'Select clients',
          removeMember: 'Remove',
        }

  const [group, setGroup] = useState<ClientGroup | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [companies, setCompanies] = useState<Company[]>([])
  const [emailDraft, setEmailDraft] = useState('')
  const [companyDraft, setCompanyDraft] = useState<string>('')
  const [savingSession, setSavingSession] = useState(false)
  const [memberClients, setMemberClients] = useState<Client[]>([])
  const [memberSearch, setMemberSearch] = useState('')
  const [memberDropdownOpen, setMemberDropdownOpen] = useState(false)
  const [addingMember, setAddingMember] = useState(false)
  const [removingMemberId, setRemovingMemberId] = useState<number | null>(null)
  const [showNewClientModal, setShowNewClientModal] = useState(false)
  const [newClientForm, setNewClientForm] = useState({ firstName: '', lastName: '' })
  const [memberError, setMemberError] = useState('')
  const [pendingMemberIds, setPendingMemberIds] = useState<number[]>([])
  const memberSearchInputRef = useRef<HTMLInputElement | null>(null)
  const memberDropdownBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sessionEmailOverrideMode = !!bookingSessionContext
  const sessionScopedMembers = typeof onSessionMembersPersist === 'function'
  const sessionScopeHint = sessionEmailOverrideMode || sessionScopedMembers
  const canManageMembers =
    manageMembersFromCalendar && !!groupId && (!sessionScopedMembers || !!onSessionMembersPersist)

  useEffect(() => {
    if (!groupId) {
      setGroup(null)
      setLoadError('')
      return
    }
    let cancelled = false
    setLoading(true)
    setLoadError('')
    api
      .get<ClientGroup>(`/groups/${groupId}`)
      .then((res) => {
        if (!cancelled) setGroup(res.data ?? null)
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(copy.loadError)
          setGroup(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [groupId, copy.loadError])

  useEffect(() => {
    if (!sessionEmailOverrideMode) return
    let cancelled = false
    api
      .get<Company[]>('/companies')
      .then((res) => {
        if (!cancelled) setCompanies(Array.isArray(res.data) ? res.data : [])
      })
      .catch(() => {
        if (!cancelled) setCompanies([])
      })
    return () => {
      cancelled = true
    }
  }, [sessionEmailOverrideMode])

  useEffect(() => {
    if (!group || !bookingSessionContext) return
    const defaultEmail = (group.email || '').trim()
    const ov = bookingSessionContext.sessionGroupEmailOverride
    const effEmail = ov != null && ov !== '' ? ov : defaultEmail
    setEmailDraft(effEmail)
    const defaultCo = group.billingCompany?.id ?? null
    const ovCo = bookingSessionContext.sessionGroupBillingCompany?.id
    const effCo = ovCo != null && ovCo > 0 ? ovCo : defaultCo
    setCompanyDraft(effCo != null && effCo > 0 ? String(effCo) : '')
  }, [group, bookingSessionContext])

  useEffect(() => {
    if (!canManageMembers) {
      setMemberClients([])
      setMemberSearch('')
      setMemberDropdownOpen(false)
      setPendingMemberIds([])
      return
    }
    let cancelled = false
    api
      .get<Client[]>('/clients')
      .then((res) => {
        if (!cancelled) setMemberClients(Array.isArray(res.data) ? res.data : [])
      })
      .catch(() => {
        if (!cancelled) setMemberClients([])
      })
    return () => {
      cancelled = true
    }
  }, [canManageMembers])

  const members: Client[] = useMemo(() => {
    if (sessionScopedMembers) return sessionMembersOverride ?? []
    return group?.members ?? []
  }, [sessionScopedMembers, sessionMembersOverride, group?.members])

  const memberCandidates = useMemo(() => {
    if (!sessionScopedMembers && !group) return []
    const memberIds = new Set(members.map((m) => m.id))
    const q = memberSearch.trim().toLowerCase()
    return memberClients.filter(
      (c) =>
        c.active !== false &&
        !memberIds.has(c.id) &&
        (!q ||
          `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
          (c.email || '').toLowerCase().includes(q)),
    )
  }, [sessionScopedMembers, group, members, memberClients, memberSearch])

  const memberIdSet = useMemo(() => new Set(members.map((m) => m.id)), [members])

  useEffect(() => {
    setPendingMemberIds((prev) => prev.filter((id) => !memberIdSet.has(id)))
  }, [memberIdSet])

  if (!groupId) return null

  const reloadGroup = async () => {
    const res = await api.get<ClientGroup>(`/groups/${groupId}`)
    setGroup(res.data ?? null)
  }

  const refreshMemberClients = async () => {
    try {
      const cr = await api.get<Client[]>('/clients')
      setMemberClients(Array.isArray(cr.data) ? cr.data : [])
    } catch {
      /* ignore */
    }
  }

  const postClientAndAddMember = async (firstName: string, lastName: string) => {
    const me = getStoredUser()
    if (!me) throw new Error('Not signed in')
    const payload: Record<string, unknown> = {
      firstName: firstName.trim() || '',
      lastName: lastName.trim() || '',
      email: null,
      phone: null,
      preferredSlots: [],
    }
    if (me.role === 'ADMIN') {
      if (!consultantIdForNewClient) {
        setMemberError(copy.memberErrorConsultant)
        throw new Error('consultant')
      }
      payload.assignedToId = consultantIdForNewClient
    }
    const { data } = await api.post<Client>('/clients', payload)
    if (sessionScopedMembers && onSessionMembersPersist) {
      const next = uniqPositiveClientIds([...members.map((m) => m.id), data.id])
      await onSessionMembersPersist(next)
      await refreshMemberClients()
      onAfterMembersChange?.()
    } else {
      await api.post<ClientGroup>(`/groups/${groupId}/members/${data.id}`)
      await reloadGroup()
      await refreshMemberClients()
      onAfterMembersChange?.()
    }
    setShowNewClientModal(false)
    setMemberError('')
    setMemberDropdownOpen(true)
    queueMicrotask(() => memberSearchInputRef.current?.focus())
  }

  const togglePendingMemberId = (clientId: number) => {
    if (addingMember) return
    setPendingMemberIds((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId],
    )
  }

  const handleAddExistingMembersBulk = async (clientIds: number[]) => {
    const ids = uniqPositiveClientIds(clientIds.filter((id) => !memberIdSet.has(id)))
    if (!groupId || addingMember || ids.length === 0) return
    setAddingMember(true)
    setMemberError('')
    try {
      if (sessionScopedMembers && onSessionMembersPersist) {
        const next = uniqPositiveClientIds([...members.map((m) => m.id), ...ids])
        await onSessionMembersPersist(next)
        await refreshMemberClients()
        onAfterMembersChange?.()
      } else {
        for (const clientId of ids) {
          await api.post<ClientGroup>(`/groups/${groupId}/members/${clientId}`)
        }
        await reloadGroup()
        await refreshMemberClients()
        onAfterMembersChange?.()
      }
      setPendingMemberIds([])
      setMemberDropdownOpen(true)
      queueMicrotask(() => memberSearchInputRef.current?.focus())
    } catch {
      setMemberError(copy.memberErrorCreate)
    } finally {
      setAddingMember(false)
    }
  }

  const handleRemoveMember = async (clientId: number) => {
    if (!groupId || removingMemberId != null) return
    setRemovingMemberId(clientId)
    try {
      if (sessionScopedMembers && onSessionMembersPersist) {
        const next = members.map((m) => m.id).filter((id) => id !== clientId)
        await onSessionMembersPersist(next)
        await refreshMemberClients()
        onAfterMembersChange?.()
      } else {
        await api.delete<ClientGroup>(`/groups/${groupId}/members/${clientId}`)
        await reloadGroup()
        await refreshMemberClients()
        onAfterMembersChange?.()
      }
    } catch {
      /* ignore */
    } finally {
      setRemovingMemberId(null)
    }
  }

  const handleCreateAndAddFromSearch = async () => {
    const typed = memberSearch.trim()
    if (!typed) return
    const { firstName, lastName } = parseClientNameInput(typed)
    if (!lastName.trim() && !firstName.trim()) return
    setAddingMember(true)
    setMemberError('')
    try {
      await postClientAndAddMember(firstName, lastName)
    } catch (e: any) {
      if (e?.message !== 'consultant') {
        setMemberError(e?.response?.data?.message || e?.message || copy.memberErrorCreate)
      }
    } finally {
      setAddingMember(false)
    }
  }

  const handleSaveSession = async () => {
    if (!sessionEmailOverrideMode || !group || !onSaveSessionOverrides) return
    const defaultEmail = (group.email || '').trim()
    const trimmed = emailDraft.trim()
    const emailOut = trimmed === defaultEmail ? '' : trimmed
    const defaultCo = group.billingCompany?.id ?? null
    const coNum = companyDraft ? Number(companyDraft) : 0
    const companyOut = coNum === defaultCo ? 0 : coNum
    setSavingSession(true)
    try {
      await onSaveSessionOverrides({
        groupEmailOverride: emailOut,
        groupBillingCompanyIdOverride: companyOut,
      })
      onClose()
    } finally {
      setSavingSession(false)
    }
  }

  return (
    <div
      className={`modal-backdrop${isNativeAndroid ? ' modal-backdrop-center-android' : ' booking-side-panel-backdrop calendar-group-detail-backdrop'}`}
      onClick={onClose}
    >
      <div
        className={`modal large-modal${isNativeAndroid ? '' : ' booking-side-panel clients-detail-side-panel clients-detail-panel-modern'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="booking-side-panel-header">
          <PageHeader
            title={copy.details}
            subtitle={
              sessionScopeHint
                ? bookingSessionContext
                  ? `${copy.group} · ID ${groupId} · #${bookingSessionContext.bookingId}`
                  : `${copy.group} · ID ${groupId} · ${locale === 'sl' ? 'Nov termin' : 'New booking'}`
                : copy.group
            }
            actions={
              <button type="button" className="secondary booking-side-panel-close" onClick={onClose} aria-label="Close">
                ×
              </button>
            }
          />
        </div>
        <div className={isNativeAndroid ? undefined : 'booking-side-panel-body'}>
          <div className="clients-detail-shell">
            {sessionScopeHint && (
              <p className="muted" style={{ fontSize: '0.86rem', marginBottom: 12 }}>
                {copy.sessionHint}
              </p>
            )}
            {loading && <div className="muted">{copy.loading}</div>}
            {loadError && <div className="error">{loadError}</div>}
            {!loading && !loadError && group && (
              <>
                <div className="clients-detail-hero clients-detail-head-card">
                  <span className="clients-name-avatar clients-detail-avatar" aria-hidden>
                    {(group.name?.[0] || 'G').toUpperCase()}
                  </span>
                  <div className="clients-name-stack">
                    <span className="clients-name">{group.name}</span>
                    <span className="clients-id">ID #{group.id}</span>
                  </div>
                </div>
                <div className="clients-detail-fields">
                  {sessionEmailOverrideMode ? (
                    <>
                      <label className="clients-detail-field-card clients-detail-field-card--wide">
                        <span>{copy.email}</span>
                        <input
                          type="email"
                          value={emailDraft}
                          onChange={(e) => setEmailDraft(e.target.value)}
                          autoComplete="off"
                        />
                      </label>
                      <label className="clients-detail-field-card clients-detail-field-card--wide">
                        <span>{copy.linkedCompany}</span>
                        <select value={companyDraft} onChange={(e) => setCompanyDraft(e.target.value)}>
                          <option value="">{copy.noneCompany}</option>
                          {companies.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </>
                  ) : (
                    <>
                      <div className="clients-detail-field-card clients-detail-field-card--wide">
                        <span>{copy.email}</span>
                        <strong>{group.email?.trim() ? group.email : '—'}</strong>
                      </div>
                      <div className="clients-detail-field-card clients-detail-field-card--wide">
                        <span>{copy.linkedCompany}</span>
                        <strong>{group.billingCompany?.name ?? '—'}</strong>
                      </div>
                    </>
                  )}
                  <div className="clients-detail-field-card clients-detail-field-card--wide group-members-section">
                    <div className="group-members-header">
                      <span>
                        {copy.members} ({members.length})
                      </span>
                    </div>
                    {canManageMembers ? (
                      <>
                        {memberError && (
                          <div className="error" style={{ marginBottom: 8, fontSize: '0.9rem' }}>
                            {memberError}
                          </div>
                        )}
                        <div
                          className="client-picker calendar-client-picker group-members-client-picker"
                          onClick={(e) => e.stopPropagation()}
                          style={{ minWidth: 0 }}
                        >
                          <div className="calendar-client-picker__search-row">
                            <div className="client-search-wrap calendar-client-picker__search-wrap">
                              <span className="client-search-icon calendar-client-picker__search-icon" aria-hidden>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="11" cy="11" r="8" />
                                  <path d="m21 21-4.35-4.35" />
                                </svg>
                              </span>
                              <input
                                ref={memberSearchInputRef}
                                placeholder={copy.searchMembersPlaceholder}
                                value={memberSearch}
                                onChange={(e) => {
                                  setMemberSearch(e.target.value)
                                  setMemberDropdownOpen(true)
                                  setMemberError('')
                                }}
                                onFocus={() => {
                                  if (memberDropdownBlurTimerRef.current != null) {
                                    clearTimeout(memberDropdownBlurTimerRef.current)
                                    memberDropdownBlurTimerRef.current = null
                                  }
                                  setMemberDropdownOpen(true)
                                }}
                                onBlur={() => {
                                  if (memberDropdownBlurTimerRef.current != null) {
                                    clearTimeout(memberDropdownBlurTimerRef.current)
                                  }
                                  memberDropdownBlurTimerRef.current = window.setTimeout(() => {
                                    memberDropdownBlurTimerRef.current = null
                                    setMemberDropdownOpen(false)
                                    setPendingMemberIds([])
                                  }, 280)
                                }}
                                aria-autocomplete="list"
                                aria-expanded={memberDropdownOpen}
                              />
                            </div>
                            <div className="calendar-client-picker__actions">
                              <button
                                type="button"
                                className="secondary client-add-btn calendar-client-picker__add-btn"
                                title={copy.addMember}
                                aria-label={copy.addMember}
                                disabled={addingMember}
                                onClick={() => {
                                  setMemberError('')
                                  const p = parseClientNameInput(memberSearch)
                                  setNewClientForm({ firstName: p.firstName, lastName: p.lastName })
                                  setShowNewClientModal(true)
                                }}
                              >
                                <span aria-hidden>+</span>
                              </button>
                            </div>
                          </div>
                          {memberDropdownOpen &&
                            (memberCandidates.length > 0 || memberSearch.trim() !== '') && (
                              <div
                                className="client-dropdown-panel calendar-client-picker__dropdown group-members-client-dropdown"
                                onMouseDown={(e) => e.preventDefault()}
                                role="listbox"
                                aria-multiselectable="true"
                              >
                                {memberCandidates.slice(0, 10).map((c) => {
                                  const selected = pendingMemberIds.includes(c.id)
                                  return (
                                    <button
                                      key={c.id}
                                      type="button"
                                      role="option"
                                      aria-selected={selected}
                                      className={`client-list-item group-members-candidate-row${selected ? ' selected' : ''}`}
                                      disabled={addingMember}
                                      onMouseDown={(e) => {
                                        e.preventDefault()
                                        togglePendingMemberId(c.id)
                                      }}
                                    >
                                      <span className="group-members-candidate-check" aria-hidden>
                                        {selected ? '✓' : ''}
                                      </span>
                                      <span className="group-members-candidate-name">{fullName(c)}</span>
                                    </button>
                                  )
                                })}
                                {memberCandidates.length === 0 && memberSearch.trim() !== '' && (
                                  <span className="muted" style={{ padding: '8px 10px', display: 'block' }}>
                                    {copy.groupMemberSearchNoResults}
                                  </span>
                                )}
                                {memberCandidates.length > 0 && (
                                  <div className="group-members-dropdown-footer">
                                    <button
                                      type="button"
                                      className="primary"
                                      disabled={pendingMemberIds.length === 0 || addingMember}
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={() => void handleAddExistingMembersBulk(pendingMemberIds)}
                                    >
                                      {pendingMemberIds.length === 0
                                        ? copy.addMembersPickFirst
                                        : copy.addSelectedMembers(pendingMemberIds.length)}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                        </div>
                        {memberSearch.trim() !== '' && memberCandidates.length === 0 && (
                          <div style={{ marginTop: 8 }}>
                            <button
                              type="button"
                              className="secondary"
                              disabled={addingMember}
                              onClick={() => void handleCreateAndAddFromSearch()}
                            >
                              {copy.createAndAdd}
                            </button>
                          </div>
                        )}
                        <div className="group-members-chip-box" role="list" aria-label={copy.members}>
                          {members.length === 0 ? (
                            <div className="group-members-chip-box-empty muted">{copy.noMembers}</div>
                          ) : (
                            members.map((m) => {
                              const label = fullName(m)
                              return (
                                <div key={m.id} className="calendar-multi-client-chip" role="listitem">
                                  <span className="calendar-multi-client-chip__label group-members-chip-name" title={label}>
                                    {label}
                                  </span>
                                  <button
                                    type="button"
                                    className="calendar-multi-client-chip__remove"
                                    disabled={removingMemberId === m.id}
                                    onClick={() => void handleRemoveMember(m.id)}
                                    aria-label={`${copy.removeMember} ${label}`}
                                  >
                                    ×
                                  </button>
                                </div>
                              )
                            })
                          )}
                        </div>
                        {showNewClientModal && (
                          <div
                            className="group-detail-nested-modal-backdrop"
                            onClick={() => setShowNewClientModal(false)}
                            role="presentation"
                          >
                            <div
                              className="group-detail-nested-modal"
                              onClick={(e) => e.stopPropagation()}
                              role="dialog"
                              aria-labelledby="group-detail-new-client-title"
                            >
                              <h3 id="group-detail-new-client-title" style={{ marginTop: 0, marginBottom: 12 }}>
                                {copy.newClientTitle}
                              </h3>
                              <div className="stack gap-sm" style={{ marginBottom: 12 }}>
                                <label className="stack gap-xs">
                                  <span className="muted" style={{ fontSize: '0.85rem' }}>
                                    {locale === 'sl' ? 'Ime' : 'First name'}
                                  </span>
                                  <input
                                    className="input"
                                    value={newClientForm.firstName}
                                    onChange={(e) => setNewClientForm((f) => ({ ...f, firstName: e.target.value }))}
                                    autoComplete="off"
                                  />
                                </label>
                                <label className="stack gap-xs">
                                  <span className="muted" style={{ fontSize: '0.85rem' }}>
                                    {locale === 'sl' ? 'Priimek' : 'Last name'}
                                  </span>
                                  <input
                                    className="input"
                                    value={newClientForm.lastName}
                                    onChange={(e) => setNewClientForm((f) => ({ ...f, lastName: e.target.value }))}
                                    autoComplete="off"
                                  />
                                </label>
                              </div>
                              <div className="form-actions" style={{ marginTop: 0, justifyContent: 'flex-end', gap: 8 }}>
                                <button type="button" className="secondary" onClick={() => setShowNewClientModal(false)}>
                                  {copy.newClientCancel}
                                </button>
                                <button
                                  type="button"
                                  disabled={addingMember}
                                  onClick={() => {
                                    void (async () => {
                                      setAddingMember(true)
                                      setMemberError('')
                                      try {
                                        await postClientAndAddMember(newClientForm.firstName, newClientForm.lastName)
                                      } catch (e: any) {
                                        if (e?.message !== 'consultant') {
                                          setMemberError(
                                            e?.response?.data?.message || e?.message || copy.memberErrorCreate,
                                          )
                                        }
                                      } finally {
                                        setAddingMember(false)
                                      }
                                    })()
                                  }}
                                >
                                  {copy.newClientCreate}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="group-members-chip-box" role="list" aria-label={copy.members}>
                        {members.length === 0 ? (
                          <div className="group-members-chip-box-empty muted">{copy.noMembers}</div>
                        ) : (
                          members.map((m) => {
                            const label = fullName(m)
                            return (
                              <div
                                key={m.id}
                                className="calendar-multi-client-chip group-members-chip-readonly"
                                role="listitem"
                              >
                                <span className="calendar-multi-client-chip__label group-members-chip-name" title={label}>
                                  {label}
                                </span>
                              </div>
                            )
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {sessionEmailOverrideMode && onSaveSessionOverrides && (
                  <div className="form-actions" style={{ marginTop: 16 }}>
                    <button type="button" disabled={savingSession} onClick={() => void handleSaveSession()}>
                      {savingSession ? copy.saving : copy.saveSession}
                    </button>
                  </div>
                )}
              </>
            )}
            {!loading && !loadError && !group && <EmptyState title={copy.loadError} text="" />}
          </div>
        </div>
      </div>
    </div>
  )
}
