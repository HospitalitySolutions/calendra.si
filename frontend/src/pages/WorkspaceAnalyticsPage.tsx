import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from '../api'
import { useAuthenticatedUser } from '../authUserContext'
import { Card, EmptyState, PageHeader } from '../components/ui'
import { hasEmployeePermission } from '../lib/employeePermissions'
import { useLocale } from '../locale'

const CHART_DEBOUNCE = 120
const STATIC_CHART = { isAnimationActive: false as const }

type UnitOption = { id: number; name: string }
type LocationOption = { id: number; name: string; unitId: number; unitName: string }
type LegalEntityOption = { id: number; name: string; currency: string }
type InvoiceSeriesOption = { id: number; name: string; legalEntityId: number; legalEntityName: string; unitId?: number | null }
type EmployeeOption = { loginAccountId: number; name: string; unitIds: number[] }
type ServiceTemplateOption = { id: number; name: string }
type LocalServiceOption = { id: number; name: string; unitId: number; unitName: string; workspaceServiceTemplateId?: number | null }

type FiltersResponse = {
  units: UnitOption[]
  locations: LocationOption[]
  legalEntities: LegalEntityOption[]
  invoiceSeries: InvoiceSeriesOption[]
  employees: EmployeeOption[]
  workspaceServices: ServiceTemplateOption[]
  localServices: LocalServiceOption[]
  bookingStatuses: string[]
  paymentStatuses: string[]
}

type BookingMetrics = {
  bookings: number
  completed: number
  reserved: number
  cancelled: number
  noShows: number
  bookedMinutes: number
  newClients: number
  returningClients: number
}

type CurrencyAmount = { currency: string; amount: number }
type CurrencyMetrics = {
  currency: string
  issuedInvoices: number
  issuedGross: number
  paidGross: number
  openGross: number
  refundedGross: number
  averageInvoiceGross: number
}
type TrendPoint = BookingMetrics & { date: string; revenue: CurrencyAmount[] }
type DimensionMetric = {
  id: number
  name: string
  parentId?: number | null
  parentName?: string | null
  bookings: number
  completed: number
  cancelled: number
  noShows: number
  bookedMinutes: number
  availableMinutes?: number | null
  utilizationPercent?: number | null
  revenue: CurrencyAmount[]
}
type InvoiceStatusMetric = { currency: string; paymentStatus: string; invoiceCount: number; grossAmount: number }
type OverviewResponse = {
  rangeStart: string
  rangeEnd: string
  previousRangeStart: string
  previousRangeEnd: string
  selectedUnitIds: number[]
  current: BookingMetrics
  previous: BookingMetrics
  currencies: CurrencyMetrics[]
  previousCurrencies: CurrencyMetrics[]
  trend: TrendPoint[]
  units: DimensionMetric[]
  locations: DimensionMetric[]
  employees: DimensionMetric[]
  services: DimensionMetric[]
  invoiceStatusBreakdown: InvoiceStatusMetric[]
  generatedAt: string
}

type Preset = '7d' | 'month' | 'year' | 'custom'

type Copy = {
  title: string
  subtitle: string
  currentUnit: string
  workspace: string
  filters: string
  allUnits: string
  allLocations: string
  allIssuers: string
  allSeries: string
  allEmployees: string
  allServices: string
  workspaceService: string
  localService: string
  allBookingStatuses: string
  allPaymentStatuses: string
  bookings: string
  completed: string
  cancelled: string
  noShows: string
  noShowRate: string
  newClients: string
  returningClients: string
  bookedHours: string
  revenue: string
  paid: string
  open: string
  refunds: string
  averageInvoice: string
  previousPeriod: string
  trend: string
  unitComparison: string
  locationComparison: string
  serviceComparison: string
  employeeComparison: string
  invoiceBreakdown: string
  currency: string
  status: string
  invoices: string
  name: string
  unit: string
  utilization: string
  exportCsv: string
  exportExcel: string
  loading: string
  noData: string
  generated: string
  dateFrom: string
  dateTo: string
}

