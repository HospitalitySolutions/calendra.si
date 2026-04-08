import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { TenancyDetailSidePanel } from '../components/TenancyDetailSidePanel'
import { clearAuthStoragePreservingTheme } from '../theme'

type TenancyRow = { id: number; tenantCode: string | null; name: string }
type GlobalSettings = {
  GLOBAL_FISCAL_TEST_INVOICE_URL: string
  GLOBAL_FISCAL_TEST_PREMISE_URL: string
}

export function PlatformAdminPage() {
  const [tenancies, setTenancies] = useState<TenancyRow[]>([])
  const [settings, setSettings] = useState<GlobalSettings>({
    GLOBAL_FISCAL_TEST_INVOICE_URL: '',
    GLOBAL_FISCAL_TEST_PREMISE_URL: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [selectedTenancyId, setSelectedTenancyId] = useState<number | null>(null)

  const closeTenancyPanel = useCallback(() => setSelectedTenancyId(null), [])

  const load = async () => {
    setLoading(true)
    try {
      const [tenanciesRes, settingsRes] = await Promise.all([
        api.get('/platform-admin/tenancies'),
        api.get('/platform-admin/settings'),
      ])
      setTenancies(tenanciesRes.data || [])
      setSettings({
        GLOBAL_FISCAL_TEST_INVOICE_URL: String(settingsRes.data?.GLOBAL_FISCAL_TEST_INVOICE_URL || ''),
        GLOBAL_FISCAL_TEST_PREMISE_URL: String(settingsRes.data?.GLOBAL_FISCAL_TEST_PREMISE_URL || ''),
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load().catch(() => setStatus('Failed to load admin console data.'))
  }, [])

  const save = async () => {
    setSaving(true)
    setStatus('')
    try {
      const { data } = await api.put('/platform-admin/settings', settings)
      setSettings({
        GLOBAL_FISCAL_TEST_INVOICE_URL: String(data?.GLOBAL_FISCAL_TEST_INVOICE_URL || ''),
        GLOBAL_FISCAL_TEST_PREMISE_URL: String(data?.GLOBAL_FISCAL_TEST_PREMISE_URL || ''),
      })
      setStatus('Saved.')
    } catch {
      setStatus('Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  const logout = () => {
    clearAuthStoragePreservingTheme()
    window.location.assign('/')
  }

  if (loading) return <div className="content" style={{ padding: 24 }}>Loading admin console...</div>

  return (
    <div className="content" style={{ maxWidth: 980, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Platform Admin Console</h1>
        <button type="button" className="secondary" onClick={logout}>Logout</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Global Fiscal TEST URLs</h2>
        <p className="muted">
          These values are global and are used for all tenancies/environments in TEST mode.
        </p>
        <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
          <div className="field">
            <label className="field-label">TEST URL racunov</label>
            <input
              value={settings.GLOBAL_FISCAL_TEST_INVOICE_URL}
              onChange={(e) => setSettings({ ...settings, GLOBAL_FISCAL_TEST_INVOICE_URL: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="field-label">TEST URL prijave prostora</label>
            <input
              value={settings.GLOBAL_FISCAL_TEST_PREMISE_URL}
              onChange={(e) => setSettings({ ...settings, GLOBAL_FISCAL_TEST_PREMISE_URL: e.target.value })}
            />
          </div>
          <div className="form-actions">
            <button type="button" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save global settings'}</button>
          </div>
          {status && <p className="muted">{status}</p>}
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Tenancies</h2>
        {tenancies.length === 0 ? (
          <p className="muted">No tenancies found.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Tenant code</th>
                <th>Company name</th>
              </tr>
            </thead>
            <tbody>
              {tenancies.map((t) => (
                <tr
                  key={t.id}
                  className="tenancy-row-clickable"
                  tabIndex={0}
                  role="button"
                  aria-label={`Open details for ${t.name}`}
                  onClick={() => setSelectedTenancyId(t.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelectedTenancyId(t.id)
                    }
                  }}
                >
                  <td>{t.id}</td>
                  <td>{t.tenantCode || '—'}</td>
                  <td>{t.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <TenancyDetailSidePanel tenancyId={selectedTenancyId} onClose={closeTenancyPanel} />
    </div>
  )
}
