import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { api, getApiErrorMessage } from '../api'
import { useLocale } from '../locale'

type ManageInfo = {
  tenantCode: string
  tenantName: string
  serviceName: string
  currentStart: string
  currentEnd: string
  startsAtLabel: string
  consultantName?: string
  bookingStatus: string
  canModify: boolean
  canCancel: boolean
  modifyBlockedReason?: string | null
  cancelBlockedReason?: string | null
  timezone: string
  paymentNote: string
}

type Slot = {
  slotId: string
  label: string
  startTime: string
  endTime: string
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function dateFromIso(value?: string | null) {
  return value ? value.slice(0, 10) : todayIsoDate()
}

function formatDateTime(value: string | null | undefined, locale: string) {
  if (!value) return ''
  const normalized = value.includes('Z') ? value : `${value}`
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return value
  return new Intl.DateTimeFormat(locale === 'sl' ? 'sl-SI' : 'en', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export function PublicBookingManagePage() {
  const { token = '' } = useParams()
  const [searchParams] = useSearchParams()
  const requestedAction = searchParams.get('action') === 'cancel' ? 'cancel' : 'modify'
  const { locale } = useLocale()
  const sl = locale === 'sl'
  const [loading, setLoading] = useState(true)
  const [info, setInfo] = useState<ManageInfo | null>(null)
  const [error, setError] = useState('')
  const [action, setAction] = useState<'modify' | 'cancel'>(requestedAction)
  const [date, setDate] = useState(todayIsoDate())
  const [slots, setSlots] = useState<Slot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState('')

  const copy = useMemo(() => sl ? {
    title: 'Ureditev rezervacije',
    loading: 'Nalaganje…',
    invalid: 'Povezava ni veljavna ali je potekla.',
    currentBooking: 'Trenutni termin',
    service: 'Storitev',
    provider: 'Izvajalec',
    modify: 'Spremeni termin',
    cancel: 'Odpovej termin',
    chooseDate: 'Izberite datum',
    chooseSlot: 'Izberite nov termin',
    noSlots: 'Za izbrani datum ni prostih terminov.',
    confirmModify: 'Shrani nov termin',
    confirmCancelTitle: 'Ali res želite odpovedati termin?',
    confirmCancel: 'Potrdi odpoved termina',
    keepBooking: 'Obdrži termin',
    cancelled: 'Termin je bil uspešno odpovedan.',
    modified: 'Termin je bil uspešno spremenjen.',
    paymentNote: 'Če je bilo plačilo že izvedeno, bo podjetje vračilo obravnavalo v skladu s svojimi pogoji.',
    cannotModify: 'Termina ni več mogoče spremeniti.',
    cannotCancel: 'Termina ni več mogoče odpovedati.',
    loadSlotsFailed: 'Prostih terminov ni bilo mogoče naložiti.',
    submitFailed: 'Spremembe ni bilo mogoče shraniti.',
  } : {
    title: 'Manage booking',
    loading: 'Loading…',
    invalid: 'This link is invalid or has expired.',
    currentBooking: 'Current booking',
    service: 'Service',
    provider: 'Employee',
    modify: 'Modify booking',
    cancel: 'Cancel booking',
    chooseDate: 'Choose date',
    chooseSlot: 'Choose a new time slot',
    noSlots: 'No available slots for this date.',
    confirmModify: 'Save new time',
    confirmCancelTitle: 'Are you sure you want to cancel this booking?',
    confirmCancel: 'Confirm cancellation',
    keepBooking: 'Keep booking',
    cancelled: 'Your booking was cancelled successfully.',
    modified: 'Your booking was rescheduled successfully.',
    paymentNote: 'If payment has already been made, the business will handle any refund according to its own terms.',
    cannotModify: 'This booking can no longer be changed.',
    cannotCancel: 'This booking can no longer be cancelled.',
    loadSlotsFailed: 'Could not load available slots.',
    submitFailed: 'Could not save the change.',
  }, [sl])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    api.get(`/public-bookings/manage/${encodeURIComponent(token)}`, { headers: { 'X-Skip-CSRF-Prefetch': 'true' } })
      .then((res) => {
        if (cancelled) return
        const next = res.data as ManageInfo
        setInfo(next)
        setDate(dateFromIso(next.currentStart))
        if (requestedAction === 'cancel' && next.canCancel) setAction('cancel')
        else if (next.canModify) setAction('modify')
        else if (next.canCancel) setAction('cancel')
      })
      .catch((err) => {
        if (!cancelled) setError(getApiErrorMessage(err, copy.invalid))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [copy.invalid, requestedAction, token])

  useEffect(() => {
    if (!info?.canModify || action !== 'modify' || !date || success) return
    let cancelled = false
    setSlotsLoading(true)
    setSelectedSlot('')
    api.get(`/public-bookings/manage/${encodeURIComponent(token)}/availability`, {
      params: { date },
      headers: { 'X-Skip-CSRF-Prefetch': 'true' },
    })
      .then((res) => {
        if (!cancelled) setSlots(Array.isArray(res.data?.slots) ? res.data.slots : [])
      })
      .catch(() => {
        if (!cancelled) {
          setSlots([])
          setError(copy.loadSlotsFailed)
        }
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false)
      })
    return () => { cancelled = true }
  }, [action, copy.loadSlotsFailed, date, info?.canModify, success, token])

  const submitReschedule = async () => {
    if (!selectedSlot) return
    setBusy(true)
    setError('')
    try {
      const res = await api.post(`/public-bookings/manage/${encodeURIComponent(token)}/reschedule`, { startTime: selectedSlot }, {
        headers: { 'X-Skip-CSRF-Prefetch': 'true' },
      })
      setSuccess(`${copy.modified} ${formatDateTime(res.data?.startTime, locale)}`)
      const refreshed = await api.get(`/public-bookings/manage/${encodeURIComponent(token)}`, { headers: { 'X-Skip-CSRF-Prefetch': 'true' } })
      setInfo(refreshed.data)
    } catch (err) {
      setError(getApiErrorMessage(err, copy.submitFailed))
    } finally {
      setBusy(false)
    }
  }

  const submitCancel = async () => {
    setBusy(true)
    setError('')
    try {
      await api.post(`/public-bookings/manage/${encodeURIComponent(token)}/cancel`, {}, {
        headers: { 'X-Skip-CSRF-Prefetch': 'true' },
      })
      setSuccess(copy.cancelled)
      setInfo((current) => current ? { ...current, canCancel: false, canModify: false, bookingStatus: 'CANCELLED' } : current)
    } catch (err) {
      setError(getApiErrorMessage(err, copy.submitFailed))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f7f8fb', padding: '32px 16px', color: '#0f172a' }}>
      <main style={{ maxWidth: 760, margin: '0 auto' }}>
        <section style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 20, boxShadow: '0 16px 40px rgba(15,23,42,.08)', overflow: 'hidden' }}>
          <header style={{ padding: '24px 28px', borderBottom: '1px solid #edf0f5', background: 'linear-gradient(135deg,#f8fbff,#fff)' }}>
            <div style={{ color: '#2563eb', fontWeight: 800, fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase' }}>Calendra</div>
            <h1 style={{ margin: '6px 0 4px', fontSize: 28, lineHeight: 1.15 }}>{copy.title}</h1>
            {info?.tenantName && <p style={{ margin: 0, color: '#64748b' }}>{info.tenantName}</p>}
          </header>

          <div style={{ padding: 28 }}>
            {loading && <p>{copy.loading}</p>}
            {!loading && error && !info && <div style={alertStyle('error')}>{error || copy.invalid}</div>}
            {!loading && info && (
              <>
                {error && <div style={alertStyle('error')}>{error}</div>}
                {success && <div style={alertStyle('success')}>{success}</div>}

                <div style={{ border: '1px solid #e5e7eb', borderRadius: 16, padding: 18, marginBottom: 18 }}>
                  <div style={{ fontWeight: 800, marginBottom: 10 }}>{copy.currentBooking}</div>
                  <div style={{ display: 'grid', gap: 8, color: '#334155' }}>
                    <div><strong>{copy.service}:</strong> {info.serviceName}</div>
                    <div><strong>{copy.currentBooking}:</strong> {formatDateTime(info.currentStart, locale)}</div>
                    {info.consultantName && <div><strong>{copy.provider}:</strong> {info.consultantName}</div>}
                  </div>
                </div>

                {!success && (info.canModify || info.canCancel) && (
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
                    {info.canModify && <button type="button" onClick={() => setAction('modify')} style={tabStyle(action === 'modify')}>{copy.modify}</button>}
                    {info.canCancel && <button type="button" onClick={() => setAction('cancel')} style={tabStyle(action === 'cancel')}>{copy.cancel}</button>}
                  </div>
                )}

                {!success && action === 'modify' && (
                  info.canModify ? (
                    <div style={{ display: 'grid', gap: 16 }}>
                      <label style={{ display: 'grid', gap: 6, fontWeight: 700 }}>
                        {copy.chooseDate}
                        <input type="date" value={date} min={todayIsoDate()} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
                      </label>
                      <div>
                        <div style={{ fontWeight: 700, marginBottom: 10 }}>{copy.chooseSlot}</div>
                        {slotsLoading && <p>{copy.loading}</p>}
                        {!slotsLoading && slots.length === 0 && <p style={{ color: '#64748b' }}>{copy.noSlots}</p>}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))', gap: 8 }}>
                          {slots.map((slot) => (
                            <button key={slot.slotId} type="button" onClick={() => setSelectedSlot(slot.startTime)} style={slotStyle(selectedSlot === slot.startTime)}>
                              {slot.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <button type="button" disabled={!selectedSlot || busy} onClick={submitReschedule} style={primaryButtonStyle(!selectedSlot || busy)}>
                        {busy ? copy.loading : copy.confirmModify}
                      </button>
                    </div>
                  ) : <div style={alertStyle('info')}>{info.modifyBlockedReason || copy.cannotModify}</div>
                )}

                {!success && action === 'cancel' && (
                  info.canCancel ? (
                    <div style={{ border: '1px solid #fecaca', background: '#fff7f7', borderRadius: 16, padding: 18 }}>
                      <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>{copy.confirmCancelTitle}</h2>
                      <p style={{ marginTop: 0, color: '#64748b' }}>{copy.paymentNote}</p>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {info.canModify && <button type="button" onClick={() => setAction('modify')} style={secondaryButtonStyle}>{copy.keepBooking}</button>}
                        <button type="button" disabled={busy} onClick={submitCancel} style={dangerButtonStyle(busy)}>{busy ? copy.loading : copy.confirmCancel}</button>
                      </div>
                    </div>
                  ) : <div style={alertStyle('info')}>{info.cancelBlockedReason || copy.cannotCancel}</div>
                )}

                {!success && !info.canModify && !info.canCancel && (
                  <div style={alertStyle('info')}>{info.modifyBlockedReason || info.cancelBlockedReason || copy.cannotModify}</div>
                )}
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

function alertStyle(kind: 'error' | 'success' | 'info'): CSSProperties {
  const bg = kind === 'error' ? '#fef2f2' : kind === 'success' ? '#ecfdf5' : '#eff6ff'
  const border = kind === 'error' ? '#fecaca' : kind === 'success' ? '#bbf7d0' : '#bfdbfe'
  const color = kind === 'error' ? '#991b1b' : kind === 'success' ? '#166534' : '#1e40af'
  return { background: bg, border: `1px solid ${border}`, color, padding: '12px 14px', borderRadius: 12, marginBottom: 16 }
}

const inputStyle: CSSProperties = {
  height: 42,
  border: '1px solid #d1d5db',
  borderRadius: 10,
  padding: '0 12px',
  fontSize: 15,
}

function tabStyle(active: boolean): CSSProperties {
  return {
    border: `1px solid ${active ? '#2563eb' : '#d1d5db'}`,
    background: active ? '#2563eb' : '#fff',
    color: active ? '#fff' : '#334155',
    borderRadius: 999,
    padding: '10px 14px',
    fontWeight: 800,
    cursor: 'pointer',
  }
}

function slotStyle(active: boolean): CSSProperties {
  return {
    border: `1px solid ${active ? '#2563eb' : '#d1d5db'}`,
    background: active ? '#eff6ff' : '#fff',
    color: active ? '#1d4ed8' : '#111827',
    borderRadius: 10,
    padding: '10px 8px',
    fontWeight: 800,
    cursor: 'pointer',
  }
}

function primaryButtonStyle(disabled: boolean): CSSProperties {
  return {
    border: 0,
    background: disabled ? '#93c5fd' : '#2563eb',
    color: '#fff',
    borderRadius: 12,
    padding: '12px 16px',
    fontWeight: 900,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
}

const secondaryButtonStyle: CSSProperties = {
  border: '1px solid #d1d5db',
  background: '#fff',
  color: '#111827',
  borderRadius: 12,
  padding: '12px 16px',
  fontWeight: 900,
  cursor: 'pointer',
}

function dangerButtonStyle(disabled: boolean): CSSProperties {
  return {
    border: 0,
    background: disabled ? '#fca5a5' : '#dc2626',
    color: '#fff',
    borderRadius: 12,
    padding: '12px 16px',
    fontWeight: 900,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
}
