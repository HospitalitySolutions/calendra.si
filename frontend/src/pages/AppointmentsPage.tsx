import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useLocale } from '../locale'

type Employee = { id: number; name: string }
type WindowView = { id: number; dayOfWeek?: string | null; date?: string | null; timeFrom?: string | null; timeTo?: string | null; allDay: boolean }
type OfferView = {
  id: number
  status: string
  serviceId: number
  serviceName: string
  serviceGroupId?: number | null
  serviceGroupName?: string | null
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
  serviceId?: number | null
  serviceName?: string | null
  serviceScope: 'EXACT_SERVICE' | 'SERVICE_GROUP'
  serviceGroupId?: number | null
  serviceGroupName?: string | null
  eligibleServices: Array<{ id?: number | null; name: string; durationMinutes?: number | null; breakMinutes?: number | null; serviceGroupId?: number | null; serviceGroupName?: string | null }>
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

type LookupItem = { id: number; name: string; durationMinutes?: number | null; serviceGroupId?: number | null; serviceGroupName?: string | null }
type ServiceGroupItem = { id: number; name: string; active: boolean; serviceCount: number }
type ClientItem = { id: number; firstName?: string; lastName?: string; email?: string; phone?: string }

type RequestForm = {
  clientId: string
  serviceScope: 'EXACT_SERVICE' | 'SERVICE_GROUP'
  serviceId: string
  serviceGroupId: string
  locationId: string
  anyAvailableSlot: boolean
  dateFrom: string
  dateTo: string
  specificEmployeeId: string
  requestedParticipants: string
  timeFrom: string
  timeTo: string
  notes: string
}

type OfferForm = {
  serviceId: string
  slotStart: string
  slotEnd: string
  employeeId: string
  roomId: string
  validityMinutes: string
}

const emptyRequestForm = (): RequestForm => ({
  clientId: '', serviceScope: 'EXACT_SERVICE', serviceId: '', serviceGroupId: '', locationId: '', anyAvailableSlot: false, dateFrom: '', dateTo: '',
  specificEmployeeId: '', requestedParticipants: '1', timeFrom: '08:00', timeTo: '18:00', notes: '',
})

const emptyOfferForm = (): OfferForm => ({ serviceId: '', slotStart: '', slotEnd: '', employeeId: '', roomId: '', validityMinutes: '15' })

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

const requestServiceLabel = (request: WaitlistRequest) => request.serviceScope === 'SERVICE_GROUP'
  ? request.serviceGroupName || request.eligibleServices?.[0]?.serviceGroupName || '—'
  : request.serviceName || '—'

const requestServiceDetails = (request: WaitlistRequest) => request.serviceScope === 'SERVICE_GROUP'
  ? request.eligibleServices?.map(item => item.name).join(', ') || '—'
  : `${request.serviceDurationMinutes || '—'} min${request.breakMinutes ? ` + ${request.breakMinutes} min` : ''}`

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
  const sl: Record<string, string> = {
    EXACT_TIME: 'Točen termin', FLEXIBLE_WINDOW: 'Izbrano časovno okno', ANY_AVAILABLE: 'Katerikoli termin',
    GROUP_SESSION: 'Skupinski termin', COURSE_OCCURRENCE: 'Termin tečaja',
  }
  const en: Record<string, string> = {
    EXACT_TIME: 'Exact time', FLEXIBLE_WINDOW: 'Selected time window', ANY_AVAILABLE: 'Any available slot',
    GROUP_SESSION: 'Group session', COURSE_OCCURRENCE: 'Course occurrence',
  }
  return (locale === 'sl' ? sl : en)[type] ?? type
}

function sourceLabel(source: string, locale: string) {
  const sl: Record<string, string> = { WIDGET: 'Spletni vtičnik', GUEST_APP: 'Aplikacija za goste', STAFF: 'Osebje', PHONE: 'Telefon', OTHER: 'Drugo' }
  const en: Record<string, string> = { WIDGET: 'Website widget', GUEST_APP: 'Guest app', STAFF: 'Staff', PHONE: 'Phone', OTHER: 'Other' }
  return (locale === 'sl' ? sl : en)[source] ?? source
}

function icon(kind: 'calendar' | 'queue' | 'plus' | 'search' | 'phone' | 'message' | 'trash' | 'offer' | 'booking' | 'skip' | 'close' | 'history' | 'mail' | 'pin' | 'user' | 'info' | 'refresh' | 'external' | 'save') {
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
    mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    info: <><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></>,
    refresh: <><path d="M20 7h-5V2"/><path d="M20 7a9 9 0 1 0 2 6"/></>,
    external: <><path d="M15 3h6v6M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></>,
    save: <><path d="M5 3h12l4 4v14H3V3h2Z"/><path d="M7 3v6h10V3M8 21v-7h8v7"/></>,
  }
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[kind]}</svg>
}

function eventLabel(type: string, locale: string) {
  const sl: Record<string, string> = {
    JOINED: 'Dodano na čakalno vrsto', UPDATED: 'Zahteva posodobljena', OFFER_SENT: 'Ponudba poslana',
    OFFER_ACCEPTED: 'Ponudba sprejeta', OFFER_DECLINED: 'Ponudba zavrnjena', OFFER_EXPIRED: 'Ponudba potekla',
    OFFER_REVOKED: 'Ponudba preklicana', CONVERTED_TO_BOOKING: 'Rezervacija ustvarjena', CANCELLED_BY_STAFF: 'Zahteva preklicana',
    REMOVED_BY_STAFF: 'Odstranjeno s čakalne vrste', SKIPPED_FOR_SLOT: 'Preskočeno za termin', MATCH_REJECTED: 'Termin ni ustrezal',
  }
  const en: Record<string, string> = {
    JOINED: 'Added to waitlist', UPDATED: 'Request updated', OFFER_SENT: 'Offer sent',
    OFFER_ACCEPTED: 'Offer accepted', OFFER_DECLINED: 'Offer declined', OFFER_EXPIRED: 'Offer expired',
    OFFER_REVOKED: 'Offer revoked', CONVERTED_TO_BOOKING: 'Booking created', CANCELLED_BY_STAFF: 'Request cancelled',
    REMOVED_BY_STAFF: 'Removed from waitlist', SKIPPED_FOR_SLOT: 'Skipped for slot', MATCH_REJECTED: 'Slot did not match',
  }
  return (locale === 'sl' ? sl : en)[type] ?? type.split('_').join(' ').toLowerCase()
}

