import { DesktopSelect } from '../../components/DesktopSelect'
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

function normalizeDraft(draft: CustomFieldDraft) {
  return JSON.stringify({
    id: draft.id ?? null,
    name: draft.name.trim(),
    appliesTo: draft.appliesTo,
    fieldType: draft.fieldType,
    required: draft.required,
    showInList: draft.showInList,
    sortOrder: Number.isFinite(Number(draft.sortOrder)) ? Number(draft.sortOrder) : 0,
    active: draft.active,
    optionsText: draft.optionsText.trim(),
  })
}

export function ConfigurationCustomFieldsSection() {
  const { locale } = useLocale()
  const [activeTab, setActiveTab] = useState<CustomFieldAppliesTo>('CLIENT')
  const [fields, setFields] = useState<CustomFieldDefinition[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<CustomFieldDraft>(() => emptyDraft('CLIENT'))
  const [baselineDraft, setBaselineDraft] = useState<CustomFieldDraft>(() => emptyDraft('CLIENT'))

  const copy = locale === 'sl'
    ? {
        title: 'Polja po meri',
        newField: 'Novo polje',
        fieldName: 'Ime polja',
        fieldNamePlaceholder: 'Vnesite ime',
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
        loading: 'Nalaganje…',
        confirmDelete: 'Izbrišem to polje po meri in njegove shranjene vrednosti?',
        loadError: 'Nalaganje polj po meri ni uspelo.',
        saveError: 'Shranjevanje polja po meri ni uspelo.',
        deleteError: 'Brisanje polja po meri ni uspelo.',
      }
    : {
        title: 'Custom fields',
        newField: 'New field',
        fieldName: 'Field name',
        fieldNamePlaceholder: 'Enter name',
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
        loading: 'Loading…',
        confirmDelete: 'Delete this custom field and its saved values?',
        loadError: 'Failed to load custom fields.',
        saveError: 'Failed to save custom field.',
        deleteError: 'Failed to delete custom field.',
      }

  const visibleFields = useMemo(
    () => fields.filter((field) => field.appliesTo === activeTab),
    [fields, activeTab],
  )

  const tabCounts = useMemo<Record<CustomFieldAppliesTo, number>>(
    () => ({
      CLIENT: fields.filter((field) => field.appliesTo === 'CLIENT').length,
      COMPANY: fields.filter((field) => field.appliesTo === 'COMPANY').length,
      GROUP: fields.filter((field) => field.appliesTo === 'GROUP').length,
    }),
    [fields],
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
    if (draft.id) return
    const next = emptyDraft(activeTab)
    setDraft(next)
    setBaselineDraft(next)
  }, [activeTab])

  const startEdit = (field: CustomFieldDefinition) => {
    const nextDraft: CustomFieldDraft = {
      id: field.id,
      name: field.name ?? '',
      appliesTo: field.appliesTo,
      fieldType: field.fieldType ?? 'TEXT',
      required: field.required === true,
      showInList: field.showInList === true,
      sortOrder: field.sortOrder ?? 0,
      active: field.active !== false,
      optionsText: optionsText(field.options),
    }
    setDraft(nextDraft)
    setBaselineDraft(nextDraft)
    setActiveTab(field.appliesTo)
  }

  const resetDraft = () => {
    const next = emptyDraft(activeTab)
    setDraft(next)
    setBaselineDraft(next)
  }

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
  const isDirty = useMemo(() => normalizeDraft(draft) !== normalizeDraft(baselineDraft), [draft, baselineDraft])

  return (
    <section className="custom-fields-settings">
      <style>{`
        .custom-fields-settings {
          --cf-blue: #2167ff;
          --cf-blue-dark: #1d4ed8;
          --cf-blue-soft: #eaf2ff;
          --cf-border: #dbe5f2;
          --cf-border-strong: #cbd8ea;
          --cf-text: #14213d;
          --cf-muted: #64748b;
          --cf-surface: #ffffff;
          width: min(100%, 1120px);
          display: grid;
          gap: 18px;
        }
        .custom-fields-mobile-tabs-wrap {
          display: none;
        }
        .custom-fields-card {
          background: #fff;
          border: 1px solid var(--cf-border);
          border-radius: 24px;
          box-shadow: 0 18px 50px rgba(18, 38, 63, .08);
          overflow: hidden;
        }
        .custom-fields-tabs {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 16px 0;
          border-bottom: 1px solid #edf2f7;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .custom-fields-tabs::-webkit-scrollbar {
          display: none;
        }
        .custom-fields-tab {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          min-height: 44px;
          padding: 10px 14px;
          border: 0;
          border-radius: 10px;
          background: transparent;
          color: #334155;
          font-weight: 700;
          font-size: 15px;
          line-height: 1.2;
          cursor: pointer;
          font: inherit;
          box-shadow: none;
          white-space: nowrap;
          transition: color .18s ease, background .18s ease, box-shadow .18s ease;
          flex: 0 0 auto;
        }
        .custom-fields-tab:hover {
          background: #ffffff;
          color: #0f172a;
          box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.22), 0 6px 16px rgba(15, 23, 42, 0.08);
        }
        .custom-fields-tab.active {
          background: var(--cf-blue-soft);
          color: var(--cf-blue);
          box-shadow: inset 0 0 0 1px rgba(37, 99, 235, .16), 0 3px 10px rgba(37, 99, 235, .18);
        }
        .custom-fields-tab-count {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 24px;
          height: 24px;
          padding: 0 7px;
          border-radius: 999px;
          background: #eef2f6;
          color: #475467;
          font-size: 12px;
          font-weight: 800;
          line-height: 1;
        }
        .custom-fields-tab.active .custom-fields-tab-count {
          background: #dbe9ff;
          color: var(--cf-blue);
        }
        .custom-fields-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.08fr) minmax(320px, .92fr);
          gap: 18px;
          padding: 16px;
        }
        .custom-fields-list,
        .custom-fields-form {
          border: 1px solid #e2e8f0;
          border-radius: 22px;
          background: #fbfdff;
          padding: 18px;
          min-width: 0;
        }
        .custom-fields-list-inner {
          display: grid;
          gap: 10px;
        }
        .custom-fields-row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 12px;
          align-items: center;
          background: #fff;
          border: 1px solid var(--cf-border);
          border-radius: 16px;
          padding: 14px;
        }
        .custom-fields-row-title {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
          font-weight: 900;
          color: var(--cf-text);
        }
        .custom-fields-row-meta {
          margin-top: 6px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          color: var(--cf-muted);
          font-size: 13px;
        }
        .custom-fields-pill {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 4px 8px;
          background: #eef4ff;
          color: var(--cf-blue);
          font-weight: 800;
          font-size: 12px;
        }
        .custom-fields-pill--off {
          background: #f1f5f9;
          color: var(--cf-muted);
        }
        .custom-fields-actions {
          display: flex;
          gap: 8px;
        }
        .custom-fields-actions button,
        .custom-fields-form-actions button,
        .custom-fields-form-heading button {
          border: 1px solid var(--cf-border);
          border-radius: 12px;
          background: #fff;
          color: #1f2a44;
          padding: 9px 12px;
          font-weight: 800;
          font: inherit;
          cursor: pointer;
        }
        .custom-fields-actions button.danger {
          color: #dc2626;
          border-color: #fecaca;
          background: #fff7f7;
        }
        .custom-fields-form-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }
        .custom-fields-form h3 {
          margin: 0;
          color: var(--cf-text);
          font-size: clamp(26px, 2.4vw, 34px);
          line-height: 1.12;
          font-weight: 900;
        }
        .custom-fields-grid {
          display: grid;
          gap: 14px;
        }
        .custom-fields-field {
          display: grid;
          gap: 8px;
          color: var(--cf-text);
          font-weight: 800;
          font-size: 13px;
        }
        .custom-fields-field input,
        .custom-fields-field select,
        .custom-fields-field textarea {
          width: 100%;
          border: 1px solid var(--cf-border-strong);
          border-radius: 18px;
          background: #fff;
          min-height: 56px;
          padding: 14px 16px;
          color: var(--cf-text);
          font: inherit;
          font-size: 18px;
          line-height: 1.25;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.85);
          appearance: none;
          -webkit-appearance: none;
        }
        .custom-fields-field select {
          background-image: linear-gradient(45deg, transparent 50%, #64748b 50%), linear-gradient(135deg, #64748b 50%, transparent 50%);
          background-position: calc(100% - 24px) calc(50% - 4px), calc(100% - 16px) calc(50% - 4px);
          background-size: 8px 8px, 8px 8px;
          background-repeat: no-repeat;
          padding-right: 46px;
        }
        .custom-fields-field textarea {
          min-height: 120px;
          resize: vertical;
        }
        .custom-fields-switches {
          display: grid;
          gap: 14px;
          padding-top: 2px;
        }
        .custom-fields-check {
          display: flex;
          gap: 12px;
          align-items: center;
          color: var(--cf-text);
          font-weight: 500;
          font-size: 18px;
          line-height: 1.35;
        }
        .custom-fields-check input {
          width: 18px;
          height: 18px;
          accent-color: var(--cf-blue);
          flex: 0 0 auto;
        }
        .custom-fields-form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 18px;
        }
        .custom-fields-form-actions button.primary,
        .custom-fields-mobile-savebar button {
          background: var(--cf-blue);
          color: white;
          border-color: var(--cf-blue);
          box-shadow: 0 10px 22px rgba(33, 103, 255, .25);
        }
        .custom-fields-empty {
          border: 1px dashed var(--cf-border-strong);
          border-radius: 20px;
          padding: 32px 24px;
          color: var(--cf-muted);
          text-align: center;
          background: #fff;
        }
        .custom-fields-empty strong {
          display: block;
          color: var(--cf-text);
          margin-bottom: 6px;
          font-size: 18px;
        }
        .custom-fields-error {
          border-radius: 14px;
          background: #fff1f2;
          border: 1px solid #fecdd3;
          color: #be123c;
          padding: 12px 14px;
          font-weight: 800;
        }
        .custom-fields-mobile-savebar {
          display: none;
        }
        @media (max-width: 1024px) {
          .custom-fields-settings {
            width: 100%;
            gap: 14px;
            padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px));
            background: #ffffff;
          }
          .custom-fields-mobile-tabs-wrap {
            display: block;
            position: -webkit-sticky;
            position: sticky;
            top: var(--calendar-shell-header-sticky-below, 62px);
            z-index: 190;
            width: 100%;
            margin: -1px 0 0;
            background: linear-gradient(180deg, #1f79ff 0%, #1565ee 100%);
            box-shadow: 0 2px 0 rgba(255,255,255,.12) inset;
          }
          .custom-fields-tabs {
            display: none;
          }
          .custom-fields-mobile-tabs {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 0;
            align-items: stretch;
            min-height: 66px;
          }
          .custom-fields-mobile-tab {
            position: relative;
            border: 0;
            background: transparent;
            color: rgba(255,255,255,.82);
            font: inherit;
            font-weight: 800;
            font-size: 18px;
            padding: 18px 10px 16px;
            cursor: pointer;
          }
          .custom-fields-mobile-tab.active {
            color: #ffffff;
          }
          .custom-fields-mobile-tab.active::after {
            content: '';
            position: absolute;
            left: 14px;
            right: 14px;
            bottom: 0;
            height: 5px;
            border-radius: 999px 999px 0 0;
            background: rgba(255,255,255,.96);
          }
          .custom-fields-card {
            width: 100%;
            background: transparent;
            border: 0;
            box-shadow: none;
            overflow: visible;
          }
          .custom-fields-layout {
            grid-template-columns: 1fr;
            gap: 14px;
            padding: 0;
          }
          .custom-fields-list {
            margin: 0 14px;
            border-radius: 24px;
            padding: 18px 16px;
            background: #ffffff;
            box-shadow: 0 12px 28px rgba(15, 23, 42, .07);
          }
          .custom-fields-form {
            width: 100%;
            margin: 0;
            border-left: 0;
            border-right: 0;
            border-radius: 0;
            padding: 20px 16px;
            background: #ffffff;
            box-shadow: none;
          }
          .custom-fields-row {
            grid-template-columns: 1fr;
          }
          .custom-fields-actions {
            justify-content: flex-end;
          }
          .custom-fields-form-heading {
            align-items: flex-start;
            gap: 10px;
          }
          .custom-fields-form h3 {
            font-size: 28px;
          }
          .custom-fields-field {
            font-size: 16px;
            gap: 10px;
          }
          .custom-fields-field input,
          .custom-fields-field select,
          .custom-fields-field textarea {
            min-height: 52px;
            padding: 12px 14px;
            border-radius: 16px;
            font-size: 16px;
          }
          .custom-fields-switches {
            gap: 12px;
          }
          .custom-fields-check {
            font-size: 17px;
          }
          .custom-fields-form-actions {
            display: none;
          }
          .custom-fields-mobile-savebar {
            display: flex;
            position: fixed;
            left: max(12px, env(safe-area-inset-left, 0px) + 12px);
            right: max(12px, env(safe-area-inset-right, 0px) + 12px);
            bottom: max(12px, env(safe-area-inset-bottom, 0px) + 8px);
            z-index: 80;
            pointer-events: none;
          }
          .custom-fields-mobile-savebar button {
            width: 100%;
            min-height: 58px;
            border-radius: 18px;
            border: 1px solid var(--cf-blue);
            font: inherit;
            font-size: 18px;
            font-weight: 900;
            pointer-events: auto;
          }
        }
        @media (max-width: 680px) {
          .custom-fields-mobile-tabs {
            min-height: 60px;
          }
          .custom-fields-mobile-tab {
            font-size: 16px;
            padding: 16px 8px 14px;
          }
          .custom-fields-list {
            border-radius: 22px;
          }
          .custom-fields-form {
            border-radius: 0;
          }
          .custom-fields-empty {
            padding: 24px 18px;
          }
          .custom-fields-actions {
            width: 100%;
          }
          .custom-fields-actions button {
            flex: 1 1 0;
          }
        }
      `}</style>

      <div className="custom-fields-mobile-tabs-wrap" role="tablist" aria-label={copy.title}>
        <div className="custom-fields-mobile-tabs">
          {appliesTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? 'custom-fields-mobile-tab active' : 'custom-fields-mobile-tab'}
              onClick={() => setActiveTab(tab.id)}
            >
              {locale === 'sl' ? tab.sl : tab.en}
            </button>
          ))}
        </div>
      </div>

      <div className="custom-fields-card">
        <div className="custom-fields-tabs desktop-standard-tabs" role="tablist" aria-label={copy.title}>
          {appliesTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={activeTab === tab.id ? 'custom-fields-tab desktop-standard-tab active' : 'custom-fields-tab desktop-standard-tab'}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="desktop-standard-tab__label">{locale === 'sl' ? tab.sl : tab.en}</span>
              <strong className="custom-fields-tab-count desktop-standard-tab__count">{tabCounts[tab.id]}</strong>
            </button>
          ))}
        </div>

        {error ? <div className="custom-fields-error" style={{ margin: '16px 16px 0' }}>{error}</div> : null}

        <div className="custom-fields-layout">
          <div className="custom-fields-list">
            {loading ? (
              <div className="custom-fields-empty">{copy.loading}</div>
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
            <div className="custom-fields-form-heading">
              <h3>{draft.id ? copy.update : copy.newField}</h3>
              {draft.id ? <button type="button" onClick={resetDraft}>{copy.cancel}</button> : null}
            </div>
            <div className="custom-fields-grid">
              <label className="custom-fields-field">
                {copy.fieldName}
                <input
                  value={draft.name}
                  placeholder={copy.fieldNamePlaceholder}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <label className="custom-fields-field">
                {copy.fieldType}
                <DesktopSelect value={draft.fieldType} onChange={(e) => setDraft({ ...draft, fieldType: e.target.value as CustomFieldType })}>
                  {fieldTypes.map((type) => <option key={type.id} value={type.id}>{locale === 'sl' ? type.sl : type.en}</option>)}
                </DesktopSelect>
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

      {isDirty ? (
        <div className="custom-fields-mobile-savebar">
          <button type="button" disabled={saving || !draft.name.trim()} onClick={() => void submit()}>
            {saving ? (locale === 'sl' ? 'Shranjevanje…' : 'Saving…') : (draft.id ? copy.update : copy.save)}
          </button>
        </div>
      ) : null}
    </section>
  )
}
