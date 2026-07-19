import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useLocale } from '../locale'

type Employee = { id: number; name: string }
type WindowView = { id: number; dayOfWeek?: string | null; date?: string | null; timeFrom?: string | null; timeTo?: string | null; allDay: boolean }
type OfferView = {
  id: number
  status: string
  slotStart: string
  slotEnd: string
  employee?: Employee | null
  roomName?: string | null
  offeredAt: string
  expiresAt: string
  acceptedAt?: string | null
  declinedAt?: string | null
  secondsRemaining: number
}
type EventView = { id: number; type: string; detail?: string | null; occurredAt: string; actorName?: string | null }
type WaitlistRequest = {
  id: number
  clientName: string
  clientEmail?: string | null
  clientPhone?: string | null
  clientId?: number | null
  serviceId: number
  serviceName: string
  serviceDurationMinutes?: number | null
  breakMinutes?: number | null
  locationId?: number | null
  locationName?: string | null
  targetType: string
  targetSessionId?: number | null
  dateFrom: string
  dateTo: string
  employeePreferenceType: string
  specificEmployee?: Employee | null
  selectedEmployees: Employee[]
  requestedParticipants: number
  status: string
  source: string
  notes?: string | null
  joinedAt: string
  expiresAt?: string | null
  bookedBookingId?: number | null
  windows: WindowView[]
  currentOffer?: OfferView | null
  history: EventView[]
}

type LookupItem = { id: number; name: string }
type ClientItem = { id: number; firstName?: string; lastName?: string; email?: string; phone?: string }

type RequestForm = {
  clientId: string
  serviceId: string
  locationId: string
  targetType: string
  dateFrom: string
  dateTo: string
  employeePreferenceType: string
  specificEmployeeId: string
  requestedParticipants: string
  timeFrom: string
  timeTo: string
  notes: string
}

type OfferForm = {
  slotStart: string
  slotEnd: string
  employeeId: string
  roomId: string
  validityMinutes: string
}

const emptyRequestForm = (): RequestForm => ({
  clientId: '', serviceId: '', locationId: '', targetType: 'FLEXIBLE_WINDOW', dateFrom: '', dateTo: '',
  employeePreferenceType: 'ANY', specificEmployeeId: '', requestedParticipants: '1', timeFrom: '08:00', timeTo: '18:00', notes: '',
})

const emptyOfferForm = (): OfferForm => ({ slotStart: '', slotEnd: '', employeeId: '', roomId: '', validityMinutes: '15' })

const formatDate = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('sl-SI', { dateStyle: 'medium' }).format(date)
}

const formatDateTime = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('sl-SI', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

const remainingLabel = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safe / 60)
  const secs = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function statusLabel(status: string, locale: string) {
  const sl: Record<string, string> = {
    ACTIVE: 'Čaka na ponudbo', OFFERED: 'Ponudba poslana', OFFER_ACCEPTED: 'Ponudba sprejeta', BOOKED: 'Rezervirano',
    DECLINED: 'Zavrnjeno', EXPIRED: 'Poteklo', CANCELLED: 'Preklicano', REMOVED: 'Odstranjeno',
  }
  const en: Record<string, string> = {
    ACTIVE: 'Waiting', OFFERED: 'Offer sent', OFFER_ACCEPTED: 'Offer accepted', BOOKED: 'Booked', DECLINED: 'Declined',
    EXPIRED: 'Expired', CANCELLED: 'Cancelled', REMOVED: 'Removed',
  }
  return (locale === 'sl' ? sl : en)[status] ?? status
}

function targetTypeLabel(type: string, locale: string) {
  const sl: Record<string, string> = { EXACT_TIME: 'Točen termin', FLEXIBLE_WINDOW: 'Prilagodljiv termin', GROUP_SESSION: 'Skupinski termin', COURSE_OCCURRENCE: 'Termin tečaja' }
  const en: Record<string, string> = { EXACT_TIME: 'Exact time', FLEXIBLE_WINDOW: 'Flexible window', GROUP_SESSION: 'Group session', COURSE_OCCURRENCE: 'Course occurrence' }
  return (locale === 'sl' ? sl : en)[type] ?? type
}

function sourceLabel(source: string, locale: string) {
  const sl: Record<string, string> = { WIDGET: 'Spletni vtičnik', GUEST_APP: 'Aplikacija za goste', STAFF: 'Osebje', PHONE: 'Telefon', OTHER: 'Drugo' }
  const en: Record<string, string> = { WIDGET: 'Website widget', GUEST_APP: 'Guest app', STAFF: 'Staff', PHONE: 'Phone', OTHER: 'Other' }
  return (locale === 'sl' ? sl : en)[source] ?? source
}

function icon(kind: 'calendar' | 'queue' | 'plus' | 'search' | 'phone' | 'message' | 'trash' | 'offer' | 'booking' | 'skip' | 'close' | 'history') {
  const paths: Record<string, ReactNode> = {
    calendar: <><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></>,
    queue: <><path d="M4 6h16M4 12h12M4 18h8"/><circle cx="20" cy="18" r="2"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92z"/>,
    message: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>,
    trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6"/><path d="M10 11v6M14 11v6"/></>,
    offer: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M9 15h6"/></>,
    booking: <><path d="M20 6 9 17l-5-5"/><circle cx="12" cy="12" r="10"/></>,
    skip: <><path d="m5 4 10 8L5 20V4z"/><path d="M19 5v14"/></>,
    close: <path d="M18 6 6 18M6 6l12 12"/>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>,
  }
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[kind]}</svg>
}