const COPY: Record<'en' | 'sl' | 'sr', Copy> = {
  en: {
    title: 'Workspace analytics', subtitle: 'Compare performance across every accessible operating unit without mixing currencies or ownership.',
    currentUnit: 'Current unit', workspace: 'Entire workspace', filters: 'Filters', allUnits: 'All units', allLocations: 'All locations',
    allIssuers: 'All legal entities', allSeries: 'All invoice series', allEmployees: 'All employees', allServices: 'All services',
    workspaceService: 'Shared service', localService: 'Local service', allBookingStatuses: 'All booking statuses', allPaymentStatuses: 'All payment statuses', bookings: 'Bookings', completed: 'Completed',
    cancelled: 'Cancelled', noShows: 'No-shows', noShowRate: 'No-show rate', newClients: 'New clients', returningClients: 'Returning clients', bookedHours: 'Booked hours',
    revenue: 'Issued gross revenue', paid: 'Paid', open: 'Open', refunds: 'Refunds', averageInvoice: 'Average invoice', previousPeriod: 'Previous period',
    trend: 'Workspace trend', unitComparison: 'Operating-unit comparison', locationComparison: 'Location comparison', serviceComparison: 'Service comparison',
    employeeComparison: 'Employee comparison', invoiceBreakdown: 'Invoice and payment breakdown', currency: 'Currency', status: 'Status', invoices: 'Invoices', name: 'Name', unit: 'Unit', utilization: 'Utilization',
    exportCsv: 'Export CSV', exportExcel: 'Export Excel', loading: 'Loading workspace analytics…', noData: 'No activity matches these filters.',
    generated: 'Generated', dateFrom: 'From', dateTo: 'To',
  },
  sl: {
    title: 'Analitika delovnega prostora', subtitle: 'Primerjajte uspešnost vseh dostopnih poslovnih enot brez mešanja valut ali lastništva.',
    currentUnit: 'Trenutna enota', workspace: 'Celoten delovni prostor', filters: 'Filtri', allUnits: 'Vse enote', allLocations: 'Vse lokacije',
    allIssuers: 'Vsi pravni izdajatelji', allSeries: 'Vse serije računov', allEmployees: 'Vsi zaposleni', allServices: 'Vse storitve',
    workspaceService: 'Skupna storitev', localService: 'Lokalna storitev', allBookingStatuses: 'Vsi statusi rezervacij', allPaymentStatuses: 'Vsi statusi plačil', bookings: 'Rezervacije', completed: 'Zaključeno',
    cancelled: 'Odpovedano', noShows: 'Ni prišel', noShowRate: 'Delež nedolaska', newClients: 'Nove stranke', returningClients: 'Obstoječe stranke', bookedHours: 'Rezervirane ure',
    revenue: 'Izdani bruto prihodki', paid: 'Plačano', open: 'Odprto', refunds: 'Dobropisi', averageInvoice: 'Povprečni račun', previousPeriod: 'Prejšnje obdobje',
    trend: 'Trend delovnega prostora', unitComparison: 'Primerjava poslovnih enot', locationComparison: 'Primerjava lokacij', serviceComparison: 'Primerjava storitev',
    employeeComparison: 'Primerjava zaposlenih', invoiceBreakdown: 'Razčlenitev računov in plačil', currency: 'Valuta', status: 'Status', invoices: 'Računi', name: 'Naziv', unit: 'Enota', utilization: 'Izkoriščenost',
    exportCsv: 'Izvozi CSV', exportExcel: 'Izvozi Excel', loading: 'Nalaganje analitike delovnega prostora…', noData: 'Za izbrane filtre ni aktivnosti.',
    generated: 'Pripravljeno', dateFrom: 'Od', dateTo: 'Do',
  },
  sr: {
    title: 'Analitika radnog prostora', subtitle: 'Uporedite rezultate svih dostupnih poslovnih jedinica bez mešanja valuta ili vlasništva.',
    currentUnit: 'Trenutna jedinica', workspace: 'Ceo radni prostor', filters: 'Filteri', allUnits: 'Sve jedinice', allLocations: 'Sve lokacije',
    allIssuers: 'Sva pravna lica', allSeries: 'Sve serije računa', allEmployees: 'Svi zaposleni', allServices: 'Sve usluge',
    workspaceService: 'Zajednička usluga', localService: 'Lokalna usluga', allBookingStatuses: 'Svi statusi rezervacija', allPaymentStatuses: 'Svi statusi plaćanja', bookings: 'Rezervacije', completed: 'Završeno',
    cancelled: 'Otkazano', noShows: 'Nedolazak', noShowRate: 'Stopa nedolaska', newClients: 'Novi klijenti', returningClients: 'Postojeći klijenti', bookedHours: 'Rezervisani sati',
    revenue: 'Izdati bruto prihod', paid: 'Plaćeno', open: 'Otvoreno', refunds: 'Povraćaji', averageInvoice: 'Prosečan račun', previousPeriod: 'Prethodni period',
    trend: 'Trend radnog prostora', unitComparison: 'Poređenje poslovnih jedinica', locationComparison: 'Poređenje lokacija', serviceComparison: 'Poređenje usluga',
    employeeComparison: 'Poređenje zaposlenih', invoiceBreakdown: 'Pregled računa i plaćanja', currency: 'Valuta', status: 'Status', invoices: 'Računi', name: 'Naziv', unit: 'Jedinica', utilization: 'Iskorišćenost',
    exportCsv: 'Izvezi CSV', exportExcel: 'Izvezi Excel', loading: 'Učitavanje analitike radnog prostora…', noData: 'Nema aktivnosti za izabrane filtere.',
    generated: 'Generisano', dateFrom: 'Od', dateTo: 'Do',
  },
}

