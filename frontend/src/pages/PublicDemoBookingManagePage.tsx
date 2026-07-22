import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router-dom'
import { api, getApiErrorMessage } from '../api'
import calendraLogo from '../assets/login-logo.png'

type DemoBooking = {
  id: number
  status: string
  title: string
  startAt: string
  endAt: string
  durationMinutes: number
  timeZone: string
  guestTimeZone: string
  guestName: string
  guestEmail: string
  guestPhone?: string | null
  companyName: string
  guestNote?: string | null
  meetingProvider: string
  meetingJoinUrl?: string | null
  manageToken: string
  canModify: boolean
}

type AvailableSlot = {
  startAt: string
  endAt: string
  displayTime: string
}

type AvailableDay = {
  date: string
  slots: AvailableSlot[]
}

type AvailabilityResponse = {
  timeZone: string
  days: AvailableDay[]
}

type HoldResponse = {
  holdToken: string
  expiresAt: string
  startAt: string
  endAt: string
}

type PageLocale = 'sl' | 'en'
type Action = 'reschedule' | 'cancel'

function decodeUrlSegment(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function tokenFromPath(pathname: string) {
  const prefixes = [
    '/public-demo-booking/manage/',
    '/predstavitev/upravljanje/',
    '/en/demo/manage/',
  ]
  for (const prefix of prefixes) {
    const index = pathname.indexOf(prefix)
    if (index < 0) continue
    const rest = pathname.slice(index + prefix.length)
    const segment = rest.split('/').find(Boolean) || ''
    return decodeUrlSegment(segment).trim()
  }
  return ''
}

function dateInTimeZone(value: string, timeZone: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  return year && month && day ? `${year}-${month}-${day}` : value.slice(0, 10)
}

function todayInTimeZone(timeZone: string) {
  return dateInTimeZone(new Date().toISOString(), timeZone)
}

function formatDateTime(value: string, locale: PageLocale, timeZone: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale === 'sl' ? 'sl-SI' : 'en-GB', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function meetingLabel(provider: string) {
  return provider === 'ZOOM' ? 'Zoom' : 'Google Meet'
}

function CalendarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function VideoIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="m16 10 5-3v10l-5-3" />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 7h-6V1" />
      <path d="M20 7a9 9 0 1 0 2 6" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </svg>
  )
}

