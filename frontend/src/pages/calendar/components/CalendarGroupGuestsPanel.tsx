import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, getApiErrorMessage } from '../../../api'
import { bookingStatusDisplayLabel, deriveBookingStatus } from '../calendarStatus'
import { PanelBanner, PanelBody, PanelFooter, PanelHeader, SidePanel } from '../../../components/panel'
import './CalendarGroupGuestsPanel.css'

type CalendarGroupGuestsPanelProps = {
  session: any
  group: any
  clients: any[]
  locale: string
  noShowModuleEnabled?: boolean
  onClose: () => void
  onSessionUpdated: (session: any) => void
}

type PanelMode = 'current' | 'add'

type ParticipantStatusRow = {
  bookingId: number
  client: any
  bookingStatus: string
  lifecycleStatus: string
}

function clientName(client: any) {
  const name = `${client?.firstName || ''} ${client?.lastName || ''}`.trim()
  return name || client?.email || client?.phone || '—'
}

function clientInitials(client: any) {
  const parts = `${client?.firstName || ''} ${client?.lastName || ''}`.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return `${parts[0]?.[0] || ''}${parts.length > 1 ? parts[parts.length - 1]?.[0] || '' : ''}`.toUpperCase()
}

function matchesClient(client: any, query: string) {
  if (!query) return true
  const haystack = `${clientName(client)} ${client?.email || ''} ${client?.phone || ''}`.toLowerCase()
  return haystack.includes(query)
}

function positiveInteger(value: unknown) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function sessionCapacity(session: any) {
  const sessionOverride = positiveInteger(session?.maxParticipantsOverride)
  if (sessionOverride != null) return sessionOverride
  const serviceLimits = (Array.isArray(session?.services) ? session.services : [])
    .map((service: any) => positiveInteger(service?.type?.maxParticipantsPerSession))
    .filter((value: number | null): value is number => value != null)
  const fallback = positiveInteger(session?.type?.maxParticipantsPerSession)
  const limits = fallback == null ? serviceLimits : [...serviceLimits, fallback]
  return limits.length > 0 ? Math.min(...limits) : null
}

function serviceLabel(session: any) {
  const services = Array.isArray(session?.services) ? session.services : []
  const names = services
    .map((service: any) => String(service?.type?.name || '').trim())
    .filter(Boolean)
  if (names.length > 0) return names.join(' · ')
  return String(session?.type?.name || '').trim() || '—'
}

