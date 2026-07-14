import { useEffect, useMemo, useState } from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router-dom'
import { api, getApiErrorMessage } from '../api'
import { useLocale } from '../locale'
import calendraLogo from '../assets/login-logo.png'

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

function decodeUrlSegment(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function tokenFromManagePath(pathname: string) {
  const prefix = '/public-booking/manage/'
  const index = pathname.indexOf(prefix)
  if (index < 0) return ''
  const rest = pathname.slice(index + prefix.length)
  const segment = rest.split('/').find(Boolean) || ''
  return decodeUrlSegment(segment).trim()
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

function CalendarIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
      <path d="m9 15 2 2 4-4" />
    </svg>
  )
}

function EditCalendarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 2v4M16 2v4M3 10h11M5 4h12a2 2 0 0 1 2 2v5" />
      <rect x="3" y="4" width="16" height="17" rx="2" />
      <path d="m14.5 18.5 5-5 2 2-5 5-3 .8.8-2.8Z" />
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

function ClockIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function SaveIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 3h12l4 4v14H3V3h2Z" />
      <path d="M7 3v6h10V3M8 21v-7h8v7" />
    </svg>
  )
}

function InfoCalendarIllustration() {
  return (
    <div className="public-manage-illustration" aria-hidden>
      <div className="public-manage-illustration-ring" />
      <div className="public-manage-illustration-calendar">
        <span className="public-manage-illustration-loop public-manage-illustration-loop--left" />
        <span className="public-manage-illustration-loop public-manage-illustration-loop--right" />
        <span className="public-manage-illustration-square" />
      </div>
    </div>
  )
}

