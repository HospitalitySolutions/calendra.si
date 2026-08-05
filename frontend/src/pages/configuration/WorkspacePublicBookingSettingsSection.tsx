import { useEffect, useMemo, useState } from 'react'
import { api, getApiErrorMessage } from '../../api'

type UnitRow = { companyId: number; companyName: string; enabled: boolean }
type LocationRow = { locationId: number; companyId: number; companyName: string; name: string; address?: string | null; city?: string | null; active: boolean; enabled: boolean }
type Settings = {
  slug: string
  publicUrl: string
  enabled: boolean
  locationSelectionMode: 'LOCATION_FIRST' | 'SERVICE_FIRST'
  allowAnyLocation: boolean
  showPrices: boolean
  allowEmployeeSelection: boolean
  defaultLanguage: 'sl' | 'en' | 'sr'
  primaryColor?: string | null
  logoUrl?: string | null
  pageTitle?: string | null
  introduction?: string | null
  confirmationText?: string | null
  privacyUrl?: string | null
  termsUrl?: string | null
  units: UnitRow[]
  locations: LocationRow[]
}

export function WorkspacePublicBookingSettingsSection({ locale }: { locale: string }) {
  const sl = locale === 'sl'
  const sr = locale === 'sr'
  const [value, setValue] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const text = useMemo(() => ({
    title: sl ? 'Skupno naročanje za vse lokacije' : sr ? 'Zajedničko zakazivanje za sve lokacije' : 'Workspace public booking',
    subtitle: sl ? 'Ena javna stran najprej prikaže lokacije in skupne storitve, nato nadaljuje v naročanje izbrane poslovne enote.' : sr ? 'Jedna javna stran prvo prikazuje lokacije i zajedničke usluge, a zatim nastavlja rezervaciju u izabranoj poslovnoj jedinici.' : 'One public page presents locations and shared services before continuing into the selected unit booking flow.',
    enabled: sl ? 'Omogočeno' : sr ? 'Omogućeno' : 'Enabled',
    slug: 'Slug',
    url: sl ? 'Javni naslov' : sr ? 'Javna adresa' : 'Public URL',
    titleLabel: sl ? 'Naslov strani' : sr ? 'Naslov stranice' : 'Page title',
    intro: sl ? 'Uvodno besedilo' : sr ? 'Uvodni tekst' : 'Introduction',
    color: sl ? 'Glavna barva' : sr ? 'Glavna boja' : 'Primary color',
    logo: 'Logo URL',
    language: sl ? 'Privzeti jezik' : sr ? 'Podrazumevani jezik' : 'Default language',
    flow: sl ? 'Zaporedje izbire' : sr ? 'Redosled izbora' : 'Selection order',
    locationFirst: sl ? 'Najprej lokacija' : sr ? 'Prvo lokacija' : 'Location first',
    serviceFirst: sl ? 'Najprej storitev' : sr ? 'Prvo usluga' : 'Service first',
    confirmation: sl ? 'Dodatno potrditveno besedilo' : sr ? 'Dodatni tekst potvrde' : 'Additional confirmation text',
    prices: sl ? 'Prikaži cene' : sr ? 'Prikaži cene' : 'Show prices',
    employee: sl ? 'Dovoli izbiro zaposlenega' : sr ? 'Dozvoli izbor zaposlenog' : 'Allow employee selection',
    any: sl ? 'Dovoli izbiro katerekoli lokacije' : sr ? 'Dozvoli bilo koju lokaciju' : 'Allow any location',
    privacy: sl ? 'Povezava do zasebnosti' : sr ? 'Link ka privatnosti' : 'Privacy URL',
    terms: sl ? 'Povezava do pogojev' : sr ? 'Link ka uslovima' : 'Terms URL',
    units: sl ? 'Vključene poslovne enote' : sr ? 'Uključene poslovne jedinice' : 'Included operating units',
    locations: sl ? 'Vključene fizične lokacije' : sr ? 'Uključene fizičke lokacije' : 'Included physical locations',
    save: sl ? 'Shrani skupno naročanje' : sr ? 'Sačuvaj zajedničko zakazivanje' : 'Save workspace booking',
    saved: sl ? 'Nastavitve so shranjene.' : sr ? 'Podešavanja su sačuvana.' : 'Settings saved.',
    copy: sl ? 'Kopiraj povezavo' : sr ? 'Kopiraj link' : 'Copy link',
  }), [sl, sr])

  useEffect(() => {
    let active = true
    api.get<Settings>('/workspace-public-booking')
      .then(response => { if (active) setValue(response.data) })
      .catch(err => { if (active) setError(getApiErrorMessage(err, 'Could not load workspace booking settings.')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const update = <K extends keyof Settings>(key: K, next: Settings[K]) => setValue(current => current ? { ...current, [key]: next } : current)

  const save = async () => {
    if (!value) return
    setSaving(true); setError(''); setMessage('')
    try {
      const payload = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'publicUrl'))
      const response = await api.put<Settings>('/workspace-public-booking', payload)
      setValue(response.data); setMessage(text.saved)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not save workspace booking settings.'))
    } finally { setSaving(false) }
  }

  const publicUrl = value ? `${window.location.origin}${value.publicUrl}` : ''
  if (loading) return <div className="wpb-card">Loading…</div>
  if (!value) return <div className="wpb-card wpb-error">{error || 'Workspace booking is unavailable.'}</div>

  return <div className="wpb-card">
    <style>{`
      .wpb-card{max-width:1100px;border:1px solid #dbe5f1;border-radius:22px;background:#fff;box-shadow:0 20px 56px rgba(15,23,42,.08);padding:28px;margin-bottom:22px;color:#0f1b3d}.wpb-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:24px}.wpb-head h2{margin:0 0 7px;font-size:24px}.wpb-head p{margin:0;color:#64748b;line-height:1.5}.wpb-toggle{display:flex;align-items:center;gap:9px;font-weight:800;white-space:nowrap}.wpb-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.wpb-field{display:grid;gap:7px}.wpb-field.full{grid-column:1/-1}.wpb-field label,.wpb-section-title{font-size:13px;font-weight:850;color:#31415f}.wpb-field input,.wpb-field select,.wpb-field textarea{width:100%;border:1px solid #d7e1ed;border-radius:12px;padding:11px 12px;background:#fff;color:#0f1b3d}.wpb-field textarea{min-height:88px;resize:vertical}.wpb-url{display:flex;gap:8px}.wpb-url input{flex:1;background:#f8fafc}.wpb-secondary,.wpb-primary{border-radius:11px;padding:10px 15px;font-weight:850;cursor:pointer}.wpb-secondary{border:1px solid #cbd8e8;background:#fff;color:#1f4f99}.wpb-primary{border:0;background:#2563eb;color:#fff;min-height:44px}.wpb-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;grid-column:1/-1}.wpb-option,.wpb-row{display:flex;align-items:center;gap:9px;border:1px solid #e1e8f2;border-radius:13px;padding:12px;background:#fbfdff}.wpb-lists{display:grid;grid-template-columns:1fr 1fr;gap:16px;grid-column:1/-1}.wpb-list{border:1px solid #e0e8f2;border-radius:16px;overflow:hidden}.wpb-list h3{margin:0;padding:14px 16px;border-bottom:1px solid #e7edf5;font-size:15px}.wpb-row{border:0;border-bottom:1px solid #edf2f7;border-radius:0}.wpb-row:last-child{border-bottom:0}.wpb-row span{display:block}.wpb-row small{display:block;color:#718096;margin-top:3px}.wpb-actions{display:flex;justify-content:flex-end;margin-top:22px}.wpb-message{margin-top:14px;padding:11px 13px;border-radius:10px;background:#ecfdf3;color:#166534}.wpb-error{color:#b42318}.wpb-error-note{margin-top:14px;padding:11px 13px;border-radius:10px;background:#fff1f2;color:#b42318}@media(max-width:760px){.wpb-card{padding:20px;border-radius:18px}.wpb-head{display:grid}.wpb-grid,.wpb-lists,.wpb-options{grid-template-columns:1fr}.wpb-field.full{grid-column:auto}.wpb-url{display:grid}}
    `}</style>
    <div className="wpb-head"><div><h2>{text.title}</h2><p>{text.subtitle}</p></div><label className="wpb-toggle"><input type="checkbox" checked={value.enabled} onChange={e => update('enabled', e.target.checked)} />{text.enabled}</label></div>
    <div className="wpb-grid">
      <div className="wpb-field"><label>{text.slug}</label><input value={value.slug} onChange={e => update('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} /></div>
      <div className="wpb-field"><label>{text.language}</label><select value={value.defaultLanguage} onChange={e => update('defaultLanguage', e.target.value as Settings['defaultLanguage'])}><option value="sl">Slovenščina</option><option value="en">English</option><option value="sr">Srpski</option></select></div>
      <div className="wpb-field"><label>{text.flow}</label><select value={value.locationSelectionMode} onChange={e => update('locationSelectionMode', e.target.value as Settings['locationSelectionMode'])}><option value="LOCATION_FIRST">{text.locationFirst}</option><option value="SERVICE_FIRST">{text.serviceFirst}</option></select></div>
      <div className="wpb-field full"><label>{text.url}</label><div className="wpb-url"><input readOnly value={publicUrl} /><button type="button" className="wpb-secondary" onClick={() => navigator.clipboard?.writeText(publicUrl)}>{text.copy}</button></div></div>
      <div className="wpb-field"><label>{text.titleLabel}</label><input value={value.pageTitle || ''} onChange={e => update('pageTitle', e.target.value)} /></div>
      <div className="wpb-field"><label>{text.color}</label><input type="color" value={value.primaryColor || '#1672f3'} onChange={e => update('primaryColor', e.target.value)} /></div>
      <div className="wpb-field full"><label>{text.intro}</label><textarea value={value.introduction || ''} onChange={e => update('introduction', e.target.value)} /></div>
      <div className="wpb-field full"><label>{text.confirmation}</label><textarea value={value.confirmationText || ''} onChange={e => update('confirmationText', e.target.value)} /></div>
      <div className="wpb-field full"><label>{text.logo}</label><input value={value.logoUrl || ''} onChange={e => update('logoUrl', e.target.value)} /></div>
      <div className="wpb-field"><label>{text.privacy}</label><input value={value.privacyUrl || ''} onChange={e => update('privacyUrl', e.target.value)} /></div>
      <div className="wpb-field"><label>{text.terms}</label><input value={value.termsUrl || ''} onChange={e => update('termsUrl', e.target.value)} /></div>
      <div className="wpb-options"><label className="wpb-option"><input type="checkbox" checked={value.showPrices} onChange={e => update('showPrices', e.target.checked)} />{text.prices}</label><label className="wpb-option"><input type="checkbox" checked={value.allowEmployeeSelection} onChange={e => update('allowEmployeeSelection', e.target.checked)} />{text.employee}</label><label className="wpb-option"><input type="checkbox" checked={value.allowAnyLocation} onChange={e => update('allowAnyLocation', e.target.checked)} />{text.any}</label></div>
      <div className="wpb-lists"><div className="wpb-list"><h3>{text.units}</h3>{value.units.map(unit => <label className="wpb-row" key={unit.companyId}><input type="checkbox" checked={unit.enabled} onChange={e => update('units', value.units.map(row => row.companyId === unit.companyId ? { ...row, enabled: e.target.checked } : row))} /><span>{unit.companyName}</span></label>)}</div><div className="wpb-list"><h3>{text.locations}</h3>{value.locations.map(location => <label className="wpb-row" key={location.locationId}><input type="checkbox" checked={location.enabled} onChange={e => update('locations', value.locations.map(row => row.locationId === location.locationId ? { ...row, enabled: e.target.checked } : row))} /><span>{location.name}<small>{location.companyName}{location.city ? ` · ${location.city}` : ''}</small></span></label>)}</div></div>
    </div>
    {error && <div className="wpb-error-note">{error}</div>}{message && <div className="wpb-message">{message}</div>}
    <div className="wpb-actions"><button type="button" className="wpb-primary" disabled={saving} onClick={save}>{saving ? '…' : text.save}</button></div>
  </div>
}