function sessionDateTime(session: any, locale: string) {
  const start = new Date(session?.startTime)
  const end = new Date(session?.endTime)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return '—'
  const localeCode = locale === 'sl' ? 'sl-SI' : locale === 'sr' ? 'sr-Latn-RS' : 'en-GB'
  const date = new Intl.DateTimeFormat(localeCode, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(start)
  const time = new Intl.DateTimeFormat(localeCode, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return `${date} · ${time.format(start)} – ${time.format(end)}`
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
    </svg>
  )
}

function PlusPersonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8" cy="7" r="4" />
      <path d="M19 8v6M22 11h-6" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

function normalizeParticipantStoredStatus(value: unknown) {
  const status = String(value ?? '').trim().toUpperCase()
  if (status === 'CANCELLED' || status === 'NO_SHOW' || status === 'CHECKED_OUT') return status
  return 'RESERVED'
}

export function CalendarGroupGuestsPanel({
  session,
  group,
  clients,
  locale,
  noShowModuleEnabled = true,
  onClose,
  onSessionUpdated,
}: CalendarGroupGuestsPanelProps) {
  const [mode, setMode] = useState<PanelMode>('current')
  const [query, setQuery] = useState('')
  const [busyClientId, setBusyClientId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [participantRows, setParticipantRows] = useState<ParticipantStatusRow[] | null>(null)

  const sl = locale === 'sl'
  const sr = locale === 'sr'
  const copy = sl
    ? {
        guests: 'Gostje', details: 'Podrobnosti skupine', close: 'Zapri', registered: 'Prijavljeni',
        free: 'Mesta prosta', unlimited: 'Brez omejitve', search: 'Išči po imenu, e-pošti ali telefonu…',
        addGuest: 'Dodaj gosta', backToGuests: 'Nazaj na prijavljene', guest: 'Gost', contact: 'Kontakt',
        status: 'Status', actions: 'Dejanja', empty: 'V ta termin še ni dodan noben gost.', noResults: 'Ni zadetkov za izbrano iskanje.',
        noCandidates: 'Vse aktivne stranke so že dodane v ta termin.', groupMember: 'Član skupine', client: 'Stranka',
        remove: 'Odstrani iz termina', add: 'Dodaj v termin', full: 'Termin je zapolnjen.',
        infoCurrent: 'Status gosta velja samo za ta termin in ne spremeni članstva v skupini.',
        infoAdd: 'Dodajanje velja samo za ta termin. Članstvo v skupini ostane nespremenjeno.',
        participantLoadError: 'Statusov gostov ni bilo mogoče naložiti.',
        participantStatusError: 'Statusa gosta ni bilo mogoče spremeniti.',
      }
    : sr
      ? {
          guests: 'Gosti', details: 'Detalji grupe', close: 'Zatvori', registered: 'Prijavljeni',
          free: 'Slobodna mesta', unlimited: 'Bez ograničenja', search: 'Pretraži po imenu, e-pošti ili telefonu…',
          addGuest: 'Dodaj gosta', backToGuests: 'Nazad na prijavljene', guest: 'Gost', contact: 'Kontakt',
          status: 'Status', actions: 'Radnje', empty: 'U ovaj termin još nije dodat nijedan gost.', noResults: 'Nema rezultata za ovu pretragu.',
          noCandidates: 'Sve aktivne stranke su već dodate u termin.', groupMember: 'Član grupe', client: 'Stranka',
          remove: 'Ukloni iz termina', add: 'Dodaj u termin', full: 'Termin je popunjen.',
          infoCurrent: 'Status gosta važi samo za ovaj termin i ne menja članstvo u grupi.',
          infoAdd: 'Dodavanje važi samo za ovaj termin. Članstvo u grupi ostaje nepromenjeno.',
          participantLoadError: 'Nije moguće učitati statuse gostiju.',
          participantStatusError: 'Nije moguće promeniti status gosta.',
        }
      : {
          guests: 'Guests', details: 'Group details', close: 'Close', registered: 'Registered',
          free: 'Spots available', unlimited: 'Unlimited', search: 'Search by name, email or phone…',
          addGuest: 'Add guest', backToGuests: 'Back to registered', guest: 'Guest', contact: 'Contact',
          status: 'Status', actions: 'Actions', empty: 'No guests have been added to this session yet.', noResults: 'No matching guests found.',
          noCandidates: 'All active clients are already added to this session.', groupMember: 'Group member', client: 'Client',
          remove: 'Remove from session', add: 'Add to session', full: 'This session is full.',
          infoCurrent: 'Guest status applies only to this session and does not change group membership.',
          infoAdd: 'Adding applies only to this session. Group membership stays unchanged.',
          participantLoadError: 'Guest statuses could not be loaded.',
          participantStatusError: 'Guest status could not be changed.',
        }

  const refreshParticipantRows = useCallback(async (surfaceError = false) => {
    const bookingId = Number(session?.id)
    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      setParticipantRows(null)
      return
    }
    try {
      const { data } = await api.get(`/bookings/${bookingId}/participants`)
      setParticipantRows(Array.isArray(data) ? data : [])
    } catch (requestError: any) {
      if (surfaceError) {
        setError(getApiErrorMessage(requestError, copy.participantLoadError))
      }
    }
  }, [copy.participantLoadError, session?.id])

  useEffect(() => {
    setParticipantRows(null)
    void refreshParticipantRows(false)
  }, [refreshParticipantRows])

  const fallbackAttendees = useMemo(() => {
    const seen = new Set<number>()
    return (Array.isArray(session?.clients) ? session.clients : [])
      .filter((client: any) => {
        const id = Number(client?.id)
        if (!Number.isInteger(id) || id <= 0 || seen.has(id)) return false
        seen.add(id)
        return true
      })
  }, [session?.clients])

  const participantStatusByClientId = useMemo(() => {
    const map = new Map<number, ParticipantStatusRow>()
    for (const row of participantRows ?? []) {
      const id = Number(row?.client?.id)
      if (Number.isInteger(id) && id > 0) map.set(id, row)
    }
    return map
  }, [participantRows])

  const attendees = useMemo(() => {
    if (participantRows == null) return fallbackAttendees
    const seen = new Set<number>()
    return participantRows
      .map((row) => row?.client)
      .filter((client: any) => {
        const id = Number(client?.id)
        if (!Number.isInteger(id) || id <= 0 || seen.has(id)) return false
        seen.add(id)
        return true
      })
  }, [fallbackAttendees, participantRows])

  const attendeeIds = useMemo(() => {
    if (participantRows == null) return new Set(attendees.map((client: any) => Number(client?.id)))
    return new Set(
      participantRows
        .filter((row) => normalizeParticipantStoredStatus(row?.bookingStatus) !== 'CANCELLED')
        .map((row) => Number(row?.client?.id))
        .filter((id) => Number.isInteger(id) && id > 0),
    )
  }, [attendees, participantRows])

  const registeredCount = useMemo(() => {
    if (participantRows == null) return attendees.length
    return participantRows.filter((row) => normalizeParticipantStoredStatus(row?.bookingStatus) !== 'CANCELLED').length
  }, [attendees.length, participantRows])

  const capacityParticipantCount = useMemo(() => {
    if (participantRows == null) return attendees.length
    return participantRows.filter((row) => {
      const status = normalizeParticipantStoredStatus(row?.bookingStatus)
      return status !== 'CANCELLED' && status !== 'NO_SHOW'
    }).length
  }, [attendees.length, participantRows])

  const groupMemberIds = useMemo(
    () => new Set((Array.isArray(group?.members) ? group.members : []).map((client: any) => Number(client?.id))),
    [group?.members],
  )
  const capacity = useMemo(() => sessionCapacity(session), [session])
  const freeSpots = capacity == null ? null : Math.max(0, capacity - capacityParticipantCount)
  const isFull = capacity != null && capacityParticipantCount >= capacity
  const normalizedQuery = query.trim().toLowerCase()
  const groupLifecycleStatus = deriveBookingStatus(session?.startTime, session?.endTime, session?.bookingStatus)
  const participantStatusEditable = groupLifecycleStatus === 'ONGOING' || groupLifecycleStatus === 'CHECKED_OUT'

  const visibleAttendees = useMemo(
    () => attendees.filter((client: any) => matchesClient(client, normalizedQuery)),
    [attendees, normalizedQuery],
  )

  const availableClients = useMemo(() => {
    return (Array.isArray(clients) ? clients : [])
      .filter((client: any) => {
        const id = Number(client?.id)
        return Number.isInteger(id) && id > 0 && client?.active !== false && !attendeeIds.has(id)
      })
      .filter((client: any) => matchesClient(client, normalizedQuery))
      .sort((left: any, right: any) => {
        const leftMember = groupMemberIds.has(Number(left?.id)) ? 0 : 1
        const rightMember = groupMemberIds.has(Number(right?.id)) ? 0 : 1
        if (leftMember !== rightMember) return leftMember - rightMember
        return clientName(left).localeCompare(clientName(right), locale === 'sl' ? 'sl' : undefined)
      })
  }, [attendeeIds, clients, groupMemberIds, locale, normalizedQuery])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && busyClientId == null) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [busyClientId, onClose])

  useEffect(() => {
    setError(null)
  }, [mode, query])

  const addClient = async (client: any) => {
    const clientId = Number(client?.id)
    const bookingId = Number(session?.id)
    if (!Number.isInteger(clientId) || clientId <= 0 || !Number.isInteger(bookingId) || bookingId <= 0 || isFull) return
    setBusyClientId(clientId)
    setError(null)
    try {
      const { data } = await api.post(`/bookings/${bookingId}/participants`, { clientId })
      onSessionUpdated(data)
      await refreshParticipantRows(false)
      setQuery('')
    } catch (requestError: any) {
      setError(getApiErrorMessage(requestError, sl ? 'Gosta ni bilo mogoče dodati.' : 'Failed to add guest.'))
    } finally {
      setBusyClientId(null)
    }
  }

  const removeClient = async (client: any) => {
    const clientId = Number(client?.id)
    const bookingId = Number(session?.id)
    if (!Number.isInteger(clientId) || clientId <= 0 || !Number.isInteger(bookingId) || bookingId <= 0) return
    setBusyClientId(clientId)
    setError(null)
    try {
      const { data } = await api.delete(`/bookings/${bookingId}/participants/${clientId}`)
      onSessionUpdated(data)
      await refreshParticipantRows(false)
      setQuery('')
    } catch (requestError: any) {
      setError(getApiErrorMessage(requestError, sl ? 'Gosta ni bilo mogoče odstraniti.' : 'Failed to remove guest.'))
    } finally {
      setBusyClientId(null)
    }
  }

  const setParticipantStatus = async (client: any, targetStatus: 'CANCELLED' | 'NO_SHOW') => {
    const clientId = Number(client?.id)
    const bookingId = Number(session?.id)
    if (!Number.isInteger(clientId) || clientId <= 0 || !Number.isInteger(bookingId) || bookingId <= 0) return
    setBusyClientId(clientId)
    setError(null)
    try {
      const response = targetStatus === 'CANCELLED'
        ? await api.delete(`/bookings/${bookingId}/participants/${clientId}`)
        : await api.post(`/bookings/${bookingId}/no-show-clients`, { clientIds: [clientId] })
      onSessionUpdated(response.data)
      await refreshParticipantRows(false)
    } catch (requestError: any) {
      setError(getApiErrorMessage(requestError, copy.participantStatusError))
    } finally {
      setBusyClientId(null)
    }
  }

  const participantLifecycleForClient = (client: any) => {
    const row = participantStatusByClientId.get(Number(client?.id))
    const stored = normalizeParticipantStoredStatus(row?.bookingStatus)
    if (stored === 'CANCELLED' || stored === 'NO_SHOW') return stored
    return String(row?.lifecycleStatus || groupLifecycleStatus || 'RESERVED').toUpperCase()
  }

  const participantTone = (status: string) => {
    if (status === 'CANCELLED') return 'cancelled'
    if (status === 'NO_SHOW') return 'no-show'
    if (status === 'ONGOING') return 'ongoing'
    if (status === 'CHECKED_OUT') return 'checked-out'
    return 'reserved'
  }

  const titleName = String(group?.name || session?.groupName || '').trim() || (sl ? `Skupina #${session?.groupId || ''}` : `Group #${session?.groupId || ''}`)
  const displayedRows = mode === 'current' ? visibleAttendees : availableClients

  return (
    <SidePanel
      open
      onClose={onClose}
      ariaLabel={`${titleName} – ${copy.guests}`}
      size="xl"
      className="cp-panel--calendar-standardized calendar-group-guests-side-panel"
      closeOnScrimClick={busyClientId == null}
      closeOnEscape={busyClientId == null}
    >
        <PanelHeader
          title={
            <span className="calendar-group-guests-standard-title">
              <span>{copy.details}</span>
            </span>
          }
          subtitle={`${titleName} · ${sessionDateTime(session, locale)}`}
          onClose={onClose}
          closeLabel={copy.close}
        />

        <PanelBody className="calendar-standardized-body calendar-group-guests-body">
          <div className="calendar-group-guests-summary">
            <div className="calendar-group-guests-stat">
              <span className="calendar-group-guests-stat-icon calendar-group-guests-stat-icon--blue"><PeopleIcon /></span>
              <div><strong>{registeredCount}</strong><span>{copy.registered}</span></div>
            </div>
            <div className="calendar-group-guests-stat">
              <span className="calendar-group-guests-stat-icon calendar-group-guests-stat-icon--green"><CheckIcon /></span>
              <div><strong>{freeSpots == null ? '∞' : freeSpots}</strong><span>{freeSpots == null ? copy.unlimited : copy.free}</span></div>
            </div>
            <div className="calendar-group-guests-session-meta">
              <span className="calendar-group-guests-stat-icon calendar-group-guests-stat-icon--purple"><CalendarIcon /></span>
              <div>
                <strong>{serviceLabel(session)}</strong>
                <span>{sessionDateTime(session, locale)}</span>
              </div>
            </div>
          </div>

          <div className="calendar-group-guests-toolbar">
            <label className="calendar-group-guests-search">
              <SearchIcon />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={copy.search}
                aria-label={copy.search}
              />
            </label>
            <button
              type="button"
              className={`calendar-group-guests-add-toggle${mode === 'add' ? ' calendar-group-guests-add-toggle--active' : ''}`}
              onClick={() => {
                setMode((current) => current === 'add' ? 'current' : 'add')
                setQuery('')
              }}
              disabled={busyClientId != null || (mode === 'current' && isFull)}
              title={mode === 'current' && isFull ? copy.full : undefined}
            >
              {mode === 'add' ? <BackIcon /> : <PlusPersonIcon />}
              <span>{mode === 'add' ? copy.backToGuests : copy.addGuest}</span>
            </button>
          </div>

          {error && <PanelBanner tone="error">{error}</PanelBanner>}
          {mode === 'current' && isFull && <div className="calendar-group-guests-capacity-note">{copy.full}</div>}

          <div className="calendar-group-guests-table" data-mode={mode}>
            <div className="calendar-group-guests-table-head">
              <span>{copy.guest}</span>
              <span>{copy.contact}</span>
              <span>{mode === 'current' ? `${copy.status} / ${copy.actions}` : copy.actions}</span>
            </div>
            <div className="calendar-group-guests-rows">
              {displayedRows.length === 0 ? (
                <div className="calendar-group-guests-empty">
                  {normalizedQuery ? copy.noResults : mode === 'current' ? copy.empty : copy.noCandidates}
                </div>
              ) : displayedRows.map((client: any) => {
                const id = Number(client?.id)
                const loading = busyClientId === id
                const member = groupMemberIds.has(id)
                const lifecycleStatus = mode === 'current' ? participantLifecycleForClient(client) : 'RESERVED'
                const terminalStatus = lifecycleStatus === 'CANCELLED' || lifecycleStatus === 'NO_SHOW'
                const canSetStatus = mode === 'current' && participantStatusEditable && !terminalStatus
                return (
                  <div className="calendar-group-guests-row" key={id}>
                    <div className="calendar-group-guests-person">
                      <span className="calendar-group-guests-avatar">{clientInitials(client)}</span>
                      <div className="calendar-group-guests-person-copy">
                        <strong>{clientName(client)}</strong>
                        {mode === 'add' && <span className={`calendar-group-guests-kind${member ? ' calendar-group-guests-kind--member' : ''}`}>{member ? copy.groupMember : copy.client}</span>}
                        <span className="calendar-group-guests-mobile-contact">{client?.email || client?.phone || '—'}</span>
                      </div>
                    </div>
                    <div className="calendar-group-guests-contact">
                      <span>{client?.email || '—'}</span>
                      <span>{client?.phone || ''}</span>
                    </div>
                    <div className={`calendar-group-guests-actions${mode === 'current' ? ' calendar-group-guests-actions--current' : ''}`}>
                      {mode === 'current' ? (
                        <>
                          <div className="calendar-group-guests-status">
                            {canSetStatus ? (
                              <select
                                className={`calendar-group-guests-status-select calendar-group-guests-status-select--${participantTone(lifecycleStatus)}`}
                                value={lifecycleStatus}
                                onChange={(event) => {
                                  const target = String(event.target.value).toUpperCase()
                                  if (target === 'CANCELLED' || target === 'NO_SHOW') {
                                    void setParticipantStatus(client, target)
                                  }
                                }}
                                disabled={busyClientId != null}
                                aria-label={`${copy.status}: ${clientName(client)}`}
                              >
                                <option value={lifecycleStatus}>{bookingStatusDisplayLabel(lifecycleStatus, locale)}</option>
                                <option value="CANCELLED">{bookingStatusDisplayLabel('CANCELLED', locale)}</option>
                                {noShowModuleEnabled && <option value="NO_SHOW">{bookingStatusDisplayLabel('NO_SHOW', locale)}</option>}
                              </select>
                            ) : (
                              <span className={`calendar-group-guests-status-pill calendar-group-guests-status-pill--${participantTone(lifecycleStatus)}`}>
                                {bookingStatusDisplayLabel(lifecycleStatus, locale)}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            className="calendar-group-guests-row-action calendar-group-guests-row-action--remove"
                            onClick={() => void removeClient(client)}
                            disabled={busyClientId != null || terminalStatus}
                            aria-label={`${copy.remove}: ${clientName(client)}`}
                            title={copy.remove}
                          >
                            {loading ? <span className="calendar-group-guests-spinner" /> : <XIcon />}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="calendar-group-guests-row-action calendar-group-guests-row-action--add"
                          onClick={() => void addClient(client)}
                          disabled={busyClientId != null || isFull}
                          aria-label={`${copy.add}: ${clientName(client)}`}
                          title={isFull ? copy.full : copy.add}
                        >
                          {loading ? <span className="calendar-group-guests-spinner" /> : <CheckIcon />}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </PanelBody>

        <PanelFooter>
          <span className="calendar-group-guests-footer-note">
            <span className="calendar-group-guests-info-icon">i</span>
            {mode === 'current' ? copy.infoCurrent : copy.infoAdd}
          </span>
        </PanelFooter>
    </SidePanel>
  )
}
