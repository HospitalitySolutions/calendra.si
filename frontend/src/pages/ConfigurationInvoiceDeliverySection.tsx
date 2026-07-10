import type { AppLocale } from '../locale'
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction, type SVGProps } from 'react'

type Props = {
  settings: Record<string, string>
  setSettings: Dispatch<SetStateAction<Record<string, string>>>
  savingSettings: boolean
  onSave: () => Promise<void> | void
  t: (key: string) => string
  locale: AppLocale
}

const ENABLED_KEY = 'INVOICE_DELIVERY_EMAIL_ENABLED'
const SUBJECT_KEY = 'INVOICE_DELIVERY_EMAIL_SUBJECT'
const BODY_KEY = 'INVOICE_DELIVERY_EMAIL_BODY'

const TOKEN_OPTIONS: Array<{ token: string; label: Record<AppLocale, string> }> = [
  { token: '{{guestName}}', label: { en: 'Guest name', sl: 'Ime gosta', sr: 'Ime gosta' } },
  { token: '{{invoiceNumber}}', label: { en: 'Invoice number', sl: 'Številka računa', sr: 'Broj računa' } },
  { token: '{{invoiceDate}}', label: { en: 'Invoice date', sl: 'Datum računa', sr: 'Datum računa' } },
  { token: '{{dueDate}}', label: { en: 'Due date', sl: 'Datum zapadlosti', sr: 'Datum dospeća' } },
  { token: '{{amount}}', label: { en: 'Amount', sl: 'Znesek', sr: 'Iznos' } },
  { token: '{{companyName}}', label: { en: 'Company name', sl: 'Ime podjetja', sr: 'Naziv kompanije' } },
  { token: '{{guestEmail}}', label: { en: 'Guest email', sl: 'E-pošta gosta', sr: 'E-pošta gosta' } },
  { token: '{{reservationNumber}}', label: { en: 'Reservation number', sl: 'Številka rezervacije', sr: 'Broj rezervacije' } },
  { token: '{{propertyName}}', label: { en: 'Property name', sl: 'Ime lokacije', sr: 'Naziv lokacije' } },
  { token: '{{propertyAddress}}', label: { en: 'Property address', sl: 'Naslov lokacije', sr: 'Adresa lokacije' } },
  { token: '{{paymentLink}}', label: { en: 'Payment link', sl: 'Povezava za plačilo', sr: 'Link za plaćanje' } },
  { token: '{{companyEmail}}', label: { en: 'Company email', sl: 'E-pošta podjetja', sr: 'E-pošta kompanije' } },
  { token: '{{companyPhone}}', label: { en: 'Company phone', sl: 'Telefon podjetja', sr: 'Telefon kompanije' } },
  { token: '{{physicalFullAddress}}', label: { en: 'Physical address', sl: 'Fizični naslov', sr: 'Fizička adresa' } },
  { token: '{{physicalAddress}}', label: { en: 'Physical street address', sl: 'Fizični naslov – ulica', sr: 'Fizička adresa – ulica' } },
  { token: '{{physicalPostalCode}}', label: { en: 'Physical postal code', sl: 'Fizična poštna številka', sr: 'Fizički poštanski broj' } },
  { token: '{{physicalCity}}', label: { en: 'Physical city', sl: 'Fizično mesto', sr: 'Fizički grad' } },
  { token: '{{physicalCountry}}', label: { en: 'Physical country', sl: 'Fizična država', sr: 'Fizička država' } },
  { token: '{{companyWebsite}}', label: { en: 'Company website', sl: 'Spletna stran podjetja', sr: 'Veb-sajt kompanije' } },
]

const DEFAULT_SUBJECT = 'Invoice {{invoiceNumber}} from {{companyName}}'
const DEFAULT_BODY = `Hello {{guestName}},

Your invoice {{invoiceNumber}} dated {{invoiceDate}} is attached.
Amount due: {{amount}}
Due date: {{dueDate}}

Thank you,
{{companyName}}`

const Ico = (props: SVGProps<SVGSVGElement>) => (
  <svg
    width={18}
    height={18}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    {...props}
  />
)

