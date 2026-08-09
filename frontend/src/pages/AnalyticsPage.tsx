import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Area,
  AreaChart,
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
import { settingsQueryOptions } from '../queries/sharedQueryOptions'
import { useAuthenticatedUser } from '../authUserContext'
import { Card, EmptyState } from '../components/ui'
import { fullName } from '../lib/format'
import { hasEmployeePermission } from '../lib/employeePermissions'
import { isWorkspaceRolloutEnabled } from '../lib/workspaceRollout'
import { useLocale } from '../locale'
import { AnalyticsReportsPanel } from './AnalyticsReportsPanel'

/** Recharts `debounce` defaults to 0, so every ResizeObserver frame reflows charts. Sidebar width CSS transitions fire many resizes/sec; debouncing coalesces to one layout after the rail settles. */
const ANALYTICS_CHART_RESIZE_DEBOUNCE_MS = 120

/** Disable bar/line mount and update animations — charts render statically (better with sidebar resize + less motion). */
const ANALYTICS_CHART_STATIC = { isAnimationActive: false as const }
const MOBILE_ANALYTICS_PALETTE = ['#1672f3', '#75a9f8', '#72ced0', '#f5c558', '#8a78ee']

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

type ServiceMetric = {
  serviceId: number | null
  serviceName: string
  bookings: number
  completed: number
  cancelled: number
  noShows: number
  bookedMinutes: number
  revenueGross: number
  waitlistRequests: number
  waitlistOffers: number
  acceptedOffers: number
  waitlistConversionRate: number
}

type ServiceGroupMetric = {
  serviceGroupId: number | null
  serviceGroupName: string
  active: boolean
  bookings: number
  completed: number
  cancelled: number
  noShows: number
  bookedMinutes: number
  revenueGross: number
  waitlistRequests: number
  waitlistOffers: number
  acceptedOffers: number
  waitlistConversionRate: number
  services: ServiceMetric[]
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
  serviceGroups: ServiceGroupMetric[]
}

type ConsultantOption = { id: number; firstName: string; lastName: string; consultant?: boolean }
type SpaceOption = { id: number; name: string }
type TypeOption = { id: number; name: string; description?: string | null; internalDescription?: string | null; serviceGroupId?: number | null; serviceGroupName?: string | null }
type ServiceGroupOption = { id: number; name: string; active: boolean; sortOrder: number; serviceCount: number }
type Preset = 'day' | '7d' | 'month' | 'quarter' | 'year' | 'custom'
type ActivityChartRow = {
  label: string
  sessionsTotal: number
  newClients: number
  clientsTotal?: number
  consultantHours?: number
}

type RevenueChartRow = {
  label: string
  revenueGross: number
  revenueNet?: number
  consultantHours?: number
}

function toIsoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function csvEscape(value: string | number) {
  const raw = String(value ?? '')
  if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
    return `"${raw.replace(/"/g, '""')}"`
  }
  return raw
}

type AnalyticsMobileIconName = 'revenue' | 'bookings' | 'clients' | 'activeClients' | 'cancellation' | 'average' | 'calendar' | 'filter'

