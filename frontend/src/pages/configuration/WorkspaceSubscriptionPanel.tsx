import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { useToast } from '../../components/Toast'
import { useLocale } from '../../locale'

type Usage = {
  operatingUnits: number
  locations: number
  activeUsers: number
  consultants: number
  clients: number
  monthlyBookings: number
  smsParts: number
  emailMessages: number
  apiCalls: number
  paymentTransactions: number
  storageBytes: number
  publicBookingPages: number
}

type Limits = {
  operatingUnits: number
  locations: number
  activeUsers: number
  consultants: number
  clients: number
  monthlyBookings: number
  smsParts: number
  emailMessages: number
  storageMb: number
  publicBookingPages: number
  analyticsRetentionDays: number
  allowSmsOverage: boolean
  allowEmailOverage: boolean
  allowBookingOverage: boolean
  apiAccess: boolean
}

type UnitUsage = {
  companyId: number
  companyName: string
  locations: number
  memberships: number
  consultants: number
  clients: number
  monthlyBookings: number
  smsParts: number
  emailMessages: number
  storageBytes: number
  apiCalls: number
  paymentTransactions: number
}

type Subscription = {
  id: number
  workspaceId: number
  workspaceName: string
  planKey: string
  billingInterval: string
  status: string
  currentPeriodStart?: string | null
  currentPeriodEnd?: string | null
  trialEndsAt?: string | null
  graceUntil?: string | null
  billingOwnerCompanyId?: number | null
  billingOwnerCompanyName?: string | null
  payerLegalEntityId?: number | null
  payerLegalEntityName?: string | null
  billingContactName?: string | null
  billingEmail?: string | null
  billingAddress?: string | null
  billingPostalCode?: string | null
  billingCity?: string | null
  billingCountry?: string | null
  billingTaxId?: string | null
  purchaseOrderReference?: string | null
  limits: Limits
  usage: Usage
  units: UnitUsage[]
  features: string[]
  addons: string[]
}

type Issuer = { id: number; name: string; active: boolean }
type CreatedUnit = { unit: { id: number; name: string; tenantCode: string }; copiedFromCompanyId?: number | null; copiedItems: number }

const pct = (used: number, limit: number) => limit <= 0 ? 0 : Math.min(100, Math.round((used / limit) * 100))

