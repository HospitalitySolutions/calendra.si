import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { getStoredUser } from '../auth'
import type { BookableSlot, DayOfWeek, User } from '../lib/types'
import { Card, EmptyState, Field, PageHeader } from '../components/ui'
import { dayOptions } from '../lib/types'
import { formatDate, formatTime, fullName } from '../lib/format'

type SlotForm = {
  dayOfWeek: DayOfWeek
  startTime: string
  endTime: string
  consultantId?: number
  indefinite: boolean
  startDate: string
  endDate: string
}

export function BookableSessionsPage() {
  const me = getStoredUser()!
  const [slots, setSlots] = useState<BookableSlot[]>([])
  const [consultants, setConsultants] = useState<User[]>([])
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [editingId, setEditingId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const sessionLength = Number(settings.SESSION_LENGTH_MINUTES || 60)
  const calcEnd = (start: string) => {
    const [h, m] = start.split(':').map(Number)
    const total = h * 60 + m + sessionLength
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  }
  const [form, setForm] = useState<SlotForm>({ dayOfWeek: 'MONDAY', startTime: '09:00', endTime: calcEnd('09:00'), indefinite: true, startDate: '', endDate: '' })

  const load = async () => {
    const [slotsRes, consultantsRes, settingsRes] = await Promise.all([api.get('/bookable-slots'), me.role === 'ADMIN' ? api.get('/users') : Promise.resolve({ data: [] }), api.get('/settings')])
    setSlots(slotsRes.data)
    setConsultants(consultantsRes.data)
    setSettings(settingsRes.data)
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => slots.filter((slot) => [slot.dayOfWeek, fullName(slot.consultant), slot.startTime, slot.endTime].join(' ').toLowerCase().includes(query.toLowerCase())), [slots, query])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (me.role === 'ADMIN' && !form.consultantId) {
      setError('Please select consultant.')
      return
    }
    try {
      const payload = { ...form, consultantId: me.role === 'ADMIN' ? form.consultantId : me.id, startDate: form.indefinite ? null : form.startDate, endDate: form.indefinite ? null : form.endDate }
      if (editingId) await api.put(`/bookable-slots/${editingId}`, payload)
      else await api.post('/bookable-slots', payload)
      setEditingId(null)
      setForm({ dayOfWeek: 'MONDAY', startTime: '09:00', endTime: calcEnd('09:00'), indefinite: true, startDate: '', endDate: '' })
      load()
    } catch (err: any) {
      if (err?.response?.status !== 409) {
        const msg = err?.response?.data?.message || err?.message || 'Failed to save bookable session.'
        setError(String(msg))
      }
    }
  }

  const edit = (slot: BookableSlot) => {
    setEditingId(slot.id)
    setForm({ dayOfWeek: slot.dayOfWeek, startTime: slot.startTime, endTime: slot.endTime, consultantId: slot.consultant.id, indefinite: slot.indefinite, startDate: slot.startDate || '', endDate: slot.endDate || '' })
  }

  const remove = async (id: number) => {
    if (!window.confirm('Delete this bookable session?')) return
    await api.delete(`/bookable-slots/${id}`)
    load()
  }

  return (
    <div className="page-grid compact-right">
      <div>
        <PageHeader title="Bookable sessions" subtitle="Set recurring availability windows for consultants with optional date ranges." />
        <Card>
          <div className="toolbar"><input placeholder="Search day, time, or consultant" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
          {filtered.length === 0 ? <EmptyState title="No bookable sessions" text="Create the first available slot using the form on the right." /> : (
            <div className="simple-table-wrap">
              <table>
                <thead><tr><th>Day</th><th>Time</th><th>Consultant</th><th>Range</th><th>Created</th><th /></tr></thead>
                <tbody>
                  {filtered.map((slot) => (
                    <tr key={slot.id}>
                      <td>{slot.dayOfWeek}</td>
                      <td>{formatTime(slot.startTime)} – {formatTime(slot.endTime)}</td>
                      <td>{fullName(slot.consultant)}</td>
                      <td>{slot.indefinite ? 'Indefinite' : `${slot.startDate} → ${slot.endDate}`}</td>
                      <td>{formatDate(slot.createdAt)}</td>
                      <td className="table-actions"><button className="linkish-btn" onClick={() => edit(slot)}>Edit</button><button className="linkish-btn danger" onClick={() => remove(slot.id)}>Delete</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      <Card>
        <PageHeader title={editingId ? 'Edit bookable session' : 'New bookable session'} subtitle={`End time defaults to the start time + ${sessionLength} minutes.`} />
        <form className="form-grid" onSubmit={submit}>
          <Field label="Day of week"><select value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value as DayOfWeek })}>{dayOptions.map((day) => <option key={day}>{day}</option>)}</select></Field>
          <Field label="Start time"><input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value, endTime: calcEnd(e.target.value) })} /></Field>
          <Field label="End time"><input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></Field>
          {me.role === 'ADMIN' && <Field label="Consultant"><select value={form.consultantId ?? ''} onChange={(e) => { setForm({ ...form, consultantId: Number(e.target.value) || undefined }); setError(null) }}><option value="">Select consultant</option>{consultants.filter((c) => c.consultant).map((consultant) => <option key={consultant.id} value={consultant.id}>{fullName(consultant)}</option>)}</select></Field>}
          <label className="toggle-row full-span"><input type="checkbox" checked={form.indefinite} onChange={(e) => setForm({ ...form, indefinite: e.target.checked })} /><span>Indefinite availability</span></label>
          {!form.indefinite && <><Field label="Start date"><input required type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field><Field label="End date"><input required type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field></>}
          {error && <div className="error full-span">{error}</div>}
          <div className="form-actions full-span"><button type="submit">{editingId ? 'Save changes' : 'Create bookable session'}</button></div>
        </form>
      </Card>
    </div>
  )
}
