import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../api'
import { useLocale } from '../locale'
import '../styles/pos-receipt-layout-editor.css'

type PosReceiptFontSize = 'COMPACT' | 'STANDARD' | 'LARGE'
type ReceiptLocale = 'sl' | 'en' | 'sr'

const DEFAULT_REFERENCE_TEXTS: Record<ReceiptLocale, string> = {
  sl: 'Prosimo, da se pri plačilu sklicujete na št.: {reference-number}',
  en: 'Please use the following reference when making the payment: {reference-number}',
  sr: 'Molimo vas da se prilikom plaćanja pozovete na broj: {reference-number}',
}

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
  showSignature: boolean
  fontSize: PosReceiptFontSize
  footerText: string
  taxClauses: string[]
  referenceTexts: Record<ReceiptLocale, string>
  sectionOrder: string[]
}

const DEFAULT_ORDER = [
  'company',
  'document',
  'recipient',
  'items',
  'advancePayments',
  'vat',
  'totals',
  'taxClauses',
  'paymentQr',
  'fiscal',
  'issuedBy',
  'notes',
  'signature',
  'footer',
]

const AUTO_NO_VAT_CLAUSE = 'DDV ni obračunan na podlagi prvega odstavka 94. člena ZDDV-1.'
const LEGACY_AUTO_NO_VAT_CLAUSES = [
  'DDV ni obračunan na podlagi točke prvega odstavka 94. člena ZDDV-1.',
  'DDV ni obračunan na podlagi 1. točke prvega odstavka 94. člena ZDDV-1.',
] as const

const TAX_CLAUSE_OPTIONS = [
  'Oprostitev DDV po 42. členu ZDDV-1.',
  'Oprostitev DDV po 44. členu ZDDV-1.',
  'Dobava blaga v drugo državo članico EU je oproščena DDV po 46. členu ZDDV-1.',
  'Izvoz blaga je oproščen DDV po 52. členu ZDDV-1.',
  'Obrnjena davčna obveznost po 76.a členu ZDDV-1.',
  'Posebna ureditev za potovalne agencije po 97. členu ZDDV-1.',
  'Posebna ureditev za rabljeno blago, umetniške predmete, zbirke in starine po 102. členu ZDDV-1.',
] as const

const DEFAULT_LAYOUT: PosReceiptLayout = {
  showLogo: true,
  showRecipient: true,
  showUnitPriceAndQuantity: true,
  showVatBreakdown: true,
  showPaymentDetails: false,
  showPaymentQr: true,
  showFiscalQr: true,
  showNotes: true,
  showIssuedBy: true,
  showSignature: true,
  fontSize: 'STANDARD',
  footerText: '',
  taxClauses: [],
  referenceTexts: DEFAULT_REFERENCE_TEXTS,
  sectionOrder: DEFAULT_ORDER,
}

function normalizeTaxClauses(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const unique = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    let trimmed = item.trim()
    for (const legacyClause of LEGACY_AUTO_NO_VAT_CLAUSES) trimmed = trimmed.replace(legacyClause, AUTO_NO_VAT_CLAUSE)
    if (trimmed && trimmed !== AUTO_NO_VAT_CLAUSE) unique.add(trimmed)
  }
  return Array.from(unique)
}

