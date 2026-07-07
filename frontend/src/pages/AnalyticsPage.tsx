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

/** Recharts `debounce` defaults to 0, so every ResizeObserver frame reflows charts. Sidebar width CSS transitions fire many resizes/sec; debouncing coalesces to one layout after the rail settles. */
const ANALYTICS_CHART_RESIZE_DEBOUNCE_MS = 120

/** Disable bar/line mount and update animations — charts render statically (better with sidebar resize + less motion). */
const ANALYTICS_CHART_STATIC = { isAnimationActive: false as const }

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

type ReportTemplate = 'business' | 'revenueInvoices' | 'bookingsAttendance'
type RevenuePaymentStatusFilter = 'all' | 'paid' | 'open' | 'refunded'
type RevenueBillTypeFilter = 'ALL' | 'INVOICE' | 'ADVANCE' | 'REFUND'
type RevenueOutputMode = 'summary' | 'detailed'
type BookingStatusFilter = 'ALL' | 'RESERVED' | 'CHECKED_OUT' | 'CANCELLED' | 'NO_SHOW'
type BookingSourceFilter = 'ALL' | 'STAFF' | 'WEBSITE_WIDGET' | 'GUEST_APP'
type DeliveryModeFilter = 'ALL' | 'ONLINE' | 'ONSITE'

type PaymentMethodOption = { id: number; name: string; paymentType?: string }

type InvoiceReportSummary = {
  issuedInvoices: number
  grossTotal: number
  netTotal: number
  vatTotal: number
  paidTotal: number
  openTotal: number
  refundedTotal: number
}

type InvoiceReportRow = {
  invoiceNumber: string
  client: string
  date: string
  status: string
  type: string
  paymentMethod: string
  consultant: string
  netTotal: number
  grossTotal: number
  vatTotal: number
}

type RevenueInvoicesReport = {
  rangeStart: string
  rangeEnd: string
  summary: InvoiceReportSummary
  revenueByPaymentMethod: RankedAmount[]
  revenueByConsultant: RankedAmount[]
  revenueByService: RankedAmount[]
  invoices: InvoiceReportRow[]
}

type BookingReportSummary = {
  reservedBookings: number
  completedSessions: number
  cancelledSessions: number
  noShows: number
  onlineSessions: number
  onsiteSessions: number
}

type CountRanking = { label: string; count: number; minutes: number }