export function AppointmentsPage() {
  const { locale } = useLocale()
  const location = useLocation()
  const navigate = useNavigate()
  const query = useMemo(() => new URLSearchParams(location.search), [location.search])
  const subtab = query.get('tab') === 'waitlist' ? 'waitlist' : 'appointments'
  const [view, setView] = useState<'ACTIVE' | 'OFFERED' | 'HISTORY'>('ACTIVE')
  const [rows, setRows] = useState<WaitlistRequest[]>([])
  const [selected, setSelected] = useState<WaitlistRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [serviceFilter, setServiceFilter] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [dateFromFilter, setDateFromFilter] = useState('')
  const [dateToFilter, setDateToFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showOffer, setShowOffer] = useState(false)
  const [requestForm, setRequestForm] = useState<RequestForm>(emptyRequestForm)
  const [offerForm, setOfferForm] = useState<OfferForm>(emptyOfferForm)
  const [clients, setClients] = useState<ClientItem[]>([])
  const [services, setServices] = useState<LookupItem[]>([])
  const [employees, setEmployees] = useState<LookupItem[]>([])
  const [spaces, setSpaces] = useState<LookupItem[]>([])
  const [saving, setSaving] = useState(false)
  const [, setTick] = useState(0)

  const copy = locale === 'sl' ? {
    title: 'Termini', appointments: 'Termini', waitlist: 'Čakalna vrsta', coming: 'Pregled terminov bo dodan v naslednji fazi.',
    active: 'Aktivno', offered: 'Ponudbe', history: 'Zgodovina', add: 'Dodaj na čakalno vrsto', search: 'Išči po imenu, e-pošti ali telefonu',
    allServices: 'Vse storitve', allEmployees: 'Vsi zaposleni', allTypes: 'Vse vrste', allSources: 'Vsi viri', from: 'Od', to: 'Do',
    client: 'Stranka', service: 'Storitev', wanted: 'Želeni termin', employee: 'Zaposleni', status: 'Status', joined: 'Pridružil/a se', source: 'Vir',
    noRows: 'Ni zahtev, ki ustrezajo izbranim filtrom.', details: 'Podrobnosti zahteve', contact: 'Kontakt', request: 'Zahteva', actions: 'Akcije',
    offer: 'Ponudi termin', reserve: 'Rezerviraj za stranko', call: 'Pokliči', message: 'Pošlji sporočilo', skip: 'Preskoči za ta termin', remove: 'Odstrani',
    requestedWindow: 'Želeni čas', location: 'Lokacija', participants: 'Udeleženci', note: 'Opomba', audit: 'Zgodovina aktivnosti',
    offerExpires: 'Ponudba poteče čez', temporaryHold: 'Termin je začasno rezerviran za stranko do', close: 'Zapri', save: 'Shrani', cancel: 'Prekliči',
    createTitle: 'Dodaj na čakalno vrsto', offerTitle: 'Ponudi prost termin', exact: 'Točen termin', flexible: 'Prilagodljiv termin',
    group: 'Skupinski termin', course: 'Termin tečaja', any: 'Katerikoli zaposleni', specific: 'Določen zaposleni',
    dateFrom: 'Datum od', dateTo: 'Datum do', timeFrom: 'Čas od', timeTo: 'Čas do', validity: 'Veljavnost ponudbe (min)', room: 'Prostor',
    start: 'Začetek termina', end: 'Konec termina', select: 'Izberi', loadError: 'Čakalne vrste ni bilo mogoče naložiti.',
  } : {
    title: 'Appointments', appointments: 'Appointments', waitlist: 'Waitlist', coming: 'Appointments overview will be added in the next phase.',
    active: 'Active', offered: 'Offers', history: 'History', add: 'Add to waitlist', search: 'Search by name, email or phone',
    allServices: 'All services', allEmployees: 'All employees', allTypes: 'All types', allSources: 'All sources', from: 'From', to: 'To',
    client: 'Client', service: 'Service', wanted: 'Preferred time', employee: 'Employee', status: 'Status', joined: 'Joined', source: 'Source',
    noRows: 'No requests match the selected filters.', details: 'Request details', contact: 'Contact', request: 'Request', actions: 'Actions',
    offer: 'Offer slot', reserve: 'Book for client', call: 'Call', message: 'Send message', skip: 'Skip for this slot', remove: 'Remove',
    requestedWindow: 'Preferred time', location: 'Location', participants: 'Participants', note: 'Note', audit: 'Activity history',
    offerExpires: 'Offer expires in', temporaryHold: 'The slot is temporarily held for the client until', close: 'Close', save: 'Save', cancel: 'Cancel',
    createTitle: 'Add to waitlist', offerTitle: 'Offer available slot', exact: 'Exact time', flexible: 'Flexible window', group: 'Group session',
    course: 'Course occurrence', any: 'Any employee', specific: 'Specific employee', dateFrom: 'Date from', dateTo: 'Date to',
    timeFrom: 'Time from', timeTo: 'Time to', validity: 'Offer validity (min)', room: 'Room', start: 'Slot start', end: 'Slot end', select: 'Select',
    loadError: 'Could not load the waitlist.',
  }

  const loadRows = useCallback(async (preferredId?: number | null) => {
    if (subtab !== 'waitlist') return
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/waitlists', { params: {
        view, search: search || undefined, serviceId: serviceFilter || undefined, employeeId: employeeFilter || undefined,
        targetType: typeFilter || undefined, source: sourceFilter || undefined, dateFrom: dateFromFilter || undefined, dateTo: dateToFilter || undefined,
      } })
      const list = Array.isArray(data) ? data as WaitlistRequest[] : []
      setRows(list)
      const targetId = preferredId ?? (Number(query.get('requestId') || 0) || selected?.id)
      if (targetId) {
        const response = await api.get(`/waitlists/${targetId}`).catch(() => null)
        setSelected(response?.data ?? list.find(item => item.id === targetId) ?? null)
      } else if (selected && !list.some(item => item.id === selected.id)) {
        setSelected(null)
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.response?.data?.detail || copy.loadError)
    } finally {
      setLoading(false)
    }
  }, [subtab, view, search, serviceFilter, employeeFilter, typeFilter, sourceFilter, dateFromFilter, dateToFilter, query, selected?.id, copy.loadError])

  const loadLookups = useCallback(async () => {
    const [clientsResult, servicesResult, employeesResult, spacesResult] = await Promise.allSettled([
      api.get('/clients', { params: { size: 500 } }), api.get('/types'), api.get('/users/consultants'), api.get('/spaces'),
    ])
    if (clientsResult.status === 'fulfilled') setClients(Array.isArray(clientsResult.value.data) ? clientsResult.value.data : [])
    if (servicesResult.status === 'fulfilled') {
      const value = Array.isArray(servicesResult.value.data) ? servicesResult.value.data : []
      setServices(
        value
          .filter((item: any) => item.active !== false)
          .map((item: any) => ({ id: item.id, name: item.description || item.name || `#${item.id}` })),
      )
    }
    if (employeesResult.status === 'fulfilled') {
      const value = Array.isArray(employeesResult.value.data) ? employeesResult.value.data : []
      setEmployees(value.map((item: any) => ({ id: item.id, name: `${item.firstName || ''} ${item.lastName || ''}`.trim() || item.email || `#${item.id}` })))
    }
    if (spacesResult.status === 'fulfilled') {
      const value = Array.isArray(spacesResult.value.data) ? spacesResult.value.data : []
      setSpaces(value.map((item: any) => ({ id: item.id, name: item.name || `#${item.id}` })))
    }
  }, [])

  useEffect(() => { void loadRows() }, [loadRows])
  useEffect(() => { void loadLookups() }, [loadLookups])
  useEffect(() => {
    const timer = window.setInterval(() => setTick(value => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const serviceOptions = useMemo(() => {
    const map = new Map<number, string>(services.map(item => [item.id, item.name]))
    rows.forEach(item => map.set(item.serviceId, item.serviceName))
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [services, rows])
  const employeeOptions = useMemo(() => {
    const map = new Map<number, string>(employees.map(item => [item.id, item.name]))
    rows.forEach(item => {
      if (item.specificEmployee) map.set(item.specificEmployee.id, item.specificEmployee.name)
      item.selectedEmployees.forEach(employee => map.set(employee.id, employee.name))
    })
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [employees, rows])

  const selectRequest = async (row: WaitlistRequest) => {
    setSelected(row)
    const params = new URLSearchParams(location.search)
    params.set('tab', 'waitlist')
    params.set('requestId', String(row.id))
    navigate({ pathname: '/appointments', search: params.toString() }, { replace: true })
    const response = await api.get(`/waitlists/${row.id}`).catch(() => null)
    if (response?.data) setSelected(response.data)
  }

  const setSubtab = (next: 'appointments' | 'waitlist') => {
    const params = new URLSearchParams(location.search)
    params.set('tab', next)
    params.delete('requestId')
    navigate({ pathname: '/appointments', search: params.toString() })
    setSelected(null)
  }

  const createRequest = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      const payload = {
        clientId: Number(requestForm.clientId), serviceId: Number(requestForm.serviceId), locationId: requestForm.locationId ? Number(requestForm.locationId) : null,
        targetType: requestForm.targetType, targetSessionId: null, dateFrom: requestForm.dateFrom, dateTo: requestForm.dateTo,
        employeePreferenceType: requestForm.employeePreferenceType,
        specificEmployeeId: requestForm.specificEmployeeId ? Number(requestForm.specificEmployeeId) : null,
        employeeIds: [], requestedParticipants: Number(requestForm.requestedParticipants || 1), source: 'STAFF', notes: requestForm.notes || null,
        windows: [{ dayOfWeek: null, date: null, timeFrom: requestForm.timeFrom, timeTo: requestForm.timeTo, allDay: false }],
      }
      const { data } = await api.post('/waitlists', payload)
      setShowCreate(false)
      setRequestForm(emptyRequestForm())
      setView('ACTIVE')
      await loadRows(data?.id)
    } catch (e: any) {
      window.alert(e?.response?.data?.message || e?.response?.data?.detail || 'Napaka pri shranjevanju.')
    } finally {
      setSaving(false)
    }
  }

  const openOffer = () => {
    if (!selected) return
    const defaultDate = selected.dateFrom
    const start = `${defaultDate}T09:00`
    const duration = selected.serviceDurationMinutes || 60
    const endDate = new Date(`${start}:00`)
    endDate.setMinutes(endDate.getMinutes() + duration)
    const end = `${defaultDate}T${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`
    setOfferForm({ slotStart: start, slotEnd: end, employeeId: selected.specificEmployee?.id ? String(selected.specificEmployee.id) : '', roomId: selected.locationId ? String(selected.locationId) : '', validityMinutes: '15' })
    setShowOffer(true)
  }

  const sendOffer = async (event: FormEvent) => {
    event.preventDefault()
    if (!selected) return
    setSaving(true)
    try {
      const { data } = await api.post(`/waitlists/${selected.id}/offer`, {
        slotStart: offerForm.slotStart, slotEnd: offerForm.slotEnd, employeeId: offerForm.employeeId ? Number(offerForm.employeeId) : null,
        roomId: offerForm.roomId ? Number(offerForm.roomId) : null, sessionId: selected.targetSessionId || null, validityMinutes: Number(offerForm.validityMinutes || 15),
      })
      setSelected(data)
      setShowOffer(false)
      setView('OFFERED')
      await loadRows(data?.id)
    } catch (e: any) {
      window.alert(e?.response?.data?.message || e?.response?.data?.detail || 'Ponudbe ni bilo mogoče poslati.')
    } finally { setSaving(false) }
  }

  const removeSelected = async () => {
    if (!selected || !window.confirm(locale === 'sl' ? 'Ali želite zahtevo odstraniti s čakalne vrste?' : 'Remove this request from the waitlist?')) return
    await api.delete(`/waitlists/${selected.id}`)
    setSelected(null)
    await loadRows()
  }

  const skipSelected = async () => {
    if (!selected) return
    const slotStart = window.prompt(locale === 'sl' ? 'Začetek termina (YYYY-MM-DDTHH:mm)' : 'Slot start (YYYY-MM-DDTHH:mm)', offerForm.slotStart || `${selected.dateFrom}T09:00`)
    if (!slotStart) return
    const slotEnd = window.prompt(locale === 'sl' ? 'Konec termina (YYYY-MM-DDTHH:mm)' : 'Slot end (YYYY-MM-DDTHH:mm)', offerForm.slotEnd || `${selected.dateFrom}T10:00`)
    if (!slotEnd) return
    await api.post(`/waitlists/${selected.id}/skip`, { slotStart, slotEnd, employeeId: selected.specificEmployee?.id || null, roomId: selected.locationId || null })
    await selectRequest(selected)
  }

  return <div className="appointments-page">
    <header className="appointments-page-header">
      <div>
        <h1>{copy.title}</h1>
        <div className="appointments-subtabs" role="tablist">
          <button type="button" className={subtab === 'appointments' ? 'active' : ''} onClick={() => setSubtab('appointments')}>{icon('calendar')}{copy.appointments}</button>
          <button type="button" className={subtab === 'waitlist' ? 'active' : ''} onClick={() => setSubtab('waitlist')}>{icon('queue')}{copy.waitlist}</button>
        </div>
      </div>
      {subtab === 'waitlist' && <button type="button" className="appointments-primary" onClick={() => setShowCreate(true)}>{icon('plus')}{copy.add}</button>}
    </header>

    {subtab === 'appointments' ? <section className="appointments-coming">
      <div className="appointments-coming-icon">{icon('calendar')}</div><h2>{copy.appointments}</h2><p>{copy.coming}</p>
    </section> : <>
      <div className="waitlist-view-tabs">
        {(['ACTIVE', 'OFFERED', 'HISTORY'] as const).map(item => <button key={item} type="button" className={view === item ? 'active' : ''} onClick={() => { setView(item); setSelected(null) }}>
          {item === 'ACTIVE' ? copy.active : item === 'OFFERED' ? copy.offered : copy.history}
        </button>)}
      </div>
      <section className="waitlist-filters">
        <label className="waitlist-search">{icon('search')}<input value={search} onChange={event => setSearch(event.target.value)} placeholder={copy.search}/></label>
        <select value={serviceFilter} onChange={event => setServiceFilter(event.target.value)}><option value="">{copy.allServices}</option>{serviceOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select value={employeeFilter} onChange={event => setEmployeeFilter(event.target.value)}><option value="">{copy.allEmployees}</option>{employeeOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)}><option value="">{copy.allTypes}</option><option value="EXACT_TIME">{copy.exact}</option><option value="FLEXIBLE_WINDOW">{copy.flexible}</option><option value="GROUP_SESSION">{copy.group}</option><option value="COURSE_OCCURRENCE">{copy.course}</option></select>
        <select value={sourceFilter} onChange={event => setSourceFilter(event.target.value)}><option value="">{copy.allSources}</option><option value="WIDGET">{sourceLabel('WIDGET', locale)}</option><option value="GUEST_APP">{sourceLabel('GUEST_APP', locale)}</option><option value="STAFF">{sourceLabel('STAFF', locale)}</option><option value="PHONE">{sourceLabel('PHONE', locale)}</option></select>
        <label className="waitlist-date"><span>{copy.from}</span><input type="date" value={dateFromFilter} onChange={event => setDateFromFilter(event.target.value)}/></label>
        <label className="waitlist-date"><span>{copy.to}</span><input type="date" value={dateToFilter} onChange={event => setDateToFilter(event.target.value)}/></label>
      </section>

      {error && <div className="waitlist-error">{error}</div>}
      <div className={`waitlist-layout${selected ? ' has-detail' : ''}`}>
        <section className="waitlist-table-card">
          <div className="waitlist-table-wrap">
            <table>
              <thead><tr><th>{copy.client}</th><th>{copy.service}</th><th>{copy.wanted}</th><th>{copy.employee}</th><th>{copy.status}</th><th>{copy.joined}</th><th>{copy.source}</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={7} className="waitlist-empty">…</td></tr> : rows.length === 0 ? <tr><td colSpan={7} className="waitlist-empty">{copy.noRows}</td></tr> : rows.map(row => <tr key={row.id} className={selected?.id === row.id ? 'selected' : ''} onClick={() => void selectRequest(row)}>
                  <td><div className="waitlist-client"><span className="waitlist-avatar">{row.clientName.split(/\s+/).slice(0,2).map(value => value[0]).join('').toUpperCase()}</span><div><strong>{row.clientName}</strong><small>{row.clientPhone || row.clientEmail || '—'}</small></div></div></td>
                  <td><strong>{row.serviceName}</strong><small>{row.serviceDurationMinutes ? `${row.serviceDurationMinutes} min` : '—'}{row.breakMinutes ? ` + ${row.breakMinutes} min pavza` : ''}</small></td>
                  <td><strong>{formatDate(row.dateFrom)} – {formatDate(row.dateTo)}</strong><small>{targetTypeLabel(row.targetType, locale)}{row.windows[0] && !row.windows[0].allDay ? ` · ${row.windows[0].timeFrom?.slice(0,5) || ''}–${row.windows[0].timeTo?.slice(0,5) || ''}` : ''}</small></td>
                  <td>{row.specificEmployee?.name || (row.selectedEmployees.length ? row.selectedEmployees.map(item => item.name).join(', ') : copy.any)}</td>
                  <td><span className={`waitlist-status status-${row.status.toLowerCase()}`}>{statusLabel(row.status, locale)}</span>{row.currentOffer && <small className="waitlist-countdown">{remainingLabel(Math.max(0, Math.floor((new Date(row.currentOffer.expiresAt).getTime() - Date.now()) / 1000)))}</small>}</td>
                  <td>{formatDateTime(row.joinedAt)}</td><td>{sourceLabel(row.source, locale)}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </section>

        {selected && <aside className="waitlist-detail">
          <div className="waitlist-detail-head"><div className="waitlist-client"><span className="waitlist-avatar large">{selected.clientName.split(/\s+/).slice(0,2).map(value => value[0]).join('').toUpperCase()}</span><div><h2>{selected.clientName}</h2><span className={`waitlist-status status-${selected.status.toLowerCase()}`}>{statusLabel(selected.status, locale)}</span></div></div><button type="button" className="icon-button" onClick={() => setSelected(null)} aria-label={copy.close}>{icon('close')}</button></div>
          {selected.currentOffer && <div className="waitlist-hold"><strong>{copy.offerExpires}: {remainingLabel(Math.max(0, Math.floor((new Date(selected.currentOffer.expiresAt).getTime() - Date.now()) / 1000)))}</strong><span>{copy.temporaryHold} {formatDateTime(selected.currentOffer.expiresAt)}.</span></div>}
          <section><h3>{copy.contact}</h3><div className="waitlist-detail-grid"><span>E-pošta</span><strong>{selected.clientEmail || '—'}</strong><span>Telefon</span><strong>{selected.clientPhone || '—'}</strong></div></section>
          <section><h3>{copy.request}</h3><div className="waitlist-detail-grid"><span>{copy.service}</span><strong>{selected.serviceName} · {selected.serviceDurationMinutes || '—'} min</strong><span>{copy.requestedWindow}</span><strong>{formatDate(selected.dateFrom)} – {formatDate(selected.dateTo)}<br/>{selected.windows.map(item => item.allDay ? 'Cel dan' : `${item.timeFrom?.slice(0,5) || ''}–${item.timeTo?.slice(0,5) || ''}`).join(', ') || '—'}</strong><span>{copy.employee}</span><strong>{selected.specificEmployee?.name || (selected.selectedEmployees.length ? selected.selectedEmployees.map(item => item.name).join(', ') : copy.any)}</strong><span>{copy.location}</span><strong>{selected.locationName || '—'}</strong><span>{copy.participants}</span><strong>{selected.requestedParticipants}</strong><span>{copy.source}</span><strong>{sourceLabel(selected.source, locale)}</strong></div>{selected.notes && <div className="waitlist-note"><span>{copy.note}</span><p>{selected.notes}</p></div>}</section>
          <section><h3>{copy.actions}</h3><div className="waitlist-actions">
            {selected.status === 'ACTIVE' && <button type="button" className="primary" onClick={openOffer}>{icon('offer')}{copy.offer}</button>}
            <button type="button" onClick={() => navigate(`/calendar?waitlistRequestId=${selected.id}&clientId=${selected.clientId || ''}&typeId=${selected.serviceId}&date=${selected.dateFrom}`)}>{icon('booking')}{copy.reserve}</button>
            {selected.clientPhone && <a href={`tel:${selected.clientPhone}`}>{icon('phone')}{copy.call}</a>}
            <button type="button" onClick={() => navigate(`/inbox?clientId=${selected.clientId || ''}`)}>{icon('message')}{copy.message}</button>
            {selected.status === 'ACTIVE' && <button type="button" onClick={() => void skipSelected()}>{icon('skip')}{copy.skip}</button>}
            <button type="button" className="danger" onClick={() => void removeSelected()}>{icon('trash')}{copy.remove}</button>
          </div></section>
          <section><h3>{icon('history')}{copy.audit}</h3><div className="waitlist-timeline">{selected.history.length === 0 ? <p>—</p> : selected.history.map(event => <article key={event.id}><span className="timeline-dot"/><div><strong>{event.type.split('_').join(' ')}</strong><p>{event.detail || '—'}</p><small>{formatDateTime(event.occurredAt)}{event.actorName ? ` · ${event.actorName}` : ''}</small></div></article>)}</div></section>
        </aside>}
      </div>
    </>}

    {showCreate && <div className="waitlist-modal-backdrop" onMouseDown={() => setShowCreate(false)}><form className="waitlist-modal" onSubmit={createRequest} onMouseDown={event => event.stopPropagation()}><header><h2>{copy.createTitle}</h2><button type="button" className="icon-button" onClick={() => setShowCreate(false)}>{icon('close')}</button></header><div className="waitlist-form-grid">
      <label><span>{copy.client}</span><select required value={requestForm.clientId} onChange={event => setRequestForm(value => ({ ...value, clientId: event.target.value }))}><option value="">{copy.select}</option>{clients.map(client => <option key={client.id} value={client.id}>{`${client.firstName || ''} ${client.lastName || ''}`.trim()} {client.email ? `· ${client.email}` : ''}</option>)}</select></label>
      <label><span>{copy.service}</span><select required value={requestForm.serviceId} onChange={event => setRequestForm(value => ({ ...value, serviceId: event.target.value }))}><option value="">{copy.select}</option>{serviceOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label><span>Vrsta zahteve</span><select value={requestForm.targetType} onChange={event => setRequestForm(value => ({ ...value, targetType: event.target.value }))}><option value="EXACT_TIME">{copy.exact}</option><option value="FLEXIBLE_WINDOW">{copy.flexible}</option><option value="GROUP_SESSION">{copy.group}</option><option value="COURSE_OCCURRENCE">{copy.course}</option></select></label>
      <label><span>{copy.employee}</span><select value={requestForm.employeePreferenceType} onChange={event => setRequestForm(value => ({ ...value, employeePreferenceType: event.target.value, specificEmployeeId: event.target.value === 'SPECIFIC' ? value.specificEmployeeId : '' }))}><option value="ANY">{copy.any}</option><option value="SPECIFIC">{copy.specific}</option></select></label>
      {requestForm.employeePreferenceType === 'SPECIFIC' && <label><span>{copy.employee}</span><select required value={requestForm.specificEmployeeId} onChange={event => setRequestForm(value => ({ ...value, specificEmployeeId: event.target.value }))}><option value="">{copy.select}</option>{employeeOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      <label><span>{copy.location}</span><select value={requestForm.locationId} onChange={event => setRequestForm(value => ({ ...value, locationId: event.target.value }))}><option value="">—</option>{spaces.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label><span>{copy.dateFrom}</span><input required type="date" value={requestForm.dateFrom} onChange={event => setRequestForm(value => ({ ...value, dateFrom: event.target.value, dateTo: value.dateTo || event.target.value }))}/></label>
      <label><span>{copy.dateTo}</span><input required type="date" value={requestForm.dateTo} onChange={event => setRequestForm(value => ({ ...value, dateTo: event.target.value }))}/></label>
      <label><span>{copy.timeFrom}</span><input required type="time" value={requestForm.timeFrom} onChange={event => setRequestForm(value => ({ ...value, timeFrom: event.target.value }))}/></label>
      <label><span>{copy.timeTo}</span><input required type="time" value={requestForm.timeTo} onChange={event => setRequestForm(value => ({ ...value, timeTo: event.target.value }))}/></label>
      <label><span>{copy.participants}</span><input min="1" type="number" value={requestForm.requestedParticipants} onChange={event => setRequestForm(value => ({ ...value, requestedParticipants: event.target.value }))}/></label>
      <label className="wide"><span>{copy.note}</span><textarea rows={3} value={requestForm.notes} onChange={event => setRequestForm(value => ({ ...value, notes: event.target.value }))}/></label>
    </div><footer><button type="button" onClick={() => setShowCreate(false)}>{copy.cancel}</button><button type="submit" className="primary" disabled={saving}>{saving ? '…' : copy.save}</button></footer></form></div>}

    {showOffer && selected && <div className="waitlist-modal-backdrop" onMouseDown={() => setShowOffer(false)}><form className="waitlist-modal compact" onSubmit={sendOffer} onMouseDown={event => event.stopPropagation()}><header><div><h2>{copy.offerTitle}</h2><p>{selected.clientName} · {selected.serviceName}</p></div><button type="button" className="icon-button" onClick={() => setShowOffer(false)}>{icon('close')}</button></header><div className="waitlist-form-grid">
      <label><span>{copy.start}</span><input required type="datetime-local" value={offerForm.slotStart} onChange={event => setOfferForm(value => ({ ...value, slotStart: event.target.value }))}/></label>
      <label><span>{copy.end}</span><input required type="datetime-local" value={offerForm.slotEnd} onChange={event => setOfferForm(value => ({ ...value, slotEnd: event.target.value }))}/></label>
      <label><span>{copy.employee}</span><select value={offerForm.employeeId} onChange={event => setOfferForm(value => ({ ...value, employeeId: event.target.value }))}><option value="">—</option>{employeeOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label><span>{copy.room}</span><select value={offerForm.roomId} onChange={event => setOfferForm(value => ({ ...value, roomId: event.target.value }))}><option value="">—</option>{spaces.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label><span>{copy.validity}</span><input required min="5" max="1440" type="number" value={offerForm.validityMinutes} onChange={event => setOfferForm(value => ({ ...value, validityMinutes: event.target.value }))}/></label>
    </div><div className="waitlist-modal-info">{copy.temporaryHold} <strong>{offerForm.validityMinutes} min</strong>. V tem času termin ni na voljo drugim rezervacijam.</div><footer><button type="button" onClick={() => setShowOffer(false)}>{copy.cancel}</button><button type="submit" className="primary" disabled={saving}>{saving ? '…' : copy.offer}</button></footer></form></div>}

    <style>{`
      .appointments-page{padding:28px 30px 70px;min-height:100%;background:#f7f9fc;color:#14213a}.appointments-page-header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:22px}.appointments-page-header h1{margin:0 0 17px;font-size:28px;color:#13213a}.appointments-subtabs{display:flex;gap:28px;border-bottom:1px solid #dfe5ee}.appointments-subtabs button{display:flex;align-items:center;gap:8px;padding:0 2px 13px;border:0;background:transparent;color:#69758b;font-weight:700;cursor:pointer;position:relative}.appointments-subtabs button.active{color:#1463df}.appointments-subtabs button.active:after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:3px;border-radius:3px;background:#1463df}.appointments-primary,.waitlist-actions .primary,.waitlist-modal .primary{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:10px;background:#1463df;color:#fff;padding:11px 16px;font-weight:750;cursor:pointer;box-shadow:0 6px 18px rgba(20,99,223,.18)}.appointments-coming{max-width:700px;margin:90px auto;text-align:center;background:#fff;border:1px solid #e1e7f0;border-radius:18px;padding:52px}.appointments-coming-icon{width:56px;height:56px;margin:0 auto 14px;border-radius:16px;background:#eef5ff;color:#1463df;display:grid;place-items:center}.appointments-coming h2{margin:0 0 8px}.appointments-coming p{color:#6a758a}.waitlist-view-tabs{display:flex;gap:4px;margin-bottom:14px}.waitlist-view-tabs button{border:1px solid transparent;background:transparent;padding:9px 15px;border-radius:9px;color:#667085;font-weight:700;cursor:pointer}.waitlist-view-tabs button.active{background:#eaf2ff;color:#1463df;border-color:#cfe0ff}.waitlist-filters{display:grid;grid-template-columns:minmax(240px,1.6fr) repeat(4,minmax(130px,1fr)) minmax(125px,.8fr) minmax(125px,.8fr);gap:9px;margin-bottom:14px}.waitlist-filters select,.waitlist-filters input,.waitlist-form-grid select,.waitlist-form-grid input,.waitlist-form-grid textarea{width:100%;box-sizing:border-box;border:1px solid #dce3ed;border-radius:10px;background:#fff;color:#1b2940;padding:10px 11px;font:inherit;outline:none}.waitlist-filters select:focus,.waitlist-filters input:focus,.waitlist-form-grid select:focus,.waitlist-form-grid input:focus,.waitlist-form-grid textarea:focus{border-color:#5e9af2;box-shadow:0 0 0 3px rgba(20,99,223,.1)}.waitlist-search{display:flex;align-items:center;gap:8px;border:1px solid #dce3ed;border-radius:10px;background:#fff;padding:0 11px;color:#8792a5}.waitlist-search input{border:0;padding-left:0;box-shadow:none!important}.waitlist-date{display:flex;align-items:center;background:#fff;border:1px solid #dce3ed;border-radius:10px;padding-left:9px}.waitlist-date span{font-size:11px;color:#7c8799;white-space:nowrap}.waitlist-date input{border:0;padding-left:7px}.waitlist-error{margin-bottom:12px;padding:12px 14px;border:1px solid #fecaca;background:#fff1f2;color:#b42318;border-radius:10px}.waitlist-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;align-items:start}.waitlist-layout.has-detail{grid-template-columns:minmax(0,1fr) 390px}.waitlist-table-card,.waitlist-detail{background:#fff;border:1px solid #e0e6ef;border-radius:15px;box-shadow:0 7px 22px rgba(24,39,75,.045)}.waitlist-table-wrap{overflow:auto;border-radius:15px}.waitlist-table-card table{width:100%;border-collapse:collapse;min-width:1030px}.waitlist-table-card th{padding:13px 14px;text-align:left;background:#f8fafc;border-bottom:1px solid #e7ebf1;color:#68758a;font-size:11px;text-transform:uppercase;letter-spacing:.035em}.waitlist-table-card td{padding:14px;border-bottom:1px solid #edf0f5;color:#3b475a;font-size:13px;vertical-align:middle}.waitlist-table-card tr:last-child td{border-bottom:0}.waitlist-table-card tbody tr{cursor:pointer;transition:.15s}.waitlist-table-card tbody tr:hover,.waitlist-table-card tbody tr.selected{background:#f2f7ff}.waitlist-table-card td strong,.waitlist-table-card td small{display:block}.waitlist-table-card td strong{color:#19263b;font-size:13px}.waitlist-table-card td small{margin-top:3px;color:#7b8798;font-size:11px}.waitlist-client{display:flex;align-items:center;gap:10px}.waitlist-avatar{display:grid;place-items:center;flex:0 0 auto;width:34px;height:34px;border-radius:50%;background:#eee9ff;color:#6841c6;font-size:11px;font-weight:800}.waitlist-avatar.large{width:46px;height:46px;font-size:13px}.waitlist-status{display:inline-flex;align-items:center;padding:5px 8px;border-radius:999px;font-size:11px;font-weight:750;background:#eef2f6;color:#475467;white-space:nowrap}.status-active{background:#fff5d9;color:#9a6700}.status-offered{background:#eaf2ff;color:#175cd3}.status-offer_accepted,.status-booked{background:#e9f8ef;color:#087a3e}.status-expired,.status-cancelled,.status-removed,.status-declined{background:#f1f3f6;color:#596579}.waitlist-countdown{color:#175cd3!important;font-variant-numeric:tabular-nums}.waitlist-empty{text-align:center!important;color:#7b8798!important;padding:45px!important}.waitlist-detail{position:sticky;top:84px;max-height:calc(100vh - 105px);overflow:auto}.waitlist-detail-head{display:flex;justify-content:space-between;align-items:flex-start;padding:18px;border-bottom:1px solid #e9edf3}.waitlist-detail-head h2{font-size:18px;margin:0 0 6px}.icon-button{border:0;background:transparent;color:#657187;display:grid;place-items:center;padding:5px;cursor:pointer;border-radius:7px}.icon-button:hover{background:#eef2f6}.waitlist-hold{margin:14px 16px 0;padding:12px 13px;border-radius:10px;background:#edf5ff;border:1px solid #cfe1ff;color:#175cd3}.waitlist-hold strong,.waitlist-hold span{display:block}.waitlist-hold span{font-size:12px;margin-top:4px}.waitlist-detail section{padding:16px 18px;border-bottom:1px solid #edf0f4}.waitlist-detail section:last-child{border-bottom:0}.waitlist-detail h3{display:flex;align-items:center;gap:7px;margin:0 0 12px;font-size:13px;color:#26364d}.waitlist-detail-grid{display:grid;grid-template-columns:120px minmax(0,1fr);gap:9px 12px;font-size:12px}.waitlist-detail-grid span{color:#7b8798}.waitlist-detail-grid strong{font-weight:650;color:#344054}.waitlist-note{margin-top:12px;background:#f7f9fc;border-radius:9px;padding:10px 11px}.waitlist-note span{font-size:11px;color:#7b8798}.waitlist-note p{margin:5px 0 0;font-size:12px}.waitlist-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.waitlist-actions button,.waitlist-actions a{display:flex;align-items:center;justify-content:center;gap:7px;min-height:38px;border:1px solid #d8e0eb;border-radius:9px;background:#fff;color:#344054;text-decoration:none;font-size:12px;font-weight:700;cursor:pointer}.waitlist-actions .primary{border-color:#1463df;color:#fff}.waitlist-actions .danger{color:#d92d20;border-color:#f7c5c1}.waitlist-timeline article{display:grid;grid-template-columns:12px 1fr;gap:8px;position:relative;padding-bottom:14px}.waitlist-timeline article:not(:last-child):before{content:"";position:absolute;left:4px;top:11px;bottom:0;width:1px;background:#dce3ec}.timeline-dot{width:9px;height:9px;border-radius:50%;background:#1463df;margin-top:3px;z-index:1}.waitlist-timeline strong{font-size:11px;text-transform:capitalize}.waitlist-timeline p{font-size:11px;margin:3px 0;color:#667085}.waitlist-timeline small{font-size:10px;color:#98a2b3}.waitlist-modal-backdrop{position:fixed;inset:0;z-index:5000;background:rgba(18,30,52,.55);display:grid;place-items:center;padding:18px}.waitlist-modal{width:min(760px,calc(100vw - 32px));max-height:calc(100vh - 36px);overflow:auto;background:#fff;border-radius:16px;box-shadow:0 26px 70px rgba(10,20,40,.28)}.waitlist-modal.compact{width:min(650px,calc(100vw - 32px))}.waitlist-modal header{display:flex;align-items:flex-start;justify-content:space-between;padding:18px 20px;border-bottom:1px solid #e8edf3}.waitlist-modal h2{margin:0;font-size:20px}.waitlist-modal header p{margin:4px 0 0;color:#7b8798;font-size:12px}.waitlist-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:20px}.waitlist-form-grid label{display:grid;gap:6px}.waitlist-form-grid label span{font-size:12px;font-weight:700;color:#475467}.waitlist-form-grid .wide{grid-column:1/-1}.waitlist-modal-info{margin:0 20px 18px;padding:11px 12px;border-radius:9px;background:#f0f6ff;color:#365b8f;font-size:12px}.waitlist-modal footer{display:flex;justify-content:flex-end;gap:9px;padding:15px 20px;border-top:1px solid #e8edf3}.waitlist-modal footer button{border:1px solid #d8e0eb;border-radius:9px;background:#fff;color:#344054;padding:9px 15px;font-weight:700;cursor:pointer}.waitlist-modal footer .primary{color:#fff;border-color:#1463df}.waitlist-modal button:disabled{opacity:.6;cursor:wait}@media(max-width:1250px){.waitlist-filters{grid-template-columns:repeat(4,minmax(0,1fr))}.waitlist-search{grid-column:span 2}.waitlist-layout.has-detail{grid-template-columns:minmax(0,1fr) 350px}}@media(max-width:900px){.appointments-page{padding:20px 14px 70px}.appointments-page-header{align-items:stretch;flex-direction:column}.appointments-primary{align-self:flex-start}.waitlist-filters{grid-template-columns:1fr 1fr}.waitlist-search{grid-column:1/-1}.waitlist-layout.has-detail{grid-template-columns:1fr}.waitlist-detail{position:static;max-height:none}.waitlist-form-grid{grid-template-columns:1fr}.waitlist-form-grid .wide{grid-column:auto}}@media(max-width:540px){.waitlist-filters{grid-template-columns:1fr}.waitlist-search{grid-column:auto}.waitlist-actions{grid-template-columns:1fr}.appointments-subtabs{gap:17px}}
    `}</style>
  </div>
}