export function WorkspaceSubscriptionPanel() {
  const { locale } = useLocale()
  const { showToast } = useToast()
  const sl = locale === 'sl'
  const [data, setData] = useState<Subscription | null>(null)
  const [issuers, setIssuers] = useState<Issuer[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newUnitName, setNewUnitName] = useState('')
  const [copySourceId, setCopySourceId] = useState<number | ''>('')
  const [details, setDetails] = useState({ contactName: '', email: '', address: '', postalCode: '', city: '', country: 'SI', taxId: '', purchaseOrderReference: '' })

  const load = async () => {
    setLoading(true)
    try {
      const [subscriptionRes, issuersRes] = await Promise.all([
        api.get<Subscription>('/account-management/subscription'),
        api.get<Issuer[]>('/billing/issuers').catch(() => ({ data: [] as Issuer[] })),
      ])
      const value = subscriptionRes.data
      setData(value)
      setIssuers(issuersRes.data || [])
      setDetails({
        contactName: value.billingContactName || '', email: value.billingEmail || '',
        address: value.billingAddress || '', postalCode: value.billingPostalCode || '',
        city: value.billingCity || '', country: value.billingCountry || 'SI',
        taxId: value.billingTaxId || '', purchaseOrderReference: value.purchaseOrderReference || '',
      })

    } catch (error: any) {
      showToast('error', error?.response?.data?.message || (sl ? 'Naročnine delovnega prostora ni bilo mogoče naložiti.' : 'Could not load the workspace subscription.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const canCreateUnit = !!data && data.features.includes('MULTI_UNIT') && (data.limits.operatingUnits <= 0 || data.usage.operatingUnits < data.limits.operatingUnits)
  const canCopyConfiguration = !!data && data.features.includes('CONFIGURATION_COPY')

  const usageRows = useMemo(() => data ? [
    [sl ? 'Poslovne enote' : 'Operating units', data.usage.operatingUnits, data.limits.operatingUnits],
    [sl ? 'Lokacije' : 'Locations', data.usage.locations, data.limits.locations],
    [sl ? 'Aktivni uporabniki' : 'Active users', data.usage.activeUsers, data.limits.activeUsers],
    [sl ? 'Izvajalci' : 'Consultants', data.usage.consultants, data.limits.consultants],
    [sl ? 'Stranke' : 'Clients', data.usage.clients, data.limits.clients],
    [sl ? 'Rezervacije ta mesec' : 'Bookings this month', data.usage.monthlyBookings, data.limits.monthlyBookings],
    [sl ? 'SMS deli ta mesec' : 'SMS parts this month', data.usage.smsParts, data.limits.smsParts],
    [sl ? 'E-poštna sporočila ta mesec' : 'Email messages this month', data.usage.emailMessages, data.limits.emailMessages],
    [sl ? 'API klici ta mesec' : 'API calls this month', data.usage.apiCalls, 0],
    [sl ? 'Plačilne transakcije ta mesec' : 'Payment transactions this month', data.usage.paymentTransactions, 0],
    [sl ? 'Hramba (MB)' : 'Storage (MB)', Math.ceil(data.usage.storageBytes / 1024 / 1024), data.limits.storageMb],
    [sl ? 'Javne rezervacijske strani' : 'Public booking pages', data.usage.publicBookingPages, data.limits.publicBookingPages],
  ] as Array<[string, number, number]> : [], [data, sl])

  const saveBilling = async () => {
    setSaving(true)
    try {
      const { data: updated } = await api.put<Subscription>('/account-management/subscription/billing-details', details)
      setData(updated)
      showToast('success', sl ? 'Podatki plačnika so shranjeni.' : 'Billing details saved.')
    } catch (error: any) {
      showToast('error', error?.response?.data?.message || (sl ? 'Podatkov ni bilo mogoče shraniti.' : 'Could not save billing details.'))
    } finally { setSaving(false) }
  }

  const changePayer = async (legalEntityId: string) => {
    setSaving(true)
    try {
      const { data: updated } = await api.put<Subscription>('/account-management/subscription/payer', null, { params: { legalEntityId: legalEntityId || undefined } })
      setData(updated)
      showToast('success', sl ? 'Plačnik naročnine je posodobljen.' : 'Subscription payer updated.')
    } catch (error: any) {
      showToast('error', error?.response?.data?.message || (sl ? 'Plačnika ni bilo mogoče posodobiti.' : 'Could not update payer.'))
    } finally { setSaving(false) }
  }


  const changeBillingOwner = async (companyId: string) => {
    if (!companyId) return
    setSaving(true)
    try {
      const { data: updated } = await api.post<Subscription>('/account-management/subscription/billing-owner', null, { params: { companyId } })
      setData(updated)
      showToast('success', sl ? 'Obračunska enota naročnine je posodobljena.' : 'Subscription billing owner updated.')
    } catch (error: any) {
      showToast('error', error?.response?.data?.message || (sl ? 'Obračunske enote ni bilo mogoče posodobiti.' : 'Could not update billing owner.'))
    } finally { setSaving(false) }
  }

  const createUnit = async () => {
    if (!newUnitName.trim()) return
    setSaving(true)
    try {
      const { data: created } = await api.post<CreatedUnit>('/workspace-units', {
        name: newUnitName.trim(),
        copyConfigurationFromCompanyId: copySourceId || null,
      })
      setNewUnitName('')
      await load()
      showToast('success', created.copiedFromCompanyId
        ? (sl ? `Enota ${created.unit.name} je ustvarjena in ${created.copiedItems} nastavitev je bilo kopiranih.` : `${created.unit.name} was created and ${created.copiedItems} configuration items were copied.`)
        : (sl ? `Enota ${created.unit.name} je ustvarjena.` : `${created.unit.name} was created.`))
    } catch (error: any) {
      showToast('error', error?.response?.data?.message || (sl ? 'Enote ni bilo mogoče ustvariti.' : 'Could not create operating unit.'))
    } finally { setSaving(false) }
  }

  if (loading) return <section className="account-card account-subscription-card"><p>{sl ? 'Nalagam naročnino delovnega prostora…' : 'Loading workspace subscription…'}</p></section>
  if (!data) return null

  return (
    <div className="workspace-subscription-panel">
      <section className="account-card account-subscription-card workspace-subscription-hero">
        <div className="account-plan-header">
          <div>
            <h3>{sl ? 'Naročnina delovnega prostora' : 'Workspace subscription'}</h3>
            <small>{data.workspaceName} · {data.units.length} {sl ? 'poslovnih enot' : 'operating units'}</small>
          </div>
          <span className={`account-pill ${data.status === 'ACTIVE' ? 'success' : 'trial'}`}>{data.status}</span>
        </div>
        <div className="workspace-subscription-summary">
          <strong>{data.planKey}</strong>
          <span>{data.billingInterval}</span>
          <span>{data.currentPeriodStart || '—'} → {data.currentPeriodEnd || '—'}</span>
          <span>{sl ? 'Obračunska enota' : 'Billing owner'}: {data.billingOwnerCompanyName || '—'}</span>
        </div>
        <div className="workspace-feature-chips">
          {data.features.map(feature => <span key={feature}>{feature.replaceAll('_', ' ')}</span>)}
        </div>
      </section>

      <div className="workspace-subscription-grid">
        <section className="account-card account-subscription-card">
          <div className="account-plan-header"><h3>{sl ? 'Skupna poraba' : 'Workspace usage'}</h3></div>
          <div className="account-usage-list">
            {usageRows.map(([label, used, limit]) => (
              <div className="account-usage-row" key={label}>
                <div className="workspace-usage-label"><strong>{label}</strong><span>{used} / {limit <= 0 ? '∞' : limit}</span></div>
                {limit > 0 && <div className="account-usage-bar"><span style={{ width: `${pct(used, limit)}%` }} /></div>}
              </div>
            ))}
          </div>
          <small>{sl ? `Stranke: ${data.usage.clients} · Rezervacije ta mesec: ${data.usage.monthlyBookings} · Hramba: ${(data.usage.storageBytes / 1024 / 1024).toFixed(1)} MB` : `Clients: ${data.usage.clients} · Bookings this month: ${data.usage.monthlyBookings} · Storage: ${(data.usage.storageBytes / 1024 / 1024).toFixed(1)} MB`}</small>
        </section>

        <section className="account-card account-subscription-card">
          <div className="account-plan-header"><h3>{sl ? 'Plačnik naročnine' : 'Subscription payer'}</h3></div>
          <label className="workspace-subscription-field">
            <span>{sl ? 'Obračunska poslovna enota' : 'Subscription billing owner'}</span>
            <select value={data.billingOwnerCompanyId || ''} onChange={e => void changeBillingOwner(e.target.value)} disabled={saving}>
              {data.units.map(unit => <option value={unit.companyId} key={unit.companyId}>{unit.companyName}</option>)}
            </select>
          </label>
          <label className="workspace-subscription-field">
            <span>{sl ? 'Pravna oseba plačnika' : 'Payer legal entity'}</span>
            <select value={data.payerLegalEntityId || ''} onChange={e => void changePayer(e.target.value)} disabled={saving}>
              <option value="">{sl ? 'Ni izbrano' : 'Not selected'}</option>
              {issuers.filter(i => i.active).map(i => <option value={i.id} key={i.id}>{i.name}</option>)}
            </select>
          </label>
          <div className="workspace-subscription-form-grid">
            {([
              ['contactName', sl ? 'Kontaktna oseba' : 'Contact name'], ['email', 'E-mail'],
              ['address', sl ? 'Naslov' : 'Address'], ['postalCode', sl ? 'Poštna številka' : 'Postal code'],
              ['city', sl ? 'Mesto' : 'City'], ['country', sl ? 'Država' : 'Country'],
              ['taxId', sl ? 'Davčna številka' : 'Tax ID'], ['purchaseOrderReference', sl ? 'Referenca / naročilnica' : 'Reference / PO'],
            ] as const).map(([key, label]) => <label className="workspace-subscription-field" key={key}><span>{label}</span><input value={details[key]} onChange={e => setDetails(v => ({ ...v, [key]: e.target.value }))} /></label>)}
          </div>
          <button type="button" className="account-button-secondary" onClick={saveBilling} disabled={saving}>{sl ? 'Shrani podatke plačnika' : 'Save billing details'}</button>
        </section>

        <section className="account-card account-subscription-card workspace-capacity-card">
          <div className="account-plan-header"><h3>{sl ? 'Pravila prekoračitev' : 'Overage rules'}</h3></div>
          <div className="workspace-overage-options workspace-overage-readonly">
            <span>{data.limits.allowSmsOverage ? '✓' : '—'} {sl ? 'SMS prekoračitev' : 'SMS overage'}</span>
            <span>{data.limits.allowEmailOverage ? '✓' : '—'} {sl ? 'Prekoračitev e-pošte' : 'Email overage'}</span>
            <span>{data.limits.allowBookingOverage ? '✓' : '—'} {sl ? 'Prekoračitev rezervacij' : 'Booking overage'}</span>
            <span>{data.limits.apiAccess ? '✓' : '—'} API</span>
          </div>
          <small>{sl ? 'Kapacitete določa izbrani paket in dodatki spodaj. Povečanje začne veljati po potrditvi spremembe naročnine.' : 'Capacity is determined by the selected plan and add-ons below. Increases apply after the subscription change is confirmed.'}</small>
        </section>

        <section className="account-card account-subscription-card">
          <div className="account-plan-header"><h3>{sl ? 'Dodaj poslovno enoto' : 'Add operating unit'}</h3></div>
          {canCreateUnit ? (
            <>
              <label className="workspace-subscription-field"><span>{sl ? 'Ime enote' : 'Unit name'}</span><input value={newUnitName} onChange={e => setNewUnitName(e.target.value)} placeholder={sl ? 'npr. Ljubljana Center' : 'e.g. Ljubljana Center'} /></label>
              {canCopyConfiguration && <label className="workspace-subscription-field"><span>{sl ? 'Predloga za kopiranje (neobvezno)' : 'Copy template (optional)'}</span><select value={copySourceId} onChange={e => setCopySourceId(e.target.value ? Number(e.target.value) : '')}><option value="">{sl ? 'Brez kopiranja' : 'Do not copy'}</option>{data.units.map(unit => <option key={unit.companyId} value={unit.companyId}>{unit.companyName}</option>)}</select></label>}
              <button type="button" className="account-button-secondary" onClick={createUnit} disabled={saving || !newUnitName.trim()}>{sl ? 'Ustvari enoto' : 'Create unit'}</button>
            </>
          ) : (
            <p>{data.features.includes('MULTI_UNIT')
              ? (sl ? 'Doseženo je največje število poslovnih enot. Za novo enoto nadgradite paket spodaj.' : 'The operating-unit limit has been reached. Upgrade the plan below to add another unit.')
              : (sl ? 'Izbrani paket ne vključuje dodatnih poslovnih enot. Paket lahko nadgradite spodaj.' : 'The selected plan does not include additional operating units. You can upgrade the plan below.')}</p>
          )}
        </section>
      </div>

      <section className="account-card account-subscription-card workspace-unit-usage-card">
        <div className="account-plan-header"><h3>{sl ? 'Poraba po poslovnih enotah' : 'Usage by operating unit'}</h3></div>
        <div className="workspace-unit-usage-table">
          <div className="workspace-unit-row workspace-unit-header"><span>{sl ? 'Enota' : 'Unit'}</span><span>{sl ? 'Lokacije' : 'Locations'}</span><span>{sl ? 'Uporabniki' : 'Users'}</span><span>{sl ? 'Izvajalci' : 'Consultants'}</span><span>{sl ? 'Stranke' : 'Clients'}</span><span>{sl ? 'Rezervacije' : 'Bookings'}</span><span>SMS</span><span>Email</span><span>{sl ? 'Hramba' : 'Storage'}</span><span>API</span><span>{sl ? 'Plačila' : 'Payments'}</span></div>
          {data.units.map(unit => <div className="workspace-unit-row" key={unit.companyId}><strong>{unit.companyName}</strong><span>{unit.locations}</span><span>{unit.memberships}</span><span>{unit.consultants}</span><span>{unit.clients}</span><span>{unit.monthlyBookings}</span><span>{unit.smsParts}</span><span>{unit.emailMessages}</span><span>{(unit.storageBytes / 1024 / 1024).toFixed(1)} MB</span><span>{unit.apiCalls}</span><span>{unit.paymentTransactions}</span></div>)}
        </div>
      </section>

      <style>{`
        .workspace-subscription-panel{display:grid;gap:18px;margin-bottom:18px}.workspace-subscription-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.workspace-subscription-hero{grid-column:1/-1}.workspace-subscription-summary{display:flex;flex-wrap:wrap;gap:10px 18px;margin-top:14px;color:var(--account-muted,#64748b)}.workspace-subscription-summary strong{color:var(--account-text,#0f172a)}.workspace-feature-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.workspace-feature-chips span{padding:5px 9px;border-radius:999px;background:#eff6ff;color:#1d4ed8;font-size:12px}.workspace-usage-label{display:flex;justify-content:space-between;gap:12px}.workspace-subscription-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:14px 0}.workspace-subscription-field{display:grid;gap:6px;font-size:13px}.workspace-subscription-field span{font-weight:650}.workspace-subscription-field input,.workspace-subscription-field select{width:100%;min-height:40px;border:1px solid #dbe3ef;border-radius:10px;padding:8px 10px;background:#fff}.workspace-capacity-card{grid-column:1/-1}.workspace-capacity-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.workspace-overage-options{display:flex;flex-wrap:wrap;gap:14px;margin:8px 0 16px}.workspace-overage-readonly span{padding:7px 10px;border-radius:999px;background:#f8fafc;border:1px solid #e2e8f0}.workspace-unit-usage-table{overflow:auto}.workspace-unit-row{display:grid;grid-template-columns:minmax(180px,1.6fr) repeat(10,minmax(90px,1fr));gap:12px;align-items:center;padding:12px;border-bottom:1px solid #edf1f7;min-width:1260px}.workspace-unit-header{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#64748b}.workspace-unit-usage-card{grid-column:1/-1}@media(max-width:900px){.workspace-subscription-grid{grid-template-columns:1fr}.workspace-capacity-card{grid-column:auto}.workspace-capacity-grid,.workspace-subscription-form-grid{grid-template-columns:1fr 1fr}}@media(max-width:620px){.workspace-capacity-grid,.workspace-subscription-form-grid{grid-template-columns:1fr}}
      `}</style>
    </div>
  )
}