function IconEye() {
  return (
    <Ico>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Ico>
  )
}

function IconLink() {
  return (
    <Ico>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </Ico>
  )
}

function IconListBullet() {
  return (
    <Ico>
      <circle cx="5.5" cy="6" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="5.5" cy="18" r="1.4" fill="currentColor" stroke="none" />
      <line x1="10" x2="21" y1="6" y2="6" />
      <line x1="10" x2="21" y1="12" y2="12" />
      <line x1="10" x2="21" y1="18" y2="18" />
    </Ico>
  )
}

function IconListNumbered() {
  return (
    <Ico>
      <line x1="10" x2="21" y1="6" y2="6" />
      <line x1="10" x2="21" y1="12" y2="12" />
      <line x1="10" x2="21" y1="18" y2="18" />
      <path d="M4 6h1v4" />
      <path d="M4 10h2" />
      <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
    </Ico>
  )
}

function IconQuote() {
  return (
    <Ico>
      <path d="M3 21c3 0 5-2 5-5v-4H4V8c0-2 1-3 3-3" />
      <path d="M14 21c3 0 5-2 5-5v-4h-4V8c0-2 1-3 3-3" />
    </Ico>
  )
}

function IconReset() {
  return (
    <Ico>
      <path d="M3 12a9 9 0 1 0 3-6.708" />
      <path d="M3 4v6h6" />
    </Ico>
  )
}

function IconSave() {
  return (
    <Ico>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </Ico>
  )
}

