import { useEffect, useMemo, useState } from 'react'
import type { Client, Company, CompanySummary } from '../lib/types'
import { fullName } from '../lib/format'
import { useLocale } from '../locale'

export type BookingPayeeType = 'PERSON' | 'COMPANY'

export type BookingPayeeDraft = {
  clientId: number
  payeeType: BookingPayeeType
  companyId: number | null
  customData?: boolean
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  companyName?: string | null
  address?: string | null
  city?: string | null
  postalCode?: string | null
  vatId?: string | null
  companyEmail?: string | null
}

export type BookingPayeeContext = {
  bookingId?: number | null
  clients: Client[]
  payees?: BookingPayeeDraft[] | null
  linkedCompany?: CompanySummary | null
}

type Props = {
  context: BookingPayeeContext
  companies: Company[]
  onSave?: (payees: BookingPayeeDraft[]) => Promise<void> | void
}

type CompanySource = 'LINKED' | 'CUSTOM'

function initials(client: Partial<Client>): string {
  const first = String(client.firstName || '').trim()[0] || ''
  const last = String(client.lastName || '').trim()[0] || ''
  return `${first}${last}`.toUpperCase() || 'K'
}

function uniqueClients(clients: Client[]): Client[] {
  const seen = new Set<number>()
  const out: Client[] = []
  for (const client of clients || []) {
    const id = Number(client?.id)
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue
    seen.add(id)
    out.push(client)
  }
  return out
}

function cleanString(value: unknown): string | null {
  const trimmed = String(value ?? '').trim()
  return trimmed ? trimmed : null
}

function draftFromRaw(clientId: number, raw: any, fallbackCompanyId?: number | null): BookingPayeeDraft {
  const currentType = String(raw?.payeeType || raw?.type || '').trim().toUpperCase()
  const payeeType: BookingPayeeType = currentType === 'COMPANY' ? 'COMPANY' : 'PERSON'
  const explicitCompanyId = Number(raw?.companyId ?? raw?.company?.id)
  const fallbackId = Number(fallbackCompanyId)
  const customData = payeeType === 'COMPANY' && Boolean(raw?.customData ?? raw?.custom ?? raw?.customPayeeData)
  const companyId = payeeType === 'COMPANY'
    ? (Number.isInteger(explicitCompanyId) && explicitCompanyId > 0
        ? explicitCompanyId
        : (Number.isInteger(fallbackId) && fallbackId > 0 ? fallbackId : null))
    : null
  return {
    clientId,
    payeeType,
    companyId,
    customData,
    firstName: cleanString(raw?.firstName),
    lastName: cleanString(raw?.lastName),
    email: cleanString(raw?.email),
    companyName: cleanString(raw?.companyName),
    address: cleanString(raw?.address),
    city: cleanString(raw?.city),
    postalCode: cleanString(raw?.postalCode),
    vatId: cleanString(raw?.vatId),
    companyEmail: cleanString(raw?.companyEmail ?? raw?.recipientCompanyEmail),
  }
}

function normalizeDrafts(context: BookingPayeeContext): BookingPayeeDraft[] {
  const clients = uniqueClients(context.clients || [])
  const existing = new Map<number, any>()
  for (const item of context.payees || []) {
    const clientId = Number(item?.clientId)
    if (!Number.isFinite(clientId) || clientId <= 0) continue
    existing.set(clientId, item)
  }
  const fallbackCompanyId = context.linkedCompany?.id ?? null
  return clients.map((client) => {
    const clientId = Number(client.id)
    const current = existing.get(clientId)
    if (current) return draftFromRaw(clientId, current, fallbackCompanyId)
    return {
      clientId,
      payeeType: 'PERSON',
      companyId: null,
      customData: false,
      firstName: cleanString(client.firstName),
      lastName: cleanString(client.lastName),
      email: null,
      companyName: null,
      address: null,
      city: null,
      postalCode: null,
      vatId: null,
      companyEmail: null,
    }
  })
}