const styles = `
  .demo-manage-page{min-height:100vh;box-sizing:border-box;padding:32px 18px;background:radial-gradient(circle at 10% 90%,rgba(43,120,243,.12),transparent 30%),linear-gradient(135deg,#f8fbff,#eef4fc 48%,#fbfdff);color:#12213b;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  .demo-manage-card{width:min(100%,900px);margin:0 auto;padding:clamp(24px,5vw,48px);box-sizing:border-box;border:1px solid #dce5f1;border-radius:28px;background:rgba(255,255,255,.97);box-shadow:0 28px 70px rgba(15,35,70,.12)}
  .demo-manage-logo{display:block;width:170px;height:auto;margin-bottom:32px}
  .demo-manage-badge{display:inline-flex;align-items:center;min-height:30px;padding:0 12px;border-radius:999px;background:#e8f8ef;color:#087a45;font-size:13px;font-weight:800}
  .demo-manage-title{margin:14px 0 8px;color:#101827;font-size:clamp(2rem,5vw,3rem);line-height:1.08;letter-spacing:-.045em}
  .demo-manage-subtitle{margin:0 0 28px;color:#607089;font-size:1.02rem;line-height:1.55}
  .demo-manage-alert{margin:0 0 20px;padding:14px 16px;border-radius:14px;border:1px solid;font-size:.95rem;line-height:1.5}
  .demo-manage-alert--error{border-color:#fecaca;background:#fff3f3;color:#991b1b}
  .demo-manage-alert--success{border-color:#bbf7d0;background:#effcf5;color:#166534}
  .demo-manage-summary{display:grid;gap:0;margin-bottom:22px;border:1px solid #dfe7f2;border-radius:18px;overflow:hidden;background:#fff}
  .demo-manage-row{display:grid;grid-template-columns:32px 150px minmax(0,1fr);gap:12px;align-items:center;padding:14px 16px;border-top:1px solid #e7edf5}
  .demo-manage-row:first-child{border-top:0}.demo-manage-row svg{color:#1769ea}.demo-manage-row span{color:#53627a;font-size:.92rem;font-weight:700}.demo-manage-row strong{color:#111827;text-align:right;line-height:1.45;word-break:break-word}
  .demo-manage-join{display:inline-flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:54px;margin:0 0 22px;border-radius:14px;background:#1769ea;color:#fff;text-decoration:none;font-weight:800;box-shadow:0 14px 28px rgba(23,105,234,.22)}
  .demo-manage-tabs{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px}.demo-manage-tab{display:flex;align-items:center;justify-content:center;gap:9px;min-height:48px;border:1px solid #d7e0ec;border-radius:14px;background:#fff;color:#1d355d;font:inherit;font-weight:800;cursor:pointer}.demo-manage-tab.is-active{border-color:#1769ea;background:#eff5ff;color:#1769ea}.demo-manage-tab.is-danger.is-active{border-color:#fecaca;background:#fff5f5;color:#b42318}
  .demo-manage-form{display:grid;gap:18px}.demo-manage-field{display:grid;gap:9px}.demo-manage-label{display:flex;align-items:center;gap:8px;color:#1d355d;font-weight:800}.demo-manage-date{height:52px;padding:0 15px;border:1px solid #d3deeb;border-radius:14px;background:#fff;color:#17305d;font:inherit;outline:none}.demo-manage-date:focus{border-color:#6d9cf5;box-shadow:0 0 0 4px rgba(59,130,246,.12)}
  .demo-manage-slots{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.demo-manage-slot{min-height:46px;padding:0 12px;border:1px solid #d6dfeb;border-radius:13px;background:#fff;color:#17305d;font:inherit;font-weight:800;cursor:pointer}.demo-manage-slot.is-active{border-color:#1769ea;background:#edf4ff;color:#1769ea;box-shadow:0 0 0 2px rgba(23,105,234,.08)}
  .demo-manage-primary,.demo-manage-danger,.demo-manage-secondary{display:flex;align-items:center;justify-content:center;gap:9px;min-height:52px;padding:0 18px;border-radius:14px;font:inherit;font-weight:800;cursor:pointer}.demo-manage-primary{border:0;background:#1769ea;color:#fff;box-shadow:0 14px 28px rgba(23,105,234,.2)}.demo-manage-primary:disabled,.demo-manage-danger:disabled{opacity:.5;cursor:not-allowed;box-shadow:none}.demo-manage-danger{border:0;background:#dc2626;color:#fff}.demo-manage-secondary{border:1px solid #d6dfeb;background:#fff;color:#17305d}
  .demo-manage-cancel{padding:20px;border:1px solid #fecaca;border-radius:17px;background:#fff7f7}.demo-manage-cancel h2{margin:0 0 8px;color:#8f1d1d;font-size:1.15rem}.demo-manage-cancel p{margin:0 0 16px;color:#73545a;line-height:1.55}.demo-manage-cancel-actions{display:flex;gap:10px;flex-wrap:wrap}.demo-manage-muted{margin:0;color:#718096;line-height:1.5}
  @media(max-width:680px){.demo-manage-page{padding:12px}.demo-manage-card{padding:25px 18px;border-radius:22px}.demo-manage-logo{width:150px;margin-bottom:25px}.demo-manage-row{grid-template-columns:28px 1fr;gap:6px 10px}.demo-manage-row strong{grid-column:2;text-align:left}.demo-manage-tabs{grid-template-columns:1fr}.demo-manage-slots{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:390px){.demo-manage-slots{grid-template-columns:1fr}}
`