const pageStyles = `
  .public-manage-page {
    min-height: 100vh;
    padding: clamp(24px, 4vw, 56px) 20px;
    color: #102349;
    background:
      radial-gradient(circle at 8% 88%, rgba(53, 116, 246, .14), transparent 28%),
      radial-gradient(circle at 92% 16%, rgba(96, 165, 250, .12), transparent 24%),
      linear-gradient(135deg, #f8fbff 0%, #eef4fc 46%, #f9fbff 100%);
    box-sizing: border-box;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .public-manage-shell {
    position: relative;
    width: min(100%, 1180px);
    margin: 0 auto;
    overflow: hidden;
    border: 1px solid rgba(199, 210, 226, .75);
    border-radius: 34px;
    background: rgba(255, 255, 255, .96);
    box-shadow: 0 30px 80px rgba(15, 35, 70, .12);
  }

  .public-manage-shell::before,
  .public-manage-shell::after {
    content: "";
    position: absolute;
    pointer-events: none;
    border-radius: 999px;
    filter: blur(.2px);
  }

  .public-manage-shell::before {
    width: 360px;
    height: 360px;
    left: -230px;
    bottom: -210px;
    border: 28px solid rgba(59, 130, 246, .055);
  }

  .public-manage-shell::after {
    width: 290px;
    height: 290px;
    right: -180px;
    top: 30px;
    background: radial-gradient(circle at 40% 40%, rgba(59, 130, 246, .10), rgba(59, 130, 246, 0) 68%);
  }

  .public-manage-content {
    position: relative;
    z-index: 1;
    padding: clamp(30px, 5vw, 64px);
  }

  .public-manage-brand {
    display: inline-flex;
    align-items: center;
    margin-bottom: 48px;
  }

  .public-manage-brand img {
    display: block;
    width: clamp(145px, 16vw, 205px);
    height: auto;
  }

  .public-manage-heading {
    position: relative;
    max-width: 760px;
    margin-bottom: 34px;
  }

  .public-manage-heading h1 {
    margin: 0;
    color: #0d2147;
    font-size: clamp(2.35rem, 5vw, 4rem);
    line-height: 1.02;
    letter-spacing: -.055em;
    font-weight: 850;
  }

  .public-manage-heading p {
    margin: 12px 0 0;
    color: #64748b;
    font-size: clamp(1.05rem, 2vw, 1.35rem);
    line-height: 1.45;
  }

  .public-manage-illustration {
    position: absolute;
    z-index: 0;
    top: 42px;
    right: 68px;
    width: 190px;
    height: 190px;
    display: grid;
    place-items: center;
    opacity: .94;
  }

  .public-manage-illustration-ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: radial-gradient(circle at 45% 45%, rgba(255,255,255,.96), rgba(219,234,254,.62) 62%, rgba(219,234,254,0) 73%);
  }

  .public-manage-illustration-calendar {
    position: relative;
    width: 108px;
    height: 94px;
    border-radius: 25px;
    border: 1px solid rgba(255,255,255,.92);
    background: linear-gradient(145deg, rgba(255,255,255,.96), rgba(218,232,255,.72));
    box-shadow: 0 20px 42px rgba(37,99,235,.16), inset 0 0 20px rgba(255,255,255,.78);
    transform: rotate(7deg);
  }

  .public-manage-illustration-calendar::before {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: 22px;
    height: 1px;
    background: rgba(59,130,246,.16);
  }

  .public-manage-illustration-loop {
    position: absolute;
    top: -14px;
    width: 15px;
    height: 30px;
    border-radius: 999px;
    background: linear-gradient(180deg, #ffffff, #b7d3ff);
    box-shadow: 0 5px 12px rgba(37,99,235,.18);
  }

  .public-manage-illustration-loop--left { left: 23px; }
  .public-manage-illustration-loop--right { right: 23px; }

  .public-manage-illustration-square {
    position: absolute;
    right: 24px;
    bottom: 20px;
    width: 21px;
    height: 21px;
    border-radius: 6px;
    background: linear-gradient(135deg, #6aa8ff, #2764ea);
    box-shadow: 0 7px 15px rgba(37,99,235,.24);
  }

  .public-manage-alert {
    margin-bottom: 22px;
    padding: 15px 17px;
    border: 1px solid;
    border-radius: 16px;
    font-size: .95rem;
    line-height: 1.5;
  }

  .public-manage-alert--error {
    border-color: #fecaca;
    background: #fef2f2;
    color: #991b1b;
  }

  .public-manage-alert--success {
    border-color: #bbf7d0;
    background: #ecfdf5;
    color: #166534;
  }

  .public-manage-alert--info {
    border-color: #bfdbfe;
    background: #eff6ff;
    color: #1e40af;
  }

  .public-manage-summary {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 22px;
    align-items: center;
    margin-bottom: 20px;
    padding: 26px 28px;
    border: 1px solid #dce5f1;
    border-radius: 24px;
    background: linear-gradient(180deg, rgba(255,255,255,.98), rgba(248,251,255,.96));
    box-shadow: 0 15px 35px rgba(15,35,70,.04);
  }

  .public-manage-summary-icon {
    display: grid;
    place-items: center;
    width: 74px;
    height: 74px;
    border-radius: 24px;
    background: linear-gradient(145deg, #f1f7ff, #e1edff);
    color: #3976ef;
    box-shadow: inset 0 0 0 1px rgba(59,130,246,.08);
  }

  .public-manage-summary h2 {
    margin: 0 0 10px;
    color: #102349;
    font-size: 1.05rem;
    font-weight: 800;
  }

  .public-manage-summary-grid {
    display: grid;
    gap: 7px;
    color: #52637d;
    font-size: 1.02rem;
    line-height: 1.45;
  }

  .public-manage-summary-grid strong {
    color: #17305d;
    font-weight: 800;
  }

  .public-manage-tabs {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 24px;
  }

  .public-manage-tab {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 54px;
    padding: 0 24px;
    border: 1px solid #d6dfeb;
    border-radius: 16px;
    background: #fff;
    color: #17305d;
    font: inherit;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 8px 22px rgba(15,35,70,.035);
    transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease, background .16s ease, color .16s ease;
  }

  .public-manage-tab:hover {
    transform: translateY(-1px);
    border-color: #b9cff3;
    box-shadow: 0 12px 25px rgba(37,99,235,.10);
  }

  .public-manage-tab--active {
    border-color: transparent;
    background: linear-gradient(135deg, #3679f5, #2459df);
    color: #fff;
    box-shadow: 0 14px 28px rgba(37,99,235,.25);
  }

  .public-manage-tab--cancel.public-manage-tab--active {
    border-color: #fecaca;
    background: #fff7f7;
    color: #b42318;
    box-shadow: 0 10px 24px rgba(220,38,38,.08);
  }

  .public-manage-form {
    display: grid;
    gap: 24px;
  }

  .public-manage-field {
    display: grid;
    gap: 10px;
  }

  .public-manage-label {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    color: #132b55;
    font-size: 1rem;
    font-weight: 800;
  }

  .public-manage-label svg {
    color: #3b73e9;
  }

  .public-manage-date {
    width: 100%;
    height: 58px;
    box-sizing: border-box;
    padding: 0 18px;
    border: 1px solid #d4deeb;
    border-radius: 16px;
    outline: none;
    background: rgba(255,255,255,.92);
    color: #17305d;
    font: inherit;
    font-size: 1rem;
    box-shadow: inset 0 1px 2px rgba(15,35,70,.02);
    transition: border-color .16s ease, box-shadow .16s ease;
  }

  .public-manage-date:focus {
    border-color: #6d9cf5;
    box-shadow: 0 0 0 4px rgba(59,130,246,.12);
  }

  .public-manage-slots {
    display: grid;
    grid-template-columns: repeat(3, minmax(130px, 182px));
    gap: 12px;
  }

  .public-manage-slot {
    min-height: 56px;
    padding: 0 18px;
    border: 1px solid #d6dfeb;
    border-radius: 16px;
    background: #fff;
    color: #17305d;
    font: inherit;
    font-size: 1.03rem;
    font-weight: 850;
    cursor: pointer;
    transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease, background .16s ease, color .16s ease;
  }

  .public-manage-slot:hover {
    transform: translateY(-1px);
    border-color: #abc8fa;
    box-shadow: 0 9px 20px rgba(37,99,235,.08);
  }

  .public-manage-slot--active {
    border-color: #3679f5;
    background: linear-gradient(180deg, #f6f9ff, #edf4ff);
    color: #2459df;
    box-shadow: 0 0 0 2px rgba(54,121,245,.08);
  }

  .public-manage-primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    min-height: 62px;
    margin-top: 4px;
    border: 0;
    border-radius: 17px;
    background: linear-gradient(105deg, #4a8af7 0%, #2e68eb 54%, #2959de 100%);
    color: #fff;
    font: inherit;
    font-size: 1.05rem;
    font-weight: 850;
    cursor: pointer;
    box-shadow: 0 16px 30px rgba(37,99,235,.22);
    transition: transform .16s ease, filter .16s ease, box-shadow .16s ease;
  }

  .public-manage-primary:hover:not(:disabled) {
    transform: translateY(-1px);
    filter: brightness(1.02);
    box-shadow: 0 19px 34px rgba(37,99,235,.27);
  }

  .public-manage-primary:disabled {
    background: linear-gradient(90deg, #c7daf7, #abcaf4);
    color: rgba(255,255,255,.82);
    cursor: not-allowed;
    box-shadow: none;
  }

  .public-manage-cancel-panel {
    padding: 24px;
    border: 1px solid #fecaca;
    border-radius: 22px;
    background: linear-gradient(180deg, #fffafa, #fff5f5);
  }

  .public-manage-cancel-panel h2 {
    margin: 0 0 9px;
    color: #7f1d1d;
    font-size: 1.25rem;
  }

  .public-manage-cancel-panel p {
    margin: 0 0 18px;
    color: #7c5960;
    line-height: 1.55;
  }

  .public-manage-cancel-actions {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .public-manage-secondary,
  .public-manage-danger {
    min-height: 50px;
    padding: 0 20px;
    border-radius: 14px;
    font: inherit;
    font-weight: 800;
    cursor: pointer;
  }

  .public-manage-secondary {
    border: 1px solid #d6dfeb;
    background: #fff;
    color: #17305d;
  }

  .public-manage-danger {
    border: 0;
    background: #dc2626;
    color: #fff;
    box-shadow: 0 12px 25px rgba(220,38,38,.18);
  }

  .public-manage-danger:disabled {
    background: #fca5a5;
    cursor: not-allowed;
    box-shadow: none;
  }

  .public-manage-muted {
    margin: 0;
    color: #718096;
    line-height: 1.5;
  }

  @media (max-width: 900px) {
    .public-manage-illustration { display: none; }
    .public-manage-heading { max-width: none; }
    .public-manage-brand { margin-bottom: 34px; }
  }

  @media (max-width: 680px) {
    .public-manage-page { padding: 14px; }
    .public-manage-shell { border-radius: 24px; }
    .public-manage-content { padding: 26px 20px 30px; }
    .public-manage-brand { margin-bottom: 28px; }
    .public-manage-heading { margin-bottom: 24px; }
    .public-manage-heading h1 { font-size: 2.25rem; }
    .public-manage-summary {
      grid-template-columns: 1fr;
      gap: 16px;
      padding: 20px;
      border-radius: 20px;
    }
    .public-manage-summary-icon {
      width: 58px;
      height: 58px;
      border-radius: 18px;
    }
    .public-manage-tabs {
      display: grid;
      grid-template-columns: 1fr;
    }
    .public-manage-tab { width: 100%; }
    .public-manage-slots {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 420px) {
    .public-manage-content { padding-inline: 16px; }
    .public-manage-heading h1 { font-size: 2rem; }
    .public-manage-slots { grid-template-columns: 1fr; }
  }
`