function localDate(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function presetRange(preset: Preset) {
  const to = new Date()
  const from = new Date(to.getFullYear(), to.getMonth(), to.getDate())
  if (preset === '7d') from.setDate(from.getDate() - 6)
  if (preset === 'month') from.setDate(1)
  if (preset === 'year') { from.setMonth(0); from.setDate(1) }
  return { from: localDate(from), to: localDate(to) }
}

function money(value: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale === 'sl' ? 'sl-SI' : locale === 'sr' ? 'sr-Latn-RS' : 'en-US', {
    style: 'currency', currency, maximumFractionDigits: 2,
  }).format(Number(value || 0))
}

function hours(minutes: number) {
  return `${(Number(minutes || 0) / 60).toFixed(1)} h`
}

function delta(current: number, previous: number) {
  if (!previous) return current ? 100 : 0
  return ((current - previous) / Math.abs(previous)) * 100
}

function revenueLabel(values: CurrencyAmount[], locale: string) {
  if (!values.length) return '—'
  return values.map((item) => money(item.amount, item.currency, locale)).join(' · ')
}

function buildParams(filters: {
  from: string; to: string; unitId: string; locationId: string; legalEntityId: string; invoiceSeriesId: string;
  employeeId: string; workspaceServiceId: string; sessionTypeId: string; bookingStatus: string; paymentStatus: string
}) {
  const params = new URLSearchParams()
  params.set('from', filters.from)
  params.set('to', filters.to)
  const append = (name: string, value: string) => { if (value) params.append(name, value) }
  append('unitIds', filters.unitId)
  append('locationIds', filters.locationId)
  append('legalEntityIds', filters.legalEntityId)
  append('invoiceSeriesIds', filters.invoiceSeriesId)
  append('employeeLoginAccountIds', filters.employeeId)
  append('workspaceServiceTemplateIds', filters.workspaceServiceId)
  append('sessionTypeIds', filters.sessionTypeId)
  append('bookingStatuses', filters.bookingStatus)
  append('paymentStatuses', filters.paymentStatus)
  return params
}