function linkedCompanyForClient(client: Client | null, fallback: CompanySummary | null): CompanySummary | null {
  return client?.billingCompany || fallback || null
}

function companyLabel(company: CompanySummary | null, noLinkedCompany: string): string {
  return company?.name || noLinkedCompany
}

export function BookingPayeePanel({ context, companies, onSave }: Props) {
  const { locale } = useLocale()
  const copy = locale === 'sl'
    ? {
        summary: 'Povzetek',
        selectedClients: 'Izbranih klientov',
        payerSetting: 'Nastavitev plačnika',
        oneCompanyForAll: 'Isto podjetje za vse',
        perClient: 'Za vsakega klienta posebej',
        allUseOwn: 'Vsi klienti bodo uporabljali svoje nastavitve za plačnika.',
        allUseCompany: 'Uporabljen bo en plačnik za vse izbrane kliente.',
        editAll: 'Uredi nastavitve za vse',
        clientList: 'Seznam klientov',
        settingsFor: (name: string) => `Nastavitev plačnika za ${name}`,
        payerType: 'Vrsta plačnika',
        individual: 'Posameznik',
        company: 'Podjetje',
        clientIndividual: 'Klient (posameznik)',
        automatic: 'Samodejno',
        useClientData: 'Uporabijo se podatki tega klienta.',
        linkedCompany: 'Povezano podjetje',
        noLinkedCompany: 'Ni povezanega podjetja',
        useCompanyData: 'Uporabijo se podatki povezanega podjetja.',
        useSameCompanyForAll: 'Uporabi isto podjetje za vse',
        useSameCompanyIntro: 'Ko je vklopljeno, izberite eno povezano podjetje ali vnesite podatke za račun po meri, ki bodo uporabljeni za vse izbrane kliente in ta termin.',
        addCustom: 'Dodaj podatke po meri',
        customPersonHint: 'Vnesite podatke za račun samo za ta termin.',
        customCompanyHint: 'Vnesite podatke podjetja; ob izdelavi odprtega računa se samodejno ustvari profil podjetja.',
        globalCustomCompanyHint: 'Vnesite podatke podjetja; ob izdelavi odprtega računa se samodejno ustvari profil podjetja za te podatke.',
        firstName: 'Ime',
        lastName: 'Priimek',
        email: 'Email',
        emailPersonHelp: 'Če ni vnesen, se uporabi email klienta.',
        emailCompanyHelp: 'Če ni vnesen, se uporabi email podjetja.',
        companyName: 'Naziv podjetja',
        address: 'Naslov',
        city: 'Mesto',
        postalCode: 'Poštna številka',
        vatId: 'Davčna številka',
        companyPatternHint: 'Pri posamezniku se vedno uporabijo podatki izbranega klienta. Pri podjetju izberite povezano podjetje ali dodajte podatke novega podjetja.',
        sharedClientNote: 'Nastavitve za kliente uporabljajo skupnega plačnika.',
        info: 'Spremembe bodo veljale za izbrane kliente in se uporabijo pri izdelavi odprtega računa za ta termin.',
        save: 'Shrani plačnika',
        saving: 'Shranjujem…',
        noClients: 'Najprej dodajte klienta v termin.',
      }
    : {
        summary: 'Summary',
        selectedClients: 'Selected clients',
        payerSetting: 'Payee setting',
        oneCompanyForAll: 'Same company for all',
        perClient: 'Per client',
        allUseOwn: 'All clients will use their own payee settings.',
        allUseCompany: 'One payer will be used for all selected clients.',
        editAll: 'Edit all settings',
        clientList: 'Client list',
        settingsFor: (name: string) => `Payee setting for ${name}`,
        payerType: 'Payee type',
        individual: 'Individual',
        company: 'Company',
        clientIndividual: 'Client (individual)',
        automatic: 'Automatic',
        useClientData: 'This client data will be used.',
        linkedCompany: 'Linked company',
        noLinkedCompany: 'No linked company',
        useCompanyData: 'The linked company data will be used.',
        useSameCompanyForAll: 'Use same company for all',
        useSameCompanyIntro: 'When enabled, choose one linked company or enter custom invoice data used for all selected clients in this session.',
        addCustom: 'Add custom data',
        customPersonHint: 'Enter invoice data only for this session.',
        customCompanyHint: 'Enter company data; a company profile is created automatically when the open invoice is created.',
        globalCustomCompanyHint: 'Enter company data; a company profile is created automatically for these details when the open invoice is created.',
        firstName: 'First name',
        lastName: 'Last name',
        email: 'Email',
        emailPersonHelp: 'When empty, the client email is used.',
        emailCompanyHelp: 'When empty, the company email is used.',
        companyName: 'Company name',
        address: 'Address',
        city: 'City',
        postalCode: 'Post code',
        vatId: 'VAT ID',
        companyPatternHint: 'For an individual, the selected client data is always used. For a company, choose a linked company or add new company details.',
        sharedClientNote: 'Client settings use the shared payer.',
        info: 'Changes apply to selected clients and are used when creating the open bill for this session.',
        save: 'Save payee',
        saving: 'Saving…',
        noClients: 'Add a client to the session first.',
      }

  const clients = useMemo(() => uniqueClients(context.clients || []), [context.clients])
  const [drafts, setDrafts] = useState<BookingPayeeDraft[]>(() => normalizeDrafts(context))
  const [selectedClientId, setSelectedClientId] = useState<number | null>(() => clients[0]?.id ?? null)
  const [saving, setSaving] = useState(false)
  const [useSameCompanyForAll, setUseSameCompanyForAll] = useState(false)
  const [globalCompanySource, setGlobalCompanySource] = useState<CompanySource>('LINKED')
  const [globalCompanyId, setGlobalCompanyId] = useState<number | null>(() => context.linkedCompany?.id ?? null)
  const [globalCompanyDraft, setGlobalCompanyDraft] = useState<BookingPayeeDraft>({
    clientId: 0,
    payeeType: 'COMPANY',
    companyId: null,
    customData: true,
    companyName: '',
    address: '',
    city: '',
    postalCode: '',
    vatId: '',
    companyEmail: '',
  })

  useEffect(() => {
    const next = normalizeDrafts(context)
    setDrafts(next)
    setSelectedClientId((prev) => {
      if (prev && next.some((d) => d.clientId === prev)) return prev
      return next[0]?.clientId ?? null
    })
    if (context.linkedCompany?.id) setGlobalCompanyId(context.linkedCompany.id)
  }, [context])

  const activeCompanies = useMemo(() => (companies || []).filter((company) => company.active !== false), [companies])
  const linkedCompany = context.linkedCompany || null
  const selectedClient = clients.find((client) => client.id === selectedClientId) || clients[0] || null
  const selectedDraft = drafts.find((draft) => draft.clientId === selectedClient?.id) || null
  const selectedLinkedCompany = linkedCompanyForClient(selectedClient, linkedCompany)
  const selectedCompanyId = selectedDraft?.companyId ?? selectedLinkedCompany?.id ?? null
  const summaryMode = useSameCompanyForAll ? copy.oneCompanyForAll : copy.perClient

  const updateDraft = (clientId: number, patch: Partial<BookingPayeeDraft>) => {
    setDrafts((prev) => prev.map((draft) => (draft.clientId === clientId ? { ...draft, ...patch } : draft)))
  }

  const updateGlobalCompanyDraft = (patch: Partial<BookingPayeeDraft>) => {
    setGlobalCompanyDraft((prev) => ({ ...prev, ...patch, payeeType: 'COMPANY', customData: true, companyId: null }))
  }

  const buildGlobalPayees = (): BookingPayeeDraft[] => {
    if (globalCompanySource === 'LINKED') {
      const fallbackCompanyId = globalCompanyId || linkedCompany?.id || activeCompanies[0]?.id || null
      return clients.map((client) => ({
        ...drafts.find((draft) => draft.clientId === client.id),
        clientId: client.id,
        payeeType: 'COMPANY',
        companyId: fallbackCompanyId,
        customData: false,
      }))
    }
    return clients.map((client) => ({
      clientId: client.id,
      payeeType: 'COMPANY',
      companyId: null,
      customData: true,
      companyName: globalCompanyDraft.companyName || '',
      address: globalCompanyDraft.address || '',
      city: globalCompanyDraft.city || '',
      postalCode: globalCompanyDraft.postalCode || '',
      vatId: globalCompanyDraft.vatId || '',
      companyEmail: globalCompanyDraft.companyEmail || '',
    }))
  }

  const normalizePayeesForSave = (items: BookingPayeeDraft[]): BookingPayeeDraft[] => (
    items.map((item) => (
      item.payeeType === 'PERSON'
        ? {
            ...item,
            companyId: null,
            customData: false,
            firstName: null,
            lastName: null,
            email: null,
            companyName: null,
            address: null,
            city: null,
            postalCode: null,
            vatId: null,
            companyEmail: null,
          }
        : item
    ))
  )

  const save = async () => {
    setSaving(true)
    try {
      await onSave?.(normalizePayeesForSave(useSameCompanyForAll ? buildGlobalPayees() : drafts))
    } finally {
      setSaving(false)
    }
  }

  if (clients.length === 0) {
    return <div className="booking-payee-empty">{copy.noClients}</div>
  }

  const renderCompanyFields = (value: BookingPayeeDraft, onChange: (patch: Partial<BookingPayeeDraft>) => void, global = false) => (
    <div className="booking-payee-custom-fields booking-payee-company-fields">
      <label>
        <span>{copy.companyName}</span>
        <input value={value.companyName || ''} onChange={(e) => onChange({ companyName: e.target.value })} />
      </label>
      <label>
        <span>{copy.address}</span>
        <input value={value.address || ''} onChange={(e) => onChange({ address: e.target.value })} />
      </label>
      <div className="booking-payee-field-grid">
        <label>
          <span>{copy.city}</span>
          <input value={value.city || ''} onChange={(e) => onChange({ city: e.target.value })} />
        </label>
        <label>
          <span>{copy.postalCode}</span>
          <input value={value.postalCode || ''} onChange={(e) => onChange({ postalCode: e.target.value })} />
        </label>
      </div>
      <label>
        <span>{copy.vatId}</span>
        <input value={value.vatId || ''} onChange={(e) => onChange({ vatId: e.target.value })} />
      </label>
      <label>
        <span>{copy.email}</span>
        <input type="email" value={value.companyEmail || ''} onChange={(e) => onChange({ companyEmail: e.target.value })} />
        <small>{global ? copy.emailCompanyHelp : copy.emailCompanyHelp}</small>
      </label>
    </div>
  )

  return (
    <div className="booking-payee-panel">
      <section className="booking-payee-global-toggle">
        <div>
          <strong>{copy.useSameCompanyForAll}</strong>
          <p>{copy.useSameCompanyIntro}</p>
        </div>
        <button
          type="button"
          className={`modern-switch ${useSameCompanyForAll ? 'on' : ''}`}
          aria-pressed={useSameCompanyForAll}
          onClick={() => setUseSameCompanyForAll((prev) => !prev)}
        >
          <span />
        </button>
      </section>

      {useSameCompanyForAll && (
        <section className="booking-payee-global-options">
          <label className={`booking-payee-radio-card compact${globalCompanySource === 'LINKED' ? ' is-selected' : ''}`}>
            <input
              type="radio"
              checked={globalCompanySource === 'LINKED'}
              onChange={() => setGlobalCompanySource('LINKED')}
            />
            <span className="booking-payee-radio-dot" aria-hidden />
            <strong>{copy.linkedCompany}</strong>
            <select
              value={globalCompanyId ?? ''}
              onChange={(e) => setGlobalCompanyId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">{copy.noLinkedCompany}</option>
              {linkedCompany && !activeCompanies.some((company) => company.id === linkedCompany.id) && (
                <option value={linkedCompany.id}>{linkedCompany.name}</option>
              )}
              {activeCompanies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
          </label>

          <label className={`booking-payee-radio-card is-expanded${globalCompanySource === 'CUSTOM' ? ' is-selected' : ''}`}>
            <input
              type="radio"
              checked={globalCompanySource === 'CUSTOM'}
              onChange={() => setGlobalCompanySource('CUSTOM')}
            />
            <span className="booking-payee-radio-dot" aria-hidden />
            <div className="booking-payee-radio-main">
              <strong>{copy.addCustom}</strong>
              <small>{copy.globalCustomCompanyHint}</small>
              {globalCompanySource === 'CUSTOM' && renderCompanyFields(globalCompanyDraft, updateGlobalCompanyDraft, true)}
            </div>
          </label>
        </section>
      )}

      <section className="booking-payee-section">
        <h3>{copy.summary}</h3>
        <div className="booking-payee-summary-card">
          <div className="booking-payee-summary-icon" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.5 19c.7-3 2.3-4.5 4.5-4.5s3.8 1.5 4.5 4.5M11.5 19c.7-3 2.3-4.5 4.5-4.5s3.8 1.5 4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <span>{copy.selectedClients}</span>
            <strong>{clients.length}</strong>
          </div>
          <div>
            <span>{copy.payerSetting}</span>
            <strong>{summaryMode}</strong>
          </div>
          <span className="booking-payee-green-dot" aria-hidden>✓</span>
          <p>{useSameCompanyForAll ? copy.allUseCompany : copy.allUseOwn}</p>
          <button type="button" className="secondary booking-payee-edit-all" onClick={() => setUseSameCompanyForAll(true)}>
            {copy.editAll}
          </button>
        </div>
      </section>

      <div className={`booking-payee-master-detail${useSameCompanyForAll ? ' is-shared' : ''}`}>
        <section className="booking-payee-section booking-payee-client-list-section">
          <h3>{copy.clientList}</h3>
          <div className="booking-payee-client-list">
            {clients.map((client) => {
              const selected = client.id === selectedClient?.id
              return (
                <button
                  type="button"
                  key={client.id}
                  className={`booking-payee-client-row${selected ? ' is-selected' : ''}`}
                  onClick={() => setSelectedClientId(client.id)}
                  disabled={useSameCompanyForAll}
                >
                  <span className="booking-payee-avatar">{initials(client)}</span>
                  <span>
                    <strong>{fullName(client)}</strong>
                    <small>{copy.individual}</small>
                  </span>
                  <span className="booking-payee-row-arrow">›</span>
                </button>
              )
            })}
          </div>
          {useSameCompanyForAll && <p className="booking-payee-muted-note">ⓘ {copy.sharedClientNote}</p>}
        </section>

        {useSameCompanyForAll ? (
          <section className="booking-payee-section booking-payee-shared-summary">
            <h3>{copy.summary}</h3>
            <div className="booking-payee-shared-card">
              <span className="booking-payee-summary-icon" aria-hidden>▦</span>
              <div>
                <strong>{copy.oneCompanyForAll}</strong>
                <small>{copy.allUseCompany}</small>
              </div>
              <span className="booking-payee-green-dot" aria-hidden>✓</span>
              <button type="button" className="secondary" onClick={() => setUseSameCompanyForAll(true)}>{copy.editAll}</button>
              <div className="booking-payee-info">ⓘ {copy.info}</div>
            </div>
          </section>
        ) : (
          <section className="booking-payee-section booking-payee-settings-section">
            {selectedClient && selectedDraft && (
              <>
                <h3>{copy.settingsFor(fullName(selectedClient))}</h3>
                <label className="booking-payee-label">{copy.payerType}</label>
                <div className="booking-payee-segmented">
                  <button
                    type="button"
                    className={selectedDraft.payeeType === 'PERSON' ? 'is-selected' : ''}
                    onClick={() => updateDraft(selectedClient.id, {
                      payeeType: 'PERSON',
                      companyId: null,
                      customData: false,
                      firstName: null,
                      lastName: null,
                      email: null,
                      companyName: null,
                      address: null,
                      city: null,
                      postalCode: null,
                      vatId: null,
                      companyEmail: null,
                    })}
                  >
                    <span aria-hidden>♙</span>{copy.individual}
                  </button>
                  <button
                    type="button"
                    className={selectedDraft.payeeType === 'COMPANY' ? 'is-selected' : ''}
                    onClick={() => updateDraft(selectedClient.id, { payeeType: 'COMPANY', companyId: selectedCompanyId, customData: false })}
                  >
                    <span aria-hidden>▦</span>{copy.company}
                  </button>
                </div>
                <p className="booking-payee-tab-hint">{copy.companyPatternHint}</p>

                {selectedDraft.payeeType === 'COMPANY' && (
                  <div className="booking-payee-option-stack">
                    <label className={`booking-payee-radio-card${!selectedDraft.customData ? ' is-selected' : ''}`}>
                      <input
                        type="radio"
                        checked={!selectedDraft.customData}
                        onChange={() => updateDraft(selectedClient.id, { customData: false, companyId: selectedCompanyId })}
                      />
                      <span className="booking-payee-radio-dot" aria-hidden />
                      <span className="booking-payee-card-icon" aria-hidden>▦</span>
                      <div className="booking-payee-radio-main">
                        <span>{copy.linkedCompany}</span>
                        <strong>{companyLabel(selectedLinkedCompany, copy.noLinkedCompany)}</strong>
                        <small>{copy.useCompanyData}</small>
                        <select
                          value={selectedCompanyId ?? ''}
                          onChange={(e) => updateDraft(selectedClient.id, { companyId: e.target.value ? Number(e.target.value) : null })}
                        >
                          <option value="">{copy.noLinkedCompany}</option>
                          {selectedLinkedCompany && !activeCompanies.some((company) => company.id === selectedLinkedCompany.id) && (
                            <option value={selectedLinkedCompany.id}>{selectedLinkedCompany.name}</option>
                          )}
                          {activeCompanies.map((company) => (
                            <option key={company.id} value={company.id}>{company.name}</option>
                          ))}
                        </select>
                      </div>
                      <em>{copy.automatic}</em>
                    </label>

                    <label className={`booking-payee-radio-card is-expanded${selectedDraft.customData ? ' is-selected' : ''}`}>
                      <input
                        type="radio"
                        checked={!!selectedDraft.customData}
                        onChange={() => updateDraft(selectedClient.id, { customData: true, companyId: null })}
                      />
                      <span className="booking-payee-radio-dot" aria-hidden />
                      <div className="booking-payee-radio-main">
                        <strong>{copy.addCustom}</strong>
                        <small>{copy.customCompanyHint}</small>
                        {selectedDraft.customData && renderCompanyFields(selectedDraft, (patch) => updateDraft(selectedClient.id, patch))}
                      </div>
                    </label>
                  </div>
                )}

                <div className="booking-payee-info">ⓘ {copy.info}</div>
              </>
            )}
          </section>
        )}
      </div>

      {onSave && (
        <div className="booking-payee-actions">
          <button type="button" onClick={save} disabled={saving}>
            {saving ? copy.saving : copy.save}
          </button>
        </div>
      )}
    </div>
  )
}
