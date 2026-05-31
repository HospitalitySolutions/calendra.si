import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { Card, Field, SectionTitle } from '../components/ui'
import { useToast } from '../components/Toast'
import { useLocale } from '../locale'
import type { User } from '../lib/types'
import googleCalendarLogo from '../assets/google-calendar-logo.png'

type SyncDirection = 'TWO_WAY' | 'CALENDRA_TO_GOOGLE' | 'GOOGLE_TO_CALENDRA'
type ConnectionStatus = 'ACTIVE' | 'NEEDS_RECONNECT' | 'ERROR' | 'DISABLED'
type BookingDeletePolicy = 'MARK_CONFLICT' | 'CANCEL_BOOKING' | 'RECREATE_GOOGLE_EVENT'
type CalendarEntityType = 'SESSION_BOOKING' | 'PERSONAL_SESSION' | 'TODO' | 'GOOGLE_BUSY_BLOCK'
type CalendarEventOrigin = 'CALENDRA' | 'GOOGLE'

type GoogleCalendarConnection = {
  id: number
  companyId: number | null
  userId: number | null
  googleAccountEmail?: string | null
  calendarId?: string | null
  calendarSummary?: string | null
  syncDirection: SyncDirection
  allowGoogleToModifyBookings: boolean
  bookingDeletePolicy?: BookingDeletePolicy | null
  importGoogleEventsAs: string
  status: ConnectionStatus
  lastError?: string | null
  lastFullSyncAt?: string | null
  lastIncrementalSyncAt?: string | null
  channelExpiresAt?: string | null
}

type GoogleCalendarSummary = {
  id: string
  summary: string
  primary: boolean
  accessRole?: string | null
}

type GoogleCalendarEventLink = {
  id: number
  connectionId: number
  companyId: number
  calendarId: string
  googleEventId: string
  appEntityType: CalendarEntityType
  appEntityId: number
  origin: CalendarEventOrigin
  syncStatus: string
  lastError?: string | null
  googleUpdatedAt?: string | null
  lastSyncedAt?: string | null
  deletedAt?: string | null
}

type GoogleCalendarSettingsDraft = {
  calendarId: string
  calendarSummary: string
  syncDirection: SyncDirection
  allowGoogleToModifyBookings: boolean
  bookingDeletePolicy: BookingDeletePolicy
  importGoogleEventsAs: string
  enabled: boolean
}

const syncDirectionLabels: Record<SyncDirection, string> = {
  TWO_WAY: 'Two-way',
  CALENDRA_TO_GOOGLE: 'Calendra → Google only',
  GOOGLE_TO_CALENDRA: 'Google → Calendra only',
}

const bookingDeletePolicyLabels: Record<BookingDeletePolicy, string> = {
  MARK_CONFLICT: 'Mark conflict and keep booking',
  CANCEL_BOOKING: 'Cancel Calendra booking',
  RECREATE_GOOGLE_EVENT: 'Recreate Google event',
}

const entityLabels: Record<CalendarEntityType, string> = {
  SESSION_BOOKING: 'Booking',
  PERSONAL_SESSION: 'Personal session',
  TODO: 'ToDo',
  GOOGLE_BUSY_BLOCK: 'Google busy block',
}

