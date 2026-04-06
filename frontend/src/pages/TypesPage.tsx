import { useEffect, useState } from 'react'
import { api } from '../api'
import { getStoredUser } from '../auth'
import type { SessionType } from '../lib/types'
import { Card, EmptyState, Field, PageHeader } from '../components/ui'
import { formatDate } from '../lib/format'

export function TypesPage() {
  const me = getStoredUser()!
  const [types, setTypes] = useState<SessionType[]>([])
  const [editing, setEditing] = useState<SessionType | null>(null)
  const [form, setForm] = useState({ name: '', description: '', durationMinutes: 60, breakMinutes: 0 })
  const load = () => api.get('/types').then((r) => setTypes(r.data))
  useEffect(() => { load() }, [])

  if (me.role !== 'ADMIN') return <Card>Only admins can manage session types.</Card>

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (editing) await api.put(`/types/${editing.id}`, form)
    else await api.post('/types', form)
    setEditing(null)
    setForm({ name: '', description: '', durationMinutes: 60, breakMinutes: 0 })
    load()
  }

  const remove = async (id: number) => {
    if (!window.confirm('Delete this type?')) return
    await api.delete(`/types/${id}`)
    load()
  }

  return (
    <div className="page-grid compact-right">
      <div>
        <PageHeader title="Types" subtitle="Control the list of session types available for bookings and consultants." />
        <Card>
          {types.length === 0 ? <EmptyState title="No session types" text="Create your first type using the form on the right." /> : (
            <div className="simple-table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Description</th><th>Duration</th><th>Break</th><th>Created</th><th /></tr></thead>
                <tbody>
                  {types.map((type) => (
                    <tr key={type.id}>
                      <td>{type.name}</td>
                      <td>{type.description || '—'}</td>
                      <td>{type.durationMinutes ?? 60} min</td>
                      <td>{type.breakMinutes ?? 0} min</td>
                      <td>{formatDate(type.createdAt)}</td>
                      <td className="table-actions"><button className="linkish-btn" onClick={() => { setEditing(type); setForm({ name: type.name, description: type.description || '', durationMinutes: type.durationMinutes ?? 60, breakMinutes: type.breakMinutes ?? 0 }) }}>Edit</button><button className="linkish-btn danger" onClick={() => remove(type.id)}>Delete</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      <Card>
        <PageHeader title={editing ? 'Edit type' : 'New type'} />
        <form className="form-grid" onSubmit={submit}>
          <Field label="Type name"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Description"><textarea rows={6} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Duration (minutes)" hint="Booked session block length shown on the calendar.">
            <input type="number" min="0" step="5" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })} />
          </Field>
          <Field label="Break (minutes)" hint="Adds unavailable hatch time right after the session without extending the visible session block.">
            <input type="number" min="0" step="5" value={form.breakMinutes} onChange={(e) => setForm({ ...form, breakMinutes: Number(e.target.value) })} />
          </Field>
          <div className="form-actions full-span"><button type="submit">{editing ? 'Save changes' : 'Create type'}</button></div>
        </form>
      </Card>
    </div>
  )
}
