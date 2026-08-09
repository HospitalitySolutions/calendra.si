import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { Card } from '../components/ui'
import { useToast } from '../components/Toast'
import { useLocale } from '../locale'
import { useAuthenticatedUser } from '../authUserContext'
import { locationsQueryOptions, paymentMethodsQueryOptions } from '../queries/sharedQueryOptions'

type PaymentMethodOption = { id: number; name: string; paymentType?: string }
type ExportFormat = 'pdf' | 'excel'

function toIsoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function initialRange() {
  const today = new Date()
  return {
    from: toIsoDate(new Date(today.getFullYear(), today.getMonth(), 1)),
    to: toIsoDate(today),
  }
}

function ReportIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 2.75h8.2L19 7.55V21.25H6z" />
      <path d="M14 2.75v5h5M9 12h7M9 15.5h7M9 19h5" />
    </svg>
  )
}

type SecondaryReportKind = 'revenue' | 'bookings' | 'clients' | 'staff'

function SecondaryReportIcon({ kind }: { kind: SecondaryReportKind }) {
  if (kind === 'revenue') {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 20V10M10 20V4M16 20v-7M22 20V7" /></svg>
  }
  if (kind === 'bookings') {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>
  }
  if (kind === 'clients') {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="7" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg>
}

function PdfIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 2.75h8.2L19 7.55V21.25H6z" /><path d="M14 2.75v5h5" /><path d="M8.8 16.8v-5h1.7a1.6 1.6 0 0 1 0 3.2H8.8M13.1 16.8v-5h1.3c1.5 0 2.5 1 2.5 2.5s-1 2.5-2.5 2.5z" />
    </svg>
  )
}

function ExcelIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 2.75h8.2L19 7.55V21.25H6z" /><path d="M14 2.75v5h5" /><path d="m9.2 12 4.3 5M13.5 12l-4.3 5" />
    </svg>
  )
}

function Chevron({ open }: { open: boolean }) {
  return <span className={`analytics-report-row__chevron${open ? ' is-open' : ''}`} aria-hidden>⌄</span>
}