function formatDateTime(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function draftFromConnection(connection: GoogleCalendarConnection): GoogleCalendarSettingsDraft {
  return {
    calendarId: connection.calendarId || 'primary',
    calendarSummary: connection.calendarSummary || '',
    syncDirection: connection.syncDirection || 'TWO_WAY',
    allowGoogleToModifyBookings: Boolean(connection.allowGoogleToModifyBookings),
    bookingDeletePolicy: connection.bookingDeletePolicy || 'MARK_CONFLICT',
    importGoogleEventsAs: connection.importGoogleEventsAs || 'BOOKED_SESSION',
    enabled: connection.status !== 'DISABLED',
  }
}

function statusClass(status: ConnectionStatus) {
  if (status === 'ACTIVE') return 'google-calendar-status active'
  if (status === 'NEEDS_RECONNECT') return 'google-calendar-status warn'
  if (status === 'ERROR') return 'google-calendar-status danger'
  return 'google-calendar-status muted'
}

function statusLabel(status?: ConnectionStatus | null) {
  if (status === 'ACTIVE') return 'Connected'
  if (status === 'NEEDS_RECONNECT') return 'Needs reconnect'
  if (status === 'ERROR') return 'Attention needed'
  return 'Not connected'
}

export function GoogleCalendarIntegrationSection({ me }: { me: User }) {
  const { t } = useLocale()
  const { showToast } = useToast()
  const companyId = me.companyId
  const [connections, setConnections] = useState<GoogleCalendarConnection[]>([])
  const [conflicts, setConflicts] = useState<GoogleCalendarEventLink[]>([])
  const [linksByConnection, setLinksByConnection] = useState<Record<number, GoogleCalendarEventLink[]>>({})
  const [calendarsByConnection, setCalendarsByConnection] = useState<Record<number, GoogleCalendarSummary[]>>({})
  const [drafts, setDrafts] = useState<Record<number, GoogleCalendarSettingsDraft>>({})
  const [loading, setLoading] = useState(true)
  const [busyConnectionId, setBusyConnectionId] = useState<number | null>(null)
  const [connecting, setConnecting] = useState(false)

  const activeConnection = useMemo(
    () => (
      connections.find((entry) => entry.userId === me.id && entry.status === 'ACTIVE')
      || connections.find((entry) => entry.userId === me.id)
      || connections.find((entry) => entry.status === 'ACTIVE')
      || connections[0]
      || null
    ),
    [connections, me.id],
  )

  const hasActiveConnection = useMemo(
    () => connections.some((entry) => entry.status === 'ACTIVE'),
    [connections],
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const params = companyId ? { companyId } : undefined
      const [{ data: statusData }, { data: conflictData }] = await Promise.all([
        api.get('/google/calendar/status', { params }),
        api.get('/google/calendar/conflicts', { params }).catch(() => ({ data: [] })),
      ])
      const nextConnections: GoogleCalendarConnection[] = (Array.isArray(statusData) ? statusData : [])
        .filter((connection) => connection.status !== 'DISABLED')
      setConnections(nextConnections)
      setConflicts(Array.isArray(conflictData) ? conflictData : [])
      setDrafts((prev) => {
        const next: Record<number, GoogleCalendarSettingsDraft> = {}
        for (const connection of nextConnections) next[connection.id] = prev[connection.id] || draftFromConnection(connection)
        return next
      })
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || 'Failed to load Google Calendar settings.')
    } finally {
      setLoading(false)
    }
  }, [companyId, showToast])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const connect = async () => {
    setConnecting(true)
    try {
      const returnUrl = `${window.location.origin}/configuration?tab=integrations&subtab=googleCalendar`
      const { data } = await api.get('/google/calendar/authorize', {
        params: {
          companyId,
          ownerUserId: me.id,
          returnUrl,
        },
      })
      if (data?.redirectUrl) window.location.href = data.redirectUrl
      else showToast('error', 'Google Calendar authorization URL was not returned.')
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || 'Failed to start Google Calendar connection.')
    } finally {
      setConnecting(false)
    }
  }

  const loadCalendars = async (connectionId: number) => {
    setBusyConnectionId(connectionId)
    try {
      const { data } = await api.get(`/google/calendar/connections/${connectionId}/calendars`)
      setCalendarsByConnection((prev) => ({ ...prev, [connectionId]: Array.isArray(data) ? data : [] }))
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || 'Failed to load Google calendars.')
    } finally {
      setBusyConnectionId(null)
    }
  }

  const loadLinks = async (connectionId: number) => {
    setBusyConnectionId(connectionId)
    try {
      const { data } = await api.get(`/google/calendar/connections/${connectionId}/links`)
      setLinksByConnection((prev) => ({ ...prev, [connectionId]: Array.isArray(data) ? data : [] }))
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || 'Failed to load Google Calendar mappings.')
    } finally {
      setBusyConnectionId(null)
    }
  }

  const saveConnection = async (connection: GoogleCalendarConnection) => {
    const draft = drafts[connection.id] || draftFromConnection(connection)
    setBusyConnectionId(connection.id)
    try {
      const selected = calendarsByConnection[connection.id]?.find((entry) => entry.id === draft.calendarId)
      const { data } = await api.put(`/google/calendar/connections/${connection.id}`, {
        ...draft,
        calendarSummary: selected?.summary || draft.calendarSummary,
      })
      setConnections((prev) => prev.map((entry) => entry.id === connection.id ? data : entry))
      setDrafts((prev) => ({ ...prev, [connection.id]: draftFromConnection(data) }))
      showToast('success', 'Google Calendar settings saved. Full sync was queued.')
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || 'Failed to save Google Calendar settings.')
    } finally {
      setBusyConnectionId(null)
    }
  }

  const fullSync = async (connectionId: number) => {
    setBusyConnectionId(connectionId)
    try {
      await api.post(`/google/calendar/connections/${connectionId}/full-sync`)
      showToast('success', 'Full Google Calendar sync queued.')
      await refresh()
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || 'Failed to queue full sync.')
    } finally {
      setBusyConnectionId(null)
    }
  }

  const disconnect = async (connectionId: number) => {
    if (!window.confirm('Disconnect this Google Calendar connection? Existing Google events are not deleted.')) return
    setBusyConnectionId(connectionId)
    try {
      await api.post(`/google/calendar/connections/${connectionId}/disconnect`)
      setConnections((prev) => prev.filter((entry) => entry.id !== connectionId))
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[connectionId]
        return next
      })
      setCalendarsByConnection((prev) => {
        const next = { ...prev }
        delete next[connectionId]
        return next
      })
      setLinksByConnection((prev) => {
        const next = { ...prev }
        delete next[connectionId]
        return next
      })
      showToast('success', 'Google Calendar disconnected.')
      await refresh()
    } catch (err: any) {
      showToast('error', err?.response?.data?.message || 'Failed to disconnect Google Calendar.')
    } finally {
      setBusyConnectionId(null)
    }
  }

  return (
    <Card className="settings-card google-calendar-card">
      <style>{`
        .google-calendar-card {
          --gcal-blue:#2563eb;
          --gcal-blue-soft:#edf4ff;
          --gcal-ink:#0f172a;
          --gcal-muted:#64748b;
          --gcal-border:#dbe5f4;
          --gcal-soft:#f8fbff;
          --gcal-success:#16a34a;
          --gcal-success-soft:#eaf8ef;
          --gcal-danger:#dc2626;
          --gcal-danger-soft:#fef2f2;
        }
        .google-calendar-shell { display:flex; flex-direction:column; gap:18px; }
        .google-calendar-surface {
          border:1px solid var(--gcal-border);
          border-radius:26px;
          background:linear-gradient(180deg,#ffffff 0%,#fbfdff 100%);
          box-shadow:0 18px 48px rgba(15,23,42,.06);
        }
        .google-calendar-hero {
          display:flex;
          justify-content:space-between;
          gap:22px;
          align-items:flex-start;
          padding:26px;
        }
        .google-calendar-hero-main { display:flex; gap:18px; align-items:flex-start; min-width:0; }
        .google-calendar-hero-logo {
          width:72px;
          height:72px;
          border-radius:22px;
          background:#fff;
          border:1px solid #e5edf8;
          display:inline-flex;
          align-items:center;
          justify-content:center;
          flex:0 0 auto;
          box-shadow:0 12px 28px rgba(15,23,42,.08);
        }
        .google-calendar-hero-logo img { width:52px; height:52px; object-fit:contain; display:block; }
        .google-calendar-hero-copy { min-width:0; }
        .google-calendar-hero-copy h3 {
          margin:0;
          color:var(--gcal-ink);
          font-size:clamp(28px,3vw,42px);
          line-height:1.04;
          letter-spacing:-.045em;
          font-weight:950;
        }
        .google-calendar-hero-copy p {
          margin:10px 0 0;
          color:var(--gcal-muted);
          max-width:760px;
          font-size:16px;
          line-height:1.55;
        }
        .google-calendar-chip {
          display:inline-flex;
          align-items:center;
          gap:10px;
          border-radius:999px;
          padding:10px 16px;
          margin-top:18px;
          font-size:15px;
          font-weight:900;
          border:1px solid transparent;
        }
        .google-calendar-chip::before { content:''; width:10px; height:10px; border-radius:999px; background:currentColor; }
        .google-calendar-chip.success { color:var(--gcal-success); background:var(--gcal-success-soft); border-color:#b7ebc6; }
        .google-calendar-chip.danger { color:var(--gcal-danger); background:var(--gcal-danger-soft); border-color:#fecaca; }
        .google-calendar-actions { display:flex; gap:12px; flex-wrap:wrap; align-items:center; }
        .google-calendar-actions--hero { flex-direction:column; align-items:stretch; min-width:220px; }
        .google-calendar-actions--connection { margin-top:18px; }
        .google-calendar-primary,
        .google-calendar-secondary,
        .google-calendar-danger {
          border-radius:16px;
          min-height:48px;
          padding:0 18px;
          font-weight:900;
          font-size:15px;
          cursor:pointer;
          transition:transform .16s ease, box-shadow .16s ease, border-color .16s ease, background .16s ease;
        }
        .google-calendar-primary {
          border:0;
          color:#fff;
          background:linear-gradient(135deg,#1d6fff 0%,#2563eb 100%);
          box-shadow:0 16px 34px rgba(37,99,235,.24);
        }
        .google-calendar-secondary {
          border:1px solid #cfddee;
          background:#fff;
          color:#1f3f75;
          box-shadow:0 10px 24px rgba(15,23,42,.05);
        }
        .google-calendar-danger {
          border:1px solid #f5b1b1;
          background:#fff;
          color:#dc2626;
        }
        .google-calendar-primary:hover,
        .google-calendar-secondary:hover,
        .google-calendar-danger:hover { transform:translateY(-1px); }
        .google-calendar-primary:disabled,
        .google-calendar-secondary:disabled,
        .google-calendar-danger:disabled {
          opacity:.6;
          cursor:default;
          transform:none;
          box-shadow:none;
        }
        .google-calendar-grid {
          display:grid;
          grid-template-columns:repeat(3,minmax(0,1fr));
          gap:14px;
        }
        .google-calendar-metric {
          border:1px solid var(--gcal-border);
          border-radius:20px;
          background:#fff;
          padding:18px 16px;
          min-width:0;
          box-shadow:0 12px 30px rgba(15,23,42,.04);
        }
        .google-calendar-metric span {
          display:block;
          color:#64748b;
          font-size:13px;
          line-height:1.35;
          font-weight:600;
        }
        .google-calendar-metric strong {
          display:block;
          margin-top:8px;
          color:var(--gcal-ink);
          font-size:17px;
          line-height:1.25;
          font-weight:900;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }
        .google-calendar-panel {
          border:1px solid var(--gcal-border);
          border-radius:24px;
          background:#fff;
          padding:22px;
          box-shadow:0 14px 34px rgba(15,23,42,.04);
        }
        .google-calendar-panel h4 {
          margin:0 0 12px;
          color:var(--gcal-ink);
          font-size:18px;
          line-height:1.2;
          font-weight:900;
          letter-spacing:-.02em;
        }
        .google-calendar-conflicts {
          border-color:#ffd9c0;
          background:linear-gradient(180deg,#fff7ed 0%,#ffffff 100%);
        }
        .google-calendar-link-row {
          display:grid;
          grid-template-columns:1fr 1fr 1fr;
          gap:12px;
          padding:12px 0;
          border-bottom:1px solid #edf2f7;
          font-size:13px;
          color:#334155;
        }
        .google-calendar-link-row:last-child { border-bottom:0; padding-bottom:0; }
        .google-calendar-connection {
          border:1px solid var(--gcal-border);
          border-radius:28px;
          background:#fff;
          padding:22px;
          box-shadow:0 16px 42px rgba(15,23,42,.05);
        }
        .google-calendar-connection-head {
          display:flex;
          justify-content:space-between;
          gap:14px;
          align-items:flex-start;
        }
        .google-calendar-connection-title {
          display:flex;
          flex-direction:column;
          gap:4px;
          min-width:0;
        }
        .google-calendar-connection-title strong {
          color:var(--gcal-ink);
          font-size:18px;
          line-height:1.2;
          font-weight:900;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }
        .google-calendar-connection-title span {
          color:#64748b;
          font-size:13px;
          line-height:1.45;
          overflow:hidden;
          text-overflow:ellipsis;
          white-space:nowrap;
        }
        .google-calendar-status {
          display:inline-flex;
          align-items:center;
          justify-content:center;
          padding:8px 12px;
          border-radius:999px;
          border:1px solid #d1d5db;
          font-size:12px;
          font-weight:900;
          letter-spacing:.04em;
          text-transform:uppercase;
          white-space:nowrap;
        }
        .google-calendar-status.active { color:#047857; background:#ecfdf5; border-color:#a7f3d0; }
        .google-calendar-status.warn { color:#b45309; background:#fffbeb; border-color:#fde68a; }
        .google-calendar-status.danger { color:#b91c1c; background:#fef2f2; border-color:#fecaca; }
        .google-calendar-status.muted { color:#475569; background:#f8fafc; border-color:#dbe4f0; }
        .google-calendar-error {
          margin-top:14px;
          padding:12px 14px;
          border-radius:16px;
          border:1px solid #fecaca;
          background:#fff1f2;
          color:#991b1b;
          font-size:14px;
          line-height:1.45;
        }
        .google-calendar-form {
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:16px;
          margin-top:18px;
        }
        .google-calendar-form .field { margin:0; }
        .google-calendar-form .field-label { color:#0f172a; font-weight:800; font-size:14px; }
        .google-calendar-form select,
        .google-calendar-form input {
          width:100%;
          min-height:52px;
          border:1px solid #d3deed;
          border-radius:16px;
          padding:0 16px;
          background:#fff;
          color:#0f172a;
          font-size:15px;
          box-shadow:0 8px 20px rgba(15,23,42,.03);
        }
        .google-calendar-checklist {
          display:flex;
          flex-direction:column;
          gap:12px;
          border:1px solid #e5edf7;
          border-radius:20px;
          padding:16px;
          background:#fbfdff;
        }
        .google-calendar-checkbox {
          display:flex;
          gap:10px;
          align-items:flex-start;
          color:#334155;
          font-size:14px;
          line-height:1.45;
        }
        .google-calendar-checkbox input { width:auto; margin-top:4px; }
        .google-calendar-empty {
          border:1px dashed #cfddee;
          border-radius:26px;
          background:linear-gradient(180deg,#fbfdff 0%,#ffffff 100%);
          padding:30px 24px;
          text-align:center;
        }
        .google-calendar-empty-logo {
          width:72px;
          height:72px;
          margin:0 auto 16px;
          border-radius:22px;
          display:inline-flex;
          align-items:center;
          justify-content:center;
          background:#fff;
          border:1px solid #e4edf8;
          box-shadow:0 14px 30px rgba(15,23,42,.06);
        }
        .google-calendar-empty-logo img { width:50px; height:50px; object-fit:contain; }
        .google-calendar-empty strong {
          display:block;
          color:var(--gcal-ink);
          font-size:28px;
          line-height:1.08;
          letter-spacing:-.03em;
          font-weight:950;
        }
        .google-calendar-empty p {
          margin:12px auto 0;
          max-width:640px;
          color:#64748b;
          font-size:16px;
          line-height:1.55;
        }
        .google-calendar-links {
          margin-top:18px;
          border-top:1px solid var(--gcal-border);
          padding-top:16px;
        }
        .google-calendar-links strong {
          display:block;
          color:var(--gcal-ink);
          font-size:16px;
          font-weight:900;
          margin-bottom:2px;
        }
        .google-calendar-button-grid {
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:12px;
          width:100%;
        }
        .google-calendar-button-grid .google-calendar-primary,
        .google-calendar-button-grid .google-calendar-secondary,
        .google-calendar-button-grid .google-calendar-danger { width:100%; }
        .google-calendar-button-grid .span-2 { grid-column:1 / -1; }
        @media (max-width: 900px) {
          .google-calendar-hero,
          .google-calendar-connection-head { flex-direction:column; }
          .google-calendar-actions--hero { width:100%; min-width:0; }
          .google-calendar-actions--hero .google-calendar-primary,
          .google-calendar-actions--hero .google-calendar-secondary { width:100%; }
          .google-calendar-link-row { grid-template-columns:1fr; }
        }
        @media (max-width: 780px) {
          .google-calendar-shell { gap:16px; }
          .google-calendar-hero {
            padding:24px 20px;
            border-radius:28px;
          }
          .google-calendar-hero-main {
            flex-direction:column;
            align-items:center;
            text-align:center;
            width:100%;
          }
          .google-calendar-hero-logo { width:82px; height:82px; border-radius:24px; }
          .google-calendar-hero-logo img { width:56px; height:56px; }
          .google-calendar-hero-copy h3 { font-size:clamp(32px,8vw,46px); }
          .google-calendar-hero-copy p { font-size:17px; }
          .google-calendar-chip { margin-top:16px; }
          .google-calendar-grid { gap:12px; }
          .google-calendar-metric {
            padding:16px 14px;
            border-radius:18px;
          }
          .google-calendar-metric span { font-size:12px; }
          .google-calendar-metric strong {
            font-size:15px;
            white-space:normal;
            overflow:visible;
            text-overflow:unset;
            word-break:break-word;
          }
          .google-calendar-panel,
          .google-calendar-connection,
          .google-calendar-empty {
            border-radius:26px;
            padding:20px 18px;
          }
          .google-calendar-connection-title strong,
          .google-calendar-panel h4 { white-space:normal; }
          .google-calendar-connection-title span { white-space:normal; }
          .google-calendar-form { grid-template-columns:1fr; gap:14px; }
          .google-calendar-button-grid { grid-template-columns:1fr; }
          .google-calendar-button-grid .span-2 { grid-column:auto; }
        }
        @media (max-width: 480px) {
          .google-calendar-hero { padding:22px 16px; }
          .google-calendar-hero-copy h3 { font-size:30px; }
          .google-calendar-hero-copy p,
          .google-calendar-empty p { font-size:15px; }
          .google-calendar-grid { gap:10px; }
          .google-calendar-metric { padding:14px 12px; }
          .google-calendar-metric span { font-size:11px; }
          .google-calendar-metric strong { font-size:14px; }
          .google-calendar-panel,
          .google-calendar-connection,
          .google-calendar-empty { padding:18px 14px; }
          .google-calendar-empty strong { font-size:24px; }
          .google-calendar-primary,
          .google-calendar-secondary,
          .google-calendar-danger { min-height:46px; font-size:14px; }
          .google-calendar-chip { font-size:14px; padding:9px 14px; }
        }
      `}</style>
      <SectionTitle>{t('tabGoogleCalendar')}</SectionTitle>

      <div className="google-calendar-shell">
        <div className="google-calendar-surface google-calendar-hero">
          <div className="google-calendar-hero-main">
            <span className="google-calendar-hero-logo" aria-hidden>
              <img src={googleCalendarLogo} alt="" />
            </span>
            <div className="google-calendar-hero-copy">
              <h3>Google Calendar</h3>
              <p>
                Connect one Google calendar per tenant or consultant. Bookings, personal sessions and ToDos sync with Google, while external Google events can block availability as busy time.
              </p>
              <span className={hasActiveConnection ? 'google-calendar-chip success' : 'google-calendar-chip danger'}>
                {statusLabel(activeConnection?.status)}
              </span>
            </div>
          </div>
          <div className="google-calendar-actions google-calendar-actions--hero">
            {!hasActiveConnection ? (
              <button type="button" className="google-calendar-primary" onClick={connect} disabled={connecting}>
                {connecting ? 'Connecting…' : activeConnection ? 'Reconnect Google' : 'Connect my Google Calendar'}
              </button>
            ) : null}
            <button type="button" className="google-calendar-secondary" onClick={() => void refresh()} disabled={loading}>
              Refresh
            </button>
          </div>
        </div>

        <div className="google-calendar-grid">
          <div className="google-calendar-metric"><span>Connections</span><strong>{connections.length}</strong></div>
          <div className="google-calendar-metric"><span>Active account</span><strong>{activeConnection?.googleAccountEmail || 'Not connected'}</strong></div>
          <div className="google-calendar-metric"><span>Open conflicts</span><strong>{conflicts.length}</strong></div>
        </div>

        {conflicts.length > 0 ? (
          <div className="google-calendar-panel google-calendar-conflicts">
            <h4>Sync conflicts need review</h4>
            {conflicts.slice(0, 5).map((link) => (
              <div key={link.id} className="google-calendar-link-row">
                <span>{entityLabels[link.appEntityType]} #{link.appEntityId}</span>
                <span>{link.syncStatus}{link.lastError ? ` · ${link.lastError}` : ''}</span>
                <span>{formatDateTime(link.lastSyncedAt)}</span>
              </div>
            ))}
          </div>
        ) : null}

        {loading ? (
          <div className="google-calendar-panel">
            <p className="muted">Loading Google Calendar settings…</p>
          </div>
        ) : connections.length === 0 ? (
          <div className="google-calendar-empty">
            <span className="google-calendar-empty-logo" aria-hidden>
              <img src={googleCalendarLogo} alt="" />
            </span>
            <strong>No Google Calendar connection</strong>
            <p>Connect your Google account to start syncing this tenant&apos;s calendar items, consultant bookings, personal sessions and external busy blocks.</p>
          </div>
        ) : (
          connections.map((connection) => {
            const draft = drafts[connection.id] || draftFromConnection(connection)
            const calendars = calendarsByConnection[connection.id] || []
            const links = linksByConnection[connection.id] || []
            const busy = busyConnectionId === connection.id
            return (
              <div key={connection.id} className="google-calendar-connection">
                <div className="google-calendar-connection-head">
                  <div className="google-calendar-connection-title">
                    <strong>{connection.googleAccountEmail || 'Google account'}</strong>
                    <span>{connection.calendarSummary || connection.calendarId || 'Primary calendar'}</span>
                    <span>Last full sync: {formatDateTime(connection.lastFullSyncAt)} · Last incremental sync: {formatDateTime(connection.lastIncrementalSyncAt)}</span>
                    <span>Webhook expires: {formatDateTime(connection.channelExpiresAt)}</span>
                  </div>
                  <span className={statusClass(connection.status)}>{connection.status.split('_').join(' ')}</span>
                </div>

                {connection.lastError ? <div className="google-calendar-error">{connection.lastError}</div> : null}

                <div className="google-calendar-form">
                  <Field label="Google calendar">
                    <select
                      value={draft.calendarId}
                      onChange={(e) => {
                        const selected = calendars.find((entry) => entry.id === e.target.value)
                        setDrafts((prev) => ({ ...prev, [connection.id]: { ...draft, calendarId: e.target.value, calendarSummary: selected?.summary || draft.calendarSummary } }))
                      }}
                    >
                      <option value={draft.calendarId}>{draft.calendarSummary || draft.calendarId}</option>
                      {calendars.map((calendar) => (
                        <option key={calendar.id} value={calendar.id}>{calendar.summary}{calendar.primary ? ' · primary' : ''}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Sync direction">
                    <select
                      value={draft.syncDirection}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [connection.id]: { ...draft, syncDirection: e.target.value as SyncDirection } }))}
                    >
                      {(Object.keys(syncDirectionLabels) as SyncDirection[]).map((key) => <option key={key} value={key}>{syncDirectionLabels[key]}</option>)}
                    </select>
                  </Field>
                  <Field label="External Google events">
                    <select
                      value={draft.importGoogleEventsAs}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [connection.id]: { ...draft, importGoogleEventsAs: e.target.value } }))}
                    >
                      <option value="BOOKED_SESSION">Import as booked sessions</option>
                      <option value="PERSONAL_BLOCK">Import as personal busy blocks</option>
                      <option value="IGNORE">Do not import</option>
                    </select>
                  </Field>
                  <Field label="When Google deletes a Calendra booking">
                    <select
                      value={draft.bookingDeletePolicy}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [connection.id]: { ...draft, bookingDeletePolicy: e.target.value as BookingDeletePolicy } }))}
                    >
                      {(Object.keys(bookingDeletePolicyLabels) as BookingDeletePolicy[]).map((key) => <option key={key} value={key}>{bookingDeletePolicyLabels[key]}</option>)}
                    </select>
                  </Field>
                  <div className="google-calendar-checklist">
                    <label className="google-calendar-checkbox">
                      <input
                        type="checkbox"
                        checked={draft.enabled}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [connection.id]: { ...draft, enabled: e.target.checked } }))}
                      />
                      <span>Enabled</span>
                    </label>
                    <label className="google-calendar-checkbox">
                      <input
                        type="checkbox"
                        checked={draft.allowGoogleToModifyBookings}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [connection.id]: { ...draft, allowGoogleToModifyBookings: e.target.checked } }))}
                      />
                      <span>Allow Google changes to move Calendra bookings when there is no conflict</span>
                    </label>
                  </div>
                </div>

                <div className="google-calendar-actions google-calendar-actions--connection">
                  <div className="google-calendar-button-grid">
                    <button type="button" className="google-calendar-secondary" onClick={() => void loadCalendars(connection.id)} disabled={busy}>Load calendars</button>
                    <button type="button" className="google-calendar-primary" onClick={() => void saveConnection(connection)} disabled={busy}>Save settings</button>
                    <button type="button" className="google-calendar-secondary span-2" onClick={() => void fullSync(connection.id)} disabled={busy}>Run full sync</button>
                    <button type="button" className="google-calendar-secondary span-2" onClick={() => void loadLinks(connection.id)} disabled={busy}>Show mappings</button>
                    <button type="button" className="google-calendar-danger span-2" onClick={() => void disconnect(connection.id)} disabled={busy}>Disconnect</button>
                  </div>
                </div>

                {links.length > 0 ? (
                  <div className="google-calendar-links">
                    <strong>Recent mappings</strong>
                    {links.slice(0, 8).map((link) => (
                      <div key={link.id} className="google-calendar-link-row">
                        <span>{entityLabels[link.appEntityType]} #{link.appEntityId}</span>
                        <span>{link.origin} · {link.syncStatus}{link.lastError ? ` · ${link.lastError}` : ''}</span>
                        <span>{formatDateTime(link.lastSyncedAt)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })
        )}
      </div>
    </Card>
  )
}
