import { useEffect, useState } from 'react'
import { api } from '../api'
import { getStoredUser } from '../auth'
import type { Space } from '../lib/types'
import { Card, EmptyState, Field, PageHeader } from '../components/ui'
import { formatDate } from '../lib/format'

export function SpacesPage() {
  const me = getStoredUser()!
  const [spaces, setSpaces] = useState<Space[]>([])
  const [editing, setEditing] = useState<Space | null>(null)
  const [form, setForm] = useState({ name: '', description: '' })

  const load = () => api.get('/spaces').then((r) => setSpaces(r.data))
  useEffect(() => { load() }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (editing) await api.put(`/spaces/${editing.id}`, form)
    else await api.post('/spaces', form)
    setEditing(null)
    setForm({ name: '', description: '' })
    load()
  }

  const remove = async (id: number) => {
    if (!window.confirm('Delete this space?')) return
    await api.delete(`/spaces/${id}`)
    load()
  }

  if (me.role !== 'ADMIN') return <Card>Only admins can manage spaces.</Card>

  return (
    <div className="page-grid compact-right">
      <div>
        <PageHeader title="Spaces" subtitle="Manage locations where a single session can be booked at a time." />
        <Card>
          {spaces.length === 0 ? <EmptyState title="No spaces" text="Create your first space using the form on the right." /> : (
            <div className="simple-table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Description</th><th>Joined</th><th /></tr></thead>
                <tbody>
                  {spaces.map((space) => (
                    <tr key={space.id}>
                      <td>{space.name}</td>
                      <td>{space.description || '—'}</td>
                      <td>{formatDate(space.createdAt)}</td>
                      <td className="table-actions"><button className="linkish-btn" onClick={() => { setEditing(space); setForm({ name: space.name, description: space.description || '' }) }}>Edit</button><button className="linkish-btn danger" onClick={() => remove(space.id)}>Delete</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      <Card>
        <PageHeader title={editing ? 'Edit space' : 'New space'} />
        <form className="form-grid" onSubmit={submit}>
          <Field label="Space name"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Description"><textarea rows={6} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <div className="form-actions full-span"><button type="submit">{editing ? 'Save changes' : 'Create space'}</button></div>
        </form>
      </Card>
    </div>
  )
}