export function PublicDemoBookingManagePage() {
  const { token: routeToken } = useParams()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const token = useMemo(() => {
    const fromRoute = routeToken ? decodeUrlSegment(routeToken).trim() : ''
    return fromRoute || tokenFromPath(location.pathname)
  }, [location.pathname, routeToken])
  const locale: PageLocale = location.pathname.startsWith('/en/') || searchParams.get('lang') === 'en' ? 'en' : 'sl'
  const [booking, setBooking] = useState<DemoBooking | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [action, setAction] = useState<Action>('reschedule')
  const [date, setDate] = useState('')
  const [slots, setSlots] = useState<AvailableSlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selectedStart, setSelectedStart] = useState('')
  const [hold, setHold] = useState<HoldResponse | null>(null)
  const [busy, setBusy] = useState(false)

  const copy = useMemo(() => locale === 'sl' ? {
    badge: 'Upravljanje predstavitve',
    title: 'Prestavite ali odpovejte termin',
    subtitle: 'Spremembo lahko uredite neposredno na tej strani.',
    loading: 'Nalaganje…',
    invalid: 'Povezava ni veljavna ali je termin ni več mogoče upravljati.',
    current: 'Trenutni termin',
    duration: 'Trajanje',
    platform: 'Platforma',
    bookedBy: 'Rezerviral/a',
    company: 'Podjetje',
    minutes: 'minut',
    join: 'Pridruži se klicu',
    reschedule: 'Prestavi termin',
    cancel: 'Odpovej termin',
    chooseDate: 'Izberite nov datum',
    chooseTime: 'Izberite nov termin',
    noSlots: 'Za izbrani datum ni prostih terminov.',
    save: 'Potrdi nov termin',
    cancelTitle: 'Ali res želite odpovedati predstavitev?',
    cancelText: 'Po potrditvi bo termin odstranjen iz koledarja in povezava za klic ne bo več veljavna.',
    confirmCancel: 'Potrdi odpoved',
    keep: 'Obdrži termin',
    rescheduled: 'Termin predstavitve je bil uspešno prestavljen.',
    cancelled: 'Termin predstavitve je bil uspešno odpovedan.',
    loadSlotsFailed: 'Prostih terminov ni bilo mogoče naložiti.',
    holdFailed: 'Izbranega termina ni bilo mogoče začasno rezervirati. Poskusite z drugim terminom.',
    submitFailed: 'Spremembe ni bilo mogoče shraniti.',
    unavailable: 'Tega termina ni več mogoče spremeniti ali odpovedati.',
  } : {
    badge: 'Manage demo',
    title: 'Reschedule or cancel your demo',
    subtitle: 'You can manage the appointment directly on this page.',
    loading: 'Loading…',
    invalid: 'This link is invalid or the appointment can no longer be managed.',
    current: 'Current appointment',
    duration: 'Duration',
    platform: 'Platform',
    bookedBy: 'Booked by',
    company: 'Company',
    minutes: 'minutes',
    join: 'Join the call',
    reschedule: 'Reschedule',
    cancel: 'Cancel appointment',
    chooseDate: 'Choose a new date',
    chooseTime: 'Choose a new time',
    noSlots: 'There are no available times on this date.',
    save: 'Confirm new time',
    cancelTitle: 'Are you sure you want to cancel the demo?',
    cancelText: 'After confirmation, the appointment will be removed from the calendar and the meeting link will no longer be valid.',
    confirmCancel: 'Confirm cancellation',
    keep: 'Keep appointment',
    rescheduled: 'Your demo was rescheduled successfully.',
    cancelled: 'Your demo was cancelled successfully.',
    loadSlotsFailed: 'Available times could not be loaded.',
    holdFailed: 'The selected time could not be held. Please choose another time.',
    submitFailed: 'The change could not be saved.',
    unavailable: 'This appointment can no longer be changed or cancelled.',
  }, [locale])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    if (!token) {
      setError(copy.invalid)
      setLoading(false)
      return () => { cancelled = true }
    }
    api.get(`/public/demo-bookings/manage/${encodeURIComponent(token)}`, {
      headers: { 'X-Skip-CSRF-Prefetch': 'true' },
    }).then((response) => {
      if (cancelled) return
      const next = response.data as DemoBooking
      setBooking(next)
      setDate(dateInTimeZone(next.startAt, next.guestTimeZone || next.timeZone))
    }).catch((requestError) => {
      if (!cancelled) setError(getApiErrorMessage(requestError, copy.invalid))
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [copy.invalid, token])

  useEffect(() => {
    if (!booking?.canModify || action !== 'reschedule' || !date || success) return
    let cancelled = false
    setSlotsLoading(true)
    setSlots([])
    setSelectedStart('')
    api.get<AvailabilityResponse>('/public/demo-bookings/availability', {
      params: {
        from: date,
        to: date,
        timeZone: booking.guestTimeZone || booking.timeZone,
      },
      headers: { 'X-Skip-CSRF-Prefetch': 'true' },
    }).then((response) => {
      if (cancelled) return
      const day = response.data.days?.find((entry) => entry.date === date)
      setSlots(day?.slots || [])
    }).catch(() => {
      if (!cancelled) setError(copy.loadSlotsFailed)
    }).finally(() => {
      if (!cancelled) setSlotsLoading(false)
    })
    return () => { cancelled = true }
  }, [action, booking, copy.loadSlotsFailed, date, success])

  const selectSlot = async (slot: AvailableSlot) => {
    if (!booking || busy) return
    setBusy(true)
    setError('')
    try {
      const response = await api.post<HoldResponse>('/public/demo-bookings/holds', {
        startAt: slot.startAt,
        guestTimeZone: booking.guestTimeZone || booking.timeZone,
        previousHoldToken: hold?.holdToken || '',
      }, { headers: { 'X-Skip-CSRF-Prefetch': 'true' } })
      setHold(response.data)
      setSelectedStart(slot.startAt)
    } catch (requestError) {
      setHold(null)
      setSelectedStart('')
      setError(getApiErrorMessage(requestError, copy.holdFailed))
      setSlots((current) => current.filter((entry) => entry.startAt !== slot.startAt))
    } finally {
      setBusy(false)
    }
  }

  const reschedule = async () => {
    if (!booking || !hold?.holdToken || !token) return
    setBusy(true)
    setError('')
    try {
      const response = await api.post<DemoBooking>(
        `/public/demo-bookings/manage/${encodeURIComponent(token)}/reschedule`,
        {
          holdToken: hold.holdToken,
          guestTimeZone: booking.guestTimeZone || booking.timeZone,
          locale,
        },
        { headers: { 'X-Skip-CSRF-Prefetch': 'true' } },
      )
      setBooking(response.data)
      setDate(dateInTimeZone(response.data.startAt, response.data.guestTimeZone || response.data.timeZone))
      setSuccess(copy.rescheduled)
      setHold(null)
      setSelectedStart('')
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, copy.submitFailed))
    } finally {
      setBusy(false)
    }
  }

  const cancelBooking = async () => {
    if (!booking || !token) return
    setBusy(true)
    setError('')
    try {
      const response = await api.post<DemoBooking>(
        `/public/demo-bookings/manage/${encodeURIComponent(token)}/cancel`,
        {},
        {
          params: { locale },
          headers: { 'X-Skip-CSRF-Prefetch': 'true' },
        },
      )
      setBooking(response.data)
      setSuccess(copy.cancelled)
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, copy.submitFailed))
    } finally {
      setBusy(false)
    }
  }

  const timeZone = booking?.guestTimeZone || booking?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone

  return (
    <div className="demo-manage-page">
      <style>{styles}</style>
      <main className="demo-manage-card">
        <img className="demo-manage-logo" src={calendraLogo} alt="Calendra" />
        <span className="demo-manage-badge">{copy.badge}</span>
        <h1 className="demo-manage-title">{copy.title}</h1>
        <p className="demo-manage-subtitle">{copy.subtitle}</p>

        {loading && <p className="demo-manage-muted">{copy.loading}</p>}
        {!loading && error && !booking && <div className="demo-manage-alert demo-manage-alert--error">{error}</div>}

        {!loading && booking && (
          <>
            {error && <div className="demo-manage-alert demo-manage-alert--error">{error}</div>}
            {success && <div className="demo-manage-alert demo-manage-alert--success">{success}</div>}

            <section className="demo-manage-summary">
              <div className="demo-manage-row"><CalendarIcon /><span>{copy.current}</span><strong>{formatDateTime(booking.startAt, locale, timeZone)}</strong></div>
              <div className="demo-manage-row"><ClockIcon /><span>{copy.duration}</span><strong>{booking.durationMinutes} {copy.minutes}</strong></div>
              <div className="demo-manage-row"><VideoIcon /><span>{copy.platform}</span><strong>{meetingLabel(booking.meetingProvider)}</strong></div>
              <div className="demo-manage-row"><span aria-hidden>○</span><span>{copy.bookedBy}</span><strong>{booking.guestName}</strong></div>
              <div className="demo-manage-row"><span aria-hidden>□</span><span>{copy.company}</span><strong>{booking.companyName}</strong></div>
            </section>

            {booking.status === 'CONFIRMED' && booking.meetingJoinUrl && (
              <a className="demo-manage-join" href={booking.meetingJoinUrl} target="_blank" rel="noreferrer">
                <VideoIcon /> {copy.join}
              </a>
            )}

            {!success && booking.canModify ? (
              <>
                <div className="demo-manage-tabs">
                  <button type="button" className={`demo-manage-tab${action === 'reschedule' ? ' is-active' : ''}`} onClick={() => setAction('reschedule')}>
                    <RefreshIcon /> {copy.reschedule}
                  </button>
                  <button type="button" className={`demo-manage-tab is-danger${action === 'cancel' ? ' is-active' : ''}`} onClick={() => setAction('cancel')}>
                    <CloseIcon /> {copy.cancel}
                  </button>
                </div>

                {action === 'reschedule' ? (
                  <div className="demo-manage-form">
                    <label className="demo-manage-field">
                      <span className="demo-manage-label"><CalendarIcon /> {copy.chooseDate}</span>
                      <input
                        className="demo-manage-date"
                        type="date"
                        value={date}
                        min={todayInTimeZone(timeZone)}
                        onChange={(event: ChangeEvent<HTMLInputElement>) => {
                          setDate(event.target.value)
                          setSelectedStart('')
                          setError('')
                        }}
                      />
                    </label>
                    <div className="demo-manage-field">
                      <div className="demo-manage-label"><ClockIcon /> {copy.chooseTime}</div>
                      {slotsLoading && <p className="demo-manage-muted">{copy.loading}</p>}
                      {!slotsLoading && slots.length === 0 && <p className="demo-manage-muted">{copy.noSlots}</p>}
                      <div className="demo-manage-slots">
                        {slots.map((slot) => (
                          <button
                            key={slot.startAt}
                            type="button"
                            className={`demo-manage-slot${selectedStart === slot.startAt ? ' is-active' : ''}`}
                            disabled={busy}
                            onClick={() => selectSlot(slot)}
                          >
                            {slot.displayTime}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button className="demo-manage-primary" type="button" disabled={!hold?.holdToken || !selectedStart || busy} onClick={reschedule}>
                      <RefreshIcon /> {busy ? copy.loading : copy.save}
                    </button>
                  </div>
                ) : (
                  <section className="demo-manage-cancel">
                    <h2>{copy.cancelTitle}</h2>
                    <p>{copy.cancelText}</p>
                    <div className="demo-manage-cancel-actions">
                      <button className="demo-manage-danger" type="button" disabled={busy} onClick={cancelBooking}><CloseIcon /> {busy ? copy.loading : copy.confirmCancel}</button>
                      <button className="demo-manage-secondary" type="button" disabled={busy} onClick={() => setAction('reschedule')}>{copy.keep}</button>
                    </div>
                  </section>
                )}
              </>
            ) : !success ? (
              <div className="demo-manage-alert demo-manage-alert--error">{copy.unavailable}</div>
            ) : null}
          </>
        )}
      </main>
    </div>
  )
}
