import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { getStoredUser } from '../auth'
import type { Booking, Client, SessionType, Space, User } from '../lib/types'
import { Card, EmptyState, Field, PageHeader } from '../components/ui'
import { formatDateTime, fullName } from '../lib/format'

export function BookedSessionsPage() {
  const me = getStoredUser()!
  const [rows, setRows] = useState<Booking[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [consultants, setConsultants] = useState<User[]>([])
  const [spaces, setSpaces] = useState<Space[]>([])
  const [types, setTypes] = useState<SessionType[]>([])
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [filters, setFilters] = useState({ q: '', dateFrom: '', dateTo: '', clientId: '', consultantId: '', spaceId: '', typeId: '' })

  const load = async () => {
    const [bookingsRes, clientsRes, consultantsRes, spacesRes, typesRes, settingsRes] = await Promise.all([
      api.get('/bookings'), api.get('/clients'), me.role === 'ADMIN' ? api.get('/users') : Promise.resolve({ data: [] }), api.get('/spaces'), api.get('/types'), api.get('/settings'),
    ])
    setRows(bookingsRes.data)
    setClients(clientsRes.data)
    setConsultants(consultantsRes.data)
    setSpaces(spacesRes.data)
    setTypes(typesRes.data)
    setSettings(settingsRes.data)
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => rows.filter((booking) => {
    const q = filters.q.toLowerCase()
    const searchText = [fullName(booking.client), fullName(booking.consultant), booking.notes, booking.meetingLink, booking.space?.name, booking.type?.name].filter(Boolean).join(' ').toLowerCase()
    const inText = !q || searchText.includes(q)
    const startDate = booking.startTime.slice(0, 10)
    const inDateFrom = !filters.dateFrom || startDate >= filters.dateFrom
    const inDateTo = !filters.dateTo || startDate <= filters.dateTo
    const inClient = !filters.clientId || String(booking.client.id) === filters.clientId
    const inConsultant = !filters.consultantId || String(booking.consultant.id) === filters.consultantId
    const inSpace = !filters.spaceId || String(booking.space?.id) === filters.spaceId
    const inType = !filters.typeId || String(booking.type?.id) === filters.typeId
    return inText && inDateFrom && inDateTo && inClient && inConsultant && inSpace && inType
  }), [rows, filters])

  return (
    <div>
      <PageHeader title="Booked sessions" subtitle="Filter upcoming or past sessions by date, client, consultant, space, and type." />
      <Card>
        <div className="filter-grid">
          <Field label="Search"><input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Client, consultant, notes..." /></Field>
          <Field label="From"><input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} placeholder="dd/mm/yyyy" /></Field>
          <Field label="To"><input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} placeholder="dd/mm/yyyy" /></Field>
          <Field label="Client"><select value={filters.clientId} onChange={(e) => setFilters({ ...filters, clientId: e.target.value })}><option value="">All</option>{clients.map((client) => <option key={client.id} value={client.id}>{fullName(client)}</option>)}</select></Field>
          {me.role === 'ADMIN' && <Field label="Consultant"><select value={filters.consultantId} onChange={(e) => setFilters({ ...filters, consultantId: e.target.value })}><option value="">All</option>{consultants.map((consultant) => <option key={consultant.id} value={consultant.id}>{fullName(consultant)}</option>)}</select></Field>}
          {settings.SPACES_ENABLED !== 'false' && <Field label="Space"><select value={filters.spaceId} onChange={(e) => setFilters({ ...filters, spaceId: e.target.value })}><option value="">All</option>{spaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}</select></Field>}
          {settings.TYPES_ENABLED !== 'false' && <Field label="Type"><select value={filters.typeId} onChange={(e) => setFilters({ ...filters, typeId: e.target.value })}><option value="">All</option>{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></Field>}
        </div>
      </Card>
      <Card>
        {filtered.length === 0 ? <EmptyState title="No sessions" text="No booked sessions matched the active filters." /> : (
          <div className="simple-table-wrap">
            <table>
              <thead><tr><th>Client</th><th>Consultant</th><th>Start</th><th>End</th><th>Space</th><th>Type</th><th>Meeting link</th><th>Notes</th></tr></thead>
              <tbody>
                {filtered.map((booking) => (
                  <tr key={booking.id}>
                    <td>{fullName(booking.client)}</td>
                    <td>{fullName(booking.consultant)}</td>
                    <td>{formatDateTime(booking.startTime)}</td>
                    <td>{formatDateTime(booking.endTime)}</td>
                    <td>{booking.space?.name || '—'}</td>
                    <td>{booking.type?.name || '—'}</td>
                    <td>{booking.meetingLink ? <a href={booking.meetingLink} target="_blank" rel="noopener noreferrer" className="linkish">{(booking.meetingProvider === 'google' || (booking.meetingLink || '').includes('meet.google.com')) ? 'Open Google Meet' : 'Open Zoom'}</a> : '—'}</td>
                    <td>{(booking.meetingLink ? (booking.notes || '').replace(/\n?Zoom meeting:\s*https?:\/\/[^\s\n]+/gi, '').trim() : booking.notes) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
