import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../api'
import { useLocale } from '../locale'
import '../styles/pos-receipt-layout-editor.css'

type PosReceiptFontSize = 'COMPACT' | 'STANDARD' | 'LARGE'

type PosReceiptLayout = {
  showLogo: boolean
  showRecipient: boolean
  showUnitPriceAndQuantity: boolean
  showVatBreakdown: boolean
  showPaymentDetails: boolean
  showPaymentQr: boolean
  showFiscalQr: boolean
  showNotes: boolean
  showIssuedBy: boolean
  fontSize: PosReceiptFontSize
  footerText: string
  sectionOrder: string[]
}

const DEFAULT_ORDER = [
  'company',
  'document',
  'recipient',
  'items',
  'advancePayments',
  'totals',
  'vat',
  'payment',
  'paymentQr',
  'fiscal',
  'notes',
  'footer',
]

const DEFAULT_LAYOUT: PosReceiptLayout = {
  showLogo: true,
  showRecipient: true,
  showUnitPriceAndQuantity: true,
  showVatBreakdown: true,
  showPaymentDetails: true,
  showPaymentQr: true,
  showFiscalQr: true,
  showNotes: true,
  showIssuedBy: true,
  fontSize: 'STANDARD',
  footerText: '',
  sectionOrder: DEFAULT_ORDER,
}

function normalizeLayout(value: any): PosReceiptLayout {
  const order = Array.isArray(value?.sectionOrder)
    ? [...new Set([...value.sectionOrder.filter((entry: unknown) => DEFAULT_ORDER.includes(String(entry))), ...DEFAULT_ORDER])]
    : DEFAULT_ORDER
  return {
    ...DEFAULT_LAYOUT,
    ...(value && typeof value === 'object' ? value : {}),
    fontSize: ['COMPACT', 'STANDARD', 'LARGE'].includes(String(value?.fontSize)) ? value.fontSize : 'STANDARD',
    footerText: String(value?.footerText ?? ''),
    sectionOrder: order,
  }
}

function ReceiptToggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (checked: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="pos58-option-row">
      <span>
        <strong>{label}</strong>
        {hint ? <small>{hint}</small> : null}
      </span>
      <button
        type="button"
        className={`pos58-switch${checked ? ' is-on' : ''}`}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </label>
  )
}

