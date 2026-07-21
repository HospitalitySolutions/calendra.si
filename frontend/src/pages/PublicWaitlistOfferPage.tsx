import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router-dom'
import { api, getApiErrorMessage } from '../api'
import { useLocale } from '../locale'
import calendraLogo from '../assets/login-logo.png'

type OfferResponse = {
  offerId: number
  requestId: number | null
  tenantCode?: string | null
  tenantName?: string | null
  tenantLogoUrl?: string | null
  serviceName?: string | null
  slotStart?: string | null
  slotEnd?: string | null
  startsAtLabel?: string | null
  employeeName?: string | null
  locationName?: string | null
  offerStatus?: string | null
  requestStatus?: string | null
  otherSlotsUrl?: string | null
}

function decodeUrlSegment(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function StatusIllustration({ declined = false }: { declined?: boolean }) {
  return (
    <div className="public-offer-illustration" aria-hidden>
      <div className="public-offer-illustration-ring" />
      <div className={`public-offer-illustration-calendar${declined ? ' public-offer-illustration-calendar--declined' : ''}`}>
        <span className="public-offer-illustration-loop public-offer-illustration-loop--left" />
        <span className="public-offer-illustration-loop public-offer-illustration-loop--right" />
        <span className={`public-offer-illustration-symbol${declined ? ' public-offer-illustration-symbol--declined' : ''}`} />
      </div>
    </div>
  )
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

function ListIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function formatDateTime(value: string | null | undefined, locale: string) {
  if (!value) return ''
  const d = new Date(value)
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

function buildCalendarPayload(data: OfferResponse) {
  const title = data.serviceName || 'Calendra'
  const details = [data.tenantName, data.employeeName].filter(Boolean).join(' · ')
  const location = data.locationName || data.tenantName || ''
  return { title, details, location }
}

function formatCalendarDate(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  const hh = String(date.getUTCHours()).padStart(2, '0')
  const mm = String(date.getUTCMinutes()).padStart(2, '0')
  const ss = String(date.getUTCSeconds()).padStart(2, '0')
  return `${y}${m}${d}T${hh}${mm}${ss}Z`
}

function downloadIcs(data: OfferResponse) {
  const { title, details, location } = buildCalendarPayload(data)
  const start = formatCalendarDate(data.slotStart)
  const end = formatCalendarDate(data.slotEnd)
  const stamp = formatCalendarDate(new Date().toISOString())
  const uid = `calendra-waitlist-offer-${data.offerId || Date.now()}@calendra`
  const body = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Calendra//Waitlist Offer//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${String(title).replace(/\n/g, ' ')}`,
    `DESCRIPTION:${String(details || '').replace(/\n/g, ' ')}`,
    `LOCATION:${String(location || '').replace(/\n/g, ' ')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  const blob = new Blob([body], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'calendra-termin.ics'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function googleCalendarUrl(data: OfferResponse) {
  const { title, details, location } = buildCalendarPayload(data)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${formatCalendarDate(data.slotStart)}/${formatCalendarDate(data.slotEnd)}`,
    details,
    location,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function outlookCalendarUrl(data: OfferResponse) {
  const { title, details, location } = buildCalendarPayload(data)
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: title,
    startdt: data.slotStart || '',
    enddt: data.slotEnd || '',
    body: details,
    location,
  })
  return `https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`
}

const pageStyles = `
  .public-offer-page {
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
  .public-offer-shell {
    position: relative;
    width: min(100%, 1180px);
    margin: 0 auto;
    overflow: hidden;
    border: 1px solid rgba(199, 210, 226, .75);
    border-radius: 34px;
    background: rgba(255, 255, 255, .96);
    box-shadow: 0 30px 80px rgba(15, 35, 70, .12);
  }
  .public-offer-shell::before,
  .public-offer-shell::after {
    content: "";
    position: absolute;
    pointer-events: none;
    border-radius: 999px;
  }
  .public-offer-shell::before {
    width: 360px;
    height: 360px;
    left: -230px;
    bottom: -210px;
    border: 28px solid rgba(59, 130, 246, .055);
  }
  .public-offer-shell::after {
    width: 290px;
    height: 290px;
    right: -180px;
    top: 30px;
    background: radial-gradient(circle at 40% 40%, rgba(59, 130, 246, .10), rgba(59, 130, 246, 0) 68%);
  }
  .public-offer-content {
    position: relative;
    z-index: 1;
    padding: clamp(30px, 5vw, 64px);
  }
  .public-offer-brand {
    display: inline-flex;
    align-items: center;
    margin-bottom: 48px;
  }
  .public-offer-brand img {
    display: block;
    height: auto;
    object-fit: contain;
    object-position: left center;
  }
  .public-offer-brand-image--calendra { width: clamp(145px, 16vw, 205px); }
  .public-offer-brand-image--tenant { width: auto; max-width: min(300px, 62vw); max-height: 88px; }
  .public-offer-heading {
    position: relative;
    max-width: 760px;
    margin-bottom: 34px;
  }
  .public-offer-heading h1 {
    margin: 0;
    color: #0d2147;
    font-size: clamp(2.35rem, 5vw, 4rem);
    line-height: 1.02;
    letter-spacing: -.055em;
    font-weight: 850;
  }
  .public-offer-heading p {
    margin: 12px 0 0;
    color: #64748b;
    font-size: clamp(1.05rem, 2vw, 1.35rem);
    line-height: 1.45;
  }
  .public-offer-illustration {
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
  .public-offer-illustration-ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: radial-gradient(circle at 45% 45%, rgba(255,255,255,.96), rgba(219,234,254,.62) 62%, rgba(219,234,254,0) 73%);
  }
  .public-offer-illustration-calendar {
    position: relative;
    width: 108px;
    height: 94px;
    border-radius: 25px;
    border: 1px solid rgba(255,255,255,.92);
    background: linear-gradient(145deg, rgba(255,255,255,.96), rgba(218,232,255,.72));
    box-shadow: 0 20px 42px rgba(37,99,235,.16), inset 0 0 20px rgba(255,255,255,.78);
    transform: rotate(7deg);
  }
  .public-offer-illustration-calendar--declined {
    background: linear-gradient(145deg, rgba(255,255,255,.96), rgba(254,226,226,.76));
    box-shadow: 0 20px 42px rgba(239,68,68,.14), inset 0 0 20px rgba(255,255,255,.78);
  }
  .public-offer-illustration-loop {
    position: absolute;
    top: -11px;
    width: 18px;
    height: 20px;
    border-radius: 999px;
    background: linear-gradient(180deg, rgba(196,211,232,.98), rgba(227,236,249,.88));
  }
  .public-offer-illustration-loop--left { left: 26px; }
  .public-offer-illustration-loop--right { right: 26px; }
  .public-offer-illustration-symbol {
    position: absolute;
    inset: 0;
    margin: auto;
    width: 26px;
    height: 14px;
    border-bottom: 5px solid #2563eb;
    border-left: 5px solid #2563eb;
    transform: rotate(-45deg) translate(4px, -6px);
    border-radius: 2px;
  }
  .public-offer-illustration-symbol--declined {
    width: 34px;
    height: 34px;
    border: 0;
    transform: none;
  }
  .public-offer-illustration-symbol--declined::before,
  .public-offer-illustration-symbol--declined::after {
    content: "";
    position: absolute;
    left: 14px;
    top: 2px;
    width: 5px;
    height: 30px;
    border-radius: 999px;
    background: #ef4444;
  }
  .public-offer-illustration-symbol--declined::before { transform: rotate(45deg); }
  .public-offer-illustration-symbol--declined::after { transform: rotate(-45deg); }
  .public-offer-summary {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 18px;
    align-items: flex-start;
    border-radius: 24px;
    border: 1px solid #dce7f6;
    background: linear-gradient(180deg, rgba(255,255,255,.95), rgba(245,249,255,.96));
    padding: 26px 28px;
    margin-bottom: 28px;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.9);
  }
  .public-offer-summary-icon {
    width: 72px;
    height: 72px;
    border-radius: 20px;
    background: linear-gradient(180deg, #eff5ff, #dceaff);
    color: #2563eb;
    display: grid;
    place-items: center;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.88);
  }
  .public-offer-summary h2 {
    margin: 0 0 10px;
    font-size: 1.2rem;
    color: #0f2350;
  }
  .public-offer-summary-grid {
    display: grid;
    gap: 8px;
    color: #52627c;
    line-height: 1.5;
  }
  .public-offer-summary-grid strong { color: #0f2350; }
  .public-offer-muted { color: #6b7a92; }
  .public-offer-alert {
    border-radius: 18px;
    padding: 16px 18px;
    margin-bottom: 20px;
    border: 1px solid transparent;
    font-weight: 600;
  }
  .public-offer-alert--error { background: #fff1f2; border-color: #fecdd3; color: #b42318; }
  .public-offer-alert--success { background: #effaf3; border-color: #b7e4c7; color: #107243; }
  .public-offer-alert--info { background: #eff6ff; border-color: #c7d8ff; color: #1d4ed8; }
  .public-offer-actions { position: relative; z-index: 10; display: flex; flex-wrap: wrap; gap: 12px; }
  .public-offer-primary,
  .public-offer-menu-button,
  .public-offer-link-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 54px;
    padding: 0 20px;
    border-radius: 16px;
    border: 0;
    font-weight: 800;
    font-size: 1rem;
    cursor: pointer;
    text-decoration: none;
    box-shadow: 0 14px 28px rgba(37,99,235,.18);
    transition: transform .15s ease, box-shadow .15s ease;
  }
  .public-offer-primary,
  .public-offer-menu-button,
  .public-offer-link-button {
    background: linear-gradient(180deg, #2970ff, #1d4ed8);
    color: #fff;
  }
  .public-offer-primary:hover,
  .public-offer-menu-button:hover,
  .public-offer-link-button:hover {
    transform: translateY(-1px);
    box-shadow: 0 18px 32px rgba(37,99,235,.22);
  }
  .public-offer-menu { position: relative; }
  .public-offer-menu-panel {
    position: absolute;
    top: auto;
    bottom: calc(100% + 10px);
    left: 0;
    min-width: 230px;
    padding: 10px;
    border-radius: 18px;
    background: rgba(255,255,255,.98);
    border: 1px solid #dbe6f3;
    box-shadow: 0 22px 48px rgba(15, 35, 70, .15);
    display: grid;
    gap: 6px;
    z-index: 30;
  }
  .public-offer-menu-panel a,
  .public-offer-menu-panel button {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: flex-start;
    border: 0;
    background: transparent;
    border-radius: 12px;
    padding: 11px 12px;
    font: inherit;
    color: #0f2350;
    text-decoration: none;
    cursor: pointer;
  }
  .public-offer-menu-panel a:hover,
  .public-offer-menu-panel button:hover { background: #eef5ff; }
  .public-offer-decline-choices {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    margin-top: 20px;
  }
  .public-offer-choice {
    display: grid;
    gap: 7px;
    min-height: 122px;
    padding: 20px;
    text-align: left;
    border: 1px solid #d7e3f2;
    border-radius: 19px;
    background: #fff;
    color: #102349;
    cursor: pointer;
    font: inherit;
  }
  .public-offer-choice:hover { border-color: #8eb7f8; background: #f7faff; }
  .public-offer-choice--danger:hover { border-color: #f3a5a5; background: #fff8f8; }
  .public-offer-choice strong { font-size: 1rem; }
  .public-offer-choice span { color: #64748b; line-height: 1.45; }
  .public-offer-choice:disabled { cursor: wait; opacity: .65; }
  @media (max-width: 860px) {
    .public-offer-illustration { position: relative; top: 0; right: 0; margin: 0 0 10px auto; }
    .public-offer-summary { grid-template-columns: 1fr; }
  }
  @media (max-width: 640px) {
    .public-offer-content { padding: 26px 20px 30px; }
    .public-offer-brand { margin-bottom: 28px; }
    .public-offer-heading { margin-bottom: 24px; }
    .public-offer-actions, .public-offer-menu, .public-offer-menu-button, .public-offer-link-button { width: 100%; }
    .public-offer-decline-choices { grid-template-columns: 1fr; }
    .public-offer-menu-panel { left: 0; right: 0; min-width: 0; }
  }
`

export function PublicWaitlistOfferPage() {
  const { offerId: routeOfferId } = useParams()
  const location = useLocation()
  const { locale } = useLocale()
  const sl = locale === 'sl'
  const [searchParams] = useSearchParams()
  const requestedAction = searchParams.get('action') === 'decline' ? 'decline' : 'accept'
  const offerId = useMemo(() => routeOfferId ? decodeUrlSegment(routeOfferId).trim() : '', [routeOfferId])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState<OfferResponse | null>(null)
  const [tenantLogoFailed, setTenantLogoFailed] = useState(false)
  const [calendarMenuOpen, setCalendarMenuOpen] = useState(false)
  const [declineSubmitting, setDeclineSubmitting] = useState(false)
  const [declineChoiceCompleted, setDeclineChoiceCompleted] = useState(false)
  const [leftWaitlist, setLeftWaitlist] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const copy = useMemo(() => sl ? {
    acceptedTitle: 'Ponudba potrjena',
    declinedTitle: 'Ponudba zavrnjena',
    acceptedSubtitle: 'Vaš termin je potrjen. Spodaj ga lahko dodate v svoj koledar.',
    declinedSubtitle: 'Ponudba je bila zavrnjena. Ostajate v čakalni vrsti za naslednjo ustrezno ponudbo.',
    declinedLeaveSubtitle: 'Ponudba je bila zavrnjena in vaša zahteva je bila odstranjena iz čakalne vrste.',
    declineChoiceTitle: 'Zavrni ponudbo',
    declineChoiceSubtitle: 'Izberite, ali želite ostati v čakalni vrsti za naslednjo ustrezno ponudbo.',
    declineRemain: 'Zavrni in ostani v čakalni vrsti',
    declineRemainHelp: 'Ta termin boste zavrnili, vaša zahteva pa bo ostala aktivna.',
    declineLeave: 'Zavrni in zapusti čakalno vrsto',
    declineLeaveHelp: 'Ta termin boste zavrnili in zaključili celotno zahtevo.',
    loading: 'Nalaganje…',
    invalid: 'Ta povezava ni veljavna ali je potekla.',
    acceptedLabel: 'Potrjeni termin',
    declinedLabel: 'Ponujeni termin',
    service: 'Storitev',
    dateTime: 'Termin',
    provider: 'Izvajalec',
    location: 'Lokacija',
    addToCalendar: 'Dodaj v koledar',
    otherSlots: 'Ogled drugih terminov',
    googleCalendar: 'Google Koledar',
    outlookCalendar: 'Outlook Koledar',
    appleCalendar: 'Apple Koledar (.ics)',
    icsDownload: 'Prenesi .ics datoteko',
    offerExpired: 'Ta ponudba ni več na voljo.',
    offerAcceptedElsewhere: 'Ta ponudba je že potrjena.',
    offerDeclinedAlready: 'Ta ponudba je že zavrnjena.',
  } : {
    acceptedTitle: 'Offer confirmed',
    declinedTitle: 'Offer declined',
    acceptedSubtitle: 'Your appointment slot is confirmed. You can add it to your calendar below.',
    declinedSubtitle: 'This offer was declined. You remain on the waitlist for the next suitable offer.',
    declinedLeaveSubtitle: 'This offer was declined and your request was removed from the waitlist.',
    declineChoiceTitle: 'Decline offer',
    declineChoiceSubtitle: 'Choose whether to remain on the waitlist for the next suitable offer.',
    declineRemain: 'Decline and remain on waitlist',
    declineRemainHelp: 'Decline this slot while keeping your waitlist request active.',
    declineLeave: 'Decline and leave waitlist',
    declineLeaveHelp: 'Decline this slot and close the complete waitlist request.',
    loading: 'Loading…',
    invalid: 'This link is invalid or has expired.',
    acceptedLabel: 'Confirmed slot',
    declinedLabel: 'Offered slot',
    service: 'Service',
    dateTime: 'Date & time',
    provider: 'Employee',
    location: 'Location',
    addToCalendar: 'Add to calendar',
    otherSlots: 'Browse other slots',
    googleCalendar: 'Google Calendar',
    outlookCalendar: 'Outlook Calendar',
    appleCalendar: 'Apple Calendar (.ics)',
    icsDownload: 'Download .ics file',
    offerExpired: 'This offer is no longer available.',
    offerAcceptedElsewhere: 'This offer has already been confirmed.',
    offerDeclinedAlready: 'This offer has already been declined.',
  }, [sl])

  useEffect(() => {
    setTenantLogoFailed(false)
  }, [data?.tenantLogoUrl])

  useEffect(() => {
    const handle = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setCalendarMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setDeclineChoiceCompleted(false)
    setLeftWaitlist(false)
    if (!offerId) {
      setError(copy.invalid)
      setLoading(false)
      return () => { cancelled = true }
    }

    const request = requestedAction === 'decline'
      ? api.get(`/public-waitlists/offers/${encodeURIComponent(offerId)}`, {
          headers: { 'X-Skip-CSRF-Prefetch': 'true' },
        })
      : api.post(`/public-waitlists/offers/${encodeURIComponent(offerId)}/accept`, {}, {
          headers: { 'X-Skip-CSRF-Prefetch': 'true' },
        })

    request
      .then((res) => {
        if (!cancelled) setData(res.data as OfferResponse)
      })
      .catch(async (err) => {
        if (cancelled) return
        try {
          const detail = await api.get(`/public-waitlists/offers/${encodeURIComponent(offerId)}`, {
            headers: { 'X-Skip-CSRF-Prefetch': 'true' },
          })
          if (!cancelled) setData(detail.data as OfferResponse)
        } catch {
          // ignore secondary failure
        }
        if (!cancelled) setError(getApiErrorMessage(err, copy.invalid))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [copy.invalid, offerId, requestedAction, location.key])

  const submitDecline = async (leaveWaitlist: boolean) => {
    if (!offerId || declineSubmitting) return
    setDeclineSubmitting(true)
    setError('')
    try {
      const action = leaveWaitlist ? 'decline-and-leave' : 'decline'
      const response = await api.post(`/public-waitlists/offers/${encodeURIComponent(offerId)}/${action}`, {}, {
        headers: { 'X-Skip-CSRF-Prefetch': 'true' },
      })
      setData(response.data as OfferResponse)
      setLeftWaitlist(leaveWaitlist)
      setDeclineChoiceCompleted(true)
    } catch (err) {
      setError(getApiErrorMessage(err, copy.invalid))
    } finally {
      setDeclineSubmitting(false)
    }
  }

  const isDeclineFlow = requestedAction === 'decline'
  const status = String(data?.offerStatus || '').toUpperCase()
  const tenantLogoUrl = data?.tenantLogoUrl?.trim() || ''
  const useTenantLogo = Boolean(tenantLogoUrl) && !tenantLogoFailed
  const otherSlotsUrl = data?.otherSlotsUrl || (data?.tenantCode ? `/widget/${data.tenantCode}` : '#')
  const showDeclineChoice = isDeclineFlow && status === 'PENDING' && !declineChoiceCompleted
  const showDeclinedUi = status === 'DECLINED' ? true : status === 'ACCEPTED' ? false : isDeclineFlow

  const statusInfo = useMemo(() => {
    if (status === 'EXPIRED' || status === 'REVOKED') return { kind: 'info' as const, text: copy.offerExpired }
    if (!isDeclineFlow && status === 'DECLINED') return { kind: 'info' as const, text: copy.offerDeclinedAlready }
    if (isDeclineFlow && status === 'ACCEPTED') return { kind: 'info' as const, text: copy.offerAcceptedElsewhere }
    return null
  }, [copy.offerAcceptedElsewhere, copy.offerDeclinedAlready, copy.offerExpired, isDeclineFlow, status])

  return (
    <div className="public-offer-page">
      <style>{pageStyles}</style>
      <main className="public-offer-shell">
        <StatusIllustration declined={showDeclinedUi} />
        <div className="public-offer-content">
          <div className="public-offer-brand">
            <img
              className={`public-offer-brand-image--${useTenantLogo ? 'tenant' : 'calendra'}`}
              src={useTenantLogo ? tenantLogoUrl : calendraLogo}
              alt={useTenantLogo ? (data?.tenantName || 'Company logo') : 'Calendra'}
              onError={() => setTenantLogoFailed(true)}
            />
          </div>

          <header className="public-offer-heading">
            <h1>{showDeclineChoice ? copy.declineChoiceTitle : showDeclinedUi ? copy.declinedTitle : copy.acceptedTitle}</h1>
            <p>{showDeclineChoice ? copy.declineChoiceSubtitle : showDeclinedUi ? (leftWaitlist ? copy.declinedLeaveSubtitle : copy.declinedSubtitle) : copy.acceptedSubtitle}</p>
          </header>

          {loading && <p className="public-offer-muted">{copy.loading}</p>}
          {!loading && error && !data && <div className="public-offer-alert public-offer-alert--error">{error}</div>}

          {!loading && data && (
            <>
              {error && <div className="public-offer-alert public-offer-alert--error">{error}</div>}
              {statusInfo && <div className={`public-offer-alert public-offer-alert--${statusInfo.kind}`}>{statusInfo.text}</div>}

              <section className="public-offer-summary">
                <div className="public-offer-summary-icon">
                  <CalendarIcon size={31} />
                </div>
                <div>
                  <h2>{showDeclinedUi ? copy.declinedLabel : copy.acceptedLabel}</h2>
                  <div className="public-offer-summary-grid">
                    <div><strong>{copy.service}:</strong> {data.serviceName || '—'}</div>
                    <div><strong>{copy.dateTime}:</strong> {formatDateTime(data.slotStart, locale)}</div>
                    {data.employeeName ? <div><strong>{copy.provider}:</strong> {data.employeeName}</div> : null}
                    {data.locationName ? <div><strong>{copy.location}:</strong> {data.locationName}</div> : null}
                  </div>
                </div>
              </section>

              {showDeclineChoice && (
                <div className="public-offer-decline-choices">
                  <button type="button" className="public-offer-choice" onClick={() => submitDecline(false)} disabled={declineSubmitting}>
                    <strong>{copy.declineRemain}</strong>
                    <span>{copy.declineRemainHelp}</span>
                  </button>
                  <button type="button" className="public-offer-choice public-offer-choice--danger" onClick={() => submitDecline(true)} disabled={declineSubmitting}>
                    <strong>{copy.declineLeave}</strong>
                    <span>{copy.declineLeaveHelp}</span>
                  </button>
                </div>
              )}

              <div className="public-offer-actions">
                {status === 'ACCEPTED' ? (
                  <div className="public-offer-menu" ref={menuRef}>
                    <button type="button" className="public-offer-menu-button" onClick={() => setCalendarMenuOpen(value => !value)}>
                      <CalendarIcon size={18} />
                      {copy.addToCalendar}
                      <ChevronDownIcon />
                    </button>
                    {calendarMenuOpen && (
                      <div className="public-offer-menu-panel">
                        <a href={googleCalendarUrl(data)} target="_blank" rel="noreferrer" onClick={() => setCalendarMenuOpen(false)}>{copy.googleCalendar}</a>
                        <a href={outlookCalendarUrl(data)} target="_blank" rel="noreferrer" onClick={() => setCalendarMenuOpen(false)}>{copy.outlookCalendar}</a>
                        <button type="button" onClick={() => { downloadIcs(data); setCalendarMenuOpen(false) }}>{copy.appleCalendar}</button>
                        <button type="button" onClick={() => { downloadIcs(data); setCalendarMenuOpen(false) }}>{copy.icsDownload}</button>
                      </div>
                    )}
                  </div>
                ) : status === 'DECLINED' ? (
                  <a href={otherSlotsUrl} className="public-offer-link-button">
                    <ListIcon />
                    {copy.otherSlots}
                  </a>
                ) : null}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