function downloadBlob(blob: Blob, fallbackName: string, contentDisposition?: string) {
  const match = contentDisposition?.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i)
  const fileName = match?.[1] ? decodeURIComponent(match[1].replace(/\"/g, '').trim()) : fallbackName
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
}

export function AnalyticsReportsPanel({ billingEnabled, selectedLocationId }: { billingEnabled: boolean; selectedLocationId?: number | null }) {
  const { locale } = useLocale()
  const me = useAuthenticatedUser()
  const { showToast } = useToast()
  const defaults = useMemo(initialRange, [])
  const [open, setOpen] = useState(true)
  const [from, setFrom] = useState(defaults.from)
  const [to, setTo] = useState(defaults.to)
  const [paymentMethodId, setPaymentMethodId] = useState('')
  const [customer, setCustomer] = useState('')
  const [taxRate, setTaxRate] = useState('ALL')
  const [paymentStatus, setPaymentStatus] = useState('ALL')
  const [billType, setBillType] = useState('ALL')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [locationId, setLocationId] = useState(() => selectedLocationId == null ? '' : String(selectedLocationId))
  const [exporting, setExporting] = useState<ExportFormat | null>(null)

  const sl = locale === 'sl'
  const sr = locale === 'sr'
  const copy = sl ? {
    intro: 'Izberite poročilo, nastavite filtre in ga prenesite v želeni obliki.', report: 'Izpis računov',
    subtitle: 'Seznam vseh izdanih računov z osnovo, DDV po stopnjah, plačili in skupnimi zneski.', filters: 'Filtri poročila',
    period: 'Obdobje izdaje', payment: 'Način plačila', allPayment: 'Vsi načini plačila', customer: 'Kupec', customerPlaceholder: 'Iskanje stranke ali podjetja…',
    tax: 'Davčna stopnja (DDV)', allTax: 'Vse stopnje', status: 'Status plačila', allStatus: 'Vsi statusi', paid: 'Plačano', open: 'Odprto / delno plačano', cancelled: 'Arhivirano',
    type: 'Vrsta računa', allTypes: 'Vse vrste', invoice: 'Račun', advance: 'Predplačilo', refund: 'Dobropis', number: 'Št. računa', numberPlaceholder: 'Npr. R-2026-0001', location: 'Poslovna enota / oznaka', allLocations: 'Vse poslovne enote',
    reset: 'Ponastavi filtre', pdf: 'Prenesi PDF', excel: 'Prenesi Excel', exportHint: 'Ponovno uporabite trenutno izbrane filtre.', disabled: 'Poročilo je na voljo, ko je Obračun vključen.', invalidDates: 'Končni datum ne sme biti pred začetnim.', exportFailed: 'Poročila ni bilo mogoče ustvariti.',
  } : sr ? {
    intro: 'Izaberite izveštaj, podesite filtere i preuzmite ga u željenom formatu.', report: 'Izveštaj računa', subtitle: 'Spisak izdatih računa sa osnovicom, PDV-om po stopama, plaćanjima i ukupnim iznosima.', filters: 'Filteri izveštaja', period: 'Period izdavanja', payment: 'Način plaćanja', allPayment: 'Svi načini plaćanja', customer: 'Kupac', customerPlaceholder: 'Pretraga klijenta ili firme…', tax: 'Poreska stopa (PDV)', allTax: 'Sve stope', status: 'Status plaćanja', allStatus: 'Svi statusi', paid: 'Plaćeno', open: 'Otvoreno / delimično plaćeno', cancelled: 'Arhivirano', type: 'Vrsta računa', allTypes: 'Sve vrste', invoice: 'Račun', advance: 'Avans', refund: 'Storno', number: 'Br. računa', numberPlaceholder: 'Npr. R-2026-0001', location: 'Poslovna jedinica / oznaka', allLocations: 'Sve poslovne jedinice', reset: 'Resetuj filtere', pdf: 'Preuzmi PDF', excel: 'Preuzmi Excel', exportHint: 'Ponovo upotrebite trenutno izabrane filtere.', disabled: 'Izveštaj je dostupan kada je obračun uključen.', invalidDates: 'Krajnji datum ne može biti pre početnog.', exportFailed: 'Izveštaj nije moguće napraviti.',
  } : {
    intro: 'Choose a report, set filters and download it in the required format.', report: 'Invoice report', subtitle: 'List of issued invoices with net basis, VAT by rate, payments and totals.', filters: 'Report filters', period: 'Issue period', payment: 'Payment method', allPayment: 'All payment methods', customer: 'Customer', customerPlaceholder: 'Search customer or company…', tax: 'Tax rate (VAT)', allTax: 'All rates', status: 'Payment status', allStatus: 'All statuses', paid: 'Paid', open: 'Open / partially paid', cancelled: 'Archived', type: 'Invoice type', allTypes: 'All types', invoice: 'Invoice', advance: 'Advance', refund: 'Credit note', number: 'Invoice no.', numberPlaceholder: 'E.g. R-2026-0001', location: 'Business unit / label', allLocations: 'All business units', reset: 'Reset filters', pdf: 'Download PDF', excel: 'Download Excel', exportHint: 'Reuse the currently selected filters.', disabled: 'This report is available when Billing is enabled.', invalidDates: 'The end date cannot be before the start date.', exportFailed: 'The report could not be generated.',
  }

  const secondaryReports: Array<{ kind: SecondaryReportKind; title: string; description: string }> = sl ? [
    { kind: 'revenue', title: 'Prihodki po storitvah', description: 'Pregled prihodkov po storitvah, kategorijah in zaposlenih.' },
    { kind: 'bookings', title: 'Pregled rezervacij', description: 'Seznam rezervacij z detajli strank, storitev, terminov in statusov.' },
    { kind: 'clients', title: 'Stranke in obiski', description: 'Analiza obiskov, novih strank in povratnih strank po obdobjih.' },
    { kind: 'staff', title: 'Zaposleni in zasedenost', description: 'Zasedenost zaposlenih, število terminov in produktivnost po obdobjih.' },
  ] : sr ? [
    { kind: 'revenue', title: 'Prihod po uslugama', description: 'Pregled prihoda po uslugama, kategorijama i zaposlenima.' },
    { kind: 'bookings', title: 'Pregled rezervacija', description: 'Spisak rezervacija sa detaljima klijenata, usluga, termina i statusa.' },
    { kind: 'clients', title: 'Klijenti i posete', description: 'Analiza poseta, novih i povratnih klijenata po periodima.' },
    { kind: 'staff', title: 'Zaposleni i zauzetost', description: 'Zauzetost zaposlenih, broj termina i produktivnost po periodima.' },
  ] : [
    { kind: 'revenue', title: 'Revenue by service', description: 'Revenue overview by services, categories and staff.' },
    { kind: 'bookings', title: 'Bookings overview', description: 'Bookings with client, service, time and status details.' },
    { kind: 'clients', title: 'Clients and visits', description: 'Analysis of visits, new clients and returning clients by period.' },
    { kind: 'staff', title: 'Staff and utilization', description: 'Staff utilization, appointment volume and productivity by period.' },
  ]

  const activeUnitId = me.activeUnitId ?? me.companyId
  const paymentMethodsQuery = useQuery({
    ...paymentMethodsQueryOptions<PaymentMethodOption>(activeUnitId),
    enabled: billingEnabled,
  })

  const locationsQuery = useQuery({
    ...locationsQueryOptions(activeUnitId),
    enabled: billingEnabled,
  })

  useEffect(() => {
    setLocationId(selectedLocationId == null ? '' : String(selectedLocationId))
  }, [selectedLocationId])

  const reset = () => {
    const next = initialRange()
    setFrom(next.from)
    setTo(next.to)
    setPaymentMethodId('')
    setCustomer('')
    setTaxRate('ALL')
    setPaymentStatus('ALL')
    setBillType('ALL')
    setInvoiceNumber('')
    setLocationId(selectedLocationId == null ? '' : String(selectedLocationId))
  }

  const exportReport = async (format: ExportFormat) => {
    if (!billingEnabled || exporting) return
    if (!from || !to || to < from) {
      showToast('error', copy.invalidDates)
      return
    }
    setExporting(format)
    try {
      const params: Record<string, string | number> = { from, to }
      if (paymentMethodId) params.paymentMethodId = Number(paymentMethodId)
      if (customer.trim()) params.customer = customer.trim()
      if (taxRate !== 'ALL') params.taxRate = taxRate
      if (paymentStatus !== 'ALL') params.paymentStatus = paymentStatus
      if (billType !== 'ALL') params.billType = billType
      if (invoiceNumber.trim()) params.invoiceNumber = invoiceNumber.trim()
      if (locationId) params.locationId = Number(locationId)
      const response = await api.get(`/analytics/reports/invoices/${format}`, { params, responseType: 'blob' })
      const extension = format === 'pdf' ? 'pdf' : 'xlsx'
      downloadBlob(response.data as Blob, `izpis-racunov-${from}-${to}.${extension}`, response.headers['content-disposition'])
    } catch {
      showToast('error', copy.exportFailed)
    } finally {
      setExporting(null)
    }
  }

  return (
    <section className="analytics-reports-approved">
      <div className="analytics-reports-approved__intro">
        <p>{copy.intro}</p>
      </div>

      <Card className={`analytics-report-row${open ? ' analytics-report-row--open' : ''}`}>
        <button type="button" className="analytics-report-row__header" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          <span className="analytics-report-row__icon"><ReportIcon /></span>
          <span className="analytics-report-row__copy">
            <strong>{copy.report}</strong>
            <small>{copy.subtitle}</small>
          </span>
          <Chevron open={open} />
        </button>

        {open && (
          <div className="analytics-report-row__body">
            {!billingEnabled ? (
              <div className="analytics-report-row__disabled">{copy.disabled}</div>
            ) : (
              <>
                <div className="analytics-report-row__body-heading">
                  <strong className="analytics-report-row__body-heading-label">{copy.filters}</strong>
                  <span>{copy.exportHint}</span>
                </div>
                <div className="analytics-invoice-report-filters">
                  <label className="analytics-invoice-report-field analytics-invoice-report-field--period">
                    <span>{copy.period}</span>
                    <div className="analytics-invoice-report-date-range">
                      <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
                      <span>–</span>
                      <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
                    </div>
                  </label>
                  <label className="analytics-invoice-report-field">
                    <span>{copy.payment}</span>
                    <select value={paymentMethodId} onChange={(event) => setPaymentMethodId(event.target.value)}>
                      <option value="">{copy.allPayment}</option>
                      {(paymentMethodsQuery.data ?? []).map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}
                    </select>
                  </label>
                  <label className="analytics-invoice-report-field">
                    <span>{copy.customer}</span>
                    <input value={customer} onChange={(event) => setCustomer(event.target.value)} placeholder={copy.customerPlaceholder} />
                  </label>
                  <label className="analytics-invoice-report-field">
                    <span>{copy.tax}</span>
                    <select value={taxRate} onChange={(event) => setTaxRate(event.target.value)}>
                      <option value="ALL">{copy.allTax}</option>
                      <option value="VAT_22">22%</option>
                      <option value="VAT_9_5">9,5%</option>
                      <option value="VAT_0">0%</option>
                    </select>
                  </label>
                  <label className="analytics-invoice-report-field">
                    <span>{copy.status}</span>
                    <select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)}>
                      <option value="ALL">{copy.allStatus}</option>
                      <option value="paid">{copy.paid}</option>
                      <option value="OPEN">{copy.open}</option>
                      <option value="cancelled">{copy.cancelled}</option>
                    </select>
                  </label>
                  <label className="analytics-invoice-report-field">
                    <span>{copy.type}</span>
                    <select value={billType} onChange={(event) => setBillType(event.target.value)}>
                      <option value="ALL">{copy.allTypes}</option>
                      <option value="INVOICE">{copy.invoice}</option>
                      <option value="ADVANCE">{copy.advance}</option>
                      <option value="REFUND">{copy.refund}</option>
                    </select>
                  </label>
                  <label className="analytics-invoice-report-field">
                    <span>{copy.number}</span>
                    <input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} placeholder={copy.numberPlaceholder} />
                  </label>
                  <label className="analytics-invoice-report-field">
                    <span>{copy.location}</span>
                    <select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                      <option value="">{copy.allLocations}</option>
                      {(locationsQuery.data ?? []).map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}{location.fiscalBusinessPremiseCode ? ` · ${location.fiscalBusinessPremiseCode}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="analytics-invoice-report-actions">
                  <button type="button" className="secondary analytics-invoice-report-reset" onClick={reset}>{copy.reset}</button>
                  <div className="analytics-invoice-report-downloads">
                    <button type="button" className="secondary analytics-invoice-report-download analytics-invoice-report-download--pdf" onClick={() => exportReport('pdf')} disabled={exporting !== null}>
                      <PdfIcon /><span>{exporting === 'pdf' ? `${copy.pdf}…` : copy.pdf}</span>
                    </button>
                    <button type="button" className="secondary analytics-invoice-report-download analytics-invoice-report-download--excel" onClick={() => exportReport('excel')} disabled={exporting !== null}>
                      <ExcelIcon /><span>{exporting === 'excel' ? `${copy.excel}…` : copy.excel}</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </Card>

      <div className="analytics-secondary-report-list">
        {secondaryReports.map((report) => (
          <Card className="analytics-report-row analytics-report-row--collapsed" key={report.kind}>
            <button type="button" className="analytics-report-row__header analytics-report-row__header--collapsed" aria-expanded={false}>
              <span className={`analytics-report-row__icon analytics-report-row__icon--${report.kind}`}><SecondaryReportIcon kind={report.kind} /></span>
              <span className="analytics-report-row__copy">
                <strong>{report.title}</strong>
                <small>{report.description}</small>
              </span>
              <Chevron open={false} />
            </button>
          </Card>
        ))}
      </div>
    </section>
  )
}
