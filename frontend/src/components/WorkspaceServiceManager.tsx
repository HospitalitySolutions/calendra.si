import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import type {
  ConfigurationCopyCategory,
  ConfigurationCopyPreview,
  SessionType,
  WorkspaceServiceTemplate,
} from '../lib/types'
import './WorkspaceServiceManager.css'

type UnitOption = { id: number; name: string; current: boolean }
type CopyHistoryItem = {
  id: number
  sourceCompanyId: number
  sourceCompanyName: string
  targetCompanyId: number
  targetCompanyName: string
  actorName?: string | null
  categoriesJson: string
  resultJson: string
  createdAt: string
}
type Props = {
  open: boolean
  onClose: () => void
  sessionTypes: SessionType[]
  currentUnitId?: number
  locale: string
  onChanged: () => Promise<void> | void
}

type TemplateDraft = {
  id?: number
  name: string
  description: string
  defaultDurationMinutes: string
  color: string
  icon: string
  bookingInstructions: string
  active: boolean
}

const EMPTY_DRAFT: TemplateDraft = {
  name: '',
  description: '',
  defaultDurationMinutes: '60',
  color: '#D7DFF0',
  icon: '',
  bookingInstructions: '',
  active: true,
}

const COPY_CATEGORIES: ConfigurationCopyCategory[] = [
  'SERVICES',
  'WORKING_HOURS',
  'BOOKING_RULES',
  'NOTIFICATION_TEMPLATES',
  'CUSTOM_FIELDS',
  'LOCATIONS_AND_SPACES',
  'PAYMENT_METHODS',
  'INVOICE_SETTINGS',
]

function categoryLabel(category: ConfigurationCopyCategory, sl: boolean): string {
  const labels: Record<ConfigurationCopyCategory, [string, string]> = {
    SERVICES: ['Storitve in cene', 'Services and prices'],
    WORKING_HOURS: ['Delovni čas', 'Working hours'],
    BOOKING_RULES: ['Pravila rezervacij', 'Booking rules'],
    NOTIFICATION_TEMPLATES: ['Predloge obvestil', 'Notification templates'],
    CUSTOM_FIELDS: ['Polja po meri', 'Custom fields'],
    LOCATIONS_AND_SPACES: ['Lokacije in prostori', 'Locations and rooms'],
    PAYMENT_METHODS: ['Načini plačila', 'Payment methods'],
    INVOICE_SETTINGS: ['Nastavitve računov', 'Invoice settings'],
  }
  return labels[category][sl ? 0 : 1]
}

