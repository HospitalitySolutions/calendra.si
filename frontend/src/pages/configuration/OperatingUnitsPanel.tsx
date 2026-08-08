import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../../api'
import { useToast } from '../../components/Toast'
import type { InvoiceIssuerOption } from '../../lib/types'
import './operating-units.css'

type OperatingLocation = {
  id: number
  name: string
  address?: string | null
  postalCode?: string | null
  city?: string | null
  country?: string | null
  timezone: string
  phone?: string | null
  email?: string | null
  openingHoursJson?: string | null
  publicBookingEnabled: boolean
  defaultLocation: boolean
  active: boolean
  fiscalBusinessPremiseCode?: string | null
  defaultLegalEntityId?: number | null
  defaultLegalEntityName?: string | null
  defaultInvoiceSeriesId?: number | null
  invoiceNextNumber?: string | null
  invoiceInitialNumber?: string | null
  invoiceResetPolicy?: string | null
  invoiceElectronicDeviceId?: string | null
}

type Space = {
  id: number
  name: string
  description?: string | null
  location?: Pick<OperatingLocation, 'id' | 'name'> | null
}

type LocationDraft = {
  name: string
  address: string
  postalCode: string
  city: string
  country: string
  timezone: string
  phone: string
  email: string
  openingHoursJson: string | null
  publicBookingEnabled: boolean
  defaultLocation: boolean
  active: boolean
  fiscalBusinessPremiseCode: string
  defaultLegalEntityId: number | null
  invoiceNextNumber: string
  invoiceInitialNumber: string
  invoiceResetPolicy: 'NONE' | 'YEARLY'
  invoiceElectronicDeviceId: string
}

type OperatingUnitsPanelProps = {
  locale: string
  locationsEnabled: boolean
  spacesEnabled: boolean
  issuerOptions?: InvoiceIssuerOption[]
  onChanged?: () => void | Promise<void>
}

const FALLBACK_TIMEZONES = [
  'Europe/Ljubljana',
  'Europe/Zagreb',
  'Europe/Vienna',
  'Europe/Rome',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/London',
  'Europe/Belgrade',
  'Europe/Sarajevo',
  'Europe/Skopje',
  'Europe/Podgorica',
  'Europe/Prague',
  'Europe/Warsaw',
  'Europe/Budapest',
  'Europe/Athens',
  'Europe/Helsinki',
  'Europe/Bucharest',
  'Europe/Sofia',
  'Europe/Istanbul',
  'UTC',
]

const COUNTRY_CODES = [
  'AF','AL','DZ','AS','AD','AO','AI','AQ','AG','AR','AM','AW','AU','AT','AZ','BS','BH','BD','BB','BY','BE','BZ','BJ','BM','BT','BO','BQ','BA','BW','BV','BR','IO','BN','BG','BF','BI','CV','KH','CM','CA','KY','CF','TD','CL','CN','CX','CC','CO','KM','CG','CD','CK','CR','CI','HR','CU','CW','CY','CZ','DK','DJ','DM','DO','EC','EG','SV','GQ','ER','EE','SZ','ET','FK','FO','FJ','FI','FR','GF','PF','TF','GA','GM','GE','DE','GH','GI','GR','GL','GD','GP','GU','GT','GG','GN','GW','GY','HT','HM','VA','HN','HK','HU','IS','IN','ID','IR','IQ','IE','IM','IL','IT','JM','JP','JE','JO','KZ','KE','KI','KP','KR','KW','KG','LA','LV','LB','LS','LR','LY','LI','LT','LU','MO','MG','MW','MY','MV','ML','MT','MH','MQ','MR','MU','YT','MX','FM','MD','MC','MN','ME','MS','MA','MZ','MM','NA','NR','NP','NL','NC','NZ','NI','NE','NG','NU','NF','MK','MP','NO','OM','PK','PW','PS','PA','PG','PY','PE','PH','PN','PL','PT','PR','QA','RE','RO','RU','RW','BL','SH','KN','LC','MF','PM','VC','WS','SM','ST','SA','SN','RS','SC','SL','SG','SX','SK','SI','SB','SO','ZA','GS','SS','ES','LK','SD','SR','SJ','SE','CH','SY','TW','TJ','TZ','TH','TL','TG','TK','TO','TT','TN','TR','TM','TC','TV','UG','UA','AE','GB','US','UM','UY','UZ','VU','VE','VN','VG','VI','WF','EH','YE','ZM','ZW',
]

