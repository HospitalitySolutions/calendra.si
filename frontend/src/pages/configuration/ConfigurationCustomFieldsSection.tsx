import { useEffect, useMemo, useState } from 'react'
import { api, getApiErrorMessage } from '../../api'
import type { CustomFieldAppliesTo, CustomFieldDefinition, CustomFieldType } from '../../lib/types'
import { useLocale } from '../../locale'

type CustomFieldDraft = {
  id?: number
  name: string
  appliesTo: CustomFieldAppliesTo
  fieldType: CustomFieldType
  required: boolean
  showInList: boolean
  sortOrder: number
  active: boolean
  optionsText: string
}

const appliesTabs: { id: CustomFieldAppliesTo; sl: string; en: string }[] = [
  { id: 'CLIENT', sl: 'Stranke', en: 'Clients' },
  { id: 'COMPANY', sl: 'Podjetja', en: 'Companies' },
  { id: 'GROUP', sl: 'Skupine', en: 'Groups' },
]

const fieldTypes: { id: CustomFieldType; sl: string; en: string }[] = [
  { id: 'TEXT', sl: 'Text', en: 'Text' },
  { id: 'LONG_TEXT', sl: 'Daljši text', en: 'Long text' },
  { id: 'NUMBER', sl: 'Številka', en: 'Number' },
  { id: 'DATE', sl: 'Datum', en: 'Date' },
  { id: 'CHECKBOX', sl: 'Kljukica', en: 'Checkbox' },
  { id: 'DROPDOWN', sl: 'Spustni seznam', en: 'Dropdown' },
  { id: 'MULTI_SELECT', sl: 'Več izbir', en: 'Multi-select' },
  { id: 'EMAIL', sl: 'E-pošta', en: 'Email' },
  { id: 'PHONE', sl: 'Telefon', en: 'Phone' },
]

function emptyDraft(appliesTo: CustomFieldAppliesTo): CustomFieldDraft {
  return {
    name: '',
    appliesTo,
    fieldType: 'TEXT',
    required: false,
    showInList: false,
    sortOrder: 0,
    active: true,
    optionsText: '',
  }
}

function optionsText(options: string[] | undefined): string {
  return (options ?? []).join('\n')
}

function parseOptionsText(text: string): string[] {
  return text
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index)
}

function typeLabel(type: CustomFieldType, locale: string): string {
  const row = fieldTypes.find((item) => item.id === type)
  return locale === 'sl' ? (row?.sl ?? type) : (row?.en ?? type)
}