type BookingsAttendanceReport = {
  rangeStart: string
  rangeEnd: string
  summary: BookingReportSummary
  sourceBreakdown: CountRanking[]
  busiestDaysTimes: CountRanking[]
  consultantHours: UsageRanking[]
  roomHours: UsageRanking[]
}

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
  sendNow: string
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
  netLabel: string
  grossLabel: string
  consultantHoursLabel: string
  spaceHoursLabel: string
  onlineLabel: string
  onsiteLabel: string
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
  reportsTitle: string
  reportsSubtitle: string
  reportsEnabled: string
  reportsEmail: string
  reportsFrequency: string
  reportsDaily: string
  reportsWeekly: string
  saveSettings: string
  reportSettingsSaved: string
  reportSent: string
  reportSaveFailed: string
  reportSendFailed: string
  weekdayNames: Record<string, string>
  tabOverview: string
  tabReports: string
  reportTemplateTitle: string
  reportTemplateSubtitle: string
  revenueReportTemplateTitle: string
  revenueReportTemplateSubtitle: string
  bookingsReportTemplateTitle: string
  bookingsReportTemplateSubtitle: string
  reportTemplateBadge: string
  reportSelectedTemplate: string
  paymentStatus: string
  paymentStatusAll: string
  paymentStatusPaid: string
  paymentStatusOpen: string
  paymentStatusRefunded: string
  paymentMethod: string
  allPaymentMethods: string
  clientCompany: string
  clientCompanyPlaceholder: string
  invoiceType: string
  invoiceTypeAll: string
  invoiceTypeInvoice: string
  invoiceTypeAdvance: string
  invoiceTypeRefund: string
  outputMode: string
  outputSummary: string
  outputDetailed: string
  billingDisabledReport: string
  issuedInvoices: string
  vatAmount: string
  paidTotal: string
  openTotal: string
  refundedTotal: string
  revenueByPaymentMethod: string
  revenueByConsultant: string
  revenueByService: string
  invoiceList: string
  invoiceNumber: string
  clientLabel: string
  dateLabel: string
  statusLabel: string
  typeLabel: string
  consultantLabel: string
  reservedBookings: string
  completedSessions: string
  cancelledSessions: string
  noShows: string
  bookingStatus: string
  bookingStatusAll: string
  bookingStatusReserved: string
  bookingStatusCompleted: string
  bookingStatusCancelled: string
  bookingStatusNoShow: string
  sourceChannel: string
  sourceAll: string
  sourceStaff: string
  sourceWebsiteWidget: string
  sourceGuestApp: string
  deliveryMode: string
  deliveryAll: string
  deliveryOnline: string
  deliveryOnsite: string
  sourceBreakdown: string
  busiestDaysTimes: string
  consultantHoursTitle: string
  roomHoursTitle: string
  minutesLabel: string
  reportParametersTitle: string
  reportParametersSubtitle: string
  reportLanguage: string
  reportLanguageEnglish: string
  reportLanguageSlovenian: string
  reportLanguageSerbian: string
  reportComparePrevious: string
  openPreview: string
  hidePreview: string
  downloadReportCsv: string
  printSavePdf: string
  businessReportTitle: string
  businessReportSubtitle: string
  reportPeriod: string
  reportGenerated: string
  filterSnapshot: string
  selectedConsultant: string
  selectedSpace: string
  selectedType: string
  reportSummary: string
  reportOnlineOnsiteSplit: string
  onlineSessions: string
  onsiteSessions: string
  previousPeriod: string
  currentPeriod: string
  compareLoading: string
  compareUnavailable: string
  vsPrevious: string
  reportTrendTitle: string
  reportTrendSubtitle: string
  reportTrendLabel: string
  reportNoData: string
  nameLabel: string
  amountLabel: string
  countLabel: string
  bookedTimeLabel: string
  changeLabel: string
  reportPreviewHint: string
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
    netLabel: 'Net',
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
    },
    tabOverview: 'Overview',
    tabReports: 'Reports',
    reportTemplateTitle: 'Business overview report',
    reportTemplateSubtitle: 'Printable version of the analytics dashboard with revenue, client, consultant, service and space summaries.',
    revenueReportTemplateTitle: 'Revenue & invoices report',
    revenueReportTemplateSubtitle: 'Accounting report with issued invoices, gross/net/VAT totals, payment status totals, rankings and invoice list.',
    bookingsReportTemplateTitle: 'Bookings & attendance report',
    bookingsReportTemplateSubtitle: 'Operational report with booking statuses, online/on-site split, booking sources, busiest times, consultant hours and room hours.',
    reportTemplateBadge: 'MVP report',
    reportSelectedTemplate: 'Report type',
    paymentStatus: 'Payment status',
    paymentStatusAll: 'All payment statuses',
    paymentStatusPaid: 'Paid',
    paymentStatusOpen: 'Open',
    paymentStatusRefunded: 'Refunded',
    paymentMethod: 'Payment method',
    allPaymentMethods: 'All payment methods',
    clientCompany: 'Client / company',
    clientCompanyPlaceholder: 'Search client, company or invoice…',
    invoiceType: 'Invoice type',
    invoiceTypeAll: 'All invoice types',
    invoiceTypeInvoice: 'Invoice',
    invoiceTypeAdvance: 'Advance',
    invoiceTypeRefund: 'Credit note',
    outputMode: 'Output',
    outputSummary: 'Summary only',
    outputDetailed: 'Detailed invoice list',
    billingDisabledReport: 'Revenue & invoices report is hidden because Billing is disabled for this tenant.',
    issuedInvoices: 'Issued invoices',
    vatAmount: 'VAT / tax amount',
    paidTotal: 'Paid total',
    openTotal: 'Open total',
    refundedTotal: 'Refunded total',
    revenueByPaymentMethod: 'Revenue by payment method',
    revenueByConsultant: 'Revenue by consultant',
    revenueByService: 'Revenue by service',
    invoiceList: 'Invoice list',
    invoiceNumber: 'Invoice number',
    clientLabel: 'Client',
    dateLabel: 'Date',
    statusLabel: 'Status',
    typeLabel: 'Type',
    consultantLabel: 'Consultant',
    reservedBookings: 'Reserved bookings',
    completedSessions: 'Completed / checked-out sessions',
    cancelledSessions: 'Cancelled sessions',
    noShows: 'No-shows',
    bookingStatus: 'Booking status',
    bookingStatusAll: 'All booking statuses',
    bookingStatusReserved: 'Reserved',
    bookingStatusCompleted: 'Completed / checked-out',
    bookingStatusCancelled: 'Cancelled',
    bookingStatusNoShow: 'No-show',
    sourceChannel: 'Booking source',
    sourceAll: 'All sources',
    sourceStaff: 'Staff',
    sourceWebsiteWidget: 'Website widget',
    sourceGuestApp: 'Guest app',
    deliveryMode: 'Online / on-site',
    deliveryAll: 'Online and on-site',
    deliveryOnline: 'Online only',
    deliveryOnsite: 'On-site only',
    sourceBreakdown: 'Booking source breakdown',
    busiestDaysTimes: 'Busiest days / times',
    consultantHoursTitle: 'Consultant hours',
    roomHoursTitle: 'Room hours',
    minutesLabel: 'Minutes',
    reportParametersTitle: 'Report parameters',
    reportParametersSubtitle: 'The report uses the date range, consultant, space and service/type filters above.',
    reportLanguage: 'Report language',
    reportLanguageEnglish: 'English',
    reportLanguageSlovenian: 'Slovenian',
    reportLanguageSerbian: 'Serbian',
    reportComparePrevious: 'Compare with previous period',
    openPreview: 'Open preview',
    hidePreview: 'Hide preview',
    downloadReportCsv: 'Download CSV',
    printSavePdf: 'Print / save PDF',
    businessReportTitle: 'Business overview report',
    businessReportSubtitle: 'Printable management summary based on selected analytics filters.',
    reportPeriod: 'Period',
    reportGenerated: 'Generated',
    filterSnapshot: 'Selected parameters',
    selectedConsultant: 'Consultant',
    selectedSpace: 'Space',
    selectedType: 'Service / type',
    reportSummary: 'Summary',
    reportOnlineOnsiteSplit: 'Online / on-site split',
    onlineSessions: 'Online sessions',
    onsiteSessions: 'On-site sessions',
    previousPeriod: 'Previous period',
    currentPeriod: 'Current period',
    compareLoading: 'Loading previous-period comparison…',
    compareUnavailable: 'Previous-period comparison is not available yet.',
    vsPrevious: 'vs previous period',
    reportTrendTitle: 'Weekly / monthly trend',
    reportTrendSubtitle: 'Sessions, new clients and revenue over the selected report period.',
    reportTrendLabel: 'Period',
    reportNoData: 'No data yet.',
    nameLabel: 'Name',
    amountLabel: 'Amount',
    countLabel: 'Count',
    bookedTimeLabel: 'Booked time',
    changeLabel: 'Change',
    reportPreviewHint: 'Use Print / save PDF to open the browser print dialog. Choose “Save as PDF” there when you need a PDF file.',
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
    netLabel: 'Neto',
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
    },
    tabOverview: 'Pregled',
    tabReports: 'Poročila',
    reportTemplateTitle: 'Poročilo poslovnega pregleda',
    reportTemplateSubtitle: 'Tiskljiva različica analitične nadzorne plošče s povzetki prihodkov, strank, zaposlenih, storitev in prostorov.',
    revenueReportTemplateTitle: 'Poročilo prihodkov in računov',
    revenueReportTemplateSubtitle: 'Računovodsko poročilo z izdanimi računi, bruto/neto/DDV zneski, statusi plačil, razvrstitvami in seznamom računov.',
    bookingsReportTemplateTitle: 'Poročilo rezervacij in prisotnosti',
    bookingsReportTemplateSubtitle: 'Operativno poročilo s statusi terminov, razdelitvijo spletno/v živo, viri rezervacij, najbolj zasedenimi termini, urami zaposlenih in prostorov.',
    reportTemplateBadge: 'MVP poročilo',
    reportSelectedTemplate: 'Vrsta poročila',
    paymentStatus: 'Status plačila',
    paymentStatusAll: 'Vsi statusi plačil',
    paymentStatusPaid: 'Plačano',
    paymentStatusOpen: 'Odprto',
    paymentStatusRefunded: 'Vračilo',
    paymentMethod: 'Način plačila',
    allPaymentMethods: 'Vsi načini plačila',
    clientCompany: 'Stranka / podjetje',
    clientCompanyPlaceholder: 'Iskanje stranke, podjetja ali računa…',
    invoiceType: 'Vrsta računa',
    invoiceTypeAll: 'Vse vrste računov',
    invoiceTypeInvoice: 'Račun',
    invoiceTypeAdvance: 'Predplačilo',
    invoiceTypeRefund: 'Dobropis',
    outputMode: 'Izpis',
    outputSummary: 'Samo povzetek',
    outputDetailed: 'Podroben seznam računov',
    billingDisabledReport: 'Poročilo prihodkov in računov je skrito, ker je Obračun pri tem najemniku izklopljen.',
    issuedInvoices: 'Izdani računi',
    vatAmount: 'DDV / davčni znesek',
    paidTotal: 'Plačano skupaj',
    openTotal: 'Odprto skupaj',
    refundedTotal: 'Vračila skupaj',
    revenueByPaymentMethod: 'Prihodki po načinu plačila',
    revenueByConsultant: 'Prihodki po zaposlenih',
    revenueByService: 'Prihodki po storitvah',
    invoiceList: 'Seznam računov',
    invoiceNumber: 'Številka računa',
    clientLabel: 'Stranka',
    dateLabel: 'Datum',
    statusLabel: 'Status',
    typeLabel: 'Vrsta',
    consultantLabel: 'Zaposleni',
    reservedBookings: 'Rezervirani termini',
    completedSessions: 'Zaključeni / odjavljeni termini',
    cancelledSessions: 'Preklicani termini',
    noShows: 'Neprihodi',
    bookingStatus: 'Status termina',
    bookingStatusAll: 'Vsi statusi terminov',
    bookingStatusReserved: 'Rezervirano',
    bookingStatusCompleted: 'Zaključeno / odjavljeno',
    bookingStatusCancelled: 'Preklicano',
    bookingStatusNoShow: 'Neprihod',
    sourceChannel: 'Vir rezervacije',
    sourceAll: 'Vsi viri',
    sourceStaff: 'Zaposleni',
    sourceWebsiteWidget: 'Spletni vtičnik',
    sourceGuestApp: 'Aplikacija za stranke',
    deliveryMode: 'Spletno / v živo',
    deliveryAll: 'Spletno in v živo',
    deliveryOnline: 'Samo spletno',
    deliveryOnsite: 'Samo v živo',
    sourceBreakdown: 'Razdelitev po viru rezervacije',
    busiestDaysTimes: 'Najbolj zasedeni dnevi / ure',
    consultantHoursTitle: 'Ure zaposlenih',
    roomHoursTitle: 'Ure prostorov',
    minutesLabel: 'Minute',
    reportParametersTitle: 'Parametri poročila',
    reportParametersSubtitle: 'Poročilo uporablja zgornje filtre za obdobje, zaposlenega, prostor in storitev/vrsto.',
    reportLanguage: 'Jezik poročila',
    reportLanguageEnglish: 'Angleščina',
    reportLanguageSlovenian: 'Slovenščina',
    reportLanguageSerbian: 'Srbščina',
    reportComparePrevious: 'Primerjaj s prejšnjim obdobjem',
    openPreview: 'Odpri predogled',
    hidePreview: 'Skrij predogled',
    downloadReportCsv: 'Prenesi CSV',
    printSavePdf: 'Natisni / shrani PDF',
    businessReportTitle: 'Poročilo poslovnega pregleda',
    businessReportSubtitle: 'Tiskljiv povzetek za vodstvo na podlagi izbranih analitičnih filtrov.',
    reportPeriod: 'Obdobje',
    reportGenerated: 'Ustvarjeno',
    filterSnapshot: 'Izbrani parametri',
    selectedConsultant: 'Zaposleni',
    selectedSpace: 'Prostor',
    selectedType: 'Storitev / vrsta',
    reportSummary: 'Povzetek',
    reportOnlineOnsiteSplit: 'Spletno / v živo',
    onlineSessions: 'Spletni termini',
    onsiteSessions: 'Termini v živo',
    previousPeriod: 'Prejšnje obdobje',
    currentPeriod: 'Trenutno obdobje',
    compareLoading: 'Nalagam primerjavo s prejšnjim obdobjem…',
    compareUnavailable: 'Primerjava s prejšnjim obdobjem še ni na voljo.',
    vsPrevious: 'v primerjavi s prejšnjim obdobjem',
    reportTrendTitle: 'Tedenski / mesečni trend',
    reportTrendSubtitle: 'Termini, nove stranke in prihodki v izbranem obdobju poročila.',
    reportTrendLabel: 'Obdobje',
    reportNoData: 'Podatkov še ni.',
    nameLabel: 'Naziv',
    amountLabel: 'Znesek',
    countLabel: 'Število',
    bookedTimeLabel: 'Zaseden čas',
    changeLabel: 'Sprememba',
    reportPreviewHint: 'Za PDF uporabite Natisni / shrani PDF in v brskalniku izberite “Shrani kot PDF”.',
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
    sendNow: 'Pošalji izveštaj',
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
    netLabel: 'Neto',
    grossLabel: 'Bruto',
    consultantHoursLabel: 'Sati zaposlenih',
    spaceHoursLabel: 'Sati prostora',
    onlineLabel: 'Online',
    onsiteLabel: 'Uživo',
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
    reportsTitle: 'Izveštaji za vlasnike',
    reportsSubtitle: 'Sačuvajte e-mail adresu za sažetak i automatsko slanje. Izveštaj možete poslati i odmah.',
    reportsEnabled: 'Automatski izveštaji',
    reportsEmail: 'E-mail adresa',
    reportsFrequency: 'Učestalost',
    reportsDaily: 'Dnevno',
    reportsWeekly: 'Nedeljno',
    saveSettings: 'Sačuvaj podešavanja',
    reportSettingsSaved: 'Podešavanja izveštaja su sačuvana.',
    reportSent: 'Analitički izveštaj je poslat.',
    reportSaveFailed: 'Podešavanja izveštaja nije moguće sačuvati.',
    reportSendFailed: 'Izveštaj nije moguće poslati.',
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
    reportTemplateTitle: 'Izveštaj poslovnog pregleda',
    reportTemplateSubtitle: 'Verzija analitičke table za štampu sa sažecima prihoda, klijenata, zaposlenih, usluga i prostora.',
    revenueReportTemplateTitle: 'Izveštaj prihoda i računa',
    revenueReportTemplateSubtitle: 'Računovodstveni izveštaj sa izdatim računima, bruto/neto/PDV iznosima, statusima plaćanja, rangiranjem i listom računa.',
    bookingsReportTemplateTitle: 'Izveštaj rezervacija i prisustva',
    bookingsReportTemplateSubtitle: 'Operativni izveštaj sa statusima termina, online/uživo podelom, izvorima rezervacija, najprometnijim terminima, satima zaposlenih i prostorija.',
    reportTemplateBadge: 'MVP izveštaj',
    reportSelectedTemplate: 'Vrsta izveštaja',
    paymentStatus: 'Status plaćanja',
    paymentStatusAll: 'Svi statusi plaćanja',
    paymentStatusPaid: 'Plaćeno',
    paymentStatusOpen: 'Otvoreno',
    paymentStatusRefunded: 'Refundirano',
    paymentMethod: 'Način plaćanja',
    allPaymentMethods: 'Svi načini plaćanja',
    clientCompany: 'Klijent / kompanija',
    clientCompanyPlaceholder: 'Pretraga klijenta, kompanije ili računa…',
    invoiceType: 'Vrsta računa',
    invoiceTypeAll: 'Sve vrste računa',
    invoiceTypeInvoice: 'Račun',
    invoiceTypeAdvance: 'Avans',
    invoiceTypeRefund: 'Knjižno odobrenje',
    outputMode: 'Prikaz',
    outputSummary: 'Samo sažetak',
    outputDetailed: 'Detaljna lista računa',
    billingDisabledReport: 'Izveštaj prihoda i računa je sakriven jer je Obračun isključen za ovog zakupca.',
    issuedInvoices: 'Izdati računi',
    vatAmount: 'PDV / poreski iznos',
    paidTotal: 'Ukupno plaćeno',
    openTotal: 'Ukupno otvoreno',
    refundedTotal: 'Ukupno refundirano',
    revenueByPaymentMethod: 'Prihod po načinu plaćanja',
    revenueByConsultant: 'Prihod po zaposlenima',
    revenueByService: 'Prihod po uslugama',
    invoiceList: 'Lista računa',
    invoiceNumber: 'Broj računa',
    clientLabel: 'Klijent',
    dateLabel: 'Datum',
    statusLabel: 'Status',
    typeLabel: 'Vrsta',
    consultantLabel: 'Zaposleni',
    reservedBookings: 'Rezervisani termini',
    completedSessions: 'Završeni / odjavljeni termini',
    cancelledSessions: 'Otkazani termini',
    noShows: 'Nedolasci',
    bookingStatus: 'Status termina',
    bookingStatusAll: 'Svi statusi termina',
    bookingStatusReserved: 'Rezervisano',
    bookingStatusCompleted: 'Završeno / odjavljeno',
    bookingStatusCancelled: 'Otkazano',
    bookingStatusNoShow: 'Nedolazak',
    sourceChannel: 'Izvor rezervacije',
    sourceAll: 'Svi izvori',
    sourceStaff: 'Zaposleni',
    sourceWebsiteWidget: 'Web widget',
    sourceGuestApp: 'Aplikacija za klijente',
    deliveryMode: 'Online / uživo',
    deliveryAll: 'Online i uživo',
    deliveryOnline: 'Samo online',
    deliveryOnsite: 'Samo uživo',
    sourceBreakdown: 'Podela po izvoru rezervacije',
    busiestDaysTimes: 'Najprometniji dani / sati',
    consultantHoursTitle: 'Sati zaposlenih',
    roomHoursTitle: 'Sati prostorija',
    minutesLabel: 'Minute',
    reportParametersTitle: 'Parametri izveštaja',
    reportParametersSubtitle: 'Izveštaj koristi gornje filtere za period, zaposlenog, prostor i uslugu/vrstu.',
    reportLanguage: 'Jezik izveštaja',
    reportLanguageEnglish: 'Engleski',
    reportLanguageSlovenian: 'Slovenački',
    reportLanguageSerbian: 'Srpski',
    reportComparePrevious: 'Uporedi sa prethodnim periodom',
    openPreview: 'Otvori pregled',
    hidePreview: 'Sakrij pregled',
    downloadReportCsv: 'Preuzmi CSV',
    printSavePdf: 'Štampaj / sačuvaj PDF',
    businessReportTitle: 'Izveštaj poslovnog pregleda',
    businessReportSubtitle: 'Sažetak za upravljanje na osnovu izabranih analitičkih filtera, spreman za štampu.',
    reportPeriod: 'Period',
    reportGenerated: 'Kreirano',
    filterSnapshot: 'Izabrani parametri',
    selectedConsultant: 'Zaposleni',
    selectedSpace: 'Prostor',
    selectedType: 'Usluga / vrsta',
    reportSummary: 'Sažetak',
    reportOnlineOnsiteSplit: 'Online / uživo',
    onlineSessions: 'Online termini',
    onsiteSessions: 'Termini uživo',
    previousPeriod: 'Prethodni period',
    currentPeriod: 'Trenutni period',
    compareLoading: 'Učitavam poređenje sa prethodnim periodom…',
    compareUnavailable: 'Poređenje sa prethodnim periodom još nije dostupno.',
    vsPrevious: 'u odnosu na prethodni period',
    reportTrendTitle: 'Nedeljni / mesečni trend',
    reportTrendSubtitle: 'Termini, novi klijenti i prihod u izabranom periodu izveštaja.',
    reportTrendLabel: 'Period',
    reportNoData: 'Još nema podataka.',
    nameLabel: 'Naziv',
    amountLabel: 'Iznos',
    countLabel: 'Broj',
    bookedTimeLabel: 'Rezervisano vreme',
    changeLabel: 'Promena',
    reportPreviewHint: 'Za PDF koristite Štampaj / sačuvaj PDF i u pregledaču izaberite “Sačuvaj kao PDF”.',
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

function parseLocalIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatLocalIsoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addLocalDays(date: Date, days: number) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  copy.setDate(copy.getDate() + days)
  return copy
}

function previousDateRange(fromIso: string, toIso: string) {
  const from = parseLocalIsoDate(fromIso)
  const to = parseLocalIsoDate(toIso)
  const dayMs = 24 * 60 * 60 * 1000
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / dayMs) + 1)
  const prevTo = addLocalDays(from, -1)
  const prevFrom = addLocalDays(prevTo, -(days - 1))
  return { from: formatLocalIsoDate(prevFrom), to: formatLocalIsoDate(prevTo) }
}

function safeNumber(value: number | string | null | undefined) {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
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
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('overview')
  const [reportLanguage, setReportLanguage] = useState<ReportLanguage>(() => toReportLanguage(locale))
  const [reportComparePrevious, setReportComparePrevious] = useState(false)
  const [reportPreviewOpen, setReportPreviewOpen] = useState(false)
  const [activeReportTemplate, setActiveReportTemplate] = useState<ReportTemplate>('business')
  const [revenuePaymentStatus, setRevenuePaymentStatus] = useState<RevenuePaymentStatusFilter>('all')
  const [revenuePaymentMethodId, setRevenuePaymentMethodId] = useState('')
  const [revenueClientQuery, setRevenueClientQuery] = useState('')
  const [revenueBillType, setRevenueBillType] = useState<RevenueBillTypeFilter>('ALL')
  const [revenueOutputMode, setRevenueOutputMode] = useState<RevenueOutputMode>('detailed')
  const [bookingStatusFilter, setBookingStatusFilter] = useState<BookingStatusFilter>('ALL')
  const [bookingSourceFilter, setBookingSourceFilter] = useState<BookingSourceFilter>('ALL')
  const [bookingDeliveryMode, setBookingDeliveryMode] = useState<DeliveryModeFilter>('ALL')

  const text = ANALYTICS_COPY[toReportLanguage(locale)]
  const reportText = ANALYTICS_COPY[reportLanguage]

  useEffect(() => {
    setReportLanguage(toReportLanguage(locale))
  }, [locale])

  const isAdmin = me.role === 'ADMIN' || me.role === 'SUPER_ADMIN'
  const canFetch = periodPreset !== 'custom' || (!!customFrom && !!customTo)
  const appLocaleTag = localeTagFor(toReportLanguage(locale))
  const reportLocaleTag = localeTagFor(reportLanguage)

  const { data: filterData } = useQuery<{
    consultants: ConsultantOption[]
    spaces: SpaceOption[]
    types: TypeOption[]
  }>({
    queryKey: ['analytics-filters-meta', me.role],
    queryFn: async () => {
      const [usersRes, spacesRes, typesRes] = await Promise.all([
        isAdmin ? api.get<ConsultantOption[]>('/users').catch(() => ({ data: [] as ConsultantOption[] })) : Promise.resolve({ data: [] as ConsultantOption[] }),
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

  const billingReportsEnabled = (settingsQuery.data?.BILLING_ENABLED ?? 'true') !== 'false'

  useEffect(() => {
    if (!billingReportsEnabled && activeReportTemplate === 'revenueInvoices') {
      setActiveReportTemplate('business')
    }
  }, [billingReportsEnabled, activeReportTemplate])

  const paymentMethodsQuery = useQuery<PaymentMethodOption[]>({
    queryKey: ['analytics-report-payment-methods', billingReportsEnabled],
    enabled: billingReportsEnabled,
    queryFn: async () => {
      const res = await api.get<PaymentMethodOption[]>('/billing/payment-methods')
      return res.data ?? []
    },
  })

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

  const reportPreviousRange = useMemo(() => {
    if (!data?.rangeStart || !data?.rangeEnd) return null
    return previousDateRange(data.rangeStart, data.rangeEnd)
  }, [data?.rangeStart, data?.rangeEnd])

  const previousOverviewQuery = useQuery<AnalyticsOverview>({
    queryKey: ['analytics-business-overview-previous', reportPreviousRange?.from, reportPreviousRange?.to, consultantId, spaceId, typeId, activeTab, reportComparePrevious],
    enabled: activeTab === 'reports' && reportComparePrevious && !!reportPreviousRange && canFetch,
    queryFn: async () => {
      if (!reportPreviousRange) throw new Error('Missing previous report range')
      const params: Record<string, string | number> = {
        period: 'custom',
        from: reportPreviousRange.from,
        to: reportPreviousRange.to,
      }
      if (consultantId) params.consultantId = Number(consultantId)
      if (spaceId) params.spaceId = Number(spaceId)
      if (typeId) params.typeId = Number(typeId)
      const res = await api.get<AnalyticsOverview>('/analytics/overview', { params })
      return res.data
    },
  })

  const previousData = reportComparePrevious ? previousOverviewQuery.data ?? null : null

  const revenueInvoicesQuery = useQuery<RevenueInvoicesReport>({
    queryKey: [
      'analytics-report-revenue-invoices',
      periodPreset,
      customFrom,
      customTo,
      consultantId,
      revenuePaymentStatus,
      revenuePaymentMethodId,
      revenueClientQuery,
      revenueBillType,
      activeTab,
      activeReportTemplate,
      billingReportsEnabled,
    ],
    enabled: activeTab === 'reports' && activeReportTemplate === 'revenueInvoices' && billingReportsEnabled && canFetch,
    queryFn: async () => {
      const params: Record<string, string | number> = { period: periodPreset }
      if (periodPreset === 'custom') {
        params.from = customFrom
        params.to = customTo
      }
      if (consultantId) params.consultantId = Number(consultantId)
      if (revenuePaymentStatus !== 'all') params.paymentStatus = revenuePaymentStatus
      if (revenuePaymentMethodId) params.paymentMethodId = Number(revenuePaymentMethodId)
      if (revenueClientQuery.trim()) params.clientQuery = revenueClientQuery.trim()
      if (revenueBillType !== 'ALL') params.billType = revenueBillType
      const res = await api.get<RevenueInvoicesReport>('/analytics/reports/revenue-invoices', { params })
      return res.data
    },
  })

  const bookingsAttendanceQuery = useQuery<BookingsAttendanceReport>({
    queryKey: [
      'analytics-report-bookings-attendance',
      periodPreset,
      customFrom,
      customTo,
      consultantId,
      spaceId,
      typeId,
      bookingStatusFilter,
      bookingSourceFilter,
      bookingDeliveryMode,
      activeTab,
      activeReportTemplate,
    ],
    enabled: activeTab === 'reports' && activeReportTemplate === 'bookingsAttendance' && canFetch,
    queryFn: async () => {
      const params: Record<string, string | number> = { period: periodPreset }
      if (periodPreset === 'custom') {
        params.from = customFrom
        params.to = customTo
      }
      if (consultantId) params.consultantId = Number(consultantId)
      if (spaceId) params.spaceId = Number(spaceId)
      if (typeId) params.typeId = Number(typeId)
      if (bookingStatusFilter !== 'ALL') params.bookingStatus = bookingStatusFilter
      if (bookingSourceFilter !== 'ALL') params.sourceChannel = bookingSourceFilter
      if (bookingDeliveryMode !== 'ALL') params.deliveryMode = bookingDeliveryMode
      const res = await api.get<BookingsAttendanceReport>('/analytics/reports/bookings-attendance', { params })
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

  const previousSummary = previousData?.summary ?? null
  const previousOnlineShare = previousSummary && previousSummary.sessionsTotal > 0 ? previousSummary.sessionsOnline / previousSummary.sessionsTotal : 0
  const previousAvgRevenuePerSession = previousSummary && previousSummary.sessionsTotal > 0 ? safeNumber(previousSummary.revenueGross) / previousSummary.sessionsTotal : 0

  const reportDateFormatter = useMemo(() => new Intl.DateTimeFormat(reportLocaleTag, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }), [reportLocaleTag])

  const reportDateTimeFormatter = useMemo(() => new Intl.DateTimeFormat(reportLocaleTag, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }), [reportLocaleTag])

  const reportNumberFormatter = useMemo(() => new Intl.NumberFormat(reportLocaleTag, {
    maximumFractionDigits: 0,
  }), [reportLocaleTag])

  const reportRevenueFormatter = useMemo(() => new Intl.NumberFormat(reportLocaleTag, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }), [reportLocaleTag])

  const reportPercentFormatter = useMemo(() => new Intl.NumberFormat(reportLocaleTag, {
    style: 'percent',
    maximumFractionDigits: 0,
  }), [reportLocaleTag])

  const reportRangeLabel = useMemo(() => {
    if (!data) return ''
    const from = reportDateFormatter.format(parseLocalIsoDate(data.rangeStart))
    const to = reportDateFormatter.format(parseLocalIsoDate(data.rangeEnd))
    return from === to ? from : `${from} – ${to}`
  }, [data, reportDateFormatter])

  const previousRangeLabel = useMemo(() => {
    if (!reportPreviousRange) return ''
    const from = reportDateFormatter.format(parseLocalIsoDate(reportPreviousRange.from))
    const to = reportDateFormatter.format(parseLocalIsoDate(reportPreviousRange.to))
    return from === to ? from : `${from} – ${to}`
  }, [reportPreviousRange, reportDateFormatter])

  const reportGeneratedLabel = useMemo(() => reportDateTimeFormatter.format(new Date()), [reportDateTimeFormatter, data?.rangeStart, data?.rangeEnd, reportLanguage])

  const selectedConsultantName = useMemo(() => {
    if (!consultantId) return reportText.allConsultants
    const match = (filterData?.consultants ?? []).find((item) => String(item.id) === consultantId)
    return match ? fullName(match) : reportText.allConsultants
  }, [consultantId, filterData?.consultants, reportText.allConsultants])

  const selectedSpaceName = useMemo(() => {
    if (!spaceId) return reportText.allSpaces
    const match = (filterData?.spaces ?? []).find((item) => String(item.id) === spaceId)
    return match?.name || reportText.allSpaces
  }, [spaceId, filterData?.spaces, reportText.allSpaces])

  const selectedTypeName = useMemo(() => {
    if (!typeId) return reportText.allTypes
    const match = (filterData?.types ?? []).find((item) => String(item.id) === typeId)
    return match?.name || reportText.allTypes
  }, [typeId, filterData?.types, reportText.allTypes])

  const reportTrendRows = useMemo(() => {
    if (!data) return [] as Array<{ label: string; sessionsTotal: number; newClients: number; revenueGross: number; revenueNet?: number }>
    const monthFormatter = new Intl.DateTimeFormat(reportLocaleTag, { month: 'short', year: '2-digit' })
    const weekFormatter = new Intl.DateTimeFormat(reportLocaleTag, { day: 'numeric', month: 'short' })
    if (data.period === 'month' && data.months.length > 0) {
      return data.months.map((point) => ({
        label: point.month ? monthFormatter.format(new Date(point.year, point.month - 1, 1)) : String(point.year),
        sessionsTotal: point.sessionsTotal,
        newClients: point.newClients,
        revenueGross: safeNumber(point.revenueGross),
        revenueNet: safeNumber(point.revenueNet),
      }))
    }
    if (data.period === 'year' && data.years.length > 0) {
      return data.years.map((point) => ({
        label: String(point.year),
        sessionsTotal: point.sessionsTotal,
        newClients: point.newClients,
        revenueGross: safeNumber(point.revenueGross),
        revenueNet: safeNumber(point.revenueNet),
      }))
    }
    return data.weeks.map((point) => ({
      label: weekFormatter.format(parseLocalIsoDate(point.weekStart)),
      sessionsTotal: point.sessionsTotal,
      newClients: point.newClients,
      revenueGross: safeNumber(point.revenueGross),
    }))
  }, [data, reportLocaleTag])

  const reportNumber = (value: number | string | null | undefined) => reportNumberFormatter.format(safeNumber(value))
  const reportRevenue = (value: number | string | null | undefined) => reportRevenueFormatter.format(safeNumber(value))
  const reportPercent = (value: number) => reportPercentFormatter.format(Number.isFinite(value) ? value : 0)

  const reportDelta = (current: number, previous: number | null | undefined, valueFormatter?: (value: number) => string) => {
    if (!reportComparePrevious || previous == null) return ''
    const diff = current - previous
    if (previous === 0) {
      if (diff === 0) return `0 ${reportText.vsPrevious}`
      const formatted = valueFormatter ? valueFormatter(diff) : reportNumberFormatter.format(diff)
      return `${diff > 0 ? '+' : ''}${formatted} ${reportText.vsPrevious}`
    }
    const ratio = diff / Math.abs(previous)
    return `${diff >= 0 ? '+' : ''}${reportPercentFormatter.format(ratio)} ${reportText.vsPrevious}`
  }

  const reportLanguageLabel = reportLanguage === 'en'
    ? reportText.reportLanguageEnglish
    : reportLanguage === 'sl'
      ? reportText.reportLanguageSlovenian
      : reportText.reportLanguageSerbian

  const activeReportTitle = activeReportTemplate === 'revenueInvoices'
    ? reportText.revenueReportTemplateTitle
    : activeReportTemplate === 'bookingsAttendance'
      ? reportText.bookingsReportTemplateTitle
      : reportText.reportTemplateTitle

  const activeReportSubtitle = activeReportTemplate === 'revenueInvoices'
    ? reportText.revenueReportTemplateSubtitle
    : activeReportTemplate === 'bookingsAttendance'
      ? reportText.bookingsReportTemplateSubtitle
      : reportText.reportTemplateSubtitle

  const reportIsLoading = activeReportTemplate === 'revenueInvoices'
    ? revenueInvoicesQuery.isFetching
    : activeReportTemplate === 'bookingsAttendance'
      ? bookingsAttendanceQuery.isFetching
      : previousOverviewQuery.isFetching && reportComparePrevious

  const reportMetricRows = summary ? [
    {
      label: reportText.kpiSessions,
      value: reportNumber(summary.sessionsTotal),
      delta: reportDelta(summary.sessionsTotal, previousSummary?.sessionsTotal),
    },
    {
      label: reportText.kpiRevenue,
      value: reportRevenue(summary.revenueGross),
      delta: reportDelta(safeNumber(summary.revenueGross), previousSummary ? safeNumber(previousSummary.revenueGross) : null, reportRevenue),
    },
    {
      label: `${reportText.revenueLabel} ${reportText.netLabel.toLowerCase()}`,
      value: reportRevenue(summary.revenueNet),
      delta: reportDelta(safeNumber(summary.revenueNet), previousSummary ? safeNumber(previousSummary.revenueNet) : null, reportRevenue),
    },
    {
      label: reportText.kpiNewClients,
      value: reportNumber(summary.newClients),
      delta: reportDelta(summary.newClients, previousSummary?.newClients),
    },
    {
      label: reportText.kpiActiveClients,
      value: reportNumber(summary.clientsTotal),
      delta: reportDelta(summary.clientsTotal, previousSummary?.clientsTotal),
    },
    {
      label: reportText.kpiOnlineShare,
      value: reportPercent(onlineShare),
      delta: reportDelta(onlineShare, previousSummary ? previousOnlineShare : null, reportPercent),
    },
    {
      label: reportText.kpiAvgRevenue,
      value: reportRevenue(avgRevenuePerSession),
      delta: reportDelta(avgRevenuePerSession, previousSummary ? previousAvgRevenuePerSession : null, reportRevenue),
    },
  ] : []

  const formatReportRange = (fromIso?: string, toIso?: string) => {
    if (!fromIso || !toIso) return reportRangeLabel
    const from = reportDateFormatter.format(parseLocalIsoDate(fromIso))
    const to = reportDateFormatter.format(parseLocalIsoDate(toIso))
    return from === to ? from : `${from} – ${to}`
  }

  const invoiceStatusLabel = (status: string) => {
    const normalized = String(status || '').toLowerCase()
    if (normalized === 'paid') return reportText.paymentStatusPaid
    if (normalized === 'refunded') return reportText.paymentStatusRefunded
    if (normalized === 'payment_pending' || normalized === 'open') return reportText.paymentStatusOpen
    return status || '—'
  }

  const invoiceTypeLabel = (type: string) => {
    const normalized = String(type || '').toUpperCase()
    if (normalized === 'ADVANCE') return reportText.invoiceTypeAdvance
    if (normalized === 'REFUND') return reportText.invoiceTypeRefund
    return reportText.invoiceTypeInvoice
  }

  const sourceLabel = (source: string) => {
    const normalized = String(source || '').toUpperCase()
    if (normalized === 'WEBSITE_WIDGET') return reportText.sourceWebsiteWidget
    if (normalized === 'GUEST_APP') return reportText.sourceGuestApp
    return reportText.sourceStaff
  }

  const revenueMetricRows = revenueInvoicesQuery.data ? [
    { label: reportText.issuedInvoices, value: reportNumber(revenueInvoicesQuery.data.summary.issuedInvoices) },
    { label: reportText.grossLabel, value: reportRevenue(revenueInvoicesQuery.data.summary.grossTotal) },
    { label: reportText.netLabel, value: reportRevenue(revenueInvoicesQuery.data.summary.netTotal) },
    { label: reportText.vatAmount, value: reportRevenue(revenueInvoicesQuery.data.summary.vatTotal) },
    { label: reportText.paidTotal, value: reportRevenue(revenueInvoicesQuery.data.summary.paidTotal) },
    { label: reportText.openTotal, value: reportRevenue(revenueInvoicesQuery.data.summary.openTotal) },
    { label: reportText.refundedTotal, value: reportRevenue(revenueInvoicesQuery.data.summary.refundedTotal) },
  ] : []

  const bookingMetricRows = bookingsAttendanceQuery.data ? [
    { label: reportText.reservedBookings, value: reportNumber(bookingsAttendanceQuery.data.summary.reservedBookings) },
    { label: reportText.completedSessions, value: reportNumber(bookingsAttendanceQuery.data.summary.completedSessions) },
    { label: reportText.cancelledSessions, value: reportNumber(bookingsAttendanceQuery.data.summary.cancelledSessions) },
    { label: reportText.noShows, value: reportNumber(bookingsAttendanceQuery.data.summary.noShows) },
    { label: reportText.onlineSessions, value: reportNumber(bookingsAttendanceQuery.data.summary.onlineSessions) },
    { label: reportText.onsiteSessions, value: reportNumber(bookingsAttendanceQuery.data.summary.onsiteSessions) },
  ] : []

  const downloadBusinessReportCsv = () => {
    if (!data || !summary) return
    const rows: Array<Array<string | number>> = [
      [reportText.businessReportTitle],
      [reportText.reportPeriod, reportRangeLabel],
      [reportText.reportGenerated, reportGeneratedLabel],
      [],
      [reportText.filterSnapshot],
      [reportText.selectedConsultant, selectedConsultantName],
      [reportText.selectedSpace, selectedSpaceName],
      [reportText.selectedType, selectedTypeName],
      [reportText.reportLanguage, reportLanguageLabel],
      [reportText.reportComparePrevious, reportComparePrevious ? 'Yes' : 'No'],
      ...(reportComparePrevious && previousRangeLabel ? [[reportText.previousPeriod, previousRangeLabel] as Array<string | number>] : []),
      [],
      [reportText.reportSummary],
      [reportText.nameLabel, reportText.currentPeriod, reportComparePrevious ? reportText.previousPeriod : '', reportComparePrevious ? reportText.changeLabel : ''],
      ...reportMetricRows.map((metric) => [metric.label, metric.value, '', metric.delta]),
      [reportText.onlineSessions, summary.sessionsOnline, previousSummary?.sessionsOnline ?? '', reportDelta(summary.sessionsOnline, previousSummary?.sessionsOnline)],
      [reportText.onsiteSessions, summary.sessionsStandard, previousSummary?.sessionsStandard ?? '', reportDelta(summary.sessionsStandard, previousSummary?.sessionsStandard)],
      [],
      [reportText.topServicesTitle],
      [reportText.nameLabel, reportText.amountLabel, reportText.countLabel],
      ...data.topServices.map((item) => [item.label, reportRevenue(item.amount), item.count]),
      [],
      [reportText.topConsultantsTitle],
      [reportText.nameLabel, reportText.amountLabel, reportText.countLabel],
      ...data.topConsultants.map((item) => [item.label, reportRevenue(item.amount), item.count]),
      [],
      [reportText.topClientsTitle],
      [reportText.nameLabel, reportText.amountLabel, reportText.countLabel],
      ...data.topClients.map((item) => [item.label, reportRevenue(item.amount), item.count]),
      [],
      [reportText.topSpacesTitle],
      [reportText.nameLabel, reportText.bookedTimeLabel, reportText.sessionsLabel],
      ...data.topSpaces.map((item) => [item.label, minutesFormatter(item.minutes), item.sessionsTotal]),
      [],
      [reportText.reportTrendTitle],
      [reportText.reportTrendLabel, reportText.sessionsLabel, reportText.newClientsLabel, reportText.kpiRevenue],
      ...reportTrendRows.map((row) => [row.label, row.sessionsTotal, row.newClients, reportRevenue(row.revenueGross)]),
    ]
    const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `business-overview-${data.rangeStart}-${data.rangeEnd}-${reportLanguage}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadRevenueInvoicesCsv = () => {
    const report = revenueInvoicesQuery.data
    if (!report) return
    const rows: Array<Array<string | number>> = [
      [reportText.revenueReportTemplateTitle],
      [reportText.reportPeriod, formatReportRange(report.rangeStart, report.rangeEnd)],
      [reportText.reportGenerated, reportGeneratedLabel],
      [],
      [reportText.filterSnapshot],
      [reportText.selectedConsultant, selectedConsultantName],
      [reportText.paymentStatus, revenuePaymentStatus === 'all' ? reportText.paymentStatusAll : invoiceStatusLabel(revenuePaymentStatus)],
      [reportText.paymentMethod, revenuePaymentMethodId ? (paymentMethodsQuery.data ?? []).find((m) => String(m.id) === revenuePaymentMethodId)?.name || revenuePaymentMethodId : reportText.allPaymentMethods],
      [reportText.clientCompany, revenueClientQuery || reportText.clientCompanyPlaceholder],
      [reportText.invoiceType, invoiceTypeLabel(revenueBillType)],
      [reportText.outputMode, revenueOutputMode === 'summary' ? reportText.outputSummary : reportText.outputDetailed],
      [],
      [reportText.reportSummary],
      [reportText.nameLabel, reportText.amountLabel],
      ...revenueMetricRows.map((metric) => [metric.label, metric.value]),
      [],
      [reportText.revenueByPaymentMethod],
      [reportText.nameLabel, reportText.amountLabel, reportText.countLabel],
      ...report.revenueByPaymentMethod.map((item) => [item.label, reportRevenue(item.amount), item.count]),
      [],
      [reportText.revenueByConsultant],
      [reportText.nameLabel, reportText.amountLabel, reportText.countLabel],
      ...report.revenueByConsultant.map((item) => [item.label, reportRevenue(item.amount), item.count]),
      [],
      [reportText.revenueByService],
      [reportText.nameLabel, reportText.amountLabel, reportText.countLabel],
      ...report.revenueByService.map((item) => [item.label, reportRevenue(item.amount), item.count]),
    ]
    if (revenueOutputMode === 'detailed') {
      rows.push(
        [],
        [reportText.invoiceList],
        [reportText.invoiceNumber, reportText.clientLabel, reportText.dateLabel, reportText.statusLabel, reportText.typeLabel, reportText.paymentMethod, reportText.consultantLabel, reportText.netLabel, reportText.grossLabel, reportText.vatAmount],
        ...report.invoices.map((invoice) => [
          invoice.invoiceNumber || '—',
          invoice.client || '—',
          invoice.date || '—',
          invoiceStatusLabel(invoice.status),
          invoiceTypeLabel(invoice.type),
          invoice.paymentMethod || '—',
          invoice.consultant || '—',
          reportRevenue(invoice.netTotal),
          reportRevenue(invoice.grossTotal),
          reportRevenue(invoice.vatTotal),
        ]),
      )
    }
    const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `revenue-invoices-${report.rangeStart}-${report.rangeEnd}-${reportLanguage}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadBookingsAttendanceCsv = () => {
    const report = bookingsAttendanceQuery.data
    if (!report) return
    const rows: Array<Array<string | number>> = [
      [reportText.bookingsReportTemplateTitle],
      [reportText.reportPeriod, formatReportRange(report.rangeStart, report.rangeEnd)],
      [reportText.reportGenerated, reportGeneratedLabel],
      [],
      [reportText.filterSnapshot],
      [reportText.selectedConsultant, selectedConsultantName],
      [reportText.selectedSpace, selectedSpaceName],
      [reportText.selectedType, selectedTypeName],
      [reportText.bookingStatus, bookingStatusFilter],
      [reportText.sourceChannel, bookingSourceFilter],
      [reportText.deliveryMode, bookingDeliveryMode],
      [],
      [reportText.reportSummary],
      [reportText.nameLabel, reportText.countLabel],
      ...bookingMetricRows.map((metric) => [metric.label, metric.value]),
      [],
      [reportText.sourceBreakdown],
      [reportText.nameLabel, reportText.countLabel, reportText.bookedTimeLabel],
      ...report.sourceBreakdown.map((item) => [sourceLabel(item.label), item.count, minutesFormatter(item.minutes)]),
      [],
      [reportText.busiestDaysTimes],
      [reportText.nameLabel, reportText.countLabel, reportText.bookedTimeLabel],
      ...report.busiestDaysTimes.map((item) => [item.label, item.count, minutesFormatter(item.minutes)]),
      [],
      [reportText.consultantHoursTitle],
      [reportText.nameLabel, reportText.bookedTimeLabel, reportText.sessionsLabel],
      ...report.consultantHours.map((item) => [item.label, minutesFormatter(item.minutes), item.sessionsTotal]),
      [],
      [reportText.roomHoursTitle],
      [reportText.nameLabel, reportText.bookedTimeLabel, reportText.sessionsLabel],
      ...report.roomHours.map((item) => [item.label, minutesFormatter(item.minutes), item.sessionsTotal]),
    ]
    const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bookings-attendance-${report.rangeStart}-${report.rangeEnd}-${reportLanguage}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const printBusinessReport = () => {
    if (!data || !summary) return
    setReportPreviewOpen(true)
    window.setTimeout(() => window.print(), 120)
  }

  const downloadActiveReportCsv = () => {
    if (activeReportTemplate === 'revenueInvoices') return downloadRevenueInvoicesCsv()
    if (activeReportTemplate === 'bookingsAttendance') return downloadBookingsAttendanceCsv()
    return downloadBusinessReportCsv()
  }

  const printActiveReport = () => {
    if (activeReportTemplate === 'business') return printBusinessReport()
    setReportPreviewOpen(true)
    window.setTimeout(() => window.print(), 120)
  }

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

  const businessReportPreview = data && summary ? (
    <Card className="analytics-business-report analytics-business-report-print-area">
      <div className="analytics-business-report__header">
        <div>
          <span className="analytics-business-report__eyebrow">{reportText.reportTemplateBadge}</span>
          <h2>{reportText.businessReportTitle}</h2>
          <p>{reportText.businessReportSubtitle}</p>
        </div>
        <div className="analytics-business-report__meta-card">
          <span>{reportText.reportPeriod}</span>
          <strong>{reportRangeLabel}</strong>
          <span>{reportText.reportGenerated}: {reportGeneratedLabel}</span>
        </div>
      </div>

      <div className="analytics-business-report__parameter-grid">
        <div>
          <span>{reportText.selectedConsultant}</span>
          <strong>{selectedConsultantName}</strong>
        </div>
        <div>
          <span>{reportText.selectedSpace}</span>
          <strong>{selectedSpaceName}</strong>
        </div>
        <div>
          <span>{reportText.selectedType}</span>
          <strong>{selectedTypeName}</strong>
        </div>
        <div>
          <span>{reportText.reportLanguage}</span>
          <strong>{reportLanguageLabel}</strong>
        </div>
      </div>

      {reportComparePrevious && (
        <div className="analytics-business-report__comparison-note">
          <strong>{reportText.previousPeriod}</strong>
          <span>{previousRangeLabel || '—'}</span>
          {previousOverviewQuery.isFetching && <span>{reportText.compareLoading}</span>}
          {!previousOverviewQuery.isFetching && !previousData && <span>{reportText.compareUnavailable}</span>}
        </div>
      )}

      <section className="analytics-business-report__section">
        <div className="analytics-business-report__section-heading">
          <h3>{reportText.reportSummary}</h3>
          <p>{reportText.reportParametersSubtitle}</p>
        </div>
        <div className="analytics-business-report__metric-grid">
          {reportMetricRows.map((metric) => (
            <div key={metric.label} className="analytics-business-report__metric">
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              {metric.delta && <em>{metric.delta}</em>}
            </div>
          ))}
        </div>
      </section>

      <section className="analytics-business-report__section">
        <div className="analytics-business-report__section-heading">
          <h3>{reportText.reportOnlineOnsiteSplit}</h3>
        </div>
        <div className="analytics-business-report__split-grid">
          <div>
            <span>{reportText.onlineSessions}</span>
            <strong>{reportNumber(summary.sessionsOnline)}</strong>
            {reportComparePrevious && <em>{reportDelta(summary.sessionsOnline, previousSummary?.sessionsOnline)}</em>}
          </div>
          <div>
            <span>{reportText.onsiteSessions}</span>
            <strong>{reportNumber(summary.sessionsStandard)}</strong>
            {reportComparePrevious && <em>{reportDelta(summary.sessionsStandard, previousSummary?.sessionsStandard)}</em>}
          </div>
        </div>
      </section>

      <section className="analytics-business-report__section">
        <div className="analytics-business-report__section-heading">
          <h3>{reportText.reportTrendTitle}</h3>
          <p>{reportText.reportTrendSubtitle}</p>
        </div>
        {reportTrendRows.length === 0 ? (
          <div className="muted analytics-ranking-empty">{reportText.reportNoData}</div>
        ) : (
          <div className="analytics-business-report__table-wrap">
            <table className="analytics-business-report__table">
              <thead>
                <tr>
                  <th>{reportText.reportTrendLabel}</th>
                  <th>{reportText.sessionsLabel}</th>
                  <th>{reportText.newClientsLabel}</th>
                  <th>{reportText.kpiRevenue}</th>
                </tr>
              </thead>
              <tbody>
                {reportTrendRows.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>{reportNumber(row.sessionsTotal)}</td>
                    <td>{reportNumber(row.newClients)}</td>
                    <td>{reportRevenue(row.revenueGross)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="analytics-business-report__section analytics-business-report__section--rankings">
        <div className="analytics-business-report__section-heading">
          <h3>{reportText.filterSnapshot}</h3>
        </div>
        <div className="analytics-business-report__tables-grid">
          <div className="analytics-business-report__table-card">
            <h4>{reportText.topServicesTitle}</h4>
            {data.topServices.length === 0 ? <p>{reportText.reportNoData}</p> : (
              <table className="analytics-business-report__table analytics-business-report__table--compact">
                <thead><tr><th>{reportText.nameLabel}</th><th>{reportText.amountLabel}</th><th>{reportText.countLabel}</th></tr></thead>
                <tbody>{data.topServices.map((item) => <tr key={item.label}><td>{item.label}</td><td>{reportRevenue(item.amount)}</td><td>{reportNumber(item.count)}</td></tr>)}</tbody>
              </table>
            )}
          </div>
          <div className="analytics-business-report__table-card">
            <h4>{reportText.topConsultantsTitle}</h4>
            {data.topConsultants.length === 0 ? <p>{reportText.reportNoData}</p> : (
              <table className="analytics-business-report__table analytics-business-report__table--compact">
                <thead><tr><th>{reportText.nameLabel}</th><th>{reportText.amountLabel}</th><th>{reportText.countLabel}</th></tr></thead>
                <tbody>{data.topConsultants.map((item) => <tr key={item.label}><td>{item.label}</td><td>{reportRevenue(item.amount)}</td><td>{reportNumber(item.count)}</td></tr>)}</tbody>
              </table>
            )}
          </div>
          <div className="analytics-business-report__table-card">
            <h4>{reportText.topClientsTitle}</h4>
            {data.topClients.length === 0 ? <p>{reportText.reportNoData}</p> : (
              <table className="analytics-business-report__table analytics-business-report__table--compact">
                <thead><tr><th>{reportText.nameLabel}</th><th>{reportText.amountLabel}</th><th>{reportText.countLabel}</th></tr></thead>
                <tbody>{data.topClients.map((item) => <tr key={item.label}><td>{item.label}</td><td>{reportRevenue(item.amount)}</td><td>{reportNumber(item.count)}</td></tr>)}</tbody>
              </table>
            )}
          </div>
          <div className="analytics-business-report__table-card">
            <h4>{reportText.topSpacesTitle}</h4>
            {data.topSpaces.length === 0 ? <p>{reportText.reportNoData}</p> : (
              <table className="analytics-business-report__table analytics-business-report__table--compact">
                <thead><tr><th>{reportText.nameLabel}</th><th>{reportText.bookedTimeLabel}</th><th>{reportText.sessionsLabel}</th></tr></thead>
                <tbody>{data.topSpaces.map((item) => <tr key={item.label}><td>{item.label}</td><td>{minutesFormatter(item.minutes)}</td><td>{reportNumber(item.sessionsTotal)}</td></tr>)}</tbody>
              </table>
            )}
          </div>
        </div>
      </section>
    </Card>
  ) : null

  const revenueInvoicesReportPreview = revenueInvoicesQuery.data ? (
    <Card className="analytics-business-report analytics-business-report-print-area">
      <div className="analytics-business-report__header">
        <div>
          <span className="analytics-business-report__eyebrow">{reportText.reportTemplateBadge}</span>
          <h2>{reportText.revenueReportTemplateTitle}</h2>
          <p>{reportText.revenueReportTemplateSubtitle}</p>
        </div>
        <div className="analytics-business-report__meta-card">
          <span>{reportText.reportPeriod}</span>
          <strong>{formatReportRange(revenueInvoicesQuery.data.rangeStart, revenueInvoicesQuery.data.rangeEnd)}</strong>
          <span>{reportText.reportGenerated}: {reportGeneratedLabel}</span>
        </div>
      </div>

      <div className="analytics-business-report__parameter-grid">
        <div><span>{reportText.selectedConsultant}</span><strong>{selectedConsultantName}</strong></div>
        <div><span>{reportText.paymentStatus}</span><strong>{revenuePaymentStatus === 'all' ? reportText.paymentStatusAll : invoiceStatusLabel(revenuePaymentStatus)}</strong></div>
        <div><span>{reportText.paymentMethod}</span><strong>{revenuePaymentMethodId ? (paymentMethodsQuery.data ?? []).find((m) => String(m.id) === revenuePaymentMethodId)?.name || revenuePaymentMethodId : reportText.allPaymentMethods}</strong></div>
        <div><span>{reportText.invoiceType}</span><strong>{revenueBillType === 'ALL' ? reportText.invoiceTypeAll : invoiceTypeLabel(revenueBillType)}</strong></div>
      </div>

      <section className="analytics-business-report__section">
        <div className="analytics-business-report__section-heading">
          <h3>{reportText.reportSummary}</h3>
          <p>{reportText.clientCompany}: {revenueClientQuery || '—'}</p>
        </div>
        <div className="analytics-business-report__metric-grid">
          {revenueMetricRows.map((metric) => (
            <div key={metric.label} className="analytics-business-report__metric">
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="analytics-business-report__section analytics-business-report__section--rankings">
        <div className="analytics-business-report__tables-grid">
          <div className="analytics-business-report__table-card">
            <h4>{reportText.revenueByPaymentMethod}</h4>
            {revenueInvoicesQuery.data.revenueByPaymentMethod.length === 0 ? <p>{reportText.reportNoData}</p> : (
              <table className="analytics-business-report__table analytics-business-report__table--compact">
                <thead><tr><th>{reportText.nameLabel}</th><th>{reportText.amountLabel}</th><th>{reportText.countLabel}</th></tr></thead>
                <tbody>{revenueInvoicesQuery.data.revenueByPaymentMethod.map((item) => <tr key={item.label}><td>{item.label}</td><td>{reportRevenue(item.amount)}</td><td>{reportNumber(item.count)}</td></tr>)}</tbody>
              </table>
            )}
          </div>
          <div className="analytics-business-report__table-card">
            <h4>{reportText.revenueByConsultant}</h4>
            {revenueInvoicesQuery.data.revenueByConsultant.length === 0 ? <p>{reportText.reportNoData}</p> : (
              <table className="analytics-business-report__table analytics-business-report__table--compact">
                <thead><tr><th>{reportText.nameLabel}</th><th>{reportText.amountLabel}</th><th>{reportText.countLabel}</th></tr></thead>
                <tbody>{revenueInvoicesQuery.data.revenueByConsultant.map((item) => <tr key={item.label}><td>{item.label}</td><td>{reportRevenue(item.amount)}</td><td>{reportNumber(item.count)}</td></tr>)}</tbody>
              </table>
            )}
          </div>
          <div className="analytics-business-report__table-card">
            <h4>{reportText.revenueByService}</h4>
            {revenueInvoicesQuery.data.revenueByService.length === 0 ? <p>{reportText.reportNoData}</p> : (
              <table className="analytics-business-report__table analytics-business-report__table--compact">
                <thead><tr><th>{reportText.nameLabel}</th><th>{reportText.amountLabel}</th><th>{reportText.countLabel}</th></tr></thead>
                <tbody>{revenueInvoicesQuery.data.revenueByService.map((item) => <tr key={item.label}><td>{item.label}</td><td>{reportRevenue(item.amount)}</td><td>{reportNumber(item.count)}</td></tr>)}</tbody>
              </table>
            )}
          </div>
        </div>
      </section>

      {revenueOutputMode === 'detailed' && (
        <section className="analytics-business-report__section">
          <div className="analytics-business-report__section-heading">
            <h3>{reportText.invoiceList}</h3>
          </div>
          <div className="analytics-business-report__table-wrap">
            <table className="analytics-business-report__table">
              <thead>
                <tr>
                  <th>{reportText.invoiceNumber}</th>
                  <th>{reportText.clientLabel}</th>
                  <th>{reportText.dateLabel}</th>
                  <th>{reportText.statusLabel}</th>
                  <th>{reportText.typeLabel}</th>
                  <th>{reportText.grossLabel}</th>
                </tr>
              </thead>
              <tbody>
                {revenueInvoicesQuery.data.invoices.map((invoice) => (
                  <tr key={`${invoice.invoiceNumber}-${invoice.date}`}>
                    <td>{invoice.invoiceNumber || '—'}</td>
                    <td>{invoice.client || '—'}</td>
                    <td>{invoice.date || '—'}</td>
                    <td>{invoiceStatusLabel(invoice.status)}</td>
                    <td>{invoiceTypeLabel(invoice.type)}</td>
                    <td>{reportRevenue(invoice.grossTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </Card>
  ) : null

  const bookingsAttendanceReportPreview = bookingsAttendanceQuery.data ? (
    <Card className="analytics-business-report analytics-business-report-print-area">
      <div className="analytics-business-report__header">
        <div>
          <span className="analytics-business-report__eyebrow">{reportText.reportTemplateBadge}</span>
          <h2>{reportText.bookingsReportTemplateTitle}</h2>
          <p>{reportText.bookingsReportTemplateSubtitle}</p>
        </div>
        <div className="analytics-business-report__meta-card">
          <span>{reportText.reportPeriod}</span>
          <strong>{formatReportRange(bookingsAttendanceQuery.data.rangeStart, bookingsAttendanceQuery.data.rangeEnd)}</strong>
          <span>{reportText.reportGenerated}: {reportGeneratedLabel}</span>
        </div>
      </div>

      <div className="analytics-business-report__parameter-grid">
        <div><span>{reportText.selectedConsultant}</span><strong>{selectedConsultantName}</strong></div>
        <div><span>{reportText.selectedSpace}</span><strong>{selectedSpaceName}</strong></div>
        <div><span>{reportText.selectedType}</span><strong>{selectedTypeName}</strong></div>
        <div><span>{reportText.deliveryMode}</span><strong>{bookingDeliveryMode === 'ONLINE' ? reportText.deliveryOnline : bookingDeliveryMode === 'ONSITE' ? reportText.deliveryOnsite : reportText.deliveryAll}</strong></div>
      </div>

      <section className="analytics-business-report__section">
        <div className="analytics-business-report__section-heading">
          <h3>{reportText.reportSummary}</h3>
          <p>{reportText.bookingStatus}: {bookingStatusFilter} · {reportText.sourceChannel}: {bookingSourceFilter}</p>
        </div>
        <div className="analytics-business-report__metric-grid">
          {bookingMetricRows.map((metric) => (
            <div key={metric.label} className="analytics-business-report__metric">
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="analytics-business-report__section analytics-business-report__section--rankings">
        <div className="analytics-business-report__tables-grid">
          <div className="analytics-business-report__table-card">
            <h4>{reportText.sourceBreakdown}</h4>
            {bookingsAttendanceQuery.data.sourceBreakdown.length === 0 ? <p>{reportText.reportNoData}</p> : (
              <table className="analytics-business-report__table analytics-business-report__table--compact">
                <thead><tr><th>{reportText.nameLabel}</th><th>{reportText.countLabel}</th><th>{reportText.bookedTimeLabel}</th></tr></thead>
                <tbody>{bookingsAttendanceQuery.data.sourceBreakdown.map((item) => <tr key={item.label}><td>{sourceLabel(item.label)}</td><td>{reportNumber(item.count)}</td><td>{minutesFormatter(item.minutes)}</td></tr>)}</tbody>
              </table>
            )}
          </div>
          <div className="analytics-business-report__table-card">
            <h4>{reportText.busiestDaysTimes}</h4>
            {bookingsAttendanceQuery.data.busiestDaysTimes.length === 0 ? <p>{reportText.reportNoData}</p> : (
              <table className="analytics-business-report__table analytics-business-report__table--compact">
                <thead><tr><th>{reportText.nameLabel}</th><th>{reportText.countLabel}</th><th>{reportText.bookedTimeLabel}</th></tr></thead>
                <tbody>{bookingsAttendanceQuery.data.busiestDaysTimes.map((item) => <tr key={item.label}><td>{item.label}</td><td>{reportNumber(item.count)}</td><td>{minutesFormatter(item.minutes)}</td></tr>)}</tbody>
              </table>
            )}
          </div>
          <div className="analytics-business-report__table-card">
            <h4>{reportText.consultantHoursTitle}</h4>
            {bookingsAttendanceQuery.data.consultantHours.length === 0 ? <p>{reportText.reportNoData}</p> : (
              <table className="analytics-business-report__table analytics-business-report__table--compact">
                <thead><tr><th>{reportText.nameLabel}</th><th>{reportText.bookedTimeLabel}</th><th>{reportText.sessionsLabel}</th></tr></thead>
                <tbody>{bookingsAttendanceQuery.data.consultantHours.map((item) => <tr key={item.label}><td>{item.label}</td><td>{minutesFormatter(item.minutes)}</td><td>{reportNumber(item.sessionsTotal)}</td></tr>)}</tbody>
              </table>
            )}
          </div>
          <div className="analytics-business-report__table-card">
            <h4>{reportText.roomHoursTitle}</h4>
            {bookingsAttendanceQuery.data.roomHours.length === 0 ? <p>{reportText.reportNoData}</p> : (
              <table className="analytics-business-report__table analytics-business-report__table--compact">
                <thead><tr><th>{reportText.nameLabel}</th><th>{reportText.bookedTimeLabel}</th><th>{reportText.sessionsLabel}</th></tr></thead>
                <tbody>{bookingsAttendanceQuery.data.roomHours.map((item) => <tr key={item.label}><td>{item.label}</td><td>{minutesFormatter(item.minutes)}</td><td>{reportNumber(item.sessionsTotal)}</td></tr>)}</tbody>
              </table>
            )}
          </div>
        </div>
      </section>
    </Card>
  ) : null

  const activeReportPreview = activeReportTemplate === 'revenueInvoices'
    ? revenueInvoicesReportPreview
    : activeReportTemplate === 'bookingsAttendance'
      ? bookingsAttendanceReportPreview
      : businessReportPreview

  return (
    <div className="stack gap-lg analytics-page">
      <PageHeader title={text.title} subtitle={text.subtitle} />

      <div className="analytics-section-switch analytics-page-tabs" role="tablist" aria-label={text.title}>
        <button type="button" className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>
          {text.tabOverview}
        </button>
        <button type="button" className={activeTab === 'reports' ? 'active' : ''} onClick={() => setActiveTab('reports')}>
          {text.tabReports}
        </button>
      </div>

      <Card className="analytics-hero">
        <div className="analytics-hero__copy">
          <span className="analytics-hero__eyebrow">{text.filtersTitle}</span>
          <div className="analytics-hero__meta">
            <strong>{text.heroRangePrefix}</strong>
            <span>{rangeLabel || '—'}</span>
          </div>
        </div>
        <div className="analytics-hero__actions">
          {activeTab === 'overview' ? (
            <>
              <button type="button" className="secondary" onClick={exportCsv} disabled={!summary}>{text.export}</button>
              <button type="button" onClick={sendManualReport} disabled={!summary || !canFetch || sendingReport}>
                {sendingReport ? `${text.sendNow}…` : text.sendNow}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="secondary" onClick={() => setReportPreviewOpen((open) => !open)} disabled={!summary}>
                {reportPreviewOpen ? reportText.hidePreview : reportText.openPreview}
              </button>
              <button type="button" className="secondary" onClick={downloadActiveReportCsv} disabled={!summary || reportIsLoading}>{reportText.downloadReportCsv}</button>
              <button type="button" onClick={printActiveReport} disabled={!summary || reportIsLoading}>{reportText.printSavePdf}</button>
            </>
          )}
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
            {isAdmin && (
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
      ) : !data || !summary ? (
        <Card><EmptyState title={text.emptyTitle} text={text.emptyText} /></Card>
      ) : activeTab === 'overview' ? (
        <>
          <div className="analytics-kpis analytics-kpis--modern">
            <Card className="analytics-kpi-card analytics-kpi-card--modern"><span>{text.kpiSessions}</span><strong>{summary.sessionsTotal}</strong></Card>
            <Card className="analytics-kpi-card analytics-kpi-card--modern"><span>{text.kpiRevenue}</span><strong>{revenueFormatter(summary.revenueGross)}</strong></Card>
            <Card className="analytics-kpi-card analytics-kpi-card--modern"><span>{text.kpiNewClients}</span><strong>{summary.newClients}</strong></Card>
            <Card className="analytics-kpi-card analytics-kpi-card--modern"><span>{text.kpiActiveClients}</span><strong>{summary.clientsTotal}</strong></Card>
            <Card className="analytics-kpi-card analytics-kpi-card--modern"><span>{text.kpiOnlineShare}</span><strong>{percentFormatter(onlineShare)}</strong></Card>
            <Card className="analytics-kpi-card analytics-kpi-card--modern"><span>{text.kpiAvgRevenue}</span><strong>{revenueFormatter(avgRevenuePerSession)}</strong></Card>
          </div>

          <div className="analytics-grid analytics-grid--modern" data-onboarding-panel="analytics">
            <Card className="analytics-chart-card analytics-chart-card--modern">
              <div className="analytics-card-heading">
                <h3>{text.sessionsTrendTitle}</h3>
                <p>{text.sessionsTrendSubtitle}</p>
              </div>
              <div className="analytics-chart-wrap analytics-chart-wrap--modern">
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  minWidth={0}
                  minHeight={220}
                  debounce={ANALYTICS_CHART_RESIZE_DEBOUNCE_MS}
                >
                  <BarChart data={activitySeries}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={18} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar {...ANALYTICS_CHART_STATIC} dataKey="sessionsTotal" name={text.sessionsLabel} fill="#60a5fa" radius={[8, 8, 0, 0]} />
                    {isComparison ? (
                      <>
                        <Line {...ANALYTICS_CHART_STATIC} type="monotone" dataKey="clientsTotal" name={text.activeClientsLabel} stroke="#22c55e" strokeWidth={2.5} dot={false} />
                        <Line {...ANALYTICS_CHART_STATIC} type="monotone" dataKey="newClients" name={text.newClientsLabel} stroke="#f59e0b" strokeWidth={2.5} dot={false} />
                      </>
                    ) : (
                      <Line {...ANALYTICS_CHART_STATIC} type="monotone" dataKey="consultantHours" name={text.consultantHoursLabel} stroke="#22c55e" strokeWidth={2.5} dot={false} />
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
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  minWidth={0}
                  minHeight={220}
                  debounce={ANALYTICS_CHART_RESIZE_DEBOUNCE_MS}
                >
                  <LineChart data={revenueSeries}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={18} />
                    <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                    <Tooltip formatter={(v) => revenueFormatter(v as number)} />
                    <Legend />
                    <Line {...ANALYTICS_CHART_STATIC} type="monotone" dataKey="revenueGross" name={text.grossLabel} stroke="#3b82f6" strokeWidth={2.8} dot={false} />
                    {isComparison ? (
                      <Line {...ANALYTICS_CHART_STATIC} type="monotone" dataKey="revenueNet" name="Net" stroke="#f97316" strokeWidth={2.4} dot={false} />
                    ) : (
                      <Line {...ANALYTICS_CHART_STATIC} type="monotone" dataKey="consultantHours" name={text.consultantHoursLabel} stroke="#22c55e" strokeWidth={2.2} dot={false} />
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
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  minWidth={0}
                  minHeight={220}
                  debounce={ANALYTICS_CHART_RESIZE_DEBOUNCE_MS}
                >
                  <BarChart data={weekdaySeries}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip formatter={(v) => `${v} h`} />
                    <Legend />
                    <Bar {...ANALYTICS_CHART_STATIC} dataKey="consultantHours" name={text.consultantHoursLabel} fill="#60a5fa" radius={[8, 8, 0, 0]} />
                    <Bar {...ANALYTICS_CHART_STATIC} dataKey="spaceHours" name={text.spaceHoursLabel} fill="#22c55e" radius={[8, 8, 0, 0]} />
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
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                  minWidth={0}
                  minHeight={220}
                  debounce={ANALYTICS_CHART_RESIZE_DEBOUNCE_MS}
                >
                  <BarChart data={weeklyOpsSeries}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={18} />
                    <YAxis allowDecimals={false} />
                    <Tooltip formatter={(value, name) => name === text.revenueLabel ? revenueFormatter(value as number) : value} />
                    <Legend />
                    <Bar {...ANALYTICS_CHART_STATIC} dataKey="sessionsTotal" name={text.sessionsLabel} fill="#60a5fa" radius={[8, 8, 0, 0]} />
                    <Line {...ANALYTICS_CHART_STATIC} type="monotone" dataKey="consultantHours" name={text.consultantHoursLabel} stroke="#22c55e" strokeWidth={2.2} dot={false} />
                    <Line {...ANALYTICS_CHART_STATIC} type="monotone" dataKey="spaceHours" name={text.spaceHoursLabel} stroke="#f59e0b" strokeWidth={2.2} dot={false} />
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
      ) : (
        <div className="analytics-reports-tab">
          <Card className="analytics-report-template-card">
            <div className="analytics-report-template-card__content">
              <span className="analytics-business-report__eyebrow">{reportText.reportTemplateBadge}</span>
              <h3>{activeReportTitle}</h3>
              <p>{activeReportSubtitle}</p>
              {!billingReportsEnabled && <p className="muted">{reportText.billingDisabledReport}</p>}
            </div>
            <div className="analytics-report-template-card__actions">
              <button type="button" className="secondary" onClick={() => setReportPreviewOpen((open) => !open)} disabled={reportIsLoading}>
                {reportPreviewOpen ? reportText.hidePreview : reportText.openPreview}
              </button>
              <button type="button" className="secondary" onClick={downloadActiveReportCsv} disabled={reportIsLoading}>{reportText.downloadReportCsv}</button>
              <button type="button" onClick={printActiveReport} disabled={reportIsLoading}>{reportText.printSavePdf}</button>
            </div>
          </Card>

          <Card className="analytics-report-parameters-card">
            <div className="analytics-card-heading">
              <h3>{reportText.reportParametersTitle}</h3>
              <p>{reportText.reportParametersSubtitle}</p>
            </div>
            <div className="analytics-report-parameter-grid">
              <label className="field">
                <span className="field-label">{reportText.reportSelectedTemplate}</span>
                <select value={activeReportTemplate} onChange={(event) => { setActiveReportTemplate(event.target.value as ReportTemplate); setReportPreviewOpen(false) }}>
                  <option value="business">{reportText.reportTemplateTitle}</option>
                  {billingReportsEnabled && <option value="revenueInvoices">{reportText.revenueReportTemplateTitle}</option>}
                  <option value="bookingsAttendance">{reportText.bookingsReportTemplateTitle}</option>
                </select>
              </label>
              <label className="field">
                <span className="field-label">{reportText.reportLanguage}</span>
                <select value={reportLanguage} onChange={(event) => setReportLanguage(event.target.value as ReportLanguage)}>
                  <option value="en">{reportText.reportLanguageEnglish}</option>
                  <option value="sl">{reportText.reportLanguageSlovenian}</option>
                  <option value="sr">{reportText.reportLanguageSerbian}</option>
                </select>
              </label>
              {activeReportTemplate === 'business' && (
                <label className="analytics-report-toggle analytics-report-toggle--card">
                  <input type="checkbox" checked={reportComparePrevious} onChange={(event) => setReportComparePrevious(event.target.checked)} />
                  <span>{reportText.reportComparePrevious}</span>
                </label>
              )}
              {activeReportTemplate === 'revenueInvoices' && (
                <>
                  <label className="field">
                    <span className="field-label">{reportText.paymentStatus}</span>
                    <select value={revenuePaymentStatus} onChange={(event) => setRevenuePaymentStatus(event.target.value as RevenuePaymentStatusFilter)}>
                      <option value="all">{reportText.paymentStatusAll}</option>
                      <option value="paid">{reportText.paymentStatusPaid}</option>
                      <option value="open">{reportText.paymentStatusOpen}</option>
                      <option value="refunded">{reportText.paymentStatusRefunded}</option>
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">{reportText.paymentMethod}</span>
                    <select value={revenuePaymentMethodId} onChange={(event) => setRevenuePaymentMethodId(event.target.value)}>
                      <option value="">{reportText.allPaymentMethods}</option>
                      {(paymentMethodsQuery.data ?? []).map((method) => <option key={method.id} value={method.id}>{method.name}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">{reportText.clientCompany}</span>
                    <input value={revenueClientQuery} onChange={(event) => setRevenueClientQuery(event.target.value)} placeholder={reportText.clientCompanyPlaceholder} />
                  </label>
                  <label className="field">
                    <span className="field-label">{reportText.invoiceType}</span>
                    <select value={revenueBillType} onChange={(event) => setRevenueBillType(event.target.value as RevenueBillTypeFilter)}>
                      <option value="ALL">{reportText.invoiceTypeAll}</option>
                      <option value="INVOICE">{reportText.invoiceTypeInvoice}</option>
                      <option value="ADVANCE">{reportText.invoiceTypeAdvance}</option>
                      <option value="REFUND">{reportText.invoiceTypeRefund}</option>
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">{reportText.outputMode}</span>
                    <select value={revenueOutputMode} onChange={(event) => setRevenueOutputMode(event.target.value as RevenueOutputMode)}>
                      <option value="summary">{reportText.outputSummary}</option>
                      <option value="detailed">{reportText.outputDetailed}</option>
                    </select>
                  </label>
                </>
              )}
              {activeReportTemplate === 'bookingsAttendance' && (
                <>
                  <label className="field">
                    <span className="field-label">{reportText.bookingStatus}</span>
                    <select value={bookingStatusFilter} onChange={(event) => setBookingStatusFilter(event.target.value as BookingStatusFilter)}>
                      <option value="ALL">{reportText.bookingStatusAll}</option>
                      <option value="RESERVED">{reportText.bookingStatusReserved}</option>
                      <option value="CHECKED_OUT">{reportText.bookingStatusCompleted}</option>
                      <option value="CANCELLED">{reportText.bookingStatusCancelled}</option>
                      <option value="NO_SHOW">{reportText.bookingStatusNoShow}</option>
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">{reportText.sourceChannel}</span>
                    <select value={bookingSourceFilter} onChange={(event) => setBookingSourceFilter(event.target.value as BookingSourceFilter)}>
                      <option value="ALL">{reportText.sourceAll}</option>
                      <option value="STAFF">{reportText.sourceStaff}</option>
                      <option value="WEBSITE_WIDGET">{reportText.sourceWebsiteWidget}</option>
                      <option value="GUEST_APP">{reportText.sourceGuestApp}</option>
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">{reportText.deliveryMode}</span>
                    <select value={bookingDeliveryMode} onChange={(event) => setBookingDeliveryMode(event.target.value as DeliveryModeFilter)}>
                      <option value="ALL">{reportText.deliveryAll}</option>
                      <option value="ONLINE">{reportText.deliveryOnline}</option>
                      <option value="ONSITE">{reportText.deliveryOnsite}</option>
                    </select>
                  </label>
                </>
              )}
              <div className="analytics-report-parameter-summary">
                <span>{reportText.reportPeriod}</span>
                <strong>{reportRangeLabel}</strong>
              </div>
              <div className="analytics-report-parameter-summary">
                <span>{reportText.selectedConsultant}</span>
                <strong>{selectedConsultantName}</strong>
              </div>
              <div className="analytics-report-parameter-summary">
                <span>{reportText.selectedSpace}</span>
                <strong>{selectedSpaceName}</strong>
              </div>
              <div className="analytics-report-parameter-summary">
                <span>{reportText.selectedType}</span>
                <strong>{selectedTypeName}</strong>
              </div>
            </div>
            <p className="muted analytics-report-print-hint">{reportText.reportPreviewHint}</p>
          </Card>

          {reportPreviewOpen ? (
            reportIsLoading ? (
              <Card><div className="muted">{text.loading}</div></Card>
            ) : activeReportPreview ? (
              activeReportPreview
            ) : (
              <Card><EmptyState title={activeReportTitle} text={reportText.reportNoData} /></Card>
            )
          ) : (
            <Card className="analytics-report-preview-placeholder">
              <EmptyState title={activeReportTitle} text={activeReportSubtitle} />
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