function KpiCard({ label, value, current, previous }: { label: string; value: string; current?: number; previous?: number }) {
  const change = current == null || previous == null ? null : delta(current, previous)
  return (
    <Card className="workspace-analytics-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
      {change != null && <small className={change > 0 ? 'positive' : change < 0 ? 'negative' : ''}>{change >= 0 ? '+' : ''}{change.toFixed(1)}%</small>}
    </Card>
  )
}

function DimensionTable({ title, rows, copy, locale }: { title: string; rows: DimensionMetric[]; copy: Copy; locale: string }) {
  return (
    <Card className="workspace-analytics-table-card">
      <div className="workspace-analytics-section-heading"><h3>{title}</h3></div>
      {rows.length === 0 ? <p className="muted">{copy.noData}</p> : (
        <div className="workspace-analytics-table-wrap">
          <table className="workspace-analytics-table">
            <thead><tr><th>{copy.name}</th><th>{copy.unit}</th><th>{copy.bookings}</th><th>{copy.completed}</th><th>{copy.cancelled}</th><th>{copy.noShows}</th><th>{copy.bookedHours}</th><th>{copy.utilization}</th><th>{copy.revenue}</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${title}-${row.id}`}>
                  <td><strong>{row.name}</strong></td><td>{row.parentName || '—'}</td><td>{row.bookings}</td><td>{row.completed}</td><td>{row.cancelled}</td><td>{row.noShows}</td>
                  <td>{hours(row.bookedMinutes)}</td><td>{row.utilizationPercent == null ? '—' : `${row.utilizationPercent.toFixed(1)}%`}</td><td>{revenueLabel(row.revenue, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

export function WorkspaceAnalyticsPage() {
  const me = useAuthenticatedUser()
  const { locale } = useLocale()
  const language = locale === 'sl' || locale === 'sr' ? locale : 'en'
  const copy = COPY[language]
  const initial = presetRange('month')
  const [preset, setPreset] = useState<Preset>('month')
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [unitId, setUnitId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [legalEntityId, setLegalEntityId] = useState('')
  const [invoiceSeriesId, setInvoiceSeriesId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [workspaceServiceId, setWorkspaceServiceId] = useState('')
  const [sessionTypeId, setSessionTypeId] = useState('')
  const [bookingStatus, setBookingStatus] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('')

  const reportingUnits = (me.units ?? []).filter((unit) => unit.workspaceId === me.workspaceId && hasEmployeePermission(unit, 'REPORTS_ANALYTICS_VIEW'))
  const hasMultipleUnits = reportingUnits.length > 1
  const selected = { from, to, unitId, locationId, legalEntityId, invoiceSeriesId, employeeId, workspaceServiceId, sessionTypeId, bookingStatus, paymentStatus }
  const params = useMemo(() => buildParams(selected), [from, to, unitId, locationId, legalEntityId, invoiceSeriesId, employeeId, workspaceServiceId, sessionTypeId, bookingStatus, paymentStatus])

  const filtersQuery = useQuery<FiltersResponse>({
    queryKey: ['workspace-analytics-filters', unitId],
    queryFn: async () => {
      const filterParams = new URLSearchParams()
      if (unitId) filterParams.append('unitIds', unitId)
      const response = await api.get<FiltersResponse>('/analytics/workspace/filters', { params: filterParams })
      return response.data
    },
  })

  const overviewQuery = useQuery<OverviewResponse>({
    queryKey: ['workspace-analytics-overview', params.toString()],
    enabled: !!from && !!to,
    queryFn: async () => (await api.get<OverviewResponse>('/analytics/workspace/overview', { params })).data,
  })

  const data = overviewQuery.data
  const currencyCodes = useMemo(() => Array.from(new Set((data?.trend ?? []).flatMap((point) => point.revenue.map((item) => item.currency)))), [data?.trend])
  const currencyCards = useMemo(() => Array.from(new Set([
    ...(data?.currencies ?? []).map((item) => item.currency),
    ...(data?.previousCurrencies ?? []).map((item) => item.currency),
  ])).sort(), [data?.currencies, data?.previousCurrencies])
  const trendRows = useMemo(() => (data?.trend ?? []).map((point) => {
    const row: Record<string, string | number> = {
      date: point.date, bookings: point.bookings, completed: point.completed, cancelled: point.cancelled,
      noShows: point.noShows, newClients: point.newClients, returningClients: point.returningClients, bookedMinutes: point.bookedMinutes,
    }
    point.revenue.forEach((item) => { row[`revenue_${item.currency}`] = Number(item.amount || 0) })
    return row
  }), [data?.trend])
  const utilizationRows = data?.employees?.filter((row) => row.availableMinutes != null && row.availableMinutes > 0) ?? []
  const totalAvailableMinutes = utilizationRows.reduce((sum, row) => sum + Number(row.availableMinutes || 0), 0)
  const averageUtilization = totalAvailableMinutes > 0
    ? (utilizationRows.reduce((sum, row) => sum + Number(row.bookedMinutes || 0), 0) * 100) / totalAvailableMinutes
    : null
  const noShowRate = data?.current.bookings ? (data.current.noShows * 100) / data.current.bookings : 0
  const previousNoShowRate = data?.previous.bookings ? (data.previous.noShows * 100) / data.previous.bookings : 0

  const applyPreset = (next: Preset) => {
    setPreset(next)
    if (next !== 'custom') {
      const range = presetRange(next)
      setFrom(range.from)
      setTo(range.to)
    }
  }

  const download = async (format: 'csv' | 'excel') => {
    const exportParams = buildParams(selected)
    exportParams.set('format', format)
    const response = await api.get('/analytics/workspace/export', { params: exportParams, responseType: 'blob' })
    const disposition = String(response.headers['content-disposition'] || '')
    const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `workspace-analytics.${format === 'excel' ? 'xls' : 'csv'}`
    const url = URL.createObjectURL(response.data)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (!hasMultipleUnits) {
    return <div className="stack gap-lg"><PageHeader title={copy.title} subtitle={copy.subtitle} /><EmptyState title={copy.currentUnit} text={copy.noData} /></div>
  }

  return (
    <div className="stack gap-lg analytics-page workspace-analytics-page">
      <PageHeader title={copy.title} subtitle={copy.subtitle} />
      <div className="analytics-scope-switch" role="tablist">
        <Link to="/analytics">{copy.currentUnit}</Link>
        <Link to="/analytics/workspace" className="active">{copy.workspace}</Link>
      </div>

      <Card className="workspace-analytics-filter-card">
        <div className="workspace-analytics-filter-heading"><h3>{copy.filters}</h3><span>{copy.generated}: {data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : '—'}</span></div>
        <div className="workspace-analytics-presets">
          {(['7d', 'month', 'year', 'custom'] as Preset[]).map((item) => <button key={item} type="button" className={preset === item ? 'active' : ''} onClick={() => applyPreset(item)}>{item === 'month' ? 'M' : item === 'year' ? 'Y' : item === 'custom' ? '…' : '7D'}</button>)}
        </div>
        <div className="workspace-analytics-filter-grid">
          <label><span>{copy.dateFrom}</span><input type="date" value={from} onChange={(event) => { setPreset('custom'); setFrom(event.target.value) }} /></label>
          <label><span>{copy.dateTo}</span><input type="date" value={to} onChange={(event) => { setPreset('custom'); setTo(event.target.value) }} /></label>
          <label><span>{copy.unit}</span><select value={unitId} onChange={(event) => { setUnitId(event.target.value); setLocationId(''); setLegalEntityId(''); setInvoiceSeriesId(''); setEmployeeId(''); setWorkspaceServiceId(''); setSessionTypeId('') }}><option value="">{copy.allUnits}</option>{filtersQuery.data?.units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label><span>{copy.allLocations}</span><select value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="">{copy.allLocations}</option>{filtersQuery.data?.locations.map((item) => <option key={item.id} value={item.id}>{item.unitName} · {item.name}</option>)}</select></label>
          <label><span>{copy.allIssuers}</span><select value={legalEntityId} onChange={(event) => { setLegalEntityId(event.target.value); setInvoiceSeriesId('') }}><option value="">{copy.allIssuers}</option>{filtersQuery.data?.legalEntities.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.currency})</option>)}</select></label>
          <label><span>{copy.allSeries}</span><select value={invoiceSeriesId} onChange={(event) => setInvoiceSeriesId(event.target.value)}><option value="">{copy.allSeries}</option>{filtersQuery.data?.invoiceSeries.filter((item) => !legalEntityId || String(item.legalEntityId) === legalEntityId).map((item) => <option key={item.id} value={item.id}>{item.legalEntityName} · {item.name}</option>)}</select></label>
          <label><span>{copy.allEmployees}</span><select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}><option value="">{copy.allEmployees}</option>{filtersQuery.data?.employees.map((item) => <option key={item.loginAccountId} value={item.loginAccountId}>{item.name}</option>)}</select></label>
          <label><span>{copy.workspaceService}</span><select value={workspaceServiceId} onChange={(event) => { setWorkspaceServiceId(event.target.value); setSessionTypeId('') }}><option value="">{copy.allServices}</option>{filtersQuery.data?.workspaceServices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label><span>{copy.localService}</span><select value={sessionTypeId} onChange={(event) => setSessionTypeId(event.target.value)}><option value="">{copy.allServices}</option>{filtersQuery.data?.localServices.filter((item) => !workspaceServiceId || String(item.workspaceServiceTemplateId) === workspaceServiceId).map((item) => <option key={item.id} value={item.id}>{item.unitName} · {item.name}</option>)}</select></label>
          <label><span>{copy.allBookingStatuses}</span><select value={bookingStatus} onChange={(event) => setBookingStatus(event.target.value)}><option value="">{copy.allBookingStatuses}</option>{filtersQuery.data?.bookingStatuses.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label><span>{copy.allPaymentStatuses}</span><select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)}><option value="">{copy.allPaymentStatuses}</option>{filtersQuery.data?.paymentStatuses.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        </div>
        <div className="workspace-analytics-export-actions"><button type="button" className="secondary" onClick={() => download('csv')} disabled={!data}>{copy.exportCsv}</button><button type="button" className="secondary" onClick={() => download('excel')} disabled={!data}>{copy.exportExcel}</button></div>
      </Card>

      {overviewQuery.isLoading ? <Card><p>{copy.loading}</p></Card> : overviewQuery.isError ? <Card><p className="error">{overviewQuery.error instanceof Error ? overviewQuery.error.message : copy.noData}</p></Card> : !data ? null : (
        <>
          <div className="workspace-analytics-kpi-grid">
            <KpiCard label={copy.bookings} value={String(data.current.bookings)} current={data.current.bookings} previous={data.previous.bookings} />
            <KpiCard label={copy.completed} value={String(data.current.completed)} current={data.current.completed} previous={data.previous.completed} />
            <KpiCard label={copy.cancelled} value={String(data.current.cancelled)} current={data.current.cancelled} previous={data.previous.cancelled} />
            <KpiCard label={copy.noShowRate} value={`${noShowRate.toFixed(1)}%`} current={noShowRate} previous={previousNoShowRate} />
            <KpiCard label={copy.newClients} value={String(data.current.newClients)} current={data.current.newClients} previous={data.previous.newClients} />
            <KpiCard label={copy.returningClients} value={String(data.current.returningClients)} current={data.current.returningClients} previous={data.previous.returningClients} />
            <KpiCard label={copy.bookedHours} value={hours(data.current.bookedMinutes)} current={data.current.bookedMinutes} previous={data.previous.bookedMinutes} />
            {averageUtilization != null && <KpiCard label={copy.utilization} value={`${averageUtilization.toFixed(1)}%`} />}
          </div>

          <div className="workspace-analytics-currency-grid">
            {currencyCards.map((currencyCode) => {
              const currency = data.currencies.find((item) => item.currency === currencyCode) ?? { currency: currencyCode, issuedInvoices: 0, issuedGross: 0, paidGross: 0, openGross: 0, refundedGross: 0, averageInvoiceGross: 0 }
              const previous = data.previousCurrencies.find((item) => item.currency === currencyCode)
              return <Card key={currencyCode} className="workspace-analytics-currency-card"><div><span>{currencyCode}</span><strong>{money(currency.issuedGross, currencyCode, locale)}</strong><small>{copy.revenue}</small></div><dl><div><dt>{copy.paid}</dt><dd>{money(currency.paidGross, currencyCode, locale)}</dd></div><div><dt>{copy.open}</dt><dd>{money(currency.openGross, currencyCode, locale)}</dd></div><div><dt>{copy.refunds}</dt><dd>{money(currency.refundedGross, currencyCode, locale)}</dd></div><div><dt>{copy.averageInvoice}</dt><dd>{money(currency.averageInvoiceGross, currencyCode, locale)}</dd></div></dl><p>{copy.previousPeriod}: {money(previous?.issuedGross ?? 0, currencyCode, locale)} ({delta(currency.issuedGross, previous?.issuedGross ?? 0).toFixed(1)}%)</p></Card>
            })}
          </div>

          <div className="workspace-analytics-chart-grid">
            <Card className="workspace-analytics-chart-card"><div className="workspace-analytics-section-heading"><h3>{copy.trend}</h3><span>{data.rangeStart} – {data.rangeEnd}</span></div><div className="workspace-analytics-chart"><ResponsiveContainer width="100%" height="100%" minHeight={280} debounce={CHART_DEBOUNCE}><LineChart data={trendRows}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" minTickGap={24} /><YAxis yAxisId="left" /><YAxis yAxisId="right" orientation="right" /><Tooltip /><Legend /><Line {...STATIC_CHART} yAxisId="left" type="monotone" dataKey="bookings" name={copy.bookings} strokeWidth={2.5} dot={false} /><Line {...STATIC_CHART} yAxisId="left" type="monotone" dataKey="completed" name={copy.completed} strokeWidth={2} dot={false} />{currencyCodes.map((currency) => <Line key={currency} {...STATIC_CHART} yAxisId="right" type="monotone" dataKey={`revenue_${currency}`} name={`${copy.revenue} (${currency})`} strokeWidth={2.5} dot={false} />)}</LineChart></ResponsiveContainer></div></Card>
            <Card className="workspace-analytics-chart-card"><div className="workspace-analytics-section-heading"><h3>{copy.unitComparison}</h3></div><div className="workspace-analytics-chart"><ResponsiveContainer width="100%" height="100%" minHeight={280} debounce={CHART_DEBOUNCE}><BarChart data={data.units}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip /><Legend /><Bar {...STATIC_CHART} dataKey="bookings" name={copy.bookings} radius={[6, 6, 0, 0]} /><Bar {...STATIC_CHART} dataKey="completed" name={copy.completed} radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
          </div>

          <DimensionTable title={copy.unitComparison} rows={data.units} copy={copy} locale={locale} />
          <DimensionTable title={copy.locationComparison} rows={data.locations} copy={copy} locale={locale} />
          <DimensionTable title={copy.serviceComparison} rows={data.services} copy={copy} locale={locale} />
          <DimensionTable title={copy.employeeComparison} rows={data.employees} copy={copy} locale={locale} />

          <Card className="workspace-analytics-table-card"><div className="workspace-analytics-section-heading"><h3>{copy.invoiceBreakdown}</h3></div><div className="workspace-analytics-table-wrap"><table className="workspace-analytics-table"><thead><tr><th>{copy.currency}</th><th>{copy.status}</th><th>{copy.invoices}</th><th>{copy.revenue}</th></tr></thead><tbody>{data.invoiceStatusBreakdown.map((row) => <tr key={`${row.currency}-${row.paymentStatus}`}><td>{row.currency}</td><td>{row.paymentStatus}</td><td>{row.invoiceCount}</td><td>{money(row.grossAmount, row.currency, locale)}</td></tr>)}</tbody></table></div></Card>
        </>
      )}
    </div>
  )
}
