import { useEffect, useState } from 'react'
import { api } from '../api'
import { Card, Field, PageHeader } from '../components/ui'

export function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({})

  useEffect(() => {
    api.get('/settings').then((r) => setSettings(r.data))
  }, [])

  const save = async () => {
    const { data } = await api.put('/settings', settings)
    setSettings(data)
    window.dispatchEvent(new Event('settings-updated'))
  }

  return (
    <Card className="settings-card">
      <PageHeader title="Settings" subtitle="Control optional modules and the default session duration used across the app." />
      <div className="form-grid">
        <label className="toggle-card">
          <div>
            <strong>Spaces</strong>
            <p>Enable the spaces tab and space selection during bookings.</p>
          </div>
          <input type="checkbox" checked={settings.SPACES_ENABLED === 'true'} onChange={(e) => setSettings({ ...settings, SPACES_ENABLED: String(e.target.checked) })} />
        </label>
        <label className="toggle-card">
          <div>
            <strong>Types</strong>
            <p>Enable the types tab and type selection during bookings.</p>
          </div>
          <input type="checkbox" checked={settings.TYPES_ENABLED === 'true'} onChange={(e) => setSettings({ ...settings, TYPES_ENABLED: String(e.target.checked) })} />
        </label>
        <label className="toggle-card">
          <div>
            <strong>Bookable</strong>
            <p>Enable consultant availability (bookable sessions) and related calendar checks.</p>
          </div>
          <input type="checkbox" checked={settings.BOOKABLE_ENABLED === 'true'} onChange={(e) => setSettings({ ...settings, BOOKABLE_ENABLED: String(e.target.checked) })} />
        </label>
        <Field label="Session length (minutes)" hint="Used as the default end time suggestion for bookable and booked sessions.">
          <input type="number" min="15" step="15" value={settings.SESSION_LENGTH_MINUTES || '60'} onChange={(e) => setSettings({ ...settings, SESSION_LENGTH_MINUTES: e.target.value })} />
        </Field>
        <Field label="Invoice counter" hint="The next invoice number to use. Supports alphanumeric values (e.g. 1, INV-0007).">
          <input value={settings.INVOICE_COUNTER || '1'} onChange={(e) => setSettings({ ...settings, INVOICE_COUNTER: e.target.value })} />
        </Field>

        <Field label="Payment deadline (days)" hint="Due date is issue date + this number of days.">
          <input type="number" min="0" step="1" value={settings.PAYMENT_DEADLINE_DAYS || '15'} onChange={(e) => setSettings({ ...settings, PAYMENT_DEADLINE_DAYS: e.target.value })} />
        </Field>

        <div className="full-span" style={{ marginTop: 8 }}>
          <strong>Company</strong>
          <p className="muted">Used on invoice PDFs. Only one company profile is stored.</p>
        </div>

        <Field label="Company name">
          <input value={settings.COMPANY_NAME || ''} onChange={(e) => setSettings({ ...settings, COMPANY_NAME: e.target.value })} />
        </Field>
        <Field label="Address">
          <input value={settings.COMPANY_ADDRESS || ''} onChange={(e) => setSettings({ ...settings, COMPANY_ADDRESS: e.target.value })} />
        </Field>
        <Field label="Postal code">
          <input value={settings.COMPANY_POSTAL_CODE || ''} onChange={(e) => setSettings({ ...settings, COMPANY_POSTAL_CODE: e.target.value })} />
        </Field>
        <Field label="City">
          <input value={settings.COMPANY_CITY || ''} onChange={(e) => setSettings({ ...settings, COMPANY_CITY: e.target.value })} />
        </Field>
        <Field label="VAT ID">
          <input value={settings.COMPANY_VAT_ID || ''} onChange={(e) => setSettings({ ...settings, COMPANY_VAT_ID: e.target.value })} />
        </Field>
        <Field label="IBAN">
          <input value={settings.COMPANY_IBAN || ''} onChange={(e) => setSettings({ ...settings, COMPANY_IBAN: e.target.value })} />
        </Field>
        <Field label="Email (optional)">
          <input value={settings.COMPANY_EMAIL || ''} onChange={(e) => setSettings({ ...settings, COMPANY_EMAIL: e.target.value })} />
        </Field>
        <Field label="Telephone (optional)">
          <input value={settings.COMPANY_TELEPHONE || ''} onChange={(e) => setSettings({ ...settings, COMPANY_TELEPHONE: e.target.value })} />
        </Field>

        <div className="form-actions full-span"><button onClick={save}>Save settings</button></div>
      </div>
    </Card>
  )
}
