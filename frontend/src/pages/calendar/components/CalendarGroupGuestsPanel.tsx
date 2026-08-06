import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, getApiErrorMessage } from '../../../api'
import './CalendarGroupGuestsPanel.css'

type CalendarGroupGuestsPanelProps = {
  session: any
  group: any
  clients: any[]
  locale: string
  onClose: () => void
  onSessionUpdated: (session: any) => void
}

type PanelMode = 'current' | 'add'

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

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5" />
    </svg>
  )
}

export function CalendarGroupGuestsPanel({
  session,
  group,
  clients,
  locale,
  onClose,
  onSessionUpdated,
}: CalendarGroupGuestsPanelProps) {
  const [mode, setMode] = useState<PanelMode>('current')
  const [query, setQuery] = useState('')
  const [busyClientId, setBusyClientId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sl = locale === 'sl'
  const sr = locale === 'sr'
  const copy = sl
    ? {
        guests: 'Gostje', details: 'Podrobnosti skupine', close: 'Zapri', registered: 'Prijavljeni',
        free: 'Mesta prosta', unlimited: 'Brez omejitve', search: 'Išči po imenu, e-pošti ali telefonu…',
        addGuest: 'Dodaj gosta', backToGuests: 'Nazaj na prijavljene', guest: 'Gost', contact: 'Kontakt',
        actions: 'Dejanja', empty: 'V ta termin še ni dodan noben gost.', noResults: 'Ni zadetkov za izbrano iskanje.',
        noCandidates: 'Vse aktivne stranke so že dodane v ta termin.', groupMember: 'Član skupine', client: 'Stranka',
        remove: 'Odstrani iz termina', add: 'Dodaj v termin', full: 'Termin je zapolnjen.',
        infoCurrent: 'Odstranitev velja samo za ta termin in ne spremeni članstva v skupini.',
        infoAdd: 'Dodajanje velja samo za ta termin. Članstvo v skupini ostane nespremenjeno.',
      }
    : sr
      ? {
          guests: 'Gosti', details: 'Detalji grupe', close: 'Zatvori', registered: 'Prijavljeni',
          free: 'Slobodna mesta', unlimited: 'Bez ograničenja', search: 'Pretraži po imenu, e-pošti ili telefonu…',
          addGuest: 'Dodaj gosta', backToGuests: 'Nazad na prijavljene', guest: 'Gost', contact: 'Kontakt',
          actions: 'Radnje', empty: 'U ovaj termin još nije dodat nijedan gost.', noResults: 'Nema rezultata za ovu pretragu.',
          noCandidates: 'Sve aktivne stranke su već dodate u termin.', groupMember: 'Član grupe', client: 'Stranka',
          remove: 'Ukloni iz termina', add: 'Dodaj u termin', full: 'Termin je popunjen.',
          infoCurrent: 'Uklanjanje važi samo za ovaj termin i ne menja članstvo u grupi.',
          infoAdd: 'Dodavanje važi samo za ovaj termin. Članstvo u grupi ostaje nepromenjeno.',
        }
      : {
          guests: 'Guests', details: 'Group details', close: 'Close', registered: 'Registered',
          free: 'Spots available', unlimited: 'Unlimited', search: 'Search by name, email or phone…',
          addGuest: 'Add guest', backToGuests: 'Back to registered', guest: 'Guest', contact: 'Contact',
          actions: 'Actions', empty: 'No guests have been added to this session yet.', noResults: 'No matching guests found.',
          noCandidates: 'All active clients are already added to this session.', groupMember: 'Group member', client: 'Client',
          remove: 'Remove from session', add: 'Add to session', full: 'This session is full.',
          infoCurrent: 'Removal applies only to this session and does not change group membership.',
          infoAdd: 'Adding applies only to this session. Group membership stays unchanged.',
        }

  const attendees = useMemo(() => {
    const seen = new Set<number>()
    return (Array.isArray(session?.clients) ? session.clients : [])
      .filter((client: any) => {
        const id = Number(client?.id)
        if (!Number.isInteger(id) || id <= 0 || seen.has(id)) return false
        seen.add(id)
        return true
      })
  }, [session?.clients])

  const attendeeIds = useMemo(
    () => new Set(attendees.map((client: any) => Number(client?.id))),
    [attendees],
  )
  const groupMemberIds = useMemo(
    () => new Set((Array.isArray(group?.members) ? group.members : []).map((client: any) => Number(client?.id))),
    [group?.members],
  )
  const capacity = useMemo(() => sessionCapacity(session), [session])
  const freeSpots = capacity == null ? null : Math.max(0, capacity - attendees.length)
  const isFull = capacity != null && attendees.length >= capacity
  const normalizedQuery = query.trim().toLowerCase()

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
      setQuery('')
      setMode('current')
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
      setQuery('')
    } catch (requestError: any) {
      setError(getApiErrorMessage(requestError, sl ? 'Gosta ni bilo mogoče odstraniti.' : 'Failed to remove guest.'))
    } finally {
      setBusyClientId(null)
    }
  }

  const titleName = String(group?.name || '').trim() || (sl ? `Skupina #${session?.groupId || ''}` : `Group #${session?.groupId || ''}`)
  const displayedRows = mode === 'current' ? visibleAttendees : availableClients

  const content = (
    <div className="calendar-group-guests-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && busyClientId == null) onClose()
    }}>
      <section className="calendar-group-guests-panel" role="dialog" aria-modal="true" aria-labelledby="calendar-group-guests-title">
        <header className="calendar-group-guests-header">
          <button type="button" className="calendar-group-guests-icon-button calendar-group-guests-close-desktop" onClick={onClose} aria-label={copy.close} disabled={busyClientId != null}>
            <CloseIcon />
          </button>
          <button type="button" className="calendar-group-guests-icon-button calendar-group-guests-back-mobile" onClick={onClose} aria-label={copy.close} disabled={busyClientId != null}>
            <BackIcon />
          </button>
          <div className="calendar-group-guests-heading">
            <h2 id="calendar-group-guests-title">
              <span className="calendar-group-guests-title-desktop">{titleName} – {copy.details}</span>
              <span className="calendar-group-guests-title-mobile">{titleName} – {copy.guests}</span>
            </h2>
            <p>{serviceLabel(session)} <span aria-hidden="true">•</span> {sessionDateTime(session, locale)}</p>
          </div>
          <button type="button" className="calendar-group-guests-close-text" onClick={onClose} disabled={busyClientId != null}>{copy.close}</button>
        </header>

        <div className="calendar-group-guests-scroll">
          <div className="calendar-group-guests-summary">
            <div className="calendar-group-guests-stat">
              <span className="calendar-group-guests-stat-icon calendar-group-guests-stat-icon--blue"><PeopleIcon /></span>
              <div><strong>{capacity == null ? attendees.length : `${attendees.length} / ${capacity}`}</strong><span>{copy.registered}</span></div>
            </div>
            <div className="calendar-group-guests-stat">
              <span className="calendar-group-guests-stat-icon calendar-group-guests-stat-icon--green"><CheckIcon /></span>
              <div><strong>{freeSpots == null ? '∞' : freeSpots}</strong><span>{freeSpots == null ? copy.unlimited : copy.free}</span></div>
            </div>
            <div className="calendar-group-guests-session-meta">
              <strong>{serviceLabel(session)}</strong>
              <span>{sessionDateTime(session, locale)}</span>
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

          {error && <div className="calendar-group-guests-error" role="alert">{error}</div>}
          {mode === 'current' && isFull && <div className="calendar-group-guests-capacity-note">{copy.full}</div>}

          <div className="calendar-group-guests-table" data-mode={mode}>
            <div className="calendar-group-guests-table-head">
              <span>{copy.guest}</span>
              <span>{copy.contact}</span>
              <span>{copy.actions}</span>
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
                    <div className="calendar-group-guests-actions">
                      {mode === 'current' ? (
                        <button
                          type="button"
                          className="calendar-group-guests-row-action calendar-group-guests-row-action--remove"
                          onClick={() => void removeClient(client)}
                          disabled={busyClientId != null}
                          aria-label={`${copy.remove}: ${clientName(client)}`}
                          title={copy.remove}
                        >
                          {loading ? <span className="calendar-group-guests-spinner" /> : <TrashIcon />}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="calendar-group-guests-row-action calendar-group-guests-row-action--add"
                          onClick={() => void addClient(client)}
                          disabled={busyClientId != null || isFull}
                          aria-label={`${copy.add}: ${clientName(client)}`}
                          title={isFull ? copy.full : copy.add}
                        >
                          {loading ? <span className="calendar-group-guests-spinner" /> : <PlusIcon />}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <footer className="calendar-group-guests-footer">
          <span className="calendar-group-guests-info-icon">i</span>
          <span>{mode === 'current' ? copy.infoCurrent : copy.infoAdd}</span>
        </footer>
      </section>
    </div>
  )

  return createPortal(content, document.body)
}
