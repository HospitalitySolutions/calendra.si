import { useEffect, useState, type ReactNode } from 'react'
import { api } from '../api'
import { PageHeader } from './ui'

export type TenancyDetails = {
  id: number
  companyName: string
  contactName: string
  contactEmail: string
  contactPhone: string
  createdAt: string
  subscriptionStart: string
  subscriptionEnd: string
  usersCreated: number
  usersPaidTotal: number | null
  spacesCreated: number
  spacesTotal: number | null
  smsSent: number
  smsQuota: number | null
  packageType: string
  subscriptionInterval: string
  dueAmount: string
  tenantCode?: string
  ownerPasswordSetupPending?: boolean
  signupCompletionSummary?: string
  vatId?: string
  stripeCustomerIdPreview?: string
}

type Props = {
  tenancyId: number | null
  onClose: () => void
}

function formatInstant(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function formatDateYmd(ymd: string): string {
  if (!ymd) return '—'
  const d = new Date(ymd + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return ymd
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' })
}

function formatInterval(code: string): string {
  const u = (code || '').toUpperCase()
  if (u === 'YEARLY') return 'Yearly'
  if (u === 'MONTHLY') return 'Monthly'
  return code || '—'
}

function ratioString(created: number, total: number | null): string {
  if (total == null) return `${created} / —`
  return `${created} / ${total}`
}

export function TenancyDetailSidePanel({ tenancyId, onClose }: Props) {
  const [detail, setDetail] = useState<TenancyDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (tenancyId == null) {
      setDetail(null)
      setError('')
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    setDetail(null)
    api
      .get<TenancyDetails>(`/platform-admin/tenancies/${tenancyId}`)
      .then((res) => {
        if (!cancelled) setDetail(res.data)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load tenancy details.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tenancyId])

  useEffect(() => {
    if (tenancyId == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tenancyId, onClose])

  if (tenancyId == null) return null

  const dueNum = detail ? Number.parseFloat(detail.dueAmount.replace(',', '.')) : NaN
  const dueDisplay = detail && Number.isFinite(dueNum)
    ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(dueNum)
    : detail?.dueAmount ?? '—'

  const row = (label: string, value: ReactNode) => (
    <div className="tenancy-detail-row">
      <dt className="tenancy-detail-label">{label}</dt>
      <dd className="tenancy-detail-value">{value}</dd>
    </div>
  )

  return (
    <div className="modal-backdrop booking-side-panel-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal large-modal booking-side-panel tenancy-detail-side-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Tenancy details"
        aria-modal="true"
      >
        <div className="booking-side-panel-header">
          <PageHeader
            title={loading ? 'Tenancy details' : detail?.companyName || 'Tenancy details'}
            actions={
              <button type="button" className="secondary booking-side-panel-close" onClick={onClose} aria-label="Close">
                ×
              </button>
            }
          />
        </div>
        <div className="booking-side-panel-body tenancy-detail-body">
          {loading && <p className="muted">Loading…</p>}
          {error && <p className="muted" style={{ color: 'var(--color-danger, #dc2626)' }}>{error}</p>}
          {!loading && !error && detail && (
            <dl className="tenancy-detail-dl">
              {row('Company name', detail.companyName || '—')}
              {row('Contact name', detail.contactName || '—')}
              {row('Contact email', detail.contactEmail || '—')}
              {row('Contact phone', detail.contactPhone || '—')}
              {row('Created on', formatInstant(detail.createdAt))}
              {row('Subscription start', formatDateYmd(detail.subscriptionStart))}
              {row('Subscription end', formatDateYmd(detail.subscriptionEnd))}
              {row('Users', ratioString(detail.usersCreated, detail.usersPaidTotal))}
              {row('Spaces', ratioString(detail.spacesCreated, detail.spacesTotal))}
              {row('SMS sent', ratioString(detail.smsSent, detail.smsQuota))}
              {row('Package type', detail.packageType || '—')}
              {row('Subscription type', formatInterval(detail.subscriptionInterval))}
              {row(
                'Due amount',
                <span style={{ color: 'var(--color-danger, #dc2626)', fontWeight: 600 }}>{dueDisplay}</span>,
              )}
            </dl>
          )}
        </div>
      </div>
    </div>
  )
}