function AnalyticsMobileIcon({ name }: { name: AnalyticsMobileIconName }) {
  if (name === 'revenue') {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M18 7.2A7 7 0 1 0 18 16.8"/><path d="M5.5 10h8M5.5 14h7"/></svg>
  }
  if (name === 'bookings' || name === 'calendar') {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>
  }
  if (name === 'clients') {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M16 11h6"/></svg>
  }
  if (name === 'activeClients') {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M17 11h6M20 8v6"/><path d="M17 4.5a3.5 3.5 0 0 1 0 6.8"/></svg>
  }
  if (name === 'cancellation') {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v6h-6"/></svg>
  }
  if (name === 'average') {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 5h16M7 12h10M10 19h4"/></svg>
}

function AnalyticsMobileKpiCard({
  icon,
  label,
  value,
  trend,
}: {
  icon: AnalyticsMobileIconName
  label: string
  value: string
  trend: string | null
}) {
  return (
    <Card className="analytics-mobile-kpi-card">
      <span className={`analytics-mobile-kpi-icon analytics-mobile-kpi-icon--${icon}`}><AnalyticsMobileIcon name={icon} /></span>
      <div className="analytics-mobile-kpi-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small className={trend?.startsWith('↓') ? 'is-negative' : trend ? 'is-positive' : ''}>
          {trend || '—'}
        </small>
      </div>
    </Card>
  )
}

function AnalyticsDesktopKpiCard({
  icon,
  tone,
  label,
  value,
  trend,
  comparisonLabel,
}: {
  icon: AnalyticsMobileIconName
  tone: 'blue' | 'green' | 'red' | 'purple' | 'amber'
  label: string
  value: string
  trend: string | null
  comparisonLabel: string
}) {
  const trendClass = trend?.startsWith('↓') ? 'is-negative' : trend ? 'is-positive' : 'is-neutral'
  return (
    <Card className="analytics-desktop-kpi-card">
      <span className={`analytics-desktop-kpi-icon analytics-desktop-kpi-icon--${tone}`}>
        <AnalyticsMobileIcon name={icon} />
      </span>
      <div className="analytics-desktop-kpi-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small className={trendClass}>{trend || '—'}</small>
        <em>{comparisonLabel}</em>
      </div>
    </Card>
  )
}

type ReportLanguage = 'en' | 'sl' | 'sr'
type AnalyticsTab = 'overview' | 'reports'

type AnalyticsCopy = {
  title: string
  subtitle: string
  custom: string
  allConsultants: string
  allSpaces: string
  allTypes: string
  range: string
  customRangeHint: string
  loading: string
  failed: string
  emptyTitle: string
  emptyText: string
  export: string
  filtersTitle: string
  heroRangePrefix: string
  kpiSessions: string
  kpiRevenue: string
  kpiNewClients: string
  kpiActiveClients: string
  kpiOnlineShare: string
  kpiAvgRevenue: string
  sessionsTrendTitle: string
  sessionsTrendSubtitle: string
  revenueTrendTitle: string
  revenueTrendSubtitle: string
  weekdayLoadTitle: string
  weekdayLoadSubtitle: string
  weeklyOpsTitle: string
  weeklyOpsSubtitle: string
  sessionsLabel: string
  activeClientsLabel: string
  newClientsLabel: string
  revenueLabel: string
  grossLabel: string
  consultantHoursLabel: string
  spaceHoursLabel: string
  topServicesTitle: string
  topServicesSubtitle: string
  topConsultantsTitle: string
  topConsultantsSubtitle: string
  topClientsTitle: string
  topClientsSubtitle: string
  topSpacesTitle: string
  topSpacesSubtitle: string
  countBills: string
  countUnits: string
  countSessions: string
  weekdayNames: Record<string, string>
  tabOverview: string
  tabReports: string
}

const ANALYTICS_COPY: Record<ReportLanguage, AnalyticsCopy> = {
  en: {
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
    weekdayNames: {
      MONDAY: 'Mon',
      TUESDAY: 'Tue',
      WEDNESDAY: 'Wed',
      THURSDAY: 'Thu',
      FRIDAY: 'Fri',
      SATURDAY: 'Sat',
      SUNDAY: 'Sun',
    },
    tabOverview: 'Overview',
    tabReports: 'Reports',
  },
  sl: {
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
    weekdayNames: {
      MONDAY: 'Pon',
      TUESDAY: 'Tor',
      WEDNESDAY: 'Sre',
      THURSDAY: 'Čet',
      FRIDAY: 'Pet',
      SATURDAY: 'Sob',
      SUNDAY: 'Ned',
    },
    tabOverview: 'Pregled',
    tabReports: 'Poročila',
  },
  sr: {
    title: 'Analitika',
    subtitle: 'Pregled prihoda, opterećenja tima i rasta klijenata na jednom mestu.',
    custom: 'Po meri',
    allConsultants: 'Svi zaposleni',
    allSpaces: 'Svi prostori',
    allTypes: 'Sve vrste',
    range: 'Period',
    customRangeHint: 'Za prikaz po meri izaberite početni i završni datum.',
    loading: 'Učitavam analitiku…',
    failed: 'Analitiku nije moguće učitati.',
    emptyTitle: 'Još nema analitičkih podataka',
    emptyText: 'Kada kreirate termine, klijente i račune, ovde će se prikazati pokazatelji.',
    export: 'Izvezi CSV',
    filtersTitle: 'Filteri',
    heroRangePrefix: 'Aktivan period',
    kpiSessions: 'Svi termini',
    kpiRevenue: 'Bruto prihod',
    kpiNewClients: 'Novi klijenti',
    kpiActiveClients: 'Aktivni klijenti',
    kpiOnlineShare: 'Online udeo',
    kpiAvgRevenue: 'Prosečan prihod/termin',
    sessionsTrendTitle: 'Trend termina i klijenata',
    sessionsTrendSubtitle: 'Glavni pregled zauzetosti i pridobijanja novih klijenata u izabranom periodu.',
    revenueTrendTitle: 'Trend prihoda',
    revenueTrendSubtitle: 'Poređenje izdatih računa kroz vreme.',
    weekdayLoadTitle: 'Opterećenost po danima u nedelji',
    weekdayLoadSubtitle: 'Kada su zaposleni i prostori najviše zauzeti.',
    weeklyOpsTitle: 'Nedeljni operativni pregled',
    weeklyOpsSubtitle: 'Poređenje odrađenih sati i obima termina po nedeljama.',
    sessionsLabel: 'Termini',
    activeClientsLabel: 'Aktivni klijenti',
    newClientsLabel: 'Novi klijenti',
    revenueLabel: 'Prihod',
    grossLabel: 'Bruto',
    consultantHoursLabel: 'Sati zaposlenih',
    spaceHoursLabel: 'Sati prostora',
    topServicesTitle: 'Najprofitabilnije usluge',
    topServicesSubtitle: 'Usluge rangirane po ostvarenom prihodu.',
    topConsultantsTitle: 'Najprofitabilniji zaposleni',
    topConsultantsSubtitle: 'Zaposleni rangirani po fakturisanom prihodu.',
    topClientsTitle: 'Najprofitabilniji klijenti',
    topClientsSubtitle: 'Klijenti sa najvećim ostvarenim prihodom.',
    topSpacesTitle: 'Najopterećeniji prostori',
    topSpacesSubtitle: 'Prostori sa najviše rezervisanog vremena.',
    countBills: 'računa',
    countUnits: 'jedinica',
    countSessions: 'termina',
    weekdayNames: {
      MONDAY: 'Pon',
      TUESDAY: 'Uto',
      WEDNESDAY: 'Sre',
      THURSDAY: 'Čet',
      FRIDAY: 'Pet',
      SATURDAY: 'Sub',
      SUNDAY: 'Ned',
    },
    tabOverview: 'Pregled',
    tabReports: 'Izveštaji',
  },
}

const SERVICE_GROUP_ANALYTICS_COPY: Record<ReportLanguage, {
  allGroups: string
  ungrouped: string
  title: string
  subtitle: string
  selectedGroup: string
  group: string
  bookings: string
  completed: string
  cancelledNoShow: string
  revenue: string
  bookedTime: string
  waitlistRequests: string
  offers: string
  accepted: string
  conversion: string
  services: string
  showServices: string
  hideServices: string
  inactive: string
  service: string
  noData: string
}> = {
  en: {
    allGroups: 'All service groups',
    ungrouped: 'Ungrouped',
    title: 'Service groups',
    subtitle: 'Bookings, revenue and waitlist performance by service group.',
    selectedGroup: 'Service group',
    group: 'Group',
    bookings: 'Bookings',
    completed: 'Completed',
    cancelledNoShow: 'Cancelled / no-show',
    revenue: 'Revenue',
    bookedTime: 'Booked time',
    waitlistRequests: 'Waitlist requests',
    offers: 'Offers',
    accepted: 'Accepted',
    conversion: 'Conversion',
    services: 'Services',
    showServices: 'Show services',
    hideServices: 'Hide services',
    inactive: 'Inactive or deleted',
    service: 'Service',
    noData: 'No service-group activity in this period.',
  },
  sl: {
    allGroups: 'Vse skupine storitev',
    ungrouped: 'Brez skupine',
    title: 'Skupine storitev',
    subtitle: 'Rezervacije, prihodki in uspešnost čakalne vrste po skupinah storitev.',
    selectedGroup: 'Skupina storitev',
    group: 'Skupina',
    bookings: 'Rezervacije',
    completed: 'Zaključeno',
    cancelledNoShow: 'Odpovedi / ni prišel',
    revenue: 'Prihodki',
    bookedTime: 'Rezervirani čas',
    waitlistRequests: 'Zahteve v čakalni vrsti',
    offers: 'Ponudbe',
    accepted: 'Sprejete',
    conversion: 'Konverzija',
    services: 'Storitve',
    showServices: 'Prikaži storitve',
    hideServices: 'Skrij storitve',
    inactive: 'Neaktivna ali izbrisana',
    service: 'Storitev',
    noData: 'V izbranem obdobju ni aktivnosti po skupinah storitev.',
  },
  sr: {
    allGroups: 'Sve grupe usluga',
    ungrouped: 'Bez grupe',
    title: 'Grupe usluga',
    subtitle: 'Rezervacije, prihod i uspešnost liste čekanja po grupama usluga.',
    selectedGroup: 'Grupa usluga',
    group: 'Grupa',
    bookings: 'Rezervacije',
    completed: 'Završeno',
    cancelledNoShow: 'Otkazano / nedolazak',
    revenue: 'Prihod',
    bookedTime: 'Rezervisano vreme',
    waitlistRequests: 'Zahtevi na listi čekanja',
    offers: 'Ponude',
    accepted: 'Prihvaćene',
    conversion: 'Konverzija',
    services: 'Usluge',
    showServices: 'Prikaži usluge',
    hideServices: 'Sakrij usluge',
    inactive: 'Neaktivna ili obrisana',
    service: 'Usluga',
    noData: 'Nema aktivnosti po grupama usluga u izabranom periodu.',
  },
}

function localeTagFor(locale: ReportLanguage) {
  if (locale === 'sl') return 'sl-SI'
  if (locale === 'sr') return 'sr-Latn-RS'
  return 'en'
}

function toReportLanguage(locale: string): ReportLanguage {
  return locale === 'sl' || locale === 'sr' ? locale : 'en'
}

function safeNumber(value: number | string | null | undefined) {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function serviceGroupMetricKey(group: ServiceGroupMetric) {
  return `${group.serviceGroupId ?? 'ungrouped'}:${group.serviceGroupName}`
}

export function AnalyticsPage() {
  const me = useAuthenticatedUser()
  const { locale } = useLocale()
  const [periodPreset, setPeriodPreset] = useState<Preset>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [consultantId, setConsultantId] = useState('')
  const [spaceId, setSpaceId] = useState('')
  const [serviceGroupId, setServiceGroupId] = useState('')
  const [typeId, setTypeId] = useState('')
  const [expandedServiceGroups, setExpandedServiceGroups] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('overview')
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [desktopFiltersOpen, setDesktopFiltersOpen] = useState(false)

  const text = ANALYTICS_COPY[toReportLanguage(locale)]
  const groupText = SERVICE_GROUP_ANALYTICS_COPY[toReportLanguage(locale)]


  const isAdmin = me.role === 'ADMIN' || me.role === 'SUPER_ADMIN'
  const canFetch = periodPreset !== 'custom' || (!!customFrom && !!customTo)
  const appLocaleTag = localeTagFor(toReportLanguage(locale))

  const settingsQuery = useQuery(settingsQueryOptions(me.activeUnitId ?? me.companyId))

  const { data: filterData } = useQuery<{
    consultants: ConsultantOption[]
    spaces: SpaceOption[]
    types: TypeOption[]
    serviceGroups: ServiceGroupOption[]
  }>({
    queryKey: ['analytics-filters-meta', me.role, settingsQuery.data?.SERVICE_GROUPS_ENABLED],
    enabled: settingsQuery.isSuccess,
    queryFn: async () => {
      const groupsEnabled = (settingsQuery.data?.SERVICE_GROUPS_ENABLED ?? 'true') !== 'false'
      const [usersRes, spacesRes, typesRes, serviceGroupsRes] = await Promise.all([
        isAdmin ? api.get<ConsultantOption[]>('/users').catch(() => ({ data: [] as ConsultantOption[] })) : Promise.resolve({ data: [] as ConsultantOption[] }),
        api.get<SpaceOption[]>('/spaces').catch(() => ({ data: [] as SpaceOption[] })),
        api.get<TypeOption[]>('/types').catch(() => ({ data: [] as TypeOption[] })),
        groupsEnabled
          ? api.get<ServiceGroupOption[]>('/service-groups').catch(() => ({ data: [] as ServiceGroupOption[] }))
          : Promise.resolve({ data: [] as ServiceGroupOption[] }),
      ])
      return {
        consultants: (usersRes.data ?? []).filter((u) => u.consultant),
        spaces: spacesRes.data ?? [],
        types: typesRes.data ?? [],
        serviceGroups: serviceGroupsRes.data ?? [],
      }
    },
  })

  const filteredTypeOptions = useMemo(() => {
    const types = filterData?.types ?? []
    if (!serviceGroupId) return types
    const selectedGroupId = Number(serviceGroupId)
    return types.filter((item) => selectedGroupId === -1
      ? item.serviceGroupId == null
      : item.serviceGroupId === selectedGroupId)
  }, [filterData?.types, serviceGroupId])

  useEffect(() => {
    if (!filterData || !typeId) return
    if (!filteredTypeOptions.some((item) => String(item.id) === typeId)) {
      setTypeId('')
    }
  }, [filterData, filteredTypeOptions, typeId])



  const billingEnabled = (settingsQuery.data?.BILLING_ENABLED ?? 'true') !== 'false'
  const waitlistReportsEnabled = settingsQuery.data?.WAITLIST_ENABLED === 'true'
  const serviceGroupsReportsEnabled = (settingsQuery.data?.SERVICE_GROUPS_ENABLED ?? 'true') !== 'false'

  useEffect(() => {
    if (!serviceGroupsReportsEnabled && serviceGroupId) setServiceGroupId('')
  }, [serviceGroupId, serviceGroupsReportsEnabled])



  const { data, isLoading, isError } = useQuery<AnalyticsOverview>({
    queryKey: ['analytics-overview', periodPreset, customFrom, customTo, consultantId, spaceId, serviceGroupId, typeId],
    enabled: canFetch,
    queryFn: async () => {
      const params: Record<string, string | number> = { period: periodPreset }
      if (periodPreset === 'custom') {
        params.from = customFrom
        params.to = customTo
      }
      if (periodPreset === 'quarter') {
        const today = new Date()
        const quarterStart = new Date(today)
        quarterStart.setMonth(quarterStart.getMonth() - 3)
        params.period = 'custom'
        params.from = toIsoDate(quarterStart)
        params.to = toIsoDate(today)
      }
      if (consultantId) params.consultantId = Number(consultantId)
      if (spaceId) params.spaceId = Number(spaceId)
      if (serviceGroupsReportsEnabled && serviceGroupId) params.serviceGroupId = Number(serviceGroupId)
      if (typeId) params.typeId = Number(typeId)
      const res = await api.get<AnalyticsOverview>('/analytics/overview', { params })
      return res.data
    },
  })

  const comparisonSeries = useMemo(() => (periodPreset === 'month' ? data?.months ?? [] : data?.years ?? []), [periodPreset, data?.months, data?.years])
  const isComparison = periodPreset === 'month' || periodPreset === 'year'

  const rangeLabel = useMemo(() => {
    if (!data) return ''
    const formatter = new Intl.DateTimeFormat(appLocaleTag, { day: 'numeric', month: 'short', year: 'numeric' })
    const from = formatter.format(new Date(`${data.rangeStart}T00:00:00`))
    const to = formatter.format(new Date(`${data.rangeEnd}T00:00:00`))
    return from === to ? from : `${from} – ${to}`
  }, [data, appLocaleTag])

  const revenueFormatter = (value: number | string) => {
    const amount = typeof value === 'number' ? value : Number(value)
    return new Intl.NumberFormat(appLocaleTag, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 2,
    }).format(Number.isFinite(amount) ? amount : 0)
  }

  const percentFormatter = (value: number) => new Intl.NumberFormat(appLocaleTag, {
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
    const shortMonth = new Intl.DateTimeFormat(appLocaleTag, { month: 'short', year: '2-digit' })
    const shortWeek = new Intl.DateTimeFormat(appLocaleTag, { day: 'numeric', month: 'short' })
    return {
      period(point: PeriodPoint) {
        if (point.month) return shortMonth.format(new Date(point.year, point.month - 1, 1))
        return String(point.year)
      },
      week(dateValue: string) {
        return shortWeek.format(new Date(`${dateValue}T00:00:00`))
      },
    }
  }, [appLocaleTag])

  const activitySeries = useMemo((): ActivityChartRow[] => {
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

  const revenueSeries = useMemo((): RevenueChartRow[] => {
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

  const mobileTrend = (values: number[]) => {
    const finite = values.filter((value) => Number.isFinite(value))
    if (finite.length < 2) return null
    const previous = finite[finite.length - 2]
    const current = finite[finite.length - 1]
    if (previous === 0) return current === 0 ? null : `↑ ${new Intl.NumberFormat(appLocaleTag, { maximumFractionDigits: 1 }).format(100)} %`
    const percentage = ((current - previous) / Math.abs(previous)) * 100
    const arrow = percentage < 0 ? '↓' : '↑'
    return `${arrow} ${new Intl.NumberFormat(appLocaleTag, { maximumFractionDigits: 1 }).format(Math.abs(percentage))} %`
  }

  const mobileRevenueTrend = mobileTrend(revenueSeries.map((point) => safeNumber(point.revenueGross)))
  const mobileBookingsTrend = mobileTrend(activitySeries.map((point) => safeNumber(point.sessionsTotal)))
  const mobileNewClientsTrend = mobileTrend(activitySeries.map((point) => safeNumber(point.newClients)))
  const mobileAverageTrend = mobileTrend(revenueSeries.map((point, index) => {
    const sessions = safeNumber(activitySeries[index]?.sessionsTotal)
    return sessions > 0 ? safeNumber(point.revenueGross) / sessions : 0
  }))
  const desktopActiveClientsTrend = mobileTrend(activitySeries.map((point) => safeNumber(point.clientsTotal)))
  const cancellationRate = useMemo(() => {
    const groups = data?.serviceGroups ?? []
    const bookings = groups.reduce((sum, group) => sum + safeNumber(group.bookings), 0)
    const cancellations = groups.reduce((sum, group) => sum + safeNumber(group.cancelled), 0)
    return bookings > 0 ? cancellations / bookings : 0
  }, [data?.serviceGroups])
  const desktopComparisonLabel = locale === 'sl'
    ? 'vs. prejšnje obdobje'
    : locale === 'sr'
      ? 'u odnosu na prethodni period'
      : 'vs. previous period'
  const cancellationRateLabel = locale === 'sl'
    ? 'Stopnja odpovedi'
    : locale === 'sr'
      ? 'Stopa otkazivanja'
      : 'Cancellation rate'
  const revenueGrowthTitle = locale === 'sl' ? 'Rast prihodkov' : locale === 'sr' ? 'Rast prihoda' : 'Revenue growth'
  const bookingsByServiceTitle = locale === 'sl' ? 'Rezervacije po storitvah' : locale === 'sr' ? 'Rezervacije po uslugama' : 'Bookings by service'
  const busiestDaysTitle = locale === 'sl' ? 'Najbolj zasedeni dnevi' : locale === 'sr' ? 'Najzauzetiji dani' : 'Busiest days'
  const occupancyByDayTitle = locale === 'sl' ? 'Zasedenost po dnevih' : locale === 'sr' ? 'Zauzetost po danima' : 'Occupancy by day'

  const mobileTopServices = useMemo(() => (data?.topServices ?? []).slice(0, 5), [data?.topServices])
  const mobileTopServicesTotal = useMemo(
    () => mobileTopServices.reduce((sum, item) => sum + Math.max(0, safeNumber(item.count)), 0),
    [mobileTopServices],
  )
  const mobileServiceDonut = useMemo(() => {
    if (mobileTopServicesTotal <= 0) return 'conic-gradient(#e5edf8 0 100%)'
    let offset = 0
    const stops = mobileTopServices.map((item, index) => {
      const start = offset
      offset += (Math.max(0, safeNumber(item.count)) / mobileTopServicesTotal) * 100
      return `${MOBILE_ANALYTICS_PALETTE[index % MOBILE_ANALYTICS_PALETTE.length]} ${start.toFixed(2)}% ${offset.toFixed(2)}%`
    })
    if (offset < 100) stops.push(`#e5edf8 ${offset.toFixed(2)}% 100%`)
    return `conic-gradient(${stops.join(', ')})`
  }, [mobileTopServices, mobileTopServicesTotal])

  const mobileBusiestDays = useMemo(
    () => [...weekdaySeries].sort((a, b) => b.sessionsTotal - a.sessionsTotal).slice(0, 5),
    [weekdaySeries],
  )
  const mobileBusiestDayMax = Math.max(1, ...mobileBusiestDays.map((item) => item.sessionsTotal))

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
      ...(serviceGroupsReportsEnabled ? [
        [] as Array<string | number>,
        [groupText.title] as Array<string | number>,
        [
          groupText.group,
          groupText.bookings,
          groupText.completed,
          groupText.cancelledNoShow,
          groupText.revenue,
          groupText.bookedTime,
          ...(waitlistReportsEnabled ? [groupText.waitlistRequests, groupText.offers, groupText.accepted, groupText.conversion] : []),
        ] as Array<string | number>,
        ...data.serviceGroups.flatMap((group) => [
          [
            group.serviceGroupName,
            group.bookings,
            group.completed,
            group.cancelled + group.noShows,
            Number(group.revenueGross || 0),
            minutesFormatter(group.bookedMinutes),
            ...(waitlistReportsEnabled ? [group.waitlistRequests, group.waitlistOffers, group.acceptedOffers, `${safeNumber(group.waitlistConversionRate).toFixed(1)}%`] : []),
          ],
          ...group.services.map((service) => [
            `↳ ${service.serviceName}`,
            service.bookings,
            service.completed,
            service.cancelled + service.noShows,
            Number(service.revenueGross || 0),
            minutesFormatter(service.bookedMinutes),
            ...(waitlistReportsEnabled ? [service.waitlistRequests, service.waitlistOffers, service.acceptedOffers, `${safeNumber(service.waitlistConversionRate).toFixed(1)}%`] : []),
          ]),
        ]),
      ] : []),
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

  return (
    <div className="stack gap-lg analytics-page">
      {(me.workspaceFeatures == null || me.workspaceFeatures.includes('WORKSPACE_ANALYTICS')) && isWorkspaceRolloutEnabled(me, 'WORKSPACE_ANALYTICS') && (me.units ?? []).filter((unit) => unit.workspaceId === me.workspaceId && hasEmployeePermission(unit, 'REPORTS_ANALYTICS_VIEW')).length > 1 && (
        <div className="analytics-scope-switch" role="tablist">
          <Link to="/analytics" className="active">{locale === 'sl' ? 'Trenutna enota' : locale === 'sr' ? 'Trenutna jedinica' : 'Current unit'}</Link>
          <Link to="/analytics/workspace">{locale === 'sl' ? 'Celoten delovni prostor' : locale === 'sr' ? 'Ceo radni prostor' : 'Entire workspace'}</Link>
        </div>
      )}

      <div className="clients-page-header analytics-tabs-header">
        <div className="clients-page-header__entity clients-entity-tabs-shell">
          <div className="clients-session-tabs clients-entity-tabs" role="tablist" aria-label={text.title}>
            <button type="button" role="tab" aria-selected={activeTab === 'overview'} className={`clients-session-tab${activeTab === 'overview' ? ' active' : ''}`} onClick={() => setActiveTab('overview')}>
              {text.tabOverview}
            </button>
            <button type="button" role="tab" aria-selected={activeTab === 'reports'} className={`clients-session-tab${activeTab === 'reports' ? ' active' : ''}`} onClick={() => setActiveTab('reports')}>
              {text.tabReports}
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'overview' && (<>
      <Card className="analytics-desktop-control-card">
        <div className="analytics-desktop-control-main">
          <div className="analytics-desktop-range-control">
            <span className="analytics-desktop-range-label">{text.heroRangePrefix}</span>
            <button type="button" className="analytics-desktop-range-value" onClick={() => setDesktopFiltersOpen((value) => !value)} aria-expanded={desktopFiltersOpen}>
              <AnalyticsMobileIcon name="calendar" />
              <span>{rangeLabel || '—'}</span>
              <span aria-hidden>⌄</span>
            </button>
          </div>

          <div className="analytics-filter-group analytics-filter-group--desktop">
            <button type="button" className={periodPreset === '7d' ? 'active' : ''} onClick={() => setPeriodPreset('7d')}>7D</button>
            <button type="button" className={periodPreset === 'month' ? 'active' : ''} onClick={() => setPeriodPreset('month')}>1M</button>
            <button type="button" className={periodPreset === 'quarter' ? 'active' : ''} onClick={() => setPeriodPreset('quarter')}>3M</button>
            <button type="button" className={periodPreset === 'year' ? 'active' : ''} onClick={() => setPeriodPreset('year')}>1L</button>
            <button type="button" className={periodPreset === 'custom' ? 'active' : ''} onClick={() => { setPeriodPreset('custom'); setDesktopFiltersOpen(true) }}>{text.custom}</button>
          </div>

          <div className="analytics-desktop-control-actions">
            <button type="button" className="analytics-desktop-filter-icon" onClick={() => setDesktopFiltersOpen((value) => !value)} aria-label={text.filtersTitle} aria-expanded={desktopFiltersOpen}>
              <AnalyticsMobileIcon name="filter" />
            </button>
            <button type="button" className="secondary analytics-desktop-export" onClick={exportCsv} disabled={!summary}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3v11"/><path d="m8 10 4 4 4-4"/><path d="M5 18v2h14v-2"/></svg>
              <span>{text.export}</span>
            </button>
          </div>
        </div>

        {desktopFiltersOpen && (
          <div className="analytics-desktop-advanced-filters">
            {periodPreset === 'custom' && (
              <div className="analytics-custom-range analytics-custom-range--desktop">
                <label><span>{locale === 'sl' ? 'Od' : locale === 'sr' ? 'Od' : 'From'}</span><input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} /></label>
                <label><span>{locale === 'sl' ? 'Do' : locale === 'sr' ? 'Do' : 'To'}</span><input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} /></label>
              </div>
            )}
            <div className="analytics-select-filters analytics-select-filters--desktop">
              {isAdmin && (
                <select value={consultantId} onChange={(e) => setConsultantId(e.target.value)}>
                  <option value="">{text.allConsultants}</option>
                  {(filterData?.consultants ?? []).map((u) => <option key={u.id} value={u.id}>{fullName(u)}</option>)}
                </select>
              )}
              <select value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
                <option value="">{text.allSpaces}</option>
                {(filterData?.spaces ?? []).map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}
              </select>
              {serviceGroupsReportsEnabled && (
                <select value={serviceGroupId} onChange={(e) => setServiceGroupId(e.target.value)}>
                  <option value="">{groupText.allGroups}</option>
                  <option value="-1">{groupText.ungrouped}</option>
                  {(filterData?.serviceGroups ?? []).map((group) => <option key={group.id} value={group.id}>{group.name}{group.active ? '' : ` · ${groupText.inactive}`}</option>)}
                </select>
              )}
              <select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                <option value="">{text.allTypes}</option>
                {filteredTypeOptions.map((item) => {
                  const visibleName = item.description || item.name
                  const internalDescription = String(item.internalDescription || '').trim()
                  return <option key={item.id} value={item.id}>{internalDescription ? `${visibleName} — ${internalDescription}` : visibleName}</option>
                })}
              </select>
            </div>
          </div>
        )}
      </Card>

      <Card className={`analytics-filter-card analytics-filter-card--mobile-only${mobileFiltersOpen ? ' analytics-filter-card--mobile-open' : ''}`}>
        <div className="analytics-mobile-filter-summary">
          <button type="button" className="analytics-mobile-date-chip" onClick={() => setMobileFiltersOpen((open) => !open)}>
            <AnalyticsMobileIcon name="calendar" />
            <span>{rangeLabel || text.range}</span>
            <span aria-hidden>⌄</span>
          </button>
          <button type="button" className="analytics-mobile-filter-toggle" onClick={() => setMobileFiltersOpen((open) => !open)} aria-expanded={mobileFiltersOpen}>
            <AnalyticsMobileIcon name="filter" />
            <span>{text.filtersTitle}</span>
          </button>
        </div>
        <div className="analytics-filter-card__content">
          <div className="analytics-filters-row">
          <div className="analytics-filter-group">
            <button type="button" className={periodPreset === 'day' ? 'active' : ''} onClick={() => setPeriodPreset('day')}>1D</button>
            <button type="button" className={periodPreset === '7d' ? 'active' : ''} onClick={() => setPeriodPreset('7d')}>7D</button>
            <button type="button" className={periodPreset === 'month' ? 'active' : ''} onClick={() => setPeriodPreset('month')}>1M</button>
            <button type="button" className={periodPreset === 'year' ? 'active' : ''} onClick={() => setPeriodPreset('year')}>1L</button>
            <button type="button" className={periodPreset === 'custom' ? 'active' : ''} onClick={() => setPeriodPreset('custom')}>{text.custom}</button>
          </div>
          <div className="analytics-select-filters">
            {isAdmin && (
              <select value={consultantId} onChange={(e) => setConsultantId(e.target.value)}>
                <option value="">{text.allConsultants}</option>
                {(filterData?.consultants ?? []).map((u) => <option key={u.id} value={u.id}>{fullName(u)}</option>)}
              </select>
            )}
            <select value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
              <option value="">{text.allSpaces}</option>
              {(filterData?.spaces ?? []).map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}
            </select>
            {serviceGroupsReportsEnabled && (
              <select value={serviceGroupId} onChange={(e) => setServiceGroupId(e.target.value)}>
                <option value="">{groupText.allGroups}</option>
                <option value="-1">{groupText.ungrouped}</option>
                {(filterData?.serviceGroups ?? []).map((group) => <option key={group.id} value={group.id}>{group.name}{group.active ? '' : ` · ${groupText.inactive}`}</option>)}
              </select>
            )}
            <select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              <option value="">{text.allTypes}</option>
              {filteredTypeOptions.map((item) => {
                const visibleName = item.description || item.name
                const internalDescription = String(item.internalDescription || '').trim()
                return <option key={item.id} value={item.id}>{internalDescription ? `${visibleName} — ${internalDescription}` : visibleName}</option>
              })}
            </select>
          </div>
        </div>
          {periodPreset === 'custom' && (
            <div className="analytics-custom-range">
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} aria-label={`${text.range} from`} />
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} aria-label={`${text.range} to`} />
            </div>
          )}
          <div className="analytics-mobile-action-row">
            <button type="button" className="secondary" onClick={exportCsv} disabled={!summary}>{text.export}</button>
          </div>
        </div>
      </Card>
      </>)}

      {activeTab === 'reports' ? (
        <AnalyticsReportsPanel billingEnabled={billingEnabled} />
      ) : !canFetch ? (
        <Card><div className="muted">{text.customRangeHint}</div></Card>
      ) : isLoading ? (
        <Card><div className="muted">{text.loading}</div></Card>
      ) : isError ? (
        <Card><div className="error">{text.failed}</div></Card>
      ) : !data || !summary ? (
        <Card><EmptyState title={text.emptyTitle} text={text.emptyText} /></Card>
      ) : (
        <>
          <div className="analytics-mobile-overview" data-onboarding-panel="analytics">
            <div className="analytics-mobile-kpi-grid">
              <AnalyticsMobileKpiCard icon="revenue" label={text.kpiRevenue} value={revenueFormatter(summary.revenueGross)} trend={mobileRevenueTrend} />
              <AnalyticsMobileKpiCard icon="bookings" label={text.kpiSessions} value={String(summary.sessionsTotal)} trend={mobileBookingsTrend} />
              <AnalyticsMobileKpiCard icon="clients" label={text.kpiNewClients} value={String(summary.newClients)} trend={mobileNewClientsTrend} />
              <AnalyticsMobileKpiCard icon="average" label={text.kpiAvgRevenue} value={revenueFormatter(avgRevenuePerSession)} trend={mobileAverageTrend} />
            </div>

            <Card className="analytics-mobile-chart-card analytics-mobile-revenue-card">
              <div className="analytics-mobile-card-header">
                <h3>{locale === 'sl' ? 'Rast prihodkov' : locale === 'sr' ? 'Rast prihoda' : 'Revenue growth'}</h3>
                <span>{locale === 'sl' ? 'Po obdobjih' : locale === 'sr' ? 'Po periodima' : 'By period'}⌄</span>
              </div>
              <div className="analytics-mobile-revenue-chart">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={210} debounce={ANALYTICS_CHART_RESIZE_DEBOUNCE_MS}>
                  <AreaChart data={revenueSeries} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="analyticsMobileRevenueFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1672f3" stopOpacity={0.22} />
                        <stop offset="100%" stopColor="#1672f3" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="0" vertical={false} stroke="#e7edf5" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#66758c' }} axisLine={false} tickLine={false} minTickGap={8} />
                    <YAxis tick={{ fontSize: 10, fill: '#66758c' }} axisLine={false} tickLine={false} width={46} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k €`} />
                    <Tooltip formatter={(value) => revenueFormatter(value as number)} />
                    <Area {...ANALYTICS_CHART_STATIC} type="monotone" dataKey="revenueGross" stroke="#1672f3" strokeWidth={3} dot={{ r: 3.5, fill: '#ffffff', strokeWidth: 2.5 }} activeDot={{ r: 5 }} fill="url(#analyticsMobileRevenueFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <div className="analytics-mobile-insight-grid">
              <Card className="analytics-mobile-insight-card analytics-mobile-donut-card">
                <h3>{locale === 'sl' ? 'Rezervacije po storitvah' : locale === 'sr' ? 'Rezervacije po uslugama' : 'Bookings by service'}</h3>
                <div className="analytics-mobile-donut-wrap">
                  <div className="analytics-mobile-donut" style={{ background: mobileServiceDonut }}>
                    <span><strong>{mobileTopServicesTotal}</strong>{locale === 'sl' ? 'rezervacij' : locale === 'sr' ? 'rezervacija' : 'bookings'}</span>
                  </div>
                  <div className="analytics-mobile-donut-legend">
                    {mobileTopServices.length === 0 ? <span className="muted">—</span> : mobileTopServices.map((item, index) => (
                      <div key={`mobile-service-${item.label}-${index}`}>
                        <i style={{ background: MOBILE_ANALYTICS_PALETTE[index % MOBILE_ANALYTICS_PALETTE.length] }} />
                        <span>{item.label}</span>
                        <strong>{item.count}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              <Card className="analytics-mobile-insight-card analytics-mobile-days-card">
                <div className="analytics-mobile-card-header analytics-mobile-card-header--compact">
                  <h3>{locale === 'sl' ? 'Najbolj zasedeni dnevi' : locale === 'sr' ? 'Najzauzetiji dani' : 'Busiest days'}</h3>
                </div>
                <div className="analytics-mobile-day-list">
                  {mobileBusiestDays.length === 0 ? <span className="muted">—</span> : mobileBusiestDays.map((item) => (
                    <div key={`mobile-day-${item.dayKey}`}>
                      <span>{item.label}</span>
                      <i><b style={{ width: `${Math.max(8, (item.sessionsTotal / mobileBusiestDayMax) * 100)}%` }} /></i>
                      <strong>{item.sessionsTotal}</strong>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <Card className="analytics-mobile-top-services-card">
              <div className="analytics-mobile-card-header">
                <h3>{locale === 'sl' ? 'Najbolj rezervirane storitve' : locale === 'sr' ? 'Najrezervisanije usluge' : 'Most booked services'}</h3>
                <span>{locale === 'sl' ? 'Po prihodkih' : locale === 'sr' ? 'Po prihodu' : 'By revenue'}⌄</span>
              </div>
              <div className="analytics-mobile-top-services-list">
                {mobileTopServices.length === 0 ? <span className="muted">—</span> : mobileTopServices.map((item, index) => (
                  <div key={`mobile-top-service-${item.label}-${index}`}>
                    <span>{index + 1}</span>
                    <div><strong>{item.label}</strong><i><b style={{ width: `${Math.max(10, (safeNumber(item.amount) / Math.max(1, safeNumber(mobileTopServices[0]?.amount))) * 100)}%` }} /></i></div>
                    <strong>{revenueFormatter(item.amount)}</strong>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="analytics-desktop-overview" data-onboarding-panel="analytics">
            <div className="analytics-desktop-kpi-grid">
              <AnalyticsDesktopKpiCard icon="bookings" tone="blue" label={text.kpiSessions} value={String(summary.sessionsTotal)} trend={mobileBookingsTrend} comparisonLabel={desktopComparisonLabel} />
              <AnalyticsDesktopKpiCard icon="revenue" tone="green" label={text.kpiRevenue} value={revenueFormatter(summary.revenueGross)} trend={mobileRevenueTrend} comparisonLabel={desktopComparisonLabel} />
              <AnalyticsDesktopKpiCard icon="clients" tone="red" label={text.kpiNewClients} value={String(summary.newClients)} trend={mobileNewClientsTrend} comparisonLabel={desktopComparisonLabel} />
              <AnalyticsDesktopKpiCard icon="activeClients" tone="green" label={text.kpiActiveClients} value={String(summary.clientsTotal)} trend={desktopActiveClientsTrend} comparisonLabel={desktopComparisonLabel} />
              <AnalyticsDesktopKpiCard icon="cancellation" tone="purple" label={cancellationRateLabel} value={`${new Intl.NumberFormat(appLocaleTag, { maximumFractionDigits: 1 }).format(cancellationRate * 100)} %`} trend={null} comparisonLabel={desktopComparisonLabel} />
              <AnalyticsDesktopKpiCard icon="average" tone="amber" label={text.kpiAvgRevenue} value={revenueFormatter(avgRevenuePerSession)} trend={mobileAverageTrend} comparisonLabel={desktopComparisonLabel} />
            </div>

            <div className="analytics-desktop-primary-grid">
              <Card className="analytics-desktop-panel analytics-desktop-revenue-panel">
                <div className="analytics-desktop-panel-heading">
                  <h3>{revenueGrowthTitle}</h3>
                </div>
                <div className="analytics-desktop-revenue-chart">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={230} debounce={ANALYTICS_CHART_RESIZE_DEBOUNCE_MS}>
                    <AreaChart data={revenueSeries} margin={{ top: 12, right: 12, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="analyticsDesktopRevenueFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#1672f3" stopOpacity={0.18} />
                          <stop offset="100%" stopColor="#1672f3" stopOpacity={0.015} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="#e8eef6" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#728096' }} axisLine={false} tickLine={false} minTickGap={14} />
                      <YAxis tick={{ fontSize: 11, fill: '#728096' }} axisLine={false} tickLine={false} width={54} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k €`} />
                      <Tooltip formatter={(value) => revenueFormatter(value as number)} />
                      <Area {...ANALYTICS_CHART_STATIC} type="monotone" dataKey="revenueGross" stroke="#1672f3" strokeWidth={3} dot={{ r: 3.3, fill: '#fff', stroke: '#1672f3', strokeWidth: 2.2 }} activeDot={{ r: 5 }} fill="url(#analyticsDesktopRevenueFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="analytics-desktop-panel analytics-desktop-donut-panel">
                <div className="analytics-desktop-panel-heading"><h3>{bookingsByServiceTitle}</h3></div>
                <div className="analytics-desktop-donut-content">
                  <div className="analytics-desktop-donut" style={{ background: mobileServiceDonut }}>
                    <span>
                      <strong>{mobileTopServicesTotal}</strong>
                      <small>{locale === 'sl' ? 'rezervacij' : locale === 'sr' ? 'rezervacija' : 'bookings'}</small>
                    </span>
                  </div>
                  <div className="analytics-desktop-donut-legend">
                    {mobileTopServices.length === 0 ? <span className="muted">—</span> : mobileTopServices.map((item, index) => (
                      <div key={`desktop-service-${item.label}-${index}`}>
                        <i style={{ background: MOBILE_ANALYTICS_PALETTE[index % MOBILE_ANALYTICS_PALETTE.length] }} />
                        <span>{item.label}</span>
                        <strong>{item.count}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              <Card className="analytics-desktop-panel analytics-desktop-days-panel">
                <div className="analytics-desktop-panel-heading"><h3>{busiestDaysTitle}</h3></div>
                <div className="analytics-desktop-day-list">
                  {mobileBusiestDays.length === 0 ? <span className="muted">—</span> : mobileBusiestDays.map((item) => (
                    <div key={`desktop-day-${item.dayKey}`}>
                      <span>{item.label}</span>
                      <i><b style={{ width: `${Math.max(7, (item.sessionsTotal / mobileBusiestDayMax) * 100)}%` }} /></i>
                      <strong>{item.sessionsTotal}</strong>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <Card className="analytics-desktop-panel analytics-desktop-occupancy-panel">
              <div className="analytics-desktop-panel-heading"><h3>{occupancyByDayTitle}</h3></div>
              <div className="analytics-desktop-occupancy-chart">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={190} debounce={ANALYTICS_CHART_RESIZE_DEBOUNCE_MS}>
                  <LineChart data={weeklyOpsSeries} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#e8eef6" />
                    <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: '#728096' }} axisLine={false} tickLine={false} minTickGap={14} />
                    <YAxis tick={{ fontSize: 10.5, fill: '#728096' }} axisLine={false} tickLine={false} width={42} />
                    <Tooltip />
                    <Legend iconType="line" wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
                    <Line {...ANALYTICS_CHART_STATIC} type="monotone" dataKey="sessionsTotal" name={text.sessionsLabel} stroke="#1672f3" strokeWidth={2.4} dot={{ r: 2.6, fill: '#fff', strokeWidth: 1.8 }} />
                    <Line {...ANALYTICS_CHART_STATIC} type="monotone" dataKey="spaceHours" name={text.spaceHoursLabel} stroke="#f5a000" strokeWidth={2.2} dot={{ r: 2.4, fill: '#fff', strokeWidth: 1.6 }} />
                    <Line {...ANALYTICS_CHART_STATIC} type="monotone" dataKey="consultantHours" name={text.consultantHoursLabel} stroke="#17a95b" strokeWidth={2.2} dot={{ r: 2.4, fill: '#fff', strokeWidth: 1.6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {serviceGroupsReportsEnabled && <Card className="analytics-service-groups-card analytics-service-groups-card--preview">
              <div className="analytics-card-heading analytics-service-groups-card__heading">
                <div>
                  <h3>{groupText.title}</h3>
                  <p>{groupText.subtitle}</p>
                </div>
              </div>
              {data.serviceGroups.length === 0 ? (
                <div className="muted analytics-ranking-empty">{groupText.noData}</div>
              ) : (
                <div className="analytics-service-groups-table-wrap">
                  <table className="analytics-service-groups-table">
                    <thead>
                      <tr>
                        <th>{groupText.group}</th>
                        <th>{groupText.bookings}</th>
                        <th>{groupText.completed}</th>
                        <th>{groupText.cancelledNoShow}</th>
                        <th>{groupText.revenue}</th>
                        <th>{groupText.bookedTime}</th>
                        {waitlistReportsEnabled && <th>{groupText.waitlistRequests}</th>}
                        {waitlistReportsEnabled && <th>{groupText.offers}</th>}
                        {waitlistReportsEnabled && <th>{groupText.accepted}</th>}
                        {waitlistReportsEnabled && <th>{groupText.conversion}</th>}
                        <th aria-label={groupText.services} />
                      </tr>
                    </thead>
                    {data.serviceGroups.map((group) => {
                      const key = serviceGroupMetricKey(group)
                      const expanded = expandedServiceGroups.has(key)
                      return (
                        <tbody key={key}>
                          <tr className="analytics-service-group-row">
                            <td>
                              <div className="analytics-service-group-name">
                                <strong>{group.serviceGroupName}</strong>
                                {!group.active && group.serviceGroupId != null && <span className="analytics-service-group-status">{groupText.inactive}</span>}
                              </div>
                            </td>
                            <td>{group.bookings}</td>
                            <td>{group.completed}</td>
                            <td>{group.cancelled + group.noShows}</td>
                            <td>{revenueFormatter(group.revenueGross)}</td>
                            <td>{minutesFormatter(group.bookedMinutes)}</td>
                            {waitlistReportsEnabled && <td>{group.waitlistRequests}</td>}
                            {waitlistReportsEnabled && <td>{group.waitlistOffers}</td>}
                            {waitlistReportsEnabled && <td>{group.acceptedOffers}</td>}
                            {waitlistReportsEnabled && <td>{safeNumber(group.waitlistConversionRate).toFixed(1)}%</td>}
                            <td>
                              <button
                                type="button"
                                className="analytics-service-group-toggle analytics-service-group-toggle--dots secondary"
                                onClick={() => setExpandedServiceGroups((current) => {
                                  const next = new Set(current)
                                  if (next.has(key)) next.delete(key)
                                  else next.add(key)
                                  return next
                                })}
                                disabled={group.services.length === 0}
                                aria-expanded={expanded}
                                title={expanded ? groupText.hideServices : `${groupText.showServices} (${group.services.length})`}
                              >•••</button>
                            </td>
                          </tr>
                          {expanded && group.services.map((service) => (
                            <tr key={`${key}:${service.serviceId ?? service.serviceName}`} className="analytics-service-row">
                              <td><span>↳</span> {service.serviceName}</td>
                              <td>{service.bookings}</td>
                              <td>{service.completed}</td>
                              <td>{service.cancelled + service.noShows}</td>
                              <td>{revenueFormatter(service.revenueGross)}</td>
                              <td>{minutesFormatter(service.bookedMinutes)}</td>
                              {waitlistReportsEnabled && <td>{service.waitlistRequests}</td>}
                              {waitlistReportsEnabled && <td>{service.waitlistOffers}</td>}
                              {waitlistReportsEnabled && <td>{service.acceptedOffers}</td>}
                              {waitlistReportsEnabled && <td>{safeNumber(service.waitlistConversionRate).toFixed(1)}%</td>}
                              <td />
                            </tr>
                          ))}
                        </tbody>
                      )
                    })}
                  </table>
                </div>
              )}
            </Card>}
          </div>
        </>
      )}
    </div>
  )
}