const blankDraft = (issuerId: number | null): LocationDraft => ({
  name: '',
  address: '',
  postalCode: '',
  city: '',
  country: 'SI',
  timezone: 'Europe/Ljubljana',
  phone: '',
  email: '',
  openingHoursJson: null,
  publicBookingEnabled: true,
  defaultLocation: false,
  active: true,
  fiscalBusinessPremiseCode: '',
  defaultLegalEntityId: issuerId,
  invoiceNextNumber: '1',
  invoiceInitialNumber: '1',
  invoiceResetPolicy: 'NONE',
  invoiceElectronicDeviceId: '1',
})

const draftFromLocation = (location: OperatingLocation): LocationDraft => ({
  name: location.name || '',
  address: location.address || '',
  postalCode: location.postalCode || '',
  city: location.city || '',
  country: location.country || 'SI',
  timezone: location.timezone || 'Europe/Ljubljana',
  phone: location.phone || '',
  email: location.email || '',
  openingHoursJson: location.openingHoursJson ?? null,
  publicBookingEnabled: location.publicBookingEnabled !== false,
  defaultLocation: location.defaultLocation === true,
  active: location.active !== false,
  fiscalBusinessPremiseCode: location.fiscalBusinessPremiseCode || '',
  defaultLegalEntityId: location.defaultLegalEntityId ?? null,
  invoiceNextNumber: location.invoiceNextNumber || '1',
  invoiceInitialNumber: location.invoiceInitialNumber || '1',
  invoiceResetPolicy: location.invoiceResetPolicy === 'YEARLY' ? 'YEARLY' : 'NONE',
  invoiceElectronicDeviceId: location.invoiceElectronicDeviceId || '1',
})

function icon(kind: 'pin' | 'building' | 'room' | 'info' | 'plus' | 'trash' | 'chevron') {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (kind === 'pin') return <svg {...common}><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>
  if (kind === 'room') return <svg {...common}><path d="M3 21h18"/><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M10 12h.01"/></svg>
  if (kind === 'info') return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>
  if (kind === 'plus') return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>
  if (kind === 'trash') return <svg {...common}><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v5M14 11v5"/></svg>
  if (kind === 'chevron') return <svg {...common}><path d="m9 18 6-6-6-6"/></svg>
  return <svg {...common}><path d="M3 21h18"/><path d="M5 21V8l7-4 7 4v13"/><path d="M8 12h2M14 12h2M8 16h2M14 16h2"/></svg>
}

