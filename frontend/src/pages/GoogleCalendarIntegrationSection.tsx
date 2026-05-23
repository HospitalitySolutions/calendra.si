import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { Card, EmptyState, Field, SectionTitle } from '../components/ui'
import { useToast } from '../components/Toast'
import { useLocale } from '../locale'
import type { User } from '../lib/types'

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
    importGoogleEventsAs: connection.importGoogleEventsAs || 'PERSONAL_BLOCK',
    enabled: connection.status !== 'DISABLED',
  }
}

function statusClass(status: ConnectionStatus) {
  if (status === 'ACTIVE') return 'google-calendar-status active'
  if (status === 'NEEDS_RECONNECT') return 'google-calendar-status warn'
  if (status === 'ERROR') return 'google-calendar-status danger'
  return 'google-calendar-status muted'
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
    () => connections.find((entry) => entry.userId === me.id && entry.status !== 'DISABLED') || connections[0] || null,
    [connections, me.id],
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const params = companyId ? { companyId } : undefined
      const [{ data: statusData }, { data: conflictData }] = await Promise.all([
        api.get('/google/calendar/status', { params }),
        api.get('/google/calendar/conflicts', { params }).catch(() => ({ data: [] })),
      ])
      const nextConnections: GoogleCalendarConnection[] = Array.isArray(statusData) ? statusData : []
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
      const returnUrl = `${window.location.origin}/configuration?tab=googleCalendar`
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
        .google-calendar-card { --gcal-blue:#1a73e8; --gcal-ink:#0f172a; --gcal-border:#dbe5f4; }
        .google-calendar-hero { display:flex; justify-content:space-between; align-items:flex-start; gap:18px; padding:18px; border:1px solid var(--gcal-border); background:linear-gradient(135deg,#eff6ff,#f8fbff 50%,#eefbf6); }
        .google-calendar-hero h3 { margin:0 0 6px; color:var(--gcal-ink); font-size:20px; }
        .google-calendar-hero p { margin:0; color:#526079; max-width:720px; line-height:1.45; }
        .google-calendar-actions { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
        .google-calendar-primary { border:0; background:var(--gcal-blue); color:white; padding:10px 14px; font-weight:700; cursor:pointer; }
        .google-calendar-secondary { border:1px solid #b7c5dc; background:white; color:#1f2d4a; padding:9px 12px; font-weight:650; cursor:pointer; }
        .google-calendar-secondary:disabled, .google-calendar-primary:disabled { opacity:.6; cursor:default; }
        .google-calendar-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; margin-top:16px; }
        .google-calendar-metric { border:1px solid var(--gcal-border); background:white; padding:12px; }
        .google-calendar-metric span { display:block; color:#6b7280; font-size:12px; }
        .google-calendar-metric strong { display:block; color:var(--gcal-ink); margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .google-calendar-connection { border:1px solid var(--gcal-border); background:#fff; padding:16px; margin-top:16px; }
        .google-calendar-connection-head { display:flex; justify-content:space-between; gap:14px; align-items:flex-start; }
        .google-calendar-connection-title { display:flex; flex-direction:column; gap:3px; min-width:0; }
        .google-calendar-connection-title strong { color:var(--gcal-ink); }
        .google-calendar-connection-title span { color:#64748b; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .google-calendar-status { display:inline-flex; align-items:center; padding:5px 8px; border:1px solid #d1d5db; font-size:12px; font-weight:800; letter-spacing:.02em; text-transform:uppercase; }
        .google-calendar-status.active { color:#047857; background:#ecfdf5; border-color:#a7f3d0; }
        .google-calendar-status.warn { color:#b45309; background:#fffbeb; border-color:#fde68a; }
        .google-calendar-status.danger { color:#b91c1c; background:#fef2f2; border-color:#fecaca; }
        .google-calendar-status.muted { color:#4b5563; background:#f3f4f6; }
        .google-calendar-form { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; margin-top:14px; }
        .google-calendar-form select, .google-calendar-form input { width:100%; border:1px solid #cfd8e7; padding:10px; background:white; }
        .google-calendar-checkbox { display:flex; gap:8px; align-items:flex-start; color:#344054; font-size:14px; }
        .google-calendar-checkbox input { width:auto; margin-top:3px; }
        .google-calendar-error { margin-top:10px; padding:10px 12px; border:1px solid #fecaca; background:#fff1f2; color:#991b1b; }
        .google-calendar-links { margin-top:14px; border-top:1px solid var(--gcal-border); padding-top:12px; }
        .google-calendar-link-row { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; padding:8px 0; border-bottom:1px solid #edf2f7; font-size:13px; color:#334155; }
        .google-calendar-conflicts { margin-top:16px; border:1px solid #fed7aa; background:#fff7ed; padding:14px; }
        .google-calendar-conflicts h4 { margin:0 0 8px; color:#9a3412; }
        @media (max-width: 900px) {
          .google-calendar-hero, .google-calendar-connection-head { flex-direction:column; }
          .google-calendar-grid, .google-calendar-form, .google-calendar-link-row { grid-template-columns:1fr; }
        }
      `}</style>
      <SectionTitle>{t('tabGoogleCalendar')}</SectionTitle>
      <div className="google-calendar-hero">
        <div>
          <h3>Two-way Google Calendar sync</h3>
          <p>
            Connect one Google calendar per tenant/consultant. Calendra bookings, personal sessions and ToDos are mapped to Google events. External Google events are imported as personal busy blocks so they block availability without becoming billable bookings.
          </p>
        </div>
        <div className="google-calendar-actions">
          <button type="button" className="google-calendar-primary" onClick={connect} disabled={connecting}>
            {connecting ? 'Connecting…' : activeConnection?.status === 'NEEDS_RECONNECT' ? 'Reconnect Google' : 'Connect my Google Calendar'}
          </button>
          <button type="button" className="google-calendar-secondary" onClick={() => void refresh()} disabled={loading}>Refresh</button>
        </div>
      </div>

      <div className="google-calendar-grid">
        <div className="google-calendar-metric"><span>Connections</span><strong>{connections.length}</strong></div>
        <div className="google-calendar-metric"><span>Active account</span><strong>{activeConnection?.googleAccountEmail || 'Not connected'}</strong></div>
        <div className="google-calendar-metric"><span>Open conflicts</span><strong>{conflicts.length}</strong></div>
      </div>

      {conflicts.length > 0 ? (
        <div className="google-calendar-conflicts">
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
        <p className="muted">Loading Google Calendar settings…</p>
      ) : connections.length === 0 ? (
        <EmptyState title="No Google Calendar connection" text="Connect your Google account to start syncing this tenant's calendar items." />
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
                <span className={statusClass(connection.status)}>{connection.status}</span>
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
                <div className="stack gap-sm">
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

              <div className="google-calendar-actions" style={{ marginTop: 14 }}>
                <button type="button" className="google-calendar-secondary" onClick={() => void loadCalendars(connection.id)} disabled={busy}>Load calendars</button>
                <button type="button" className="google-calendar-primary" onClick={() => void saveConnection(connection)} disabled={busy}>Save settings</button>
                <button type="button" className="google-calendar-secondary" onClick={() => void fullSync(connection.id)} disabled={busy}>Run full sync</button>
                <button type="button" className="google-calendar-secondary" onClick={() => void loadLinks(connection.id)} disabled={busy}>Show mappings</button>
                <button type="button" className="google-calendar-secondary" onClick={() => void disconnect(connection.id)} disabled={busy}>Disconnect</button>
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
    </Card>
  )
}