export function PosReceiptLayoutEditor() {
  const { locale } = useLocale()
  const [layout, setLayout] = useState<PosReceiptLayout>(DEFAULT_LAYOUT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const copy = useMemo(() => {
    if (locale === 'sl') {
      return {
        title: 'Postavitev POS računa 58 mm',
        subtitle: 'Postavitev je prilagojena termičnemu papirju širine 58 mm in varnemu območju tiskanja 48 mm.',
        settings: 'Vsebina računa',
        order: 'Vrstni red razdelkov',
        font: 'Velikost besedila',
        footer: 'Besedilo v nogi',
        footerHint: 'Neobvezno sporočilo, na primer zahvala ali povezava do spletne strani.',
        save: 'Shrani postavitev',
        reset: 'Ponastavi',
        test: 'Testno tiskanje',
        saved: 'Postavitev POS računa je shranjena.',
        resetDone: 'Postavitev POS računa je ponastavljena.',
        failed: 'Postavitve ni bilo mogoče shraniti.',
        compact: 'Kompaktno', standard: 'Standardno', large: 'Večje',
      }
    }
    if (locale === 'sr') {
      return {
        title: 'Izgled POS računa 58 mm', subtitle: 'Izgled je prilagođen termalnom papiru širine 58 mm i bezbednoj širini štampe 48 mm.',
        settings: 'Sadržaj računa', order: 'Redosled odeljaka', font: 'Veličina teksta', footer: 'Tekst u podnožju',
        footerHint: 'Opciono, na primer zahvalnica ili adresa sajta.', save: 'Sačuvaj izgled', reset: 'Vrati podrazumevano', test: 'Probna štampa',
        saved: 'Izgled POS računa je sačuvan.', resetDone: 'Izgled POS računa je vraćen na podrazumevano.', failed: 'Izgled nije moguće sačuvati.',
        compact: 'Kompaktno', standard: 'Standardno', large: 'Veće',
      }
    }
    return {
      title: 'POS 58 mm invoice layout', subtitle: 'Designed for 58 mm thermal paper with a 48 mm safe printable width.',
      settings: 'Receipt content', order: 'Section order', font: 'Text size', footer: 'Footer text',
      footerHint: 'Optional message such as a thank-you note or website address.', save: 'Save layout', reset: 'Reset', test: 'Test print',
      saved: 'POS receipt layout saved.', resetDone: 'POS receipt layout reset.', failed: 'Unable to save the layout.',
      compact: 'Compact', standard: 'Standard', large: 'Larger',
    }
  }, [locale])

  const labels: Record<string, string> = locale === 'sl'
    ? { company: 'Podjetje in logotip', document: 'Podatki računa', recipient: 'Prejemnik', items: 'Postavke', advancePayments: 'Predplačila', totals: 'Seštevki', vat: 'Razčlenitev DDV', payment: 'Plačilo', paymentQr: 'UPN QR', fiscal: 'Fiskalni podatki', notes: 'Opombe', footer: 'Noga' }
    : locale === 'sr'
      ? { company: 'Kompanija i logo', document: 'Podaci računa', recipient: 'Primalac', items: 'Stavke', advancePayments: 'Avansne uplate', totals: 'Ukupni iznosi', vat: 'Pregled PDV-a', payment: 'Plaćanje', paymentQr: 'UPN QR', fiscal: 'Fiskalni podaci', notes: 'Napomene', footer: 'Podnožje' }
      : { company: 'Company and logo', document: 'Invoice details', recipient: 'Recipient', items: 'Items', advancePayments: 'Advances', totals: 'Totals', vat: 'VAT breakdown', payment: 'Payment', paymentQr: 'Payment QR', fiscal: 'Fiscal details', notes: 'Notes', footer: 'Footer' }

  useEffect(() => {
    let cancelled = false
    api.get('/billing/folio-layout-pos58')
      .then(({ data }) => { if (!cancelled) setLayout(normalizeLayout(data)) })
      .catch(() => { if (!cancelled) setNotice(copy.failed) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [copy.failed])

  const patch = <K extends keyof PosReceiptLayout>(key: K, value: PosReceiptLayout[K]) => {
    setLayout((previous) => ({ ...previous, [key]: value }))
    setNotice(null)
  }

  const moveSection = (section: string, direction: -1 | 1) => {
    setLayout((previous) => {
      const order = [...previous.sectionOrder]
      const index = order.indexOf(section)
      const target = index + direction
      if (index < 0 || target < 0 || target >= order.length) return previous
      ;[order[index], order[target]] = [order[target], order[index]]
      return { ...previous, sectionOrder: order }
    })
  }

  const save = async () => {
    setSaving(true)
    setNotice(null)
    try {
      const { data } = await api.put('/billing/folio-layout-pos58', layout)
      setLayout(normalizeLayout(data))
      setNotice(copy.saved)
    } catch {
      setNotice(copy.failed)
    } finally {
      setSaving(false)
    }
  }

  const reset = async () => {
    if (!window.confirm(locale === 'sl' ? 'Ponastavim postavitev POS računa?' : locale === 'sr' ? 'Vratiti podrazumevani izgled POS računa?' : 'Reset the POS receipt layout?')) return
    setSaving(true)
    try {
      const { data } = await api.delete('/billing/folio-layout-pos58')
      setLayout(normalizeLayout(data))
      setNotice(copy.resetDone)
    } catch {
      setNotice(copy.failed)
    } finally {
      setSaving(false)
    }
  }

  const testPrint = async () => {
    setTesting(true)
    setNotice(null)
    const prepared = window.open('', '_blank')
    try {
      const sample = {
        companyName: 'Calendra Studio', companyAddress: 'Glavna ulica 12', companyPostalCode: '2000', companyCity: 'Maribor', companyTaxId: 'SI12345678',
        folioNumber: '2026-00042', folioNumberLabel: locale === 'sl' ? 'Račun:' : locale === 'sr' ? 'Račun:' : 'Invoice:', folioDate: '2026-07-31 12:45', dateOfService: '2026-07-31', dueDate: '2026-08-07',
        recipientName: 'Ana Novak', recipientAddress: 'Cesta 5', recipientPostalCode: '1000', recipientCity: 'Ljubljana',
        services: [
          { description: 'Masaža hrbta in vratu', qty: 1, nettPrice: 40.98, grossPrice: 50, taxPercent: '22%', taxAmount: 9.02, totalPrice: 50 },
          { description: 'Individualno svetovanje z daljšim opisom storitve', qty: 2, nettPrice: 20.49, grossPrice: 25, taxPercent: '22%', taxAmount: 9.02, totalPrice: 50 },
        ],
        paymentMethods: [{ name: locale === 'sl' ? 'Bančno nakazilo' : 'Bank transfer', amountGross: 100 }],
        paymentMethod: locale === 'sl' ? 'Bančno nakazilo' : 'Bank transfer', issuedBy: 'David Mirc', iban: 'SI56 1910 0001 2345 678', toBePaidGross: 100,
        paymentQrPayload: 'https://calendra.si/placilo/test',
        notes: locale === 'sl' ? 'Hvala za vaš obisk.' : 'Thank you for your visit.', locale,
      }
      const response = await api.post(`/billing/folio/pdf?format=POS_58&locale=${locale}`, sample, { responseType: 'blob' })
      const blob = new Blob([response.data], { type: 'application/pdf' })
      const file = typeof File !== 'undefined'
        ? new File([blob], 'testni-racun-58mm.pdf', { type: 'application/pdf' })
        : null
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
      if (file && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && navigator.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
        prepared?.close()
        await navigator.share({ files: [file], title: copy.test })
      } else {
        const url = URL.createObjectURL(blob)
        if (prepared) prepared.location.href = url
        else window.open(url, '_blank', 'noopener,noreferrer')
        window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
      }
    } catch {
      prepared?.close()
      setNotice(locale === 'sl' ? 'Testnega računa ni bilo mogoče pripraviti.' : locale === 'sr' ? 'Probni račun nije moguće pripremiti.' : 'Unable to prepare the test receipt.')
    } finally {
      setTesting(false)
    }
  }

  const visibleSection = (section: string) => {
    if (section === 'recipient') return layout.showRecipient
    if (section === 'vat') return layout.showVatBreakdown
    if (section === 'payment') return layout.showPaymentDetails
    if (section === 'paymentQr') return layout.showPaymentQr
    if (section === 'fiscal') return true
    if (section === 'notes') return layout.showNotes
    if (section === 'footer') return Boolean(layout.footerText.trim())
    return true
  }

  const previewSections: Record<string, ReactNode> = {
    company: <>{layout.showLogo ? <div className="pos58-preview-logo">LOGO</div> : null}<strong className="pos58-preview-company">Calendra Studio</strong><span>Glavna ulica 12</span><span>2000 Maribor</span><span>SI12345678</span></>,
    document: <><hr /><strong className="pos58-preview-title">{locale === 'en' ? 'Invoice' : 'Račun'} 2026-00042</strong><div><span>{locale === 'sl' ? 'Izdano' : locale === 'sr' ? 'Izdato' : 'Issued'}</span><b>31. 7. 2026</b></div><hr /></>,
    recipient: <><strong>{labels.recipient}</strong><span>Ana Novak</span><span>Cesta 5, 1000 Ljubljana</span></>,
    items: <><strong>{labels.items}</strong><hr /><b>Masaža hrbta in vratu</b><div><span>{layout.showUnitPriceAndQuantity ? '1 × 50,00 EUR' : ''}</span><b>50,00 EUR</b></div><b>Individualno svetovanje z daljšim opisom</b><div><span>{layout.showUnitPriceAndQuantity ? '2 × 25,00 EUR' : ''}</span><b>50,00 EUR</b></div><hr /></>,
    advancePayments: <></>,
    totals: <><div className="pos58-preview-total"><span>{locale === 'sl' ? 'Skupaj' : locale === 'sr' ? 'Ukupno' : 'Total'}</span><b>100,00 EUR</b></div></>,
    vat: <><strong>{locale === 'sl' ? 'DDV' : locale === 'sr' ? 'PDV' : 'VAT'}</strong><div><span>{locale === 'sl' ? 'DDV 22% · osnova 81,96' : locale === 'sr' ? 'PDV 22% · osnovica 81,96' : 'VAT 22% · basis 81.96'}</span><b>18,04</b></div></>,
    payment: <><strong>{labels.payment}</strong><div><span>{locale === 'sl' ? 'Bančno nakazilo' : locale === 'sr' ? 'Bankovni prenos' : 'Bank transfer'}</span><b>100,00</b></div><div><span>IBAN</span><b>SI56 … 5678</b></div>{layout.showIssuedBy ? <div><span>{locale === 'sl' ? 'Izdal' : locale === 'sr' ? 'Izdao' : 'Issued by'}</span><b>David Mirc</b></div> : null}</>,
    paymentQr: <><div className="pos58-preview-qr" aria-label="UPN QR preview" /><small>{locale === 'sl' ? 'Skeniraj in plačaj' : locale === 'sr' ? 'Skeniraj i plati' : 'Scan and pay'}</small></>,
    fiscal: <><span>ZOI: 1234567890…</span><span>EOR: EOR-2026-42</span>{layout.showFiscalQr ? <><div className="pos58-preview-qr pos58-preview-qr--fiscal" /><small>{locale === 'sl' ? 'Fiskalna koda' : locale === 'sr' ? 'Fiskalni kod' : 'Fiscal code'}</small></> : null}</>,
    notes: <><strong>{labels.notes}</strong><span>{locale === 'sl' ? 'Hvala za vaš obisk.' : locale === 'sr' ? 'Hvala na poseti.' : 'Thank you for your visit.'}</span></>,
    footer: <><hr /><span className="pos58-preview-footer">{layout.footerText}</span></>,
  }

  if (loading) return <div className="pos58-loading">{locale === 'sl' ? 'Nalaganje postavitve…' : 'Loading layout…'}</div>

  return (
    <div className="pos58-editor">
      <header className="pos58-editor-header">
        <div><h3>{copy.title}</h3><p>{copy.subtitle}</p></div>
        <div className="pos58-dimensions"><strong>58 mm</strong><span>48 mm safe · 384 px @ 203 DPI</span></div>
      </header>

      <div className="pos58-editor-grid">
        <section className="pos58-controls">
          <div className="pos58-card">
            <h4>{copy.settings}</h4>
            <ReceiptToggle checked={layout.showLogo} onChange={(value) => patch('showLogo', value)} label={locale === 'sl' ? 'Prikaži logotip' : locale === 'sr' ? 'Prikaži logo' : 'Show logo'} />
            <ReceiptToggle checked={layout.showRecipient} onChange={(value) => patch('showRecipient', value)} label={labels.recipient} />
            <ReceiptToggle checked={layout.showUnitPriceAndQuantity} onChange={(value) => patch('showUnitPriceAndQuantity', value)} label={locale === 'sl' ? 'Količina in cena na enoto' : locale === 'sr' ? 'Količina i jedinična cena' : 'Quantity and unit price'} />
            <ReceiptToggle checked={layout.showVatBreakdown} onChange={(value) => patch('showVatBreakdown', value)} label={labels.vat} />
            <ReceiptToggle checked={layout.showPaymentDetails} onChange={(value) => patch('showPaymentDetails', value)} label={labels.payment} />
            <ReceiptToggle checked={layout.showPaymentQr} onChange={(value) => patch('showPaymentQr', value)} label={labels.paymentQr} hint={locale === 'sl' ? 'Prikaže se samo, ko so podatki za QR popolni.' : 'Only shown when QR payment data is complete.'} />
            <ReceiptToggle checked={layout.showFiscalQr} onChange={(value) => patch('showFiscalQr', value)} label={locale === 'sl' ? 'Fiskalni QR' : locale === 'sr' ? 'Fiskalni QR' : 'Fiscal QR'} />
            <ReceiptToggle checked={layout.showNotes} onChange={(value) => patch('showNotes', value)} label={labels.notes} />
            <ReceiptToggle checked={layout.showIssuedBy} onChange={(value) => patch('showIssuedBy', value)} label={locale === 'sl' ? 'Prikaži zaposlenega, ki je izdal račun' : locale === 'sr' ? 'Prikaži zaposlenog koji je izdao račun' : 'Show issuing employee'} />
          </div>

          <div className="pos58-card pos58-form-card">
            <label><span>{copy.font}</span><select value={layout.fontSize} onChange={(event) => patch('fontSize', event.target.value as PosReceiptFontSize)}><option value="COMPACT">{copy.compact}</option><option value="STANDARD">{copy.standard}</option><option value="LARGE">{copy.large}</option></select></label>
            <label><span>{copy.footer}</span><textarea rows={3} value={layout.footerText} onChange={(event) => patch('footerText', event.target.value)} placeholder={copy.footerHint} /><small>{copy.footerHint}</small></label>
          </div>

          <div className="pos58-card">
            <h4>{copy.order}</h4>
            <div className="pos58-order-list">
              {layout.sectionOrder.map((section, index) => (
                <div key={section} className={`pos58-order-item${visibleSection(section) ? '' : ' is-hidden'}`}>
                  <span className="pos58-order-handle">⋮⋮</span><span>{labels[section] || section}</span>
                  <div><button type="button" onClick={() => moveSection(section, -1)} disabled={index === 0} aria-label="Move up">↑</button><button type="button" onClick={() => moveSection(section, 1)} disabled={index === layout.sectionOrder.length - 1} aria-label="Move down">↓</button></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="pos58-preview-shell">
          <div className={`pos58-preview pos58-preview--${layout.fontSize.toLowerCase()}`}>
            {layout.sectionOrder.filter(visibleSection).map((section) => <section key={section}>{previewSections[section]}</section>)}
          </div>
          <div className="pos58-paper-caption"><span>58 mm</span><span>{locale === 'sl' ? 'dinamična višina' : 'dynamic height'}</span></div>
        </aside>
      </div>

      <footer className="pos58-actions">
        {notice ? <span className="pos58-notice">{notice}</span> : <span />}
        <button type="button" className="pos58-btn pos58-btn--secondary" onClick={() => void reset()} disabled={saving}>{copy.reset}</button>
        <button type="button" className="pos58-btn pos58-btn--secondary" onClick={() => void testPrint()} disabled={testing}>{testing ? '…' : copy.test}</button>
        <button type="button" className="pos58-btn pos58-btn--primary" onClick={() => void save()} disabled={saving}>{saving ? '…' : copy.save}</button>
      </footer>
    </div>
  )
}