/** Same control as Guest App → Payment methods (`GuestSwitch` / `.gapp-switch`). */
function InvoiceDeliveryGuestSwitch({
  checked,
  onChange,
  onLabel,
  offLabel,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  onLabel: string
  offLabel: string
}) {
  return (
    <button
      type="button"
      className={checked ? 'invoice-delivery-guest-switch active' : 'invoice-delivery-guest-switch'}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
    >
      <span className="invoice-delivery-guest-switch-knob" />
      <span className="invoice-delivery-guest-switch-label">{checked ? onLabel : offLabel}</span>
    </button>
  )
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function templateBodyToEditorHtml(raw: string) {
  if (/<[a-z][\s\S]*>/i.test(raw)) return raw
  return escapeHtml(raw).replace(/\n/g, '<br>')
}

function htmlToPlainText(raw: string) {
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/blockquote>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim()
}

export function ConfigurationInvoiceDeliverySection({
  settings,
  setSettings,
  savingSettings,
  onSave,
  t,
  locale,
}: Props) {
  const [preview, setPreview] = useState(false)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const subject = settings[SUBJECT_KEY] || DEFAULT_SUBJECT
  const body = settings[BODY_KEY] || DEFAULT_BODY
  const enabled = settings[ENABLED_KEY] !== 'false'

  useEffect(() => {
    if (preview) return
    const element = bodyRef.current
    if (!element || document.activeElement === element) return
    const expected = templateBodyToEditorHtml(body)
    if (element.innerHTML !== expected) element.innerHTML = expected
  }, [body, preview])

  const syncBodyFromEditor = () => {
    const element = bodyRef.current
    if (!element) return
    setSettings((prev) => ({ ...prev, [BODY_KEY]: element.innerHTML || '' }))
  }

  const execBodyCommand = (command: string, value?: string) => {
    const element = bodyRef.current
    if (!element) return
    element.focus()
    try {
      document.execCommand(command, false, value)
    } catch {
      // ignore browser execCommand failures
    }
    syncBodyFromEditor()
  }

  const insertToken = (token: string) => execBodyCommand('insertText', token)

  const insertLink = () => {
    const url = window.prompt('URL')
    if (url) execBodyCommand('createLink', url)
  }

  const setEnabled = (next: boolean) => {
    setSettings((prev) => ({ ...prev, [ENABLED_KEY]: next ? 'true' : 'false' }))
  }

  const previewText = useMemo(() => {
    const replacements: Record<string, string> = {
      '{{guestName}}': 'Maja Novak',
      '{{invoiceNumber}}': 'INV-2026-0012',
      '{{invoiceDate}}': '2026-05-08',
      '{{dueDate}}': '2026-05-23',
      '{{amount}}': 'EUR 61.00',
      '{{companyName}}': 'Calendra',
      '{{guestEmail}}': 'maja.novak@example.com',
      '{{reservationNumber}}': 'RES-1042',
      '{{propertyName}}': '2TEN',
      '{{propertyAddress}}': 'Slovenska cesta 1, Ljubljana',
      '{{paymentLink}}': 'https://pay.example.com/inv-2026-0012',
      '{{companyEmail}}': 'billing@calendra.si',
      '{{companyPhone}}': '+386 40 000 000',
      '{{physicalFullAddress}}': 'Cesta v Mestni log 55, 1000 Ljubljana, Slovenija',
      '{{physicalAddress}}': 'Cesta v Mestni log 55',
      '{{physicalPostalCode}}': '1000',
      '{{physicalCity}}': 'Ljubljana',
      '{{physicalCountry}}': 'Slovenija',
      '{{companyWebsite}}': 'calendra.si',
    }
    return Object.entries(replacements).reduce((text, [token, value]) => text.split(token).join(value), htmlToPlainText(body))
  }, [body])

  const saveLabel = savingSettings
    ? t('formSaving')
    : locale === 'sr'
      ? 'Sačuvaj izmene'
      : locale === 'sl'
        ? 'Shrani spremembe'
        : 'Save changes'
  const normalLabel = locale === 'sr' ? 'Normalno' : locale === 'sl' ? 'Normalno' : 'Normal'
  const headingLabel = locale === 'sr' ? 'Naslov' : locale === 'sl' ? 'Naslov' : 'Heading'
  const quoteLabel = locale === 'sr' ? 'Citat' : locale === 'sl' ? 'Citat' : 'Quote'
  const toolbarLabel = locale === 'sr' ? 'Traka sa alatkama predloška' : locale === 'sl' ? 'Orodna vrstica predloge' : 'Template toolbar'
  const underlineLabel = locale === 'sr' ? 'Podvučeno' : locale === 'sl' ? 'Podčrtano' : 'Underline'

  return (
    <div className="invoice-delivery-modern-card">
      <style>{`
        .invoice-delivery-modern-card {
          --invoice-blue: #0f62fe;
          --invoice-blue-2: #1d78ff;
          --invoice-ink: #061942;
          --invoice-muted: #667395;
          --invoice-line: #d7e0ee;
          --invoice-soft: #f8fbff;
          --invoice-green: #068648;
          border: 1px solid rgba(203, 213, 225, 0.9);
          border-radius: 24px;
          background: linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0.94) 100%);
          box-shadow: 0 24px 70px rgba(15, 23, 42, 0.08);
          padding: 30px 34px 28px;
          color: var(--invoice-ink);
        }
        .invoice-delivery-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 24px;
          margin-bottom: 28px;
        }
        .invoice-delivery-title {
          margin: 0 0 10px;
          font-size: 30px;
          line-height: 1.05;
          letter-spacing: -0.045em;
          font-weight: 900;
          color: var(--invoice-ink);
        }
        .invoice-delivery-subtitle {
          margin: 0;
          color: var(--invoice-muted);
          font-size: 16px;
          line-height: 1.5;
        }
        .invoice-delivery-toggle-area {
          display: grid;
          justify-items: end;
          gap: 10px;
          min-width: 300px;
        }
        .invoice-delivery-switch-row {
          display: inline-flex;
          align-items: center;
          justify-content: flex-end;
          gap: 14px;
          flex-wrap: wrap;
        }
        .invoice-delivery-toggle-label {
          font-size: 14px;
          font-weight: 800;
          color: #172554;
          white-space: nowrap;
        }
        .invoice-delivery-guest-switch {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: flex-end;
          width: 68px;
          height: 34px;
          border: 1px solid #cbd5e1;
          border-radius: 999px;
          background: #e2e8f0;
          color: #64748b;
          padding: 0 9px 0 34px;
          font-size: 10px;
          font-weight: 900;
          cursor: pointer;
          transition: background 0.18s ease, border-color 0.18s ease;
          font-family: inherit;
        }
        .invoice-delivery-guest-switch.active {
          justify-content: flex-start;
          padding: 0 34px 0 9px;
          background: #2563eb;
          border-color: #2563eb;
          color: #fff;
        }
        .invoice-delivery-guest-switch-knob {
          position: absolute;
          left: 4px;
          width: 26px;
          height: 26px;
          border-radius: 999px;
          background: #fff;
          box-shadow: 0 4px 10px rgba(15, 23, 42, 0.18);
          transition: transform 0.18s ease;
        }
        .invoice-delivery-guest-switch.active .invoice-delivery-guest-switch-knob {
          transform: translateX(34px);
        }
        .invoice-delivery-guest-switch-label {
          position: relative;
          z-index: 0;
          pointer-events: none;
        }
        .invoice-delivery-toggle-hint {
          margin: 0;
          color: var(--invoice-muted);
          font-size: 14px;
          line-height: 1.45;
          text-align: right;
        }
        .invoice-delivery-field {
          display: grid;
          gap: 10px;
          margin-bottom: 18px;
        }
        .invoice-delivery-label {
          color: var(--invoice-ink);
          font-size: 15px;
          font-weight: 900;
        }
        .invoice-delivery-input {
          width: 100%;
          min-height: 52px;
          border: 1px solid #cfd8e7;
          border-radius: 14px;
          background: #fff;
          color: var(--invoice-ink);
          font-size: 15px;
          line-height: 1.5;
          padding: 0 18px;
          outline: none;
          transition: border-color 160ms ease, box-shadow 160ms ease;
        }
        .invoice-delivery-input:focus,
        .invoice-delivery-editor:focus-within {
          border-color: rgba(15, 98, 254, 0.62);
          box-shadow: 0 0 0 4px rgba(15, 98, 254, 0.10);
        }
        .invoice-delivery-editor {
          overflow: hidden;
          border: 1px solid #cfd8e7;
          border-radius: 16px;
          background: #fff;
          transition: border-color 160ms ease, box-shadow 160ms ease;
        }
        .invoice-delivery-toolbar {
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: 60px;
          padding: 10px 12px;
          border-bottom: 1px solid #e6edf6;
          background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
        }
        .invoice-delivery-format,
        .invoice-delivery-tool,
        .invoice-delivery-preview-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 11px;
          background: transparent;
          color: #1f3157;
          font-size: 15px;
          font-weight: 850;
          height: 40px;
          padding: 0 12px;
          cursor: pointer;
          transition: background 150ms ease, color 150ms ease, box-shadow 150ms ease;
        }
        .invoice-delivery-format {
          min-width: 152px;
          justify-content: flex-start;
          border: 1px solid #e1e8f3;
          background: #f4f7fb;
          color: #243655;
          appearance: none;
          background-image: linear-gradient(45deg, transparent 50%, #475569 50%), linear-gradient(135deg, #475569 50%, transparent 50%);
          background-position: calc(100% - 19px) 17px, calc(100% - 13px) 17px;
          background-size: 6px 6px, 6px 6px;
          background-repeat: no-repeat;
          padding-right: 34px;
        }
        .invoice-delivery-tool {
          min-width: 40px;
          padding: 0 10px;
        }
        .invoice-delivery-tool:hover,
        .invoice-delivery-preview-btn:hover,
        .invoice-delivery-preview-btn.is-active {
          background: #eef4ff;
          color: var(--invoice-blue);
          box-shadow: inset 0 0 0 1px rgba(15, 98, 254, 0.10);
        }
        .invoice-delivery-divider {
          width: 1px;
          align-self: stretch;
          margin: 7px 4px;
          background: #e6edf6;
        }
        .invoice-delivery-toolbar-spacer { flex: 1 1 auto; }
        .invoice-delivery-preview-btn {
          gap: 8px;
          background: #eef4ff;
          color: var(--invoice-blue);
          padding: 0 14px;
        }
        .invoice-delivery-body,
        .invoice-delivery-preview {
          min-height: 270px;
          padding: 18px 18px 20px;
          color: var(--invoice-ink);
          font-size: 15px;
          line-height: 1.65;
          outline: none;
          background: linear-gradient(180deg, #fbfdff 0%, #ffffff 100%);
        }
        .invoice-delivery-preview {
          margin: 0;
          font-family: inherit;
          white-space: pre-wrap;
        }
        .invoice-delivery-tags-label {
          margin: 20px 0 10px;
          color: var(--invoice-ink);
          font-size: 15px;
          font-weight: 900;
        }
        .invoice-delivery-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          padding-bottom: 28px;
          border-bottom: 1px solid #e6edf6;
        }
        .invoice-delivery-tag {
          border: 1px solid rgba(18, 148, 74, 0.18);
          border-radius: 999px;
          background: #eaf8f0;
          color: #098342;
          padding: 8px 16px;
          font-size: 14px;
          font-weight: 900;
          cursor: pointer;
          box-shadow: 0 8px 18px rgba(21, 148, 71, 0.06);
          transition: transform 150ms ease, background 150ms ease, border-color 150ms ease;
        }
        .invoice-delivery-tag:hover {
          background: #ddf3e7;
          border-color: rgba(18, 148, 74, 0.32);
          transform: translateY(-1px);
        }
        .invoice-delivery-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding-top: 28px;
        }
        .invoice-delivery-reset,
        .invoice-delivery-save {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          min-height: 46px;
          border-radius: 12px;
          padding: 0 20px;
          font-size: 14px;
          font-weight: 900;
          cursor: pointer;
          transition: transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease, background 150ms ease;
        }
        .invoice-delivery-reset {
          border: 1px solid rgba(15, 98, 254, 0.28);
          background: #fff;
          color: var(--invoice-blue);
        }
        .invoice-delivery-save {
          min-width: 220px;
          border: 0;
          background: linear-gradient(180deg, var(--invoice-blue-2) 0%, var(--invoice-blue) 100%);
          color: #fff;
          box-shadow: 0 12px 28px rgba(15, 98, 254, 0.26);
        }
        .invoice-delivery-reset:hover,
        .invoice-delivery-save:hover {
          transform: translateY(-1px);
        }
        .invoice-delivery-reset:disabled,
        .invoice-delivery-save:disabled {
          opacity: .62;
          cursor: not-allowed;
          transform: none;
        }
        @media (max-width: 900px) {
          .invoice-delivery-modern-card { padding: 24px 18px; border-radius: 20px; }
          .invoice-delivery-header { flex-direction: column; }
          .invoice-delivery-toggle-area { justify-items: start; min-width: 0; width: 100%; }
          .invoice-delivery-toggle-hint { text-align: left; }
          .invoice-delivery-toolbar { flex-wrap: wrap; }
          .invoice-delivery-format { min-width: 135px; }
          .invoice-delivery-footer { flex-direction: column-reverse; align-items: stretch; }
          .invoice-delivery-save, .invoice-delivery-reset { width: 100%; }
        }
      `}</style>
      <div className="invoice-delivery-header">
        <div>
          <h3 className="invoice-delivery-title">{t('configInvoiceDeliveryTitle')}</h3>
          <p className="invoice-delivery-subtitle">{t('configInvoiceDeliverySubtitle')}</p>
        </div>
        <div className="invoice-delivery-toggle-area">
          <div className="invoice-delivery-switch-row">
            <span className="invoice-delivery-toggle-label">{t('configInvoiceDeliveryEmailToggleLabel')}</span>
            <InvoiceDeliveryGuestSwitch
              checked={enabled}
              onChange={setEnabled}
              onLabel={t('configToggleOn')}
              offLabel={t('configToggleOff')}
            />
          </div>
          <p className="invoice-delivery-toggle-hint">{t('configInvoiceDeliveryEmailToggleHint')}</p>
        </div>
      </div>

      <label className="invoice-delivery-field">
        <span className="invoice-delivery-label">{t('configInvoiceDeliverySubjectLabel')}</span>
        <input
          className="invoice-delivery-input"
          value={subject}
          onChange={(e) => setSettings((prev) => ({ ...prev, [SUBJECT_KEY]: e.target.value }))}
          placeholder={DEFAULT_SUBJECT}
        />
      </label>

      <div className="invoice-delivery-field">
        <span className="invoice-delivery-label">{t('configInvoiceDeliveryContentLabel')}</span>
        <div className="invoice-delivery-editor">
          <div className="invoice-delivery-toolbar" role="toolbar" aria-label={toolbarLabel}>
            <select
              className="invoice-delivery-format"
              aria-label={normalLabel}
              defaultValue="p"
              onChange={(e) => execBodyCommand('formatBlock', e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <option value="p">{normalLabel}</option>
              <option value="h2">{headingLabel}</option>
              <option value="blockquote">{quoteLabel}</option>
            </select>
            <span className="invoice-delivery-divider" aria-hidden />
            <button type="button" className="invoice-delivery-tool" onMouseDown={(e) => e.preventDefault()} onClick={() => execBodyCommand('bold')} title={t('configNotifyEditorBold')}>B</button>
            <button type="button" className="invoice-delivery-tool" onMouseDown={(e) => e.preventDefault()} onClick={() => execBodyCommand('italic')} title={t('configNotifyEditorItalic')}><em>I</em></button>
            <button type="button" className="invoice-delivery-tool" onMouseDown={(e) => e.preventDefault()} onClick={() => execBodyCommand('underline')} title={underlineLabel}><span style={{ textDecoration: 'underline' }}>U</span></button>
            <button type="button" className="invoice-delivery-tool" onMouseDown={(e) => e.preventDefault()} onClick={insertLink} title={t('configNotifyEditorLink')}><IconLink /></button>
            <span className="invoice-delivery-divider" aria-hidden />
            <button type="button" className="invoice-delivery-tool" onMouseDown={(e) => e.preventDefault()} onClick={() => execBodyCommand('insertUnorderedList')} title={t('configNotifyEditorUl')}><IconListBullet /></button>
            <button type="button" className="invoice-delivery-tool" onMouseDown={(e) => e.preventDefault()} onClick={() => execBodyCommand('insertOrderedList')} title={t('configNotifyEditorOl')}><IconListNumbered /></button>
            <button type="button" className="invoice-delivery-tool" onMouseDown={(e) => e.preventDefault()} onClick={() => execBodyCommand('formatBlock', 'blockquote')} title={quoteLabel}><IconQuote /></button>
            <span className="invoice-delivery-toolbar-spacer" />
            <button
              type="button"
              className={preview ? 'invoice-delivery-preview-btn is-active' : 'invoice-delivery-preview-btn'}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setPreview((prev) => !prev)}
            >
              <IconEye />
              {preview ? t('configInvoiceDeliveryEdit') : t('configInvoiceDeliveryPreview')}
            </button>
          </div>
          {preview ? (
            <pre className="invoice-delivery-preview">{previewText}</pre>
          ) : (
            <div
              ref={bodyRef}
              className="invoice-delivery-body"
              contentEditable
              suppressContentEditableWarning
              onInput={syncBodyFromEditor}
              onBlur={syncBodyFromEditor}
            />
          )}
        </div>
      </div>

      <p className="invoice-delivery-tags-label">{t('configInvoiceDeliveryAvailableTags')}</p>
      <div className="invoice-delivery-tags">
        {TOKEN_OPTIONS.map(({ token, label }) => (
          <button
            key={token}
            type="button"
            className="invoice-delivery-tag"
            onClick={() => insertToken(token)}
            title={token}
          >
            {label[locale]}
          </button>
        ))}
      </div>

      <div className="invoice-delivery-footer">
        <button
          type="button"
          className="invoice-delivery-reset"
          disabled={savingSettings}
          onClick={() => setSettings((prev) => ({ ...prev, [ENABLED_KEY]: 'true', [SUBJECT_KEY]: DEFAULT_SUBJECT, [BODY_KEY]: DEFAULT_BODY }))}
        >
          <IconReset />
          {t('configInvoiceDeliveryResetDefaults')}
        </button>
        <button type="button" className="invoice-delivery-save" disabled={savingSettings} onClick={() => void onSave()}>
          <IconSave />
          {saveLabel}
        </button>
      </div>
    </div>
  )
}