export function WorkspaceServiceManager({
  open,
  onClose,
  sessionTypes,
  currentUnitId,
  locale,
  onChanged,
}: Props) {
  const sl = locale === 'sl'
  const [tab, setTab] = useState<'catalog' | 'copy'>('catalog')
  const [templates, setTemplates] = useState<WorkspaceServiceTemplate[]>([])
  const [units, setUnits] = useState<UnitOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<TemplateDraft | null>(null)
  const [linkTemplateId, setLinkTemplateId] = useState<number | null>(null)
  const [linkSessionTypeId, setLinkSessionTypeId] = useState('')
  const [applyDefaults, setApplyDefaults] = useState(true)
  const [sourceUnitId, setSourceUnitId] = useState<number | null>(currentUnitId ?? null)
  const [targetUnitId, setTargetUnitId] = useState<number | null>(null)
  const [categories, setCategories] = useState<ConfigurationCopyCategory[]>(['SERVICES'])
  const [overwrite, setOverwrite] = useState(false)
  const [preview, setPreview] = useState<ConfigurationCopyPreview | null>(null)
  const [copyHistory, setCopyHistory] = useState<CopyHistoryItem[]>([])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [templateRes, unitRes, historyRes] = await Promise.all([
        api.get<WorkspaceServiceTemplate[]>('/workspace-service-templates'),
        api.get<UnitOption[]>('/configuration-copy/units'),
        api.get<CopyHistoryItem[]>('/configuration-copy/history'),
      ])
      setTemplates(templateRes.data || [])
      setCopyHistory(historyRes.data || [])
      const nextUnits = unitRes.data || []
      setUnits(nextUnits)
      const current = nextUnits.find((unit) => unit.current)
      setSourceUnitId((value) => value ?? current?.id ?? nextUnits[0]?.id ?? null)
      setTargetUnitId((value) => value ?? nextUnits.find((unit) => unit.id !== (current?.id ?? currentUnitId))?.id ?? null)
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || (sl ? 'Nalaganje ni uspelo.' : 'Loading failed.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) void load()
  }, [open])

  const selectedTemplateOfferingIds = useMemo(() => new Set(
    templates.find((template) => template.id === linkTemplateId)?.offerings
      .filter((offering) => currentUnitId == null || offering.companyId === currentUnitId)
      .map((offering) => offering.sessionTypeId) || [],
  ), [currentUnitId, linkTemplateId, templates])

  const linkableTypes = sessionTypes.filter((type) => !selectedTemplateOfferingIds.has(type.id))

  if (!open) return null

  const saveTemplate = async () => {
    if (!draft?.name.trim()) return
    setLoading(true)
    setError('')
    try {
      const payload = {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        defaultDurationMinutes: draft.defaultDurationMinutes ? Number(draft.defaultDurationMinutes) : null,
        color: draft.color.trim() || null,
        icon: draft.icon.trim() || null,
        bookingInstructions: draft.bookingInstructions.trim() || null,
        active: draft.active,
      }
      if (draft.id) await api.put(`/workspace-service-templates/${draft.id}`, payload)
      else await api.post('/workspace-service-templates', payload)
      setDraft(null)
      await load()
      await onChanged()
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || (sl ? 'Shranjevanje ni uspelo.' : 'Save failed.'))
    } finally {
      setLoading(false)
    }
  }

  const linkOffering = async () => {
    if (!linkTemplateId || !linkSessionTypeId) return
    setLoading(true)
    setError('')
    try {
      await api.post(`/workspace-service-templates/${linkTemplateId}/link`, {
        sessionTypeId: Number(linkSessionTypeId),
        applySharedDefaults: applyDefaults,
      })
      setLinkTemplateId(null)
      setLinkSessionTypeId('')
      await load()
      await onChanged()
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || (sl ? 'Povezava ni uspela.' : 'Linking failed.'))
    } finally {
      setLoading(false)
    }
  }

  const syncOffering = async (templateId: number, sessionTypeId: number) => {
    setLoading(true)
    setError('')
    try {
      await api.post(`/workspace-service-templates/${templateId}/sync/${sessionTypeId}`)
      await load()
      await onChanged()
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || (sl ? 'Sinhronizacija ni uspela.' : 'Sync failed.'))
    } finally {
      setLoading(false)
    }
  }

  const unlinkOffering = async (templateId: number, sessionTypeId: number) => {
    setLoading(true)
    setError('')
    try {
      await api.delete(`/workspace-service-templates/${templateId}/link/${sessionTypeId}`)
      await load()
      await onChanged()
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || (sl ? 'Prekinitev povezave ni uspela.' : 'Unlink failed.'))
    } finally {
      setLoading(false)
    }
  }

  const requestBody = {
    sourceCompanyId: sourceUnitId,
    targetCompanyId: targetUnitId,
    categories,
    overwriteExisting: overwrite,
  }

  const previewCopy = async () => {
    if (!sourceUnitId || !targetUnitId) return
    setLoading(true)
    setError('')
    try {
      const res = await api.post<ConfigurationCopyPreview>('/configuration-copy/preview', requestBody)
      setPreview(res.data)
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || (sl ? 'Predogled ni uspel.' : 'Preview failed.'))
    } finally {
      setLoading(false)
    }
  }

  const executeCopy = async () => {
    if (!preview || preview.summary.incompatibleCount > 0) return
    setLoading(true)
    setError('')
    try {
      await api.post('/configuration-copy/execute', requestBody)
      setPreview(null)
      await load()
      await onChanged()
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || (sl ? 'Kopiranje ni uspelo.' : 'Copy failed.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="workspace-services-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="workspace-services-modal" role="dialog" aria-modal="true" aria-label={sl ? 'Skupne storitve' : 'Workspace services'}>
        <header className="workspace-services-header">
          <div>
            <h2>{sl ? 'Skupne storitve in kopiranje nastavitev' : 'Workspace services and configuration copy'}</h2>
            <p>{sl ? 'Povežite enake storitve med enotami brez združevanja lokalnih cen in pravil.' : 'Link equivalent services across units without merging local pricing and rules.'}</p>
          </div>
          <button type="button" className="workspace-services-close" onClick={onClose} aria-label={sl ? 'Zapri' : 'Close'}>×</button>
        </header>

        <div className="workspace-services-tabs">
          <button type="button" className={tab === 'catalog' ? 'active' : ''} onClick={() => setTab('catalog')}>{sl ? 'Skupni katalog' : 'Workspace catalog'}</button>
          <button type="button" className={tab === 'copy' ? 'active' : ''} onClick={() => setTab('copy')}>{sl ? 'Kopiraj nastavitve' : 'Copy configuration'}</button>
        </div>

        {error && <div className="workspace-services-error">{error}</div>}
        {loading && <div className="workspace-services-loading">{sl ? 'Obdelava ...' : 'Working ...'}</div>}

        {tab === 'catalog' ? (
          <div className="workspace-services-body">
            <div className="workspace-services-toolbar">
              <div>
                <strong>{sl ? 'Storitve na ravni delovnega prostora' : 'Workspace-level services'}</strong>
                <span>{templates.length}</span>
              </div>
              <button type="button" onClick={() => setDraft({ ...EMPTY_DRAFT })}>{sl ? '+ Nova skupna storitev' : '+ New workspace service'}</button>
            </div>
            <div className="workspace-services-list">
              {templates.map((template) => (
                <article key={template.id} className="workspace-service-card">
                  <div className="workspace-service-card-main">
                    <span className="workspace-service-swatch" style={{ background: template.color || '#D7DFF0' }} />
                    <div>
                      <h3>{template.name}</h3>
                      <p>{template.description || (sl ? 'Brez skupnega opisa' : 'No shared description')}</p>
                      <div className="workspace-service-meta">
                        <span>{template.defaultDurationMinutes ? `${template.defaultDurationMinutes} min` : (sl ? 'Lokalno trajanje' : 'Local duration')}</span>
                        <span>{template.offerings.length} {sl ? 'povezav' : 'offerings'}</span>
                        <span>{sl ? 'Skrbnik' : 'Owner'}: {template.ownerCompanyName}</span>
                        {!template.active && <span>{sl ? 'Neaktivna' : 'Inactive'}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="workspace-service-actions">
                    <button type="button" onClick={() => setDraft({
                      id: template.id,
                      name: template.name,
                      description: template.description || '',
                      defaultDurationMinutes: template.defaultDurationMinutes == null ? '' : String(template.defaultDurationMinutes),
                      color: template.color || '#D7DFF0',
                      icon: template.icon || '',
                      bookingInstructions: template.bookingInstructions || '',
                      active: template.active,
                    })}>{sl ? 'Uredi' : 'Edit'}</button>
                    <button type="button" onClick={() => setLinkTemplateId(template.id)}>{sl ? 'Poveži lokalno storitev' : 'Link unit service'}</button>
                  </div>
                  <div className="workspace-service-offerings">
                    {template.offerings.map((offering) => (
                      <div key={offering.sessionTypeId}>
                        <strong>{offering.companyName}</strong>
                        <span>{offering.description || offering.code}</span>
                        <span>{offering.durationMinutes ? `${offering.durationMinutes} min` : '—'}</span>
                        <span>{offering.availableAllLocations
                          ? (sl ? 'Vse lokacije' : 'All locations')
                          : (offering.locationNames.length > 0 ? offering.locationNames.join(', ') : (sl ? 'Brez lokacije' : 'No location'))}</span>
                        {(currentUnitId == null || offering.companyId === currentUnitId) && (
                          <span className="workspace-service-offering-actions">
                            <button type="button" onClick={() => syncOffering(template.id, offering.sessionTypeId)}>{sl ? 'Uskladi' : 'Sync'}</button>
                            <button type="button" onClick={() => unlinkOffering(template.id, offering.sessionTypeId)}>{sl ? 'Odveži' : 'Unlink'}</button>
                          </span>
                        )}
                      </div>
                    ))}
                    {template.offerings.length === 0 && <em>{sl ? 'Še ni povezana z nobeno enoto.' : 'Not linked to any unit yet.'}</em>}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="workspace-services-body workspace-copy-body">
            <div className="workspace-copy-grid">
              <label>{sl ? 'Izvorna enota' : 'Source unit'}
                <select value={sourceUnitId ?? ''} onChange={(e) => {
                  const nextSourceId = Number(e.target.value)
                  setSourceUnitId(nextSourceId)
                  setTargetUnitId((currentTargetId) => currentTargetId === nextSourceId
                    ? units.find((unit) => unit.id !== nextSourceId)?.id ?? null
                    : currentTargetId)
                  setPreview(null)
                }}>
                  {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                </select>
              </label>
              <label>{sl ? 'Ciljna enota' : 'Target unit'}
                <select value={targetUnitId ?? ''} onChange={(e) => { setTargetUnitId(Number(e.target.value)); setPreview(null) }}>
                  {units.filter((unit) => unit.id !== sourceUnitId).map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                </select>
              </label>
            </div>
            <div className="workspace-copy-categories">
              {COPY_CATEGORIES.map((category) => (
                <label key={category}>
                  <input type="checkbox" checked={categories.includes(category)} onChange={(e) => {
                    setPreview(null)
                    setCategories((current) => e.target.checked ? [...current, category] : current.filter((item) => item !== category))
                  }} />
                  <span>{categoryLabel(category, sl)}</span>
                </label>
              ))}
            </div>
            <label className="workspace-copy-overwrite">
              <input type="checkbox" checked={overwrite} onChange={(e) => { setOverwrite(e.target.checked); setPreview(null) }} />
              <span>{sl ? 'Posodobi obstoječe ciljne nastavitve' : 'Update existing target configuration'}</span>
            </label>
            <div className="workspace-copy-actions">
              <button type="button" onClick={previewCopy} disabled={!sourceUnitId || !targetUnitId || categories.length === 0}>{sl ? 'Prikaži predogled' : 'Preview changes'}</button>
              <button type="button" className="primary" onClick={executeCopy} disabled={!preview || preview.summary.incompatibleCount > 0}>{sl ? 'Izvedi kopiranje' : 'Copy configuration'}</button>
            </div>
            {preview && (
              <div className="workspace-copy-preview">
                <div className="workspace-copy-summary">
                  <span className="create">{sl ? 'Ustvari' : 'Create'}: {preview.summary.createCount}</span>
                  <span className="update">{sl ? 'Posodobi' : 'Update'}: {preview.summary.updateCount}</span>
                  <span className="skip">{sl ? 'Preskoči' : 'Skip'}: {preview.summary.skipCount}</span>
                  <span className="incompatible">{sl ? 'Nezdružljivo' : 'Incompatible'}: {preview.summary.incompatibleCount}</span>
                </div>
                <div className="workspace-copy-items">
                  {preview.items.map((item, index) => (
                    <div key={`${item.category}-${item.key}-${index}`} className={`workspace-copy-item action-${item.action.toLowerCase()}`}>
                      <span>{item.action}</span>
                      <div><strong>{item.label}</strong><small>{categoryLabel(item.category, sl)} · {item.reason}</small></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {copyHistory.length > 0 && (
              <div className="workspace-copy-history">
                <h3>{sl ? 'Zgodovina kopiranja' : 'Copy history'}</h3>
                {copyHistory.slice(0, 10).map((entry) => (
                  <div key={entry.id}>
                    <strong>{entry.sourceCompanyName} → {entry.targetCompanyName}</strong>
                    <span>{new Date(entry.createdAt).toLocaleString(locale)}</span>
                    {entry.actorName && <small>{entry.actorName}</small>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {draft && (
          <div className="workspace-services-submodal">
            <div className="workspace-services-submodal-card">
              <h3>{draft.id ? (sl ? 'Uredi skupno storitev' : 'Edit workspace service') : (sl ? 'Nova skupna storitev' : 'New workspace service')}</h3>
              <label>{sl ? 'Ime' : 'Name'}<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
              <label>{sl ? 'Opis' : 'Description'}<textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
              <div className="workspace-copy-grid">
                <label>{sl ? 'Privzeto trajanje' : 'Default duration'}<input type="number" min="1" max="1440" value={draft.defaultDurationMinutes} onChange={(e) => setDraft({ ...draft, defaultDurationMinutes: e.target.value })} /></label>
                <label>{sl ? 'Barva' : 'Color'}<input type="color" value={draft.color || '#D7DFF0'} onChange={(e) => setDraft({ ...draft, color: e.target.value })} /></label>
              </div>
              <label>{sl ? 'Ikona (neobvezno)' : 'Icon (optional)'}<input value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} placeholder={sl ? 'npr. scissors' : 'e.g. scissors'} /></label>
              <label>{sl ? 'Navodila za rezervacijo' : 'Booking instructions'}<textarea value={draft.bookingInstructions} onChange={(e) => setDraft({ ...draft, bookingInstructions: e.target.value })} /></label>
              <label className="workspace-copy-overwrite"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /><span>{sl ? 'Aktivna' : 'Active'}</span></label>
              <div className="workspace-copy-actions"><button type="button" onClick={() => setDraft(null)}>{sl ? 'Prekliči' : 'Cancel'}</button><button type="button" className="primary" onClick={saveTemplate}>{sl ? 'Shrani' : 'Save'}</button></div>
            </div>
          </div>
        )}

        {linkTemplateId != null && (
          <div className="workspace-services-submodal">
            <div className="workspace-services-submodal-card">
              <h3>{sl ? 'Poveži storitev trenutne enote' : 'Link current-unit service'}</h3>
              <label>{sl ? 'Lokalna storitev' : 'Unit service'}
                <select value={linkSessionTypeId} onChange={(e) => setLinkSessionTypeId(e.target.value)}>
                  <option value="">—</option>
                  {linkableTypes.map((type) => <option key={type.id} value={type.id}>{type.description || type.name}</option>)}
                </select>
              </label>
              <label className="workspace-copy-overwrite"><input type="checkbox" checked={applyDefaults} onChange={(e) => setApplyDefaults(e.target.checked)} /><span>{sl ? 'Uporabi skupno ime, trajanje in barvo' : 'Apply shared name, duration and color'}</span></label>
              <div className="workspace-copy-actions"><button type="button" onClick={() => setLinkTemplateId(null)}>{sl ? 'Prekliči' : 'Cancel'}</button><button type="button" className="primary" onClick={linkOffering}>{sl ? 'Poveži' : 'Link'}</button></div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
