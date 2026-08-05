import type { FormEvent, ReactNode } from 'react'

export type SimpleClientCreateField = 'firstName' | 'lastName' | 'email' | 'phone'
export type SimpleClientCreateDraft = Partial<Record<SimpleClientCreateField, string>>

type SimpleClientCreateLabels = Record<SimpleClientCreateField, string>

export function SimpleClientCreatePage({
  title,
  closeLabel,
  submitLabel,
  savingLabel,
  draft,
  labels,
  saving = false,
  submitDisabled = false,
  keyboardOpen = false,
  error,
  inputNamePrefix = 'calendra-new-client',
  onClose,
  onChange,
  onSubmit,
  children,
}: {
  title: string
  closeLabel: string
  submitLabel: string
  savingLabel: string
  draft: SimpleClientCreateDraft
  labels: SimpleClientCreateLabels
  saving?: boolean
  submitDisabled?: boolean
  keyboardOpen?: boolean
  error?: string | null
  inputNamePrefix?: string
  onClose: () => void
  onChange: (field: SimpleClientCreateField, value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  children?: ReactNode
}) {
  const fields: Array<{ key: SimpleClientCreateField; type: 'text' | 'email' | 'tel'; wide?: boolean }> = [
    { key: 'firstName', type: 'text' },
    { key: 'lastName', type: 'text' },
    { key: 'email', type: 'email', wide: true },
    { key: 'phone', type: 'tel', wide: true },
  ]

  return (
    <form
      className={`clients-create-modal-form clients-simple-create-form${keyboardOpen ? ' clients-simple-create-form--keyboard-open' : ''}`}
      autoComplete="off"
      onSubmit={onSubmit}
    >
      <div className="clients-simple-create-header">
        <button type="button" className="clients-simple-create-close" onClick={onClose} aria-label={closeLabel}>
          ×
        </button>
        <h2>{title}</h2>
      </div>
      <div className="clients-simple-create-body">
        <div className="clients-detail-shell clients-create-shell clients-simple-create-shell">
          <div className="clients-detail-fields clients-create-fields clients-simple-create-fields">
            {fields.map(({ key, type, wide }) => {
              const required = key === 'firstName' || key === 'lastName'
              const label = labels[key]
              return (
                <label key={key} className={`clients-detail-field-card clients-create-field${wide ? ' clients-detail-field-card--wide' : ''}`}>
                  <span>{label}{required ? ' *' : ''}</span>
                  <input
                    autoFocus={key === 'firstName'}
                    required={required}
                    type={type}
                    name={`${inputNamePrefix}-${key}`}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize={required ? 'words' : 'none'}
                    spellCheck={false}
                    inputMode={type === 'email' ? 'email' : type === 'tel' ? 'tel' : 'text'}
                    enterKeyHint={key === 'phone' ? 'done' : 'next'}
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                    value={String(draft[key] ?? '')}
                    placeholder={`${label}${required ? ' *' : ''}`}
                    onChange={(event) => onChange(key, event.target.value)}
                  />
                </label>
              )
            })}
            {children}
          </div>
          {error ? <div className="error">{error}</div> : null}
          {!keyboardOpen ? (
            <button type="submit" className="clients-gapp-save-button clients-simple-create-submit" disabled={submitDisabled}>
              {saving ? savingLabel : submitLabel}
            </button>
          ) : null}
        </div>
      </div>
    </form>
  )
}