function normalizeReferenceTexts(value: unknown): Record<ReceiptLocale, string> {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    sl: typeof source.sl === 'string' ? source.sl : DEFAULT_REFERENCE_TEXTS.sl,
    en: typeof source.en === 'string' ? source.en : DEFAULT_REFERENCE_TEXTS.en,
    sr: typeof source.sr === 'string' ? source.sr : DEFAULT_REFERENCE_TEXTS.sr,
  }
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
    taxClauses: normalizeTaxClauses(value?.taxClauses),
    referenceTexts: normalizeReferenceTexts(value?.referenceTexts),
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
        taxClauses: 'Davčne klavzule',
        taxClausesHint: 'Klavzula po 94. členu se doda samodejno, ko imajo vse postavke davčno stopnjo Brez DDV. Tukaj lahko izberete dodatne klavzule.',
        taxClausesPlaceholder: 'Dodaj davčno klavzulo…',
        noTaxClauses: 'Ni izbranih dodatnih davčnih klavzul.',
        referenceText: 'Besedilo reference',
        referenceTextHint: 'Uporabite oznako {reference-number}, kjer naj se izpiše številka reference.',
        showPaymentType: 'Prikaži vrsto plačila',
        showPaymentTypeHint: 'V razdelku seštevkov prikaže uporabljena vrsta plačila (npr. Gotovina).',
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
        title: 'Izgled POS računa 58 mm',
        subtitle: 'Izgled je prilagođen termalnom papiru širine 58 mm i bezbednoj širini štampe 48 mm.',
        settings: 'Sadržaj računa',
        order: 'Redosled odeljaka',
        font: 'Veličina teksta',
        footer: 'Tekst u podnožju',
        footerHint: 'Opciono, na primer zahvalnica ili adresa sajta.',
        taxClauses: 'Poreske klauzule',
        taxClausesHint: 'Klauzula po članu 94 dodaje se automatski kada sve stavke imaju poresku stopu Bez PDV-a. Ovde možete izabrati dodatne klauzule.',
        taxClausesPlaceholder: 'Dodaj poresku klauzulu…',
        noTaxClauses: 'Nema izabranih dodatnih poreskih klauzula.',
        referenceText: 'Tekst reference',
        referenceTextHint: 'Koristite oznaku {reference-number} na mestu gde treba prikazati broj reference.',
        showPaymentType: 'Prikaži vrstu plaćanja',
        showPaymentTypeHint: 'U zbirnom delu prikazuje korišćenu vrstu plaćanja (npr. Gotovina).',
        save: 'Sačuvaj izgled',
        reset: 'Vrati podrazumevano',
        test: 'Probna štampa',
        saved: 'Izgled POS računa je sačuvan.',
        resetDone: 'Izgled POS računa je vraćen na podrazumevano.',
        failed: 'Izgled nije moguće sačuvati.',
        compact: 'Kompaktno', standard: 'Standardno', large: 'Veće',
      }
    }
    return {
      title: 'POS 58 mm invoice layout',
      subtitle: 'Designed for 58 mm thermal paper with a 48 mm safe printable width.',
      settings: 'Receipt content',
      order: 'Section order',
      font: 'Text size',
      footer: 'Footer text',
      footerHint: 'Optional message such as a thank-you note or website address.',
      taxClauses: 'Tax clauses',
      taxClausesHint: 'The Article 94 clause is added automatically when every item uses the No VAT tax level. Additional clauses can be selected here.',
      taxClausesPlaceholder: 'Add tax clause…',
      noTaxClauses: 'No additional tax clauses selected.',
      referenceText: 'Reference text',
      referenceTextHint: 'Use {reference-number} where the invoice reference number should appear.',
      showPaymentType: 'Show payment type',
      showPaymentTypeHint: 'Shows the used payment type in the totals section (for example Cash).',
      save: 'Save layout',
      reset: 'Reset',
      test: 'Test print',
      saved: 'POS receipt layout saved.',
      resetDone: 'POS receipt layout reset.',
      failed: 'Unable to save the layout.',
      compact: 'Compact', standard: 'Standard', large: 'Larger',
    }
  }, [locale])

  const labels: Record<string, string> = locale === 'sl'
    ? { company: 'Podjetje in logotip', document: 'Podatki računa', recipient: 'Prejemnik', items: 'Postavke', advancePayments: 'Predplačila', totals: 'Seštevki', vat: 'Razčlenitev DDV', paymentQr: 'UPN QR', fiscal: 'Fiskalni podatki', issuedBy: 'Izdal', taxClauses: 'Davčne klavzule', notes: 'Referenca', signature: 'Podpis', footer: 'Noga' }
    : locale === 'sr'
      ? { company: 'Kompanija i logo', document: 'Podaci računa', recipient: 'Primalac', items: 'Stavke', advancePayments: 'Avansne uplate', totals: 'Ukupni iznosi', vat: 'Pregled PDV-a', paymentQr: 'UPN QR', fiscal: 'Fiskalni podaci', issuedBy: 'Izdao', taxClauses: 'Poreske klauzule', notes: 'Referenca', signature: 'Potpis', footer: 'Podnožje' }
      : { company: 'Company and logo', document: 'Invoice details', recipient: 'Recipient', items: 'Items', advancePayments: 'Advances', totals: 'Totals', vat: 'VAT breakdown', paymentQr: 'Payment QR', fiscal: 'Fiscal details', issuedBy: 'Issued by', taxClauses: 'Tax clauses', notes: 'Reference', signature: 'Signature', footer: 'Footer' }

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
        folioNumber: '2026-00042', folioNumberLabel: locale === 'sl' ? 'Račun:' : locale === 'sr' ? 'Račun:' : 'Invoice:', folioDate: '31.07.2026 12:45', issueCity: 'Maribor', dateOfService: '31.07.2026', dueDate: '07.08.2026',
        recipientName: 'Ana Novak', recipientAddress: 'Cesta 5', recipientPostalCode: '1000', recipientCity: 'Ljubljana',
        services: [
          { date: '31.07.2026', description: 'Masaža hrbta in vratu', qty: 1, nettPrice: 40.98, grossPrice: 50, taxPercent: '22%', taxAmount: 9.02, totalPrice: 50 },
          { date: '31.07.2026', description: 'Individualno svetovanje z daljšim opisom storitve', qty: 2, nettPrice: 20.49, grossPrice: 25, taxPercent: '22%', taxAmount: 9.02, totalPrice: 50 },
        ],
        paymentMethods: [{ name: locale === 'sl' ? 'Gotovina' : locale === 'sr' ? 'Gotovina' : 'Cash', amountGross: 90 }],
        paymentMethod: locale === 'sl' ? 'Gotovina' : locale === 'sr' ? 'Gotovina' : 'Cash', issuedBy: 'David Mirc', iban: 'SI56 1910 0001 2345 678', discountAmountGross: 10, toBePaidGross: 90,
        paymentQrPayload: 'https://calendra.si/placilo/test',
        fiscalQr: 'https://calendra.si/fiscal/test', fiscalZoi: '1234567890', fiscalEor: 'EOR-2026-42',
        notes: 'REF-2026-001', locale,
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
    if (section === 'paymentQr') return layout.showPaymentQr
    if (section === 'fiscal') return layout.showFiscalQr
    if (section === 'issuedBy') return layout.showIssuedBy
    if (section === 'taxClauses') return true
    if (section === 'notes') return layout.showNotes
    if (section === 'signature') return layout.showSignature
    if (section === 'footer') return Boolean(layout.footerText.trim())
    return true
  }

  const receiptLocale: ReceiptLocale = locale === 'sl' || locale === 'sr' ? locale : 'en'
  const referencePreview = (layout.referenceTexts[receiptLocale] || '{reference-number}')
    .split('{reference-number}').join('REF-2026-001')
  const previewTaxClauses = layout.taxClauses.filter((clause) => clause !== AUTO_NO_VAT_CLAUSE)

  const previewSections: Record<string, ReactNode> = {
    company: <>{layout.showLogo ? <div className="pos58-preview-logo">LOGO</div> : null}<strong className="pos58-preview-company">Calendra Studio</strong><span>Glavna ulica 12</span><span>2000 Maribor</span><span>{locale === 'sl' ? 'ID št. za DDV: SI12345678' : locale === 'sr' ? 'PIB: SI12345678' : 'VAT ID: SI12345678'}</span><span>{locale === 'sl' || locale === 'sr' ? 'TRR' : 'IBAN'}: SI56 1234 5678 9012 3456</span></>,
    document: <><hr /><strong className="pos58-preview-title">{locale === 'en' ? 'Invoice:' : 'Račun:'} MB-1-2026-00042</strong><div className="pos58-preview-document-gap" /><div><span>{locale === 'sl' ? 'Izdano' : locale === 'sr' ? 'Izdato' : 'Issued'}</span><b>Maribor, 31.07.2026 12:45</b></div><div><span>{locale === 'sl' ? 'Datum opravljene storitve' : locale === 'sr' ? 'Datum izvršene usluge' : 'Service date'}</span><b>31.07.2026</b></div><div><span>{locale === 'sl' ? 'Rok plačila' : locale === 'sr' ? 'Rok plaćanja' : 'Due date'}</span><b>07.08.2026</b></div><hr /></>,
    recipient: <><strong>{labels.recipient}</strong><span>Ana Novak</span><span>Cesta 5, 1000 Ljubljana</span></>,
    items: <><strong>{labels.items}</strong><div className="pos58-preview-items-table"><div className="pos58-preview-items-head"><span>{locale === 'sl' ? 'Artikel/Cena' : locale === 'sr' ? 'Artikal/Cena' : 'Item/Price'}</span><span>{layout.showUnitPriceAndQuantity ? (locale === 'sl' || locale === 'sr' ? 'Kol' : 'Qty') : ''}</span><span>{locale === 'sl' || locale === 'sr' ? 'Popust' : 'Discount'}</span><span>{locale === 'sl' ? 'Vrednost' : locale === 'sr' ? 'Vrednost' : 'Value'}</span></div><hr /><div className="pos58-preview-item"><strong>Pazduhe</strong><div className="pos58-preview-item-row"><span>12,00</span><span>{layout.showUnitPriceAndQuantity ? '1x' : ''}</span><span>2,00</span><b>10,00</b></div></div><div className="pos58-preview-item"><strong>Bikini - mali</strong><div className="pos58-preview-item-row"><span>18,00</span><span>{layout.showUnitPriceAndQuantity ? '1x' : ''}</span><span>—</span><b>18,00</b></div></div><hr /></div></>,
    advancePayments: <></>,
    totals: <><div className="pos58-preview-summary-row"><span>{locale === 'sl' ? 'Skupaj brez DDV' : locale === 'sr' ? 'Ukupno bez PDV-a' : 'Total excl. VAT'}</span><b>30,00</b></div><div className="pos58-preview-summary-row"><span>{locale === 'sl' || locale === 'sr' ? 'Popust' : 'Discount'}</span><b>- 2,00</b></div><div className="pos58-preview-summary-row pos58-preview-summary-row--strong"><span>{locale === 'sl' ? 'Skupaj EUR' : locale === 'sr' ? 'Ukupno EUR' : 'Total EUR'}</span><b>28,00</b></div><hr className="pos58-preview-summary-divider" /><div className="pos58-preview-summary-row pos58-preview-summary-row--strong"><span>{locale === 'sl' ? 'Za plačilo EUR' : locale === 'sr' ? 'Za plaćanje EUR' : 'Amount due EUR'}</span><b>28,00</b></div>{layout.showPaymentDetails ? <><div className="pos58-preview-summary-spacer" /><div className="pos58-preview-summary-row"><span>{locale === 'sl' ? 'Gotovina' : locale === 'sr' ? 'Gotovina' : 'Cash'}</span><b>28,00</b></div></> : null}<hr className="pos58-preview-summary-rule" /></>,
    vat: <><div className="pos58-preview-summary-row"><span>22% · {locale === 'sl' ? 'osnova' : locale === 'sr' ? 'osnovica' : 'basis'} 22,95</span><b>5,05</b></div></>,
    paymentQr: <><div className="pos58-preview-qr" aria-label="UPN QR preview" /><small>{locale === 'sl' ? 'Skeniraj in plačaj' : locale === 'sr' ? 'Skeniraj i plati' : 'Scan and pay'}</small></>,
    fiscal: <><div className="pos58-preview-qr pos58-preview-qr--fiscal" /><span>ZOI: 1234567890…</span><span>EOR: 9999cf00-089a-46e6-a3d8-bcbb0da779c7</span></>,
    issuedBy: <div><span>{locale === 'sl' ? 'Izdal' : locale === 'sr' ? 'Izdao' : 'Issued by'}</span><b>David Mirc</b></div>,
    taxClauses: <>{previewTaxClauses.map((clause) => <span key={clause}>• {clause}</span>)}</>,
    notes: <><strong>{labels.notes}</strong><span>{referencePreview}</span></>,
    signature: <><strong>{labels.signature}</strong><hr /></>,
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
            <ReceiptToggle checked={layout.showUnitPriceAndQuantity} onChange={(value) => patch('showUnitPriceAndQuantity', value)} label={locale === 'sl' ? 'Količina' : locale === 'sr' ? 'Količina' : 'Quantity'} />
            <ReceiptToggle checked={layout.showVatBreakdown} onChange={(value) => patch('showVatBreakdown', value)} label={labels.vat} />
            <ReceiptToggle checked={layout.showPaymentDetails} onChange={(value) => patch('showPaymentDetails', value)} label={copy.showPaymentType} hint={copy.showPaymentTypeHint} />
            <ReceiptToggle checked={layout.showPaymentQr} onChange={(value) => patch('showPaymentQr', value)} label={labels.paymentQr} hint={locale === 'sl' ? 'Prikaže se samo, ko so podatki za QR popolni.' : locale === 'sr' ? 'Prikazuje se samo kada su podaci za QR potpuni.' : 'Only shown when QR payment data is complete.'} />
            <ReceiptToggle checked={layout.showFiscalQr} onChange={(value) => patch('showFiscalQr', value)} label={labels.fiscal} hint={locale === 'sl' ? 'Vključi ZOI, EOR in fiskalno QR kodo.' : locale === 'sr' ? 'Uključuje ZOI, EOR i fiskalni QR kod.' : 'Includes ZOI, EOR and the fiscal QR code.'} />
            <ReceiptToggle checked={layout.showIssuedBy} onChange={(value) => patch('showIssuedBy', value)} label={labels.issuedBy} />
            <ReceiptToggle checked={layout.showNotes} onChange={(value) => patch('showNotes', value)} label={labels.notes} />
            <ReceiptToggle checked={layout.showSignature} onChange={(value) => patch('showSignature', value)} label={labels.signature} />
          </div>

          <div className="pos58-card pos58-form-card">
            <label><span>{copy.font}</span><select value={layout.fontSize} onChange={(event) => patch('fontSize', event.target.value as PosReceiptFontSize)}><option value="COMPACT">{copy.compact}</option><option value="STANDARD">{copy.standard}</option><option value="LARGE">{copy.large}</option></select></label>
            <label>
              <span>{copy.taxClauses}</span>
              <select
                value=""
                onChange={(event) => {
                  const clause = event.target.value
                  if (!clause) return
                  patch('taxClauses', [...layout.taxClauses, clause])
                }}
              >
                <option value="">{copy.taxClausesPlaceholder}</option>
                {TAX_CLAUSE_OPTIONS.filter((clause) => !layout.taxClauses.includes(clause)).map((clause) => (
                  <option key={clause} value={clause}>{clause}</option>
                ))}
              </select>
              <small>{copy.taxClausesHint}</small>
            </label>
            <div className="pos58-tax-clause-list">
              {layout.taxClauses.length === 0 ? (
                <div className="pos58-tax-clause-empty">{copy.noTaxClauses}</div>
              ) : layout.taxClauses.map((clause) => (
                <div key={clause} className="pos58-tax-clause-chip">
                  <span>{clause}</span>
                  <button type="button" onClick={() => patch('taxClauses', layout.taxClauses.filter((item) => item !== clause))} aria-label="Remove tax clause">×</button>
                </div>
              ))}
            </div>
            <label>
              <span>{copy.referenceText}</span>
              <textarea
                rows={2}
                value={layout.referenceTexts[receiptLocale]}
                onChange={(event) => patch('referenceTexts', { ...layout.referenceTexts, [receiptLocale]: event.target.value })}
                placeholder={DEFAULT_REFERENCE_TEXTS[receiptLocale]}
              />
              <small>{copy.referenceTextHint}</small>
            </label>
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
