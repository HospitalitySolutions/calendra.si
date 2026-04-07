import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
import { getStoredUser } from '../auth'
import { useToast } from '../components/Toast'
import { Card, EmptyState, PageHeader } from '../components/ui'
import { fullName } from '../lib/format'
import { useLocale } from '../locale'

type PeriodPoint = {
  label: string
  year: number
  month?: number | null
  sessionsTotal: number
  clientsTotal: number
  sessionsStandard: number
  sessionsOnline: number
  newClients: number
  revenueNet: number
  revenueGross: number
}

type AnalyticsSummary = {
  sessionsTotal: number
  clientsTotal: number
  sessionsStandard: number
  sessionsOnline: number
  newClients: number
  revenueNet: number
  revenueGross: number
}

type WeekdayLoadPoint = {
  dayKey: string
  label: string
  sessionsTotal: number
  consultantMinutes: number
  spaceMinutes: number
  onlineSessions: number
  onsiteSessions: number
}

type WeekPoint = {
  label: string
  weekStart: string
  sessionsTotal: number
  newClients: number
  revenueGross: number
  consultantMinutes: number
  spaceMinutes: number
}

type RankedAmount = {
  label: string
  amount: number
  count: number
}

type UsageRanking = {
  label: string
  minutes: number
  sessionsTotal: number
}

type AnalyticsOverview = {
  period: 'day' | '7d' | 'month' | 'year' | 'custom'
  rangeStart: string
  rangeEnd: string
  summary: AnalyticsSummary
  months: PeriodPoint[]
  years: PeriodPoint[]
  weekdays: WeekdayLoadPoint[]
  weeks: WeekPoint[]
  topServices: RankedAmount[]
  topConsultants: RankedAmount[]
  topClients: RankedAmount[]
  topSpaces: UsageRanking[]
}

type ConsultantOption = { id: number; firstName: string; lastName: string; consultant?: boolean }
type SpaceOption = { id: number; name: string }
type TypeOption = { id: number; name: string }
type Preset = 'day' | '7d' | 'month' | 'year' | 'custom'
type ReportFrequency = 'DAILY' | 'WEEKLY'

function csvEscape(value: string | number) {
  const raw = String(value ?? '')
  if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
    return `"${raw.replace(/"/g, '""')}"`
  }
  return raw
}