export function PublicBookingManagePage() {
  const { token: routeToken } = useParams()
  const location = useLocation()
  const token = useMemo(() => {
    const fromRoute = routeToken ? decodeUrlSegment(routeToken).trim() : ''
    return fromRoute || tokenFromManagePath(location.pathname)
  }, [location.pathname, routeToken])
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
    if (!token) {
      setError(copy.invalid)
      setLoading(false)
      return () => { cancelled = true }
    }
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
    if (!token || !info?.canModify || action !== 'modify' || !date || success) return
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
    if (!token) {
      setError(copy.invalid)
      return
    }
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
    if (!token) {
      setError(copy.invalid)
      return
    }
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
    <div className="public-manage-page">
      <style>{pageStyles}</style>
      <main className="public-manage-shell">
        <InfoCalendarIllustration />
        <div className="public-manage-content">
          <div className="public-manage-brand">
            <img src={calendraLogo} alt="Calendra" />
          </div>

          <header className="public-manage-heading">
            <h1>{copy.title}</h1>
            {info?.tenantName && <p>{info.tenantName}</p>}
          </header>

          {loading && <p className="public-manage-muted">{copy.loading}</p>}
          {!loading && error && !info && <div className="public-manage-alert public-manage-alert--error">{error || copy.invalid}</div>}

          {!loading && info && (
            <>
              {error && <div className="public-manage-alert public-manage-alert--error">{error}</div>}
              {success && <div className="public-manage-alert public-manage-alert--success">{success}</div>}

              <section className="public-manage-summary">
                <div className="public-manage-summary-icon">
                  <CalendarIcon size={31} />
                </div>
                <div>
                  <h2>{copy.currentBooking}</h2>
                  <div className="public-manage-summary-grid">
                    <div><strong>{copy.service}:</strong> {info.serviceName}</div>
                    <div><strong>{copy.currentBooking}:</strong> {formatDateTime(info.currentStart, locale)}</div>
                    {info.consultantName && <div><strong>{copy.provider}:</strong> {info.consultantName}</div>}
                  </div>
                </div>
              </section>

              {!success && (info.canModify || info.canCancel) && (
                <div className="public-manage-tabs">
                  {info.canModify && (
                    <button
                      type="button"
                      onClick={() => setAction('modify')}
                      className={`public-manage-tab${action === 'modify' ? ' public-manage-tab--active' : ''}`}
                    >
                      <EditCalendarIcon />
                      {copy.modify}
                    </button>
                  )}
                  {info.canCancel && (
                    <button
                      type="button"
                      onClick={() => setAction('cancel')}
                      className={`public-manage-tab public-manage-tab--cancel${action === 'cancel' ? ' public-manage-tab--active' : ''}`}
                    >
                      <CloseIcon />
                      {copy.cancel}
                    </button>
                  )}
                </div>
              )}

              {!success && action === 'modify' && (
                info.canModify ? (
                  <div className="public-manage-form">
                    <label className="public-manage-field">
                      <span className="public-manage-label">
                        <CalendarIcon />
                        {copy.chooseDate}
                      </span>
                      <input
                        type="date"
                        value={date}
                        min={todayIsoDate()}
                        onChange={(e) => setDate(e.target.value)}
                        className="public-manage-date"
                      />
                    </label>

                    <div className="public-manage-field">
                      <div className="public-manage-label">
                        <ClockIcon />
                        {copy.chooseSlot}
                      </div>
                      {slotsLoading && <p className="public-manage-muted">{copy.loading}</p>}
                      {!slotsLoading && slots.length === 0 && <p className="public-manage-muted">{copy.noSlots}</p>}
                      <div className="public-manage-slots">
                        {slots.map((slot) => (
                          <button
                            key={slot.slotId}
                            type="button"
                            onClick={() => setSelectedSlot(slot.startTime)}
                            className={`public-manage-slot${selectedSlot === slot.startTime ? ' public-manage-slot--active' : ''}`}
                          >
                            {slot.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!selectedSlot || busy}
                      onClick={submitReschedule}
                      className="public-manage-primary"
                    >
                      <SaveIcon />
                      {busy ? copy.loading : copy.confirmModify}
                    </button>
                  </div>
                ) : <div className="public-manage-alert public-manage-alert--info">{info.modifyBlockedReason || copy.cannotModify}</div>
              )}

              {!success && action === 'cancel' && (
                info.canCancel ? (
                  <div className="public-manage-cancel-panel">
                    <h2>{copy.confirmCancelTitle}</h2>
                    <p>{copy.paymentNote}</p>
                    <div className="public-manage-cancel-actions">
                      {info.canModify && (
                        <button type="button" onClick={() => setAction('modify')} className="public-manage-secondary">
                          {copy.keepBooking}
                        </button>
                      )}
                      <button type="button" disabled={busy} onClick={submitCancel} className="public-manage-danger">
                        {busy ? copy.loading : copy.confirmCancel}
                      </button>
                    </div>
                  </div>
                ) : <div className="public-manage-alert public-manage-alert--info">{info.cancelBlockedReason || copy.cannotCancel}</div>
              )}

              {!success && !info.canModify && !info.canCancel && (
                <div className="public-manage-alert public-manage-alert--info">
                  {info.modifyBlockedReason || info.cancelBlockedReason || copy.cannotModify}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