export function OperatingUnitsPanel({
  locale,
  locationsEnabled,
  spacesEnabled,
  issuerOptions = [],
  onChanged,
}: OperatingUnitsPanelProps) {
  const sl = locale === 'sl'
  const { showToast } = useToast()
  const [locations, setLocations] = useState<OperatingLocation[]>([])
  const [issuers, setIssuers] = useState<InvoiceIssuerOption[]>(issuerOptions)
  const [spaces, setSpaces] = useState<Space[]>([])
  const [selectedLocationId, setSelectedLocationId] = useState<number | 'new' | null>(null)
  const [draft, setDraft] = useState<LocationDraft>(() => blankDraft(issuerOptions[0]?.id ?? null))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [premiseBusy, setPremiseBusy] = useState(false)
  const [bannerVisible, setBannerVisible] = useState(true)
  const [newSpaceName, setNewSpaceName] = useState('')
  const [addingSpace, setAddingSpace] = useState(false)
  const [editingSpaceId, setEditingSpaceId] = useState<number | null>(null)
  const [spaceDraft, setSpaceDraft] = useState({ name: '', description: '' })

  const defaultIssuer = useMemo(
    () => issuers.find((issuer) => issuer.defaultForCurrentUnit) ?? issuers[0] ?? null,
    [issuers],
  )

  const timezones = useMemo(() => {
    try {
      const values = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone')
      const list = values?.length ? values : FALLBACK_TIMEZONES
      return Array.from(new Set(['Europe/Ljubljana', 'UTC', ...list])).sort((a, b) => a.localeCompare(b))
    } catch {
      return FALLBACK_TIMEZONES
    }
  }, [])

  const countries = useMemo(() => {
    let displayNames: { of: (code: string) => string | undefined } | null = null
    try {
      const DisplayNames = (Intl as unknown as { DisplayNames?: new (locales: string[], options: { type: 'region' }) => { of: (code: string) => string | undefined } }).DisplayNames
      displayNames = DisplayNames ? new DisplayNames([locale], { type: 'region' }) : null
    } catch {
      displayNames = null
    }
    return COUNTRY_CODES.map((code) => ({ code, label: displayNames?.of(code) || code }))
      .sort((a, b) => a.label.localeCompare(b.label, locale))
  }, [locale])

  const load = useCallback(async (preferredLocationId?: number | 'new' | null) => {
    setLoading(true)
    try {
      const [locationRes, issuerRes, spaceRes] = await Promise.all([
        api.get('/locations'),
        api.get('/billing/issuers').catch(() => ({ data: issuerOptions })),
        spacesEnabled ? api.get('/spaces') : Promise.resolve({ data: [] }),
      ])
      const nextLocations = Array.isArray(locationRes.data) ? locationRes.data as OperatingLocation[] : []
      const nextIssuers = (Array.isArray(issuerRes.data) ? issuerRes.data : issuerOptions)
        .filter((issuer: InvoiceIssuerOption) => issuer.assignedToCurrentUnit && issuer.active)
      const nextSpaces = Array.isArray(spaceRes.data) ? spaceRes.data as Space[] : []
      setLocations(nextLocations)
      setIssuers(nextIssuers)
      setSpaces(nextSpaces)
      const requested = preferredLocationId ?? selectedLocationId
      if (requested === 'new' && locationsEnabled) {
        setSelectedLocationId('new')
        setDraft(blankDraft((nextIssuers.find((x: InvoiceIssuerOption) => x.defaultForCurrentUnit) ?? nextIssuers[0])?.id ?? null))
      } else {
        const selected = nextLocations.find((item) => item.id === requested)
          ?? nextLocations.find((item) => item.defaultLocation)
          ?? nextLocations[0]
          ?? null
        setSelectedLocationId(selected?.id ?? null)
        setDraft(selected ? draftFromLocation(selected) : blankDraft((nextIssuers.find((x: InvoiceIssuerOption) => x.defaultForCurrentUnit) ?? nextIssuers[0])?.id ?? null))
      }
    } catch (error: any) {
      showToast('error', error?.response?.data?.message || (sl ? 'Poslovnih prostorov ni bilo mogoče naložiti.' : 'Business units could not be loaded.'))
    } finally {
      setLoading(false)
    }
  }, [issuerOptions, locationsEnabled, selectedLocationId, showToast, sl, spacesEnabled])

  useEffect(() => {
    void load()
    // Initial load only; later reloads are called explicitly after mutations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedLocation = selectedLocationId === 'new'
    ? null
    : locations.find((item) => item.id === selectedLocationId) ?? null
  const locationSpaces = spaces.filter((space) => space.location?.id === selectedLocation?.id)
  const showCompanySelector = issuers.length > 1

  const selectLocation = (location: OperatingLocation) => {
    setSelectedLocationId(location.id)
    setDraft(draftFromLocation(location))
    setAddingSpace(false)
    setEditingSpaceId(null)
  }

  useEffect(() => {
    if (locationsEnabled || selectedLocationId !== 'new') return
    const fallback = locations.find((location) => location.defaultLocation) ?? locations[0] ?? null
    setSelectedLocationId(fallback?.id ?? null)
    setDraft(fallback ? draftFromLocation(fallback) : blankDraft(defaultIssuer?.id ?? null))
    setAddingSpace(false)
    setEditingSpaceId(null)
  }, [defaultIssuer?.id, locations, locationsEnabled, selectedLocationId])

  const beginNewLocation = () => {
    if (!locationsEnabled) return
    setSelectedLocationId('new')
    setDraft(blankDraft(defaultIssuer?.id ?? null))
    setAddingSpace(false)
    setEditingSpaceId(null)
  }

  const cancelLocationChanges = () => {
    if (selectedLocationId === 'new') {
      const fallback = locations.find((location) => location.defaultLocation) ?? locations[0] ?? null
      if (fallback) selectLocation(fallback)
      else setDraft(blankDraft(defaultIssuer?.id ?? null))
      return
    }
    if (selectedLocation) selectLocation(selectedLocation)
  }

  const saveLocation = async () => {
    if (!selectedLocation && !locationsEnabled) {
      showToast('error', sl ? 'Dodajanje dodatnih lokacij ni omogočeno.' : 'Adding additional locations is not enabled.')
      return
    }
    if (!draft.name.trim()) {
      showToast('error', sl ? 'Vnesite ime lokacije.' : 'Enter a location name.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...draft,
        name: draft.name.trim(),
        defaultLegalEntityId: draft.defaultLegalEntityId ?? defaultIssuer?.id ?? null,
      }
      const response = selectedLocation
        ? await api.put(`/locations/${selectedLocation.id}`, payload)
        : await api.post('/locations', payload)
      const savedId = Number(response.data?.id || selectedLocation?.id)
      await load(Number.isFinite(savedId) ? savedId : null)
      await onChanged?.()
      window.dispatchEvent(new Event('locations-updated'))
      showToast('success', sl ? 'Lokacija je shranjena.' : 'Location saved.')
    } catch (error: any) {
      showToast('error', error?.response?.data?.message || (sl ? 'Lokacije ni bilo mogoče shraniti.' : 'Location could not be saved.'))
    } finally {
      setSaving(false)
    }
  }

  const deleteLocation = async () => {
    if (!selectedLocation || selectedLocation.defaultLocation) return
    if (!window.confirm(sl ? `Izbrišem lokacijo ${selectedLocation.name}?` : `Delete location ${selectedLocation.name}?`)) return
    try {
      await api.delete(`/locations/${selectedLocation.id}`)
      await load(null)
      await onChanged?.()
      window.dispatchEvent(new Event('locations-updated'))
      showToast('success', sl ? 'Lokacija je izbrisana.' : 'Location deleted.')
    } catch (error: any) {
      showToast('error', error?.response?.data?.message || (sl ? 'Lokacije ni bilo mogoče izbrisati.' : 'Location could not be deleted.'))
    }
  }

  const createSpace = async () => {
    const name = newSpaceName.trim()
    if (!name || !selectedLocation) return
    try {
      await api.post('/spaces', { name, description: '', locationId: selectedLocation.id })
      setNewSpaceName('')
      setAddingSpace(false)
      await load(selectedLocation.id)
      await onChanged?.()
      showToast('success', sl ? 'Prostor je dodan.' : 'Room added.')
    } catch (error: any) {
      showToast('error', error?.response?.data?.message || (sl ? 'Prostora ni bilo mogoče dodati.' : 'Room could not be added.'))
    }
  }

  const saveSpace = async (spaceId: number) => {
    if (!spaceDraft.name.trim() || !selectedLocation) return
    try {
      await api.put(`/spaces/${spaceId}`, {
        name: spaceDraft.name.trim(),
        description: spaceDraft.description.trim(),
        locationId: selectedLocation.id,
      })
      setEditingSpaceId(null)
      await load(selectedLocation.id)
      await onChanged?.()
      showToast('success', sl ? 'Prostor je shranjen.' : 'Room saved.')
    } catch (error: any) {
      showToast('error', error?.response?.data?.message || (sl ? 'Prostora ni bilo mogoče shraniti.' : 'Room could not be saved.'))
    }
  }

  const deleteSpace = async (space: Space) => {
    if (!window.confirm(sl ? `Izbrišem prostor ${space.name}?` : `Delete room ${space.name}?`)) return
    try {
      await api.delete(`/spaces/${space.id}`)
      await load(selectedLocation?.id ?? null)
      await onChanged?.()
    } catch (error: any) {
      showToast('error', error?.response?.data?.message || (sl ? 'Prostora ni bilo mogoče izbrisati.' : 'Room could not be deleted.'))
    }
  }

  const registerPremise = async () => {
    if (!selectedLocation) {
      showToast('error', sl ? 'Najprej shranite lokacijo.' : 'Save the location first.')
      return
    }
    if (!draft.defaultLegalEntityId) {
      showToast('error', sl ? 'Za lokacijo izberite povezano podjetje.' : 'Select a linked company for this location.')
      return
    }
    if (!draft.fiscalBusinessPremiseCode.trim()) {
      showToast('error', sl ? 'Vnesite oznako poslovnega prostora.' : 'Enter the business premise code.')
      return
    }
    setPremiseBusy(true)
    try {
      await api.post('/fiscal/premises/register', null, {
        params: {
          legalEntityId: draft.defaultLegalEntityId,
          locationId: selectedLocation.id,
        },
      })
      showToast('success', sl ? 'Poslovni prostor je bil uspešno registriran.' : 'Business premise registered successfully.')
    } catch (error: any) {
      showToast('error', error?.response?.data?.message || error?.response?.data?.error || (sl ? 'Poslovnega prostora ni bilo mogoče registrirati.' : 'Could not register the business premise.'))
    } finally {
      setPremiseBusy(false)
    }
  }

  if (loading && locations.length === 0) {
    return <div className="operating-units-loading">{sl ? 'Nalaganje poslovnih prostorov…' : 'Loading business units…'}</div>
  }

  return (
    <section className="operating-units-panel">
      <header className="operating-units-head">
        <div>
          <h2>{sl ? 'Poslovni prostori' : 'Business units'}</h2>
          <p>{sl ? 'Upravljajte lokacije in poslovne prostore. Naslov podjetja se odslej določa na lokaciji.' : 'Manage locations and rooms. The company physical address is now defined by its location.'}</p>
        </div>
        {locationsEnabled ? <button type="button" className="ou-primary-button" onClick={beginNewLocation}>{icon('plus')}{sl ? 'Nova lokacija' : 'New location'}</button> : null}
      </header>

      {bannerVisible ? (
        <div className="ou-info-banner">
          <span>{icon('info')}</span>
          <p>{sl ? 'Fizični naslov podjetja se upravlja preko lokacije. Polj za fizični naslov v zavihku Podjetje ni več treba izpolnjevati.' : 'The company physical address is managed through a location. Separate physical-address fields are no longer needed in the Company tab.'}</p>
          <button type="button" onClick={() => setBannerVisible(false)} aria-label={sl ? 'Zapri obvestilo' : 'Close notice'}>×</button>
        </div>
      ) : null}

      <div className="ou-workspace">
        <aside className="ou-location-sidebar">
          <div className="ou-section-title"><h3>{sl ? 'Lokacije' : 'Locations'}</h3><span>{locations.length}</span></div>
          <div className="ou-location-list">
            {locations.map((location) => (
              <button
                key={location.id}
                type="button"
                className={`ou-location-item${selectedLocationId === location.id ? ' is-selected' : ''}`}
                onClick={() => selectLocation(location)}
              >
                <span className="ou-location-icon">{icon(location.defaultLocation ? 'pin' : 'building')}</span>
                <span className="ou-location-copy">
                  <strong>{location.name}</strong>
                  <small>{location.defaultLegalEntityName || defaultIssuer?.name || (sl ? 'Glavno podjetje' : 'Main company')}</small>
                </span>
                {location.defaultLocation ? <span className="ou-default-badge">{sl ? 'Privzeta' : 'Default'}</span> : null}
                <span className="ou-location-chevron">{icon('chevron')}</span>
              </button>
            ))}
            {selectedLocationId === 'new' ? (
              <button type="button" className="ou-location-item is-selected is-new">
                <span className="ou-location-icon">{icon('plus')}</span>
                <span className="ou-location-copy"><strong>{sl ? 'Nova lokacija' : 'New location'}</strong><small>{sl ? 'Vnesite podatke' : 'Enter details'}</small></span>
              </button>
            ) : null}
          </div>
          {locationsEnabled ? <button type="button" className="ou-secondary-add" onClick={beginNewLocation}>{icon('plus')}{sl ? 'Nova lokacija' : 'New location'}</button> : null}
        </aside>

        <main className="ou-detail">
          <div className="ou-detail-card">
            <div className="ou-detail-titlebar">
              <div className="ou-detail-title">
                <span className="ou-detail-icon">{icon('building')}</span>
                <strong>{draft.name || (sl ? 'Nova lokacija' : 'New location')}</strong>
                {draft.defaultLocation ? <span className="ou-default-badge">{sl ? 'Privzeta' : 'Default'}</span> : null}
              </div>
              <span className={`ou-status-badge${draft.active ? '' : ' is-inactive'}`}>{draft.active ? (sl ? 'Aktivna' : 'Active') : (sl ? 'Neaktivna' : 'Inactive')}</span>
            </div>

            <div className="ou-form-columns">
              <section className="ou-form-section">
                <h3>{sl ? 'Osnovni podatki' : 'Basic information'}</h3>
                {showCompanySelector ? (
                  <label className="ou-field ou-field-wide">
                    <span>{sl ? 'Podjetje (povezano)' : 'Linked company'}</span>
                    <select value={draft.defaultLegalEntityId ?? ''} onChange={(event) => setDraft((current) => ({ ...current, defaultLegalEntityId: event.target.value ? Number(event.target.value) : null }))}>
                      {issuers.map((issuer) => <option key={issuer.id} value={issuer.id}>{issuer.name}</option>)}
                    </select>
                    <small>{sl ? 'Eno podjetje je lahko povezano z več lokacijami.' : 'One company can be linked to multiple locations.'}</small>
                  </label>
                ) : (
                  <div className="ou-static-company ou-field-wide"><span>{sl ? 'Podjetje (povezano)' : 'Linked company'}</span><strong>{issuers.find((issuer) => issuer.id === draft.defaultLegalEntityId)?.name || defaultIssuer?.name || '—'}</strong></div>
                )}
                <label className="ou-field ou-field-wide"><span>{sl ? 'Ime lokacije *' : 'Location name *'}</span><input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder={sl ? 'npr. Maribor Center' : 'e.g. City Centre'} /></label>
                <label className="ou-field"><span>{sl ? 'Ulica in hišna št.' : 'Street and number'}</span><input value={draft.address} onChange={(event) => setDraft((current) => ({ ...current, address: event.target.value }))} /></label>
                <label className="ou-field"><span>{sl ? 'Poštna številka' : 'Postal code'}</span><input value={draft.postalCode} onChange={(event) => setDraft((current) => ({ ...current, postalCode: event.target.value }))} /></label>
                <label className="ou-field"><span>{sl ? 'Mesto' : 'City'}</span><input value={draft.city} onChange={(event) => setDraft((current) => ({ ...current, city: event.target.value }))} /></label>
                <label className="ou-field"><span>{sl ? 'Država' : 'Country'}</span><select value={draft.country} onChange={(event) => setDraft((current) => ({ ...current, country: event.target.value }))}>{countries.map((country) => <option key={country.code} value={country.code}>{country.label}</option>)}</select></label>
                <label className="ou-field"><span>{sl ? 'Telefon' : 'Phone'}</span><input value={draft.phone} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} /></label>
                <label className="ou-field"><span>{sl ? 'E-pošta' : 'Email'}</span><input type="email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} /></label>
                <label className="ou-field ou-field-wide"><span>{sl ? 'Časovni pas' : 'Time zone'}</span><select value={draft.timezone} onChange={(event) => setDraft((current) => ({ ...current, timezone: event.target.value }))}>{timezones.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}</select><small>{sl ? 'Določa pravilen prikaz datumov in ur v vseh delih aplikacije za to lokacijo.' : 'Controls date and time display throughout the app for this location.'}</small></label>
              </section>

              <section className="ou-form-section ou-fiscal-section">
                <h3>{sl ? 'Fiskalne / računovodske nastavitve lokacije' : 'Fiscal / accounting settings'}</h3>
                <div className="ou-counter-note">{icon('info')}<span>{sl ? 'Vsaka lokacija ima svoje številčenje računov.' : 'Each location has its own invoice counter.'}</span></div>
                <div className="ou-field">
                  <span>{sl ? 'Oznaka poslovnega prostora' : 'Business premise code'}</span>
                  <input value={draft.fiscalBusinessPremiseCode} onChange={(event) => setDraft((current) => ({ ...current, fiscalBusinessPremiseCode: event.target.value }))} placeholder="REC123" />
                  <small>{sl ? 'Vsi računi, izdani na tej lokaciji, uporabijo to oznako kot predpono.' : 'All invoices issued at this location use this code as their prefix.'}</small>
                  <div className="ou-inline-actions">
                    <button type="button" className="ou-inline-button" onClick={() => void registerPremise()} disabled={premiseBusy || !selectedLocation || !draft.defaultLegalEntityId}>{premiseBusy ? (sl ? 'Registracija…' : 'Registering…') : (sl ? 'Registriraj poslovni prostor' : 'Register business premise')}</button>
                  </div>
                </div>
                <label className="ou-field"><span>{sl ? 'Naslednja številka' : 'Next number'}</span><input value={draft.invoiceNextNumber} onChange={(event) => setDraft((current) => ({ ...current, invoiceNextNumber: event.target.value }))} /></label>
                <label className="ou-field"><span>{sl ? 'Začetna številka ob ponastavitvi' : 'Initial number on reset'}</span><input value={draft.invoiceInitialNumber} onChange={(event) => setDraft((current) => ({ ...current, invoiceInitialNumber: event.target.value }))} /></label>
                <label className="ou-field"><span>{sl ? 'Ponastavitev' : 'Reset'}</span><select value={draft.invoiceResetPolicy} onChange={(event) => setDraft((current) => ({ ...current, invoiceResetPolicy: event.target.value === 'YEARLY' ? 'YEARLY' : 'NONE' }))}><option value="NONE">{sl ? 'Brez' : 'None'}</option><option value="YEARLY">{sl ? 'Letno' : 'Yearly'}</option></select></label>
                <label className="ou-field"><span>{sl ? 'Oznaka elektronske naprave' : 'Electronic device ID'}</span><input value={draft.invoiceElectronicDeviceId} onChange={(event) => setDraft((current) => ({ ...current, invoiceElectronicDeviceId: event.target.value }))} /><small>{sl ? 'Oznaka tiskalnika ali POS naprave za izdajanje računov.' : 'Printer or POS device identifier used for invoices.'}</small></label>
              </section>
            </div>

            <div className="ou-check-row">
              <label><input type="checkbox" checked={draft.active} disabled={draft.defaultLocation} onChange={(event) => setDraft((current) => ({ ...current, active: event.target.checked }))} /><span><strong>{sl ? 'Aktivna lokacija' : 'Active location'}</strong><small>{sl ? 'Lokacija je vidna in uporabna v aplikaciji.' : 'The location is visible and usable in the app.'}</small></span></label>
              <label><input type="checkbox" checked={draft.defaultLocation} disabled={Boolean(selectedLocation?.defaultLocation)} onChange={(event) => setDraft((current) => ({ ...current, defaultLocation: event.target.checked, active: event.target.checked ? true : current.active }))} /><span><strong>{sl ? 'Privzeta lokacija' : 'Default location'}</strong><small>{sl ? 'Predizpolni se pri novih rezervacijah in računih.' : 'Preselected for new bookings and invoices.'}</small></span></label>
              <label><input type="checkbox" checked={draft.publicBookingEnabled} onChange={(event) => setDraft((current) => ({ ...current, publicBookingEnabled: event.target.checked }))} /><span><strong>{sl ? 'Spletno naročanje' : 'Online booking'}</strong><small>{sl ? 'Lokacija je na voljo na javnih rezervacijskih straneh.' : 'The location is available on public booking pages.'}</small></span></label>
            </div>
          </div>

          {spacesEnabled && selectedLocation ? (
            <section className="ou-spaces-section">
              <div className="ou-spaces-head"><div><h3>{sl ? 'Prostori (poslovni prostori) na tej lokaciji' : 'Rooms at this location'}</h3><span>{locationSpaces.length}</span></div><button type="button" onClick={() => setAddingSpace(true)}>{icon('plus')}{sl ? 'Nov prostor' : 'New room'}</button></div>
              <div className="ou-space-grid">
                {addingSpace ? (
                  <article className="ou-space-card is-editing"><span className="ou-space-icon">{icon('room')}</span><input autoFocus value={newSpaceName} onChange={(event) => setNewSpaceName(event.target.value)} placeholder={sl ? 'Ime prostora' : 'Room name'} /><div className="ou-space-actions"><button type="button" className="primary" onClick={() => void createSpace()}>{sl ? 'Shrani' : 'Save'}</button><button type="button" onClick={() => { setAddingSpace(false); setNewSpaceName('') }}>{sl ? 'Prekliči' : 'Cancel'}</button></div></article>
                ) : null}
                {locationSpaces.map((space) => (
                  <article key={space.id} className={`ou-space-card${editingSpaceId === space.id ? ' is-editing' : ''}`}>
                    <span className="ou-space-icon">{icon('room')}</span>
                    {editingSpaceId === space.id ? <><input value={spaceDraft.name} onChange={(event) => setSpaceDraft((current) => ({ ...current, name: event.target.value }))} /><textarea value={spaceDraft.description} onChange={(event) => setSpaceDraft((current) => ({ ...current, description: event.target.value }))} placeholder={sl ? 'Opis (neobvezno)' : 'Description (optional)'} /><div className="ou-space-actions"><button type="button" className="primary" onClick={() => void saveSpace(space.id)}>{sl ? 'Shrani' : 'Save'}</button><button type="button" onClick={() => setEditingSpaceId(null)}>{sl ? 'Prekliči' : 'Cancel'}</button></div></> : <><strong>{space.name}</strong><small>{space.description || draft.address || selectedLocation.name}</small><span className="ou-room-status">{sl ? 'Aktivno' : 'Active'}</span><div className="ou-space-menu"><button type="button" onClick={() => { setEditingSpaceId(space.id); setSpaceDraft({ name: space.name, description: space.description || '' }) }}>{sl ? 'Uredi' : 'Edit'}</button><button type="button" className="danger" onClick={() => void deleteSpace(space)}>{sl ? 'Izbriši' : 'Delete'}</button></div></>}
                  </article>
                ))}
                {!addingSpace && locationSpaces.length === 0 ? <div className="ou-spaces-empty">{sl ? 'Na tej lokaciji še ni prostorov.' : 'No rooms have been added to this location.'}</div> : null}
              </div>
            </section>
          ) : null}

          <footer className="ou-footer">
            <div>{selectedLocation && !selectedLocation.defaultLocation ? <button type="button" className="ou-delete-button" onClick={() => void deleteLocation()}>{icon('trash')}{sl ? 'Izbriši lokacijo' : 'Delete location'}</button> : null}</div>
            <div><button type="button" className="ou-cancel-button" onClick={cancelLocationChanges}>{sl ? 'Prekliči' : 'Cancel'}</button><button type="button" className="ou-primary-button" disabled={saving} onClick={() => void saveLocation()}>{saving ? (sl ? 'Shranjujem…' : 'Saving…') : (sl ? 'Shrani spremembe' : 'Save changes')}</button></div>
          </footer>
        </main>
      </div>
    </section>
  )
}