function RankingCard({
  title,
  subtitle,
  items,
  valueFormatter,
  countLabel,
}: {
  title: string
  subtitle: string
  items: RankedAmount[]
  valueFormatter: (value: number) => string
  countLabel: string
}) {
  return (
    <Card className="analytics-ranking-card">
      <div className="analytics-card-heading">
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      {items.length === 0 ? (
        <div className="muted analytics-ranking-empty">—</div>
      ) : (
        <div className="analytics-ranking-list">
          {items.map((item, index) => (
            <div key={`${title}-${item.label}-${index}`} className="analytics-ranking-row">
              <div>
                <span className="analytics-ranking-index">#{index + 1}</span>
                <strong>{item.label}</strong>
                <span>{item.count} {countLabel}</span>
              </div>
              <div className="analytics-ranking-value">{valueFormatter(Number(item.amount || 0))}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function SpaceRankingCard({
  title,
  subtitle,
  items,
  minutesFormatter,
  sessionsLabel,
}: {
  title: string
  subtitle: string
  items: UsageRanking[]
  minutesFormatter: (value: number) => string
  sessionsLabel: string
}) {
  return (
    <Card className="analytics-ranking-card">
      <div className="analytics-card-heading">
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      {items.length === 0 ? (
        <div className="muted analytics-ranking-empty">—</div>
      ) : (
        <div className="analytics-ranking-list">
          {items.map((item, index) => (
            <div key={`${title}-${item.label}-${index}`} className="analytics-ranking-row">
              <div>
                <span className="analytics-ranking-index">#{index + 1}</span>
                <strong>{item.label}</strong>
                <span>{item.sessionsTotal} {sessionsLabel}</span>
              </div>
              <div className="analytics-ranking-value">{minutesFormatter(item.minutes)}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

export function AnalyticsPage() {
  const me = getStoredUser()!
  const { locale } = useLocale()
  const { showToast } = useToast()
  const [periodPreset, setPeriodPreset] = useState<Preset>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [consultantId, setConsultantId] = useState('')
  const [spaceId, setSpaceId] = useState('')
  const [typeId, setTypeId] = useState('')
  const [reportEnabled, setReportEnabled] = useState(false)
  const [reportFrequency, setReportFrequency] = useState<ReportFrequency>('WEEKLY')
  const [reportEmail, setReportEmail] = useState(me.email ?? '')
  const [savingReport, setSavingReport] = useState(false)
  const [sendingReport, setSendingReport] = useState(false)

  const text = locale === 'sl'
    ? {
        title: 'Analitika',
        subtitle: 'Pregled prihodkov, obremenjenosti ekipe in rasti strank na enem mestu.',
        custom: 'Po meri',
        allConsultants: 'Vsi zaposleni',
        allSpaces: 'Vsi prostori',
        allTypes: 'Vse vrste',
        range: 'Obdobje',
        customRangeHint: 'Za prikaz po meri izberite začetni in končni datum.',
        loading: 'Nalagam analitiko…',
        failed: 'Analitike ni bilo mogoče naložiti.',
        emptyTitle: 'Analitičnih podatkov še ni',
        emptyText: 'Ko ustvarite termine, stranke in račune, se bodo tukaj prikazali kazalniki.',
        export: 'Izvozi CSV',
        sendNow: 'Pošlji poročilo',
        filtersTitle: 'Filtri',
        heroRangePrefix: 'Aktivno obdobje',
        kpiSessions: 'Vsi termini',
        kpiRevenue: 'Prihodki bruto',
        kpiNewClients: 'Nove stranke',
        kpiActiveClients: 'Aktivne stranke',
        kpiOnlineShare: 'Spletni delež',
        kpiAvgRevenue: 'Povpr. prihodek/termin',
        sessionsTrendTitle: 'Trend terminov in strank',
        sessionsTrendSubtitle: 'Glavni pregled zasedenosti in pridobivanja novih strank po izbranem obdobju.',
        revenueTrendTitle: 'Trend prihodkov',
        revenueTrendSubtitle: 'Primerjava izdanih računov skozi čas.',
        weekdayLoadTitle: 'Obremenjenost po dnevih v tednu',
        weekdayLoadSubtitle: 'Kdaj so zaposleni in prostori najbolj zasedeni.',
        weeklyOpsTitle: 'Tedenski operativni pregled',
        weeklyOpsSubtitle: 'Primerjava opravljenih ur in obsega terminov po tednih.',
        sessionsLabel: 'Termini',
        activeClientsLabel: 'Aktivne stranke',
        newClientsLabel: 'Nove stranke',
        revenueLabel: 'Prihodki',
        grossLabel: 'Bruto',
        consultantHoursLabel: 'Ure zaposlenih',
        spaceHoursLabel: 'Ure prostorov',
        onlineLabel: 'Spletni',
        onsiteLabel: 'V živo',
        topServicesTitle: 'Najbolj donosne storitve',
        topServicesSubtitle: 'Storitev po ustvarjenem prihodku v izbranem obdobju.',
        topConsultantsTitle: 'Najbolj donosni zaposleni',
        topConsultantsSubtitle: 'Zaposleni razvrščeni po izdanih računih.',
        topClientsTitle: 'Najbolj donosne stranke',
        topClientsSubtitle: 'Stranke z največ ustvarjenega prihodka.',
        topSpacesTitle: 'Najbolj obremenjeni prostori',
        topSpacesSubtitle: 'Prostori z največ zasedenega časa.',
        countBills: 'rač.',
        countUnits: 'enot',
        countSessions: 'terminov',
        reportsTitle: 'Poročila za lastnike',
        reportsSubtitle: 'Shrani e-poštni naslov za digest in samodejno pošiljanje. Po želji lahko poročilo pošlješ tudi takoj.',
        reportsEnabled: 'Samodejna poročila',
        reportsEmail: 'E-poštni naslov',
        reportsFrequency: 'Pogostost',
        reportsDaily: 'Dnevno',
        reportsWeekly: 'Tedensko',
        saveSettings: 'Shrani nastavitve',
        reportSettingsSaved: 'Nastavitve poročil so shranjene.',
        reportSent: 'Analitično poročilo je bilo poslano.',
        reportSaveFailed: 'Nastavitev poročil ni bilo mogoče shraniti.',
        reportSendFailed: 'Poročila ni bilo mogoče poslati.',
        weekdayNames: {
          MONDAY: 'Pon',
          TUESDAY: 'Tor',
          WEDNESDAY: 'Sre',
          THURSDAY: 'Čet',
          FRIDAY: 'Pet',
          SATURDAY: 'Sob',
          SUNDAY: 'Ned',
        } as Record<string, string>,
      }
    : {
        title: 'Analytics',
        subtitle: 'Revenue, team load and client growth in one production-ready view.',
        custom: 'Custom',
        allConsultants: 'All consultants',
        allSpaces: 'All spaces',
        allTypes: 'All types',
        range: 'Range',
        customRangeHint: 'Choose both start and end dates for the custom range.',
        loading: 'Loading analytics…',
        failed: 'Failed to load analytics.',
        emptyTitle: 'No analytics data yet',
        emptyText: 'Create bookings, clients and issued bills to populate this view.',
        export: 'Export CSV',
        sendNow: 'Send report',
        filtersTitle: 'Filters',
        heroRangePrefix: 'Active range',
        kpiSessions: 'Sessions',
        kpiRevenue: 'Revenue gross',
        kpiNewClients: 'New clients',
        kpiActiveClients: 'Active clients',
        kpiOnlineShare: 'Online share',
        kpiAvgRevenue: 'Avg revenue / session',
        sessionsTrendTitle: 'Sessions and clients trend',
        sessionsTrendSubtitle: 'Core view of operational load and client acquisition over the selected window.',
        revenueTrendTitle: 'Revenue trend',
        revenueTrendSubtitle: 'Issued-bill performance over time.',
        weekdayLoadTitle: 'Weekday utilization',
        weekdayLoadSubtitle: 'When consultants and spaces are busiest.',
        weeklyOpsTitle: 'Weekly operations overview',
        weeklyOpsSubtitle: 'Delivered hours and session volume by week.',
        sessionsLabel: 'Sessions',
        activeClientsLabel: 'Active clients',
        newClientsLabel: 'New clients',
        revenueLabel: 'Revenue',
        grossLabel: 'Gross',
        consultantHoursLabel: 'Consultant hours',
        spaceHoursLabel: 'Space hours',
        onlineLabel: 'Online',
        onsiteLabel: 'On-site',
        topServicesTitle: 'Top services',
        topServicesSubtitle: 'Services ranked by generated revenue.',
        topConsultantsTitle: 'Top consultants',
        topConsultantsSubtitle: 'Team members ranked by billed revenue.',
        topClientsTitle: 'Top clients',
        topClientsSubtitle: 'Clients generating the most revenue.',
        topSpacesTitle: 'Top spaces',
        topSpacesSubtitle: 'Rooms with the highest booked time.',
        countBills: 'bills',
        countUnits: 'units',
        countSessions: 'sessions',
        reportsTitle: 'Owner reports',
        reportsSubtitle: 'Save a digest email address and automate delivery. You can also send the current filtered report right now.',
        reportsEnabled: 'Automatic reports',
        reportsEmail: 'Email address',
        reportsFrequency: 'Frequency',
        reportsDaily: 'Daily',
        reportsWeekly: 'Weekly',
        saveSettings: 'Save settings',
        reportSettingsSaved: 'Report settings saved.',
        reportSent: 'Analytics report sent.',
        reportSaveFailed: 'Could not save report settings.',
        reportSendFailed: 'Could not send the report.',
        weekdayNames: {
          MONDAY: 'Mon',
          TUESDAY: 'Tue',
          WEDNESDAY: 'Wed',
          THURSDAY: 'Thu',
          FRIDAY: 'Fri',
          SATURDAY: 'Sat',
          SUNDAY: 'Sun',
        } as Record<string, string>,
      }

  const canFetch = periodPreset !== 'custom' || (!!customFrom && !!customTo)

  const { data: filterData } = useQuery<{
    consultants: ConsultantOption[]
    spaces: SpaceOption[]
    types: TypeOption[]
  }>({
    queryKey: ['analytics-filters-meta', me.role],
    queryFn: async () => {
      const [usersRes, spacesRes, typesRes] = await Promise.all([
        me.role === 'ADMIN' ? api.get<ConsultantOption[]>('/users').catch(() => ({ data: [] as ConsultantOption[] })) : Promise.resolve({ data: [] as ConsultantOption[] }),
        api.get<SpaceOption[]>('/spaces').catch(() => ({ data: [] as SpaceOption[] })),
        api.get<TypeOption[]>('/types').catch(() => ({ data: [] as TypeOption[] })),
      ])
      return {
        consultants: (usersRes.data ?? []).filter((u) => u.consultant),
        spaces: spacesRes.data ?? [],
        types: typesRes.data ?? [],
      }
    },
  })

  const settingsQuery = useQuery<Record<string, string>>({
    queryKey: ['analytics-report-settings'],
    queryFn: async () => {
      const res = await api.get<Record<string, string>>('/settings')
      return res.data ?? {}
    },
  })

  useEffect(() => {
    const settings = settingsQuery.data
    if (!settings) return
    setReportEnabled((settings.ANALYTICS_REPORTS_ENABLED ?? 'false').toLowerCase() === 'true')
    setReportFrequency(((settings.ANALYTICS_REPORTS_FREQUENCY ?? 'WEEKLY').toUpperCase() === 'DAILY' ? 'DAILY' : 'WEEKLY'))
    setReportEmail(settings.ANALYTICS_REPORTS_EMAIL?.trim() || me.email || '')
  }, [settingsQuery.data, me.email])

  const { data, isLoading, isError } = useQuery<AnalyticsOverview>({
    queryKey: ['analytics-overview', periodPreset, customFrom, customTo, consultantId, spaceId, typeId],
    enabled: canFetch,
    queryFn: async () => {
      const params: Record<string, string | number> = { period: periodPreset }
      if (periodPreset === 'custom') {
        params.from = customFrom
        params.to = customTo
      }
      if (consultantId) params.consultantId = Number(consultantId)
      if (spaceId) params.spaceId = Number(spaceId)
      if (typeId) params.typeId = Number(typeId)
      const res = await api.get<AnalyticsOverview>('/analytics/overview', { params })
      return res.data
    },
  })

  const comparisonSeries = useMemo(() => (periodPreset === 'month' ? data?.months ?? [] : data?.years ?? []), [periodPreset, data?.months, data?.years])
  const isComparison = periodPreset === 'month' || periodPreset === 'year'

  const rangeLabel = useMemo(() => {
    if (!data) return ''
    const formatter = new Intl.DateTimeFormat(locale === 'sl' ? 'sl-SI' : undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    const from = formatter.format(new Date(`${data.rangeStart}T00:00:00`))
    const to = formatter.format(new Date(`${data.rangeEnd}T00:00:00`))
    return from === to ? from : `${from} – ${to}`
  }, [data, locale])

  const revenueFormatter = (value: number | string) => {
    const amount = typeof value === 'number' ? value : Number(value)
    return new Intl.NumberFormat(locale === 'sl' ? 'sl-SI' : undefined, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 2,
    }).format(Number.isFinite(amount) ? amount : 0)
  }

  const percentFormatter = (value: number) => new Intl.NumberFormat(locale === 'sl' ? 'sl-SI' : undefined, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value)

  const minutesFormatter = (value: number) => {
    const total = Math.max(0, Math.round(value))
    const hours = Math.floor(total / 60)
    const minutes = total % 60
    if (hours === 0) return `${minutes} min`
    if (minutes === 0) return `${hours} h`
    return `${hours} h ${minutes} min`
  }

  const summary = data?.summary ?? null
  const onlineShare = summary && summary.sessionsTotal > 0 ? summary.sessionsOnline / summary.sessionsTotal : 0
  const avgRevenuePerSession = summary && summary.sessionsTotal > 0 ? Number(summary.revenueGross || 0) / summary.sessionsTotal : 0

  const trendLabelFormatter = useMemo(() => {
    const shortMonth = new Intl.DateTimeFormat(locale === 'sl' ? 'sl-SI' : undefined, { month: 'short', year: '2-digit' })
    const shortWeek = new Intl.DateTimeFormat(locale === 'sl' ? 'sl-SI' : undefined, { day: 'numeric', month: 'short' })
    return {
      period(point: PeriodPoint) {
        if (point.month) return shortMonth.format(new Date(point.year, point.month - 1, 1))
        return String(point.year)
      },
      week(dateValue: string) {
        return shortWeek.format(new Date(`${dateValue}T00:00:00`))
      },
    }
  }, [locale])

  const activitySeries = useMemo(() => {
    if (isComparison) {
      return comparisonSeries.map((point) => ({
        label: trendLabelFormatter.period(point),
        sessionsTotal: point.sessionsTotal,
        clientsTotal: point.clientsTotal,
        newClients: point.newClients,
      }))
    }
    return (data?.weeks ?? []).map((point) => ({
      label: trendLabelFormatter.week(point.weekStart),
      sessionsTotal: point.sessionsTotal,
      newClients: point.newClients,
      consultantHours: Number((point.consultantMinutes / 60).toFixed(1)),
    }))
  }, [comparisonSeries, data?.weeks, isComparison, trendLabelFormatter])

  const revenueSeries = useMemo(() => {
    if (isComparison) {
      return comparisonSeries.map((point) => ({
        label: trendLabelFormatter.period(point),
        revenueGross: Number(point.revenueGross || 0),
        revenueNet: Number(point.revenueNet || 0),
      }))
    }
    return (data?.weeks ?? []).map((point) => ({
      label: trendLabelFormatter.week(point.weekStart),
      revenueGross: Number(point.revenueGross || 0),
      consultantHours: Number((point.consultantMinutes / 60).toFixed(1)),
    }))
  }, [comparisonSeries, data?.weeks, isComparison, trendLabelFormatter])

  const weekdaySeries = useMemo(() => (data?.weekdays ?? []).map((point) => ({
    ...point,
    label: text.weekdayNames[point.dayKey] ?? point.label,
    consultantHours: Number((point.consultantMinutes / 60).toFixed(1)),
    spaceHours: Number((point.spaceMinutes / 60).toFixed(1)),
  })), [data?.weekdays, text.weekdayNames])

  const weeklyOpsSeries = useMemo(() => (data?.weeks ?? []).map((point) => ({
    label: trendLabelFormatter.week(point.weekStart),
    revenueGross: Number(point.revenueGross || 0),
    consultantHours: Number((point.consultantMinutes / 60).toFixed(1)),
    spaceHours: Number((point.spaceMinutes / 60).toFixed(1)),
    sessionsTotal: point.sessionsTotal,
  })), [data?.weeks, trendLabelFormatter])

  const exportCsv = () => {
    if (!data || !summary) return
    const rows: Array<Array<string | number>> = [
      [text.title, rangeLabel],
      [],
      [text.kpiSessions, summary.sessionsTotal],
      [text.kpiRevenue, revenueFormatter(summary.revenueGross)],
      [text.kpiNewClients, summary.newClients],
      [text.kpiActiveClients, summary.clientsTotal],
      [text.kpiOnlineShare, percentFormatter(onlineShare)],
      [text.kpiAvgRevenue, revenueFormatter(avgRevenuePerSession)],
      [],
      [text.topServicesTitle],
      ['Name', text.revenueLabel, 'Count'],
      ...data.topServices.map((item) => [item.label, Number(item.amount || 0), item.count]),
      [],
      [text.topConsultantsTitle],
      ['Name', text.revenueLabel, 'Count'],
      ...data.topConsultants.map((item) => [item.label, Number(item.amount || 0), item.count]),
      [],
      [text.topClientsTitle],
      ['Name', text.revenueLabel, 'Count'],
      ...data.topClients.map((item) => [item.label, Number(item.amount || 0), item.count]),
      [],
      [text.topSpacesTitle],
      ['Name', text.spaceHoursLabel, text.sessionsLabel],
      ...data.topSpaces.map((item) => [item.label, minutesFormatter(item.minutes), item.sessionsTotal]),
    ]
    const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `analytics-${data.rangeStart}-${data.rangeEnd}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const saveReportSettings = async () => {
    setSavingReport(true)
    try {
      await api.put('/settings', {
        ANALYTICS_REPORTS_ENABLED: String(reportEnabled),
        ANALYTICS_REPORTS_FREQUENCY: reportFrequency,
        ANALYTICS_REPORTS_EMAIL: reportEmail.trim(),
      })
      await settingsQuery.refetch()
      showToast('success', text.reportSettingsSaved)
    } catch {
      showToast('error', text.reportSaveFailed)
    } finally {
      setSavingReport(false)
    }
  }

  const sendManualReport = async () => {
    if (!canFetch) return
    setSendingReport(true)
    try {
      const payload: Record<string, string | number> = {
        email: reportEmail.trim(),
        period: periodPreset,
      }
      if (periodPreset === 'custom') {
        payload.from = customFrom
        payload.to = customTo
      }
      if (consultantId) payload.consultantId = Number(consultantId)
      if (spaceId) payload.spaceId = Number(spaceId)
      if (typeId) payload.typeId = Number(typeId)
      await api.post('/analytics/report/send', payload)
      showToast('success', text.reportSent)
    } catch {
      showToast('error', text.reportSendFailed)
    } finally {
      setSendingReport(false)
    }
  }

  return (
    <div className="stack gap-lg analytics-page">
      <PageHeader title={text.title} subtitle={text.subtitle} />

      <Card className="analytics-hero">
        <div className="analytics-hero__copy">
          <span className="analytics-hero__eyebrow">{text.filtersTitle}</span>
          <div className="analytics-hero__meta">
            <strong>{text.heroRangePrefix}</strong>
            <span>{rangeLabel || '—'}</span>
          </div>
        </div>
        <div className="analytics-hero__actions">
          <button type="button" className="secondary" onClick={exportCsv} disabled={!summary}>{text.export}</button>
          <button type="button" onClick={sendManualReport} disabled={!summary || !canFetch || sendingReport}>
            {sendingReport ? `${text.sendNow}…` : text.sendNow}
          </button>
        </div>
      </Card>

      <Card className="analytics-filter-card">
        <div className="analytics-filters-row">
          <div className="analytics-filter-group">
            <button type="button" className={periodPreset === 'day' ? 'active' : ''} onClick={() => setPeriodPreset('day')}>1D</button>
            <button type="button" className={periodPreset === '7d' ? 'active' : ''} onClick={() => setPeriodPreset('7d')}>7D</button>
            <button type="button" className={periodPreset === 'month' ? 'active' : ''} onClick={() => setPeriodPreset('month')}>1M</button>
            <button type="button" className={periodPreset === 'year' ? 'active' : ''} onClick={() => setPeriodPreset('year')}>1L</button>
            <button type="button" className={periodPreset === 'custom' ? 'active' : ''} onClick={() => setPeriodPreset('custom')}>{text.custom}</button>
          </div>
          <div className="analytics-select-filters">
            {me.role === 'ADMIN' && (
              <select value={consultantId} onChange={(e) => setConsultantId(e.target.value)}>
                <option value="">{text.allConsultants}</option>
                {(filterData?.consultants ?? []).map((u) => <option key={u.id} value={u.id}>{fullName(u)}</option>)}
              </select>
            )}
            <select value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
              <option value="">{text.allSpaces}</option>
              {(filterData?.spaces ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              <option value="">{text.allTypes}</option>
              {(filterData?.types ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
        </div>
        {periodPreset === 'custom' && (
          <div className="analytics-custom-range">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} aria-label={`${text.range} from`} />
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} aria-label={`${text.range} to`} />
          </div>
        )}
      </Card>

      {!canFetch ? (
        <Card><div className="muted">{text.customRangeHint}</div></Card>
      ) : isLoading ? (
        <Card><div className="muted">{text.loading}</div></Card>
      ) : isError ? (
        <Card><div className="error">{text.failed}</div></Card>
      ) : !summary ? (
        <Card><EmptyState title={text.emptyTitle} text={text.emptyText} /></Card>
      ) : (
        <>
          <div className="analytics-kpis analytics-kpis--modern">
            <Card className="analytics-kpi-card analytics-kpi-card--modern"><span>{text.kpiSessions}</span><strong>{summary.sessionsTotal}</strong></Card>
            <Card className="analytics-kpi-card analytics-kpi-card--modern"><span>{text.kpiRevenue}</span><strong>{revenueFormatter(summary.revenueGross)}</strong></Card>
            <Card className="analytics-kpi-card analytics-kpi-card--modern"><span>{text.kpiNewClients}</span><strong>{summary.newClients}</strong></Card>
            <Card className="analytics-kpi-card analytics-kpi-card--modern"><span>{text.kpiActiveClients}</span><strong>{summary.clientsTotal}</strong></Card>
            <Card className="analytics-kpi-card analytics-kpi-card--modern"><span>{text.kpiOnlineShare}</span><strong>{percentFormatter(onlineShare)}</strong></Card>
            <Card className="analytics-kpi-card analytics-kpi-card--modern"><span>{text.kpiAvgRevenue}</span><strong>{revenueFormatter(avgRevenuePerSession)}</strong></Card>
          </div>

          <div className="analytics-grid analytics-grid--modern">
            <Card className="analytics-chart-card analytics-chart-card--modern">
              <div className="analytics-card-heading">
                <h3>{text.sessionsTrendTitle}</h3>
                <p>{text.sessionsTrendSubtitle}</p>
              </div>
              <div className="analytics-chart-wrap analytics-chart-wrap--modern">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activitySeries}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={18} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="sessionsTotal" name={text.sessionsLabel} fill="#60a5fa" radius={[8, 8, 0, 0]} />
                    {isComparison ? (
                      <>
                        <Line type="monotone" dataKey="clientsTotal" name={text.activeClientsLabel} stroke="#22c55e" strokeWidth={2.5} dot={false} />
                        <Line type="monotone" dataKey="newClients" name={text.newClientsLabel} stroke="#f59e0b" strokeWidth={2.5} dot={false} />
                      </>
                    ) : (
                      <Line type="monotone" dataKey="consultantHours" name={text.consultantHoursLabel} stroke="#22c55e" strokeWidth={2.5} dot={false} />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="analytics-chart-card analytics-chart-card--modern">
              <div className="analytics-card-heading">
                <h3>{text.revenueTrendTitle}</h3>
                <p>{text.revenueTrendSubtitle}</p>
              </div>
              <div className="analytics-chart-wrap analytics-chart-wrap--modern">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenueSeries}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={18} />
                    <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                    <Tooltip formatter={(v) => revenueFormatter(v as number)} />
                    <Legend />
                    <Line type="monotone" dataKey="revenueGross" name={text.grossLabel} stroke="#3b82f6" strokeWidth={2.8} dot={false} />
                    {isComparison ? (
                      <Line type="monotone" dataKey="revenueNet" name="Net" stroke="#f97316" strokeWidth={2.4} dot={false} />
                    ) : (
                      <Line type="monotone" dataKey="consultantHours" name={text.consultantHoursLabel} stroke="#22c55e" strokeWidth={2.2} dot={false} />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="analytics-chart-card analytics-chart-card--modern">
              <div className="analytics-card-heading">
                <h3>{text.weekdayLoadTitle}</h3>
                <p>{text.weekdayLoadSubtitle}</p>
              </div>
              <div className="analytics-chart-wrap analytics-chart-wrap--modern">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekdaySeries}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip formatter={(v) => `${v} h`} />
                    <Legend />
                    <Bar dataKey="consultantHours" name={text.consultantHoursLabel} fill="#60a5fa" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="spaceHours" name={text.spaceHoursLabel} fill="#22c55e" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="analytics-chart-card analytics-chart-card--modern">
              <div className="analytics-card-heading">
                <h3>{text.weeklyOpsTitle}</h3>
                <p>{text.weeklyOpsSubtitle}</p>
              </div>
              <div className="analytics-chart-wrap analytics-chart-wrap--modern">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyOpsSeries}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={18} />
                    <YAxis allowDecimals={false} />
                    <Tooltip formatter={(value, name) => name === text.revenueLabel ? revenueFormatter(value as number) : value} />
                    <Legend />
                    <Bar dataKey="sessionsTotal" name={text.sessionsLabel} fill="#60a5fa" radius={[8, 8, 0, 0]} />
                    <Line type="monotone" dataKey="consultantHours" name={text.consultantHoursLabel} stroke="#22c55e" strokeWidth={2.2} dot={false} />
                    <Line type="monotone" dataKey="spaceHours" name={text.spaceHoursLabel} stroke="#f59e0b" strokeWidth={2.2} dot={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="analytics-grid analytics-grid--modern analytics-grid--insights">
            <RankingCard
              title={text.topServicesTitle}
              subtitle={text.topServicesSubtitle}
              items={data.topServices}
              valueFormatter={revenueFormatter}
              countLabel={text.countUnits}
            />
            <RankingCard
              title={text.topConsultantsTitle}
              subtitle={text.topConsultantsSubtitle}
              items={data.topConsultants}
              valueFormatter={revenueFormatter}
              countLabel={text.countBills}
            />
            <RankingCard
              title={text.topClientsTitle}
              subtitle={text.topClientsSubtitle}
              items={data.topClients}
              valueFormatter={revenueFormatter}
              countLabel={text.countBills}
            />
            <SpaceRankingCard
              title={text.topSpacesTitle}
              subtitle={text.topSpacesSubtitle}
              items={data.topSpaces}
              minutesFormatter={minutesFormatter}
              sessionsLabel={text.countSessions}
            />
            <Card className="analytics-ranking-card analytics-report-card">
              <div className="analytics-card-heading">
                <h3>{text.reportsTitle}</h3>
                <p>{text.reportsSubtitle}</p>
              </div>
              <div className="analytics-report-grid">
                <label className="analytics-report-toggle">
                  <input type="checkbox" checked={reportEnabled} onChange={(e) => setReportEnabled(e.target.checked)} />
                  <span>{text.reportsEnabled}</span>
                </label>
                <label className="field">
                  <span className="field-label">{text.reportsEmail}</span>
                  <input value={reportEmail} onChange={(e) => setReportEmail(e.target.value)} placeholder="owner@company.com" />
                </label>
                <label className="field">
                  <span className="field-label">{text.reportsFrequency}</span>
                  <select value={reportFrequency} onChange={(e) => setReportFrequency(e.target.value as ReportFrequency)}>
                    <option value="DAILY">{text.reportsDaily}</option>
                    <option value="WEEKLY">{text.reportsWeekly}</option>
                  </select>
                </label>
              </div>
              <div className="analytics-report-actions">
                <button type="button" className="secondary" onClick={saveReportSettings} disabled={savingReport}>
                  {savingReport ? `${text.saveSettings}…` : text.saveSettings}
                </button>
                <button type="button" onClick={sendManualReport} disabled={sendingReport || !canFetch}>
                  {sendingReport ? `${text.sendNow}…` : text.sendNow}
                </button>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
