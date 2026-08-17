import { useEffect, useMemo, useState } from 'react'
import { api, getApiErrorMessage } from '../api'
import { useAuthenticatedUser } from '../authUserContext'
import { useLocale } from '../locale'
import { PanelBody, PanelHeader, PanelTabs, SidePanel, useConfirm } from './panel'
import type {
  WorkspaceClient,
  WorkspaceClientActivity,
  WorkspaceClientActivityEvent,
  WorkspaceClientDuplicateCandidate,
  WorkspaceClientUnit,
} from '../lib/types'
import { formatDateTime } from '../lib/format'

type Props = {
  open: boolean
  onClose: () => void
  onChanged?: () => void | Promise<void>
}

type WorkspaceTab = 'search' | 'duplicates'

function name(client: Pick<WorkspaceClient, 'firstName' | 'lastName'>) {
  return `${client.firstName || ''} ${client.lastName || ''}`.trim()
}

function countTotal(client: WorkspaceClient, key: 'bookingCount' | 'invoiceCount' | 'messageCount' | 'noteCount' | 'fileCount') {
  return client.units.reduce((total, unit) => total + (unit[key] || 0), 0)
}

export function WorkspaceClientsPanel({ open, onClose, onChanged }: Props) {
  const { locale } = useLocale()
  const confirm = useConfirm()
  const user = useAuthenticatedUser()
  const copy = locale === 'sl' ? {
    title: 'Skupna baza strank',
    subtitle: 'Iskanje in aktivnosti strank v vseh lokacijah, do katerih imate dostop.',
    searchTab: 'Iskanje',
    duplicatesTab: 'Podvojene stranke',
    searchPlaceholder: 'Išči po imenu, e-pošti ali telefonu ...',
    loading: 'Nalaganje ...',
    noResults: 'Ni najdenih strank.',
    selectClient: 'Izberite stranko za prikaz aktivnosti.',
    units: 'Lokacije',
    activity: 'Aktivnost',
    bookings: 'Termini',
    invoices: 'Računi',
    messages: 'Sporočila',
    notes: 'Opombe',
    files: 'Datoteke',
    lastVisit: 'Zadnji termin',
    assigned: 'Odgovorna oseba',
    active: 'Aktivna',
    inactive: 'Neaktivna',
    unlink: 'Razdruži lokacijo',
    unlinkConfirm: 'Želite ta lokalni profil ločiti od skupne stranke? Termini, računi, datoteke in sporočila ostanejo v svoji lokaciji.',
    noActivity: 'Za dostopne lokacije še ni aktivnosti.',
    refresh: 'Poišči podvojene',
    refreshing: 'Pregledovanje ...',
    noDuplicates: 'Ni čakajočih predlogov za združitev.',
    sameEmail: 'Ista e-pošta',
    samePhone: 'Isti telefon',
    sameName: 'Isto ime',
    sameLastName: 'Isti priimek',
    useLeft: 'Uporabi levi profil',
    useRight: 'Uporabi desni profil',
    notDuplicate: 'Nista ista oseba',
    later: 'Preglej pozneje',
    mergeConfirm: 'Profila bosta povezana v eno skupno identiteto. Lokalni termini, računi, datoteke, opombe in sporočila se ne bodo premaknili. Nadaljujem?',
    score: 'Ujemanje',
    privacy: 'Opombe, datoteke in sporočila ostanejo vidni samo v izvorni lokaciji.',
    close: 'Zapri',
    failed: 'Dejanje ni uspelo.',
    created: (count: number) => count === 1 ? 'Najden je 1 nov predlog.' : `Najdenih je ${count} novih predlogov.`,
  } : locale === 'sr' ? {
    title: 'Zajednička baza klijenata',
    subtitle: 'Pretraga i pregled aktivnosti klijenata na svim lokacijama kojima imate pristup.',
    searchTab: 'Pretraga',
    duplicatesTab: 'Duplirani klijenti',
    searchPlaceholder: 'Pretraži po imenu, e-pošti ili telefonu ...',
    loading: 'Učitavanje ...',
    noResults: 'Nema pronađenih klijenata.',
    selectClient: 'Izaberite klijenta za prikaz aktivnosti.',
    units: 'Lokacije',
    activity: 'Aktivnost',
    bookings: 'Termini',
    invoices: 'Računi',
    messages: 'Poruke',
    notes: 'Beleške',
    files: 'Datoteke',
    lastVisit: 'Poslednji termin',
    assigned: 'Odgovorna osoba',
    active: 'Aktivna',
    inactive: 'Neaktivna',
    unlink: 'Odvoji lokaciju',
    unlinkConfirm: 'Želite li da odvojite ovaj lokalni profil od zajedničkog klijenta? Termini, računi, datoteke i poruke ostaju na svojoj lokaciji.',
    noActivity: 'Još nema aktivnosti na dostupnim lokacijama.',
    refresh: 'Pronađi duplikate',
    refreshing: 'Provera ...',
    noDuplicates: 'Nema predloga za spajanje koji čekaju pregled.',
    sameEmail: 'Ista e-pošta',
    samePhone: 'Isti telefon',
    sameName: 'Isto ime',
    sameLastName: 'Isto prezime',
    useLeft: 'Koristi levi profil',
    useRight: 'Koristi desni profil',
    notDuplicate: 'Nisu ista osoba',
    later: 'Pregledaj kasnije',
    mergeConfirm: 'Profili će biti povezani u jedan zajednički identitet. Lokalni termini, računi, datoteke, beleške i poruke neće biti premešteni. Nastaviti?',
    score: 'Podudaranje',
    privacy: 'Beleške, datoteke i poruke ostaju vidljive samo na izvornoj lokaciji.',
    close: 'Zatvori',
    failed: 'Radnja nije uspela.',
    created: (count: number) => count === 1 ? 'Pronađen je 1 novi predlog.' : `Pronađeno je ${count} novih predloga.`,
  } : {
    title: 'Shared client base',
    subtitle: 'Search and review client activity across every location you can access.',
    searchTab: 'Search',
    duplicatesTab: 'Duplicate review',
    searchPlaceholder: 'Search by name, email or phone ...',
    loading: 'Loading ...',
    noResults: 'No clients found.',
    selectClient: 'Select a client to view activity.',
    units: 'Locations',
    activity: 'Activity',
    bookings: 'Bookings',
    invoices: 'Invoices',
    messages: 'Messages',
    notes: 'Notes',
    files: 'Files',
    lastVisit: 'Last booking',
    assigned: 'Assigned to',
    active: 'Active',
    inactive: 'Inactive',
    unlink: 'Unlink location',
    unlinkConfirm: 'Separate this local profile from the shared client? Bookings, invoices, files and messages remain in their original location.',
    noActivity: 'There is no activity in the accessible locations yet.',
    refresh: 'Find duplicates',
    refreshing: 'Scanning ...',
    noDuplicates: 'There are no pending duplicate suggestions.',
    sameEmail: 'Same email',
    samePhone: 'Same phone',
    sameName: 'Same name',
    sameLastName: 'Same last name',
    useLeft: 'Use left profile',
    useRight: 'Use right profile',
    notDuplicate: 'Not the same person',
    later: 'Review later',
    mergeConfirm: 'These profiles will be linked to one shared identity. Their local bookings, invoices, files, notes and messages will not move. Continue?',
    score: 'Match',
    privacy: 'Notes, files and messages remain visible only in their originating location.',
    close: 'Close',
    failed: 'The action failed.',
    created: (count: number) => count === 1 ? 'Found 1 new suggestion.' : `Found ${count} new suggestions.`,
  }

  const [tab, setTab] = useState<WorkspaceTab>('search')
  const [query, setQuery] = useState('')
  const [clients, setClients] = useState<WorkspaceClient[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [activity, setActivity] = useState<WorkspaceClientActivity | null>(null)
  const [activityLoading, setActivityLoading] = useState(false)
  const [duplicates, setDuplicates] = useState<WorkspaceClientDuplicateCandidate[]>([])
  const [duplicatesLoading, setDuplicatesLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [actionId, setActionId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const unitNames = useMemo(() => {
    const map = new Map<number, string>()
    activity?.client.units.forEach((unit) => map.set(unit.unitId, unit.unitName))
    return map
  }, [activity])

  useEffect(() => {
    if (!open || tab !== 'search') return
    const timer = window.setTimeout(() => void loadClients(query), 220)
    return () => window.clearTimeout(timer)
  }, [open, query, tab])

  useEffect(() => {
    if (!open || tab !== 'duplicates') return
    void loadDuplicates()
  }, [open, tab])

  useEffect(() => {
    if (!open || selectedId == null) {
      setActivity(null)
      return
    }
    void loadActivity(selectedId)
  }, [open, selectedId])

  async function loadClients(search: string) {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get<WorkspaceClient[]>('/workspace-clients/search', {
        params: { search: search.trim() || undefined, size: 150 },
      })
      const rows = data ?? []
      setClients(rows)
      setSelectedId((current) => current != null && rows.some((row) => row.id === current)
        ? current
        : rows[0]?.id ?? null)
    } catch (cause) {
      setError(getApiErrorMessage(cause, copy.failed))
      setClients([])
    } finally {
      setLoading(false)
    }
  }

  async function loadActivity(id: number) {
    setActivityLoading(true)
    setError('')
    try {
      const { data } = await api.get<WorkspaceClientActivity>(`/workspace-clients/${id}/activity`, { params: { limit: 250 } })
      setActivity(data)
    } catch (cause) {
      setError(getApiErrorMessage(cause, copy.failed))
      setActivity(null)
    } finally {
      setActivityLoading(false)
    }
  }

  async function loadDuplicates() {
    setDuplicatesLoading(true)
    setError('')
    try {
      const { data } = await api.get<WorkspaceClientDuplicateCandidate[]>('/workspace-clients/duplicates')
      setDuplicates(data ?? [])
    } catch (cause) {
      setError(getApiErrorMessage(cause, copy.failed))
      setDuplicates([])
    } finally {
      setDuplicatesLoading(false)
    }
  }

  async function refreshDuplicates() {
    setRefreshing(true)
    setError('')
    setNotice('')
    try {
      const { data } = await api.post<{ createdCandidates: number }>('/workspace-clients/duplicates/refresh')
      setNotice(copy.created(data?.createdCandidates ?? 0))
      await loadDuplicates()
    } catch (cause) {
      setError(getApiErrorMessage(cause, copy.failed))
    } finally {
      setRefreshing(false)
    }
  }

  async function merge(candidate: WorkspaceClientDuplicateCandidate, targetWorkspaceClientId: number) {
    if (!(await confirm({ title: copy.mergeConfirm }))) return
    setActionId(candidate.id)
    setError('')
    try {
      await api.post(`/workspace-clients/duplicates/${candidate.id}/merge`, { targetWorkspaceClientId })
      await Promise.all([loadDuplicates(), loadClients(query)])
      await onChanged?.()
    } catch (cause) {
      setError(getApiErrorMessage(cause, copy.failed))
    } finally {
      setActionId(null)
    }
  }

  async function review(candidate: WorkspaceClientDuplicateCandidate, status: 'NOT_DUPLICATE' | 'DEFERRED') {
    setActionId(candidate.id)
    setError('')
    try {
      await api.post(`/workspace-clients/duplicates/${candidate.id}/review`, { status })
      await loadDuplicates()
    } catch (cause) {
      setError(getApiErrorMessage(cause, copy.failed))
    } finally {
      setActionId(null)
    }
  }

  async function unlink(client: WorkspaceClient, unit: WorkspaceClientUnit) {
    if (!(await confirm({ title: copy.unlinkConfirm, tone: 'danger' }))) return
    setActionId(unit.clientId)
    setError('')
    try {
      await api.post(`/workspace-clients/${client.id}/unit-clients/${unit.clientId}/unlink`)
      await loadClients(query)
      await onChanged?.()
    } catch (cause) {
      setError(getApiErrorMessage(cause, copy.failed))
    } finally {
      setActionId(null)
    }
  }

  if (!open) return null

  return (
    <SidePanel open onClose={onClose} ariaLabel={copy.title} size="xl">
      <PanelHeader
        title={copy.title}
        subtitle={copy.subtitle}
        onClose={onClose}
        closeLabel={copy.close}
      />
      <PanelTabs
        label={copy.title}
        activeId={tab}
        onSelect={(id) => setTab(id as WorkspaceTab)}
        tabs={[
          { id: 'search', label: copy.searchTab },
          { id: 'duplicates', label: duplicates.length > 0 ? `${copy.duplicatesTab} (${duplicates.length})` : copy.duplicatesTab },
        ]}
      />
      <PanelBody>
        {error && <div className="workspace-clients-alert workspace-clients-alert--error">{error}</div>}
        {notice && <div className="workspace-clients-alert workspace-clients-alert--success">{notice}</div>}

        {tab === 'search' ? (
          <div className="workspace-clients-search-layout">
            <aside className="workspace-clients-results">
              <label className="workspace-clients-search-field">
                <span aria-hidden>⌕</span>
                <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.searchPlaceholder} />
              </label>
              <div className="workspace-clients-result-list">
                {loading ? <div className="workspace-clients-empty">{copy.loading}</div> : clients.length === 0 ? (
                  <div className="workspace-clients-empty">{copy.noResults}</div>
                ) : clients.map((client) => (
                  <button key={client.id} type="button" className={`workspace-client-result${selectedId === client.id ? ' active' : ''}`} onClick={() => setSelectedId(client.id)}>
                    <strong>{name(client)}</strong>
                    <span>{client.email || client.phone || '—'}</span>
                    <small>{client.units.map((unit) => unit.unitName).join(' · ')}</small>
                  </button>
                ))}
              </div>
            </aside>

            <main className="workspace-clients-detail">
              {activityLoading ? <div className="workspace-clients-empty">{copy.loading}</div> : !activity ? (
                <div className="workspace-clients-empty">{copy.selectClient}</div>
              ) : (
                <>
                  <div className="workspace-client-profile">
                    <div className="workspace-client-avatar">{activity.client.firstName?.[0] || ''}{activity.client.lastName?.[0] || ''}</div>
                    <div>
                      <h3>{name(activity.client)}</h3>
                      <p>{[activity.client.email, activity.client.phone].filter(Boolean).join(' · ') || '—'}</p>
                    </div>
                  </div>

                  <div className="workspace-client-totals">
                    <Stat label={copy.bookings} value={countTotal(activity.client, 'bookingCount')} />
                    <Stat label={copy.invoices} value={countTotal(activity.client, 'invoiceCount')} />
                    <Stat label={copy.messages} value={countTotal(activity.client, 'messageCount')} />
                    <Stat label={copy.notes} value={countTotal(activity.client, 'noteCount')} />
                    <Stat label={copy.files} value={countTotal(activity.client, 'fileCount')} />
                  </div>

                  <section className="workspace-client-section">
                    <div className="workspace-client-section-title"><h4>{copy.units}</h4><span>{activity.client.units.length}</span></div>
                    <div className="workspace-client-unit-grid">
                      {activity.client.units.map((unit) => (
                        <article key={unit.clientId} className="workspace-client-unit-card">
                          <div className="workspace-client-unit-card__header">
                            <strong>{unit.unitName}</strong>
                            <span className={unit.active ? 'active' : ''}>{unit.active ? copy.active : copy.inactive}</span>
                          </div>
                          <dl>
                            <div><dt>{copy.bookings}</dt><dd>{unit.bookingCount}</dd></div>
                            <div><dt>{copy.invoices}</dt><dd>{unit.invoiceCount}</dd></div>
                            <div><dt>{copy.messages}</dt><dd>{unit.messageCount}</dd></div>
                            <div><dt>{copy.notes}</dt><dd>{unit.noteCount}</dd></div>
                            <div><dt>{copy.files}</dt><dd>{unit.fileCount}</dd></div>
                            <div><dt>{copy.lastVisit}</dt><dd>{unit.lastBookingAt ? formatDateTime(unit.lastBookingAt) : '—'}</dd></div>
                            <div><dt>{copy.assigned}</dt><dd>{unit.assignedToName || '—'}</dd></div>
                          </dl>
                          {activity.client.units.length > 1 && user.units?.some((membership) => membership.id === unit.unitId && (membership.role === 'ADMIN' || membership.role === 'SUPER_ADMIN')) && (
                            <button type="button" className="workspace-client-unlink" disabled={actionId === unit.clientId} onClick={() => void unlink(activity.client, unit)}>{copy.unlink}</button>
                          )}
                        </article>
                      ))}
                    </div>
                  </section>

                  <section className="workspace-client-section">
                    <div className="workspace-client-section-title"><h4>{copy.activity}</h4><span>{activity.events.length}</span></div>
                    <p className="workspace-client-privacy">{copy.privacy}</p>
                    {activity.events.length === 0 ? <div className="workspace-clients-empty">{copy.noActivity}</div> : (
                      <div className="workspace-client-timeline">
                        {activity.events.map((event) => <ActivityRow key={`${event.type}-${event.id}`} event={event} unitName={unitNames.get(event.unitId) || String(event.unitId)} />)}
                      </div>
                    )}
                  </section>
                </>
              )}
            </main>
          </div>
        ) : (
          <div className="workspace-duplicate-review">
            <div className="workspace-duplicate-toolbar">
              <div>
                <h3>{copy.duplicatesTab}</h3>
                <p>{copy.privacy}</p>
              </div>
              <button type="button" className="workspace-duplicate-refresh" disabled={refreshing} onClick={() => void refreshDuplicates()}>{refreshing ? copy.refreshing : copy.refresh}</button>
            </div>
            {duplicatesLoading ? <div className="workspace-clients-empty">{copy.loading}</div> : duplicates.length === 0 ? (
              <div className="workspace-clients-empty">{copy.noDuplicates}</div>
            ) : (
              <div className="workspace-duplicate-list">
                {duplicates.map((candidate) => (
                  <article key={candidate.id} className="workspace-duplicate-card">
                    <div className="workspace-duplicate-score"><strong>{candidate.score}%</strong><span>{copy.score}</span></div>
                    <div className="workspace-duplicate-reasons">
                      {candidate.reasons.map((reason) => <span key={reason}>{reasonLabel(reason, copy)}</span>)}
                    </div>
                    <div className="workspace-duplicate-compare">
                      <CandidateSide client={candidate.left} />
                      <div className="workspace-duplicate-divider" aria-hidden>↔</div>
                      <CandidateSide client={candidate.right} />
                    </div>
                    <div className="workspace-duplicate-actions">
                      <button type="button" disabled={actionId === candidate.id} onClick={() => void merge(candidate, candidate.left.id)}>{copy.useLeft}</button>
                      <button type="button" disabled={actionId === candidate.id} onClick={() => void merge(candidate, candidate.right.id)}>{copy.useRight}</button>
                      <button type="button" className="secondary" disabled={actionId === candidate.id} onClick={() => void review(candidate, 'NOT_DUPLICATE')}>{copy.notDuplicate}</button>
                      <button type="button" className="secondary" disabled={actionId === candidate.id} onClick={() => void review(candidate, 'DEFERRED')}>{copy.later}</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </PanelBody>
    </SidePanel>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div><strong>{value}</strong><span>{label}</span></div>
}

function ActivityRow({ event, unitName }: { event: WorkspaceClientActivityEvent; unitName: string }) {
  return (
    <article className={`workspace-client-event workspace-client-event--${event.type.toLowerCase()}`}>
      <div className="workspace-client-event__icon">{eventIcon(event.type)}</div>
      <div className="workspace-client-event__main">
        <strong>{event.title}</strong>
        <span>{unitName}{event.detail ? ` · ${event.detail}` : ''}</span>
      </div>
      <time>{event.occurredAt ? formatDateTime(event.occurredAt) : '—'}</time>
    </article>
  )
}

function CandidateSide({ client }: { client: WorkspaceClient }) {
  return (
    <div className="workspace-duplicate-side">
      <strong>{name(client)}</strong>
      <span>{client.email || '—'}</span>
      <span>{client.phone || '—'}</span>
      <small>{client.units.map((unit) => unit.unitName).join(' · ')}</small>
    </div>
  )
}

function eventIcon(type: string) {
  if (type === 'BOOKING') return '◷'
  if (type === 'INVOICE') return '€'
  if (type === 'FILE') return '▤'
  if (type === 'NOTE') return '✎'
  return '✉'
}

function reasonLabel(reason: string, copy: {
  sameEmail: string
  samePhone: string
  sameName: string
  sameLastName: string
}) {
  if (reason === 'SAME_EMAIL') return copy.sameEmail
  if (reason === 'SAME_PHONE') return copy.samePhone
  if (reason === 'SAME_NAME') return copy.sameName
  if (reason === 'SAME_LAST_NAME') return copy.sameLastName
  return reason
}
