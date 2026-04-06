import { useEffect, useState } from 'react'
import { api } from '../api'
import { getStoredUser } from '../auth'

export function CrudPage({ title, endpoint, adminOnly = false }: { title: string; endpoint: string; adminOnly?: boolean }) {
  const user = getStoredUser()!
  const [rows, setRows] = useState<any[]>([])
  const [query, setQuery] = useState('')
  const [json, setJson] = useState('{}')

  const load = async () => {
    if (adminOnly && user.role !== 'ADMIN') return
    const { data } = await api.get(endpoint)
    setRows(data)
  }
  useEffect(() => { load() }, [endpoint])

  if (adminOnly && user.role !== 'ADMIN') return <div className="card">Not allowed.</div>

  const filtered = rows.filter((r) => JSON.stringify(r).toLowerCase().includes(query.toLowerCase()))

  const save = async () => {
    await api.post(endpoint, JSON.parse(json))
    setJson('{}')
    load()
  }

  return (
    <div>
      <div className="page-header"><h1>{title}</h1></div>
      <div className="grid-two">
        <div className="card">
          <input placeholder="Search/filter" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="table-wrap">
            <table>
              <thead><tr><th>ID</th><th>Data</th></tr></thead>
              <tbody>
                {filtered.map((r) => <tr key={r.id}><td>{r.id}</td><td><pre>{JSON.stringify(r, null, 2)}</pre></td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h3>Create item</h3>
          <p>For speed, this MVP uses JSON input. Replace with dedicated forms per entity.</p>
          <textarea rows={20} value={json} onChange={(e)=>setJson(e.target.value)} />
          <button onClick={save}>Save</button>
        </div>
      </div>
    </div>
  )
}
