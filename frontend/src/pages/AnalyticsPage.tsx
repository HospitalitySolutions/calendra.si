import { useMemo, useState } from 'react'
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
import { Card, EmptyState } from '../components/ui'
import { fullName } from '../lib/format'

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

type AnalyticsOverview = {
  period: 'day' | '7d' | 'month' | 'year' | 'custom'
  rangeStart: string
  rangeEnd: string
  summary: AnalyticsSummary
  months: PeriodPoint[]
  years: PeriodPoint[]
}

type ConsultantOption = { id: number; firstName: string; lastName: string; consultant?: boolean }
type SpaceOption = { id: number; name: string }
type TypeOption = { id: number; name: string }
type Preset = 'day' | '7d' | 'month' | 'year' | 'custom'

export function AnalyticsPage() {
  const me = getStoredUser()!
  const [periodPreset, setPeriodPreset] = useState<Preset>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [consultantId, setConsultantId] = useState('')
  const [spaceId, setSpaceId] = useState('')
  const [typeId, setTypeId] = useState('')

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

  const monthlySeries = data?.months ?? []
  const yearlySeries = data?.years ?? []
  const summary = data?.summary ?? null
  const compareSeries = useMemo(
    () => (periodPreset === 'month' ? monthlySeries : yearlySeries),
    [periodPreset, monthlySeries, yearlySeries]
  )
  const isComparison = periodPreset === 'month' || periodPreset === 'year'

  const revenueFormatter = (v: number | string) => {
    const n = typeof v === 'number' ? v : Number(v)
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(Number.isFinite(n) ? n : 0)
  }

  return (
    <div className="stack gap-lg">
          <div className="analytics-filters-row">
            <div className="analytics-filter-group">
              <button type="button" className={periodPreset === 'day' ? 'active' : ''} onClick={() => setPeriodPreset('day')}>1D</button>
              <button type="button" className={periodPreset === '7d' ? 'active' : ''} onClick={() => setPeriodPreset('7d')}>7D</button>
              <button type="button" className={periodPreset === 'month' ? 'active' : ''} onClick={() => setPeriodPreset('month')}>1M</button>
              <button type="button" className={periodPreset === 'year' ? 'active' : ''} onClick={() => setPeriodPreset('year')}>1L</button>
              <button type="button" className={periodPreset === 'custom' ? 'active' : ''} onClick={() => setPeriodPreset('custom')}>Custom</button>
            </div>
            <div className="analytics-select-filters">
              {me.role === 'ADMIN' && (
                <select value={consultantId} onChange={(e) => setConsultantId(e.target.value)}>
                  <option value="">All consultants</option>
                  {(filterData?.consultants ?? []).map((u) => <option key={u.id} value={u.id}>{fullName(u)}</option>)}
                </select>
              )}
              <select value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
                <option value="">All spaces</option>
                {(filterData?.spaces ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                <option value="">All types</option>
                {(filterData?.types ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>

          {periodPreset === 'custom' && (
            <div className="analytics-custom-range">
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
          )}

          {data && (
            <div className="muted analytics-range-label">Range: {data.rangeStart} to {data.rangeEnd}</div>
          )}

          {!canFetch ? (
            <Card><div className="muted">Choose both start and end dates for custom range.</div></Card>
          ) : isLoading ? (
            <Card><div className="muted">Loading analytics...</div></Card>
          ) : isError ? (
            <Card><div className="error">Failed to load analytics.</div></Card>
          ) : (
            <>
              {summary ? (
                <div className="analytics-kpis">
                  <Card className="analytics-kpi-card"><span>Sessions total</span><strong>{summary.sessionsTotal}</strong></Card>
                  <Card className="analytics-kpi-card"><span>Clients total</span><strong>{summary.clientsTotal}</strong></Card>
                  <Card className="analytics-kpi-card"><span>Standard sessions</span><strong>{summary.sessionsStandard}</strong></Card>
                  <Card className="analytics-kpi-card"><span>Online sessions</span><strong>{summary.sessionsOnline}</strong></Card>
                  <Card className="analytics-kpi-card"><span>New clients</span><strong>{summary.newClients}</strong></Card>
                  <Card className="analytics-kpi-card"><span>Revenue net</span><strong>{revenueFormatter(summary.revenueNet)}</strong></Card>
                  <Card className="analytics-kpi-card"><span>Revenue gross</span><strong>{revenueFormatter(summary.revenueGross)}</strong></Card>
                </div>
              ) : (
                <Card><EmptyState title="No analytics data yet" text="Create bookings, clients and issued bills to populate charts." /></Card>
              )}

              {isComparison ? (
                <div className="analytics-grid">
                  <Card className="analytics-chart-card">
                    <h3>{periodPreset === 'month' ? 'Month-by-month sessions and clients' : 'Year-by-year sessions and clients'}</h3>
                    <div className="analytics-chart-wrap">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={compareSeries}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={20} />
                          <YAxis allowDecimals={false} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="sessionsStandard" name="Standard" fill="#60a5fa" />
                          <Bar dataKey="sessionsOnline" name="Online" fill="#22c55e" />
                          <Line type="monotone" dataKey="sessionsTotal" name="Sessions total" stroke="#f59e0b" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="clientsTotal" name="Clients total" stroke="#06b6d4" strokeWidth={2} dot={false} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>

                  <Card className="analytics-chart-card">
                    <h3>Revenue comparison (issued bills)</h3>
                    <div className="analytics-chart-wrap">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={compareSeries}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={20} />
                          <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                          <Tooltip formatter={(v) => revenueFormatter(v as number)} />
                          <Legend />
                          <Line type="monotone" dataKey="revenueNet" name="Net" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
                          <Line type="monotone" dataKey="revenueGross" name="Gross" stroke="#f97316" strokeWidth={2.5} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                </div>
              ) : (
                <div className="analytics-grid">
                  <Card className="analytics-chart-card">
                    <h3>Sessions split for selected period</h3>
                    <div className="analytics-chart-wrap analytics-chart-wrap--small">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={[
                          { label: 'Standard', value: summary?.sessionsStandard ?? 0 },
                          { label: 'Online', value: summary?.sessionsOnline ?? 0 },
                        ]}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="label" />
                          <YAxis allowDecimals={false} />
                          <Tooltip />
                          <Bar dataKey="value" name="Sessions" fill="#60a5fa" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                  <Card className="analytics-chart-card">
                    <h3>Revenue (issued bills) for selected period</h3>
                    <div className="analytics-chart-wrap analytics-chart-wrap--small">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={[
                          { label: 'Net', value: Number(summary?.revenueNet ?? 0) },
                          { label: 'Gross', value: Number(summary?.revenueGross ?? 0) },
                        ]}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="label" />
                          <YAxis />
                          <Tooltip formatter={(v) => revenueFormatter(v as number)} />
                          <Bar dataKey="value" name="Revenue" fill="#f97316" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                </div>
              )}
            </>
          )}
    </div>
  )
}