export function ConfigurationCustomFieldsSection() {
  const { locale } = useLocale()
  const [activeTab, setActiveTab] = useState<CustomFieldAppliesTo>('CLIENT')
  const [fields, setFields] = useState<CustomFieldDefinition[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<CustomFieldDraft>(() => emptyDraft('CLIENT'))

  const copy = locale === 'sl'
    ? {
        title: 'Polja po meri',
        newField: 'Novo polje',
        fieldName: 'Ime polja',
        fieldType: 'Tip polja',
        required: 'Obvezno',
        showInList: 'Prikaži v seznamu',
        sortOrder: 'Vrstni red',
        active: 'Aktivno',
        options: 'Možnosti',
        optionsHint: 'Za spustni seznam ali več izbir vpišite eno možnost v vsako vrstico.',
        save: 'Shrani polje',
        update: 'Posodobi polje',
        cancel: 'Prekliči urejanje',
        emptyTitle: 'Ni dodanih polj po meri',
        emptyText: 'Dodajte prvo polje za izbrani razdelek.',
        inactive: 'Neaktivno',
        delete: 'Izbriši',
        edit: 'Uredi',
        confirmDelete: 'Izbrišem to polje po meri in njegove shranjene vrednosti?',
        loadError: 'Nalaganje polj po meri ni uspelo.',
        saveError: 'Shranjevanje polja po meri ni uspelo.',
        deleteError: 'Brisanje polja po meri ni uspelo.',
      }
    : {
        title: 'Custom fields',
        newField: 'New field',
        fieldName: 'Field name',
        fieldType: 'Field type',
        required: 'Required',
        showInList: 'Show in list',
        sortOrder: 'Sort order',
        active: 'Active',
        options: 'Options',
        optionsHint: 'For dropdown or multi-select, enter one option per line.',
        save: 'Save field',
        update: 'Update field',
        cancel: 'Cancel edit',
        emptyTitle: 'No custom fields yet',
        emptyText: 'Add the first field for the selected section.',
        inactive: 'Inactive',
        delete: 'Delete',
        edit: 'Edit',
        confirmDelete: 'Delete this custom field and its saved values?',
        loadError: 'Failed to load custom fields.',
        saveError: 'Failed to save custom field.',
        deleteError: 'Failed to delete custom field.',
      }

  const visibleFields = useMemo(
    () => fields.filter((field) => field.appliesTo === activeTab),
    [fields, activeTab],
  )

  const loadFields = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await api.get<CustomFieldDefinition[]>('/custom-fields')
      setFields(response.data ?? [])
    } catch {
      setError(copy.loadError)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadFields()
  }, [])

  useEffect(() => {
    setDraft((prev) => prev.id ? prev : emptyDraft(activeTab))
  }, [activeTab])

  const startEdit = (field: CustomFieldDefinition) => {
    setDraft({
      id: field.id,
      name: field.name ?? '',
      appliesTo: field.appliesTo,
      fieldType: field.fieldType ?? 'TEXT',
      required: field.required === true,
      showInList: field.showInList === true,
      sortOrder: field.sortOrder ?? 0,
      active: field.active !== false,
      optionsText: optionsText(field.options),
    })
    setActiveTab(field.appliesTo)
  }

  const resetDraft = () => setDraft(emptyDraft(activeTab))

  const submit = async () => {
    if (saving || !draft.name.trim()) return
    setSaving(true)
    setError('')
    const payload = {
      name: draft.name.trim(),
      appliesTo: draft.appliesTo,
      fieldType: draft.fieldType,
      required: draft.required,
      showInList: draft.showInList,
      sortOrder: Number.isFinite(Number(draft.sortOrder)) ? Number(draft.sortOrder) : 0,
      active: draft.active,
      options: parseOptionsText(draft.optionsText),
    }
    try {
      if (draft.id) {
        await api.put(`/custom-fields/${draft.id}`, payload)
      } else {
        await api.post('/custom-fields', payload)
      }
      resetDraft()
      await loadFields()
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, copy.saveError))
    } finally {
      setSaving(false)
    }
  }

  const deleteField = async (field: CustomFieldDefinition) => {
    if (!window.confirm(copy.confirmDelete)) return
    setError('')
    try {
      await api.delete(`/custom-fields/${field.id}`)
      if (draft.id === field.id) resetDraft()
      await loadFields()
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, copy.deleteError))
    }
  }

  const needsOptions = draft.fieldType === 'DROPDOWN' || draft.fieldType === 'MULTI_SELECT'

  return (
    <section className="custom-fields-settings">
      <style>{`
        .custom-fields-settings { width: min(100%, 1120px); display: grid; gap: 16px; }
        .custom-fields-card { background: #fff; border: 1px solid #dbe5f2; border-radius: 24px; box-shadow: 0 18px 50px rgba(18, 38, 63, .08); overflow: hidden; }
        .custom-fields-tabs { display: flex; gap: 8px; padding: 14px 16px 0; }
        .custom-fields-tab { border: 1px solid #dbe5f2; background: #f8fafc; color: #475569; border-radius: 12px; padding: 10px 14px; font-weight: 800; cursor: pointer; }
        .custom-fields-tab.active { background: #eaf2ff; border-color: #b8d2ff; color: #2167ff; box-shadow: 0 6px 16px rgba(33, 103, 255, .16); }
        .custom-fields-layout { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(320px, .8fr); gap: 18px; padding: 16px; }
        .custom-fields-list, .custom-fields-form { border: 1px solid #e2e8f0; border-radius: 18px; background: #fbfdff; padding: 14px; }
        .custom-fields-list-inner { display: grid; gap: 10px; }
        .custom-fields-row { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center; background: #fff; border: 1px solid #dbe5f2; border-radius: 16px; padding: 14px; }
        .custom-fields-row-title { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-weight: 900; color: #14213d; }
        .custom-fields-row-meta { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 8px; color: #64748b; font-size: 13px; }
        .custom-fields-pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 4px 8px; background: #eef4ff; color: #2167ff; font-weight: 800; font-size: 12px; }
        .custom-fields-pill--off { background: #f1f5f9; color: #64748b; }
        .custom-fields-actions { display: flex; gap: 8px; }
        .custom-fields-actions button, .custom-fields-form-actions button { border: 1px solid #dbe5f2; border-radius: 12px; background: #fff; color: #1f2a44; padding: 9px 12px; font-weight: 800; cursor: pointer; }
        .custom-fields-actions button.danger { color: #dc2626; border-color: #fecaca; background: #fff7f7; }
        .custom-fields-form h3 { margin: 0 0 14px; color: #14213d; }
        .custom-fields-grid { display: grid; gap: 12px; }
        .custom-fields-field { display: grid; gap: 6px; color: #334155; font-weight: 800; font-size: 13px; }
        .custom-fields-field input, .custom-fields-field select, .custom-fields-field textarea { width: 100%; border: 1px solid #d6e1f0; border-radius: 12px; background: #fff; min-height: 42px; padding: 10px 12px; color: #14213d; font: inherit; }
        .custom-fields-field textarea { min-height: 112px; resize: vertical; }
        .custom-fields-switches { display: grid; gap: 8px; }
        .custom-fields-check { display: flex; gap: 10px; align-items: center; color: #334155; font-weight: 800; }
        .custom-fields-check input { width: 18px; height: 18px; }
        .custom-fields-form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px; }
        .custom-fields-form-actions button.primary { background: #2167ff; color: white; border-color: #2167ff; box-shadow: 0 10px 22px rgba(33, 103, 255, .25); }
        .custom-fields-empty { border: 1px dashed #cbd5e1; border-radius: 16px; padding: 28px; color: #64748b; text-align: center; background: #fff; }
        .custom-fields-empty strong { display: block; color: #14213d; margin-bottom: 6px; }
        .custom-fields-error { border-radius: 14px; background: #fff1f2; border: 1px solid #fecdd3; color: #be123c; padding: 12px 14px; font-weight: 800; }
        @media (max-width: 880px) { .custom-fields-layout { grid-template-columns: 1fr; } .custom-fields-tabs { overflow-x: auto; } }
      `}</style>
      <div className="custom-fields-card">
        <div className="custom-fields-tabs" role="tablist" aria-label={copy.title}>
          {appliesTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? 'custom-fields-tab active' : 'custom-fields-tab'}
              onClick={() => setActiveTab(tab.id)}
            >
              {locale === 'sl' ? tab.sl : tab.en}
            </button>
          ))}
        </div>
        {error ? <div className="custom-fields-error" style={{ margin: '16px 16px 0' }}>{error}</div> : null}
        <div className="custom-fields-layout">
          <div className="custom-fields-list">
            {loading ? (
              <div className="custom-fields-empty">{locale === 'sl' ? 'Nalaganje…' : 'Loading…'}</div>
            ) : visibleFields.length === 0 ? (
              <div className="custom-fields-empty"><strong>{copy.emptyTitle}</strong>{copy.emptyText}</div>
            ) : (
              <div className="custom-fields-list-inner">
                {visibleFields.map((field) => (
                  <article key={field.id} className="custom-fields-row">
                    <div>
                      <div className="custom-fields-row-title">
                        {field.name}
                        <span className={field.active === false ? 'custom-fields-pill custom-fields-pill--off' : 'custom-fields-pill'}>
                          {field.active === false ? copy.inactive : copy.active}
                        </span>
                      </div>
                      <div className="custom-fields-row-meta">
                        <span>{typeLabel(field.fieldType, locale)}</span>
                        {field.required ? <span>{copy.required}</span> : null}
                        {field.showInList ? <span>{copy.showInList}</span> : null}
                        <span>{copy.sortOrder}: {field.sortOrder ?? 0}</span>
                      </div>
                    </div>
                    <div className="custom-fields-actions">
                      <button type="button" onClick={() => startEdit(field)}>{copy.edit}</button>
                      <button type="button" className="danger" onClick={() => void deleteField(field)}>{copy.delete}</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
          <div className="custom-fields-form">
            <h3>{draft.id ? copy.update : copy.newField}</h3>
            <div className="custom-fields-grid">
              <label className="custom-fields-field">
                {copy.fieldName}
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </label>
              <label className="custom-fields-field">
                {copy.fieldType}
                <select value={draft.fieldType} onChange={(e) => setDraft({ ...draft, fieldType: e.target.value as CustomFieldType })}>
                  {fieldTypes.map((type) => <option key={type.id} value={type.id}>{locale === 'sl' ? type.sl : type.en}</option>)}
                </select>
              </label>
              <label className="custom-fields-field">
                {copy.sortOrder}
                <input type="number" value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })} />
              </label>
              <div className="custom-fields-switches">
                <label className="custom-fields-check"><input type="checkbox" checked={draft.required} onChange={(e) => setDraft({ ...draft, required: e.target.checked })} /> {copy.required}</label>
                <label className="custom-fields-check"><input type="checkbox" checked={draft.showInList} onChange={(e) => setDraft({ ...draft, showInList: e.target.checked })} /> {copy.showInList}</label>
                <label className="custom-fields-check"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> {copy.active}</label>
              </div>
              {needsOptions ? (
                <label className="custom-fields-field">
                  {copy.options}
                  <textarea value={draft.optionsText} onChange={(e) => setDraft({ ...draft, optionsText: e.target.value })} placeholder={copy.optionsHint} />
                </label>
              ) : null}
            </div>
            <div className="custom-fields-form-actions">
              {draft.id ? <button type="button" onClick={resetDraft}>{copy.cancel}</button> : null}
              <button type="button" className="primary" disabled={saving || !draft.name.trim()} onClick={() => void submit()}>
                {saving ? (locale === 'sl' ? 'Shranjevanje…' : 'Saving…') : (draft.id ? copy.update : copy.save)}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