export function AppointmentsPage() {
  const { locale } = useLocale()
  const location = useLocation()
  const navigate = useNavigate()
  const query = useMemo(() => new URLSearchParams(location.search), [location.search])
  const queryRequestId = Number(query.get('requestId') || 0) || null
  const [view, setView] = useState<'ACTIVE' | 'OFFERED' | 'HISTORY'>('ACTIVE')
  const [rows, setRows] = useState<WaitlistRequest[]>([])
  const [selected, setSelected] = useState<WaitlistRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [serviceFilter, setServiceFilter] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [dateFromFilter, setDateFromFilter] = useState('')
  const [dateToFilter, setDateToFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showOffer, setShowOffer] = useState(false)
  const [requestForm, setRequestForm] = useState<RequestForm>(emptyRequestForm)
  const [offerForm, setOfferForm] = useState<OfferForm>(emptyOfferForm)
  const [clients, setClients] = useState<ClientItem[]>([])
  const [services, setServices] = useState<LookupItem[]>([])
  const [serviceGroups, setServiceGroups] = useState<ServiceGroupItem[]>([])
  const [employees, setEmployees] = useState<LookupItem[]>([])
  const [spaces, setSpaces] = useState<LookupItem[]>([])
  const [saving, setSaving] = useState(false)
  const [, setTick] = useState(0)
  const modalSelectionEpoch = useRef(0)
  const skipNextRowsReload = useRef(false)
  const closingSelectedRef = useRef(false)

  const copy = locale === 'sl' ? {
    title: 'Čakalna vrsta', appointments: 'Termini', waitlist: 'Čakalna vrsta', coming: 'Pregled terminov bo dodan v naslednji fazi.',
    active: 'Aktivno', offered: 'Ponudba', history: 'Zgodovina', add: 'Dodaj na čakalno vrsto', search: 'Išči po imenu, e-pošti ali telefonu',
    allServices: 'Vse storitve', allEmployees: 'Vsi zaposleni', allTypes: 'Vse vrste', allSources: 'Vsi viri', from: 'Od', to: 'Do',
    client: 'Stranka', service: 'Storitev', wanted: 'Želeni termin', employee: 'Zaposleni', status: 'Status', joined: 'Pridružil/a se', source: 'Vir',
    noRows: 'Ni zahtev, ki ustrezajo izbranim filtrom.', details: 'Podrobnosti zahteve', contact: 'Kontakt', request: 'Zahteva', actions: 'Akcije',
    offer: 'Ponudi termin', reserve: 'Rezerviraj za stranko', call: 'Pokliči', message: 'Pošlji sporočilo', skip: 'Preskoči za ta termin', remove: 'Odstrani',
    requestedWindow: 'Želeni čas', location: 'Lokacija', participants: 'Udeleženci', note: 'Opomba', audit: 'Zgodovina aktivnosti',
    offerExpires: 'Ponudba poteče čez', temporaryHold: 'Termin je začasno rezerviran za stranko do', close: 'Zapri', save: 'Shrani', cancel: 'Prekliči',
    createTitle: 'Dodaj na čakalno vrsto', offerTitle: 'Ponudi prost termin', flexible: 'Prilagodljiv termin', exactService: 'Določena storitev', anyGroupService: 'Katerakoli storitev iz skupine', serviceGroup: 'Skupina storitev', concreteService: 'Ponujena storitev',
    flexibleHelp: 'Stranka sprejme katerikoli prost termin za izbrano storitev in zaposlenega, če je izbran.',
    anyAvailable: 'Katerikoli prost termin', anyAvailableUntil: 'Velja do', any: 'Katerikoli zaposleni', employeeOptional: 'Zaposleni (neobvezno)',
    dateFrom: 'Datum od', dateTo: 'Datum do', timeFrom: 'Čas od', timeTo: 'Čas do', timeWindowHelp: 'Čas od in čas do določata dovoljeni čas začetka termina.',
    validity: 'Veljavnost ponudbe (min)', room: 'Prostor', start: 'Začetek termina', end: 'Konec termina', select: 'Izberi', loadError: 'Čakalne vrste ni bilo mogoče naložiti.',
    customerAndRequest: 'Podatki o stranki in zahtevku', activeOffer: 'Aktivna ponudba', proposedSlot: 'Predlagani termin', offerSentAt: 'Ponudba poslana', offerExpiresAt: 'Ponudba poteče', additionalInfo: 'Dodatne informacije', fullHistory: 'Celotna zgodovina', linkedBooking: 'Povezana rezervacija', openBooking: 'Odpri rezervacijo', offerAnother: 'Ponudi drug termin', revokeOffer: 'Prekliči ponudbo', reAdd: 'Ponovno dodaj na čakalno vrsto', joinedSince: 'V čakalni vrsti od', closedRequest: 'Zaključena zahteva', noActiveOffer: 'Podatki o aktivni ponudbi niso več na voljo.',
  } : {
    title: 'Waitlist', appointments: 'Appointments', waitlist: 'Waitlist', coming: 'Appointments overview will be added in the next phase.',
    active: 'Active', offered: 'Offer', history: 'History', add: 'Add to waitlist', search: 'Search by name, email or phone',
    allServices: 'All services', allEmployees: 'All employees', allTypes: 'All types', allSources: 'All sources', from: 'From', to: 'To',
    client: 'Client', service: 'Service', wanted: 'Preferred time', employee: 'Employee', status: 'Status', joined: 'Joined', source: 'Source',
    noRows: 'No requests match the selected filters.', details: 'Request details', contact: 'Contact', request: 'Request', actions: 'Actions',
    offer: 'Offer slot', reserve: 'Book for client', call: 'Call', message: 'Send message', skip: 'Skip for this slot', remove: 'Remove',
    requestedWindow: 'Preferred time', location: 'Location', participants: 'Participants', note: 'Note', audit: 'Activity history',
    offerExpires: 'Offer expires in', temporaryHold: 'The slot is temporarily held for the client until', close: 'Close', save: 'Save', cancel: 'Cancel',
    createTitle: 'Add to waitlist', offerTitle: 'Offer available slot', flexible: 'Flexible appointment', exactService: 'Exact service', anyGroupService: 'Any service in this group', serviceGroup: 'Service group', concreteService: 'Offered service',
    flexibleHelp: 'The client accepts any available slot for the selected service and employee, when one is selected.',
    anyAvailable: 'Any available slot', anyAvailableUntil: 'Valid until', any: 'Any employee', employeeOptional: 'Employee (optional)',
    dateFrom: 'Date from', dateTo: 'Date to', timeFrom: 'Time from', timeTo: 'Time to', timeWindowHelp: 'Time from and time to define the allowed appointment start time.',
    validity: 'Offer validity (min)', room: 'Room', start: 'Slot start', end: 'Slot end', select: 'Select', loadError: 'Could not load the waitlist.',
    customerAndRequest: 'Client and request details', activeOffer: 'Active offer', proposedSlot: 'Proposed slot', offerSentAt: 'Offer sent', offerExpiresAt: 'Offer expires', additionalInfo: 'Additional information', fullHistory: 'Complete history', linkedBooking: 'Linked booking', openBooking: 'Open booking', offerAnother: 'Offer another slot', revokeOffer: 'Revoke offer', reAdd: 'Add to waitlist again', joinedSince: 'On waitlist since', closedRequest: 'Closed request', noActiveOffer: 'Active offer details are no longer available.',
  }

  const loadRows = useCallback(async (
    preferredId?: number | null,
    options: { silent?: boolean; preserveSelection?: boolean } = {},
  ) => {
    const selectionEpoch = modalSelectionEpoch.current
    const silent = options.silent === true
    const preserveSelection = options.preserveSelection === true
    if (!silent) {
      setLoading(true)
      setError('')
    }
    try {
      const { data } = await api.get('/waitlists', { params: {
        view, search: search || undefined, serviceId: serviceFilter || undefined, employeeId: employeeFilter || undefined,
        source: sourceFilter || undefined, dateFrom: dateFromFilter || undefined, dateTo: dateToFilter || undefined,
      } })
      const list = Array.isArray(data) ? data as WaitlistRequest[] : []
      setRows(list)
      if (preserveSelection) return
      const targetId = preferredId ?? queryRequestId
      if (targetId) {
        if (selectionEpoch !== modalSelectionEpoch.current) return
        const response = await api.get(`/waitlists/${targetId}`).catch(() => null)
        if (selectionEpoch === modalSelectionEpoch.current) {
          setSelected(response?.data ?? list.find(item => item.id === targetId) ?? null)
        }
      } else if (selectionEpoch === modalSelectionEpoch.current) {
        setSelected(current => current && !list.some(item => item.id === current.id) ? null : current)
      }
    } catch (e: any) {
      if (!silent) setError(e?.response?.data?.message || e?.response?.data?.detail || copy.loadError)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [view, search, serviceFilter, employeeFilter, sourceFilter, dateFromFilter, dateToFilter, queryRequestId, copy.loadError])

  const loadLookups = useCallback(async () => {
    const [clientsResult, servicesResult, groupsResult, employeesResult, spacesResult] = await Promise.allSettled([
      api.get('/clients', { params: { size: 500 } }), api.get('/types'), api.get('/service-groups'), api.get('/users/consultants'), api.get('/spaces'),
    ])
    if (clientsResult.status === 'fulfilled') setClients(Array.isArray(clientsResult.value.data) ? clientsResult.value.data : [])
    if (servicesResult.status === 'fulfilled') {
      const value = Array.isArray(servicesResult.value.data) ? servicesResult.value.data : []
      setServices(
        value
          .filter((item: any) => item.active !== false)
          .map((item: any) => ({ id: item.id, name: item.description || item.name || `#${item.id}`, durationMinutes: item.durationMinutes, serviceGroupId: item.serviceGroupId, serviceGroupName: item.serviceGroupName })),
      )
    }
    if (groupsResult.status === 'fulfilled') {
      const value = Array.isArray(groupsResult.value.data) ? groupsResult.value.data : []
      setServiceGroups(value.filter((item: any) => item.active !== false).map((item: any) => ({ id: item.id, name: item.name, active: item.active !== false, serviceCount: Number(item.serviceCount || 0) })))
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

  useEffect(() => {
    if (skipNextRowsReload.current) {
      skipNextRowsReload.current = false
      return
    }
    void loadRows()
  }, [loadRows])
  useEffect(() => { void loadLookups() }, [loadLookups])
  useEffect(() => {
    const timer = window.setInterval(() => setTick(value => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const serviceOptions = useMemo(() => {
    const map = new Map<number, LookupItem>(services.map(item => [item.id, item]))
    rows.forEach(item => {
      item.eligibleServices?.forEach(service => { if (service.id) map.set(service.id, { id: service.id, name: service.name, durationMinutes: service.durationMinutes, serviceGroupId: service.serviceGroupId, serviceGroupName: service.serviceGroupName }) })
      if (item.serviceId && item.serviceName) map.set(item.serviceId, { id: item.serviceId, name: item.serviceName, durationMinutes: item.serviceDurationMinutes, serviceGroupId: item.serviceGroupId, serviceGroupName: item.serviceGroupName })
    })
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
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
    const epoch = ++modalSelectionEpoch.current
    setSelected(row)
    const params = new URLSearchParams(location.search)
    params.delete('tab')
    params.set('requestId', String(row.id))
    navigate({ pathname: '/appointments', search: params.toString() }, { replace: true })
    const response = await api.get(`/waitlists/${row.id}`).catch(() => null)
    if (response?.data && epoch === modalSelectionEpoch.current) setSelected(response.data)
  }

  const createRequest = async (event: FormEvent) => {
    event.preventDefault()
    if (!requestForm.anyAvailableSlot) {
      if (!requestForm.dateFrom || !requestForm.dateTo || !requestForm.timeFrom || !requestForm.timeTo) {
        window.alert(locale === 'sl' ? 'Izberite datum in časovno okno.' : 'Select a date and time window.')
        return
      }
      if (requestForm.dateTo < requestForm.dateFrom) {
        window.alert(locale === 'sl' ? 'Datum do ne sme biti pred datumom od.' : 'Date to cannot be before date from.')
        return
      }
      if (requestForm.timeTo <= requestForm.timeFrom) {
        window.alert(locale === 'sl' ? 'Čas do mora biti poznejši od časa od.' : 'Time to must be later than time from.')
        return
      }
    }
    if (requestForm.serviceScope === 'EXACT_SERVICE' && !requestForm.serviceId) {
      window.alert(locale === 'sl' ? 'Izberite storitev.' : 'Select a service.')
      return
    }
    if (requestForm.serviceScope === 'SERVICE_GROUP' && !requestForm.serviceGroupId) {
      window.alert(locale === 'sl' ? 'Izberite skupino storitev.' : 'Select a service group.')
      return
    }
    setSaving(true)
    try {
      const anyAvailableSlot = requestForm.anyAvailableSlot
      const payload = {
        clientId: Number(requestForm.clientId),
        serviceScope: requestForm.serviceScope,
        serviceId: requestForm.serviceScope === 'EXACT_SERVICE' ? Number(requestForm.serviceId) : null,
        serviceGroupId: requestForm.serviceScope === 'SERVICE_GROUP' ? Number(requestForm.serviceGroupId) : null,
        locationId: requestForm.locationId ? Number(requestForm.locationId) : null,
        targetType: anyAvailableSlot ? 'ANY_AVAILABLE' : 'FLEXIBLE_WINDOW', targetSessionId: null,
        dateFrom: anyAvailableSlot ? null : requestForm.dateFrom, dateTo: anyAvailableSlot ? null : requestForm.dateTo,
        employeePreferenceType: requestForm.specificEmployeeId ? 'SPECIFIC' : 'ANY',
        specificEmployeeId: requestForm.specificEmployeeId ? Number(requestForm.specificEmployeeId) : null,
        employeeIds: [], requestedParticipants: Number(requestForm.requestedParticipants || 1), source: 'STAFF', notes: requestForm.notes || null,
        windows: anyAvailableSlot ? [] : [{ dayOfWeek: null, date: null, timeFrom: requestForm.timeFrom, timeTo: requestForm.timeTo, allDay: false }],
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

  const openOffer = (request: WaitlistRequest | null = selected) => {
    if (!request) return
    const defaultDate = request.dateFrom
    const concrete = request.serviceScope === 'SERVICE_GROUP'
      ? request.eligibleServices?.find(item => item.id)
      : request.eligibleServices?.find(item => item.id === request.serviceId) || (request.serviceId ? { id: request.serviceId, name: request.serviceName || '', durationMinutes: request.serviceDurationMinutes } : undefined)
    const serviceId = concrete?.id ? String(concrete.id) : ''
    const start = `${defaultDate}T09:00`
    const duration = concrete?.durationMinutes || request.serviceDurationMinutes || 60
    const endDate = new Date(`${start}:00`)
    endDate.setMinutes(endDate.getMinutes() + duration)
    const end = `${defaultDate}T${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`
    setOfferForm({ serviceId, slotStart: start, slotEnd: end, employeeId: request.specificEmployee?.id ? String(request.specificEmployee.id) : '', roomId: request.locationId ? String(request.locationId) : '', validityMinutes: '15' })
    setShowOffer(true)
  }

  const updateOfferService = (serviceId: string) => {
    setOfferForm(value => {
      if (!serviceId || !value.slotStart) return { ...value, serviceId }
      const option = selected?.eligibleServices?.find(item => String(item.id || '') === serviceId) || serviceOptions.find(item => String(item.id) === serviceId)
      const duration = option?.durationMinutes || 60
      const date = new Date(`${value.slotStart}:00`)
      date.setMinutes(date.getMinutes() + duration)
      const slotEnd = `${value.slotStart.slice(0, 11)}${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
      return { ...value, serviceId, slotEnd }
    })
  }

  const sendOffer = async (event: FormEvent) => {
    event.preventDefault()
    if (!selected) return
    setSaving(true)
    try {
      const { data } = await api.post(`/waitlists/${selected.id}/offer`, {
        serviceId: offerForm.serviceId ? Number(offerForm.serviceId) : null,
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
    await closeSelected()
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

  const closeSelected = async (options: { refreshRows?: boolean; suppressNextReload?: boolean } = {}) => {
    if (closingSelectedRef.current) return
    closingSelectedRef.current = true

    const refreshRows = options.refreshRows !== false
    const suppressNextReload = options.suppressNextReload !== false

    // Invalidate any in-flight detail request immediately. Keep the modal's current
    // content untouched while the table refreshes silently behind the backdrop.
    modalSelectionEpoch.current += 1
    try {
      if (refreshRows && selected) {
        await loadRows(null, { silent: true, preserveSelection: true })
      }
    } finally {
      setSelected(null)
      const params = new URLSearchParams(location.search)
      const hadRequestId = params.has('requestId')
      params.delete('requestId')
      params.delete('tab')
      if (hadRequestId) {
        skipNextRowsReload.current = suppressNextReload
        navigate({ pathname: '/appointments', search: params.toString() }, { replace: true })
      }
      closingSelectedRef.current = false
    }
  }

  const revokeSelectedOffer = async () => {
    if (!selected?.currentOffer) return
    const confirmed = window.confirm(locale === 'sl' ? 'Ali želite preklicati aktivno ponudbo?' : 'Revoke the active offer?')
    if (!confirmed) return
    try {
      await api.delete(`/waitlists/offers/${selected.currentOffer.id}`)
      setView('ACTIVE')
      await closeSelected({ refreshRows: false, suppressNextReload: false })
    } catch (e: any) {
      window.alert(e?.response?.data?.message || e?.response?.data?.detail || (locale === 'sl' ? 'Ponudbe ni bilo mogoče preklicati.' : 'Could not revoke the offer.'))
    }
  }

  const offerAnotherSelected = async () => {
    if (!selected) return
    if (!selected.currentOffer) {
      openOffer(selected)
      return
    }
    const confirmed = window.confirm(locale === 'sl'
      ? 'Aktivna ponudba bo preklicana in lahko boste poslali novo. Nadaljujem?'
      : 'The active offer will be revoked before you send a new one. Continue?')
    if (!confirmed) return
    try {
      await api.delete(`/waitlists/offers/${selected.currentOffer.id}`)
      const response = await api.get(`/waitlists/${selected.id}`)
      const refreshed = response.data as WaitlistRequest
      setSelected(refreshed)
      openOffer(refreshed)
    } catch (e: any) {
      window.alert(e?.response?.data?.message || e?.response?.data?.detail || (locale === 'sl' ? 'Nove ponudbe ni bilo mogoče pripraviti.' : 'Could not prepare a new offer.'))
    }
  }

  const reAddSelected = () => {
    if (!selected) return
    const firstWindow = selected.windows[0]
    setRequestForm({
      clientId: selected.clientId ? String(selected.clientId) : '',
      serviceScope: selected.serviceScope || 'EXACT_SERVICE',
      serviceId: selected.serviceId ? String(selected.serviceId) : '',
      serviceGroupId: selected.serviceGroupId ? String(selected.serviceGroupId) : '',
      locationId: selected.locationId ? String(selected.locationId) : '',
      anyAvailableSlot: selected.targetType === 'ANY_AVAILABLE',
      dateFrom: selected.dateFrom || '',
      dateTo: selected.dateTo || selected.dateFrom || '',
      specificEmployeeId: selected.specificEmployee?.id ? String(selected.specificEmployee.id) : '',
      requestedParticipants: String(selected.requestedParticipants || 1),
      timeFrom: firstWindow?.timeFrom?.slice(0, 5) || '08:00',
      timeTo: firstWindow?.timeTo?.slice(0, 5) || '18:00',
      notes: selected.notes || '',
    })
    void closeSelected({ refreshRows: false })
    setShowCreate(true)
  }

  const openSelectedBooking = () => {
    if (!selected) return
    const params = new URLSearchParams()
    params.set('date', selected.currentOffer?.slotStart?.slice(0, 10) || selected.dateFrom)
    if (selected.bookedBookingId) params.set('bookingId', String(selected.bookedBookingId))
    navigate({ pathname: '/calendar', search: params.toString() })
  }

  const selectedEmployeeName = !selected
    ? copy.any
    : selected.specificEmployee?.name
      || (selected.selectedEmployees.length ? selected.selectedEmployees.map(item => item.name).join(', ') : copy.any)
  const selectedWantedTime = !selected
    ? '—'
    : selected.targetType === 'ANY_AVAILABLE'
      ? `${copy.anyAvailable} · ${copy.anyAvailableUntil} ${formatDate(selected.dateTo)}`
      : `${formatDate(selected.dateFrom)} – ${formatDate(selected.dateTo)}${selected.windows.length ? ` · ${selected.windows.map(item => item.allDay ? (locale === 'sl' ? 'Cel dan' : 'All day') : `${item.timeFrom?.slice(0, 5) || ''}–${item.timeTo?.slice(0, 5) || ''}`).join(', ')}` : ''}`
  const selectedHistory = selected ? [...selected.history].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()) : []

  return <div className="appointments-page">
    <header className="appointments-page-header">
      <h1>{copy.title}</h1>
      <button type="button" className="appointments-primary" onClick={() => setShowCreate(true)}>{icon('plus')}{copy.add}</button>
    </header>

      <div className="waitlist-view-tabs" role="tablist" aria-label={locale === 'sl' ? 'Pogledi čakalne vrste' : 'Waitlist views'}>
        {(['ACTIVE', 'OFFERED', 'HISTORY'] as const).map(item => <button key={item} type="button" role="tab" aria-selected={view === item} className={view === item ? 'active' : ''} onClick={() => { setView(item); void closeSelected({ refreshRows: false, suppressNextReload: false }) }}>
          {item === 'ACTIVE' ? icon('queue') : item === 'OFFERED' ? icon('offer') : icon('history')}
          <span>{item === 'ACTIVE' ? copy.active : item === 'OFFERED' ? copy.offered : copy.history}</span>
        </button>)}
      </div>
      <section className="waitlist-filters">
        <label className="waitlist-search">{icon('search')}<input value={search} onChange={event => setSearch(event.target.value)} placeholder={copy.search}/></label>
        <select value={serviceFilter} onChange={event => setServiceFilter(event.target.value)}><option value="">{copy.allServices}</option>{serviceOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select value={employeeFilter} onChange={event => setEmployeeFilter(event.target.value)}><option value="">{copy.allEmployees}</option>{employeeOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <select value={sourceFilter} onChange={event => setSourceFilter(event.target.value)}><option value="">{copy.allSources}</option><option value="WIDGET">{sourceLabel('WIDGET', locale)}</option><option value="GUEST_APP">{sourceLabel('GUEST_APP', locale)}</option><option value="STAFF">{sourceLabel('STAFF', locale)}</option><option value="PHONE">{sourceLabel('PHONE', locale)}</option></select>
        <label className="waitlist-date"><span>{copy.from}</span><input type="date" value={dateFromFilter} onChange={event => setDateFromFilter(event.target.value)}/></label>
        <label className="waitlist-date"><span>{copy.to}</span><input type="date" value={dateToFilter} onChange={event => setDateToFilter(event.target.value)}/></label>
      </section>

      {error && <div className="waitlist-error">{error}</div>}
      <div className="waitlist-layout">
        <section className="waitlist-table-card">
          <div className="waitlist-table-wrap">
            <table>
              <thead><tr><th>{copy.client}</th><th>{copy.service}</th><th>{copy.wanted}</th><th>{copy.employee}</th><th>{copy.status}</th><th>{copy.joined}</th><th>{copy.source}</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={7} className="waitlist-empty">…</td></tr> : rows.length === 0 ? <tr><td colSpan={7} className="waitlist-empty">{copy.noRows}</td></tr> : rows.map(row => <tr key={row.id} className={selected?.id === row.id ? 'selected' : ''} onClick={() => void selectRequest(row)}>
                  <td><div className="waitlist-client"><span className="waitlist-avatar">{row.clientName.split(/\s+/).slice(0,2).map(value => value[0]).join('').toUpperCase()}</span><div><strong>{row.clientName}</strong><small>{row.clientPhone || row.clientEmail || '—'}</small></div></div></td>
                  <td><strong>{requestServiceLabel(row)}</strong><small>{row.serviceScope === 'SERVICE_GROUP' ? row.eligibleServices?.map(item => item.name).join(', ') : `${row.serviceDurationMinutes || '—'} min${row.breakMinutes ? ` + ${row.breakMinutes} min pavza` : ''}`}</small></td>
                  <td>{row.targetType === 'ANY_AVAILABLE' ? <><strong>{copy.anyAvailable}</strong><small>{copy.anyAvailableUntil} {formatDate(row.dateTo)}</small></> : <><strong>{formatDate(row.dateFrom)} – {formatDate(row.dateTo)}</strong><small>{targetTypeLabel(row.targetType, locale)}{row.windows[0] && !row.windows[0].allDay ? ` · ${row.windows[0].timeFrom?.slice(0,5) || ''}–${row.windows[0].timeTo?.slice(0,5) || ''}` : ''}</small></>}</td>
                  <td>{row.specificEmployee?.name || (row.selectedEmployees.length ? row.selectedEmployees.map(item => item.name).join(', ') : copy.any)}</td>
                  <td><span className={`waitlist-status status-${row.status.toLowerCase()}`}>{statusLabel(row.status, locale)}</span>{row.currentOffer && <small className="waitlist-countdown">{remainingLabel(Math.max(0, Math.floor((new Date(row.currentOffer.expiresAt).getTime() - Date.now()) / 1000)))}</small>}</td>
                  <td>{formatDateTime(row.joinedAt)}</td><td>{sourceLabel(row.source, locale)}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </section>


      </div>

      {selected && <div className="waitlist-detail-backdrop" onMouseDown={() => void closeSelected()}>
        <article className={`waitlist-detail-modal waitlist-detail-modal--${view.toLowerCase()}`} onMouseDown={event => event.stopPropagation()}>
          <header className="waitlist-detail-modal__header">
            <div className="waitlist-client waitlist-client--modal">
              <span className="waitlist-avatar large">{selected.clientName.split(/\s+/).slice(0,2).map(value => value[0]).join('').toUpperCase()}</span>
              <div>
                <div className="waitlist-detail-modal__title-row">
                  <h2>{selected.clientName}</h2>
                  <span className={`waitlist-status status-${selected.status.toLowerCase()}`}>{statusLabel(selected.status, locale)}</span>
                </div>
                <p>{copy.joinedSince} {formatDateTime(selected.joinedAt)}</p>
              </div>
            </div>
            <button type="button" className="icon-button waitlist-detail-modal__close" onClick={() => void closeSelected()} aria-label={copy.close}>{icon('close')}</button>
          </header>

          {view === 'ACTIVE' && <>
            <div className="waitlist-detail-modal__body waitlist-detail-modal__body--active">
              <section className="waitlist-popup-card waitlist-popup-card--contact">
                <h3>{icon('user')}{copy.contact}</h3>
                <div className="waitlist-contact-grid">
                  <div>{icon('mail')}<span>{selected.clientEmail || '—'}</span></div>
                  <div>{icon('phone')}<span>{selected.clientPhone || '—'}</span></div>
                </div>
              </section>

              <section className="waitlist-popup-card">
                <h3>{icon('calendar')}{copy.request}</h3>
                <dl className="waitlist-popup-dl">
                  <dt>{copy.service}</dt><dd>{requestServiceLabel(selected)} · {requestServiceDetails(selected)}</dd>
                  <dt>{copy.requestedWindow}</dt><dd>{selectedWantedTime}</dd>
                  <dt>{copy.employee}</dt><dd>{selectedEmployeeName}</dd>
                  <dt>{copy.location}</dt><dd>{selected.locationName || '—'}</dd>
                  <dt>{copy.participants}</dt><dd>{selected.requestedParticipants}</dd>
                  <dt>{copy.source}</dt><dd>{sourceLabel(selected.source, locale)}</dd>
                </dl>
              </section>

              {selected.notes && <section className="waitlist-popup-card waitlist-popup-card--notes">
                <h3>{icon('info')}{copy.note}</h3>
                <p>{selected.notes}</p>
              </section>}

              <section className="waitlist-popup-card">
                <h3>{icon('history')}{copy.audit}</h3>
                <div className="waitlist-popup-timeline">
                  {selectedHistory.length === 0 ? <p>—</p> : selectedHistory.map(event => <article key={event.id}>
                    <span className="timeline-dot"/>
                    <time>{formatDateTime(event.occurredAt)}</time>
                    <div><strong>{eventLabel(event.type, locale)}</strong>{event.detail && <p>{event.detail}</p>}</div>
                  </article>)}
                </div>
              </section>
            </div>
            <footer className="waitlist-detail-modal__footer">
              <button type="button" className="primary" onClick={() => openOffer()}>{icon('offer')}{copy.offer}</button>
              <button type="button" onClick={() => navigate(`/calendar?waitlistRequestId=${selected.id}&clientId=${selected.clientId || ''}&typeId=${selected.serviceId}&date=${selected.dateFrom}`)}>{icon('booking')}{copy.reserve}</button>
              <button type="button" onClick={() => navigate(`/inbox?clientId=${selected.clientId || ''}`)}>{icon('message')}{copy.message}</button>
              <button type="button" className="danger" onClick={() => void removeSelected()}>{icon('trash')}{copy.remove}</button>
            </footer>
          </>}

          {view === 'OFFERED' && <>
            <div className="waitlist-detail-modal__body waitlist-detail-modal__body--offered">
              <section className="waitlist-popup-section">
                <h3>{copy.customerAndRequest}</h3>
                <dl className="waitlist-popup-dl waitlist-popup-dl--icons">
                  <dt>{icon('mail')}{locale === 'sl' ? 'E-pošta' : 'Email'}</dt><dd>{selected.clientEmail || '—'}</dd>
                  <dt>{icon('phone')}{locale === 'sl' ? 'Telefon' : 'Phone'}</dt><dd>{selected.clientPhone || '—'}</dd>
                  <dt>{icon('history')}{copy.service}</dt><dd>{requestServiceLabel(selected)} · {requestServiceDetails(selected)}</dd>
                  <dt>{icon('calendar')}{copy.requestedWindow}</dt><dd>{selectedWantedTime}</dd>
                  <dt>{icon('user')}{copy.employee}</dt><dd>{selectedEmployeeName}</dd>
                  <dt>{icon('pin')}{copy.location}</dt><dd>{selected.locationName || '—'}</dd>
                  <dt>{icon('user')}{copy.participants}</dt><dd>{selected.requestedParticipants}</dd>
                  <dt>{icon('queue')}{copy.source}</dt><dd>{sourceLabel(selected.source, locale)}</dd>
                </dl>
                <div className="waitlist-offer-additional"><span>{copy.additionalInfo}</span><p>{selected.notes || '—'}</p></div>
              </section>

              <section className="waitlist-popup-section waitlist-popup-section--offer">
                <h3>{copy.activeOffer}</h3>
                {selected.currentOffer ? <div className="waitlist-active-offer-card">
                  <div className="waitlist-active-offer-card__heading">
                    <span className="waitlist-active-offer-card__icon">{icon('offer')}</span>
                    <div><small>{copy.proposedSlot}</small><strong>{formatDate(selected.currentOffer.slotStart)}</strong><span>{new Date(selected.currentOffer.slotStart).toLocaleTimeString(locale === 'sl' ? 'sl-SI' : 'en', { hour: '2-digit', minute: '2-digit' })} – {new Date(selected.currentOffer.slotEnd).toLocaleTimeString(locale === 'sl' ? 'sl-SI' : 'en', { hour: '2-digit', minute: '2-digit' })}</span></div>
                  </div>
                  <dl>
                    <dt>{copy.employee}</dt><dd>{selected.currentOffer.employee?.name || selectedEmployeeName}</dd>
                    <dt>{copy.offerSentAt}</dt><dd>{formatDateTime(selected.currentOffer.offeredAt)}</dd>
                    <dt>{copy.offerExpiresAt}</dt><dd>{formatDateTime(selected.currentOffer.expiresAt)} <strong className="waitlist-countdown">({remainingLabel(Math.max(0, Math.floor((new Date(selected.currentOffer.expiresAt).getTime() - Date.now()) / 1000)))})</strong></dd>
                  </dl>
                  <div className="waitlist-active-offer-card__info">{icon('info')}<span>{copy.temporaryHold} {formatDateTime(selected.currentOffer.expiresAt)}.</span></div>
                </div> : <div className="waitlist-popup-empty-offer">{copy.noActiveOffer}</div>}
              </section>
            </div>
            <footer className="waitlist-detail-modal__footer">
              <button type="button" className="primary" onClick={() => void offerAnotherSelected()}>{icon('offer')}{copy.offerAnother}</button>
              {selected.currentOffer && <button type="button" onClick={() => void revokeSelectedOffer()}>{icon('close')}{copy.revokeOffer}</button>}
              <button type="button" onClick={() => navigate(`/inbox?clientId=${selected.clientId || ''}`)}>{icon('message')}{copy.message}</button>
              <button type="button" onClick={() => void closeSelected()}>{copy.close}</button>
            </footer>
          </>}

          {view === 'HISTORY' && <>
            <div className="waitlist-detail-modal__body waitlist-detail-modal__body--history">
              <div className="waitlist-history-grid">
                <section className="waitlist-popup-card">
                  <h3>{copy.contact}</h3>
                  <div className="waitlist-contact-stack"><div>{icon('mail')}<span>{selected.clientEmail || '—'}</span></div><div>{icon('phone')}<span>{selected.clientPhone || '—'}</span></div></div>
                  <hr/>
                  <h3>{copy.closedRequest}</h3>
                  <dl className="waitlist-popup-dl">
                    <dt>{copy.service}</dt><dd>{requestServiceLabel(selected)} · {requestServiceDetails(selected)}</dd>
                    <dt>{copy.requestedWindow}</dt><dd>{selectedWantedTime}</dd>
                    <dt>{copy.employee}</dt><dd>{selectedEmployeeName}</dd>
                    <dt>{copy.location}</dt><dd>{selected.locationName || '—'}</dd>
                    <dt>{copy.participants}</dt><dd>{selected.requestedParticipants}</dd>
                    <dt>{copy.source}</dt><dd>{sourceLabel(selected.source, locale)}</dd>
                  </dl>
                </section>

                <section className="waitlist-popup-card waitlist-linked-booking-card">
                  <h3>{copy.linkedBooking}</h3>
                  {selected.bookedBookingId ? <>
                    <div className="waitlist-linked-booking-card__icon">{icon('booking')}</div>
                    <span>{locale === 'sl' ? 'Rezervacija' : 'Booking'}</span>
                    <strong>#{selected.bookedBookingId}</strong>
                    <p>{selected.currentOffer?.serviceName || requestServiceLabel(selected)}</p>
                    <button type="button" onClick={openSelectedBooking}>{copy.openBooking}{icon('external')}</button>
                  </> : <p className="waitlist-popup-muted">{statusLabel(selected.status, locale)}</p>}
                </section>
              </div>

              <section className="waitlist-popup-card waitlist-popup-card--full-history">
                <h3>{copy.fullHistory}</h3>
                <div className="waitlist-popup-timeline waitlist-popup-timeline--wide">
                  {selectedHistory.length === 0 ? <p>—</p> : selectedHistory.map(event => <article key={event.id}>
                    <span className="timeline-dot"/>
                    <div><strong>{eventLabel(event.type, locale)}</strong>{event.detail && <p>{event.detail}</p>}</div>
                    <time>{formatDateTime(event.occurredAt)}</time>
                    <small>{event.actorName || '—'}</small>
                  </article>)}
                </div>
              </section>
            </div>
            <footer className="waitlist-detail-modal__footer">
              {selected.bookedBookingId && <button type="button" className="primary" onClick={openSelectedBooking}>{icon('calendar')}{copy.openBooking}</button>}
              <button type="button" onClick={() => navigate(`/inbox?clientId=${selected.clientId || ''}`)}>{icon('message')}{copy.message}</button>
              <button type="button" onClick={reAddSelected}>{icon('plus')}{copy.reAdd}</button>
              <button type="button" className="danger" onClick={() => void removeSelected()}>{icon('trash')}{copy.remove}</button>
            </footer>
          </>}
        </article>
      </div>}

    {showCreate && <div className="waitlist-modal-backdrop" onMouseDown={() => setShowCreate(false)}><form className="waitlist-modal" onSubmit={createRequest} onMouseDown={event => event.stopPropagation()}><header><h2>{copy.createTitle}</h2><button type="button" className="icon-button" onClick={() => setShowCreate(false)}>{icon('close')}</button></header><div className="waitlist-form-grid">
      <label><span>{copy.client}</span><select required value={requestForm.clientId} onChange={event => setRequestForm(value => ({ ...value, clientId: event.target.value }))}><option value="">{copy.select}</option>{clients.map(client => <option key={client.id} value={client.id}>{`${client.firstName || ''} ${client.lastName || ''}`.trim()} {client.email ? `· ${client.email}` : ''}</option>)}</select></label>
      <div className="waitlist-service-scope wide">
        <label><input type="radio" name="waitlist-service-scope" checked={requestForm.serviceScope === 'EXACT_SERVICE'} onChange={() => setRequestForm(value => ({ ...value, serviceScope: 'EXACT_SERVICE', serviceGroupId: '' }))}/><span>{copy.exactService}</span></label>
        <label><input type="radio" name="waitlist-service-scope" checked={requestForm.serviceScope === 'SERVICE_GROUP'} onChange={() => setRequestForm(value => ({ ...value, serviceScope: 'SERVICE_GROUP', serviceId: '' }))}/><span>{copy.anyGroupService}</span></label>
      </div>
      {requestForm.serviceScope === 'EXACT_SERVICE' ?
        <label><span>{copy.service}</span><select required value={requestForm.serviceId} onChange={event => setRequestForm(value => ({ ...value, serviceId: event.target.value }))}><option value="">{copy.select}</option>{serviceOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> :
        <label><span>{copy.serviceGroup}</span><select required value={requestForm.serviceGroupId} onChange={event => setRequestForm(value => ({ ...value, serviceGroupId: event.target.value }))}><option value="">{copy.select}</option>{serviceGroups.filter(group => group.serviceCount > 0).map(group => <option key={group.id} value={group.id}>{group.name} · {group.serviceCount}</option>)}</select></label>}
      <label><span>{copy.employeeOptional}</span><select value={requestForm.specificEmployeeId} onChange={event => setRequestForm(value => ({ ...value, specificEmployeeId: event.target.value }))}><option value="">{copy.any}</option>{employeeOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label><span>{copy.location}</span><select value={requestForm.locationId} onChange={event => setRequestForm(value => ({ ...value, locationId: event.target.value }))}><option value="">—</option>{spaces.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="waitlist-flexible-option wide">
        <span><strong>{copy.flexible}</strong><small>{copy.flexibleHelp}</small></span>
        <button type="button" role="switch" aria-checked={requestForm.anyAvailableSlot} className={`waitlist-payment-switch${requestForm.anyAvailableSlot ? ' is-on' : ''}`} onClick={() => setRequestForm(value => ({ ...value, anyAvailableSlot: !value.anyAvailableSlot }))}><span>{requestForm.anyAvailableSlot ? 'ON' : 'OFF'}</span><i/></button>
      </div>
      {!requestForm.anyAvailableSlot && <>
        <label><span>{copy.dateFrom}</span><input required type="date" value={requestForm.dateFrom} onChange={event => setRequestForm(value => ({ ...value, dateFrom: event.target.value, dateTo: value.dateTo || event.target.value }))}/></label>
        <label><span>{copy.dateTo}</span><input required type="date" min={requestForm.dateFrom || undefined} value={requestForm.dateTo} onChange={event => setRequestForm(value => ({ ...value, dateTo: event.target.value }))}/></label>
        <label><span>{copy.timeFrom}</span><input required type="time" value={requestForm.timeFrom} onChange={event => setRequestForm(value => ({ ...value, timeFrom: event.target.value }))}/></label>
        <label><span>{copy.timeTo}</span><input required type="time" min={requestForm.timeFrom || undefined} value={requestForm.timeTo} onChange={event => setRequestForm(value => ({ ...value, timeTo: event.target.value }))}/></label>
        <p className="waitlist-form-hint wide">{copy.timeWindowHelp}</p>
      </>}
      <label><span>{copy.participants}</span><input min="1" type="number" value={requestForm.requestedParticipants} onChange={event => setRequestForm(value => ({ ...value, requestedParticipants: event.target.value }))}/></label>
      <label className="wide"><span>{copy.note}</span><textarea rows={3} value={requestForm.notes} onChange={event => setRequestForm(value => ({ ...value, notes: event.target.value }))}/></label>
    </div><footer><button type="submit" className="primary" disabled={saving}>{icon('save')}<span>{saving ? '…' : copy.save}</span></button></footer></form></div>}

    {showOffer && selected && <div className="waitlist-modal-backdrop" onMouseDown={() => setShowOffer(false)}><form className="waitlist-modal compact" onSubmit={sendOffer} onMouseDown={event => event.stopPropagation()}><header><div><h2>{copy.offerTitle}</h2><p>{selected.clientName} · {requestServiceLabel(selected)}</p></div><button type="button" className="icon-button" onClick={() => setShowOffer(false)}>{icon('close')}</button></header><div className="waitlist-form-grid">
      <label className="wide"><span>{copy.concreteService}</span><select required value={offerForm.serviceId} onChange={event => updateOfferService(event.target.value)}><option value="">{copy.select}</option>{selected.eligibleServices?.filter(item => item.id).map(item => <option key={item.id} value={item.id || ''}>{item.name}{item.durationMinutes ? ` · ${item.durationMinutes} min` : ''}</option>)}</select></label>
      <label><span>{copy.start}</span><input required type="datetime-local" value={offerForm.slotStart} onChange={event => setOfferForm(value => ({ ...value, slotStart: event.target.value }))}/></label>
      <label><span>{copy.end}</span><input required type="datetime-local" value={offerForm.slotEnd} onChange={event => setOfferForm(value => ({ ...value, slotEnd: event.target.value }))}/></label>
      <label><span>{copy.employee}</span><select value={offerForm.employeeId} onChange={event => setOfferForm(value => ({ ...value, employeeId: event.target.value }))}><option value="">—</option>{employeeOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label><span>{copy.room}</span><select value={offerForm.roomId} onChange={event => setOfferForm(value => ({ ...value, roomId: event.target.value }))}><option value="">—</option>{spaces.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label><span>{copy.validity}</span><input required min="5" max="1440" type="number" value={offerForm.validityMinutes} onChange={event => setOfferForm(value => ({ ...value, validityMinutes: event.target.value }))}/></label>
    </div><div className="waitlist-modal-info">{copy.temporaryHold} <strong>{offerForm.validityMinutes} min</strong>. V tem času termin ni na voljo drugim rezervacijam.</div><footer><button type="button" onClick={() => setShowOffer(false)}>{copy.cancel}</button><button type="submit" className="primary" disabled={saving}>{saving ? '…' : copy.offer}</button></footer></form></div>}

    <style>{`
      .appointments-page{padding:28px 30px 70px;min-height:100%;background:#f7f9fc;color:#14213a}.appointments-page-header{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:22px}.appointments-page-header h1{margin:0;font-size:28px;color:#13213a}.appointments-subtabs{display:flex;gap:28px;border-bottom:1px solid #dfe5ee}.appointments-subtabs button{display:flex;align-items:center;gap:8px;padding:0 2px 13px;border:0;background:transparent;color:#69758b;font-weight:700;cursor:pointer;position:relative}.appointments-subtabs button.active{color:#1463df}.appointments-subtabs button.active:after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:3px;border-radius:3px;background:#1463df}.appointments-primary,.waitlist-actions .primary,.waitlist-modal .primary{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:10px;background:#1463df;color:#fff;padding:11px 16px;font-weight:750;cursor:pointer;box-shadow:0 6px 18px rgba(20,99,223,.18)}.appointments-coming{max-width:700px;margin:90px auto;text-align:center;background:#fff;border:1px solid #e1e7f0;border-radius:18px;padding:52px}.appointments-coming-icon{width:56px;height:56px;margin:0 auto 14px;border-radius:16px;background:#eef5ff;color:#1463df;display:grid;place-items:center}.appointments-coming h2{margin:0 0 8px}.appointments-coming p{color:#6a758a}.waitlist-view-tabs{display:flex;gap:4px;margin-bottom:14px}.waitlist-view-tabs button{border:1px solid transparent;background:transparent;padding:9px 15px;border-radius:9px;color:#667085;font-weight:700;cursor:pointer}.waitlist-view-tabs button.active{background:#eaf2ff;color:#1463df;border-color:#cfe0ff}.waitlist-filters{display:grid;grid-template-columns:minmax(240px,1.6fr) repeat(3,minmax(130px,1fr)) minmax(125px,.8fr) minmax(125px,.8fr);gap:9px;margin-bottom:14px}.waitlist-filters select,.waitlist-filters input,.waitlist-form-grid select,.waitlist-form-grid input,.waitlist-form-grid textarea{width:100%;box-sizing:border-box;border:1px solid #dce3ed;border-radius:10px;background:#fff;color:#1b2940;padding:10px 11px;font:inherit;outline:none}.waitlist-filters select:focus,.waitlist-filters input:focus,.waitlist-form-grid select:focus,.waitlist-form-grid input:focus,.waitlist-form-grid textarea:focus{border-color:#5e9af2;box-shadow:0 0 0 3px rgba(20,99,223,.1)}.waitlist-search{display:flex;align-items:center;gap:8px;border:1px solid #dce3ed;border-radius:10px;background:#fff;padding:0 11px;color:#8792a5}.waitlist-search input{border:0;padding-left:0;box-shadow:none!important}.waitlist-date{display:flex;align-items:center;background:#fff;border:1px solid #dce3ed;border-radius:10px;padding-left:9px}.waitlist-date span{font-size:11px;color:#7c8799;white-space:nowrap}.waitlist-date input{border:0;padding-left:7px}.waitlist-error{margin-bottom:12px;padding:12px 14px;border:1px solid #fecaca;background:#fff1f2;color:#b42318;border-radius:10px}.waitlist-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;align-items:start}.waitlist-layout.has-detail{grid-template-columns:minmax(0,1fr) 390px}.waitlist-table-card,.waitlist-detail{background:#fff;border:1px solid #e0e6ef;border-radius:15px;box-shadow:0 7px 22px rgba(24,39,75,.045)}.waitlist-table-wrap{overflow:auto;border-radius:15px}.waitlist-table-card table{width:100%;border-collapse:collapse;min-width:1030px}.waitlist-table-card th{padding:13px 14px;text-align:left;background:#f8fafc;border-bottom:1px solid #e7ebf1;color:#68758a;font-size:11px;text-transform:uppercase;letter-spacing:.035em}.waitlist-table-card td{padding:14px;border-bottom:1px solid #edf0f5;color:#3b475a;font-size:13px;vertical-align:middle}.waitlist-table-card tr:last-child td{border-bottom:0}.waitlist-table-card tbody tr{cursor:pointer;transition:.15s}.waitlist-table-card tbody tr:hover,.waitlist-table-card tbody tr.selected{background:#f2f7ff}.waitlist-table-card td strong,.waitlist-table-card td small{display:block}.waitlist-table-card td strong{color:#19263b;font-size:13px}.waitlist-table-card td small{margin-top:3px;color:#7b8798;font-size:11px}.waitlist-client{display:flex;align-items:center;gap:10px}.waitlist-avatar{display:grid;place-items:center;flex:0 0 auto;width:34px;height:34px;border-radius:50%;background:#eee9ff;color:#6841c6;font-size:11px;font-weight:800}.waitlist-avatar.large{width:46px;height:46px;font-size:13px}.waitlist-status{display:inline-flex;align-items:center;padding:5px 8px;border-radius:999px;font-size:11px;font-weight:750;background:#eef2f6;color:#475467;white-space:nowrap}.status-active{background:#fff5d9;color:#9a6700}.status-offered{background:#eaf2ff;color:#175cd3}.status-offer_accepted,.status-booked{background:#e9f8ef;color:#087a3e}.status-expired,.status-cancelled,.status-removed,.status-declined{background:#f1f3f6;color:#596579}.waitlist-countdown{color:#175cd3!important;font-variant-numeric:tabular-nums}.waitlist-empty{text-align:center!important;color:#7b8798!important;padding:45px!important}.waitlist-detail{position:sticky;top:84px;max-height:calc(100vh - 105px);overflow:auto}.waitlist-detail-head{display:flex;justify-content:space-between;align-items:flex-start;padding:18px;border-bottom:1px solid #e9edf3}.waitlist-detail-head h2{font-size:18px;margin:0 0 6px}.icon-button{border:0;background:transparent;color:#657187;display:grid;place-items:center;padding:5px;cursor:pointer;border-radius:7px}.icon-button:hover{background:#eef2f6}.waitlist-hold{margin:14px 16px 0;padding:12px 13px;border-radius:10px;background:#edf5ff;border:1px solid #cfe1ff;color:#175cd3}.waitlist-hold strong,.waitlist-hold span{display:block}.waitlist-hold span{font-size:12px;margin-top:4px}.waitlist-detail section{padding:16px 18px;border-bottom:1px solid #edf0f4}.waitlist-detail section:last-child{border-bottom:0}.waitlist-detail h3{display:flex;align-items:center;gap:7px;margin:0 0 12px;font-size:13px;color:#26364d}.waitlist-detail-grid{display:grid;grid-template-columns:120px minmax(0,1fr);gap:9px 12px;font-size:12px}.waitlist-detail-grid span{color:#7b8798}.waitlist-detail-grid strong{font-weight:650;color:#344054}.waitlist-note{margin-top:12px;background:#f7f9fc;border-radius:9px;padding:10px 11px}.waitlist-note span{font-size:11px;color:#7b8798}.waitlist-note p{margin:5px 0 0;font-size:12px}.waitlist-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.waitlist-actions button,.waitlist-actions a{display:flex;align-items:center;justify-content:center;gap:7px;min-height:38px;border:1px solid #d8e0eb;border-radius:9px;background:#fff;color:#344054;text-decoration:none;font-size:12px;font-weight:700;cursor:pointer}.waitlist-actions .primary{border-color:#1463df;color:#fff}.waitlist-actions .danger{color:#d92d20;border-color:#f7c5c1}.waitlist-timeline article{display:grid;grid-template-columns:12px 1fr;gap:8px;position:relative;padding-bottom:14px}.waitlist-timeline article:not(:last-child):before{content:"";position:absolute;left:4px;top:11px;bottom:0;width:1px;background:#dce3ec}.timeline-dot{width:9px;height:9px;border-radius:50%;background:#1463df;margin-top:3px;z-index:1}.waitlist-timeline strong{font-size:11px;text-transform:capitalize}.waitlist-timeline p{font-size:11px;margin:3px 0;color:#667085}.waitlist-timeline small{font-size:10px;color:#98a2b3}.waitlist-modal-backdrop{position:fixed;inset:0;z-index:5000;background:rgba(18,30,52,.55);display:grid;place-items:center;padding:18px}.waitlist-modal{width:min(760px,calc(100vw - 32px));max-height:calc(100vh - 36px);overflow:auto;background:#fff;border-radius:16px;box-shadow:0 26px 70px rgba(10,20,40,.28)}.waitlist-modal.compact{width:min(650px,calc(100vw - 32px))}.waitlist-modal header{display:flex;align-items:flex-start;justify-content:space-between;padding:18px 20px;border-bottom:1px solid #e8edf3}.waitlist-modal h2{margin:0;font-size:20px}.waitlist-modal header p{margin:4px 0 0;color:#7b8798;font-size:12px}.waitlist-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:20px}.waitlist-form-grid label{display:grid;gap:6px}.waitlist-form-grid label span{font-size:12px;font-weight:700;color:#475467}.waitlist-form-grid .wide{grid-column:1/-1}.waitlist-flexible-option{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:14px 15px;border:1px solid #dce3ed;border-radius:12px;background:#f8fbff}.waitlist-flexible-option>span{display:grid;gap:4px}.waitlist-flexible-option strong{font-size:13px;color:#26364d}.waitlist-flexible-option small{font-size:12px;line-height:1.45;color:#6b778c}.waitlist-flexible-option .waitlist-payment-switch{position:relative;display:flex;align-items:center;justify-content:flex-end;flex:0 0 auto;width:78px;height:40px;padding:0 10px;border:0;border-radius:999px;background:#d7e0ed;color:#617087;cursor:pointer;transition:background .18s ease,color .18s ease,box-shadow .18s ease;box-shadow:inset 0 0 0 1px rgba(148,163,184,.18),0 3px 8px rgba(15,23,42,.08)}.waitlist-flexible-option .waitlist-payment-switch span{position:absolute;right:10px;font-size:11px;font-weight:800;letter-spacing:.02em;line-height:1;pointer-events:none}.waitlist-flexible-option .waitlist-payment-switch i{position:absolute;top:4px;left:4px;width:32px;height:32px;border-radius:50%;background:#fff;box-shadow:0 2px 7px rgba(15,23,42,.2);transition:transform .18s ease}.waitlist-flexible-option .waitlist-payment-switch.is-on{justify-content:flex-start;background:#2468e8;color:#fff;box-shadow:0 5px 12px rgba(36,104,232,.24)}.waitlist-flexible-option .waitlist-payment-switch.is-on span{left:11px;right:auto}.waitlist-flexible-option .waitlist-payment-switch.is-on i{transform:translateX(38px)}.waitlist-flexible-option .waitlist-payment-switch:focus-visible{outline:3px solid rgba(37,99,235,.2);outline-offset:2px}.waitlist-service-scope{display:flex;gap:10px;flex-wrap:wrap;padding:4px 0}.waitlist-service-scope label{display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid #dce4ef;border-radius:10px;background:#fff;color:#344054;font-weight:700;cursor:pointer}.waitlist-service-scope input{margin:0}.waitlist-form-hint{margin:-4px 0 0;color:#7b8798;font-size:11px;line-height:1.4}.waitlist-modal-info{margin:0 20px 18px;padding:11px 12px;border-radius:9px;background:#f0f6ff;color:#365b8f;font-size:12px}.waitlist-modal footer{display:flex;justify-content:flex-end;gap:9px;padding:15px 20px;border-top:1px solid #e8edf3}.waitlist-modal footer button{border:1px solid #d8e0eb;border-radius:9px;background:#fff;color:#344054;padding:9px 15px;font-weight:700;cursor:pointer}.waitlist-modal footer .primary{color:#fff;border-color:#1463df;display:inline-flex;align-items:center;justify-content:center;gap:8px}.waitlist-modal footer .primary svg{flex:0 0 auto}.waitlist-modal button:disabled{opacity:.6;cursor:wait}@media(max-width:1250px){.waitlist-filters{grid-template-columns:repeat(4,minmax(0,1fr))}.waitlist-search{grid-column:span 2}.waitlist-layout.has-detail{grid-template-columns:minmax(0,1fr) 350px}}@media(max-width:900px){.appointments-page{padding:20px 14px 70px}.appointments-page-header{align-items:stretch;flex-direction:column}.appointments-primary{align-self:flex-start}.waitlist-filters{grid-template-columns:1fr 1fr}.waitlist-search{grid-column:1/-1}.waitlist-layout.has-detail{grid-template-columns:1fr}.waitlist-detail{position:static;max-height:none}.waitlist-form-grid{grid-template-columns:1fr}.waitlist-form-grid .wide{grid-column:auto}}@media(max-width:540px){.waitlist-filters{grid-template-columns:1fr}.waitlist-search{grid-column:auto}.waitlist-actions{grid-template-columns:1fr}.appointments-subtabs{gap:17px}}

      /* Clients-style waitlist layout and centered row-detail popups */
      .appointments-page{margin:22px;border:1px solid #e3e9f2;border-radius:20px;background:#fff;box-shadow:0 9px 30px rgba(16,36,70,.055);min-height:calc(100vh - 118px)}
      .waitlist-layout{display:block}.waitlist-table-card{border:0;border-radius:0;box-shadow:none}.waitlist-table-wrap{border-radius:0}.waitlist-table-card th{background:#fff;border-bottom:1px solid #dfe6ef;padding-top:17px;padding-bottom:17px}.waitlist-table-card td{padding-top:17px;padding-bottom:17px}.waitlist-table-card tbody tr:hover,.waitlist-table-card tbody tr.selected{background:#edf4ff}.waitlist-view-tabs{display:flex;align-items:center;width:100%;border-bottom:1px solid #edf2f7;gap:10px;margin:0 0 14px;padding:0;background:transparent}.waitlist-view-tabs button{display:inline-flex;align-items:center;justify-content:center;gap:9px;border:0;background:transparent;color:#334155;padding:10px 14px;border-radius:10px;font-size:15px;font-weight:700;line-height:1.2;box-shadow:none;transition:color .18s ease,background .18s ease,box-shadow .18s ease}.waitlist-view-tabs button:hover{background:#fff;color:#0f172a;box-shadow:inset 0 0 0 1px rgba(148,163,184,.22),0 6px 16px rgba(15,23,42,.08)}.waitlist-view-tabs button.active{border:0;background:#eaf2ff;color:#1463df;box-shadow:inset 0 0 0 1px rgba(37,99,235,.16),0 3px 10px rgba(37,99,235,.18)}.waitlist-view-tabs button svg{flex:0 0 auto}.waitlist-filters{margin-top:14px}
      .waitlist-detail-backdrop{position:fixed;inset:0;z-index:4900;display:grid;place-items:center;padding:20px;background:rgba(14,28,52,.56);backdrop-filter:blur(2px)}
      .waitlist-detail-modal{width:min(780px,calc(100vw - 36px));max-height:calc(100vh - 40px);display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(223,230,240,.9);border-radius:18px;background:#fff;box-shadow:0 28px 80px rgba(8,23,49,.32);animation:waitlistModalIn .18s ease-out}
      .waitlist-detail-modal--offered{width:min(880px,calc(100vw - 36px))}.waitlist-detail-modal--history{width:min(920px,calc(100vw - 36px))}
      @keyframes waitlistModalIn{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}
      .waitlist-detail-modal__header{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:22px 28px;border-bottom:1px solid #e5eaf1}.waitlist-client--modal{align-items:center}.waitlist-detail-modal__title-row{display:flex;align-items:center;flex-wrap:wrap;gap:12px}.waitlist-detail-modal__title-row h2{margin:0;color:#17243b;font-size:21px}.waitlist-detail-modal__header p{margin:5px 0 0;color:#748197;font-size:12px}.waitlist-detail-modal__close{align-self:flex-start}.waitlist-detail-modal__body{overflow:auto;padding:20px 28px}.waitlist-detail-modal__body--active{display:grid;gap:14px}.waitlist-detail-modal__body--offered{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(300px,.85fr);gap:26px}.waitlist-detail-modal__body--history{display:grid;gap:14px}
      .waitlist-popup-card{padding:18px 20px;border:1px solid #dfe6ef;border-radius:13px;background:#fff}.waitlist-popup-card h3,.waitlist-popup-section h3{display:flex;align-items:center;gap:9px;margin:0 0 15px;color:#20304b;font-size:13px}.waitlist-popup-card hr{height:1px;margin:18px 0;border:0;background:#e7ebf1}.waitlist-popup-card--contact{padding:16px 20px}.waitlist-popup-card--notes p,.waitlist-offer-additional p{margin:0;color:#526077;font-size:12px;line-height:1.55}.waitlist-contact-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.waitlist-contact-grid>div,.waitlist-contact-stack>div{display:flex;align-items:center;gap:10px;color:#40516b;font-size:12px}.waitlist-contact-stack{display:grid;gap:13px}
      .waitlist-popup-dl{display:grid;grid-template-columns:150px minmax(0,1fr);gap:11px 18px;margin:0;font-size:12px}.waitlist-popup-dl dt{color:#758198}.waitlist-popup-dl dd{margin:0;color:#27364d;font-weight:650;line-height:1.45}.waitlist-popup-dl--icons dt{display:flex;align-items:center;gap:8px}.waitlist-popup-section{min-width:0}.waitlist-popup-section--offer{padding-left:26px;border-left:1px solid #e2e7ef}.waitlist-offer-additional{margin-top:18px;padding:13px 14px;border:1px solid #e2e8f1;border-radius:11px;background:#fafcff}.waitlist-offer-additional span{display:block;margin-bottom:7px;color:#758198;font-size:11px}
      .waitlist-active-offer-card{padding:18px;border:1px solid #d7e4f7;border-radius:14px;background:linear-gradient(180deg,#f9fbff,#f2f7ff)}.waitlist-active-offer-card__heading{display:flex;gap:14px;padding-bottom:16px;border-bottom:1px solid #dce6f4}.waitlist-active-offer-card__icon{display:grid;place-items:center;flex:0 0 48px;height:48px;border-radius:50%;background:#e5efff;color:#1463df}.waitlist-active-offer-card__heading small,.waitlist-active-offer-card__heading strong,.waitlist-active-offer-card__heading span{display:block}.waitlist-active-offer-card__heading small{color:#77849a;font-size:11px}.waitlist-active-offer-card__heading strong{margin:5px 0;color:#1463df;font-size:16px}.waitlist-active-offer-card__heading span{color:#31425d;font-size:13px}.waitlist-active-offer-card dl{display:grid;grid-template-columns:120px 1fr;gap:12px;margin:17px 0;font-size:12px}.waitlist-active-offer-card dt{color:#78859a}.waitlist-active-offer-card dd{margin:0;color:#27364d;font-weight:600}.waitlist-active-offer-card__info{display:flex;align-items:flex-start;gap:9px;padding:11px;border:1px solid #cbdcf5;border-radius:10px;background:#eaf3ff;color:#365b8f;font-size:11px;line-height:1.4}.waitlist-popup-empty-offer{padding:22px;border:1px dashed #d9e1ec;border-radius:12px;color:#758198;text-align:center;font-size:12px}
      .waitlist-popup-timeline{display:grid;gap:0}.waitlist-popup-timeline article{position:relative;display:grid;grid-template-columns:12px 145px 1fr;gap:10px;padding:0 0 13px}.waitlist-popup-timeline article:not(:last-child)::before{content:"";position:absolute;left:4px;top:10px;bottom:0;width:1px;background:#d5deea}.waitlist-popup-timeline .timeline-dot{margin-top:4px}.waitlist-popup-timeline time{color:#53627a;font-size:11px}.waitlist-popup-timeline strong{color:#34445c;font-size:11px}.waitlist-popup-timeline p{margin:3px 0 0;color:#7a8799;font-size:10px}.waitlist-popup-timeline--wide article{grid-template-columns:12px 1fr 150px 100px;align-items:start}.waitlist-popup-timeline--wide small{color:#65748a;font-size:10px;text-align:right}
      .waitlist-history-grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(260px,.8fr);gap:14px}.waitlist-linked-booking-card{position:relative}.waitlist-linked-booking-card__icon{display:grid;place-items:center;width:50px;height:50px;margin-bottom:10px;border-radius:50%;background:#e6f8ed;color:#0b9d55}.waitlist-linked-booking-card>span{display:block;color:#7a879a;font-size:11px}.waitlist-linked-booking-card>strong{display:block;margin:5px 0;color:#253650;font-size:17px}.waitlist-linked-booking-card>p{color:#53627a;font-size:12px}.waitlist-linked-booking-card>button{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:18px;padding:10px;border:1px solid #b9d0f5;border-radius:9px;background:#fff;color:#1463df;font-weight:700;cursor:pointer}.waitlist-popup-muted{color:#758198}
      .waitlist-detail-modal__footer{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:10px;padding:16px 28px;border-top:1px solid #e4e9f0;background:#fff}.waitlist-detail-modal__footer button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px;padding:9px 17px;border:1px solid #d7e0ec;border-radius:9px;background:#fff;color:#34445c;font-weight:700;cursor:pointer}.waitlist-detail-modal__footer button.primary{border-color:#1463df;background:#1463df;color:#fff;box-shadow:0 7px 17px rgba(20,99,223,.18)}.waitlist-detail-modal__footer button.danger{border-color:#f5b8b8;color:#dc2626}.waitlist-detail-modal__footer button:hover{background:#f6f9fd}.waitlist-detail-modal__footer button.primary:hover{background:#0f5ed9}
      @media(max-width:900px){.appointments-page{margin:12px;border-radius:16px}.waitlist-detail-modal__body--offered{grid-template-columns:1fr}.waitlist-popup-section--offer{padding-left:0;padding-top:20px;border-left:0;border-top:1px solid #e2e7ef}.waitlist-history-grid{grid-template-columns:1fr}.waitlist-detail-modal__footer{justify-content:stretch}.waitlist-detail-modal__footer button{flex:1 1 180px}}
      @media(max-width:620px){.waitlist-detail-backdrop{padding:0}.waitlist-detail-modal,.waitlist-detail-modal--offered,.waitlist-detail-modal--history{width:100%;height:100%;max-height:none;border:0;border-radius:0}.waitlist-detail-modal__header,.waitlist-detail-modal__body,.waitlist-detail-modal__footer{padding-left:18px;padding-right:18px}.waitlist-contact-grid{grid-template-columns:1fr}.waitlist-popup-dl{grid-template-columns:110px minmax(0,1fr)}.waitlist-popup-timeline article{grid-template-columns:12px 1fr}.waitlist-popup-timeline time{grid-column:2}.waitlist-popup-timeline--wide article{grid-template-columns:12px 1fr}.waitlist-popup-timeline--wide time,.waitlist-popup-timeline--wide small{grid-column:2;text-align:left}.waitlist-detail-modal__footer button{flex-basis:100%}}
    `}</style>
  </div>
}
